use crate::state::SundialProfile;
use anchor_lang::prelude::*;

use sundial_derives::validates;

/// Refresh [SundialProfile]'s borrowing power.
#[validates()]
#[derive(Accounts, Clone)]
#[instruction()]
pub struct RefreshSundialProfile<'info> {
    #[account(mut)]
    pub profile: Box<Account<'info, SundialProfile>>,
    pub clock: Sysvar<'info, Clock>,
    // optional [SundialCollateral] and oracles
}

pub fn process_refresh_sundial_profile<'info>(
    ctx: Context<'_, '_, '_, 'info, RefreshSundialProfile<'info>>,
) -> ProgramResult {
    let profile = &mut ctx.accounts.profile;
    profile.last_update = ctx.accounts.clock.slot.into();

    let collaterals_and_oracles = ctx.remaining_accounts;

    let collateral_cnt = profile.collaterals.len();
    let loan_cnt = profile.loans.len();

    let collaterals = &collaterals_and_oracles[0..collateral_cnt];
    let oracles = &collaterals_and_oracles[collateral_cnt..collateral_cnt + loan_cnt];

    log_then_prop_err!(profile
        .collaterals
        .iter_mut()
        .zip(collaterals.iter())
        .try_for_each(|(collateral, sundial_collateral)| collateral
            .refresh_price(sundial_collateral, &ctx.accounts.clock)));

    log_then_prop_err!(profile
        .loans
        .iter_mut()
        .zip(oracles.iter())
        .try_for_each(|(loan, oracle)| loan.refresh_price(oracle, &ctx.accounts.clock)));

    Ok(())
}
