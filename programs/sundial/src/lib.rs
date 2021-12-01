use crate::instructions::*;
use crate::state::SundialBumps;
use anchor_lang::prelude::*;
pub mod error;
pub mod event;
pub mod helpers;
pub mod instructions;
pub mod state;

declare_id!("SDLxV7m1qmoqkytqYRGY1x438AbYCqekPsPxK4kvwuk");

#[program]
pub mod sundial {
    use super::*;
    use crate::helpers::{create_mint_to_cpi, create_transfer_cpi};
    use anchor_spl::token::{burn, mint_to, transfer, Burn};
    use port_anchor_adaptor::port_accessor::exchange_rate;
    use port_anchor_adaptor::{deposit_reserve, redeem};
    use solana_maths::{Decimal, TryDiv, TryMul};

    pub fn initialize(
        ctx: Context<InitializeSundial>,
        bumps: SundialBumps,
        _name: String,
        end_unix_time_stamp: u64,
        port_lending_program: Pubkey,
    ) -> ProgramResult {
        let sundial = &mut ctx.accounts.sundial;
        sundial.bumps = bumps;
        sundial.token_program = ctx.accounts.token_program.key();
        sundial.reserve = ctx.accounts.reserve.key();
        sundial.end_unix_time_stamp = end_unix_time_stamp;
        sundial.port_lending_program = port_lending_program;
        Ok(())
    }

    pub fn mint_principle_tokens_and_yield_tokens(
        ctx: Context<DepositAndMintTokens>,
        amount: u64,
    ) -> ProgramResult {
        let sundial = &ctx.accounts.sundial;
        let principle_supply_amount = ctx.accounts.principle_token_mint.supply;
        let lp_amount = ctx.accounts.sundial_port_lp_wallet.amount;
        let port_exchange_rate = exchange_rate(&ctx.accounts.port_accounts.reserve)?;

        let lp_equivalent_principle = port_exchange_rate.collateral_to_liquidity(lp_amount)?;
        let principle_mint_amount = if lp_amount == 0 {
            amount
        } else {
            Decimal::from(principle_supply_amount)
                .try_div(lp_equivalent_principle)?
                .try_mul(amount)?
                .try_floor_u64()?
        };

        deposit_reserve(
            ctx.accounts.port_accounts.create_deposit_reserve_context(
                ctx.accounts.user_liquidity_wallet.clone(),
                ctx.accounts.sundial_port_lp_wallet.to_account_info(),
                ctx.accounts.user_authority.to_account_info(),
                ctx.accounts.clock.to_account_info(),
                ctx.accounts.token_program.clone(),
                &[&[&[]]],
            ),
            amount,
        )?;

        mint_to(
            create_mint_to_cpi(
                ctx.accounts.principle_token_mint.to_account_info(),
                ctx.accounts.user_principle_token_wallet.clone(),
                ctx.accounts.sundial_authority.clone(),
                &[&[&[sundial.bumps.authority_bump]]],
                ctx.accounts.token_program.clone(),
            ),
            principle_mint_amount,
        )?;

        mint_to(
            create_mint_to_cpi(
                ctx.accounts.yield_token_mint.to_account_info(),
                ctx.accounts.user_yield_token_wallet.clone(),
                ctx.accounts.sundial_authority.clone(),
                &[&[&[sundial.bumps.authority_bump]]],
                ctx.accounts.token_program.clone(),
            ),
            amount,
        )
    }

    pub fn redeem_principle_tokens(
        ctx: Context<RedeemPrincipleToken>,
        amount: u64,
    ) -> ProgramResult {
        burn(
            CpiContext::new(
                ctx.accounts.token_program.clone(),
                Burn {
                    mint: ctx.accounts.principle_token_mint.clone(),
                    to: ctx.accounts.user_principle_token_wallet.clone(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            amount,
        )?;
        transfer(
            create_transfer_cpi(
                ctx.accounts.sundial_port_liquidity_wallet.clone(),
                ctx.accounts.user_liquidity_wallet.clone(),
                ctx.accounts.sundial_authority.clone(),
                &[&[&[ctx.accounts.sundial.bumps.authority_bump]]],
                ctx.accounts.token_program.clone(),
            ),
            amount,
        )
    }

    pub fn redeem_yield_tokens(ctx: Context<RedeemYieldToken>, amount: u64) -> ProgramResult {
        let principle_supply_amount = ctx.accounts.principle_token_mint.supply;
        let liquidity_of_yield =
            ctx.accounts.sundial_port_liquidity_wallet.amount - principle_supply_amount;
        let yield_supply_amount = ctx.accounts.yield_token_mint.supply;
        let amount_to_redeem = Decimal::from(liquidity_of_yield)
            .try_div(yield_supply_amount)?
            .try_mul(amount)?
            .try_floor_u64()?;
        burn(
            CpiContext::new(
                ctx.accounts.token_program.clone(),
                Burn {
                    mint: ctx.accounts.yield_token_mint.to_account_info(),
                    to: ctx.accounts.user_yield_token_wallet.clone(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            amount,
        )?;
        transfer(
            create_transfer_cpi(
                ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
                ctx.accounts.user_liquidity_wallet.clone(),
                ctx.accounts.sundial_authority.clone(),
                &[&[&[ctx.accounts.sundial.bumps.authority_bump]]],
                ctx.accounts.token_program.clone(),
            ),
            amount_to_redeem,
        )
    }

    pub fn redeem_lp(ctx: Context<RedeemLp>) -> ProgramResult {
        redeem(
            ctx.accounts.port_accounts.create_redeem_context(
                ctx.accounts.sundial_port_liquidity_wallet.clone(),
                ctx.accounts.sundial_port_lp_wallet.to_account_info(),
                ctx.accounts.sundial_authority.clone(),
                ctx.accounts.clock.to_account_info(),
                ctx.accounts.token_program.clone(),
                &[&[&[ctx.accounts.sundial.bumps.authority_bump]]],
            ),
            ctx.accounts.sundial_port_lp_wallet.amount,
        )
    }
}
