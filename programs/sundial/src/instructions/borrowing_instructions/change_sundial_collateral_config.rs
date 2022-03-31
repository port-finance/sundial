use crate::helpers::*;
use crate::instructions::SundialCollateralConfigParams;

use crate::state::{LiquidationConfig, LiquidityCap, LTV, SundialCollateral, SundialMarket};
use anchor_lang::prelude::*;

use crate::error::SundialError;

use sundial_derives::{validates, CheckSundialOwner};

#[validates(check_sundial_owner)]
#[derive(Accounts, Clone, CheckSundialOwner)]
#[instruction(config: SundialCollateralConfigParams)]
pub struct ChangeSundialCollateralConfig<'info> {
    #[account[mut]]
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub sundial_market: Box<Account<'info, SundialMarket>>,
}

pub fn process_change_sundial_collateral_config(
    ctx: Context<ChangeSundialCollateralConfig>,
    config: SundialCollateralConfigParams,
) -> ProgramResult {
    ctx.accounts.sundial_collateral.sundial_collateral_config.ltv =  LTV { ltv: config.ltv };
    ctx.accounts.sundial_collateral.sundial_collateral_config.liquidation_config = LiquidationConfig {
        liquidation_threshold: config.liquidation_threshold,
        liquidation_penalty: config.liquidation_penalty,
    };
    ctx.accounts.sundial_collateral.sundial_collateral_config.liquidity_cap = LiquidityCap {
        lamports: config.liquidity_cap,
    };
    Ok(())
}
