use crate::helpers::*;
use crate::state::{calculate_risk_factor, Sundial, SundialCollateral, SundialProfile};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use sundial_derives::{validates, CheckSundialProfileStale};

use itertools::Itertools;
use paste::paste;
use std::cmp::{max, min};

use crate::helpers::create_transfer_cpi;
use anchor_spl::token::transfer;

use crate::error::SundialError;

use solana_maths::{Decimal, Rate, TryMul, TrySub, U192};

/// Percentage of a [Profile] that can be repaid during
/// each liquidation call due to price change
pub const LIQUIDATION_CLOSE_FACTOR: u8 = 50;

/// Liquidate an unhealthy [state::SundialProfile].
///
/// Repay loan (liquidity token), withdraw collateral (Port LP token).
/// Repay `K` liquidity tokens, get `K * liquidityTokenPrice * (100 + LiquidationPenalty) / 100 / collateralTokenPrice` collateral tokens.
///
/// You can only repay half of the total loan value, except for repaying overtime loan, you can repay all of the loan.
/// It would try to repay as much token as possible.
/// If there exists an overtime loan, you must liquidate the overtime loan first.
#[validates(check_sundial_profile_stale)]
#[derive(Accounts, Clone, CheckSundialProfileStale)]
#[instruction()]
pub struct LiquidateSundialProfile<'info> {
    #[account(mut)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,

    #[account(mut)]
    pub user_repay_liquidity_wallet: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_withdraw_collateral_wallet: Account<'info, TokenAccount>,

    #[account(
        has_one = token_program @ SundialError::InvalidTokenProgram
    )]
    pub sundial: Box<Account<'info, Sundial>>,

    #[account(
        mut,
        seeds = [
            sundial.key().as_ref(),
            b"liquidity"
        ],
        bump = sundial.bumps.port_liquidity_bump
    )]
    pub sundial_liquidity_wallet: Account<'info, TokenAccount>,

    #[account(
        has_one = token_program @ SundialError::InvalidTokenProgram
    )]
    pub sundial_collateral: Box<Account<'info, SundialCollateral>>,

    #[account(
        seeds = [
            sundial_collateral.key().as_ref(),
            b"authority"
        ],
        bump = sundial_collateral.bumps.authority_bump
    )]
    /// CHECK: Authority of the [SundialCollateral].
    pub sundial_collateral_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            sundial_collateral.key().as_ref(),
            b"lp"
        ],
        bump = sundial_collateral.bumps.port_lp_bump
    )]
    pub sundial_collateral_wallet: Box<Account<'info, TokenAccount>>,

    pub transfer_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn process_liquidate_sundial_profile(ctx: Context<LiquidateSundialProfile>) -> ProgramResult {
    let user_wallet = &ctx.accounts.user_repay_liquidity_wallet;
    let sundial_profile = &mut ctx.accounts.sundial_profile;
    let current_ts = ctx.accounts.clock.unix_timestamp;
    let no_overtime_loans = !sundial_profile
        .loans
        .iter()
        .any(|l| l.is_overtime(current_ts));

    let max_repay_amount = if user_wallet
        .delegate
        .map_or(false, |d| d == ctx.accounts.transfer_authority.key())
    {
        user_wallet.delegated_amount
    } else {
        user_wallet.amount
    };

    let sundial_key = ctx.accounts.sundial.key();
    let is_unhealthy = log_then_prop_err!(sundial_profile.check_if_unhealthy());
    let before_risk_factor = log_then_prop_err!(sundial_profile.risk_factor());

    let allowed_repay_value_when_no_overtime = log_then_prop_err!(sundial_profile
        .get_borrowed_value()
        .and_then(|d| d.try_mul(Rate::from_percent(LIQUIDATION_CLOSE_FACTOR))));

    let before_liquidation_margin = log_then_prop_err!(sundial_profile.get_liquidation_margin());
    let before_borrowed_value = log_then_prop_err!(sundial_profile.get_borrowed_value());
    let (collaterals, loans) = sundial_profile.get_mut_collaterals_and_loans();
    let (loan_pos, loan_to_repay) = vipers::unwrap_opt!(
        loans.iter_mut().find_position(|l| l.sundial == sundial_key),
        "This profile doesn't have this loan asset"
    );
    let is_loan_overtime = loan_to_repay.is_overtime(current_ts);

    let allowed_repay_value = if is_loan_overtime {
        max(
            Decimal(U192(loan_to_repay.asset.total_value)),
            allowed_repay_value_when_no_overtime,
        )
    } else {
        allowed_repay_value_when_no_overtime
    };

    let sundial_collateral_key = ctx.accounts.sundial_collateral.key();
    let (collateral_pos, collateral_to_withdraw) = vipers::unwrap_opt!(
        collaterals
            .iter_mut()
            .find_position(|c| c.sundial_collateral == sundial_collateral_key),
        "Withdraw collateral doesn't exist"
    );

    vipers::invariant!(
        no_overtime_loans || is_loan_overtime,
        SundialError::InvalidLiquidation,
        "Should liquidate overtime loans first"
    );

    vipers::invariant!(
        is_loan_overtime || is_unhealthy,
        SundialError::InvalidLiquidation,
        "Only overtime or unhealthy profile can be liquidated"
    );

    let available_withdraw_value = Decimal(U192(collateral_to_withdraw.asset.total_value));
    let available_repay_value = log_then_prop_err!(collateral_to_withdraw
        .config
        .liquidation_config
        .get_repay_value(available_withdraw_value));

    let possible_repay_amount = min(
        max(
            1,
            log_then_prop_err!(loan_to_repay
                .asset
                .get_amount(min(allowed_repay_value, available_repay_value))
                .and_then(|d| d.try_floor_u64())),
        ),
        loan_to_repay.asset.amount,
    );

    let user_repay_amount = min(max_repay_amount, possible_repay_amount);

    let user_withdraw_value = log_then_prop_err!(collateral_to_withdraw
        .config
        .liquidation_config
        .get_liquidation_value(loan_to_repay.asset.get_value(user_repay_amount)?));
    let user_withdraw_amount = log_then_prop_err!(collateral_to_withdraw
        .asset
        .get_amount(user_withdraw_value)
        .and_then(|d| d.try_ceil_u64()));

    let possible_repay_value = loan_to_repay.asset.get_value(possible_repay_amount)?;
    let possible_withdraw_value = log_then_prop_err!(collateral_to_withdraw
        .config
        .liquidation_config
        .get_liquidation_value(possible_repay_value));

    let possible_borrowed_value = before_borrowed_value.try_sub(possible_repay_value)?;
    let possible_liquidation_margin = before_liquidation_margin.try_sub(possible_withdraw_value)?;

    // In case: `loan_value * (1 + liquidation_bonus / 100) > collateral_value`, it will not be possible
    // to enfore that risk factor will decrease, i.e. [Profile] becomes healthier.
    let is_possible_to_reduce_risk_factor =
        calculate_risk_factor(possible_borrowed_value, possible_liquidation_margin)?
            <= before_risk_factor;

    if log_then_prop_err!(loan_to_repay.asset.reduce_amount(user_repay_amount)) == 0 {
        loans.remove(loan_pos);
    };
    if log_then_prop_err!(collateral_to_withdraw
        .asset
        .reduce_amount(user_withdraw_amount))
        == 0
    {
        collaterals.remove(collateral_pos);
    };

    let after_risk_factor = log_then_prop_err!(sundial_profile.risk_factor());
    vipers::invariant!(
        is_loan_overtime || after_risk_factor <= before_risk_factor || !is_possible_to_reduce_risk_factor,
        SundialError::InvalidLiquidation,
        "The risk factor after liquidation is even greater than before, maybe try to liquidate more"
    );

    log_then_prop_err!(transfer(
        create_transfer_cpi(
            ctx.accounts.user_repay_liquidity_wallet.to_account_info(),
            ctx.accounts.sundial_liquidity_wallet.to_account_info(),
            ctx.accounts.transfer_authority.to_account_info(),
            &[],
            ctx.accounts.token_program.to_account_info(),
        ),
        user_repay_amount
    ));

    log_then_prop_err!(transfer(
        create_transfer_cpi(
            ctx.accounts.sundial_collateral_wallet.to_account_info(),
            ctx.accounts
                .user_withdraw_collateral_wallet
                .to_account_info(),
            ctx.accounts.sundial_collateral_authority.to_account_info(),
            seeds!(ctx, sundial_collateral, authority),
            ctx.accounts.token_program.to_account_info(),
        ),
        user_withdraw_amount
    ));

    emit!(LiquidateSundialProfileEvent {
        profile: ctx.accounts.sundial_profile.key(),
        sundial_collateral: ctx.accounts.sundial_collateral.key(),
        sundial: ctx.accounts.sundial.key(),
        repay_amount: user_repay_amount,
        withdraw_amount: user_withdraw_amount,
        repay_mint: ctx.accounts.sundial_liquidity_wallet.mint,
        withdraw_mint: ctx.accounts.sundial_collateral.collateral_mint,
        user_wallet: ctx.accounts.user_repay_liquidity_wallet.owner
    });

    Ok(())
}

#[event]
pub struct LiquidateSundialProfileEvent {
    #[index]
    pub profile: Pubkey,
    pub sundial_collateral: Pubkey,
    pub sundial: Pubkey,
    pub repay_amount: u64,
    pub repay_mint: Pubkey,
    pub withdraw_amount: u64,
    pub withdraw_mint: Pubkey,
    pub user_wallet: Pubkey,
}
