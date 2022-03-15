use crate::error::SundialError;
use crate::helpers::price_per_lamport;
use crate::state::SundialCollateral;
use anchor_lang::prelude::*;
use port_anchor_adaptor::PortReserve;
use solana_maths::Decimal;
use solana_maths::U192;
use sundial_derives::*;

/// Refresh Sundial Collateral to update the collateral (port lp) token price
#[validates()]
#[derive(Accounts, Clone)]
#[instruction()]
pub struct RefreshSundialCollateral<'info> {
    #[account(
        mut,
        has_one = port_collateral_reserve @ SundialError::InvalidPortReserve
    )]
    pub sundial_collateral: Account<'info, SundialCollateral>,

    #[account(constraint = !port_collateral_reserve.last_update.stale @ SundialError::ReserveIsNotRefreshed)]
    pub port_collateral_reserve: Account<'info, PortReserve>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn process_refresh_sundial_collateral(ctx: Context<RefreshSundialCollateral>) -> ProgramResult {
    let sundial_collateral = &mut ctx.accounts.sundial_collateral;
    let reserve = &ctx.accounts.port_collateral_reserve;
    let liquidity_price = reserve.liquidity.market_price;
    let exchange_rate = log_then_prop_err!(reserve.collateral_exchange_rate());

    let collateral_price =
        log_then_prop_err!(exchange_rate.decimal_collateral_to_liquidity(liquidity_price));

    // TODO: why we do the division here? I think it's better to divide later so more precision is preserved?
    sundial_collateral.collateral_price =
        get_raw_from_uint!(log_then_prop_err!(price_per_lamport(
            // Fixed type mismatch here.
            Decimal(U192(get_raw_from_uint!(collateral_price))),
            sundial_collateral
                .sundial_collateral_config
                .collateral_decimals
        )));

    sundial_collateral.last_updated_slot = ctx.accounts.clock.slot.into();
    Ok(())
}
