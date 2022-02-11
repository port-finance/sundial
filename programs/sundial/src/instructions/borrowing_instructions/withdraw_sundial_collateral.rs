use crate::error::SundialError;
use crate::helpers::*;
use crate::state::{SundialCollateral, SundialProfile};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use sundial_derives::{validates, CheckSundialProfileMarket, CheckSundialProfileStale};

use itertools::Itertools;
use paste::paste;
use std::cmp::min;

use crate::event::*;
use crate::helpers::create_transfer_cpi;
use anchor_spl::token::transfer;

#[validates(check_sundial_profile_stale, check_sundial_profile_market)]
#[derive(Accounts, Clone, CheckSundialProfileStale, CheckSundialProfileMarket)]
#[instruction(amount: u64)]
//Withdraw sundial collateral (port lp) token that you deposited before.
pub struct WithdrawSundialCollateral<'info> {
    #[account(mut, has_one=user @ SundialError::InvalidProfileUser)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>, //refreshed
    #[account(has_one=token_program @ SundialError::InvalidTokenProgram)]
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(seeds=[sundial_collateral.key().as_ref(), b"authority"], bump=sundial_collateral.bumps.authority_bump)]
    pub sundial_collateral_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial_collateral.key().as_ref(), b"lp"], bump = sundial_collateral.bumps.port_lp_bump)]
    pub sundial_collateral_port_lp_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_port_lp_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub user: Signer<'info>,
}

pub fn process_withdraw_sundial_collateral(
    ctx: Context<WithdrawSundialCollateral>,
    max_withdraw_amount: u64,
) -> ProgramResult {
    let sundial_profile = &mut ctx.accounts.sundial_profile;
    let sundial_collateral = ctx.accounts.sundial_collateral.key();

    let (pos, collateral) = vipers::unwrap_opt!(
        sundial_profile
            .collaterals
            .iter_mut()
            .find_position(|c| c.sundial_collateral == sundial_collateral),
        "You don't have that asset as collateral"
    );

    let withdraw_amount = min(collateral.asset.amount, max_withdraw_amount);
    if 0 == log_then_prop_err!(
        collateral.asset.reduce_amount(withdraw_amount),
        SundialError::WithdrawTooMuchCollateral,
        "You are trying to withdraw more than you have"
    ) {
        sundial_profile.collaterals.remove(pos);
    }

    sundial_profile.check_enough_borrowing_power(
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
        withdraw_amount
    ));

    emit!(DidWithdrawCollateral {
        withdraw_amount,
        asset_mint: ctx.accounts.sundial_collateral.collateral_mint,
        user_wallet: ctx.accounts.user.key()
    });
    Ok(())
}
