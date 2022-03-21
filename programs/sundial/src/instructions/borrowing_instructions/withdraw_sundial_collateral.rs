use crate::error::SundialError;
use crate::helpers::*;
use crate::state::{SundialCollateral, SundialProfile};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use sundial_derives::{validates, CheckSundialProfileMarket, CheckSundialProfileStale};

use itertools::Itertools;
use paste::paste;
use std::cmp::min;

use crate::helpers::create_transfer_cpi;
use anchor_spl::token::transfer;

/// Withdraw sundial collateral (Port LP) tokens that users have deposited.
#[validates(check_sundial_profile_stale, check_sundial_profile_market)]
#[derive(Accounts, Clone, CheckSundialProfileStale, CheckSundialProfileMarket)]
#[instruction(amount: u64)]
pub struct WithdrawSundialCollateral<'info> {
    /// Refreshed [state::SundialProfile] containing the user's loans and collaterals
    #[account(
        mut,
        has_one=user @ SundialError::InvalidProfileUser
    )]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,

    #[account(
        has_one=token_program @ SundialError::InvalidTokenProgram
    )]
    pub sundial_collateral: Account<'info, SundialCollateral>,

    #[account(
        seeds=[
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
    pub sundial_collateral_port_lp_wallet: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_port_lp_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub user: Signer<'info>,
}

pub fn process_withdraw_sundial_collateral(
    ctx: Context<WithdrawSundialCollateral>,
    withdraw_amount: u64,
) -> ProgramResult {
    let profile = &mut ctx.accounts.sundial_profile;
    let collateral_key = ctx.accounts.sundial_collateral.key();

    let (pos, collateral) = vipers::unwrap_opt!(
        profile
            .collaterals
            .iter_mut()
            .find_position(|c| c.sundial_collateral == collateral_key),
        "You don't have that asset as collateral"
    );

    let actual_withdraw_amount = min(collateral.asset.amount, withdraw_amount);
    if 0 == log_then_prop_err!(
        collateral.asset.reduce_amount(actual_withdraw_amount),
        SundialError::WithdrawTooMuchCollateral,
        "You are trying to withdraw more than you have"
    ) {
        profile.collaterals.remove(pos);
    }

    profile.check_enough_borrowing_power(
        SundialError::WithdrawTooMuchCollateral,
        "Withdraw too much, you don't have enough borrowing power",
    )?;

    log_then_prop_err!(transfer(
        create_transfer_cpi(
            ctx.accounts
                .sundial_collateral_port_lp_wallet
                .to_account_info(),
            ctx.accounts.user_port_lp_wallet.to_account_info(),
            ctx.accounts.sundial_collateral_authority.to_account_info(),
            seeds!(ctx, sundial_collateral, authority),
            ctx.accounts.token_program.to_account_info(),
        ),
        actual_withdraw_amount
    ));

    emit!(WithdrawSundialCollateralEvent {
        sundial_collateral: ctx.accounts.sundial_collateral.key(),
        asset_mint: ctx.accounts.sundial_collateral.collateral_mint,
        user_wallet: ctx.accounts.user.key(),
        withdraw_amount: actual_withdraw_amount,
    });

    Ok(())
}

#[event]
pub struct WithdrawSundialCollateralEvent {
    #[index]
    pub sundial_collateral: Pubkey,
    pub asset_mint: Pubkey,
    pub user_wallet: Pubkey,
    pub withdraw_amount: u64,
}
