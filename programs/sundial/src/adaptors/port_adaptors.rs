// TODO: use the published crate instead of this.

use std::io::Write;
use std::ops::Deref;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Slot;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::CpiContext;
use port_staking_instructions::instruction::{
    claim_reward as port_claim_reward, create_stake_account as create_port_stake_account,
    deposit as port_staking_deposit, init_staking_pool as init_port_staking_pool,
    withdraw as port_staking_withdraw,
};
use port_staking_instructions::state::StakeAccount;
use port_variable_rate_lending_instructions::id as port_lending_id;
use port_variable_rate_lending_instructions::instruction::{
    deposit_reserve_liquidity, borrow_obligation_liquidity, deposit_reserve_liquidity_and_obligation_collateral,
    redeem_reserve_collateral, refresh_obligation, refresh_reserve, repay_obligation_liquidity,
    withdraw_obligation_collateral, LendingInstruction,
};
use port_variable_rate_lending_instructions::state::Obligation;

use crate::error::PoleError;

pub fn init_obligation<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, InitObligation<'info>>,
) -> ProgramResult {
    let ix = Instruction {
        program_id: port_lending_id(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.obligation.key(), false),
            AccountMeta::new_readonly(ctx.accounts.lending_market.key(), false),
            AccountMeta::new_readonly(ctx.accounts.obligation_owner.key(), true),
            AccountMeta::new_readonly(ctx.accounts.clock.key(), false),
            AccountMeta::new_readonly(ctx.accounts.rent.key(), false),
            AccountMeta::new_readonly(ctx.accounts.spl_token_id.key(), false),
        ],
        data: LendingInstruction::InitObligation.pack(),
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.obligation,
            ctx.accounts.lending_market,
            ctx.accounts.obligation_owner,
            ctx.accounts.clock,
            ctx.accounts.rent,
            ctx.accounts.spl_token_id,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts)]
pub struct InitObligation<'info> {
    pub obligation: AccountInfo<'info>,
    pub lending_market: AccountInfo<'info>,
    pub obligation_owner: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
    pub rent: AccountInfo<'info>,
    pub spl_token_id: AccountInfo<'info>,
}

pub fn deposit_reserve<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, Deposit<'info>>,
    amount: u64,
) -> ProgramResult {
    let ix = deposit_reserve_liquidity(
        port_variable_rate_lending_instructions::id(),
        amount,
        ctx.accounts.source_liquidity.key(),
        ctx.accounts.destination_collateral.key(),
        ctx.accounts.reserve.key(),
        ctx.accounts.reserve_liquidity_supply.key(),
        ctx.accounts.reserve_collateral_mint.key(),
        ctx.accounts.lending_market.key(),
        ctx.accounts.transfer_authority.key(),
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.source_liquidity,
            ctx.accounts.destination_collateral,
            ctx.accounts.reserve,
            ctx.accounts.reserve_liquidity_supply,
            ctx.accounts.reserve_collateral_mint,
            ctx.accounts.lending_market,
            ctx.accounts.transfer_authority,
            ctx.accounts.lending_market_authority,
            ctx.accounts.clock,
            ctx.accounts.token_program,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub source_liquidity: AccountInfo<'info>,
    pub destination_collateral: AccountInfo<'info>,
    pub reserve: AccountInfo<'info>,
    pub reserve_liquidity_supply: AccountInfo<'info>,
    pub reserve_collateral_mint: AccountInfo<'info>,
    pub lending_market: AccountInfo<'info>,
    pub lending_market_authority: AccountInfo<'info>,
    pub transfer_authority: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}

pub fn deposit_and_collateralize<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, DepositAndCollateralize<'info>>,
    amount: u64,
) -> ProgramResult {
    let ix = deposit_reserve_liquidity_and_obligation_collateral(
        port_variable_rate_lending_instructions::id(),
        amount,
        ctx.accounts.source_liquidity.key(),
        ctx.accounts.user_collateral.key(),
        ctx.accounts.reserve.key(),
        ctx.accounts.reserve_liquidity_supply.key(),
        ctx.accounts.reserve_collateral_mint.key(),
        ctx.accounts.lending_market.key(),
        ctx.accounts.destination_collateral.key(),
        ctx.accounts.obligation.key(),
        ctx.accounts.obligation_owner.key(),
        ctx.accounts.transfer_authority.key(),
        Some(ctx.accounts.stake_account.key()),
        Some(ctx.accounts.staking_pool.key()),
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.source_liquidity,
            ctx.accounts.user_collateral,
            ctx.accounts.reserve,
            ctx.accounts.reserve_liquidity_supply,
            ctx.accounts.reserve_collateral_mint,
            ctx.accounts.lending_market,
            ctx.accounts.lending_market_authority,
            ctx.accounts.destination_collateral,
            ctx.accounts.obligation,
            ctx.accounts.obligation_owner,
            ctx.accounts.transfer_authority,
            ctx.accounts.clock,
            ctx.accounts.token_program,
            ctx.accounts.stake_account,
            ctx.accounts.staking_pool,
            ctx.accounts.port_staking_program,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts)]
