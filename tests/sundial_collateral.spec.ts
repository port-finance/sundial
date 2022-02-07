import { describe } from 'mocha';
import { MockOraclesWrapper } from '@port.finance/mock-oracles';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { BN, Provider, setProvider } from '@project-serum/anchor';
import {
  INITIAL_MINT_AMOUNT,
  makeSDK,
  RESERVE_INIT_LIQUIDITY,
} from './workspace';
import {
  DEFAULT_RESERVE_CONFIG,
  DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
  MOCK_ORACLES,
  PORT_LENDING,
} from './constants';
import {
  createDefaultReserve,
  createLendingMarket,
  ReserveState,
} from './utils';
import {
  createAccountRentExempt,
  createMintAndVault,
  sleep,
} from '@project-serum/common';
import {
  initObligationInstruction,
  ParsedAccount,
  Port,
  PORT_PROFILE_DATA_SIZE,
  refreshObligationInstruction,
  refreshReserveInstruction,
  ReserveData,
  ReserveInfo,
  ReserveParser,
} from '@port.finance/port-sdk';
import { expectTX } from '@saberhq/chai-solana';
import { assert, expect } from 'chai';
import {
  getATAAddress,
  getOrCreateATA,
  getTokenAccount,
} from '@saberhq/token-utils';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { Big } from 'big.js';
import { Buffer2BN, WAD } from '../src';

