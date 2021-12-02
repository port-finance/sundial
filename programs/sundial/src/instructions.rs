use anchor_lang::prelude::*;

use crate::error::*;
use crate::state::{Sundial, SundialBumps, DISCRIMINATOR_SIZE};
use anchor_spl::token::{accessor::amount as token_amount, Mint, TokenAccount};
use port_anchor_adaptor::{
    port_accessor::{is_reserve_stale, reserve_liquidity_mint_pubkey, reserve_lp_mint_pubkey},
    Deposit as PortDeposit, Redeem,
};
use std::mem::size_of;

#[derive(Accounts, Clone)]
#[instruction(bumps: SundialBumps, name: String, end_unix_time_stamp: u64, port_lending_program: Pubkey)]
pub struct InitializeSundial<'info> {
    #[account(init, seeds=[name.as_ref()], bump=bumps.sundial_bump, payer=user, space=size_of::<Sundial> () + DISCRIMINATOR_SIZE)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[], bump=bumps.authority_bump)]
    pub sundial_authority: AccountInfo<'info>,
    #[account(init, payer=user, seeds = [sundial.key().as_ref(), b"liquidity"], bump = bumps.port_liquidity_bump, token::authority=sundial_authority, token::mint=port_liquidity_mint)]
    pub sundial_port_liquidity_wallet: AccountInfo<'info>,
    #[account(init, payer=user, seeds = [sundial.key().as_ref(), b"lp"], bump = bumps.port_lp_bump, token::authority=sundial_authority, token::mint=port_lp_mint)]
    pub sundial_port_lp_wallet: AccountInfo<'info>,
    #[account(init, payer=user, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = bumps.principle_mint_bump, mint::authority=sundial_authority, mint::decimals=6)]
    pub principle_token_mint: AccountInfo<'info>,
    #[account(init, payer=user, seeds = [sundial.key().as_ref(), b"yield_mint"], bump = bumps.yield_mint_bump, mint::authority=sundial_authority, mint::decimals=6)]
    pub yield_token_mint: AccountInfo<'info>,
    #[account(init, payer=user, seeds = [sundial.key().as_ref(), b"fee_receiver"], bump = bumps.fee_receiver_bump, token::authority=sundial_authority, token::mint=port_liquidity_mint)]
    pub fee_receiver_wallet: AccountInfo<'info>,

    #[account(owner = port_lending_program)]
    pub reserve: AccountInfo<'info>,
    #[account(address = reserve_liquidity_mint_pubkey(&reserve)? @ SundialError::InvalidPortLiquidityMint)]
    pub port_liquidity_mint: AccountInfo<'info>,
    #[account(address = reserve_lp_mint_pubkey(&reserve)? @ SundialError::InvalidPortLpMint)]
    pub port_lp_mint: AccountInfo<'info>,

    #[account(executable)]
    pub token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    #[account(constraint = end_unix_time_stamp > (clock.unix_timestamp as u64) @ SundialError::EndTimeTooEarly)]
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct PortAccounts<'info> {
    #[account(owner = port_lending_program.key())]
    pub lending_market: AccountInfo<'info>,
    pub lending_market_authority: AccountInfo<'info>,
    #[account(mut, owner = port_lending_program.key(), constraint = !is_reserve_stale(&reserve)? @ SundialError::ReserveIsNotRefreshed)]
    pub reserve: AccountInfo<'info>,
    #[account(mut)]
    pub reserve_liquidity_wallet: AccountInfo<'info>,
    #[account(mut)]
    pub reserve_collateral_mint: AccountInfo<'info>,
    #[account(executable)]
    pub port_lending_program: AccountInfo<'info>,
}

#[allow(clippy::too_many_arguments)]
impl<'info> PortAccounts<'info> {
    #[inline(always)]
    pub fn create_deposit_reserve_context<'a, 'b, 'c>(
        &self,
        user_liquidity: AccountInfo<'info>,
        user_lp: AccountInfo<'info>,
        user_authority: AccountInfo<'info>,
        clock: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        seeds: &'a [&'b [&'c [u8]]],
    ) -> CpiContext<'a, 'b, 'c, 'info, PortDeposit<'info>> {
        let cpi_accounts = PortDeposit {
            source_liquidity: user_liquidity,
            destination_collateral: user_lp,
            reserve: self.reserve.to_account_info(),
            reserve_liquidity_supply: self.reserve_liquidity_wallet.clone(),
            reserve_collateral_mint: self.reserve_collateral_mint.clone(),
            lending_market: self.lending_market.clone(),
            lending_market_authority: self.lending_market_authority.clone(),
            transfer_authority: user_authority,
            clock,
            token_program,
        };