pub struct DepositAndCollateralize<'info> {
    pub source_liquidity: AccountInfo<'info>,
    pub user_collateral: AccountInfo<'info>,
    pub reserve: AccountInfo<'info>,
    pub reserve_liquidity_supply: AccountInfo<'info>,
    pub reserve_collateral_mint: AccountInfo<'info>,
    pub lending_market: AccountInfo<'info>,
    pub lending_market_authority: AccountInfo<'info>,
    pub destination_collateral: AccountInfo<'info>,
    pub obligation: AccountInfo<'info>,
    pub obligation_owner: AccountInfo<'info>,
    pub stake_account: AccountInfo<'info>,
    pub staking_pool: AccountInfo<'info>,
    pub transfer_authority: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub port_staking_program: AccountInfo<'info>,
}

pub fn borrow<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, Borrow<'info>>,
    amount: u64,
) -> ProgramResult {
    let ix = borrow_obligation_liquidity(
        port_variable_rate_lending_instructions::id(),
        amount,
        ctx.accounts.source_liquidity.key(),
        ctx.accounts.destination_liquidity.key(),
        ctx.accounts.reserve.key(),
        ctx.accounts.reserve_fee_receiver.key(),
        ctx.accounts.obligation.key(),
        ctx.accounts.lending_market.key(),
        ctx.accounts.obligation_owner.key(),
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.source_liquidity,
            ctx.accounts.destination_liquidity,
            ctx.accounts.reserve,
            ctx.accounts.reserve_fee_receiver,
            ctx.accounts.obligation,
            ctx.accounts.lending_market,
            ctx.accounts.lending_market_authority,
            ctx.accounts.obligation_owner,
            ctx.accounts.clock,
            ctx.accounts.token_program,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    pub source_liquidity: AccountInfo<'info>,
    pub destination_liquidity: AccountInfo<'info>,
    pub reserve: AccountInfo<'info>,
    pub reserve_fee_receiver: AccountInfo<'info>,
    pub lending_market: AccountInfo<'info>,
    pub lending_market_authority: AccountInfo<'info>,
    pub obligation: AccountInfo<'info>,
    pub obligation_owner: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}

pub fn repay<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, Repay<'info>>,
    amount: u64,
) -> ProgramResult {
    let ix = repay_obligation_liquidity(
        port_variable_rate_lending_instructions::id(),
        amount,
        ctx.accounts.source_liquidity.key(),
        ctx.accounts.destination_liquidity.key(),
        ctx.accounts.reserve.key(),
        ctx.accounts.obligation.key(),
        ctx.accounts.lending_market.key(),
        ctx.accounts.transfer_authority.key(),
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.source_liquidity,
            ctx.accounts.destination_liquidity,
            ctx.accounts.reserve,
            ctx.accounts.obligation,
            ctx.accounts.lending_market,
            ctx.accounts.transfer_authority,
            ctx.accounts.clock,
            ctx.accounts.token_program,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts)]
pub struct Repay<'info> {
    pub source_liquidity: AccountInfo<'info>,
    pub destination_liquidity: AccountInfo<'info>,
    pub reserve: AccountInfo<'info>,
    pub obligation: AccountInfo<'info>,
    pub lending_market: AccountInfo<'info>,
    pub transfer_authority: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}

