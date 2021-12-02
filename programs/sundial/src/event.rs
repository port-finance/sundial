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
