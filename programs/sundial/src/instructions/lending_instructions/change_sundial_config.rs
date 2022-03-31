use crate::helpers::*;
use crate::state::SundialConfig;
use crate::state::SundialMarket;
use crate::state::{Fee, LiquidityCap, Sundial};
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
    ctx.accounts.sundial.config.lending_fee = Fee {
        bips: config.lending_fee,
    };
    ctx.accounts.sundial.config.borrow_fee = Fee {
        bips: config.borrow_fee,
    };
    ctx.accounts.sundial.config.liquidity_cap = LiquidityCap {
        lamports: config.liquidity_cap,
    };
    emit!(ChangeSundialConfigEvent {
        sundial: ctx.accounts.sundial.key(),
        config: ctx.accounts.sundial.config.clone(),
    });
    Ok(())
}

#[event]
/// Event called in [sundial::change_sundial_config].
pub struct ChangeSundialConfigEvent {
    /// The [Sundial].
    #[index]
    pub sundial: Pubkey,
    /// New [EigenParams].
    pub config: SundialConfig,
}