pub fn withdraw<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, Withdraw<'info>>,
    amount: u64,
) -> ProgramResult {
    let ix = withdraw_obligation_collateral(
        port_variable_rate_lending_instructions::id(),
        amount,
        ctx.accounts.source_collateral.key(),
        ctx.accounts.destination_collateral.key(),
        ctx.accounts.reserve.key(),
        ctx.accounts.obligation.key(),
        ctx.accounts.lending_market.key(),
        ctx.accounts.obligation_owner.key(),
        Some(ctx.accounts.stake_account.key()),
        Some(ctx.accounts.staking_pool.key()),
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.source_collateral,
            ctx.accounts.destination_collateral,
            ctx.accounts.reserve,
            ctx.accounts.obligation,
            ctx.accounts.lending_market,
            ctx.accounts.lending_market_authority,
            ctx.accounts.obligation_owner,
            ctx.accounts.clock,
            ctx.accounts.token_program,
            ctx.accounts.stake_account,
            ctx.accounts.staking_pool,
            ctx.accounts.port_staking_program,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub source_collateral: AccountInfo<'info>,
    pub destination_collateral: AccountInfo<'info>,
    pub reserve: AccountInfo<'info>,
    pub obligation: AccountInfo<'info>,
    pub lending_market: AccountInfo<'info>,
    pub lending_market_authority: AccountInfo<'info>,
    pub stake_account: AccountInfo<'info>,
    pub staking_pool: AccountInfo<'info>,
    pub obligation_owner: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub port_staking_program: AccountInfo<'info>,
}

pub fn redeem<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, Redeem<'info>>,
    amount: u64,
) -> ProgramResult {
    let ix = redeem_reserve_collateral(
        port_variable_rate_lending_instructions::id(),
        amount,
        ctx.accounts.source_collateral.key(),
        ctx.accounts.destination_liquidity.key(),
        ctx.accounts.reserve.key(),
        ctx.accounts.reserve_collateral_mint.key(),
        ctx.accounts.reserve_liquidity_supply.key(),
        ctx.accounts.lending_market.key(),
        ctx.accounts.transfer_authority.key(),
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.source_collateral,
            ctx.accounts.destination_liquidity,
            ctx.accounts.reserve,
            ctx.accounts.reserve_collateral_mint,
            ctx.accounts.reserve_liquidity_supply,
            ctx.accounts.lending_market,
            ctx.accounts.lending_market_authority,
            ctx.accounts.transfer_authority,
            ctx.accounts.clock,
            ctx.accounts.token_program,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub source_collateral: AccountInfo<'info>,
    pub destination_liquidity: AccountInfo<'info>,
    pub reserve: AccountInfo<'info>,
    pub reserve_collateral_mint: AccountInfo<'info>,
    pub reserve_liquidity_supply: AccountInfo<'info>,
    pub lending_market: AccountInfo<'info>,
    pub lending_market_authority: AccountInfo<'info>,
    pub transfer_authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
}

pub fn refresh_port_reserve<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, RefreshReserve<'info>>,
) -> ProgramResult {
    let oracle = ctx.remaining_accounts;
    let ix = refresh_reserve(
        port_variable_rate_lending_instructions::id(),
        ctx.accounts.reserve.key(),
        oracle
            .first()
            .map_or(COption::None, |k| COption::Some(k.key())),
    );
    let mut accounts = vec![ctx.accounts.reserve, ctx.accounts.clock, ctx.program];
    accounts.extend(oracle.into_iter().next());
    invoke(&ix, &accounts)
}

#[derive(Accounts)]
pub struct RefreshReserve<'info> {
    pub reserve: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
}

pub fn refresh_port_obligation<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, RefreshObligation<'info>>,
) -> ProgramResult {
    let reserves = ctx.remaining_accounts;
    let ix = refresh_obligation(
        port_variable_rate_lending_instructions::id(),
        ctx.accounts.obligation.key(),
        reserves.iter().map(|info| info.key()).collect(),
    );
    let mut account_infos = vec![ctx.accounts.obligation, ctx.accounts.clock];
    account_infos.extend(reserves);
    account_infos.push(ctx.program);
    invoke(&ix, &account_infos)
}

#[derive(Accounts)]
pub struct RefreshObligation<'info> {
    pub obligation: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
}

pub fn claim_reward<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, ClaimReward<'info>>,
) -> ProgramResult {
    let ix = port_claim_reward(
        port_staking_instructions::id(),
        ctx.accounts.stake_account_owner.key(),
        ctx.accounts.stake_account.key(),
        ctx.accounts.staking_pool.key(),
        ctx.accounts.reward_token_pool.key(),
        ctx.accounts.reward_dest.key(),
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.stake_account_owner,
            ctx.accounts.stake_account,
            ctx.accounts.staking_pool,
            ctx.accounts.reward_token_pool,
            ctx.accounts.reward_dest,
            ctx.accounts.staking_program_authority,
            ctx.accounts.clock,
            ctx.accounts.token_program,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts, Clone)]
