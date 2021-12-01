use anchor_lang::prelude::*;

pub(crate) const DISCRIMINATOR_SIZE: usize = 8;

#[account]
#[derive(Debug, PartialEq)]
pub struct Sundial {
    pub bumps: SundialBumps,
    pub end_unix_time_stamp: u64,
    pub reserve: Pubkey,
    pub token_program: Pubkey,
    pub port_lending_program: Pubkey,
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone)]
pub struct SundialBumps {
    pub sundial_bump: u8,
    pub authority_bump: u8,
    pub port_liquidity_bump: u8,
    pub port_lp_bump: u8,
    pub principle_mint_bump: u8,
    pub yield_mint_bump: u8,
    pub fee_receiver_bump: u8,
}
