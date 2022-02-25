use crate::helpers::*;

use crate::state::Sundial;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use sundial_derives::{validates, CheckSundialAlreadyEnd};

use paste::paste;

use crate::helpers::create_transfer_cpi;
use anchor_spl::token::{burn, transfer, Burn};

use crate::error::SundialError;

#[validates(check_sundial_already_end)]
#[derive(Accounts, CheckSundialAlreadyEnd)]
#[instruction(amount: u64)]
pub struct RedeemPrincipleToken<'info> {
    #[account(
        mut,
        constraint = sundial.token_program == token_program.key() @ SundialError::InvalidTokenProgram
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
            b"liquidity"
        ],
        bump = sundial.bumps.port_liquidity_bump,
        constraint = sundial_port_liquidity_wallet.amount != 0 @ SundialError::NotRedeemLpYet
    )]
    pub sundial_port_liquidity_wallet: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [
            sundial.key().as_ref(),
            b"lp"
        ],
        bump = sundial.bumps.port_lp_bump,
        constraint = sundial_port_lp_wallet.amount == 0 @ SundialError::NotRedeemLpYet
    )]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [
            sundial.key().as_ref(),
            b"principle_mint"
        ],
        bump = sundial.bumps.principle_mint_bump
    )]
    pub principle_token_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub user_liquidity_wallet: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub user_principle_token_wallet: Box<Account<'info, TokenAccount>>,

    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn process_redeem_principle_tokens(
    ctx: Context<RedeemPrincipleToken>,
    amount: u64,
) -> ProgramResult {
    log_then_prop_err!(burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.principle_token_mint.to_account_info(),
                to: ctx.accounts.user_principle_token_wallet.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
            },
        ),
        amount,
    ));

    log_then_prop_err!(transfer(
        create_transfer_cpi(
            ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
            ctx.accounts.user_liquidity_wallet.to_account_info(),
            ctx.accounts.sundial_authority.to_account_info(),
            seeds!(ctx, sundial, authority),
            ctx.accounts.token_program.to_account_info(),
        ),
        amount,
    ));

    emit!(RedeemPrincipalTokenEvent {
        sundial: ctx.accounts.sundial.key(),
        principle_burned: amount,
        liquidity_redeemed: amount
    });
    Ok(())
}

#[event]
pub struct RedeemPrincipalTokenEvent {
    #[index]
    pub sundial: Pubkey,
    pub principle_burned: u64,
    pub liquidity_redeemed: u64,
}