pub struct ClaimReward<'info> {
    pub stake_account_owner: AccountInfo<'info>,
    pub stake_account: AccountInfo<'info>,
    pub staking_pool: AccountInfo<'info>,
    pub reward_token_pool: AccountInfo<'info>,
    pub reward_dest: AccountInfo<'info>,
    pub staking_program_authority: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}

pub fn create_port_staking_pool<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, CreateStakingPoolContext<'info>>,
    supply: u64,
    duration: u64,
    earliest_reward_claim_time: Slot,
) -> ProgramResult {
    let ix = init_port_staking_pool(
        port_staking_instructions::id(),
        supply,
        duration,
        earliest_reward_claim_time,
        ctx.accounts.transfer_authority.key(),
        ctx.accounts.reward_token_supply.key(),
        ctx.accounts.reward_token_pool.key(),
        ctx.accounts.staking_pool.key(),
        ctx.accounts.reward_token_mint.key(),
        ctx.accounts.staking_pool_owner.key(),
        ctx.accounts.admin.key(),
    );

    invoke_signed(
        &ix,
        &[
            ctx.accounts.transfer_authority,
            ctx.accounts.reward_token_supply,
            ctx.accounts.reward_token_pool,
            ctx.accounts.staking_pool,
            ctx.accounts.reward_token_mint,
            ctx.accounts.staking_program_derived,
            ctx.accounts.rent,
            ctx.accounts.token_program,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts, Clone)]
pub struct CreateStakingPoolContext<'info> {
    pub staking_pool: AccountInfo<'info>,
    pub transfer_authority: AccountInfo<'info>,
    pub reward_token_supply: AccountInfo<'info>,
    pub reward_token_pool: AccountInfo<'info>,
    pub reward_token_mint: AccountInfo<'info>,
    pub staking_pool_owner: AccountInfo<'info>,
    pub admin: AccountInfo<'info>,
    pub staking_program_derived: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub rent: AccountInfo<'info>,
}

pub fn create_stake_account<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, CreateStakeAccount<'info>>,
) -> ProgramResult {
    let ix = create_port_stake_account(
        port_staking_instructions::id(),
        ctx.accounts.stake_account.key(),
        ctx.accounts.staking_pool.key(),
        ctx.accounts.owner.key(),
    );
    invoke_signed(
        &ix,
        &[
            ctx.accounts.stake_account,
            ctx.accounts.staking_pool,
            ctx.accounts.owner,
            ctx.accounts.rent,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts, Clone)]
pub struct CreateStakeAccount<'info> {
    pub staking_pool: AccountInfo<'info>,
    pub stake_account: AccountInfo<'info>,
    pub owner: AccountInfo<'info>,
    pub rent: AccountInfo<'info>,
}

pub fn port_stake<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, PortStake<'info>>,
    amount: u64,
) -> ProgramResult {
    let ix = port_staking_deposit(
        port_staking_instructions::id(),
        amount,
        ctx.accounts.authority.key(),
        ctx.accounts.stake_account.key(),
        ctx.accounts.staking_pool.key(),
    );
    invoke_signed(
        &ix,
        &[
            ctx.accounts.stake_account,
            ctx.accounts.staking_pool,
            ctx.accounts.authority,
            ctx.accounts.clock,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts, Clone)]
pub struct PortStake<'info> {
    pub staking_pool: AccountInfo<'info>,
    pub stake_account: AccountInfo<'info>,
    pub authority: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
}

pub fn port_unstake<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, PortUnstake<'info>>,
    amount: u64,
) -> ProgramResult {
    let ix = port_staking_withdraw(
        port_staking_instructions::id(),
        amount,
        ctx.accounts.authority.key(),
        ctx.accounts.stake_account.key(),
        ctx.accounts.staking_pool.key(),
    );
    invoke_signed(
        &ix,
        &[
            ctx.accounts.stake_account,
            ctx.accounts.staking_pool,
            ctx.accounts.authority,
            ctx.accounts.clock,
            ctx.program,
        ],
        ctx.signer_seeds,
    )
}

#[derive(Accounts, Clone)]
pub struct PortUnstake<'info> {
    pub staking_pool: AccountInfo<'info>,
    pub stake_account: AccountInfo<'info>,
    pub authority: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
}

