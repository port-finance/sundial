use anchor_lang::prelude::{AccountInfo, ProgramError};

pub fn decimal(account: &AccountInfo) -> Result<u8, ProgramError> {
    let bytes = account.try_borrow_data()?;
    Ok(bytes[44])
}

pub fn supply(account: &AccountInfo) -> Result<u64, ProgramError> {
    let bytes = account.try_borrow_data()?;
    let mut amount_bytes = [0u8; 8];
    amount_bytes.copy_from_slice(&bytes[36..44]);
    Ok(u64::from_le_bytes(amount_bytes))
}
