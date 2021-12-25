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

    //305
    #[msg("Not the redeem time yet")]
    NotEndYet,
    #[msg("Contract already end")]
    AlreadyEnd,
    #[msg("ExceedLiquidityCap")]
    ExceedLiquidityCap,
    #[msg("InvalidOracleConfig")]
    InvalidOracleConfig,
    #[msg("Reserve should be passed in")]
    ReserveNeeded,

    //310
    #[msg("InvalidMintAmount")]
    InvalidMintAmount,
    #[msg("Oracle should be passed in")]
    OracleNeeded,
    #[msg("Withdrawing too much collateral")]
    WithdrawTooMuchCollateral,
    #[msg("Repaying too much loan")]
    RepayTooMuchLoan,
    #[msg("Invalid Liquidation")]
    InvalidLiquidation,
}
