use crate::instructions::*;
use crate::state::SundialBumps;
use anchor_lang::prelude::*;

pub mod error;
pub mod event;
#[macro_use]
pub mod helpers;
pub mod instructions;
pub mod state;
use paste::paste;
declare_id!("SDLxV7m1qmoqkytqYRGY1x438AbYCqekPsPxK4kvwuk");

#[program]
pub mod sundial {
    use super::*;
    use crate::error::SundialError;
    use crate::event::*;
    use crate::helpers::{create_mint_to_cpi, create_transfer_cpi};
    use anchor_spl::token::{burn, mint_to, transfer, Burn};

    use port_anchor_adaptor::{deposit_reserve, redeem};
    use port_variable_rate_lending_instructions::math::{Rate as PortRate, U128 as PortU128};
    use port_variable_rate_lending_instructions::state::CollateralExchangeRate;
    use solana_maths::{Decimal, TryDiv, TryMul};
    pub fn initialize(
        ctx: Context<InitializeSundial>,
        bumps: SundialBumps,
        duration_in_seconds: i64,
        port_lending_program: Pubkey,
    ) -> ProgramResult {
        let sundial = &mut ctx.accounts.sundial;
        sundial.bumps = bumps;
        sundial.token_program = ctx.accounts.token_program.key();
        sundial.reserve = ctx.accounts.reserve.key();
        let start_exchange_rate = ctx
            .accounts
            .reserve
            .collateral
            .exchange_rate(ctx.accounts.reserve.liquidity.total_supply()?)?;
        sundial.start_exchange_rate = start_exchange_rate.0 .0 .0;
        sundial.port_lending_program = port_lending_program;
        let current_unix_time_stamp = ctx.accounts.clock.unix_timestamp;
        sundial.duration_in_seconds = duration_in_seconds;
        sundial.end_unix_time_stamp = current_unix_time_stamp
            .checked_add(duration_in_seconds)
            .ok_or(SundialError::MathOverflow)?;
        Ok(())
    }

    pub fn mint_principle_tokens_and_yield_tokens(
        ctx: Context<DepositAndMintTokens>,
        amount: u64,
    ) -> ProgramResult {
        let sundial = &ctx.accounts.sundial;
        let existed_lp_amount = ctx.accounts.sundial_port_lp_wallet.amount;
        let start_exchange_rate =
            CollateralExchangeRate(PortRate(PortU128(sundial.start_exchange_rate)));

        deposit_reserve(
            ctx.accounts.port_accounts.create_deposit_reserve_context(
                ctx.accounts.user_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_port_lp_wallet.to_account_info(),
                ctx.accounts.user_authority.to_account_info(),
                ctx.accounts.clock.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                &[&[&[]]],
            ),
            amount,
        )?;

        ctx.accounts.sundial_port_lp_wallet.reload()?;
        let principle_mint_amount = start_exchange_rate.collateral_to_liquidity(
            ctx.accounts
                .sundial_port_lp_wallet
                .amount
                .checked_sub(existed_lp_amount)
                .ok_or(SundialError::MathOverflow)?,
        )?;

        mint_to(
            create_mint_to_cpi(
                ctx.accounts.principle_token_mint.to_account_info(),
                ctx.accounts.user_principle_token_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            principle_mint_amount,
        )?;

        mint_to(
            create_mint_to_cpi(
                ctx.accounts.yield_token_mint.to_account_info(),
                ctx.accounts.user_yield_token_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            amount,
        )?;

        emit!(DidDeposit {
            liquidity_spent: amount,
            principle_token_minted: principle_mint_amount,
            yield_token_minted: amount
        });
        Ok(())
    }

    pub fn redeem_principle_tokens(
        ctx: Context<RedeemPrincipleToken>,
        amount: u64,
    ) -> ProgramResult {
        burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.principle_token_mint.to_account_info(),
                    to: ctx.accounts.user_principle_token_wallet.to_account_info(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            amount,
        )?;
        transfer(
            create_transfer_cpi(
                ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
                ctx.accounts.user_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            amount,
        )?;

        emit!(DidRedeemPrinciple {
            principle_burned: amount,
            liquidity_redeemed: amount
        });
        Ok(())
    }

    pub fn redeem_yield_tokens(ctx: Context<RedeemYieldToken>, amount: u64) -> ProgramResult {
        let principle_supply_amount = ctx.accounts.principle_token_mint.supply;
        let liquidity_of_yield = ctx
            .accounts
            .sundial_port_liquidity_wallet
            .amount
            .checked_sub(principle_supply_amount)
            .ok_or(SundialError::MathOverflow)?;
        let yield_supply_amount = ctx.accounts.yield_token_mint.supply;
        let amount_to_redeem = Decimal::from(liquidity_of_yield)
            .try_div(yield_supply_amount)?
            .try_mul(amount)?
            .try_floor_u64()?;
        burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.yield_token_mint.to_account_info(),
                    to: ctx.accounts.user_yield_token_wallet.to_account_info(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            amount,
        )?;
        transfer(
            create_transfer_cpi(
                ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
                ctx.accounts.user_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            amount_to_redeem,
        )?;
        emit!(DidRedeemYield {
            yield_burned: amount,
            liquidity_redeemed: amount_to_redeem
        });
        Ok(())
    }

    pub fn redeem_lp(ctx: Context<RedeemLp>) -> ProgramResult {
        redeem(
            ctx.accounts.port_accounts.create_redeem_context(
                ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_port_lp_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                ctx.accounts.clock.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                seeds!(ctx, authority),
            ),
            ctx.accounts.sundial_port_lp_wallet.amount,
        )
    }
}
