use crate::helpers::*;

use crate::state::{
    LiquidationConfig, LiquidityCap, SundialCollateral, SundialCollateralBumps,
    SundialCollateralConfig, SundialMarket, LTV,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use port_anchor_adaptor::PortReserve;
use sundial_derives::{validates, CheckSundialMarketOwner};

use crate::error::SundialError;

#[validates(check_sundial_market_owner)]
#[derive(Accounts, Clone, CheckSundialMarketOwner)]
#[instruction(
    bumps: SundialCollateralBumps,
    config: SundialCollateralConfigParams,
    name: String,
    pda_bump: u8
)]
pub struct InitializeSundialCollateral<'info> {
    #[account(
        init,
        payer = owner,
        seeds = [
            sundial_market.key().as_ref(),
            name.as_ref(),
            b"collateral"
        ],
        bump = pda_bump
    )]
    pub sundial_collateral: Account<'info, SundialCollateral>,

    #[account(
        seeds = [
            sundial_collateral.key().as_ref(),
            b"authority"
        ],
        bump = bumps.authority_bump
    )]
    pub sundial_collateral_authority: UncheckedAccount<'info>,

    /// Sundial Collateral controlled Port Lp token Account.
    #[account(
        init,
        payer = owner,
        seeds = [
            sundial_collateral.key().as_ref(),
            b"lp"
        ],
        bump = bumps.port_lp_bump,
        token::authority=sundial_collateral_authority,
        token::mint=port_lp_mint
    )]
    pub sundial_collateral_lp_wallet: Box<Account<'info, TokenAccount>>,

    /// The underlying Port reserve.
    pub port_collateral_reserve: Box<Account<'info, PortReserve>>,

    /// Mint of the Port lp (collateral) token
    #[account(
        address = port_collateral_reserve.collateral.mint_pubkey
    )]
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
    ///  Liquidation triggered when loan value / collateral value * 100 >= liquidation_threshold
    pub liquidation_threshold: u8,
    /// Percentage of extra collateral asset to give liquidator as bonus
    pub liquidation_penalty: u8,
    /// Maximum amount of lamport of asset can be collateralized
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
            ..SundialCollateralConfig::default()
        }
    }
}

pub fn process_initialize_sundial_collateral(
    ctx: Context<InitializeSundialCollateral>,
    bumps: SundialCollateralBumps,
    config: SundialCollateralConfigParams,
    _name: String,
    _pda_bump: u8,
) -> ProgramResult {
    let sundial_collateral = &mut ctx.accounts.sundial_collateral;
    sundial_collateral.bumps = bumps;
    sundial_collateral.port_collateral_reserve = ctx.accounts.port_collateral_reserve.key();
    sundial_collateral.sundial_collateral_config = config.into();
    sundial_collateral.sundial_market = ctx.accounts.sundial_market.key();
    sundial_collateral.token_program = ctx.accounts.token_program.key();
    sundial_collateral.collateral_mint = ctx.accounts.port_lp_mint.key();
    sundial_collateral
        .sundial_collateral_config
        .collateral_decimals = ctx.accounts.port_lp_mint.decimals;
    log_then_prop_err!(sundial_collateral.sundial_collateral_config.sanity_check());
    Ok(())
}
