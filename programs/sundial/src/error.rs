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
}
