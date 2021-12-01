use anchor_lang::prelude::*;
use anchor_spl::token::{MintTo, Transfer};

#[inline(always)]
pub fn create_transfer_cpi<'a, 'b, 'c, 'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    seeds: &'a [&'b [&'c [u8]]],
    token_program: AccountInfo<'info>,
) -> CpiContext<'a, 'b, 'c, 'info, Transfer<'info>> {
    let cpi_accounts = Transfer {
        from,
        to,
        authority,
    };
    CpiContext::new_with_signer(token_program, cpi_accounts, seeds)
}

#[inline(always)]
pub fn create_mint_to_cpi<'a, 'b, 'c, 'info>(
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    seeds: &'a [&'b [&'c [u8]]],
    token_program: AccountInfo<'info>,
) -> CpiContext<'a, 'b, 'c, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
        mint,
        to,
        authority,
    };
    CpiContext::new_with_signer(token_program, cpi_accounts, seeds)
}
