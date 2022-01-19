use crate::error::SundialError;
use crate::helpers::{
    CheckSundialMarketOwner, CheckSundialOwner, CheckSundialProfileMarket, CheckSundialProfileStale,
};
use crate::state::{
    LiquidationConfig, LiquidityCap, Sundial, SundialCollateral, SundialCollateralBumps,
    SundialCollateralConfig, SundialMarket, SundialProfile, LTV,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use port_anchor_adaptor::PortReserve;
use sundial_derives::{
    validates, CheckSundialMarketOwner, CheckSundialOwner, CheckSundialProfileMarket,
    CheckSundialProfileStale,
};

#[validates(check_sundial_market_owner)]
#[derive(Accounts, Clone, CheckSundialMarketOwner)]
#[instruction(bumps: SundialCollateralBumps, config: SundialCollateralConfigParams)]
pub struct InitializeSundialCollateral<'info> {
    #[account(init, payer=owner)]
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(seeds=[sundial_collateral.key().as_ref(), b"authority"], bump=bumps.authority_bump)]
    pub sundial_collateral_authority: UncheckedAccount<'info>,
    #[account(init, payer=owner, seeds = [sundial_collateral.key().as_ref(), b"lp"], bump = bumps.port_lp_bump, token::authority=sundial_collateral_authority, token::mint=port_lp_mint)]
    pub sundial_collateral_wallet: Box<Account<'info, TokenAccount>>, //Port Lp token Account
    pub port_collateral_reserve: Box<Account<'info, PortReserve>>,
    #[account(address = port_collateral_reserve.collateral.mint_pubkey)]
    pub port_lp_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub sundial_market: Box<Account<'info, SundialMarket>>,
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct SundialCollateralConfigParams {
    /// Loan to value ratio in percentage.
    pub ltv: u8,
    /// TODO: docs
    pub liquidation_threshold: u8,
    /// TODO: docs
    pub liquidation_penalty: u8,
    /// TODO: docs
    pub liquidity_cap: u64,
}

impl From<SundialCollateralConfigParams> for SundialCollateralConfig {
    fn from(config: SundialCollateralConfigParams) -> Self {
        SundialCollateralConfig {
            ltv: LTV { ltv: config.ltv },
            liquidation_config: LiquidationConfig {
                liquidation_threshold: config.liquidation_threshold,
                liquidation_penalty: config.liquidation_penalty,
            },
            liquidity_cap: LiquidityCap {
                lamports: config.liquidity_cap,
            },
        }
    }
}

#[derive(Accounts, Clone)]
#[instruction()]
pub struct RefreshSundialCollateral<'info> {
    #[account(mut, has_one = port_collateral_reserve @ SundialError::InvalidPortReserve)]
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(constraint = !port_collateral_reserve.last_update.stale @ SundialError::ReserveIsNotRefreshed)]
    pub port_collateral_reserve: Account<'info, PortReserve>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts, Clone)]
#[instruction()]
pub struct RefreshSundialProfile<'info> {
    #[account(mut)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    pub clock: Sysvar<'info, Clock>,
    // optional [SundialCollateral] and oracles
}

#[validates(check_sundial_profile_market)]
#[derive(Accounts, Clone, CheckSundialProfileMarket)]
#[instruction(amount:u64)]
pub struct DepositSundialCollateral<'info> {
    #[account(mut, has_one=user @ SundialError::InvalidProfileUser)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    #[account(has_one=token_program @ SundialError::InvalidTokenProgram)]
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(mut, seeds = [sundial_collateral.key().as_ref(), b"lp"], bump = sundial_collateral.bumps.port_lp_bump)]
    pub sundial_collateral_port_lp_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_port_lp_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub user: Signer<'info>,
    pub transfer_authority: Signer<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[validates(check_sundial_profile_stale, check_sundial_profile_market)]
#[derive(Accounts, Clone, CheckSundialProfileStale, CheckSundialProfileMarket)]
#[instruction(amount:u64)]
pub struct MintSundialLiquidityWithCollateral<'info> {
    #[account(mut, has_one=user @ SundialError::InvalidProfileUser)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>, //refreshed
    #[account(has_one=token_program @ SundialError::InvalidTokenProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub sundial_principle_mint: Account<'info, Mint>,
    #[account(seeds = [sundial.key().as_ref(), b"fee_receiver"], bump = sundial.bumps.fee_receiver_bump)]
    pub fee_receiver_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_principle_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub user: Signer<'info>,
}

#[validates(check_sundial_profile_stale, check_sundial_profile_market)]
#[derive(Accounts, Clone, CheckSundialProfileStale, CheckSundialProfileMarket)]
#[instruction(amount: u64)]
pub struct WithdrawSundialCollateral<'info> {
    #[account(mut, has_one=user @ SundialError::InvalidProfileUser)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>, //refreshed
    #[account(has_one=token_program @ SundialError::InvalidTokenProgram)]
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(seeds=[sundial_collateral.key().as_ref(), b"authority"], bump=sundial_collateral.bumps.authority_bump)]
    pub sundial_collateral_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial_collateral.key().as_ref(), b"lp"], bump = sundial_collateral.bumps.port_lp_bump)]
    pub sundial_collateral_port_lp_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_port_lp_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub user: Signer<'info>,
}

#[validates(check_sundial_profile_market)]
#[derive(Accounts, Clone, CheckSundialProfileMarket)]
#[instruction(amount:u64)]
pub struct RepaySundialLiquidity<'info> {
    #[account(mut, has_one=user @ SundialError::InvalidProfileUser)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    #[account(has_one=token_program @ SundialError::InvalidTokenProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump)]
    pub sundial_liquidity_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_liquidity_wallet: Account<'info, TokenAccount>,
    pub transfer_authority: Signer<'info>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[validates(check_sundial_profile_stale)]
#[derive(Accounts, Clone, CheckSundialProfileStale)]
#[instruction(withdraw_collateral_reserve: Pubkey)]
pub struct LiquidateSundialProfile<'info> {
    #[account(mut)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    #[account(mut)]
    pub user_repay_liquidity_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_withdraw_collateral_wallet: Account<'info, TokenAccount>,
    #[account(has_one=token_program @ SundialError::InvalidTokenProgram)]
    pub sundial: Box<Account<'info, Sundial>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump)]
    pub sundial_liquidity_wallet: Account<'info, TokenAccount>,
    #[account(has_one=token_program @ SundialError::InvalidTokenProgram)]
    pub sundial_collateral: Box<Account<'info, SundialCollateral>>,
    #[account(seeds=[sundial_collateral.key().as_ref(), b"authority"], bump=sundial_collateral.bumps.authority_bump)]
    pub sundial_collateral_authority: UncheckedAccount<'info>,
    #[account(seeds = [sundial_collateral.key().as_ref(), b"lp"], bump = sundial_collateral.bumps.port_lp_bump)]
    pub sundial_collateral_wallet: Box<Account<'info, TokenAccount>>, //Port Lp token Account
    pub transfer_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts, Clone)]
#[instruction(bump: u8, sundial_market: Pubkey)]
pub struct CreateSundialProfile<'info> {
    #[account(init, payer=user, seeds=[user.key().as_ref(), b"profile"], bump=bump)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[validates(check_sundial_owner)]
#[derive(Accounts, Clone, CheckSundialOwner)]
#[instruction(config: SundialCollateralConfigParams)]
pub struct ChangeCollateralConfig<'info> {
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub sundial_market: Box<Account<'info, SundialMarket>>,
}
