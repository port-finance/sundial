use crate::state::SundialProfile;
use anchor_lang::prelude::*;
use sundial_derives::*;

/// Initialize [state::SundialProfile]
#[validates()]
#[derive(Accounts, Clone)]
#[instruction(sundial_market: Pubkey, bump: u8)]
pub struct InitializeSundialProfile<'info> {
    #[account(
        init,
        payer = user,
        seeds=[
            sundial_market.as_ref(),
            user.key().as_ref(),
            b"profile"
        ],
        bump = bump
    )]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn process_initialize_sundial_profile(
    ctx: Context<InitializeSundialProfile>,
    sundial_market: Pubkey,
    _bump: u8,
) -> ProgramResult {
    let profile = &mut ctx.accounts.sundial_profile;
    profile.user = ctx.accounts.user.key();
    profile.sundial_market = sundial_market;
    Ok(())
}
