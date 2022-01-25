use crate::error::SundialError;
use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, transfer, Mint, MintTo, TokenAccount, Transfer};

use crate::helpers::{get_pyth_oracle_price, SUNDIAL_COLLATERAL_STALE_TOL};
use solana_maths::{Decimal, Rate, TryAdd, TryDiv, TryMul, TrySub, U192};
use vipers::{invariant, unwrap_int};

#[account]
#[derive(Debug, PartialEq, Default)]
pub struct SundialMarket {
    /// The owner for the set of [Sundial]s and [SundialCollateral]s.
    pub owner: Pubkey,
}

#[account]
#[derive(Debug, PartialEq, Default)]
pub struct Sundial {
    /// Bump Seed when generate various PDAs.
    pub bumps: SundialBumps,
    /// The duration from [Sundial] start to end.
    pub duration_in_seconds: i64,
    /// The end unix time stamp in seconds.
    pub end_unix_time_stamp: i64,
    /// The start exchange rate from Port Finance which is defined as how much collateral token the user will receive depositing
    /// one liquidity token.
    pub start_exchange_rate: [u64; 2],
    /// The public key of the Port reserve that receives the liquidity.
    pub reserve: Pubkey,
    /// SPL Token Program
    pub token_program: Pubkey,
    /// Port Finance Variable Rate Lending Program.
    pub port_lending_program: Pubkey,
    pub sundial_market: Pubkey,
    pub oracle: Pubkey,
    /// Configuration for the given [Sundial].
    pub config: SundialConfig,
    /// Space in case we need to add more data.
    pub _padding: [u64; 14],
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialConfig {
    /// Lending fee bips charged in Principal Tokens
    pub lending_fee: Fee,
    /// Borrowing fee bips charged in Principal Tokens
    pub borrow_fee: Fee,
    /// Maximum number of principal tokens that can be minted in lamports.
    pub liquidity_cap: LiquidityCap,
    /// Padding to ensure that the outer u64 padding in [Sundial] is matched.
    pub _config_padding: [u8; 6],
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default, Copy)]
pub struct LiquidityCap {
    pub lamports: u64,
}

impl LiquidityCap {
    pub fn check_mint<'info>(&self, principle_mint: &mut Account<'info, Mint>) -> ProgramResult {
        principle_mint.reload()?;
        if principle_mint.supply > self.lamports {
            Err(SundialError::ExceedLiquidityCap.into())
        } else {
            Ok(())
        }
    }

    pub fn check_balance<'info>(
        &self,
        token_account: &mut Account<'info, TokenAccount>,
    ) -> ProgramResult {
        token_account.reload()?;
        if token_account.amount > self.lamports {
            Err(SundialError::ExceedLiquidityCap.into())
        } else {
            Ok(())
        }
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default, Copy)]
pub struct Fee {
    pub bips: u8,
}

impl Fee {
    pub fn calculate_fee(&self, mint_principle_amount: u64) -> Result<u64, ProgramError> {
        Decimal::from(mint_principle_amount)
            .try_mul(self.bips as u64)?
            .try_div(10000)?
            .try_ceil_u64()
    }

