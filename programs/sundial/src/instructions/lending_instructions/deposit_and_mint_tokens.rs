use crate::helpers::*;
use crate::instructions::*;

use crate::event::*;
use crate::helpers::create_mint_to_cpi;
use crate::state::Sundial;
use anchor_lang::prelude::*;
use anchor_spl::token::mint_to;
use anchor_spl::token::{Mint, Token, TokenAccount};
use paste::paste;

use port_anchor_adaptor::deposit_reserve;

use crate::error::SundialError;

use port_variable_rate_lending_instructions::state::CollateralExchangeRate;
use solana_maths::{Rate, U128};

use vipers::unwrap_int;

use sundial_derives::{validates, CheckSundialNotEnd};

#[validates(check_sundial_not_end)]
#[derive(Accounts, CheckSundialNotEnd)]
#[instruction(amount: u64)]
pub struct DepositAndMintTokens<'info> {
    #[account(
    constraint = sundial.reserve == port_accounts.reserve.key() @ SundialError::InvalidPortReserve,
    constraint = sundial.token_program == token_program.key() @ SundialError::InvalidTokenProgram,
    constraint = sundial.port_lending_program == port_accounts.port_lending_program.key() @ SundialError::InvalidPortLendingProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"lp"], bump = sundial.bumps.port_lp_bump)]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"fee_receiver"], bump = sundial.bumps.fee_receiver_bump)]
    pub sundial_fee_receiver_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub principle_token_mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"yield_mint"], bump = sundial.bumps.yield_mint_bump)]
    pub yield_token_mint: Box<Account<'info, Mint>>,
    pub port_accounts: PortAccounts<'info>,
    #[account(mut)]
    pub user_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_principle_token_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_yield_token_wallet: Box<Account<'info, TokenAccount>>,
    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn process_mint_principle_tokens_and_yield_tokens(
    ctx: Context<DepositAndMintTokens>,
    amount: u64,
) -> ProgramResult {
    let sundial = &ctx.accounts.sundial;
    let existed_lp_amount = ctx.accounts.sundial_port_lp_wallet.amount;
    let start_exchange_rate = CollateralExchangeRate(Rate(U128(sundial.start_exchange_rate)));

    log_then_prop_err!(deposit_reserve(
        ctx.accounts.port_accounts.create_deposit_reserve_context(
            ctx.accounts.user_liquidity_wallet.to_account_info(),
            ctx.accounts.sundial_port_lp_wallet.to_account_info(),
            ctx.accounts.user_authority.to_account_info(),
            ctx.accounts.clock.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            &[&[&[]]],
        ),
        amount,
    ));

    log_then_prop_err!(ctx.accounts.sundial_port_lp_wallet.reload());
    let principle_mint_amount = start_exchange_rate.collateral_to_liquidity(unwrap_int!(ctx
        .accounts
        .sundial_port_lp_wallet
        .amount
        .checked_sub(existed_lp_amount)))?;

    let fee = &sundial.config.lending_fee;
    let fee_amount = log_then_prop_err!(fee.mint_fee(
        amount,
        create_mint_to_cpi(
            ctx.accounts.principle_token_mint.to_account_info(),
            ctx.accounts.sundial_fee_receiver_wallet.to_account_info(),
            ctx.accounts.sundial_authority.to_account_info(),
            seeds!(ctx, sundial, authority),
            ctx.accounts.token_program.to_account_info(),
        ),
    ));

    log_then_prop_err!(mint_to(
        create_mint_to_cpi(
            ctx.accounts.principle_token_mint.to_account_info(),
            ctx.accounts.user_principle_token_wallet.to_account_info(),
            ctx.accounts.sundial_authority.to_account_info(),
            seeds!(ctx, sundial, authority),
            ctx.accounts.token_program.to_account_info(),
        ),
        unwrap_int!(principle_mint_amount.checked_sub(fee_amount)),
    ));

    log_then_prop_err!(mint_to(
        create_mint_to_cpi(
            ctx.accounts.yield_token_mint.to_account_info(),
            ctx.accounts.user_yield_token_wallet.to_account_info(),
            ctx.accounts.sundial_authority.to_account_info(),
            seeds!(ctx, sundial, authority),
            ctx.accounts.token_program.to_account_info(),
        ),
        amount,
    ));

    let liquidity_cap = &sundial.config.liquidity_cap;

    log_then_prop_err!(liquidity_cap.check_mint(&mut ctx.accounts.principle_token_mint));
    emit!(DidDeposit {
        liquidity_spent: amount,
        principle_token_minted: principle_mint_amount,
        yield_token_minted: amount
    });
    Ok(())
}