pub mod port_accessor {
    use std::convert::TryFrom;

    use anchor_lang::solana_program::pubkey::PUBKEY_BYTES;
    use port_variable_rate_lending_instructions::math::{Rate as PortRate, U128};
    use port_variable_rate_lending_instructions::state::{
        CollateralExchangeRate, INITIAL_COLLATERAL_RATE, OBLIGATION_COLLATERAL_LEN,
        OBLIGATION_LIQUIDITY_LEN,
    };

    use crate::math::{Decimal, Rate, TryAdd, TryDiv, TrySub};

    use super::*;

    fn unpack_decimal(src: &[u8; 16]) -> Decimal {
        Decimal::from_scaled_val(u128::from_le_bytes(*src))
    }

    pub fn reserve_ltv(account: &AccountInfo) -> Result<u8, ProgramError> {
        let bytes = account.try_borrow_data()?;
        let mut amount_bytes = [0u8; 1];
        amount_bytes.copy_from_slice(&bytes[304..305]);
        Ok(u8::from_le_bytes(amount_bytes))
    }

    pub fn reserve_available_liquidity(account: &AccountInfo) -> Result<u64, ProgramError> {
        let bytes = account.try_borrow_data()?;
        let mut amount_bytes = [0u8; 8];
        amount_bytes.copy_from_slice(&bytes[175..183]);
        Ok(u64::from_le_bytes(amount_bytes))
    }

    pub fn reserve_borrowed_amount(account: &AccountInfo) -> Result<Decimal, ProgramError> {
        let bytes = account.try_borrow_data()?;
        let mut amount_bytes = [0u8; 16];
        amount_bytes.copy_from_slice(&bytes[183..199]);
        Ok(unpack_decimal(&amount_bytes))
    }

    pub fn reserve_market_price(account: &AccountInfo) -> Result<Decimal, ProgramError> {
        let bytes = account.try_borrow_data()?;
        let mut amount_bytes = [0u8; 16];
        amount_bytes.copy_from_slice(&bytes[215..231]);
        Ok(unpack_decimal(&amount_bytes))
    }

    pub fn reserve_oracle_pubkey(account: &AccountInfo) -> Result<Pubkey, ProgramError> {
        let bytes = account.try_borrow_data()?;
        let mut amount_bytes = [0u8; 32];
        amount_bytes.copy_from_slice(&bytes[143..175]);
        Ok(Pubkey::new_from_array(amount_bytes))
    }

    pub fn reserve_total_liquidity(account: &AccountInfo) -> Result<Decimal, ProgramError> {
        let available_liquidity = reserve_available_liquidity(account)?;
        let borrowed_amount = reserve_borrowed_amount(account)?;
        borrowed_amount.try_add(Decimal::from(available_liquidity))
    }

    pub fn reserve_mint_total(account: &AccountInfo) -> Result<u64, ProgramError> {
        let bytes = account.try_borrow_data()?;
        let mut amount_bytes = [0u8; 8];
        amount_bytes.copy_from_slice(&bytes[263..271]);
        Ok(u64::from_le_bytes(amount_bytes))
    }

    pub fn exchange_rate(account: &AccountInfo) -> Result<CollateralExchangeRate, ProgramError> {
        let mint_total_supply = reserve_mint_total(account)?;
        let total_liquidity = reserve_total_liquidity(account)?;
        let rate = if mint_total_supply == 0 || total_liquidity == Decimal::zero() {
            Rate::from_scaled_val(INITIAL_COLLATERAL_RATE)
        } else {
            let mint_total_supply = Decimal::from(mint_total_supply);
            Rate::try_from(mint_total_supply.try_div(total_liquidity)?)?
        };
        let port_rate = PortRate(U128::from(rate.to_scaled_val()));
        Ok(CollateralExchangeRate(port_rate))
    }

    pub fn obligation_deposits_count(account: &AccountInfo) -> Result<u8, ProgramError> {
        let bytes = account.try_borrow_data()?;
        Ok(bytes[138])
    }

    pub fn obligation_borrows_count(account: &AccountInfo) -> Result<u8, ProgramError> {
        let bytes = account.try_borrow_data()?;
        Ok(bytes[139])
    }

