use crate::borrowing_instructions::*;
use crate::lending_instructions::*;
use crate::state::SundialBumps;
use crate::state::SundialCollateralBumps;
use anchor_lang::prelude::*;

pub mod error;
pub mod event;
#[macro_use]
pub mod helpers;
pub mod borrowing_instructions;
pub mod lending_instructions;
pub mod state;
use paste::paste;

declare_id!("SDLxV7m1qmoqkytqYRGY1x438AbYCqekPsPxK4kvwuk");

#[program]
pub mod sundial {
    use super::*;
    use std::cmp::min;

    use crate::event::*;
    use crate::helpers::{create_mint_to_cpi, create_transfer_cpi, update_or_insert};
    use anchor_spl::token::{burn, mint_to, transfer, Burn};

    use port_anchor_adaptor::port_accessor::reserve_oracle_pubkey;
    use port_anchor_adaptor::{deposit_reserve, redeem};

    use crate::error::SundialError;
    use crate::state::{SundialProfileCollateral, SundialProfileLoan};
    use port_variable_rate_lending_instructions::state::CollateralExchangeRate;
    use solana_maths::{Decimal, Rate, TryDiv, TryMul, U128};
    use vipers::{unwrap_int, unwrap_opt};

    pub fn initialize_sundial(
        ctx: Context<InitializeSundial>,
        bumps: SundialBumps,
        duration_in_seconds: i64,
        port_lending_program: Pubkey,
        config: SundialInitConfigParams,
    ) -> ProgramResult {
        let sundial = &mut ctx.accounts.sundial;
        sundial.bumps = bumps;
        sundial.token_program = ctx.accounts.token_program.key();
        sundial.reserve = ctx.accounts.reserve.key();
        let start_exchange_rate =
            log_then_prop_err!(ctx.accounts.reserve.collateral_exchange_rate());
        sundial.start_exchange_rate = start_exchange_rate.0 .0 .0;
        sundial.port_lending_program = port_lending_program;
        let current_unix_time_stamp = ctx.accounts.clock.unix_timestamp;
        sundial.duration_in_seconds = duration_in_seconds;
        sundial.end_unix_time_stamp =
            unwrap_int!(current_unix_time_stamp.checked_add(duration_in_seconds));
        sundial.config = config.into();
        sundial.owner = ctx.accounts.owner.key();
        Ok(())
    }

