use crate::helpers::*;
use crate::state::{SundialCollateral, SundialProfile};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use sundial_derives::{validates, CheckSundialProfileMarket};

use crate::event::*;
use crate::helpers::{create_transfer_cpi, update_or_insert};
use anchor_spl::token::transfer;

use crate::error::SundialError;
use crate::state::SundialProfileCollateral;

/// Deposit port lp tokens as collateral into sundial profile to gain borrowing power.
/// [SundialProfile] should be created and initialized.
#[validates(check_sundial_profile_market)]
#[derive(Accounts, Clone, CheckSundialProfileMarket)]
#[instruction(amount:u64)]
pub struct DepositSundialCollateral<'info> {
    #[account(
        mut,
        has_one = user @ SundialError::InvalidProfileUser
    )]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,

    #[account(
        has_one=token_program @ SundialError::InvalidTokenProgram
    )]
    pub sundial_collateral: Account<'info, SundialCollateral>,

    #[account(
        mut,
        seeds = [sundial_collateral.key().as_ref(), b"lp"],
        bump = sundial_collateral.bumps.port_lp_bump
    )]
    pub sundial_collateral_port_lp_wallet: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_port_lp_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub user: Signer<'info>,
    pub transfer_authority: Signer<'info>,
}

pub fn process_deposit_sundial_collateral<'info>(
    ctx: Context<'_, '_, '_, 'info, DepositSundialCollateral<'info>>,
    amount: u64,
) -> ProgramResult {
    log_then_prop_err!(transfer(
        create_transfer_cpi(
            ctx.accounts.user_port_lp_wallet.to_account_info(),
            ctx.accounts
                .sundial_collateral_port_lp_wallet
                .to_account_info(),
            ctx.accounts.transfer_authority.to_account_info(),
            &[],
            ctx.accounts.token_program.to_account_info(),
        ),
        amount
    ));

    let sundial_profile = &mut ctx.accounts.sundial_profile;

    let liquidity_cap = ctx
        .accounts
        .sundial_collateral
        .sundial_collateral_config
        .liquidity_cap;
    log_then_prop_err!(
        liquidity_cap.check_balance(&mut ctx.accounts.sundial_collateral_port_lp_wallet)
    );
    log_then_prop_err!(update_or_insert(
        &mut sundial_profile.collaterals,
        |c| c.sundial_collateral == ctx.accounts.sundial_collateral.key(),
        |c| c.asset.add_amount(amount),
        || SundialProfileCollateral::init_collateral(amount, &ctx.accounts.sundial_collateral,)
    ));

    emit!(DidDepositCollateral {
        amount_deposit: amount,
        asset_mint: ctx.accounts.sundial_collateral.collateral_mint,
        user_wallet: ctx.accounts.user.key()
    });
    Ok(())
}
