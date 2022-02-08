import { Provider, setProvider, BN } from '@project-serum/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { DEFAULT_RESERVE_CONFIG, PORT_LENDING } from './constants';
import {
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
  RESERVE_INIT_LIQUIDITY,
  makeSDK,
} from './workspace';
import {
  ReserveParser,
  ParsedAccount,
  ReserveData,
} from '@port.finance/port-sdk';
import { expectTX } from '@saberhq/chai-solana';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
describe('sundial', () => {
  setProvider(Provider.local());
  const provider = Provider.local();

  const sdk = makeSDK();
  const sundialWrapper = sdk.sundialWrapper;
  let lendingMarketKP: Keypair;
  let reserveState: ReserveState;
  let liquidityMint: PublicKey;
  let liquidityVault: PublicKey;
  let parsedReserve: ParsedAccount<ReserveData>;
  let sundialMarketBase: Keypair;
  const RESERVE_FUND_TRANSFER_TO_LIQUIDITY_WALLET_BEFORE_REDEEM = 1;
  before('Initialize Lending Market', async () => {
    lendingMarketKP = await createLendingMarket(provider);
    const [mintPubkey, vaultPubkey] = await createMintAndVault(
      provider,
      INITIAL_MINT_AMOUNT.addn(
        RESERVE_FUND_TRANSFER_TO_LIQUIDITY_WALLET_BEFORE_REDEEM,
      ),
    );
    liquidityMint = mintPubkey;
    liquidityVault = vaultPubkey;
    reserveState = await createDefaultReserve(
      provider,
      RESERVE_INIT_LIQUIDITY,
      vaultPubkey,
      lendingMarketKP.publicKey,
      DEFAULT_RESERVE_CONFIG,
    );

    const raw = {
      pubkey: reserveState.address,
      account: await provider.connection.getAccountInfo(reserveState.address),
    };
    parsedReserve = ReserveParser(raw);
    sundialMarketBase = await sdk.createSundialMarket();
  });
  const FEE_IN_BIPS = 10;
  const sundialName = 'USDC';
  it('Initialize Sundial', async () => {
    const duration = new BN(3); // 3 seconds from now
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
    const principleMintBump = (
      await sundialWrapper.getPrincipleMintAndBump()
    )[1];
    const yieldMintBump = (await sundialWrapper.getYieldMintAndBump())[1];
    expect(sundialWrapper.sundialData.durationInSeconds.toString()).equal(
      duration.toString(),
    );
    expect(sundialWrapper.sundialData.bumps.principleMintBump).equal(
      principleMintBump,
    );
    expect(sundialWrapper.sundialData.bumps.yieldMintBump).equal(yieldMintBump);
    expect(sundialWrapper.sundialData.reserve).eqAddress(parsedReserve.pubkey);
    expect(sundialWrapper.sundialData.portLendingProgram).eqAddress(
      PORT_LENDING,
    );
  });

  const amount = INITIAL_MINT_AMOUNT.sub(RESERVE_INIT_LIQUIDITY);
  const fee = amount.muln(FEE_IN_BIPS).divn(10_000).addn(1); //Since fee calculation is rounding up, so add one here
  it('Mints principle and yield tokens', async () => {
    const depositTx = await sundialWrapper.mintPrincipleAndYieldTokens({
      amount,
      userLiquidityWallet: liquidityVault,
      reserve: parsedReserve,
      lendingMarket: lendingMarketKP.publicKey,
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
    const yieldWallet = await getTokenAccount(provider, yieldAssocTokenAccount);
    const liquidityWallet = await getTokenAccount(provider, liquidityVault);

    const sundialLpWallet = (await sundialWrapper.getLPTokenSupplyAndBump())[0];
    const sundialLpAmount = (await getTokenAccount(provider, sundialLpWallet))
      .amount;

    const sundialLendingFeeWallet = (
      await sundialWrapper.getFeeReceiverAndBump()
    )[0];
    const sundialLendingFeeAmount = (
      await getTokenAccount(provider, sundialLendingFeeWallet)
    ).amount;

    expect(sundialLpAmount.toString()).not.equal('0');
    expect(sundialLpAmount.toString()).equal(amount.toString());
    expect(principleWallet.amount.toString()).equal(amount.sub(fee).toString());
    expect(yieldWallet.amount.toString()).equal(amount.toString());
    expect(liquidityWallet.amount.toString()).equal('1');
    expect(sundialLendingFeeAmount.toString()).equal(fee.toString());
  });
  it('Unable to redeem Port Lp before end date', async () => {
    const redeemTx = await sundialWrapper.redeemPortLp({
      lendingMarket: lendingMarketKP.publicKey,
      reserve: parsedReserve,
    });
    await expectTX(redeemTx, 'redeem from Port failed').to.be.rejected;
  });
  it('Unable to redeem Principal tokens before end date', async () => {
    const tx = await sundialWrapper.redeemPrincipleTokens({
      amount,
      userLiquidityWallet: liquidityVault,
    });
    await expectTX(tx, 'redeem principle failed').to.be.rejected;
  });
  it('Unable to redeem Yield tokens before end date', async () => {
    const tx = await sundialWrapper.redeemYieldTokens({
      amount,
      userLiquidityWallet: liquidityVault,
    });
    await expectTX(tx, 'redeem yield failed').to.be.rejected;
  });

  it('sleep and transfer some fund to liquidity wallet', async () => {
    await sleep(4000);
    const sundialLiquidityWalletPubkey = (
      await sundialWrapper.getLiquidityTokenSupplyAndBump()
    )[0];
    const transferToIx = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      liquidityVault,
      sundialLiquidityWalletPubkey,
      provider.wallet.publicKey,
      [],
      RESERVE_FUND_TRANSFER_TO_LIQUIDITY_WALLET_BEFORE_REDEEM,
    );
    const tx = new TransactionEnvelope(sdk.provider, [transferToIx]);
    await expectTX(tx, 'transfer some fund to liquidity wallet').to.be
      .fulfilled;
  });

  it('Unable to redeem Principal tokens before redeem port lp', async () => {
    const tx = await sundialWrapper.redeemPrincipleTokens({
      amount,
      userLiquidityWallet: liquidityVault,
    });
    await expectTX(tx, 'redeem principle failed').to.be.rejected;
  });
  it('Unable to redeem Yield tokens before redeem port lp', async () => {
    const tx = await sundialWrapper.redeemYieldTokens({
      amount,
      userLiquidityWallet: liquidityVault,
    });
    await expectTX(tx, 'redeem yield failed').to.be.rejected;
  });

  it('Redeem Port Lp', async () => {
    const sundialLiquidityWalletPubkey = (
      await sundialWrapper.getLiquidityTokenSupplyAndBump()
    )[0];
    const redeemTx = await sundialWrapper.redeemPortLp({
      lendingMarket: lendingMarketKP.publicKey,
      reserve: parsedReserve,
    });
    await expectTX(redeemTx, 'redeem from Port successful').to.be.fulfilled;
    const sundialLiquidityWallet = await getTokenAccount(
      provider,
      sundialLiquidityWalletPubkey,
    );
    expect(sundialLiquidityWallet.amount.toString()).not.equal('0');
  });

  it('Redeem principal tokens', async () => {
    const redeemAmount = amount.sub(fee);
    const tx = await sundialWrapper.redeemPrincipleTokens({
      amount: redeemAmount,
      userLiquidityWallet: liquidityVault,
    });
    await expectTX(tx, 'redeem principal tokens successfully').to.be.fulfilled;
    const userLiquidityWallet = await getTokenAccount(provider, liquidityVault);
    expect(userLiquidityWallet.amount.toString()).equal(
      amount.sub(fee).toString(),
    );
  });
  it('Redeem yield token', async () => {
    const redeemTx = await sundialWrapper.redeemYieldTokens({
      amount,
      userLiquidityWallet: liquidityVault,
    });
    await expectTX(redeemTx, 'redeem yield token').to.be.fulfilled;
    const userLiquidityWallet = await getTokenAccount(provider, liquidityVault);
    expect(userLiquidityWallet.amount.toString()).equal(
      amount.sub(fee).toString(),
    );
  });
});
