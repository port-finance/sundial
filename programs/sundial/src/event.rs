use anchor_lang::prelude::*;

#[event]
pub struct DidDeposit {
    pub liquidity_spent: u64,
    pub principle_token_minted: u64,
    pub yield_token_minted: u64,
}

#[event]
pub struct DidRedeemPrinciple {
    pub principle_burned: u64,
    pub liquidity_redeemed: u64,
}

#[event]
pub struct DidRedeemYield {
    pub yield_burned: u64,
    pub liquidity_redeemed: u64,
}

#[event]
pub struct DidDepositCollateral {
    pub amount_deposit: u64,
    pub asset_mint: Pubkey,
    pub user_wallet: Pubkey,
}

#[event]
pub struct DidWithdrawCollateral {
    pub withdraw_amount: u64,
    pub asset_mint: Pubkey,
    pub user_wallet: Pubkey,
}

#[event]
pub struct DidRepayLoan {
    pub repay_amount: u64,
    pub asset_mint: Pubkey,
    pub user_wallet: Pubkey,
}
#[event]
pub struct DidMintLoan {
    pub amount_mint: u64,
    pub asset_mint: Pubkey,
    pub user_wallet: Pubkey,
}

#[event]
pub struct DidLiquidate {
    pub repay_amount: u64,
    pub repay_mint: Pubkey,
    pub withdraw_amount: u64,
    pub withdraw_mint: Pubkey,
    pub user_wallet: Pubkey,
}
