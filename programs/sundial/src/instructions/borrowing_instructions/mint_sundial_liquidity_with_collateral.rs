use crate::helpers::*;

use crate::state::{Sundial, SundialProfile};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use paste::paste;

use crate::event::*;
use crate::helpers::{create_mint_to_cpi, update_or_insert};
use anchor_spl::token::mint_to;

use crate::error::SundialError;
use crate::state::SundialProfileLoan;

use sundial_derives::{
    validates, CheckSundialNotEnd, CheckSundialProfileMarket, CheckSundialProfileStale,
};

use vipers::{unwrap_int, unwrap_opt};

#[validates(
    check_sundial_profile_stale,
    check_sundial_profile_market,
    check_sundial_not_end
)]
#[derive(
    Accounts, Clone, CheckSundialProfileStale, CheckSundialProfileMarket, CheckSundialNotEnd,
)]
#[instruction(amount:u64)]
pub struct MintSundialLiquidityWithCollateral<'info> {
    #[account(mut, has_one=user @ SundialError::InvalidProfileUser)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>, //refreshed
    #[account(has_one=token_program @ SundialError::InvalidTokenProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub sundial_principle_mint: Account<'info, Mint>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"fee_receiver"], bump = sundial.bumps.fee_receiver_bump)]
    pub fee_receiver_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_principle_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub user: Signer<'info>,
}

pub fn process_mint_sundial_liquidity_with_collateral<'info>(
    ctx: Context<'_, '_, '_, 'info, MintSundialLiquidityWithCollateral<'info>>,
    amount: u64,
) -> ProgramResult {
    let fee_rate = ctx.accounts.sundial.config.borrow_fee;
    let fee_amount = log_then_prop_err!(fee_rate.mint_fee(
        amount,
        create_mint_to_cpi(
            ctx.accounts.sundial_principle_mint.to_account_info(),
            ctx.accounts.fee_receiver_wallet.to_account_info(),
            ctx.accounts.sundial_authority.to_account_info(),
            seeds!(ctx, sundial, authority),
            ctx.accounts.token_program.to_account_info()
        )
    ));

    log_then_prop_err!(mint_to(
        create_mint_to_cpi(
            ctx.accounts.sundial_principle_mint.to_account_info(),
            ctx.accounts.user_principle_wallet.to_account_info(),
            ctx.accounts.sundial_authority.to_account_info(),
            seeds!(ctx, sundial, authority),
            ctx.accounts.token_program.to_account_info()
        ),
        unwrap_int!(amount.checked_sub(fee_amount))
    ));

    let profile = &mut ctx.accounts.sundial_profile;
    let loan_sundial = ctx.accounts.sundial.key();
    log_then_prop_err!(update_or_insert(
        &mut profile.loans,
        |l| l.sundial == loan_sundial,
        |l| {
            l.asset.add_amount(amount)?;
            l.update_config(&ctx.accounts.sundial)?;
            Ok(())
        },
        || {
            let oracle_info = unwrap_opt!(
                ctx.remaining_accounts.get(0),
                "Oracle should be passed in when you first mint this asset"
            );

            vipers::assert_keys_eq!(
                oracle_info.key,
                ctx.accounts.sundial.oracle,
                "Invalid Oracle"
            );

            SundialProfileLoan::init_loan(
                amount,
                oracle_info,
                ctx.accounts.sundial.key(),
                &ctx.accounts.clock,
                ctx.accounts.sundial.end_unix_time_stamp,
                ctx.accounts.sundial.config.liquidity_decimals,
            )
        }
    ));

    profile.check_enough_borrowing_power(
        SundialError::InvalidMintAmount,
        "Mint too much, you don't have enough borrowing power",
    )?;
    emit!(DidMintLoan {
        amount_mint: amount,
        user_wallet: ctx.accounts.user.key(),
        asset_mint: ctx.accounts.sundial_principle_mint.key()
    });
    Ok(())
}