    pub fn transfer_fee<'a, 'b, 'c, 'info>(
        &self,
        mint_principle_amount: u64,
        transfer_context: CpiContext<'a, 'b, 'c, 'info, Transfer<'info>>,
    ) -> Result<u64, ProgramError> {
        let fee_amount = self.calculate_fee(mint_principle_amount)?;
        transfer(transfer_context, fee_amount).map(|_| fee_amount)
    }
    pub fn mint_fee<'a, 'b, 'c, 'info>(
        &self,
        mint_principle_amount: u64,
        mint_context: CpiContext<'a, 'b, 'c, 'info, MintTo<'info>>,
    ) -> Result<u64, ProgramError> {
        let fee_amount = self.calculate_fee(mint_principle_amount)?;
        mint_to(mint_context, fee_amount).map(|_| fee_amount)
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialBumps {
    pub authority_bump: u8,
    pub port_liquidity_bump: u8,
    pub port_lp_bump: u8,
    pub principle_mint_bump: u8,
    pub yield_mint_bump: u8,
    pub fee_receiver_bump: u8,
}

#[account]
#[derive(Debug, PartialEq, Default)]
pub struct SundialCollateral {
    pub bumps: SundialCollateralBumps,
    pub sundial_collateral_config: SundialCollateralConfig,
    /// The Port reserve that the LP tokens belong to.
    pub port_collateral_reserve: Pubkey,
    //Mint of Port LP Collateral
    pub collateral_mint: Pubkey,
    /// The current price of the Port LP tokens in USD.
    pub collateral_price: [u64; 3], // Decimal
    /// The last updated slot.
    pub last_updated_slot: LastUpdatedSlot,
    pub sundial_market: Pubkey,
    pub token_program: Pubkey,
    pub _padding: [u64; 32],
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct LastUpdatedSlot {
    pub slot: u64,
}
impl From<u64> for LastUpdatedSlot {
    fn from(slot: u64) -> Self {
        LastUpdatedSlot { slot }
    }
}
impl LastUpdatedSlot {
    pub fn check_stale(&self, clock: &Clock, tol: u64, msg: &str) -> ProgramResult {
        invariant!(self.slot >= clock.slot);
        invariant!(clock.slot - self.slot <= tol, SundialError::StateStale, msg);
        Ok(())
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialCollateralBumps {
    pub authority_bump: u8,
    pub port_lp_bump: u8,
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialCollateralConfig {
    pub ltv: LTV,
    pub liquidation_config: LiquidationConfig,
    pub liquidity_cap: LiquidityCap,
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct LTV {
    pub ltv: u8,
}
impl LTV {
    pub fn get_bp(&self, collateral_value: Decimal) -> Result<Decimal, ProgramError> {
        collateral_value.try_mul(Rate::from_percent(self.ltv))
    }
}
#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct LiquidationConfig {
    pub liquidation_threshold: u8,
    pub liquidation_penalty: u8,
}

impl LiquidationConfig {
    #[inline(always)]
    pub fn get_liquidation_value(&self, repay_value: Decimal) -> Result<Decimal, ProgramError> {
        let liquidate_percentage = unwrap_int!(100u8.checked_add(self.liquidation_penalty));
        repay_value.try_mul(Rate::from_percent(liquidate_percentage))
    }

    #[inline(always)]
    pub fn get_liquidation_margin(&self, asset_value: Decimal) -> Result<Decimal, ProgramError> {
        asset_value.try_mul(Rate::from_percent(self.liquidation_threshold))
    }
}

#[account]
#[derive(Debug, PartialEq)]
pub struct SundialProfile {
    /// The owner of the [SundialProfile].
    pub user: Pubkey,
    pub sundial_market: Pubkey,
    /// The last slot the price of the asset got updated.
    pub last_update: LastUpdatedSlot,
    /// A list of [SundialProfileCollateral].
    pub collaterals: Vec<SundialProfileCollateral>,
    /// A list of [SundialProfileLoan].
    pub loans: Vec<SundialProfileLoan>,
    pub _padding: [u64; 32],
}
impl SundialProfile {
    #[inline(always)]
    pub fn get_borrowing_power(&self) -> Result<Decimal, ProgramError> {
        self.collaterals
            .iter()
            .try_fold(Decimal::zero(), |acc_bp, c| {
                c.config
                    .ltv
                    .get_bp(Decimal(U192(c.asset.total_value)))
                    .and_then(|bp| acc_bp.try_add(bp))
            })
    }

    #[inline(always)]
    pub fn get_borrowed_value(&self) -> Result<Decimal, ProgramError> {
        self.loans.iter().try_fold(Decimal::zero(), |acc_bv, l| {
            acc_bv.try_add(Decimal(U192(l.asset.total_value)))
        })
    }

    #[inline(always)]
    pub fn get_liquidation_margin(&self) -> Result<Decimal, ProgramError> {
        self.collaterals
            .iter()
            .try_fold(Decimal::zero(), |acc_lm, c| {
                c.config
                    .liquidation_config
                    .get_liquidation_margin(Decimal(U192(c.asset.total_value)))
                    .and_then(|lm| acc_lm.try_add(lm))
            })
    }

    #[inline(always)]
    pub fn check_enough_borrowing_power(&self, err: SundialError, msg: &str) -> ProgramResult {
        let borrowing_power = log_then_prop_err!(self.get_borrowing_power());
        let borrowed_value = log_then_prop_err!(self.get_borrowed_value());
        vipers::invariant!(borrowing_power >= borrowed_value, err, msg);
        Ok(())
    }

    #[inline(always)]
    pub fn check_if_unhealthy(&self) -> Result<bool, ProgramError> {
        let liquidation_margin = log_then_prop_err!(self.get_liquidation_margin());
        let borrowed_value = log_then_prop_err!(self.get_borrowed_value());
        Ok(borrowed_value >= liquidation_margin)
    }

    #[inline(always)]
    pub fn get_mut_collaterals_and_loans(
        &mut self,
    ) -> (
        &mut Vec<SundialProfileCollateral>,
        &mut Vec<SundialProfileLoan>,
    ) {
        (&mut self.collaterals, &mut self.loans)
    }
}
impl Default for SundialProfile {
    fn default() -> Self {
        SundialProfile {
            user: Default::default(),
            last_update: 0.into(),
            collaterals: vec![SundialProfileCollateral::default(); 1],
            loans: vec![SundialProfileLoan::default(); 9],
            sundial_market: Default::default(),
            _padding: [0; 32],
        }
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialProfileCollateral {
    pub asset: AssetInfo,
    pub sundial_collateral: Pubkey,
    pub config: SundialProfileCollateralConfig,
}
#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct AssetInfo {
    pub amount: u64,
    pub total_value: [u64; 3], //Decimal
}

impl AssetInfo {
    #[inline(always)]
    pub fn update_amount(&mut self, new_amount: u64) -> ProgramResult {
        self.amount = new_amount;
        Ok(())
    }

    #[inline(always)]
    pub fn get_value(&self, amount: u64) -> Result<Decimal, ProgramError> {
        let market_value = Decimal(U192(self.total_value));
        market_value.try_div(self.amount)?.try_mul(amount)
    }

    #[inline(always)]
    pub fn get_amount(&self, value: Decimal) -> Result<Decimal, ProgramError> {
        let market_value = Decimal(U192(self.total_value));
        value.try_div(market_value.try_div(self.amount)?)
    }

    #[inline(always)]
    pub fn add_amount(&mut self, incr_amount: u64) -> ProgramResult {
        let new_amount = unwrap_int!(self.amount.checked_add(incr_amount));
        self.update_amount(new_amount)
    }

    #[inline(always)]
    pub fn reduce_amount(&mut self, decr_amount: u64) -> Result<u64, ProgramError> {
        let new_amount = unwrap_int!(self.amount.checked_sub(decr_amount));
        self.update_amount(new_amount)?;
        Ok(self.amount)
    }

    #[inline(always)]
    pub fn reduce_value(&mut self, decr_value: Decimal) -> ProgramResult {
        let market_value = Decimal(U192(self.total_value));
        let new_value = market_value.try_sub(decr_value)?;
        let new_amount = self.get_amount(new_value)?;
        self.update_amount(new_amount.try_floor_u64()?)
    }
}
impl SundialProfileCollateral {
    pub fn refresh_price(
        &mut self,
        sundial_collateral_info: &AccountInfo,
        clock: &Clock,
    ) -> ProgramResult {
        vipers::assert_keys_eq!(
            sundial_collateral_info.key,
            self.sundial_collateral,
            "Invalid reserve given for refreshing"
        );

        let sundial_collateral: SundialCollateral = anchor_lang::AnchorDeserialize::deserialize(
            &mut sundial_collateral_info.try_borrow_mut_data()?.as_ref(),
        )?;

        sundial_collateral.last_updated_slot.check_stale(
            clock,
            SUNDIAL_COLLATERAL_STALE_TOL,
            "Sundial Collateral Is Stale",
        )?;
        self.asset.total_value = get_raw_from_uint!(log_then_prop_err!(Decimal(U192(
            sundial_collateral.collateral_price
        ))
        .try_mul(self.asset.amount)));
        self.config = sundial_collateral.sundial_collateral_config.into();

        Ok(())
    }

    pub fn init_collateral(
        amount: u64,
        sundial_collateral: &Account<SundialCollateral>,
        clock: &Clock,
    ) -> Result<Self, ProgramError> {
        sundial_collateral.last_updated_slot.check_stale(
            clock,
            SUNDIAL_COLLATERAL_STALE_TOL,
            "Sundial Collateral Is Stale",
        )?;
        Ok(SundialProfileCollateral {
            asset: AssetInfo {
                amount,
                total_value: get_raw_from_uint!(log_then_prop_err!(Decimal(U192(
                    sundial_collateral.collateral_price
                ))
                .try_mul(amount))),
            },
            sundial_collateral: sundial_collateral.key(),
            config: sundial_collateral.sundial_collateral_config.clone().into(),
        })
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialProfileCollateralConfig {
    pub ltv: LTV,
    pub liquidation_config: LiquidationConfig,
}

impl From<SundialCollateralConfig> for SundialProfileCollateralConfig {
    fn from(config: SundialCollateralConfig) -> Self {
        SundialProfileCollateralConfig {
            ltv: config.ltv,
            liquidation_config: config.liquidation_config,
        }
    }
}
#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialProfileLoan {
    pub asset: AssetInfo,
    pub oracle: Pubkey,
    pub sundial: Pubkey,
    pub maturity_unix_timestamp: i64,
}

impl SundialProfileLoan {
    pub fn refresh_price(&mut self, oracle: &AccountInfo, clock: &Clock) -> ProgramResult {
        vipers::assert_keys_eq!(
            oracle.key,
            self.oracle,
            "Invalid oracle given for refreshing"
        );
        let market_price = log_then_prop_err!(get_pyth_oracle_price(oracle, clock));

        self.asset.total_value =
            get_raw_from_uint!(log_then_prop_err!(market_price.try_mul(self.asset.amount)));

        Ok(())
    }

    pub fn update_config(&mut self, sundial: &Sundial) -> ProgramResult {
        self.oracle = sundial.oracle;
        self.maturity_unix_timestamp = sundial.end_unix_time_stamp;
        Ok(())
    }

    pub fn init_loan(
        amount: u64,
        oracle: &AccountInfo,
        sundial: Pubkey,
        clock: &Clock,
        end_timestamp: i64,
    ) -> Result<Self, ProgramError> {
        let market_price = log_then_prop_err!(get_pyth_oracle_price(oracle, clock));
        Ok(SundialProfileLoan {
            asset: AssetInfo {
                amount,
                total_value: get_raw_from_uint!(market_price.try_mul(amount)?),
            },
            oracle: oracle.key(),
            sundial,
            maturity_unix_timestamp: end_timestamp,
        })
    }

    #[inline(always)]
    pub fn is_overtime(&self, current_ts: i64) -> bool {
        self.maturity_unix_timestamp <= current_ts
    }
}