describe('SundialCollateral', () => {
  setProvider(Provider.local());
  const provider = Provider.local();

  const sdk = makeSDK();
  const sundialWrapper = sdk.sundialWrapper;
  const sundialCollateralWrapper = sdk.sundialCollateralWrapper;
  const sundialProfileWrapper = sdk.sundialProfileWrapper;

  const mockOraclesWrapper = new MockOraclesWrapper(provider, MOCK_ORACLES);
  let usdcOracleKP: Keypair;
  let serumOracleKP: Keypair;
  let lendingMarketKP: Keypair;
  let USDCReserveState: ReserveState;
  let serumReserveState: ReserveState;
  let sundialMarketBase: Keypair;
  let parsedUSDCReserve: ParsedAccount<ReserveData>;
  let parsedSerumReserve: ParsedAccount<ReserveData>;
  let serumReserveInfo: ReserveInfo;
  let USDCMint: PublicKey;
  let SerumMint: PublicKey;
  let usdcVault: PublicKey;
  let serumVault: PublicKey;

  const ACCURACY_TOLERANCE = new Big('1e-18');
  const port: Port = Port.forMainNet({
    connection: provider.connection,
  });

  const SERUM_PRICE = new BN(5);
  const USDC_PRICE = new BN(1);
  before(async () => {
    sundialMarketBase = await sdk.createSundialMarket();

    usdcOracleKP = await mockOraclesWrapper.createAccount(
      mockOraclesWrapper.PYTH_PRICE_ACCOUNT_SIZE,
    );
    serumOracleKP = await mockOraclesWrapper.createAccount(
      mockOraclesWrapper.PYTH_PRICE_ACCOUNT_SIZE,
    );
    lendingMarketKP = await createLendingMarket(provider);
    [USDCMint, usdcVault] = await createMintAndVault(
      provider,
      INITIAL_MINT_AMOUNT,
    );

    USDCReserveState = await createDefaultReserve(
      provider,
      RESERVE_INIT_LIQUIDITY,
      usdcVault,
      lendingMarketKP.publicKey,
      DEFAULT_RESERVE_CONFIG,
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [SerumMint, serumVault] = await createMintAndVault(
      provider,
      INITIAL_MINT_AMOUNT,
    );

    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    serumReserveState = await createDefaultReserve(
      provider,
      RESERVE_INIT_LIQUIDITY,
      serumVault,
      lendingMarketKP.publicKey,
      {
        ...DEFAULT_RESERVE_CONFIG,
        minBorrowRate: 200,
        maxBorrowRate: 200,
        optimalBorrowRate: 200,
        loanToValueRatio: 90,
        liquidationThreshold: 95,
      },
      serumOracleKP.publicKey,
    );

    parsedSerumReserve = ReserveParser({
      pubkey: serumReserveState.address,
      account: await provider.connection.getAccountInfo(
        serumReserveState.address,
      ),
    });
    parsedUSDCReserve = ReserveParser({
      pubkey: USDCReserveState.address,
      account: await provider.connection.getAccountInfo(
        USDCReserveState.address,
      ),
    });

    const serumDepositAmount = INITIAL_MINT_AMOUNT.divn(2);

    serumReserveInfo = await port.getReserve(serumReserveState.address);
    const { address: serumLPVault, instruction: createATAIx } =
      await getOrCreateATA({
        provider: sdk.provider,
        mint: parsedSerumReserve.data.collateral.mintPubkey,
      });
    const depositIxs = await serumReserveInfo.depositReserve({
      amount: serumDepositAmount,
      userLiquidityWallet: serumVault,
      destinationCollateralWallet: serumLPVault,
      userTransferAuthority: provider.wallet.publicKey,
    });

    const tx = new TransactionEnvelope(sdk.provider, [
      createATAIx,
      ...depositIxs,
    ]);
    expectTX(tx, 'Deposited Serum to get Serum LP').to.be.fulfilled;

    const obligationKp = await createAccountRentExempt(
      provider,
      PORT_LENDING,
      PORT_PROFILE_DATA_SIZE,
    );

    const initObIx = initObligationInstruction(
      obligationKp.publicKey,
      lendingMarketKP.publicKey,
      provider.wallet.publicKey,
    );
    const collateralizeAmount = serumDepositAmount.divn(2);
    const depositObligationCollateralIxs =
      await serumReserveInfo.depositObligationCollateral({
        amount: serumDepositAmount.divn(2),
        userCollateralWallet: serumLPVault,
        obligation: obligationKp.publicKey,
        obligationOwner: provider.wallet.publicKey,
        userTransferAuthority: provider.wallet.publicKey,
      });

    const depositTx = new Transaction();

    depositTx.add(initObIx, ...depositObligationCollateralIxs);

    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );

    await provider.send(depositTx);

    const borrowTx = new Transaction();
    borrowTx.add(
      refreshReserveInstruction(
        serumReserveState.address,
        serumOracleKP.publicKey,
      ),
    );
    borrowTx.add(
      refreshObligationInstruction(
        obligationKp.publicKey,
        [serumReserveState.address],
        [],
      ),
    );

    const borrowObligationCollateralIxs =
      await serumReserveInfo.borrowObligationLiquidity({
        amount: collateralizeAmount.muln(8).divn(10),
        userWallet: serumVault,
        obligation: obligationKp.publicKey,
        owner: provider.wallet.publicKey,
        userTransferAuthority: provider.wallet.publicKey,
      });
    borrowTx.add(...borrowObligationCollateralIxs);
    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    await provider.send(borrowTx);
  });

  const FEE_IN_BIPS = 10;
  const sundialName = 'USDC';
  const sundialCollateralName = 'Serum';
  it('Initialize Sundial', async () => {
    const duration = new BN(100); // 3 seconds from now
    const createTx = await sundialWrapper.createSundial({
      sundialName,
      owner: provider.wallet.publicKey,
      durationInSeconds: duration, // 8th of August 2028
      liquidityMint: USDCMint,
      reserve: parsedUSDCReserve,
      sundialMarket: sundialMarketBase.publicKey,
      oracle: usdcOracleKP.publicKey,
      lendingFeeInBips: FEE_IN_BIPS,
      borrowingFeeInBips: FEE_IN_BIPS,
    });
    await expectTX(createTx, 'Create sundial').to.be.fulfilled;
    await sundialWrapper.reloadData();
    const principleMintBump = (
      await sundialWrapper.getPrincipleMintAndBump()
    )[1];
    const yieldMintBump = (await sundialWrapper.getYieldMintAndBump())[1];
    expect(sundialWrapper.sundialData.durationInSeconds).to.bignumber.equal(
      duration,
    );
    expect(sundialWrapper.sundialData.bumps.principleMintBump).equal(
      principleMintBump,
    );
    expect(sundialWrapper.sundialData.bumps.yieldMintBump).equal(yieldMintBump);
    expect(sundialWrapper.sundialData.reserve).eqAddress(
      parsedUSDCReserve.pubkey,
    );
    expect(sundialWrapper.sundialData.portLendingProgram).eqAddress(
      PORT_LENDING,
    );
    expect(sundialWrapper.sundialData.oracle).eqAddress(usdcOracleKP.publicKey);
  });

  const liquidityCap = new BN(10_000_000_000);
  it('Initialize Sundial Collateral', async () => {
    const createTx = await sundialCollateralWrapper.createSundialCollateral({
      name: sundialCollateralName,
      reserve: parsedSerumReserve,
      sundialMarket: sundialMarketBase.publicKey,
      config: {
        ...DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
        liquidityCap,
      },
    });

    await expectTX(createTx, 'Create sundialCollateral').to.be.fulfilled;
    await sundialCollateralWrapper.reloadData();
    const sundialCollateralData =
      sundialCollateralWrapper.sundialCollateralData;
    const authorityBump = (
      await sundialCollateralWrapper.getAuthorityAndBump()
    )[1];
    const portLpBump = (
      await sundialCollateralWrapper.getLPTokenSupplyAndBump()
    )[1];
    expect(sundialCollateralData.bumps.portLpBump).equal(portLpBump);
    expect(sundialCollateralData.bumps.authorityBump).equal(authorityBump);
    expect(sundialCollateralData.portCollateralReserve).eqAddress(
      parsedSerumReserve.pubkey,
    );
    expect(sundialCollateralData.sundialMarket).eqAddress(
      sundialMarketBase.publicKey,
    );
  });

  it('Initialize Sundial Profile', async () => {
    const createTx = await sundialProfileWrapper.createSundialProfile(
      sundialMarketBase.publicKey,
    );

    await expectTX(createTx, 'Create sundial profile').to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    const sundialProfileData = sundialProfileWrapper.sundialProfileData;
    expect(sundialProfileData.sundialMarket).eqAddress(
      sundialMarketBase.publicKey,
    );
    expect(sundialProfileData.user).eqAddress(provider.wallet.publicKey);
  });

  it('Refresh Sundial Collateral Fail if reserve is not fresh', async () => {
    const refreshSundialCollateralTx =
      await sundialCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
        false,
      );
    await expectTX(refreshSundialCollateralTx, 'RefreshSundialCollateral').to.be
      .rejected;
  });

  it('Deposit Sundial Collateral (Init new collateral asset)', async () => {
    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      new BN(1),
      new BN(await provider.connection.getSlot()),
    );

    const refreshSundialCollateralTx =
      await sundialCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
      );
    await expectTX(refreshSundialCollateralTx, 'RefreshSundialCollateral').to.be
      .fulfilled;
    await sundialCollateralWrapper.reloadData();
    const beforeCollateralList =
      sundialProfileWrapper.sundialProfileData.collaterals;
    expect(beforeCollateralList).deep.equal([]);
    const beforeAmount = sundialProfileWrapper.getCollateralAmount(
      sundialCollateralWrapper.publicKey,
    );

    const depositAmount = new BN(10_000);
    const depositTx = await sundialProfileWrapper.depositSundialCollateral(
      depositAmount,
      sundialCollateralWrapper,
    );
    await expectTX(depositTx, 'Deposit Collateral').to.be.fulfilled;
    await sundialProfileWrapper.reloadData();

    const sundialProfileData = sundialProfileWrapper.sundialProfileData;
    sundialProfileData.collaterals[0].asset.totalValue;
    expect(sundialProfileData.collaterals.length).equal(1);
    expect(sundialProfileData.collaterals[0].sundialCollateral).eqAddress(
      sundialCollateralWrapper.publicKey,
    );
    const afterAmount = sundialProfileWrapper.getCollateralAmount(
      sundialCollateralWrapper.publicKey,
    );

    const afterValue = sundialProfileWrapper.getCollateralValue(
      sundialCollateralWrapper.publicKey,
    );
    const collateralPrice = Buffer2BN(
      sundialCollateralWrapper.sundialCollateralData.collateralPrice,
    );

    expect(afterAmount).to.bignumber.eq(beforeAmount.add(depositAmount));
    expect(afterValue).to.bignumber.eq(afterAmount.mul(collateralPrice));
  });

  it('Deposit Sundial Collateral (Existing collateral)', async () => {
    const beforeCollateralAmount =
      sundialProfileWrapper.sundialProfileData.collaterals.length;
    const beforeAmount = sundialProfileWrapper.getCollateralAmount(
      sundialCollateralWrapper.publicKey,
    );
    const depositAmount = new BN(10_000);
    const depositTx = await sundialProfileWrapper.depositSundialCollateral(
      depositAmount,
      sundialCollateralWrapper,
    );
    await expectTX(depositTx, 'Deposit Collateral').to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    const sundialProfileData = sundialProfileWrapper.sundialProfileData;

    expect(sundialProfileData.collaterals.length).equal(beforeCollateralAmount);
    expect(sundialProfileData.collaterals[0].sundialCollateral).eqAddress(
      sundialCollateralWrapper.publicKey,
    );
    const afterAmount = sundialProfileWrapper.getCollateralAmount(
      sundialCollateralWrapper.publicKey,
    );
    expect(afterAmount).to.bignumber.eq(beforeAmount.add(depositAmount));
    const afterValue = sundialProfileWrapper.getCollateralValue(
      sundialCollateralWrapper.publicKey,
    );
    const collateralPrice = Buffer2BN(
      sundialCollateralWrapper.sundialCollateralData.collateralPrice,
    );
    expect(afterValue).to.bignumber.eq(afterAmount.mul(collateralPrice));
  });

  it('Deposit Sundial Collateral (Fail Exceed Liquidity Cap)', async () => {
    const depositTx = await sundialProfileWrapper.depositSundialCollateral(
      liquidityCap,
      sundialCollateralWrapper,
    );
    await expectTX(depositTx, 'Deposit Collateral Liquidity').to.be.rejected;
  });

  it('Refresh SundialCollateral', async () => {
    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );

    const refreshSundialCollateralTx =
      await sundialCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
      );
    await expectTX(refreshSundialCollateralTx, 'RefreshSundialCollateral').to.be
      .fulfilled;
    const currentSlot = await provider.connection.getSlot();
    await sundialCollateralWrapper.reloadData();
    const sundialCollateralData =
      sundialCollateralWrapper.sundialCollateralData;
    expect(sundialCollateralData.lastUpdatedSlot.slot).bignumber.equal(
      new BN(currentSlot),
    );
    const collateralPrice = new Big(
      Buffer2BN(sundialCollateralData.collateralPrice).toString(),
    );
    serumReserveInfo = await port.getReserve(serumReserveState.address);
    const exchangeRate = serumReserveInfo.getExchangeRatio();
    const expectedPrice = new Big(SERUM_PRICE.mul(WAD).toString()).div(
      exchangeRate.getUnchecked(),
    );
    assert(
      collateralPrice
        .minus(expectedPrice)
        .abs()
        .div(expectedPrice)
        .lt(ACCURACY_TOLERANCE),
      'expected price ' +
        expectedPrice.toString() +
        'actual price ' +
        collateralPrice.toString(),
    );
  });

  it('Mint No Refresh', async () => {
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(1),
        sundialWrapper,
      ),
    ).to.be.rejected;
  });

  it('Withdraw No Refresh', async () => {
    await expectTX(
      await sundialProfileWrapper.withdrawSundialCollateral(
        new BN(1),
        sundialCollateralWrapper,
      ),
    ).to.be.rejected;
  });

  it('Mint Sundial pUSDC (Init new loan asset)', async () => {
    const mintAmount = new BN(10);
    const beforeLoanList = sundialProfileWrapper.sundialProfileData.loans;
    expect(beforeLoanList).deep.equal([]);
    const refreshProfileTx =
      await sundialProfileWrapper.refreshSundialProfile();
    await expectTX(refreshProfileTx, 'RefreshSundialProfile').to.be.fulfilled;
    await mockOraclesWrapper.writePythPrice(
      usdcOracleKP,
      USDC_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    const mintTx =
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        mintAmount,
        sundialWrapper,
      );
    await expectTX(mintTx).to.be.fulfilled;
    const userPrincipleWallet = await sundialWrapper.getUserPrincipleWallet();
    const principleBalance = (
      await provider.connection.getTokenAccountBalance(userPrincipleWallet)
    ).value;
    const borrowFee = sundialWrapper.getBorrowFee(mintAmount);
    expect(mintAmount.sub(borrowFee).toString()).equal(principleBalance.amount);
    await sundialProfileWrapper.reloadData();
    const sundialProfileData = sundialProfileWrapper.sundialProfileData;
    expect(sundialProfileData.loans.length).equal(1);

    const sundialLoan = sundialProfileData.loans[0];
    expect(sundialLoan.sundial).eqAddress(sundialWrapper.publicKey);

    expect(sundialLoan.oracle).eqAddress(usdcOracleKP.publicKey);
    expect(sundialLoan.asset.amount).to.bignumber.equal(mintAmount);
    expect(Buffer2BN(sundialLoan.asset.totalValue)).to.bignumber.equal(
      mintAmount.mul(USDC_PRICE).mul(WAD),
    );
  });

  it('Refresh SundialProfile', async () => {
    await mockOraclesWrapper.writePythPrice(
      usdcOracleKP,
      USDC_PRICE.muln(2),
      new BN(await provider.connection.getSlot()),
    );
    const refreshProfileTx =
      await sundialProfileWrapper.refreshSundialProfile();
    await expectTX(refreshProfileTx, 'RefreshSundialProfile').to.be.fulfilled;
    await sundialProfileWrapper.reloadData();

    const sundialCollateral = sundialProfileWrapper.getCollateral(
      sundialCollateralWrapper.publicKey,
    );
    expect(Buffer2BN(sundialCollateral.asset.totalValue)).to.bignumber.eq(
      sundialCollateral.asset.amount.mul(
        Buffer2BN(
          sundialCollateralWrapper.sundialCollateralData.collateralPrice,
        ),
      ),
    );

    const sundialLoan = sundialProfileWrapper.getLoan(sundialWrapper.publicKey);
    expect(Buffer2BN(sundialLoan.asset.totalValue)).to.bignumber.eq(
      sundialLoan.asset.amount.mul(USDC_PRICE.mul(WAD).muln(2)),
    );

    await mockOraclesWrapper.writePythPrice(
      usdcOracleKP,
      USDC_PRICE,
      new BN(await provider.connection.getSlot()),
    );

    await expectTX(
      await sundialProfileWrapper.refreshSundialProfile(),
      'RefreshSundialProfile',
    ).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
  });

  it('Mint Sundial pUSDC (Existing loan)', async () => {
    const mintAmount = new BN(10);
    const beforeLoanLen = sundialProfileWrapper.sundialProfileData.loans.length;
    const beforeLoan = sundialProfileWrapper.sundialProfileData.loans[0];
    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );

    const refreshSundialCollateralTx =
      await sundialCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
      );

    await expectTX(refreshSundialCollateralTx, 'RefreshSundialCollateral').to.be
      .fulfilled;

    const refreshProfileTx =
      await sundialProfileWrapper.refreshSundialProfile();
    await expectTX(refreshProfileTx, 'RefreshSundialProfile').to.be.fulfilled;

    const mintTx =
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        mintAmount,
        sundialWrapper,
      );
    await expectTX(mintTx).to.be.fulfilled;

    await sundialProfileWrapper.reloadData();

    expect(sundialProfileWrapper.sundialProfileData.loans.length).equal(
      beforeLoanLen,
    );
    const afterLoan = sundialProfileWrapper.sundialProfileData.loans[0];
    expect(afterLoan.sundial).eqAddress(sundialWrapper.publicKey);
    expect(afterLoan.oracle).eqAddress(usdcOracleKP.publicKey);
    expect(afterLoan.asset.amount).to.bignumber.equal(
      beforeLoan.asset.amount.add(mintAmount),
    );
    expect(Buffer2BN(afterLoan.asset.totalValue)).to.bignumber.equal(
      afterLoan.asset.amount.mul(USDC_PRICE).mul(WAD),
    );
  });

  it('Mint too much Sundial pUSDC ', async () => {
    const borrowingPower = sundialProfileWrapper.getBorrowingPower();
    const mintedValue = sundialProfileWrapper.getTotalLoanValue();
    const remainingMintPower = borrowingPower.sub(mintedValue);
    const remainingMintAmount = remainingMintPower.div(USDC_PRICE).div(WAD);
    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    const refreshProfileTx =
      await sundialProfileWrapper.refreshSundialProfile();
    await expectTX(refreshProfileTx, 'RefreshSundialProfile').to.be.fulfilled;
    await mockOraclesWrapper.writePythPrice(
      usdcOracleKP,
      USDC_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    const mintTx =
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        remainingMintAmount,
        sundialWrapper,
      );
    await expectTX(mintTx).to.be.fulfilled;
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(1),
        sundialWrapper,
      ),
    ).to.be.rejected;
  });

  it('Repay USDC ', async () => {
    await sundialProfileWrapper.reloadData();
    const beforeMintedAmount = sundialProfileWrapper.getLoanAmount(
      sundialWrapper.publicKey,
    );
    const repayAmount = beforeMintedAmount.divn(2);
    const repayTx1 = await sundialProfileWrapper.repaySundialLiquidity(
      repayAmount,
      sundialWrapper,
      usdcVault,
    );
    await expectTX(repayTx1).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    const afterMintedAmount = sundialProfileWrapper.getLoanAmount(
      sundialWrapper.publicKey,
    );
    expect(beforeMintedAmount.sub(afterMintedAmount)).to.bignumber.equal(
      repayAmount,
    );
    const repayTx2 = await sundialProfileWrapper.repaySundialLiquidity(
      afterMintedAmount.muln(2),
      sundialWrapper,
      usdcVault,
    );
    const beforeLoanLen = sundialProfileWrapper.sundialProfileData.loans.length;
    await expectTX(repayTx2).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    expect(
      beforeLoanLen - sundialProfileWrapper.sundialProfileData.loans.length,
    ).equal(1);
  });

  it('Withdraw Collateral', async () => {
    const withdrawAmount = new BN(10);
    const refreshProfileTx =
      await sundialProfileWrapper.refreshSundialProfile();
    const userCollateralAccount = await getATAAddress({
      owner: provider.wallet.publicKey,
      mint: sundialCollateralWrapper.sundialCollateralData.collateralMint,
    });
    const beforeCollateralAccount = await getTokenAccount(
      sdk.provider,
      userCollateralAccount,
    );
    const beforeCollateralAmount = sundialProfileWrapper.getCollateralAmount(
      sundialCollateralWrapper.publicKey,
    );

    await expectTX(refreshProfileTx, 'RefreshSundialProfile').to.be.fulfilled;
    await expectTX(
      await sundialProfileWrapper.withdrawSundialCollateral(
        withdrawAmount,
        sundialCollateralWrapper,
      ),
    ).to.be.fulfilled;

    await sundialProfileWrapper.reloadData();
    await sundialCollateralWrapper.reloadData();
    const afterCollateralAccount = await getTokenAccount(
      sdk.provider,
      userCollateralAccount,
    );
    expect(
      afterCollateralAccount.amount.sub(beforeCollateralAccount.amount),
    ).to.bignumber.equal(withdrawAmount);
    const afterCollateralAmount = sundialProfileWrapper.getCollateralAmount(
      sundialCollateralWrapper.publicKey,
    );
    const afterCollateralValue = sundialProfileWrapper.getCollateralValue(
      sundialCollateralWrapper.publicKey,
    );
    expect(
      beforeCollateralAmount.sub(afterCollateralAmount),
    ).to.bignumber.equal(withdrawAmount);
    expect(afterCollateralValue).to.bignumber.equal(
      afterCollateralAmount.mul(
        Buffer2BN(
          sundialCollateralWrapper.sundialCollateralData.collateralPrice,
        ),
      ),
    );
  });

  it('Refresh Sundial Profile Fail, Sundial Collateral Stale', async () => {
    await sleep(5000);
    const refreshProfileTx =
      await sundialProfileWrapper.refreshSundialProfile();
    await expectTX(refreshProfileTx, 'RefreshSundialProfile').to.be.rejected;
  });

  it('Withdraw All Collateral', async () => {
    const withdrawAmount = new BN(1_000_000_000);
    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );

    const refreshSundialCollateralTx =
      await sundialCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
      );
    await expectTX(refreshSundialCollateralTx, 'RefreshSundialCollateral').to.be
      .fulfilled;
    await expectTX(await sundialProfileWrapper.refreshSundialProfile()).to.be
      .fulfilled;
    await expectTX(
      await sundialProfileWrapper.withdrawSundialCollateral(
        withdrawAmount,
        sundialCollateralWrapper,
      ),
    ).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    expect(sundialProfileWrapper.sundialProfileData.loans.length).equal(0);
  });

  it('Liquidation', async () => {
    const depositAmount = new BN(100);
    const mintAmount = new BN(91);
    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    await mockOraclesWrapper.writePythPrice(
      usdcOracleKP,
      USDC_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    await expectTX(
      await sundialCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
      ),
    ).to.be.fulfilled;
    await expectTX(await sundialProfileWrapper.refreshSundialProfile()).to.be
      .fulfilled;
    await expectTX(
      await sundialProfileWrapper.depositSundialCollateral(
        depositAmount,
        sundialCollateralWrapper,
      ),
    ).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    await mockOraclesWrapper.writePythPrice(
      serumOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    await mockOraclesWrapper.writePythPrice(
      usdcOracleKP,
      USDC_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    await expectTX(
      await sundialCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
      ),
    ).to.be.fulfilled;
    await expectTX(await sundialProfileWrapper.refreshSundialProfile()).to.be
      .fulfilled;
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        mintAmount,
        sundialWrapper,
      ),
    ).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    await mockOraclesWrapper.writePythPrice(
      usdcOracleKP,
      SERUM_PRICE,
      new BN(await provider.connection.getSlot()),
    );
    await expectTX(
      await sundialCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
      ),
    ).to.be.fulfilled;
    await expectTX(await sundialProfileWrapper.refreshSundialProfile()).to.be
      .fulfilled;
    const beforeUSDCBalance = await getTokenAccount(sdk.provider, usdcVault);
    const liquidationTx = await sundialProfileWrapper.liquidateSundialProfile(
      sundialCollateralWrapper,
      sundialWrapper,
      usdcVault,
    );
    await expectTX(liquidationTx, 'liquidate').to.be.fulfilled;
    const afterUSDCBalance = await getTokenAccount(sdk.provider, usdcVault);
    expect(
      beforeUSDCBalance.amount.sub(afterUSDCBalance.amount),
    ).to.bignumber.equal(mintAmount.addn(1).divn(2));
  });
});
