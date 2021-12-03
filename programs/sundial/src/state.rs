use anchor_lang::prelude::*;

pub(crate) const DISCRIMINATOR_SIZE: usize = 8;
#[account]
#[derive(Debug, PartialEq, Default)]
pub struct Sundial {
    pub bumps: SundialBumps,
    pub duration_in_seconds: i64,
    pub end_unix_time_stamp: i64,
    pub start_exchange_rate: [u64; 2],
    pub reserve: Pubkey,
    pub token_program: Pubkey,
    pub port_lending_program: Pubkey,
    pub _padding: [u64; 24],
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialBumps {
    pub sundial_bump: u8,
    pub authority_bump: u8,
    pub port_liquidity_bump: u8,
    pub port_lp_bump: u8,
    pub principle_mint_bump: u8,
    pub yield_mint_bump: u8,
    pub fee_receiver_bump: u8,
}
