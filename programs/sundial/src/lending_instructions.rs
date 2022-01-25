use crate::error::*;
use crate::helpers::*;
use crate::state::{Fee, LiquidityCap, SundialConfig, SundialMarket};
use crate::state::{Sundial, SundialBumps};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use port_anchor_adaptor::{Deposit as PortDeposit, PortReserve, Redeem};
use sundial_derives::{
    validates, CheckSundialAlreadyEnd, CheckSundialMarketOwner, CheckSundialNotEnd,
    CheckSundialOwner,
};

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

#[derive(Accounts, Clone)]
#[instruction(owner: Pubkey)]
pub struct InitializeSundialMarket<'info> {
    #[account(init, payer=payer)]
    pub sundial_market: Account<'info, SundialMarket>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[validates(check_sundial_owner)]
#[derive(Accounts, Clone, CheckSundialOwner)]
#[instruction(config: SundialInitConfigParams)]
pub struct ChangeSundialConfig<'info> {
    #[account(mut)]
    pub sundial: Account<'info, Sundial>,
    pub sundial_market: Account<'info, SundialMarket>,
    #[account(mut)]
    pub owner: Signer<'info>,
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

#[derive(Accounts)]
pub struct PortAccounts<'info> {
    #[account(owner = port_lending_program.key())]
    pub lending_market: UncheckedAccount<'info>,
    pub lending_market_authority: UncheckedAccount<'info>,
    #[account(mut, owner = port_lending_program.key(), constraint = !reserve.last_update.stale @ SundialError::ReserveIsNotRefreshed)]
    pub reserve: Box<Account<'info, PortReserve>>,
    #[account(mut)]
    pub reserve_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub reserve_collateral_mint: Box<Account<'info, Mint>>,
    #[account(executable)]
    pub port_lending_program: UncheckedAccount<'info>,
}

#[validates(check_sundial_not_end)]
#[derive(Accounts, CheckSundialNotEnd)]
#[instruction(amount: u64)]
pub struct DepositAndMintTokens<'info> {
    #[account(
        constraint = sundial.reserve == port_accounts.reserve.key() @ SundialError::InvalidPortReserve,
        constraint = sundial.token_program == token_program.key() @ SundialError::InvalidTokenProgram,
        constraint = sundial.port_lending_program == port_accounts.port_lending_program.key() @ SundialError::InvalidPortLendingProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"lp"], bump = sundial.bumps.port_lp_bump)]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"fee_receiver"], bump = sundial.bumps.fee_receiver_bump)]
    pub sundial_fee_receiver_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub principle_token_mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"yield_mint"], bump = sundial.bumps.yield_mint_bump)]
    pub yield_token_mint: Box<Account<'info, Mint>>,
    pub port_accounts: PortAccounts<'info>,
    #[account(mut)]
    pub user_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_principle_token_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_yield_token_wallet: Box<Account<'info, TokenAccount>>,
    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[validates(check_sundial_already_end)]
#[derive(Accounts, CheckSundialAlreadyEnd)]
#[instruction()]
pub struct RedeemLp<'info> {
    #[account(
        constraint = sundial.reserve == port_accounts.reserve.key() @ SundialError::InvalidPortReserve,
        constraint = sundial.token_program == token_program.key() @ SundialError::InvalidTokenProgram,
        constraint = sundial.port_lending_program == port_accounts.port_lending_program.key() @ SundialError::InvalidPortLendingProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"lp"], bump = sundial.bumps.port_lp_bump)]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump)]
    pub sundial_port_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    pub port_accounts: PortAccounts<'info>,
    #[account(executable)]
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[validates(check_sundial_already_end)]
#[derive(Accounts, CheckSundialAlreadyEnd)]
#[instruction(amount: u64)]
pub struct RedeemPrincipleToken<'info> {
    #[account(mut,
        constraint = sundial.token_program == token_program.key() @ SundialError::InvalidTokenProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump, constraint = sundial_port_liquidity_wallet.amount != 0 @ SundialError::NotRedeemLpYet )]
    pub sundial_port_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"lp"], bump = sundial.bumps.port_lp_bump, constraint = sundial_port_lp_wallet.amount == 0 @ SundialError::NotRedeemLpYet)]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump, )]
    pub principle_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub user_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_principle_token_wallet: Box<Account<'info, TokenAccount>>,
    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[validates(check_sundial_already_end)]
