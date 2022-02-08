use crate::helpers::*;

use crate::state::Sundial;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use sundial_derives::{validates, CheckSundialAlreadyEnd};

use paste::paste;

use crate::event::*;
use crate::helpers::create_transfer_cpi;
use anchor_spl::token::{burn, transfer, Burn};

use crate::error::SundialError;

use solana_maths::{Decimal, TryDiv, TryMul};

use vipers::unwrap_int;
#[validates(check_sundial_already_end)]
#[derive(Accounts, CheckSundialAlreadyEnd)]
#[instruction(amount: u64)]
pub struct RedeemYieldToken<'info> {
    #[account(
    constraint = sundial.token_program == token_program.key() @ SundialError::InvalidTokenProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump, constraint = sundial_port_liquidity_wallet.amount != 0 @ SundialError::NotRedeemLpYet)]
    pub sundial_port_liquidity_wallet: Account<'info, TokenAccount>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"lp"], bump = sundial.bumps.port_lp_bump, constraint = sundial_port_lp_wallet.amount == 0 @ SundialError::NotRedeemLpYet)]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"yield_mint"], bump = sundial.bumps.yield_mint_bump)]
    pub yield_token_mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub principle_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub user_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_yield_token_wallet: Box<Account<'info, TokenAccount>>,
    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn process_redeem_yield_tokens(ctx: Context<RedeemYieldToken>, amount: u64) -> ProgramResult {
    let principle_supply_amount = ctx.accounts.principle_token_mint.supply;
    let liquidity_of_yield = unwrap_int!(ctx
        .accounts
        .sundial_port_liquidity_wallet
        .amount
        .checked_sub(principle_supply_amount));
    let yield_supply_amount = ctx.accounts.yield_token_mint.supply;
    let amount_to_redeem = log_then_prop_err!(log_then_prop_err!(log_then_prop_err!(
        Decimal::from(liquidity_of_yield).try_div(yield_supply_amount)
    )
    .try_mul(amount))
    .try_floor_u64());

    log_then_prop_err!(burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.yield_token_mint.to_account_info(),
                to: ctx.accounts.user_yield_token_wallet.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
            },
        ),
        amount,
    ));

    if amount_to_redeem != 0 {
        log_then_prop_err!(transfer(
            create_transfer_cpi(
                ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
                ctx.accounts.user_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, sundial, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            amount_to_redeem,
        ));
    }
    emit!(DidRedeemYield {
        yield_burned: amount,
        liquidity_redeemed: amount_to_redeem
    });
    Ok(())
}
