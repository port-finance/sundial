mod change_sundial_config;
mod deposit_and_mint_tokens;
mod initialize_sundial;
mod initialize_sundial_market;
mod redeem_lp;
mod redeem_principle_token;
mod redeem_yield_token;

pub use change_sundial_config::*;
pub use deposit_and_mint_tokens::*;
pub use initialize_sundial::*;
pub use initialize_sundial_market::*;
pub use redeem_lp::*;
pub use redeem_principle_token::*;
pub use redeem_yield_token::*;

use crate::error::*;

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use port_anchor_adaptor::{Deposit as PortDeposit, PortLendingMarket, PortReserve, Redeem};

#[derive(Accounts)]
pub struct PortAccounts<'info> {
    #[account(owner = port_lending_program.key())]
    pub lending_market: Box<Account<'info, PortLendingMarket>>,

    #[account(
        seeds = [
            lending_market.key().as_ref(),
        ],
        bump = lending_market.bump_seed
    )]
    /// CHECK: Authority for [PortLendingMarket].
    pub lending_market_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        owner = port_lending_program.key(),
        constraint = !reserve.last_update.stale @ SundialError::ReserveIsNotRefreshed
    )]
    pub reserve: Box<Account<'info, PortReserve>>,

    #[account(mut)]
    pub reserve_liquidity_wallet: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub reserve_collateral_mint: Box<Account<'info, Mint>>,

    #[account(executable)]
    /// CHECK: Port Lending Program.
    pub port_lending_program: UncheckedAccount<'info>,
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
            reserve_liquidity_supply: self.reserve_liquidity_wallet.to_account_info(),
            reserve_collateral_mint: self.reserve_collateral_mint.to_account_info(),
            lending_market: self.lending_market.to_account_info(),
            lending_market_authority: self.lending_market_authority.to_account_info(),
            transfer_authority: user_authority,
            clock,
            token_program,
        };

        CpiContext::new_with_signer(
            self.port_lending_program.to_account_info(),
            cpi_accounts,
            seeds,
        )
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
            reserve_collateral_mint: self.reserve_collateral_mint.to_account_info(),
            reserve_liquidity_supply: self.reserve_liquidity_wallet.to_account_info(),
            lending_market: self.lending_market.to_account_info(),
            lending_market_authority: self.lending_market_authority.to_account_info(),
            transfer_authority: user_authority,
            token_program,
            clock,
        };
        CpiContext::new_with_signer(
            self.port_lending_program.to_account_info(),
            cpi_accounts,
            seeds,
        )
    }
}
