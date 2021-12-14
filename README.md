# ⏰ Sundial

Sundial is a yield tokenizer program on Solana. It tokenizes a user's position into two parts:
- principal tokens (maps one-to-one to the underlying token)
- yield tokens (variable part which depends on the yield of the underlying protocols)

At maturity 1 principle tokens allow users to exchange for 1 underlying tokens. 1 yield tokens allow users to redeem the interest earned during the loan period.

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
