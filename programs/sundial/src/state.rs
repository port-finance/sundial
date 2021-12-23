use crate::error::SundialError;
use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, transfer, Mint, MintTo, Transfer};

use solana_maths::{Decimal, TryDiv, TryMul};

#[account]
#[derive(Debug, PartialEq, Default)]
pub struct Sundial {
    pub bumps: SundialBumps,
    /// The duration from [Sundial] start to end.
    pub duration_in_seconds: i64,
    /// The end unix time stamp in seconds.
    pub end_unix_time_stamp: i64,
    /// The start exchange rate from Port Finance which is defined as how much collateral token the user will receive depositing
    /// one liquidity token.
    pub start_exchange_rate: [u64; 2],
    /// The public key of the Port reserve that receives the liquidity.
    pub reserve: Pubkey,
    /// SPL Token Program
    pub token_program: Pubkey,
    /// Port Finance Variable Rate Lending Program.
    pub port_lending_program: Pubkey,
    /// Configuration for the given [Sundial].
    pub sundial_lending_config: SundialLendingConfig,
    /// Space in case we need to add more data.
    pub _padding: [u64; 22],
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialLendingConfig {
    /// Lending fee bips charged in Principal Tokens
    pub lending_fee: Fee,
    /// Borrowing fee bips charged in Principal Tokens
    pub borrow_fee: Fee,
    /// Maximum number of principal tokens that can be minted in lamports.
    pub liquidity_cap: LiquidityCap,
    /// Padding to ensure that the outer u64 padding in [Sundial] is matched.
    pub _config_padding: [u8; 6],
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default, Copy)]
pub struct LiquidityCap {
    pub lamports: u64,
}

impl LiquidityCap {
    pub fn check<'info>(&self, principle_mint: &mut Account<'info, Mint>) -> ProgramResult {
        principle_mint.reload()?;
        if principle_mint.supply > self.lamports {
            Err(SundialError::ExceedLiquidityCap.into())
        } else {
            Ok(())
        }
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default, Copy)]
pub struct Fee {
    pub bips: u8,
}

impl Fee {
    pub fn calculate_fee(&self, mint_principle_amount: u64) -> Result<u64, ProgramError> {
        Decimal::from(mint_principle_amount)
            .try_mul(self.bips as u64)?
            .try_div(10000)?
            .try_ceil_u64()
    }

    pub fn transfer_fee<'a, 'b, 'c, 'info>(
        &self,
        mint_principle_amount: u64,
        transfer_context: CpiContext<'a, 'b, 'c, 'info, Transfer<'info>>,
    ) -> Result<u64, ProgramError> {
        let fee_amount = self.calculate_fee(mint_principle_amount)?;
        transfer(transfer_context, fee_amount).map(|_| fee_amount)
    }
    pub fn mint_fee<'a, 'b, 'c, 'info>(
        &self,
        mint_principle_amount: u64,
        mint_context: CpiContext<'a, 'b, 'c, 'info, MintTo<'info>>,
    ) -> Result<u64, ProgramError> {
        let fee_amount = self.calculate_fee(mint_principle_amount)?;
        mint_to(mint_context, fee_amount).map(|_| fee_amount)
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialBumps {
    pub authority_bump: u8,
    pub port_liquidity_bump: u8,
    pub port_lp_bump: u8,
    pub principle_mint_bump: u8,
    pub yield_mint_bump: u8,
    pub fee_receiver_bump: u8,
}
