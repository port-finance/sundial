use crate::error::SundialError;
use crate::helpers::*;
use crate::state::{Sundial, SundialProfile};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use sundial_derives::{validates, CheckSundialProfileMarket};

use itertools::Itertools;

use std::cmp::min;

use crate::event::*;
use crate::helpers::create_transfer_cpi;
use anchor_spl::token::transfer;

#[validates(check_sundial_profile_market)]
#[derive(Accounts, Clone, CheckSundialProfileMarket)]
#[instruction(amount:u64)]
//Repay sundial loan, repay liquidity token, i.e., repay USDC if you mint ppUSDC before.
//It will repay min(amount, loan_amount), e.g., you can pass u64::max to amount if you want repay all.
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

pub fn process_repay_sundial_liquidity(
    ctx: Context<RepaySundialLiquidity>,
    max_repay_amount: u64,
) -> ProgramResult {
    let sundial_key = ctx.accounts.sundial.key();
    let profile = &mut ctx.accounts.sundial_profile;
    let (pos, loan) = vipers::unwrap_opt!(
        profile
            .loans
            .iter_mut()
            .find_position(|l| l.sundial == sundial_key),
        "You don't have that asset as loan"
    );

    let repay_amount = min(loan.asset.amount, max_repay_amount);

    if 0 == log_then_prop_err!(
        loan.asset.reduce_amount(repay_amount),
        SundialError::RepayTooMuchLoan,
        "Repay too much, you don't have that much of loan"
    ) {
        profile.loans.remove(pos);
    };

    log_then_prop_err!(transfer(
        create_transfer_cpi(
            ctx.accounts.user_liquidity_wallet.to_account_info(),
            ctx.accounts.sundial_liquidity_wallet.to_account_info(),
            ctx.accounts.transfer_authority.to_account_info(),
            &[],
            ctx.accounts.token_program.to_account_info(),
        ),
        repay_amount
    ));

    emit!(DidRepayLoan {
        repay_amount,
        asset_mint: ctx.accounts.sundial_liquidity_wallet.mint,
        user_wallet: ctx.accounts.user.key()
    });
    Ok(())
}
