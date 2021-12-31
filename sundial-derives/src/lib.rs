extern crate proc_macro;

use proc_macro::TokenStream;
use quote::quote;

use syn::parse_macro_input;
use syn::DeriveInput;

#[proc_macro_derive(CheckSundialProfileStale)]
pub fn check_sundial_profile_stale(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    let name = &ast.ident;
    (quote! {
        impl<'a> CheckSundialProfileStale for #name<'a> {
             fn check_sundial_profile_stale(&self) -> ProgramResult {
                self.sundial_profile.last_update.check_stale(&self.clock, crate::helpers::SUNDIAL_PROFILE_STALE_TOL,"Sundial Profile Is Stale")
             }
        }
    })
        .into()
}
