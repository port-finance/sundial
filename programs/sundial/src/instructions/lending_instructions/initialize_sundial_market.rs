use crate::state::SundialMarket;
use anchor_lang::prelude::*;
use sundial_derives::*;

#[validates()]
#[derive(Accounts, Clone)]
#[instruction(owner: Pubkey)]
pub struct InitializeSundialMarket<'info> {
    #[account(init, payer = payer)]
    pub sundial_market: Account<'info, SundialMarket>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn process_initialize_sundial_market(
    ctx: Context<InitializeSundialMarket>,
    owner: Pubkey,
) -> ProgramResult {
    ctx.accounts.sundial_market.owner = owner;
    emit!(InitializeSundialMarketEvent {
        sundial_market: ctx.accounts.sundial_market.key(),
        owner,
    });
    Ok(())
}

#[event]
pub struct InitializeSundialMarketEvent {
    #[index]
    pub sundial_market: Pubkey,
    pub owner: Pubkey,
}
