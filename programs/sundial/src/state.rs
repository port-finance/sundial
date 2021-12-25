use crate::error::SundialError;
use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, transfer, Mint, MintTo, Transfer};

use crate::helpers::get_oracle_price;
use port_anchor_adaptor::port_accessor::*;
use solana_maths::{Decimal, Rate, TryAdd, TryDiv, TryMul, TrySub, U192};
use vipers::unwrap_int;

#[account]
#[derive(Debug, PartialEq, Default)]
pub struct SundialLending {
    pub bumps: SundialLendingBumps,
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
    /// Configuration for the given [Sundial].
    pub sundial_lending_config: SundialLendingConfig,
    /// Space in case we need to add more data.
    pub _padding: [u64; 22],
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialLendingConfig {
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
    pub fn check<'info>(&self, principle_mint: &mut Account<'info, Mint>) -> ProgramResult {
        principle_mint.reload()?;
        if principle_mint.supply > self.lamports {
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
pub struct SundialLendingBumps {
    pub authority_bump: u8,
    pub port_liquidity_bump: u8,
    pub port_lp_bump: u8,
    pub principle_mint_bump: u8,
    pub yield_mint_bump: u8,
    pub fee_receiver_bump: u8,
}

#[account]
#[derive(Debug, PartialEq, Default)]
pub struct SundialBorrowing {
    pub bumps: SundialBorrowingBumps,
    pub sundial_borrowing_config: SundialBorrowingConfig,
    pub port_collateral_reserve: Pubkey,
    pub _padding: [u64; 32],
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialBorrowingBumps {
    pub authority_bump: u8,
    pub port_lp_bump: u8,
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialBorrowingConfig {
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
        let margin_percentage = unwrap_int!(100u8.checked_add(self.liquidation_threshold));
        asset_value.try_mul(Rate::from_percent(margin_percentage))
    }
}

#[account]
#[derive(Debug, PartialEq)]
pub struct SundialBorrowingProfile {
    pub user: Pubkey,
    pub last_update: u64,
    pub collaterals: Vec<SundialBorrowingCollateral>,
    pub loans: Vec<SundialBorrowingLoan>,
    pub _padding: [u64; 32],
}
impl SundialBorrowingProfile {
    #[inline(always)]
    pub fn get_borrowing_power(&self) -> Result<Decimal, ProgramError> {
        self.collaterals
            .iter()
            .try_fold(Decimal::zero(), |acc_bp, c| {
                c.config
                    .ltv
                    .get_bp(Decimal(U192(c.collateral_asset.value)))
                    .and_then(|bp| acc_bp.try_add(bp))
            })
    }

    #[inline(always)]
    pub fn get_borrowed_value(&self) -> Result<Decimal, ProgramError> {
        self.loans.iter().try_fold(Decimal::zero(), |acc_bv, l| {
            acc_bv.try_add(Decimal(U192(l.minted_asset.value)))
        })
    }

    #[inline(always)]
    pub fn get_liquidation_margin(&self) -> Result<Decimal, ProgramError> {
        self.collaterals
            .iter()
            .try_fold(Decimal::zero(), |acc_lm, c| {
                c.config
                    .liquidation_config
                    .get_liquidation_margin(Decimal(U192(c.collateral_asset.value)))
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
    pub fn check_enough_liquidation_margin(&self, err: SundialError, msg: &str) -> ProgramResult {
        let liquidation_margin = log_then_prop_err!(self.get_liquidation_margin());
        let borrowed_value = log_then_prop_err!(self.get_borrowed_value());
        vipers::invariant!(liquidation_margin >= borrowed_value, err, msg);
        Ok(())
    }

    pub fn get_mut_collaterals_and_loans(
        &mut self,
    ) -> (
        &mut Vec<SundialBorrowingCollateral>,
        &mut Vec<SundialBorrowingLoan>,
    ) {
        (&mut self.collaterals, &mut self.loans)
    }
}
impl Default for SundialBorrowingProfile {
    fn default() -> Self {
        SundialBorrowingProfile {
            user: Default::default(),
            last_update: 0,
            collaterals: vec![SundialBorrowingCollateral::default(); 1],
            loans: vec![SundialBorrowingLoan::default(); 9],
            _padding: [0; 32],
        }
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialBorrowingCollateral {
    pub collateral_asset: AssetInfo,
    pub reserve: Pubkey,
    pub config: SundialBorrowingCollateralConfig,
}
#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct AssetInfo {
    pub amount: u64,
    pub value: [u64; 3], //Decimal
}

impl AssetInfo {
    #[inline(always)]
    pub fn update_amount(&mut self, new_amount: u64) -> ProgramResult {
        self.value = self.get_value(new_amount)?.0 .0;
        self.amount = new_amount;
        Ok(())
    }

    #[inline(always)]
    pub fn get_value(&self, amount: u64) -> Result<Decimal, ProgramError> {
        let market_value = Decimal(U192(self.value));
        market_value.try_div(self.amount)?.try_mul(amount)
    }

    #[inline(always)]
    pub fn get_amount(&self, value: Decimal) -> Result<Decimal, ProgramError> {
        let market_value = Decimal(U192(self.value));
        value.try_div(market_value.try_div(self.amount)?)
    }

    #[inline(always)]
    pub fn add_amount(&mut self, incr_amount: u64) -> ProgramResult {
        let new_amount = unwrap_int!(self.amount.checked_add(incr_amount));
        self.update_amount(new_amount)
    }

    #[inline(always)]
    pub fn reduce_amount(&mut self, decr_amount: u64) -> ProgramResult {
        let new_amount = unwrap_int!(self.amount.checked_sub(decr_amount));
        self.update_amount(new_amount)
    }

    #[inline(always)]
    pub fn reduce_value(&mut self, decr_value: Decimal) -> ProgramResult {
        let market_value = Decimal(U192(self.value));
        let new_value = market_value.try_sub(decr_value)?;
        let new_amount = self.get_amount(new_value)?;
        self.update_amount(new_amount.try_floor_u64()?)
    }
}
impl SundialBorrowingCollateral {
    pub fn refresh_price(&mut self, reserve_info: &AccountInfo) -> ProgramResult {
        vipers::assert_keys_eq!(
            reserve_info.key,
            self.reserve,
            "Invalid reserve given for refreshing"
        );
        vipers::invariant!(
            !is_reserve_stale(reserve_info)?,
            SundialError::ReserveIsNotRefreshed,
            "Reserve should be refreshed before passing in to deposit"
        );

        let liquidity_price = reserve_market_price(reserve_info)?;
        let exchange_rate = exchange_rate(reserve_info)?;
        let deposit_value = liquidity_price
            .try_mul(exchange_rate.collateral_to_liquidity(self.collateral_asset.amount)?)?;
        self.collateral_asset.value = deposit_value.0 .0;
        Ok(())
    }

    pub fn init_collateral(
        amount: u64,
        reserve_info: &AccountInfo,
        config: SundialBorrowingCollateralConfig,
    ) -> Result<Self, ProgramError> {
        vipers::invariant!(
            !is_reserve_stale(reserve_info)?,
            SundialError::ReserveIsNotRefreshed,
            "Reserve should be refreshed before passing in to deposit"
        );
        let liquidity_price = reserve_market_price(reserve_info)?;
        let exchange_rate = exchange_rate(reserve_info)?;
        let deposit_value =
            liquidity_price.try_mul(exchange_rate.collateral_to_liquidity(amount)?)?;

        Ok(SundialBorrowingCollateral {
            collateral_asset: AssetInfo {
                amount,
                value: deposit_value.0 .0,
            },
            reserve: reserve_info.key(),
            config,
        })
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialBorrowingCollateralConfig {
    pub ltv: LTV,
    pub liquidation_config: LiquidationConfig,
}

impl From<SundialBorrowingConfig> for SundialBorrowingCollateralConfig {
    fn from(config: SundialBorrowingConfig) -> Self {
        SundialBorrowingCollateralConfig {
            ltv: config.ltv,
            liquidation_config: config.liquidation_config,
        }
    }
}
#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialBorrowingLoan {
    pub minted_asset: AssetInfo,
    pub oracle: Pubkey,
    pub mint_pubkey: Pubkey,
    pub end_minting_unix_timestamp: i64,
}

impl SundialBorrowingLoan {
    pub fn refresh_price(&mut self, oracle: &AccountInfo, clock: &Clock) -> ProgramResult {
        vipers::assert_keys_eq!(
            oracle.key,
            self.oracle,
            "Invalid oracle given for refreshing"
        );
        let market_price = log_then_prop_err!(get_oracle_price(oracle, clock));

        self.minted_asset.value =
            log_then_prop_err!(market_price.try_mul(self.minted_asset.amount))
                .0
                 .0;

        Ok(())
    }

    pub fn init_loan(
        amount: u64,
        oracle: &AccountInfo,
        mint_pubkey: Pubkey,
        clock: &Clock,
        end_timestamp: i64,
    ) -> Result<Self, ProgramError> {
        let market_price = log_then_prop_err!(get_oracle_price(oracle, clock));
        Ok(SundialBorrowingLoan {
            minted_asset: AssetInfo {
                amount,
                value: market_price.try_mul(amount)?.0 .0,
            },
            oracle: oracle.key(),
            mint_pubkey,
            end_minting_unix_timestamp: end_timestamp,
        })
    }

    #[inline(always)]
    pub fn is_overtime(&self, current_ts: i64) -> bool {
        self.end_minting_unix_timestamp <= current_ts
    }
}