#[derive(Accounts, CheckSundialAlreadyEnd)]
#[instruction(amount: u64)]
pub struct RedeemYieldToken<'info> {
    #[account(
        constraint = sundial.token_program == token_program.key() @ SundialError::InvalidTokenProgram)]
    pub sundial: Account<'info, Sundial>,
    #[account(seeds=[sundial.key().as_ref(), b"authority"], bump=sundial.bumps.authority_bump)]
    pub sundial_authority: UncheckedAccount<'info>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"liquidity"], bump = sundial.bumps.port_liquidity_bump)]
    pub sundial_port_liquidity_wallet: Account<'info, TokenAccount>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"lp"], bump = sundial.bumps.port_lp_bump, constraint = sundial_port_lp_wallet.amount == 0 @ SundialError::NotRedeemLpYet)]
    pub sundial_port_lp_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"yield_mint"], bump = sundial.bumps.yield_mint_bump)]
    pub yield_token_mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [sundial.key().as_ref(), b"principle_mint"], bump = sundial.bumps.principle_mint_bump)]
    pub principle_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub user_liquidity_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_yield_token_wallet: Box<Account<'info, TokenAccount>>,
    pub user_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[allow(clippy::too_many_arguments)]
impl<'info> PortAccounts<'info> {
    #[inline(always)]
    pub fn create_deposit_reserve_context<'a, 'b, 'c>(
        &self,
        user_liquidity: AccountInfo<'info>,
        user_lp: AccountInfo<'info>,
        user_authority: AccountInfo<'info>,
        clock: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        seeds: &'a [&'b [&'c [u8]]],
    ) -> CpiContext<'a, 'b, 'c, 'info, PortDeposit<'info>> {
        let cpi_accounts = PortDeposit {
            source_liquidity: user_liquidity,
            destination_collateral: user_lp,
            reserve: self.reserve.to_account_info(),
            reserve_liquidity_supply: self.reserve_liquidity_wallet.to_account_info(),
            reserve_collateral_mint: self.reserve_collateral_mint.to_account_info(),
            lending_market: self.lending_market.to_account_info(),
            lending_market_authority: self.lending_market_authority.to_account_info(),
            transfer_authority: user_authority,
            clock,
            token_program,
        };

        CpiContext::new_with_signer(
            self.port_lending_program.to_account_info(),
            cpi_accounts,
            seeds,
        )
    }
    #[inline(always)]
    pub fn create_redeem_context<'a, 'b, 'c>(
        &self,
        user_liquidity: AccountInfo<'info>,
        user_lp: AccountInfo<'info>,
        user_authority: AccountInfo<'info>,
        clock: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        seeds: &'a [&'b [&'c [u8]]],
    ) -> CpiContext<'a, 'b, 'c, 'info, Redeem<'info>> {
        let cpi_accounts = Redeem {
            source_collateral: user_lp,
            destination_liquidity: user_liquidity,
            reserve: self.reserve.to_account_info(),
            reserve_collateral_mint: self.reserve_collateral_mint.to_account_info(),
            reserve_liquidity_supply: self.reserve_liquidity_wallet.to_account_info(),
            lending_market: self.lending_market.to_account_info(),
            lending_market_authority: self.lending_market_authority.to_account_info(),
            transfer_authority: user_authority,
            token_program,
            clock,
        };
        CpiContext::new_with_signer(
            self.port_lending_program.to_account_info(),
            cpi_accounts,
            seeds,
        )
    }
}
