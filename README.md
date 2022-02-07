# ⏰ Sundial

Sundial is a yield tokenizer program on Solana. It tokenizes a user's position into two parts:
- principal tokens (maps one-to-one to the underlying token)
- yield tokens (variable part which depends on the yield of the underlying protocols)

At maturity 1 principle tokens allow users to exchange for 1 underlying tokens. 1 yield tokens allow users to redeem the interest earned during the loan period.

## Usage
### Fixed Rate Lending and Borrowing
Principal tokens can be used to implement fixed rate lending using a zero coupon bond model, since principal tokens can always be redeemed one to one to the underlying.

Users can trade principal tokens in various DEX. Due to the time value of money, 1 principal tokens should always be traded at less than 1 underlying tokens. Concretely, 1 principal USDC should be traded at less than 1 USDC.

The interest rate of lending and borrowing can be calculated as:

Interest Paid = the difference between the Principal USDC price and 1

Say 1 Principal USDC (ppUSDC) is traded at 0.95 USDC. Then the interest that the lender is going to receive or borrower is going to pay is (1 - 0.95) = 0.05 USDC. Users can then annualize it to calculate the APY.

### Interest Rate Swap
Since the yield tokens alwyas maps to the lending interest rate over a given period. The buyer of the yield tokens can be considered as giving up fixed rate in favor of floating rate. The seller of the yield tokens can be considered as giving up the floating rate in favor of the fixed rate.


## Development

### Version Requirements
- Anchor `v0.18.0`
- Solana `v1.7.8`

### To start a front-end test environment

```
anchor localnet
```

In a separate terminal run the following command to set up all the on-chain program:
```
anchor migrate
```

Change directory and run the front end
```
cd app
yarn start
```

### To run the tests locally
```
yarn idl:generate
yarn test:e2e
```

Mac users need to install GNU Sed for `yarn idl:generate` to work properly.
```
brew install gnu-sed
```
