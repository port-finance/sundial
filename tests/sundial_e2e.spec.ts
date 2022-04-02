import { Provider, setProvider, BN } from '@project-serum/anchor';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { DEFAULT_RESERVE_CONFIG, PORT_LENDING } from './constants';
import {
  createAccountRentExempt,
  createMintAndVault,
  getTokenAccount,
  sleep,
} from '@project-serum/common';
import { expect } from 'chai';
import {
  createDefaultReserve,
  createLendingMarket,
  ReserveState,
} from './utils';
import {
  INITIAL_MINT_AMOUNT,
  makeSDK,
  RESERVE_INIT_LIQUIDITY,
} from './workspace';
import {
  ReserveParser,
  ParsedAccount,
  ReserveData,
  ReserveInfo,
  Port,
  initObligationInstruction,
  refreshObligationInstruction,
  refreshReserveInstruction,
  PORT_PROFILE_DATA_SIZE,
} from '@port.finance/port-sdk';
import { expectTX } from '@saberhq/chai-solana';

const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
const FEE_IN_BIPS = 10;
describe('Sundial Interacting with Port Reserve that has positive APY', () => {
  setProvider(Provider.local());
  const provider = Provider.local();

  const sdk = makeSDK();
  const sundialWrapper = sdk.sundialWrapper;
  const portDepositAmount = new BN(10_000);
  const portBorrowAmount = new BN(7_000);
  const utilizationRate =
    portBorrowAmount.toNumber() / portDepositAmount.toNumber();
  let lendingMarketKP: Keypair;
  let sundialMarketBase: Keypair;
  let reserveState: ReserveState;
  let liquidityMint: PublicKey;
  let liquidityVault: PublicKey;
  let reserveInfo: ReserveInfo;
  let parsedReserve: ParsedAccount<ReserveData>;
  const port: Port = Port.forMainNet({
    connection: provider.connection,
  });

  before('Set up reserve', async () => {
    lendingMarketKP = await createLendingMarket(provider);
    const [mintPubkey, vaultPubkey] = await createMintAndVault(
      provider,
      INITIAL_MINT_AMOUNT,
    );
    liquidityMint = mintPubkey;
    liquidityVault = vaultPubkey;
    reserveState = await createDefaultReserve(
      provider,
      RESERVE_INIT_LIQUIDITY,
      vaultPubkey,
      lendingMarketKP.publicKey,
      {
        ...DEFAULT_RESERVE_CONFIG,
        minBorrowRate: 200,
        optimalBorrowRate: 200,
        maxBorrowRate: 200,
      },
    );

    const raw = {
      pubkey: reserveState.address,
      account: await provider.connection.getAccountInfo(reserveState.address),
    };
    parsedReserve = ReserveParser(raw);
    reserveInfo = await port.getReserve(reserveState.address);
    const depositInstructions = await reserveInfo.depositReserve({
      amount: portDepositAmount.sub(RESERVE_INIT_LIQUIDITY),
      userLiquidityWallet: liquidityVault,
      destinationCollateralWallet: reserveState.useCollateralAccount,
      userTransferAuthority: provider.wallet.publicKey,
    });

    const tx = new Transaction();
    tx.add(...depositInstructions);
    const obligationKp = await createAccountRentExempt(
      provider,
      PORT_LENDING,
      PORT_PROFILE_DATA_SIZE,
    );
    tx.add(
      initObligationInstruction(
        obligationKp.publicKey,
        lendingMarketKP.publicKey,
        provider.wallet.publicKey,
      ),
    );

    const depositObligationCollateralIxs =
      await reserveInfo.depositObligationCollateral({
        amount: portDepositAmount,
        userCollateralWallet: reserveState.useCollateralAccount,
        obligation: obligationKp.publicKey,
        obligationOwner: provider.wallet.publicKey,
        userTransferAuthority: provider.wallet.publicKey,
      });

    tx.add(...depositObligationCollateralIxs);

    await provider.send(tx);

    const borrowTx = new Transaction();
    borrowTx.add(refreshReserveInstruction(reserveState.address, null));
    borrowTx.add(
      refreshObligationInstruction(
        obligationKp.publicKey,
        [reserveState.address],
        [],
      ),
    );
    const borrowObligationCollateralIxs =
      await reserveInfo.borrowObligationLiquidity({
        amount: portBorrowAmount,
        userWallet: liquidityVault,
        obligation: obligationKp.publicKey,
        owner: provider.wallet.publicKey,
        userTransferAuthority: provider.wallet.publicKey,
      });
    borrowTx.add(...borrowObligationCollateralIxs);
    await provider.send(borrowTx);

    sundialMarketBase = await sdk.createSundialMarket();
  });

  const sundialName = 'USDC';
  const sundialDuration = 15;
  it('Initialize Sundial', async () => {
    const duration = new BN(sundialDuration); // 15 seconds from now
    const createTx = await sundialWrapper.createSundial({
      sundialName,
      owner: provider.wallet.publicKey,
      durationInSeconds: duration, // 8th of August 2028
      liquidityMint: liquidityMint,
      reserve: parsedReserve,
      sundialMarket: sundialMarketBase.publicKey,
      oracle: PublicKey.default,
      lendingFeeInBips: FEE_IN_BIPS,
    });
    await expectTX(createTx, 'Create sundial').to.be.fulfilled;
    await sundialWrapper.reloadData();
  });

  const amount = new BN(100_000_000_000);
  const fee = amount.muln(FEE_IN_BIPS).divn(10_000);
  it('generate less principle tokens', async () => {
    await sleep(10000);
    const depositTx = await sundialWrapper.mintPrincipleAndYieldTokens({
      amount,
      userLiquidityWallet: liquidityVault,
      reserve: parsedReserve,
    });
    await expectTX(depositTx, 'mint principle and yield').to.be.fulfilled;

    const principleAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      (
        await sundialWrapper.getPrincipleMintAndBump()
      )[0],
      provider.wallet.publicKey,
    );

    const yieldAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      (
        await sundialWrapper.getYieldMintAndBump()
      )[0],
      provider.wallet.publicKey,
    );
    const principleWallet = await getTokenAccount(
      provider,
      principleAssocTokenAccount,
    );
    const liquidityWallet = await getTokenAccount(provider, liquidityVault);

    // 200% borrow interest with 0.7 utilization rate.
    const depositApy = 2 * utilizationRate;
    const expectedRemainingLiquidity = INITIAL_MINT_AMOUNT.sub(amount)
      .sub(portDepositAmount)
      .add(portBorrowAmount);
    const minimumDurationSecs = 10;
    const interestAccrue =
      (amount.toNumber() * minimumDurationSecs * depositApy) / SECONDS_IN_YEAR;
    const yieldWallet = await getTokenAccount(provider, yieldAssocTokenAccount);
    expect(liquidityWallet.amount.toString()).equal(
      expectedRemainingLiquidity.toString(),
    );
    expect(principleWallet.amount.add(fee)).to.bignumber.eq(yieldWallet.amount);
    expect(principleWallet.amount.add(fee)).to.bignumber.lt(amount);
    expect(amount.sub(yieldWallet.amount).toNumber()).gt(
      interestAccrue,
    );
  });

  it('should fail minting principle and yield tokens', async () => {
    await sleep(8000);
    const depositTx = await sundialWrapper.mintPrincipleAndYieldTokens({
      amount: new BN(100),
      userLiquidityWallet: liquidityVault,
      reserve: parsedReserve,
    });
    await expectTX(depositTx, 'fail mint principle and yield').to.be.rejected;
  });

  it('should redeem yield token with interest', async () => {
    const principleAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      (
        await sundialWrapper.getPrincipleMintAndBump()
      )[0],
      provider.wallet.publicKey,
    );

    const yieldAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      (
        await sundialWrapper.getYieldMintAndBump()
      )[0],
      provider.wallet.publicKey,
    );
    const principleWallet = await getTokenAccount(
      provider,
      principleAssocTokenAccount,
    );
    const yieldWallet = await getTokenAccount(provider, yieldAssocTokenAccount);

    const redeemPortTx = await sundialWrapper.redeemPortLp({
      lendingMarket: lendingMarketKP.publicKey,
      reserve: parsedReserve,
    });
    await expectTX(redeemPortTx, 'redeem from Port successful').to.be.fulfilled;
    const beforeUserLiquidityWallet = await getTokenAccount(
      provider,
      liquidityVault,
    );
    const beforeRedeemAmount = INITIAL_MINT_AMOUNT.sub(amount)
      .sub(portDepositAmount)
      .add(portBorrowAmount);
    expect(beforeUserLiquidityWallet.amount).to.bignumber.equal(
      beforeRedeemAmount,
    );
    const redeemYieldTokenTx = await sundialWrapper.redeemYieldTokens({
      amount: yieldWallet.amount,
      userLiquidityWallet: liquidityVault,
    });
    await expectTX(redeemYieldTokenTx, 'redeem yield token').to.be.fulfilled;
    const userLiquidityWallet = await getTokenAccount(provider, liquidityVault);
    expect(userLiquidityWallet.amount).to.bignumber.gt(beforeRedeemAmount);
    expect(
      userLiquidityWallet.amount.sub(beforeRedeemAmount),
    ).to.bignumber.equal(
      // Subtract 1 since when we calculate the principal token amount we use flooring.
      amount.sub(new BN(1)).sub(principleWallet.amount).sub(fee),
    );
  });

  it('should redeem principal token without interest', async () => {
    const beforeUserLiquidityWallet = await getTokenAccount(
      provider,
      liquidityVault,
    );
    const [principalMint] = await sundialWrapper.getPrincipleMintAndBump();
    const principalWalletPubkey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      principalMint,
      provider.wallet.publicKey,
    );
    const beforeUserPrincipalWallet = await getTokenAccount(
      provider,
      principalWalletPubkey,
    );

    const redeemPrincipalTokenTx = await sundialWrapper.redeemPrincipleTokens({
      amount: beforeUserPrincipalWallet.amount,
      userLiquidityWallet: liquidityVault,
    });
    await expectTX(redeemPrincipalTokenTx, 'Redeem principal tokens').to.be
      .fulfilled;
    const userLiquidityWallet = await getTokenAccount(provider, liquidityVault);
    const userPrincipalTokenWallet = await getTokenAccount(
      provider,
      principalWalletPubkey,
    );
    expect(
      userLiquidityWallet.amount.sub(beforeUserLiquidityWallet.amount),
    ).to.bignumber.equal(beforeUserPrincipalWallet.amount);
    expect(userPrincipalTokenWallet.amount).to.bignumber.equal(new BN(0));
  });
});