        CpiContext::new_with_signer(self.port_lending_program.clone(), cpi_accounts, seeds)
    }
    #[inline(always)]
    pub fn create_redeem_context<'a, 'b, 'c>(
        &self,
        user_liquidity: AccountInfo<'info>,
        user_lp: AccountInfo<'info>,
        user_authority: AccountInfo<'info>,
        clock: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        seeds: &'a [&'b [&'c [u8]]],
    ) -> CpiContext<'a, 'b, 'c, 'info, Redeem<'info>> {
        let cpi_accounts = Redeem {
            source_collateral: user_lp,
            destination_liquidity: user_liquidity,
            reserve: self.reserve.to_account_info(),
            reserve_collateral_mint: self.reserve_collateral_mint.clone(),
            reserve_liquidity_supply: self.reserve_liquidity_wallet.clone(),
            lending_market: self.lending_market.clone(),
            lending_market_authority: self.lending_market_authority.clone(),
            transfer_authority: user_authority,
            token_program,
            clock,
        };
        CpiContext::new_with_signer(self.port_lending_program.clone(), cpi_accounts, seeds)
    }
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct DepositAndMintTokens<'info> {
    #[account(mut,
        constraint = sundial.end_unix_time_stamp > (clock.unix_timestamp as u64),
        constraint = sundial.reserve == port_accounts.reserve.key(),
        constraint = sundial.token_program == token_program.key(),
        constraint = sundial.port_lending_program == port_accounts.port_lending_program.key())]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: AccountInfo<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"lp"], bump = sundial.bumps.port_lp_bump)]
    pub sundial_port_lp_wallet: Account<'info, TokenAccount>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub principle_token_mint: Account<'info, Mint>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"yield_mint"], bump = sundial.bumps.yield_mint_bump)]
    pub yield_token_mint: AccountInfo<'info>,
    pub port_accounts: PortAccounts<'info>,
    #[account(mut)]
    pub user_liquidity_wallet: AccountInfo<'info>,
    #[account(mut)]
    pub user_principle_token_wallet: AccountInfo<'info>,
    #[account(mut)]
    pub user_yield_token_wallet: AccountInfo<'info>,
    pub user_authority: Signer<'info>,
    #[account(executable)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction()]
pub struct RedeemLp<'info> {
    #[account(mut,
        constraint = sundial.end_unix_time_stamp <= (clock.unix_timestamp as u64) @ SundialError::AlreadyEnd,
        constraint = sundial.reserve == port_accounts.reserve.key(),
        constraint = sundial.token_program == token_program.key(),
        constraint = sundial.port_lending_program == port_accounts.port_lending_program.key())]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: AccountInfo<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"lp"], bump = sundial.bumps.port_lp_bump)]
    pub sundial_port_lp_wallet: Account<'info, TokenAccount>,
    #[account(seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump)]
    pub sundial_port_liquidity_wallet: AccountInfo<'info>,
    pub port_accounts: PortAccounts<'info>,
    #[account(executable)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct RedeemPrincipleToken<'info> {
    #[account(mut,
        constraint = sundial.end_unix_time_stamp <= (clock.unix_timestamp as u64) @ SundialError::NotEndYet,
        constraint = sundial.token_program == token_program.key())]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: AccountInfo<'info>,
    #[account(seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump, constraint = token_amount(&sundial_port_liquidity_wallet)? != 0 @ SundialError::NotRedeemLpYet )]
    pub sundial_port_liquidity_wallet: AccountInfo<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub principle_token_mint: AccountInfo<'info>,
    #[account(mut)]
    pub user_liquidity_wallet: AccountInfo<'info>,
    #[account(mut)]
    pub user_principle_token_wallet: AccountInfo<'info>,
    pub user_authority: Signer<'info>,
    #[account(executable)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct RedeemYieldToken<'info> {
    #[account(mut,
        constraint = sundial.end_unix_time_stamp <= (clock.unix_timestamp as u64) @ SundialError::NotEndYet,
        constraint = sundial.token_program == token_program.key())]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: AccountInfo<'info>,
    #[account(seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump, constraint = sundial_port_liquidity_wallet.amount != 0 @ SundialError::NotRedeemLpYet)]
    pub sundial_port_liquidity_wallet: Account<'info, TokenAccount>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"yield_mint"], bump = sundial.bumps.yield_mint_bump)]
    pub yield_token_mint: Account<'info, Mint>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub principle_token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_liquidity_wallet: AccountInfo<'info>,
    #[account(mut)]
    pub user_yield_token_wallet: AccountInfo<'info>,
    pub user_authority: Signer<'info>,
    #[account(executable)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}
