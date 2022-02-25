# ⏰ Sundial

Sundial enables fixed rate borrowing and lending on Solana. 

It tokenizes a user's position on Port into two parts:
- principal tokens (maps one-to-one to the underlying token)
- yield tokens (variable part which depends on the yield of the underlying protocols)

At maturity 1 principal tokens allow users to exchange for 1 underlying tokens. 1 yield tokens allow users to redeem the interest earned during the loan period.

## Usage
### Fixed Rate Lending & Borrowing
Principal tokens can be used to implement fixed rate lending using a zero coupon bond model, since principal tokens can always be redeemed one to one to the underlying.

Users can trade principal tokens in various DEX. The seller of the principal tokens can be considered as borrower while the buyers can be considered as lender.

Due to the time value of money, 1 principal tokens should always be traded at less than 1 underlying tokens. Concretely, 1 principal USDC should be traded at less than 1 USDC.

The interest rate of lending and borrowing can be calculated as:

Interest Paid = the difference between the Principal USDC price and 1

Say 1 Principal USDC (ppUSDC) is traded at 0.95 USDC. Then the interest that the lender is going to receive or borrower is going to pay is (1 - 0.95) = 0.05 USDC. Users can then annualize it to calculate the APY.

### Interest Rate Swap
Since the yield tokens always maps to the lending interest rate over a given period. The buyer of the yield tokens can be considered as giving up fixed rate in favor of floating rate. The seller of the yield tokens can be considered as giving up the floating rate in favor of the fixed rate.

## User interactions
Users can create [Profile] to deposit Port LP tokens as collateral and mint Principal Token (ppToken) directly from Sundial and sell them in market for underlying, which is equivalent to borrow at a fixed rate.

Users must repay the liquidity that corresponds to the ppToken they minted before ppToken matures, i.e. the sundial pool ends. Otherwise, users will be liquidated by others.

For depositing and repaying, there is no need to refresh anything in advance, but if you want to withdraw collateral or borrow (mint) ppToken, you need to make sure the sundial collateral
you want to withdraw from and your sundial profile is refreshed.

To refresh sundial collateral, you need to refresh the corresponded reserve before. To refresh sundial profile, you need refresh all the sundial collaterals you deposit in the profile before.
They will become stale after 10 slots.

## Liquidation
For liquidation, you need choose a certain sundial profile that you want to liquidate, and the loan you want to repay, and the collateral you want to withdraw,
and refresh all the sundial collaterals in it, then send the liquidation transaction.

The on-chain program checks if the liquidation can be performed. If so, users repay the loan and withdraw the collateral with a bonus.

The value of collateral you get will be `the value of the loan you repay` * (100 + `liquidation penalty of that collateral`).


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
