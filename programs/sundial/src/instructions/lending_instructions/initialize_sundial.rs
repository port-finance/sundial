use crate::error::*;
use crate::helpers::*;
use crate::state::{Fee, LiquidityCap, SundialConfig, SundialMarket};
use crate::state::{Sundial, SundialBumps};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use port_anchor_adaptor::PortReserve;
use sundial_derives::{validates, CheckSundialMarketOwner};
use vipers::unwrap_int;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SundialInitConfigParams {
    pub lending_fee: u8,
    pub borrow_fee: u8,
    pub liquidity_cap: u64,
}

impl From<SundialInitConfigParams> for SundialConfig {
    fn from(config: SundialInitConfigParams) -> Self {
        SundialConfig {
            lending_fee: Fee {
                bips: config.lending_fee,
            },
            borrow_fee: Fee {
                bips: config.borrow_fee,
            },
            liquidity_cap: LiquidityCap {
                lamports: config.liquidity_cap,
            },
            ..SundialConfig::default()
        }
    }
}

#[validates(check_sundial_market_owner)]
#[derive(Accounts, Clone, CheckSundialMarketOwner)]
#[instruction(
bumps: SundialBumps, duration_in_seconds: i64,
port_lending_program: Pubkey,
config: SundialInitConfigParams, oracle: Pubkey,
name:String, pda_bump:u8)]
pub struct InitializeSundial<'info> {
    #[account(init, payer=owner, seeds = [sundial_market.key().as_ref(), name.as_ref()], bump = pda_bump)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(init, payer=owner, seeds = [sundial.key().as_ref(), b"liquidity"], bump = bumps.port_liquidity_bump, token::authority=sundial_authority, token::mint=port_liquidity_mint)]
    pub sundial_port_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    #[account(init, payer=owner, seeds = [sundial.key().as_ref(), b"lp"], bump = bumps.port_lp_bump, token::authority=sundial_authority, token::mint=port_lp_mint)]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,
    #[account(init, payer=owner, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = bumps.principle_mint_bump, mint::authority=sundial_authority, mint::decimals=port_liquidity_mint.decimals)]
    pub principle_token_mint: Box<Account<'info, Mint>>,
    #[account(init, payer=owner, seeds = [sundial.key().as_ref(), b"yield_mint"], bump = bumps.yield_mint_bump, mint::authority=sundial_authority, mint::decimals=port_liquidity_mint.decimals)]
    pub yield_token_mint: Box<Account<'info, Mint>>,
    #[account(init, payer=owner, seeds = [sundial.key().as_ref(), b"fee_receiver"], bump = bumps.fee_receiver_bump, token::authority=sundial_authority, token::mint=principle_token_mint)]
    pub fee_receiver_wallet: Box<Account<'info, TokenAccount>>,
    #[account(owner=port_lending_program, constraint = !reserve.last_update.stale @ SundialError::ReserveIsNotRefreshed)]
    pub reserve: Box<Account<'info, PortReserve>>,
    #[account(address = reserve.liquidity.mint_pubkey @ SundialError::InvalidPortLiquidityMint)]
    pub port_liquidity_mint: Box<Account<'info, Mint>>,
    #[account(address = reserve.collateral.mint_pubkey @ SundialError::InvalidPortLpMint)]
    pub port_lp_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub sundial_market: Box<Account<'info, SundialMarket>>,
    pub rent: Sysvar<'info, Rent>,
    #[account(constraint = duration_in_seconds > 0 @ SundialError::EndTimeTooEarly)]
    pub clock: Sysvar<'info, Clock>,
}

#[allow(clippy::too_many_arguments)]
pub fn process_initialize_sundial(
    ctx: Context<InitializeSundial>,
    bumps: SundialBumps,
    duration_in_seconds: i64,
    port_lending_program: Pubkey,
    config: SundialInitConfigParams,
    oracle: Pubkey,
    _name: String,
    _pda_bump: u8,
) -> ProgramResult {
    let sundial = &mut ctx.accounts.sundial;
    sundial.bumps = bumps;
    sundial.token_program = ctx.accounts.token_program.key();
    sundial.reserve = ctx.accounts.reserve.key();

    let start_exchange_rate = log_then_prop_err!(ctx.accounts.reserve.collateral_exchange_rate());
    sundial.start_exchange_rate = get_raw_from_uint!(start_exchange_rate.0);
    sundial.port_lending_program = port_lending_program;
    let current_unix_time_stamp = ctx.accounts.clock.unix_timestamp;
    sundial.duration_in_seconds = duration_in_seconds;
    sundial.end_unix_time_stamp =
        unwrap_int!(current_unix_time_stamp.checked_add(duration_in_seconds));
    sundial.config = config.into();
    sundial.sundial_market = ctx.accounts.sundial_market.key();
    sundial.oracle = oracle;
    sundial.config.liquidity_decimals = ctx.accounts.port_liquidity_mint.decimals;
    Ok(())
}
