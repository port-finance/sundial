use crate::helpers::*;
use crate::instructions::*;

use crate::state::Sundial;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use sundial_derives::{validates, CheckSundialAlreadyEnd};

use paste::paste;

use port_anchor_adaptor::redeem;

use crate::error::SundialError;

#[validates(check_sundial_already_end)]
#[derive(Accounts, CheckSundialAlreadyEnd)]
#[instruction()]
pub struct RedeemLp<'info> {
    #[account(
        constraint = sundial.reserve == port_accounts.reserve.key() @ SundialError::InvalidPortReserve,
        constraint = sundial.token_program == token_program.key() @ SundialError::InvalidTokenProgram,
        constraint = sundial.port_lending_program == port_accounts.port_lending_program.key() @ SundialError::InvalidPortLendingProgram
    )]
    pub sundial: Account<'info, Sundial>,

    #[account(
        seeds=[
            sundial.key().as_ref(),
            b"authority"
        ],
        bump = sundial.bumps.authority_bump
    )]
    pub sundial_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            sundial.key().as_ref(),
            b"lp"
        ],
        bump = sundial.bumps.port_lp_bump
    )]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [
            sundial.key().as_ref(),
            b"liquidity"
        ],
        bump = sundial.bumps.port_liquidity_bump
    )]
    pub sundial_port_liquidity_wallet: Box<Account<'info, TokenAccount>>,

    pub port_accounts: PortAccounts<'info>,

    #[account(executable)]
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn process_redeem_lp(ctx: Context<RedeemLp>) -> ProgramResult {
    log_then_prop_err!(redeem(
        ctx.accounts.port_accounts.create_redeem_context(
            ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
            ctx.accounts.sundial_port_lp_wallet.to_account_info(),
            ctx.accounts.sundial_authority.to_account_info(),
            ctx.accounts.clock.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            seeds!(ctx, sundial, authority),
        ),
        ctx.accounts.sundial_port_lp_wallet.amount,
    ));
    Ok(())
}
// TODO: add event.
