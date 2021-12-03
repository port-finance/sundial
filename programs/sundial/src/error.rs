use anchor_lang::prelude::*;

#[error]
pub enum SundialError {
    // 300
    #[msg("End Time Earlier Than CurrentTime")]
    EndTimeTooEarly,
    #[msg("Invalid Port Liquidity Mint")]
    InvalidPortLiquidityMint,
    #[msg("Invalid Port Lp Mint")]
    InvalidPortLpMint,
    #[msg("Please refresh reserve before deposit")]
    ReserveIsNotRefreshed,
    #[msg("Please call redeem before first redeem of principle or yield")]
    NotRedeemLpYet,
    #[msg("Not the redeem time yet")]
    //305
    NotEndYet,
    #[msg("Contract already end")]
    AlreadyEnd,
    #[msg("MathOverflow")]
    MathOverflow,
}
