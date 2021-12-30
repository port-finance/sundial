use crate::state::{
    LiquidationConfig, LiquidityCap, Sundial, SundialCollateral, SundialCollateralBumps,
    SundialCollateralConfig, SundialProfile, LTV,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use port_anchor_adaptor::{PortLendingMarket, PortReserve};

#[derive(Accounts, Clone)]
#[instruction(bumps: SundialCollateralBumps, config: InitSundialCollateralConfigParams)]
pub struct InitializeSundialCollateral<'info> {
    #[account(init, payer=owner)]
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(seeds=[sundial_collateral.key().as_ref(), b"authority"], bump=bumps.authority_bump)]
    pub sundial_collateral_authority: UncheckedAccount<'info>,
    #[account(init, payer=owner, seeds = [sundial_collateral.key().as_ref(), b"lp"], bump = bumps.port_lp_bump, token::authority=sundial_collateral_authority, token::mint=port_lp_mint)]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,
    #[account(has_one=lending_market)]
    pub port_collateral_reserve: Box<Account<'info, PortReserve>>,
    #[account(has_one=owner)]
    pub lending_market: Box<Account<'info, PortLendingMarket>>,
    #[account(address = port_collateral_reserve.collateral.mint_pubkey)]
    pub port_lp_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, PartialEq, Clone, Default)]
pub struct InitSundialCollateralConfigParams {
    pub ltv: u8,
    pub liquidation_threshold: u8,
    pub liquidation_penalty: u8,
    pub liquidity_cap: u64,
}

impl From<InitSundialCollateralConfigParams> for SundialCollateralConfig {
    fn from(config: InitSundialCollateralConfigParams) -> Self {
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
pub struct RefreshSundialBorrowingProfile<'info> {
    #[account(mut)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    pub clock: Sysvar<'info, Clock>,
}
//optional reserves and oracles

#[derive(Accounts, Clone)]
#[instruction(amount:u64)]
pub struct DepositSundialBorrowingCollateral<'info> {
    #[account(mut, has_one=user)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>, //refreshed
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(mut, seeds = [sundial_collateral.key().as_ref(), b"lp"], bump = sundial_collateral.bumps.port_lp_bump)]
    pub sundial_collateral_port_lp_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_port_lp_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub transfer_authority: Signer<'info>,
    pub user: Signer<'info>,
}

#[derive(Accounts, Clone)]
#[instruction(amount:u64)]
pub struct MintSundialLiquidityWithCollateral<'info> {
    #[account(mut, has_one=user)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub sundial_principle_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_principle_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub user: Signer<'info>,
}

#[derive(Accounts, Clone)]
#[instruction(amount: u64)]
pub struct WithdrawSundialCollateral<'info> {
    #[account(mut, has_one=user)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>, //refreshed
    pub sundial_collateral: Account<'info, SundialCollateral>,
    #[account(seeds=[sundial_collateral.key().as_ref(), b"authority"], bump=sundial_collateral.bumps.authority_bump)]
    pub sundial_collateral_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial_collateral.key().as_ref(), b"lp"], bump = sundial_collateral.bumps.port_lp_bump)]
    pub sundial_collateral_port_lp_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_port_lp_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub user: Signer<'info>,
}

#[derive(Accounts, Clone)]
#[instruction(amount:u64)]
pub struct RepaySundialLiquidity<'info> {
    #[account(mut, has_one=user)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    pub sundial: Account<'info, Sundial>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump)]
    pub sundial_liquidity_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_liquidity_wallet: Account<'info, TokenAccount>,
    pub transfer_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub user: Signer<'info>,
}

#[derive(Accounts, Clone)]
#[instruction(withdraw_collateral_reserve: Pubkey)]
pub struct LiquidateSundialProfile<'info> {
    #[account(mut)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    #[account(mut)]
    pub user_repay_liquidity_wallet: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_withdraw_collateral_wallet: Account<'info, TokenAccount>,
    pub sundial: Account<'info, Sundial>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump)]
    pub sundial_liquidity_wallet: Account<'info, TokenAccount>,
    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts, Clone)]
#[instruction(bump: u8)]
pub struct CreateAndInitSundialProfile<'info> {
    #[account(init, payer=user, seeds=[user.key().as_ref(), b"profile"], bump=bump)]
    pub sundial_profile: Box<Account<'info, SundialProfile>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
