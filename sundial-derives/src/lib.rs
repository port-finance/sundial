extern crate proc_macro;

use proc_macro::TokenStream;
use quote::quote;

use syn::parse::{Parse, ParseStream};
use syn::punctuated::Punctuated;
use syn::Data::Struct;
use syn::Fields::Named;
use syn::Ident;
use syn::{parse_macro_input, Token};
use syn::{Data, DeriveInput};

#[proc_macro_derive(CheckSundialNotEnd)]
pub fn check_sundial_not_end(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);

    let name = &ast.ident;
    (quote! {
        impl<'a> crate::helpers::CheckSundialNotEnd for #name<'a> {
             fn check_sundial_not_end(&self) -> ProgramResult {
                vipers::invariant!(self.sundial.end_unix_time_stamp > self.clock.unix_timestamp, crate::error::SundialError::AlreadyEnd);
                Ok(())
            }
        }
    })
        .into()
}

#[proc_macro_derive(CheckSundialAlreadyEnd)]
pub fn check_sundial_already_end(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);

    let name = &ast.ident;
    (quote! {
        impl<'a> crate::helpers::CheckSundialAlreadyEnd for #name<'a> {
             fn check_sundial_already_end(&self) -> ProgramResult {
                vipers::invariant!(self.sundial.end_unix_time_stamp <= self.clock.unix_timestamp, crate::error::SundialError::NotEndYet);
                Ok(())
            }
        }
    })
        .into()
}

#[proc_macro_derive(CheckSundialProfileStale)]
pub fn check_sundial_profile_stale(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    let name = &ast.ident;
    (quote! {
        impl<'a> crate::helpers::CheckSundialProfileStale for #name<'a> {
             fn check_sundial_profile_stale(&self) -> ProgramResult {
                self.sundial_profile.last_update.check_stale(&self.clock, crate::helpers::SUNDIAL_PROFILE_STALE_TOL, "Sundial Profile Is Stale")
             }
        }
    })
        .into()
}

#[proc_macro_derive(CheckSundialMarketOwner)]
pub fn check_sundial_market_owner(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    let name = &ast.ident;
    (quote! {
        impl<'a> crate::helpers::CheckSundialMarketOwner for #name<'a> {
             fn check_sundial_market_owner(&self) -> ProgramResult {
                vipers::assert_keys_eq!(self.sundial_market.owner, *self.owner.key, SundialError::InvalidOwner, "Invalid Sundial Market Owner");
                Ok(())
            }
        }
    })
        .into()
}

#[proc_macro_derive(CheckSundialProfileMarket)]
pub fn check_sundial_profile_market(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    let name = &ast.ident;
    let has_sundial = has_field(&ast.data, "sundial");
    let has_sundial_collateral = has_field(&ast.data, "sundial_collateral");
    if !has_sundial && !has_sundial_collateral {
        panic!("Neither has sundial and sundial collateral")
    }
    let sundial_check = if has_sundial {
        quote! {
            vipers::assert_keys_eq!(self.sundial.sundial_market,
                self.sundial_profile.sundial_market, SundialError::SundialMarketNotMatch, "Sundial's market not matches the one on sundial profile");
        }
    } else {
        quote! {}
    };

    let sundial_collateral_check = if has_sundial_collateral {
        quote! {
            vipers::assert_keys_eq!(self.sundial_collateral.sundial_market,
                self.sundial_profile.sundial_market, SundialError::SundialMarketNotMatch, "Sundial Collateral's market not matches the one on sundial profile");
        }
    } else {
        quote! {}
    };

    (quote! {
        impl<'a> crate::helpers::CheckSundialProfileMarket for #name<'a> {
             fn check_sundial_profile_market(&self) -> ProgramResult {
                #sundial_check;
                #sundial_collateral_check;
                Ok(())
            }
        }
    })
    .into()
}

fn has_field(struct_input: &Data, field_name: &str) -> bool {
    if let Struct(data) = &struct_input {
        if let Named(ref fields) = data.fields {
            for field in fields.named.iter() {
                if let Some(ident) = field.ident.clone() {
                    let ident_str = ident.to_string();
                    if ident_str == field_name {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[proc_macro_derive(CheckSundialOwner)]
pub fn check_sundial_owner(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    let name = &ast.ident;
    let has_sundial = has_field(&ast.data, "sundial");
    let has_sundial_collateral = has_field(&ast.data, "sundial_collateral");
    if !has_sundial && !has_sundial_collateral {
        panic!("Neither has sundial and sundial collateral")
    }
    let check_owner = quote! {
        vipers::assert_keys_eq!(self.sundial_market.owner, *self.owner.key,
            SundialError::InvalidOwner, "Invalid Sundial Market Owner");
        if !self.owner.is_signer {
            msg!("Owner didn't sign");
            return Err(SundialError::OwnerNotSigned.into());
        }
    };

    let sundial_check = if has_sundial {
        quote! {
            vipers::assert_keys_eq!(self.sundial.sundial_market,
                self.sundial_market.key(), SundialError::SundialMarketNotMatch, "Sundial's market not matches the one passed in");
        }
    } else {
        quote! {}
    };

    let sundial_collateral_check = if has_sundial_collateral {
        quote! {
            vipers::assert_keys_eq!(self.sundial_collateral.sundial_market,
                self.sundial_market.key(), SundialError::SundialMarketNotMatch, "Sundial Collateral's market not matches the one passed in");
        }
    } else {
        quote! {}
    };

    (quote! {
        impl<'a> crate::helpers::CheckSundialOwner for #name<'a> {
             fn check_sundial_owner(&self) -> ProgramResult {
                #sundial_check;
                #sundial_collateral_check;
                #check_owner;
                Ok(())
             }
        }
    })
    .into()
}

struct Args(Vec<syn::Ident>);
impl Parse for Args {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let vars = Punctuated::<Ident, Token![,]>::parse_terminated(input)?;
        Ok(Args(vars.into_iter().collect()))
    }
}
#[proc_macro_attribute]
pub fn validates(attr: TokenStream, item: TokenStream) -> TokenStream {
    let vars = parse_macro_input!(attr as Args).0;
    let ast = parse_macro_input!(item as DeriveInput);
    let name = &ast.ident;
    (quote! {
        impl<'a> vipers::Validate<'a> for #name<'a> {
            fn validate(&self) -> ProgramResult {
                #(self.#vars()?;)*
                Ok(())
            }
        }
        #ast
    })
    .into()
}
