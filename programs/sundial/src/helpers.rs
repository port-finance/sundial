use crate::error::SundialError;
use anchor_lang::prelude::*;
use anchor_spl::token::{MintTo, Transfer};
use pyth_client::PriceType;
use pyth_client::{cast, Price};
use solana_maths::{Decimal, TryDiv, TryMul};

use vipers::unwrap_int;
use vipers::VipersError;

pub const SUNDIAL_COLLATERAL_STALE_TOL: u64 = 10; //The collateral (port lp) token price would be invalid after 10 slots
pub const SUNDIAL_PROFILE_STALE_TOL: u64 = 10; //The asset infos in sundial profile would be invalid after 10 slots
macro_rules! seeds {
    ($ctx:ident, $account: ident, $bump_name: ident) => {
        paste! {  &[&[
                $ctx.accounts.$account.key().as_ref(),
                stringify!($bump_name).as_ref(),
                &[$ctx.accounts.$account.bumps. [<$bump_name _bump> ]],
            ]]
        }
    };
}

pub fn price_per_lamport(price: Decimal, decimals: u8) -> Result<Decimal, ProgramError> {
    let divisor = unwrap_int!(10u64.checked_pow(decimals as u32));
    price.try_div(divisor)
}

#[inline(always)]
pub fn create_transfer_cpi<'a, 'b, 'c, 'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    seeds: &'a [&'b [&'c [u8]]],
    token_program: AccountInfo<'info>,
) -> CpiContext<'a, 'b, 'c, 'info, Transfer<'info>> {
    let cpi_accounts = Transfer {
        from,
        to,
        authority,
    };
    CpiContext::new_with_signer(token_program, cpi_accounts, seeds)
}

#[inline(always)]
pub fn create_mint_to_cpi<'a, 'b, 'c, 'info>(
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    seeds: &'a [&'b [&'c [u8]]],
    token_program: AccountInfo<'info>,
) -> CpiContext<'a, 'b, 'c, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
        mint,
        to,
        authority,
    };
    CpiContext::new_with_signer(token_program, cpi_accounts, seeds)
}
macro_rules! log_then_prop_err {
    ($ex: expr) => {
        match $ex {
            Ok(v) => v,
            Err(e) => {
                vipers::log_code_location!();
                return Err(e.into());
            }
        }
    };
    ($ex: expr, $e: expr) => {
        match $ex {
            Ok(v) => v,
            Err(_) => {
                vipers::log_code_location!();
                return Err($e.into());
            }
        }
    };
    ($ex: expr, $e: expr, $msg: literal) => {
        match $ex {
            Ok(v) => v,
            Err(_) => {
                vipers::log_code_location!();
                msg!($msg);
                return Err($e.into());
            }
        }
    };
}

pub fn get_pyth_oracle_price(oracle: &AccountInfo, clock: &Clock) -> Result<Decimal, ProgramError> {
    const STALE_AFTER_SLOTS_ELAPSED: u64 = 10;

    let pyth_data = oracle.try_borrow_data()?;
    let pyth_price = cast::<Price>(&pyth_data);
    vipers::invariant!(
        matches!(pyth_price.ptype, PriceType::Price),
        SundialError::InvalidOracleConfig,
        "Invalid oracle type"
    );

    let slots_elapsed = unwrap_int!(clock.slot.checked_sub(pyth_price.valid_slot));

    vipers::invariant!(
        slots_elapsed <= STALE_AFTER_SLOTS_ELAPSED,
        SundialError::InvalidOracleConfig,
        &format!(
            "Oracle price is stale, current {:?}, last_update {:?}:",
            clock.slot, pyth_price.valid_slot
        )
    );

    let price: u64 = pyth_price.agg.price.try_into().map_err(|_| {
        msg!("Oracle price cannot be negative {:?}", pyth_price.agg.price);
        SundialError::InvalidOracleConfig
    })?;

    let market_price = if pyth_price.expo >= 0 {
        let exponent: u32 = log_then_prop_err!(pyth_price
            .expo
            .try_into()
            .map_err(|_| VipersError::IntegerOverflow));
        let zeros = unwrap_int!(10u64.checked_pow(exponent));
        log_then_prop_err!(Decimal::from(price).try_mul(zeros))
    } else {
        let exponent = log_then_prop_err!(unwrap_int!(pyth_price.expo.checked_abs())
            .try_into()
            .map_err(|_| VipersError::IntegerOverflow));
        let decimals = unwrap_int!(10u64.checked_pow(exponent));
        log_then_prop_err!(Decimal::from(price).try_div(decimals))
    };

    Ok(market_price)
}

pub fn update_or_insert<T, F, M, D>(
    elems: &mut Vec<T>,
    check: F,
    mutate: M,
    default: D,
) -> ProgramResult
where
    F: Fn(&&mut T) -> bool,
    M: Fn(&mut T) -> ProgramResult,
    D: Fn() -> Result<T, ProgramError>,
{
    let mut iter = elems.iter_mut();
    if let Some(elem) = iter.find(check) {
        mutate(elem)
    } else {
        elems.push(default()?);
        Ok(())
    }
}

pub trait CheckSundialProfileStale {
    fn check_sundial_profile_stale(&self) -> ProgramResult;
}

pub trait CheckSundialOwner {
    fn check_sundial_owner(&self) -> ProgramResult;
}

pub trait CheckSundialMarketOwner {
    fn check_sundial_market_owner(&self) -> ProgramResult;
}

pub trait CheckSundialProfileMarket {
    fn check_sundial_profile_market(&self) -> ProgramResult;
}
pub trait CheckSundialNotEnd {
    fn check_sundial_not_end(&self) -> ProgramResult;
}

pub trait CheckSundialAlreadyEnd {
    fn check_sundial_already_end(&self) -> ProgramResult;
}

macro_rules! get_raw_from_uint {
    ($x: expr) => {
        $x.0 .0
    };
}
