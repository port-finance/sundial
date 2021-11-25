use anchor_lang::prelude::*;

#[error]
pub enum SundialError {
    // 300
    #[msg("End Time Earlier Than CurrentTime")]
    EndTimeTooEarly,
}
