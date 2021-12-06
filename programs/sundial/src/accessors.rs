use anchor_lang::prelude::{AccountInfo, ProgramError};

pub fn decimal(account: &AccountInfo) -> Result<u8, ProgramError> {
    let bytes = account.try_borrow_data()?;
    Ok(bytes[44])
}
