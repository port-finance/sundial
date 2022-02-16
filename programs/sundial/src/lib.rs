use crate::instructions::*;

use crate::state::SundialBumps;
use crate::state::SundialCollateralBumps;
use anchor_lang::prelude::*;

use sundial_derives::process;

pub mod error;
pub mod event;
#[macro_use]
pub mod helpers;
pub mod instructions;
pub mod state;

declare_id!("SDLxV7m1qmoqkytqYRGY1x438AbYCqekPsPxK4kvwuk");

#[program]
pub mod sundial {
    use super::*;

    use vipers::Validate;

    #[process]
    fn initialize_sundial(
        ctx: Context<InitializeSundial>,
        bumps: SundialBumps,
        duration_in_seconds: i64,
        port_lending_program: Pubkey,
        config: SundialInitConfigParams,
        oracle: Pubkey,
        _name: String,
        _pda_bump: u8,
    ) {
    }

    #[process]
    fn mint_principle_tokens_and_yield_tokens(ctx: Context<DepositAndMintTokens>, amount: u64) {}

    #[process]
    fn redeem_principle_tokens(ctx: Context<RedeemPrincipleToken>, amount: u64) {}

    #[process]
    fn redeem_yield_tokens(ctx: Context<RedeemYieldToken>, amount: u64) {}

    #[process]
    fn redeem_lp(ctx: Context<RedeemLp>) -> ProgramResult {}

    #[process]
    fn initialize_sundial_collateral(
        ctx: Context<InitializeSundialCollateral>,
        bumps: SundialCollateralBumps,
        config: SundialCollateralConfigParams,
        _name: String,
        _pda_bump: u8,
    ) {
    }

    #[process]
    fn refresh_sundial_profile<'info>(
        ctx: Context<'_, '_, '_, 'info, RefreshSundialProfile<'info>>,
    ) {
    }

    #[process]
    fn deposit_sundial_collateral<'info>(
        ctx: Context<'_, '_, '_, 'info, DepositSundialCollateral<'info>>,
        amount: u64,
    ) {
    }

    #[process]
    fn withdraw_sundial_collateral(
        ctx: Context<WithdrawSundialCollateral>,
        max_withdraw_amount: u64,
    ) {
    }

    #[process]
    fn mint_sundial_liquidity_with_collateral<'info>(
        ctx: Context<'_, '_, '_, 'info, MintSundialLiquidityWithCollateral<'info>>,
        amount: u64,
    ) {
    }

    #[process]
    fn repay_sundial_liquidity(ctx: Context<RepaySundialLiquidity>, max_repay_amount: u64) {}

    #[process]
    fn liquidate_sundial_profile(ctx: Context<LiquidateSundialProfile>) {}

    #[process]
    fn initialize_sundial_profile(
        ctx: Context<InitializeSundialProfile>,
        sundial_market: Pubkey,
        _bump: u8,
    ) {
    }

    #[process]
    fn refresh_sundial_collateral(ctx: Context<RefreshSundialCollateral>) {}

    #[process]
    fn change_sundial_collateral_config(
        ctx: Context<ChangeSundialCollateralConfig>,
        config: SundialCollateralConfigParams,
    ) {
    }

    #[process]
    fn change_sundial_config(ctx: Context<ChangeSundialConfig>, config: SundialInitConfigParams) {}

    #[process]
    fn initialize_sundial_market(ctx: Context<InitializeSundialMarket>, owner: Pubkey) {}
}
