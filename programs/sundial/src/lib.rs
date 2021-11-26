use crate::error::SundialError;
use anchor_lang::prelude::*;
use std::mem::size_of;

pub mod error;

declare_id!("SDLxV7m1qmoqkytqYRGY1x438AbYCqekPsPxK4kvwuk");

#[program]
pub mod sundial {
    use super::*;
    use anchor_spl::token;

    pub fn initialize(
        ctx: Context<Initialize>,
        authority_bump: u8,
        end_unix_time_stamp: u64,
    ) -> ProgramResult {
        let sundial = &mut ctx.accounts.sundial.load_init()?;
        sundial.authority_bump = authority_bump;
        sundial.end_unix_time_stamp = end_unix_time_stamp;
        sundial.principle_token_total_supply = 0;
        sundial.yield_token_total_supply = 0;
        sundial.total_liquidity_deposited = 0;
        sundial.principle_token_mint = ctx.accounts.principle_token_mint.key();
        sundial.yield_token_mint = ctx.accounts.yield_token_mint.key();
        sundial.liquidity_supply_token_account = ctx.accounts.port_liquidity_supply.key();
        sundial.collateral_supply_token_account = ctx.accounts.port_collateral_supply.key();
        sundial.redeem_fee_receiver = ctx.accounts.redeem_fee_receiver.key();
        sundial.reserve_pubkey = ctx.accounts.reserve_pubkey.key();
        sundial.token_program = ctx.accounts.token_program.key();
        Ok(())
    }

    pub fn mint_principle_tokens_and_yield_tokens(
        ctx: Context<MintPrincipleTokenAndYieldToken>,
        amount: u64,
    ) -> ProgramResult {
        let sundial = &mut ctx.accounts.sundial.load_mut()?;
        let bump_seed = [sundial.authority_bump];
        let seed = [bump_seed.as_ref()];
        let seeds = [seed.as_ref()];
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.clone(),
            token::Transfer {
                from: ctx.accounts.user_source_liquidity.clone(),
                to: ctx.accounts.port_liquidity_supply.clone(),
                authority: ctx.accounts.user_transfer_authority.to_account_info(),
            },
            &seeds,
        );
        token::transfer(transfer_ctx, amount)?;

        let mint_principle_token_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.clone(),
            token::MintTo {
                mint: ctx.accounts.principle_token_mint.clone(),
                authority: ctx.accounts.sundial_authority.clone(),
                to: ctx.accounts.principle_token_destination.clone(),
            },
            &seeds,
        );

        let mint_yield_token_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.clone(),
            token::MintTo {
                mint: ctx.accounts.yield_token_mint.clone(),
                authority: ctx.accounts.sundial_authority.clone(),
                to: ctx.accounts.yield_token_destination.clone(),
            },
            &seeds,
        );

        // TODO: calculate the correct amounts of principle tokens and yield tokens

        token::mint_to(mint_principle_token_ctx, amount)?;

        token::mint_to(mint_yield_token_ctx, amount)?;

        Ok(())
    }

    pub fn redeem_principle_tokens(_ctx: Context<RedeemPrincipleToken>) -> ProgramResult {
        Ok(())
    }

    pub fn redeem_yield_tokens(_ctx: Context<RedeemYieldToken>) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts, Clone)]
#[instruction(authority_bump: u8, end_unix_time_stamp: u64)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = size_of::< Sundial > () + 8,
      constraint = end_unix_time_stamp > (clock.unix_timestamp as u64) @ SundialError::EndTimeTooEarly)]
    pub sundial: AccountLoader<'info, Sundial>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub owner: AccountInfo<'info>,
    #[account(seeds=[], bump=authority_bump)]
    pub sundial_authority: AccountInfo<'info>,
    #[account(owner=token_program.key())]
    pub port_liquidity_mint: AccountInfo<'info>,
    #[account(owner=token_program.key())]
    pub port_collateral_mint: AccountInfo<'info>,
    #[account(init, payer=user, token::authority=sundial_authority, token::mint=port_liquidity_mint)]
    pub port_liquidity_supply: AccountInfo<'info>,
    #[account(init, payer=user, token::authority=sundial_authority, token::mint=port_collateral_mint)]
    pub port_collateral_supply: AccountInfo<'info>,
    #[account(init, payer=user, mint::authority=sundial_authority, mint::decimals=6)]
    pub principle_token_mint: AccountInfo<'info>,
    #[account(init, payer=user, mint::authority=sundial_authority, mint::decimals=6)]
    pub yield_token_mint: AccountInfo<'info>,
    #[account(init, payer=user, token::authority=sundial_authority, token::mint=port_liquidity_mint)]
    pub redeem_fee_receiver: AccountInfo<'info>,
    pub reserve_pubkey: AccountInfo<'info>,
    #[account(executable)]
    pub token_program: AccountInfo<'info>,
    #[account(executable)]
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

#[account(zero_copy)]
#[derive(Debug, PartialEq)]
pub struct Sundial {
    pub authority_bump: u8,
    pub end_unix_time_stamp: u64,
    pub principle_token_total_supply: u64,
    pub yield_token_total_supply: u64,
    pub total_liquidity_deposited: u64,
    pub principle_token_mint: Pubkey,
    pub yield_token_mint: Pubkey,
    pub liquidity_supply_token_account: Pubkey,
    pub collateral_supply_token_account: Pubkey,
    pub redeem_fee_receiver: Pubkey,
    pub reserve_pubkey: Pubkey,
    pub token_program: Pubkey,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct MintPrincipleTokenAndYieldToken<'info> {
    #[account(mut)]
    pub sundial: AccountLoader<'info, Sundial>,
    #[account(seeds=[], bump=sundial.load() ?.authority_bump)]
    pub sundial_authority: AccountInfo<'info>,
    #[account(mut)] // TODO: check that the destination token account mint matches.
    pub user_source_liquidity: AccountInfo<'info>,
    #[account(mut)] // TODO: check that the destination token account mint matches.
    pub principle_token_destination: AccountInfo<'info>,
    #[account(mut)] // TODO: check that the destination token account mint matches.
    pub yield_token_destination: AccountInfo<'info>,
    pub user_transfer_authority: Signer<'info>,
    #[account(mut)]
    pub principle_token_mint: AccountInfo<'info>,
    #[account(mut)]
    pub yield_token_mint: AccountInfo<'info>,
    #[account(mut)]
    pub port_liquidity_supply: AccountInfo<'info>,
    #[account(mut)]
    pub port_collateral_supply: AccountInfo<'info>,
    pub lending_market: AccountInfo<'info>,
    pub lending_market_authority: AccountInfo<'info>,
    #[account(executable)]
    pub port_lending_program: AccountInfo<'info>,
    #[account(executable)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct RedeemPrincipleToken {}

#[derive(Accounts)]
pub struct RedeemYieldToken {}
