use crate::helpers::*;
use crate::state::Sundial;
use crate::state::SundialMarket;
use anchor_lang::prelude::*;

use crate::instructions::SundialInitConfigParams;

use sundial_derives::{validates, CheckSundialOwner};

use crate::error::SundialError;

#[validates(check_sundial_owner)]
#[derive(Accounts, Clone, CheckSundialOwner)]
#[instruction(config: SundialInitConfigParams)]
pub struct ChangeSundialConfig<'info> {
    #[account(mut)]
    pub sundial: Account<'info, Sundial>,
    pub sundial_market: Account<'info, SundialMarket>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn process_change_sundial_config(
    ctx: Context<ChangeSundialConfig>,
    config: SundialInitConfigParams,
) -> ProgramResult {
    ctx.accounts.sundial.config = config.into();
    Ok(())
}
