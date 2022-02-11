use crate::state::SundialProfile;
use anchor_lang::prelude::*;

use sundial_derives::validates;

#[validates()]
#[derive(Accounts, Clone)]
#[instruction()]
//Refresh sundial profile's asset value
pub struct RefreshSundialProfile<'info> {
    #[account(mut)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    pub clock: Sysvar<'info, Clock>,
    // optional [SundialCollateral] and oracles
}

pub fn process_refresh_sundial_profile<'info>(
    ctx: Context<'_, '_, '_, 'info, RefreshSundialProfile<'info>>,
) -> ProgramResult {
    let sundial_profile = &mut ctx.accounts.sundial_profile;
    sundial_profile.last_update = ctx.accounts.clock.slot.into();

    let sundial_collaterals_and_oracles = ctx.remaining_accounts;
    let sundial_collaterals =
        &sundial_collaterals_and_oracles[0..sundial_profile.collaterals.len()];

    let oracles = &sundial_collaterals_and_oracles[sundial_profile.collaterals.len()
        ..sundial_profile.collaterals.len() + sundial_profile.loans.len()];
    log_then_prop_err!(sundial_profile
        .collaterals
        .iter_mut()
        .zip(sundial_collaterals.iter())
        .try_for_each(|(collateral, sundial_collateral)| collateral
            .refresh_price(sundial_collateral, &ctx.accounts.clock)));

    log_then_prop_err!(sundial_profile
        .loans
        .iter_mut()
        .zip(oracles.iter())
        .try_for_each(|(loan, oracle)| loan.refresh_price(oracle, &ctx.accounts.clock)));

    Ok(())
}