    pub fn obligation_borrow_amount_wads(
        account: &AccountInfo,
        n: u8,
    ) -> Result<Decimal, ProgramError> {
        let bytes = account.try_borrow_data()?;
        let deposit_lens = obligation_deposits_count(account)?;
        let borrows_lens = obligation_borrows_count(account)?;
        if n >= borrows_lens {
            msg!("No enough borrows");
            return Err(PoleError::InvalidPortObligationLiquidity.into());
        }
        let mut amount_bytes = [0u8; 16];
        let start_index = 140
            + (deposit_lens as usize) * OBLIGATION_COLLATERAL_LEN
            + n as usize * OBLIGATION_LIQUIDITY_LEN
            + PUBKEY_BYTES
            + 16;
        amount_bytes.copy_from_slice(&bytes[start_index..(start_index + 16)]);
        Ok(unpack_decimal(&amount_bytes))
    }

    pub fn obligation_deposit_amount(account: &AccountInfo, n: u8) -> Result<u64, ProgramError> {
        let bytes = account.try_borrow_data()?;
        let deposit_lens = obligation_deposits_count(account)?;
        if n >= deposit_lens {
            msg!("No enough deposits");
            return Err(PoleError::InvalidPortObligationCollaterals.into());
        }
        let mut amount_bytes = [0u8; 8];
        let start_index = 140 + n as usize * OBLIGATION_COLLATERAL_LEN + PUBKEY_BYTES;

        amount_bytes.copy_from_slice(&bytes[start_index..(start_index + 8)]);
        Ok(u64::from_le_bytes(amount_bytes))
    }
    pub fn obligation_liquidity(
        account: &AccountInfo,
        port_exchange_rate: &CollateralExchangeRate,
        deposit_index: u8,
        borrow_index: u8,
    ) -> Result<Decimal, ProgramError> {
        let deposit = if obligation_deposits_count(account)? == 0 {
            0u64
        } else {
            port_exchange_rate
                .collateral_to_liquidity(obligation_deposit_amount(account, deposit_index)?)?
        };
        let borrow = if obligation_borrows_count(account)? == 0 {
            Decimal::zero()
        } else {
            obligation_borrow_amount_wads(account, borrow_index)?
        };
        Decimal::from(deposit).try_sub(borrow)
    }
}
#[derive(Clone)]
pub struct PortStakeAccount(StakeAccount);

impl PortStakeAccount {
    pub const LEN: usize = StakeAccount::LEN;
}

impl anchor_lang::AccountDeserialize for PortStakeAccount {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self, ProgramError> {
        PortStakeAccount::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self, ProgramError> {
        StakeAccount::unpack(buf).map(PortStakeAccount)
    }
}

impl anchor_lang::AccountSerialize for PortStakeAccount {
    fn try_serialize<W: Write>(&self, _writer: &mut W) -> Result<(), ProgramError> {
        // no-op
        Ok(())
    }
}

impl anchor_lang::Owner for PortStakeAccount {
    fn owner() -> Pubkey {
        port_staking_instructions::id()
    }
}

impl Deref for PortStakeAccount {
    type Target = StakeAccount;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Clone)]
pub struct PortObligation(Obligation);

impl PortObligation {
    pub const LEN: usize = Obligation::LEN;
    pub fn calculate_liquidity(&self, reserve_pubkey: &Pubkey) -> Result<u64, ProgramError> {
        let borrow = self
            .borrows
            .iter()
            .find_map(|b| {
                if b.borrow_reserve == *reserve_pubkey {
                    Some(b.borrowed_amount_wads)
                } else {
                    None
                }
            })
            .unwrap_or_else(port_variable_rate_lending_instructions::math::Decimal::zero);
        let deposit = self
            .deposits
            .iter()
            .find_map(|b| {
                if b.deposit_reserve == *reserve_pubkey {
                    Some(b.deposited_amount)
                } else {
                    None
                }
            })
            .ok_or(PoleError::InvalidPortObligationCollaterals)?;
        Ok(deposit - borrow.try_ceil_u64()?)
    }
}

impl anchor_lang::AccountDeserialize for PortObligation {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self, ProgramError> {
        PortObligation::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self, ProgramError> {
        Obligation::unpack(buf).map(PortObligation)
    }
}

impl anchor_lang::AccountSerialize for PortObligation {
    fn try_serialize<W: Write>(&self, _writer: &mut W) -> Result<(), ProgramError> {
        // no-op
        Ok(())
    }
}

impl anchor_lang::Owner for PortObligation {
    fn owner() -> Pubkey {
        port_variable_rate_lending_instructions::id()
    }
}

impl Deref for PortObligation {
    type Target = Obligation;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