    pub fn mint_principle_tokens_and_yield_tokens(
        ctx: Context<DepositAndMintTokens>,
        amount: u64,
    ) -> ProgramResult {
        let sundial = &ctx.accounts.sundial;
        let existed_lp_amount = ctx.accounts.sundial_port_lp_wallet.amount;
        let start_exchange_rate = CollateralExchangeRate(Rate(U128(sundial.start_exchange_rate)));

        log_then_prop_err!(deposit_reserve(
            ctx.accounts.port_accounts.create_deposit_reserve_context(
                ctx.accounts.user_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_port_lp_wallet.to_account_info(),
                ctx.accounts.user_authority.to_account_info(),
                ctx.accounts.clock.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                &[&[&[]]],
            ),
            amount,
        ));

        log_then_prop_err!(ctx.accounts.sundial_port_lp_wallet.reload());
        let principle_mint_amount =
            start_exchange_rate.collateral_to_liquidity(unwrap_int!(ctx
                .accounts
                .sundial_port_lp_wallet
                .amount
                .checked_sub(existed_lp_amount)))?;

        let fee = &sundial.config.lending_fee;
        let fee_amount = log_then_prop_err!(fee.mint_fee(
            amount,
            create_mint_to_cpi(
                ctx.accounts.principle_token_mint.to_account_info(),
                ctx.accounts.sundial_fee_receiver_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, sundial, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
        ));

        log_then_prop_err!(mint_to(
            create_mint_to_cpi(
                ctx.accounts.principle_token_mint.to_account_info(),
                ctx.accounts.user_principle_token_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, sundial, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            unwrap_int!(principle_mint_amount.checked_sub(fee_amount)),
        ));

        log_then_prop_err!(mint_to(
            create_mint_to_cpi(
                ctx.accounts.yield_token_mint.to_account_info(),
                ctx.accounts.user_yield_token_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, sundial, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            amount,
        ));

        let liquidity_cap = &sundial.config.liquidity_cap;

        log_then_prop_err!(liquidity_cap.check(&mut ctx.accounts.principle_token_mint));
        emit!(DidDeposit {
            liquidity_spent: amount,
            principle_token_minted: principle_mint_amount,
            yield_token_minted: amount
        });
        Ok(())
    }

    pub fn redeem_principle_tokens(
        ctx: Context<RedeemPrincipleToken>,
        amount: u64,
    ) -> ProgramResult {
        log_then_prop_err!(burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.principle_token_mint.to_account_info(),
                    to: ctx.accounts.user_principle_token_wallet.to_account_info(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            amount,
        ));

        log_then_prop_err!(transfer(
            create_transfer_cpi(
                ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
                ctx.accounts.user_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, sundial, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            amount,
        ));

        emit!(DidRedeemPrinciple {
            principle_burned: amount,
            liquidity_redeemed: amount
        });
        Ok(())
    }

    pub fn redeem_yield_tokens(ctx: Context<RedeemYieldToken>, amount: u64) -> ProgramResult {
        let principle_supply_amount = ctx.accounts.principle_token_mint.supply;
        let liquidity_of_yield = unwrap_int!(ctx
            .accounts
            .sundial_port_liquidity_wallet
            .amount
            .checked_sub(principle_supply_amount));
        let yield_supply_amount = ctx.accounts.yield_token_mint.supply;
        let amount_to_redeem = log_then_prop_err!(log_then_prop_err!(log_then_prop_err!(
            Decimal::from(liquidity_of_yield).try_div(yield_supply_amount)
        )
        .try_mul(amount))
        .try_floor_u64());

        log_then_prop_err!(burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.yield_token_mint.to_account_info(),
                    to: ctx.accounts.user_yield_token_wallet.to_account_info(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            amount,
        ));

        if amount_to_redeem != 0 {
            log_then_prop_err!(transfer(
                create_transfer_cpi(
                    ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
                    ctx.accounts.user_liquidity_wallet.to_account_info(),
                    ctx.accounts.sundial_authority.to_account_info(),
                    seeds!(ctx, sundial, authority),
                    ctx.accounts.token_program.to_account_info(),
                ),
                amount_to_redeem,
            ));
        }
        emit!(DidRedeemYield {
            yield_burned: amount,
            liquidity_redeemed: amount_to_redeem
        });
        Ok(())
    }

    pub fn redeem_lp(ctx: Context<RedeemLp>) -> ProgramResult {
        log_then_prop_err!(redeem(
            ctx.accounts.port_accounts.create_redeem_context(
                ctx.accounts.sundial_port_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_port_lp_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                ctx.accounts.clock.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                seeds!(ctx, sundial, authority),
            ),
            ctx.accounts.sundial_port_lp_wallet.amount,
        ));
        Ok(())
    }

    pub fn initialize_collateral(
        ctx: Context<InitializeSundialCollateral>,
        bumps: SundialCollateralBumps,
        config: SundialCollateralInitConfigParams,
    ) -> ProgramResult {
        let sundial_collateral = &mut ctx.accounts.sundial_collateral;
        sundial_collateral.bumps = bumps;
        sundial_collateral.port_collateral_reserve = ctx.accounts.port_collateral_reserve.key();
        sundial_collateral.sundial_collateral_config = config.into();
        sundial_collateral.owner = ctx.accounts.owner.key();
        Ok(())
    }

    pub fn refresh_sundial_borrowing_profile<'info>(
        ctx: Context<'_, '_, '_, 'info, RefreshSundialBorrowingProfile<'info>>,
    ) -> ProgramResult {
        let borrowing_profile = &mut ctx.accounts.sundial_profile;
        borrowing_profile.last_update = ctx.accounts.clock.slot.into();

        let sundial_borrowings_and_oracles = ctx.remaining_accounts;
        let sundial_borrowings =
            &sundial_borrowings_and_oracles[0..borrowing_profile.collaterals.len()];
        let oracles = &sundial_borrowings_and_oracles[borrowing_profile.collaterals.len()
            ..borrowing_profile.collaterals.len() + borrowing_profile.loans.len()];
        log_then_prop_err!(borrowing_profile
            .collaterals
            .iter_mut()
            .zip(sundial_borrowings.iter())
            .try_for_each(|(collateral, sundial_borrowing)| collateral
                .refresh_price(sundial_borrowing, &ctx.accounts.clock)));

        log_then_prop_err!(borrowing_profile
            .loans
            .iter_mut()
            .zip(oracles.iter())
            .try_for_each(|(loan, oracle)| loan.refresh_price(oracle, &ctx.accounts.clock)));

        Ok(())
    }

    pub fn deposit_sundial_collateral<'info>(
        ctx: Context<'_, '_, '_, 'info, DepositSundialBorrowingCollateral<'info>>,
        amount: u64,
    ) -> ProgramResult {
        log_then_prop_err!(transfer(
            create_transfer_cpi(
                ctx.accounts.user_port_lp_wallet.to_account_info(),
                ctx.accounts
                    .sundial_collateral_port_lp_wallet
                    .to_account_info(),
                ctx.accounts.transfer_authority.to_account_info(),
                &[],
                ctx.accounts.token_program.to_account_info(),
            ),
            amount
        ));

        let borrowing_profile = &mut ctx.accounts.sundial_profile;
        log_then_prop_err!(update_or_insert(
            &mut borrowing_profile.collaterals,
            |c| c.sundial_collateral == ctx.accounts.sundial_collateral.key(),
            |c| c.collateral_asset.add_amount(amount),
            || SundialProfileCollateral::init_collateral(
                amount,
                &ctx.accounts.sundial_collateral,
                &ctx.accounts.clock
            )
        ));
        Ok(())
    }

    #[access_control(ctx.accounts.check_sundial_profile_stale())]
    pub fn withdraw_sundial_collateral(
        ctx: Context<WithdrawSundialCollateral>,
        amount: u64,
    ) -> ProgramResult {
        log_then_prop_err!(transfer(
            create_transfer_cpi(
                ctx.accounts
                    .sundial_collateral_port_lp_wallet
                    .to_account_info(),
                ctx.accounts.user_port_lp_wallet.to_account_info(),
                ctx.accounts.sundial_collateral_authority.to_account_info(),
                seeds!(ctx, sundial_collateral, authority),
                ctx.accounts.token_program.to_account_info(),
            ),
            amount
        ));

        let borrowing_profile = &mut ctx.accounts.sundial_profile;
        let reserve_pubkey = ctx.accounts.sundial_collateral.port_collateral_reserve;

        let collateral = vipers::unwrap_opt!(
            borrowing_profile
                .collaterals
                .iter_mut()
                .find(|c| c.sundial_collateral == reserve_pubkey),
            SundialError::WithdrawTooMuchCollateral,
            "You don't have that asset as collateral"
        );

        log_then_prop_err!(
            collateral.collateral_asset.reduce_amount(amount),
            SundialError::WithdrawTooMuchCollateral,
            "You are trying to withdraw more than you have"
        );

        borrowing_profile.check_enough_borrowing_power(
            SundialError::WithdrawTooMuchCollateral,
            "Withdraw too much, you don't have enough borrowing power",
        )?;
        Ok(())
    }

    #[access_control(ctx.accounts.check_sundial_profile_stale())]
    pub fn mint_sundial_liquidity<'info>(
        ctx: Context<'_, '_, '_, 'info, MintSundialLiquidityWithCollateral<'info>>,
        amount: u64,
    ) -> ProgramResult {
        log_then_prop_err!(mint_to(
            create_mint_to_cpi(
                ctx.accounts.sundial_principle_mint.to_account_info(),
                ctx.accounts.user_principle_wallet.to_account_info(),
                ctx.accounts.sundial_authority.to_account_info(),
                seeds!(ctx, sundial, authority),
                ctx.accounts.token_program.to_account_info()
            ),
            amount
        ));

        let borrowing_profile = &mut ctx.accounts.sundial_profile;
        let loan_mint = ctx.accounts.sundial_principle_mint.key();
        log_then_prop_err!(update_or_insert(
            &mut borrowing_profile.loans,
            |l| l.mint_pubkey == loan_mint,
            |l| l.minted_asset.add_amount(amount),
            || {
                let reserve_info = unwrap_opt!(
                    ctx.remaining_accounts.get(0),
                    SundialError::ReserveNeeded,
                    "Reserve should be passed in when you first mint this asset"
                );
                let oracle_info = unwrap_opt!(
                    ctx.remaining_accounts.get(1),
                    SundialError::OracleNeeded,
                    "Oracle should be passed in when you first mint this asset"
                );
                vipers::assert_keys_eq!(
                    reserve_info.key,
                    ctx.accounts.sundial.reserve,
                    "Invalid Reserve"
                );
                vipers::assert_keys_eq!(
                    oracle_info.key,
                    reserve_oracle_pubkey(reserve_info)?,
                    "Invalid Oracle"
                );

                SundialProfileLoan::init_loan(
                    amount,
                    oracle_info,
                    ctx.accounts.sundial_principle_mint.key(),
                    &ctx.accounts.clock,
                    ctx.accounts.sundial.end_unix_time_stamp,
                )
            }
        ));

        borrowing_profile.check_enough_borrowing_power(
            SundialError::InvalidMintAmount,
            "Mint too much, you don't have enough borrowing power",
        )?;
        Ok(())
    }

    pub fn repay_sundial_liquidity(
        ctx: Context<RepaySundialLiquidity>,
        max_repay_amount: u64,
    ) -> ProgramResult {
        let corresponded_principle_mint = log_then_prop_err!(Pubkey::create_program_address(
            &[&ctx.accounts.sundial.token_program.key().to_bytes(), b"lp"],
            ctx.program_id
        ));
        let borrowing_profile = &mut ctx.accounts.sundial_profile;
        let loan = vipers::unwrap_opt!(
            borrowing_profile
                .loans
                .iter_mut()
                .find(|c| c.mint_pubkey == corresponded_principle_mint),
            SundialError::RepayTooMuchLoan,
            "You don't have that asset as loan"
        );

        let repay_amount = min(loan.minted_asset.amount, max_repay_amount);
        log_then_prop_err!(
            loan.minted_asset.reduce_amount(repay_amount),
            SundialError::RepayTooMuchLoan,
            "Repay too much, you don't have that much of loan"
        );

        log_then_prop_err!(transfer(
            create_transfer_cpi(
                ctx.accounts.user_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_liquidity_wallet.to_account_info(),
                ctx.accounts.transfer_authority.to_account_info(),
                &[],
                ctx.accounts.token_program.to_account_info(),
            ),
            max_repay_amount
        ));

        Ok(())
    }

    #[access_control(ctx.accounts.check_sundial_profile_stale())]
    pub fn liquidate_sundial_profile(
        ctx: Context<LiquidateSundialProfile>,
        withdraw_collateral_reserve: Pubkey,
    ) -> ProgramResult {
        let user_wallet = &ctx.accounts.user_repay_liquidity_wallet;
        let borrowing_profile = &mut ctx.accounts.sundial_profile;

        let current_ts = ctx.accounts.clock.unix_timestamp;
        let no_overtime_loans = !borrowing_profile
            .loans
            .iter()
            .any(|l| l.is_overtime(current_ts));

        let max_repay_amount = if user_wallet
            .delegate
            .map_or(false, |d| d == ctx.accounts.user_authority.key())
        {
            user_wallet.delegated_amount
        } else {
            user_wallet.amount
        };

        let corresponded_principle_mint = log_then_prop_err!(Pubkey::create_program_address(
            &[&ctx.accounts.sundial.token_program.key().to_bytes(), b"lp"],
            ctx.program_id
        ));
        let (collaterals, loans) = borrowing_profile.get_mut_collaterals_and_loans();
        let repay_loan = vipers::unwrap_opt!(
            loans
                .iter_mut()
                .find(|l| l.mint_pubkey == corresponded_principle_mint),
            SundialError::InvalidLiquidation,
            "This profile doesn't have this loan asset"
        );

        let withdraw_collateral = vipers::unwrap_opt!(
            collaterals
                .iter_mut()
                .find(|c| c.sundial_collateral == withdraw_collateral_reserve),
            SundialError::InvalidLiquidation,
            "Withdraw collateral doesn't exist"
        );

        let repay_amount = min(max_repay_amount, repay_loan.minted_asset.amount);
        let repay_value = log_then_prop_err!(repay_loan.minted_asset.get_value(repay_amount));
        let withdraw_value = log_then_prop_err!(withdraw_collateral
            .config
            .liquidation_config
            .get_liquidation_value(repay_value));

        log_then_prop_err!(repay_loan.minted_asset.reduce_value(repay_value));
        log_then_prop_err!(withdraw_collateral
            .collateral_asset
            .reduce_value(withdraw_value));

        vipers::invariant!(
            no_overtime_loans || repay_loan.is_overtime(current_ts),
            SundialError::InvalidLiquidation,
            "Should liquidate overtime loans first"
        );

        if !repay_loan.is_overtime(current_ts) {
            log_then_prop_err!(borrowing_profile.check_enough_borrowing_power(
                SundialError::InvalidLiquidation,
                "Cannot be liquidated, enough margin still"
            ));
        }

        log_then_prop_err!(transfer(
            create_transfer_cpi(
                ctx.accounts.user_repay_liquidity_wallet.to_account_info(),
                ctx.accounts.sundial_liquidity_wallet.to_account_info(),
                ctx.accounts.user_authority.to_account_info(),
                &[],
                ctx.accounts.token_program.to_account_info(),
            ),
            repay_amount
        ));

        Ok(())
    }

    pub fn create_and_init_sundial_profile(
        ctx: Context<CreateAndInitSundialProfile>,
        sundial_owner: Pubkey,
        _bump: u8,
    ) -> ProgramResult {
        let profile = &mut ctx.accounts.sundial_profile;
        profile.user = ctx.accounts.user.key();
        profile.sundial_owner = sundial_owner;
        Ok(())
    }

    pub fn refresh_sundial_borrowing(ctx: Context<RefreshSundialCollateral>) -> ProgramResult {
        let sundial_borrowing = &mut ctx.accounts.sundial_collateral;
        let reserve = &ctx.accounts.port_collateral_reserve;
        let liquidity_price = reserve.liquidity.market_price;
        let exchange_rate = log_then_prop_err!(reserve.collateral_exchange_rate());
        sundial_borrowing.port_lp_price =
            log_then_prop_err!(exchange_rate.decimal_liquidity_to_collateral(liquidity_price))
                .0
                 .0;
        sundial_borrowing.last_update = ctx.accounts.clock.slot.into();
        Ok(())
    }

    pub fn change_borrowing_config(
        ctx: Context<ChangeCollateralConfig>,
        config: SundialCollateralInitConfigParams,
    ) -> ProgramResult {
        ctx.accounts.sundial_collateral.sundial_collateral_config = config.into();
        Ok(())
    }

    pub fn change_sundial_config(
        ctx: Context<ChangeSundialConfig>,
        config: SundialInitConfigParams,
    ) -> ProgramResult {
        ctx.accounts.sundial.config = config.into();
        Ok(())
    }
}
