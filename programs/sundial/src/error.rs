use anchor_lang::prelude::*;

#[error]
pub enum SundialError {
    // 300
    #[msg("End Time Earlier Than CurrentTime")]
    EndTimeTooEarly,
    InvalidPortLiquidityMint,
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
    ExceedLiquidityCap,
    InvalidOracleConfig,
    #[msg("Reserve should be passed in")]
    ReserveNeeded,

    //310
    InvalidMintAmount,
    #[msg("Oracle should be passed in")]
    OracleNeeded,
    WithdrawTooMuchCollateral,
    RepayTooMuchLoan,
    InvalidLiquidation,

    //315
    InvalidOwner,
    InvalidProfileUser,
    #[msg("Sundial's market does not match the on in sundial profile")]
    SundialMarketNotMatch,
    #[msg("The state is stale")]
    StateStale,
    OwnerNotSigned,

    //320
    InvalidPortReserve,
    InvalidTokenProgram,
    InvalidPortLendingProgram,
}
