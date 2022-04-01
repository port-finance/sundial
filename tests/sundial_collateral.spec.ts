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
  addCheckers,
  BNChecker,
  checkAfter,
  checkBefore,
  checkBNDiff,
  checkBNEqual,
  checkMintAmountDiff,
  checkTokenBalanceDiff,
  createDefaultReserve,
  createLendingMarket,
  divCeil,
  divCeiln,
  getPythPrice,
  KeyChecker,
  numberChecker,
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
import { getATAAddress, getOrCreateATA, MAX_U64 } from '@saberhq/token-utils';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { Big } from 'big.js';
import {
  Buffer2BN,
  SundialCollateralConfig,
  SundialCollateralWrapper,
  SundialProfileCollateral,
  SundialProfileLoan,
  SundialWrapper,
  WAD,
} from '../src';
import invariant from 'tiny-invariant';

describe('SundialCollateral', () => {
  setProvider(Provider.local());
  const provider = Provider.local();

  const sdk = makeSDK();
  const sundialUSDCWrapper = sdk.sundialWrapper;
  const sundialSerumCollateralWrapper = sdk.sundialCollateralWrapper;
  const sundialPortWrapper = sdk.sundialWrapper;
  const sundialSolCollateralWrapper = sdk.sundialCollateralWrapper;
  const sundialSaberWrapper = sdk.sundialWrapper;

  const sundialProfileWrapper = sdk.sundialProfileWrapper;

  const mockOraclesWrapper = new MockOraclesWrapper(provider, MOCK_ORACLES);
  let usdcOracleKP: Keypair;
  let serumOracleKP: Keypair;
  let portOracleKP: Keypair;
  let solOracleKP: Keypair;
  let saberOracleKP: Keypair;

  let lendingMarketKP: Keypair;

  let USDCReserveState: ReserveState;
  let serumReserveState: ReserveState;
  let portReserveState: ReserveState;
  let solReserveState: ReserveState;
  let saberReserveState: ReserveState;

  let sundialMarketBase: Keypair;
  let parsedUSDCReserve: ParsedAccount<ReserveData>;
  let parsedSolReserve: ParsedAccount<ReserveData>;
  let parsedPortReserve: ParsedAccount<ReserveData>;
  let parsedSerumReserve: ParsedAccount<ReserveData>;
  let parsedSaberReserve: ParsedAccount<ReserveData>;

  let serumReserveInfo: ReserveInfo;
  let USDCMint: PublicKey;
  let portMint: PublicKey;
  let saberMint: PublicKey;
  let usdcVault: PublicKey;
  let serumVault: PublicKey;
  let portVault: PublicKey;
  let solVault: PublicKey;
  let saberVault: PublicKey;
  const ACCURACY_TOLERANCE = new Big('1e-18');
  const port: Port = Port.forMainNet({
    connection: provider.connection,
  });

  const SERUM_PRICE = new BN(5);
  const USDC_PRICE = new BN(1);
  const PORT_PRICE = new BN(2);
  const SOL_PRICE = new BN(100);
  const SABER_PRICE = new BN(3);
  //Set up
  before(async () => {
    sundialMarketBase = await sdk.createSundialMarket();

    [usdcOracleKP, solOracleKP, portOracleKP, serumOracleKP, saberOracleKP] =
      await Promise.all(
        Array(...Array(5)).map(async () => {
          return await mockOraclesWrapper.createAccount(
            mockOraclesWrapper.PYTH_PRICE_ACCOUNT_SIZE,
          );
        }),
      );

    await Promise.all(
      [
        [USDC_PRICE, usdcOracleKP],
        [SOL_PRICE, solOracleKP],
        [PORT_PRICE, portOracleKP],
        [SERUM_PRICE, serumOracleKP],
        [SABER_PRICE, saberOracleKP],
      ].map(async ([price, oracle]: [BN, Keypair]) => {
        await mockOraclesWrapper.writePythPrice(oracle, {
          price: price,
          slot: new BN(await provider.connection.getSlot()),
        });
      }),
    );

    lendingMarketKP = await createLendingMarket(provider);

    [
      [USDCMint, usdcVault],
      [, serumVault],
      [portMint, portVault],
      [saberMint, saberVault],
    ] = await Promise.all(
      Array(...Array(5)).map(async () => {
        return await createMintAndVault(
          provider,
          INITIAL_MINT_AMOUNT,
          undefined,
          0,
        );
      }),
    );

    [, solVault] = await createMintAndVault(
      provider,
      INITIAL_MINT_AMOUNT,
      undefined,
      3,
    );

    USDCReserveState = await createDefaultReserve(
      provider,
      RESERVE_INIT_LIQUIDITY,
      usdcVault,
      lendingMarketKP.publicKey,
      DEFAULT_RESERVE_CONFIG,
    );

    await mockOraclesWrapper.writePythPrice(portOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
    portReserveState = await createDefaultReserve(
      provider,
      RESERVE_INIT_LIQUIDITY,
      portVault,
      lendingMarketKP.publicKey,
      DEFAULT_RESERVE_CONFIG,
      portOracleKP.publicKey,
    );

    await mockOraclesWrapper.writePythPrice(saberOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
    saberReserveState = await createDefaultReserve(
      provider,
      RESERVE_INIT_LIQUIDITY,
      saberVault,
      lendingMarketKP.publicKey,
      DEFAULT_RESERVE_CONFIG,
      saberOracleKP.publicKey,
    );

    await mockOraclesWrapper.writePythPrice(solOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
    solReserveState = await createDefaultReserve(
      provider,
      RESERVE_INIT_LIQUIDITY,
      solVault,
      lendingMarketKP.publicKey,
      DEFAULT_RESERVE_CONFIG,
      solOracleKP.publicKey,
    );

    await mockOraclesWrapper.writePythPrice(serumOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
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

    [
      parsedSerumReserve,
      parsedUSDCReserve,
      parsedSolReserve,
      parsedPortReserve,
      parsedSaberReserve,
    ] = await Promise.all(
      [
        serumReserveState,
        USDCReserveState,
        solReserveState,
        portReserveState,
        saberReserveState,
      ].map(async reserveState =>
        ReserveParser({
          pubkey: reserveState.address,
          account: await provider.connection.getAccountInfo(
            reserveState.address,
          ),
        }),
      ),
    );

    await updateOraclesSlot();
    const depositAmount = INITIAL_MINT_AMOUNT.divn(2);
    await Promise.all(
      [
        [serumReserveState, parsedSerumReserve, serumVault],
        [solReserveState, parsedSolReserve, solVault],
      ].map(
        async ([reserveState, parsedRserve, liquidityVault]: [
          ReserveState,
          ParsedAccount<ReserveData>,
          PublicKey,
        ]) => {
          const reserveInfo = await port.getReserve(reserveState.address);
          const { address: lPVault, instruction: createATAIx } =
            await getOrCreateATA({
              provider: sdk.provider,
              mint: parsedRserve.data.collateral.mintPubkey,
            });
          const depositIxs = await reserveInfo.depositReserve({
            amount: depositAmount,
            userLiquidityWallet: liquidityVault,
            destinationCollateralWallet: lPVault,
            userTransferAuthority: provider.wallet.publicKey,
          });
          const tx = new TransactionEnvelope(sdk.provider, [
            createATAIx,
            ...depositIxs,
          ]);
          expectTX(tx, 'Deposit to get LP').to.be.fulfilled;
        },
      ),
    );

    serumReserveInfo = await port.getReserve(serumReserveState.address);

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

    const collateralizeAmount = depositAmount.divn(2);
    const depositObligationCollateralIxs =
      await serumReserveInfo.depositObligationCollateral({
        amount: collateralizeAmount,
        userCollateralWallet: await getATAAddress({
          mint: parsedSerumReserve.data.collateral.mintPubkey,
          owner: provider.wallet.publicKey,
        }),
        obligation: obligationKp.publicKey,
        obligationOwner: provider.wallet.publicKey,
        userTransferAuthority: provider.wallet.publicKey,
      });

    const depositTx = new Transaction();

    depositTx.add(initObIx, ...depositObligationCollateralIxs);

    await mockOraclesWrapper.writePythPrice(serumOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });

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
    await mockOraclesWrapper.writePythPrice(serumOracleKP, {
      price: SERUM_PRICE,
      slot: new BN(await provider.connection.getSlot()),
    });
    await provider.send(borrowTx);
  });

  const FEE_IN_BIPS = 10;
  const usdcSundialName = 'USDC';
  const portSundialName = 'Port';
  const saberSundialName = 'SABER';

  const solSundialCollateralName = 'SOL';
  const serumSundialCollateralName = 'Serum';

  const updateOraclesSlot = async () => {
    await mockOraclesWrapper.writePythPrice(serumOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
    await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
    await mockOraclesWrapper.writePythPrice(portOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
    await mockOraclesWrapper.writePythPrice(solOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
    await mockOraclesWrapper.writePythPrice(saberOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
  };

  const refreshProfile = async (
    ...collateralAndReserves: [
      SundialCollateralWrapper,
      ParsedAccount<ReserveData>,
    ][]
  ) => {
    await updateOraclesSlot();
    await Promise.all(
      collateralAndReserves.map(
        async ([sundialCollateralWrapper, parsedReserve]) => {
          await expectTX(
            await sundialCollateralWrapper.refreshSundialCollateral(
              parsedReserve,
            ),
          ).to.be.fulfilled;
          await expectTX(
            await sundialProfileWrapper.refreshSundialProfile(),
            'RefreshSundialCollateral',
          ).to.be.fulfilled;
          await sundialCollateralWrapper.reloadData();
        },
      ),
    );
    await sundialProfileWrapper.reloadData();
  };

  it('Initialize Sundial', async () => {
    const duration = new BN(3600); // 3600 seconds from now
    const createTx = await sundialUSDCWrapper.createSundial({
      sundialName: usdcSundialName,
      owner: provider.wallet.publicKey,
      durationInSeconds: duration,
      liquidityMint: USDCMint,
      reserve: parsedUSDCReserve,
      sundialMarket: sundialMarketBase.publicKey,
      oracle: usdcOracleKP.publicKey,
      lendingFeeInBips: FEE_IN_BIPS,
      borrowingFeeInBips: FEE_IN_BIPS,
    });
    const principleMintBump = (
      await sundialUSDCWrapper.getPrincipleMintAndBump()
    )[1];
    const yieldMintBump = (await sundialUSDCWrapper.getYieldMintAndBump())[1];

    await addCheckers(
      async () => {
        await expectTX(createTx, 'Create sundial').to.be.fulfilled;
        await sundialUSDCWrapper.reloadData();
      },
      checkAfter(
        async () => sundialUSDCWrapper.sundialData.durationInSeconds,
        new BNChecker(duration).eq().toChecker(),
      ),
      checkAfter(
        async () => sundialUSDCWrapper.sundialData.reserve,
        new KeyChecker(parsedUSDCReserve.pubkey).eq().toChecker(),
      ),
      checkAfter(
        async () => sundialUSDCWrapper.sundialData.bumps.principleMintBump,
        new numberChecker(principleMintBump).eq().toChecker(),
      ),
      checkAfter(
        async () => sundialUSDCWrapper.sundialData.bumps.yieldMintBump,
        new numberChecker(yieldMintBump).eq().toChecker(),
      ),
      checkAfter(
        async () => sundialUSDCWrapper.sundialData.portLendingProgram,
        new KeyChecker(PORT_LENDING).eq().toChecker(),
      ),
      checkAfter(
        async () => sundialUSDCWrapper.sundialData.oracle,
        new KeyChecker(usdcOracleKP.publicKey).eq().toChecker(),
      ),
    );

    await mockOraclesWrapper.writePythPrice(saberOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });
    await expectTX(
      await sundialSaberWrapper.createSundial({
        sundialName: saberSundialName,
        owner: provider.wallet.publicKey,
        durationInSeconds: duration,
        liquidityMint: saberMint,
        reserve: parsedSaberReserve,
        sundialMarket: sundialMarketBase.publicKey,
        oracle: saberOracleKP.publicKey,
        lendingFeeInBips: FEE_IN_BIPS,
        borrowingFeeInBips: FEE_IN_BIPS,
      }),
      'Create sundial saber',
    ).to.be.fulfilled;
    await sundialSaberWrapper.reloadData();
  });

  const LIQUIDITY_CAP = new BN(10_000_000_000);
  it('Initialize Sundial Collateral', async () => {
    const createTx =
      await sundialSerumCollateralWrapper.createSundialCollateral({
        name: serumSundialCollateralName,
        reserve: parsedSerumReserve,
        sundialMarket: sundialMarketBase.publicKey,
        config: {
          ...DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
          liquidityCap: LIQUIDITY_CAP,
        },
      });
    let sundialCollateralData;
    const authorityBump = (
      await sundialSerumCollateralWrapper.getAuthorityAndBump()
    )[1];

    const portLpBump = (
      await sundialSerumCollateralWrapper.getLPTokenSupplyAndBump()
    )[1];
    await addCheckers(
      async () => {
        await expectTX(createTx, 'Create sundialCollateral').to.be.fulfilled;
        await sundialSerumCollateralWrapper.reloadData();
        sundialCollateralData =
          sundialSerumCollateralWrapper.sundialCollateralData;
      },
      checkAfter(
        async () => sundialCollateralData.bumps.portLpBump,
        new numberChecker(portLpBump).eq('Check port Lp bump').toChecker(),
      ),
      checkAfter(
        async () => sundialCollateralData.bumps.authorityBump,
        new numberChecker(authorityBump).eq('Check authority bump').toChecker(),
      ),
      checkAfter(
        async () => sundialCollateralData.portCollateralReserve,
        new KeyChecker(parsedSerumReserve.pubkey).eq().toChecker(),
      ),
      checkAfter(
        async () => sundialCollateralData.sundialMarket,
        new KeyChecker(sundialMarketBase.publicKey).eq().toChecker(),
      ),
    );

    //Create Sundial Sol Collateral
    await expectTX(
      await sundialSolCollateralWrapper.createSundialCollateral({
        name: solSundialCollateralName,
        reserve: parsedSolReserve,
        sundialMarket: sundialMarketBase.publicKey,
        config: DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
      }),
    ).to.be.fulfilled;
    await sundialSolCollateralWrapper.reloadData();
  });

  it('Initialize Sundial Profile', async () => {
    let sundialProfileData;
    await addCheckers(
      async () => {
        const createTx = await sundialProfileWrapper.createSundialProfile(
          sundialMarketBase.publicKey,
        );

        await expectTX(createTx, 'Create sundial profile').to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
        sundialProfileData = sundialProfileWrapper.sundialProfileData;
      },
      checkAfter(
        async () => sundialProfileData.sundialMarket,
        new KeyChecker(sundialMarketBase.publicKey).eq().toChecker(),
      ),
      checkAfter(
        async () => sundialProfileData.user,
        new KeyChecker(provider.wallet.publicKey).eq().toChecker(),
      ),
    );
  });

  it('Refresh Sundial Collateral Fail if reserve is not fresh', async () => {
    const refreshSundialCollateralTx =
      await sundialSerumCollateralWrapper.refreshSundialCollateral(
        parsedSerumReserve,
        false,
      );
    await expectTX(refreshSundialCollateralTx, 'RefreshSundialCollateral').to.be
      .rejected;
  });

  const collateralBalanceDiffChecks = (
    depositAmount: BN,
    sundialCollateralWrapper: SundialCollateralWrapper,
  ) => [
    checkTokenBalanceDiff(
      sdk.provider,
      async () =>
        (await sundialCollateralWrapper.getCollateralWalletAndBump())[0],
      depositAmount,
    ),
    checkTokenBalanceDiff(
      sdk.provider,
      async () =>
        getATAAddress({
          mint: sundialCollateralWrapper.sundialCollateralData.collateralMint,
          owner: provider.wallet.publicKey,
        }),
      depositAmount.neg(),
    ),
  ];

  const sundialProfileCollateralStateChecks = (
    depositAmount: BN,
    sundialCollateralWrapper: SundialCollateralWrapper,
    msg = '',
  ) => [
    checkBNDiff(
      async () => {
        await sundialCollateralWrapper.reloadData();
        return sundialProfileWrapper.getCollateralAmount(
          sundialCollateralWrapper.publicKey,
        );
      },
      depositAmount,
      `Check sundial collateral lp wallet, ${msg}`,
    ),
    sundialProfileCollateralValidate(sundialCollateralWrapper, msg),
  ];

  const sundialProfileCollateralValidate = (
    sundialCollateralWrapper: SundialCollateralWrapper,
    msg = '',
  ) =>
    checkAfter(
      async () => {
        await sundialCollateralWrapper.reloadData();
        const data = sundialCollateralWrapper.sundialCollateralData;
        return [
          Buffer2BN(data.collateralPrice),
          data.sundialCollateralConfig,
          sundialProfileWrapper.getCollateral(
            sundialCollateralWrapper.publicKey,
          ),
        ];
      },
      async ([price, config, collateral]: [
        BN,
        SundialCollateralConfig,
        SundialProfileCollateral,
      ]) => {
        invariant(collateral, 'Sundial Profile Collateral Not Exist');
        expect(
          Buffer2BN(collateral.asset.totalValue),
          `Check collateral value in profile collateral, ${msg}`,
        ).to.bignumber.eq(price.mul(collateral.asset.amount));
        expect(
          collateral.sundialCollateral,
          `Check collateral pubkey in profile collateral, ${msg}`,
        ).eqAddress(sundialCollateralWrapper.publicKey);
        expect(
          collateral.config.ltv.ltv,
          `Check ltv in profile collateral, ${msg}`,
        ).eq(config.ltv.ltv);
        expect(
          collateral.config.liquidationConfig.liquidationThreshold,
          `Check liquidation threshold in profile collateral, ${msg}`,
        ).eq(config.liquidationConfig.liquidationThreshold);
        expect(
          collateral.config.liquidationConfig.liquidationPenalty,
          `Check liquidation penalty in profile collateral, ${msg}`,
        ).eq(config.liquidationConfig.liquidationPenalty);
      },
    );
  const checkSundialProfileNumOfCollateralDiff = (diff: number) =>
    checkBNDiff(
      async () =>
        new BN(sundialProfileWrapper.sundialProfileData.collaterals.length),
      new BN(diff),
    );

  it('Deposit Sundial Collateral (Init new collateral asset)', async () => {
    const depositAmount = new BN(10_000);
    await addCheckers(
      async () => {
        await mockOraclesWrapper.writePythPrice(serumOracleKP, {
          slot: new BN(await provider.connection.getSlot()),
        });
        await expectTX(
          await sundialSerumCollateralWrapper.refreshSundialCollateral(
            parsedSerumReserve,
          ),
          'RefreshSundialCollateral',
        ).to.be.fulfilled;
        const depositTx = await sundialProfileWrapper.depositSundialCollateral(
          depositAmount,
          sundialSerumCollateralWrapper,
        );
        await expectTX(depositTx, 'Deposit Collateral').to.be.fulfilled;

        await sundialProfileWrapper.reloadData();
        await sundialSerumCollateralWrapper.reloadData();
      },
      ...collateralBalanceDiffChecks(
        depositAmount,
        sundialSerumCollateralWrapper,
      ),
      ...sundialProfileCollateralStateChecks(
        depositAmount,
        sundialSerumCollateralWrapper,
      ),
      checkSundialProfileNumOfCollateralDiff(1),
      checkBefore(
        async () => sundialProfileWrapper.sundialProfileData.collaterals,
        async collaterals => {
          expect(collaterals).deep.equal([]);
        },
      ),
    );
  });

  it('Deposit Sundial Collateral (Existing collateral)', async () => {
    const depositAmount = new BN(10_000);
    await addCheckers(
      async () => {
        const depositTx = await sundialProfileWrapper.depositSundialCollateral(
          depositAmount,
          sundialSerumCollateralWrapper,
        );
        await expectTX(depositTx, 'Deposit Collateral').to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      ...collateralBalanceDiffChecks(
        depositAmount,
        sundialSerumCollateralWrapper,
      ),
      ...sundialProfileCollateralStateChecks(
        depositAmount,
        sundialSerumCollateralWrapper,
      ),
      checkSundialProfileNumOfCollateralDiff(0),
    );
  });

  it('Deposit Sundial Collateral (Fail Exceed Liquidity Cap)', async () => {
    const depositTx = await sundialProfileWrapper.depositSundialCollateral(
      LIQUIDITY_CAP,
      sundialSerumCollateralWrapper,
    );
    await expectTX(depositTx, 'Deposit Collateral Liquidity').to.be.rejected;
  });

  const checkCollateralSlot = (sundialCollateral: SundialCollateralWrapper) =>
    checkAfter(async () => {
      const currentSlot = await provider.connection.getSlot();
      return [
        new BN(currentSlot),
        sundialCollateral.sundialCollateralData.lastUpdatedSlot.slot,
      ];
    }, checkBNEqual('Check Slot is updated'));

  const checkCollateralPrice = (
    sundialCollateral: SundialCollateralWrapper,
    reserveState: ReserveState,
  ) =>
    checkAfter(
      async () => {
        const collateralPrice = new Big(
          Buffer2BN(
            sundialCollateral.sundialCollateralData.collateralPrice,
          ).toString(),
        );
        const reserveInfo = await port.getReserve(reserveState.address);
        const price = reserveInfo.getMarkPrice().getRaw();
        const exchangeRate = reserveInfo.getExchangeRatio();
        const expectedCollateralPrice = price
          .mul(WAD.toString())
          .div(exchangeRate.getUnchecked());
        return [collateralPrice, expectedCollateralPrice];
      },
      async ([collateralPrice, expectedCollateralPrice]) => {
        assert(
          collateralPrice
            .minus(expectedCollateralPrice)
            .abs()
            .div(expectedCollateralPrice)
            .lt(ACCURACY_TOLERANCE),
          'expected price ' +
            expectedCollateralPrice.toString() +
            ' actual price ' +
            collateralPrice.toString(),
        );
      },
    );

  it('Refresh SundialCollateral', async () => {
    await addCheckers(
      async () => {
        await mockOraclesWrapper.writePythPrice(serumOracleKP, {
          slot: new BN(await provider.connection.getSlot()),
        });

        const refreshSundialCollateralTx =
          await sundialSerumCollateralWrapper.refreshSundialCollateral(
            parsedSerumReserve,
          );
        await expectTX(refreshSundialCollateralTx, 'RefreshSundialCollateral')
          .to.be.fulfilled;
        await sundialSerumCollateralWrapper.reloadData();
      },
      checkCollateralSlot(sundialSerumCollateralWrapper),
      checkCollateralPrice(sundialSerumCollateralWrapper, serumReserveState),
    );
  });

  it('Mint No Refresh', async () => {
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(1),
        sundialUSDCWrapper,
      ),
    ).to.be.rejected;
  });

  it('Withdraw No Refresh', async () => {
    await expectTX(
      await sundialProfileWrapper.withdrawSundialCollateral(
        new BN(1),
        sundialSerumCollateralWrapper,
      ),
    ).to.be.rejected;
  });

  const loanBalanceDiffChecks = (
    mintAmount: BN,
    sundialWrapper: SundialWrapper,
    msg = '',
  ) => {
    const borrowFee = sundialUSDCWrapper.getBorrowFee(mintAmount);
    return [
      checkMintAmountDiff(
        sdk.provider,
        async () => (await sundialWrapper.getPrincipleMintAndBump())[0],
        mintAmount,
        `Check minted loan token amount diff within the tx, ${msg}`,
      ),
      checkTokenBalanceDiff(
        sdk.provider,
        () => sundialWrapper.getUserPrincipleWallet(),
        mintAmount.sub(borrowFee),
        `Check user loan token diff within the tx, ${msg}`,
      ),
    ];
  };

  const sundialProfileLoanStateChecks = (
    mintAmount: BN,
    sundialWrapper: SundialWrapper,
    msg = '',
  ) => [
    checkBNDiff(
      async () => {
        await sundialProfileWrapper.reloadData();
        return sundialProfileWrapper.getLoanAmount(sundialWrapper.publicKey);
      },
      mintAmount,
      msg,
    ),
    sundialProfileLoanValidate(sundialWrapper, msg),
  ];

  const sundialProfileLoanValidate = (
    sundialWrapper: SundialWrapper,
    msg = '',
  ) =>
    checkAfter(
      async () => {
        await sundialProfileWrapper.reloadData();
        return sundialProfileWrapper.getLoan(sundialWrapper.publicKey);
      },
      async (loan: SundialProfileLoan) => {
        invariant(loan, 'Sundial Profile Loan Not Exist');

        const oracle = sundialWrapper.sundialData.oracle;
        const price = await getPythPrice(provider, oracle);

        expect(
          Buffer2BN(loan.asset.totalValue),
          `Check asset value in profile loan ${msg}`,
        ).to.bignumber.eq(
          new BN(price.mul(WAD.toString()).toString()).mul(loan.asset.amount),
        );
        expect(loan.sundial, `Check sundial in profile loan ${msg}`).eqAddress(
          sundialUSDCWrapper.publicKey,
        );
        expect(loan.oracle, `Check oracle in profile loan ${msg}`).eqAddress(
          oracle,
        );
        expect(
          loan.maturityUnixTimestamp,
          `Check maturity timestamp in profile loan ${msg}`,
        ).to.bignumber.equal(sundialUSDCWrapper.sundialData.endUnixTimeStamp);
      },
    );

  const checkSundialProfileNumOfLoanDiff = (diff: number) =>
    checkBNDiff(
      async () => new BN(sundialProfileWrapper.sundialProfileData.loans.length),
      new BN(diff),
    );

  it('Mint Sundial pUSDC (Init new loan asset)', async () => {
    const mintAmount = new BN(10);
    await addCheckers(
      async () => {
        await expectTX(
          await sundialProfileWrapper.refreshSundialProfile(),
          'RefreshSundialProfile',
        ).to.be.fulfilled;
        await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
          slot: new BN(await provider.connection.getSlot()),
        });
        const mintTx =
          await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
            mintAmount,
            sundialUSDCWrapper,
          );
        await expectTX(mintTx).to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      checkBefore(
        async () => sundialProfileWrapper.sundialProfileData.loans,
        async beforeLoanList => {
          expect(beforeLoanList).deep.equal([]);
        },
      ),
      checkSundialProfileNumOfLoanDiff(1),
      ...sundialProfileLoanStateChecks(mintAmount, sundialUSDCWrapper),
      ...loanBalanceDiffChecks(mintAmount, sundialUSDCWrapper),
    );
  });

  it('Refresh SundialProfile', async () => {
    await addCheckers(
      async () => {
        //Change USDC price for refresh profile, collateral price doesn't need change to check,
        //Since it is changing within the time with positive interest, and the collateral is refreshed after last
        //profile refreshment
        await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
          price: USDC_PRICE.muln(2),
          slot: new BN(await provider.connection.getSlot()),
        });
        const refreshProfileTx =
          await sundialProfileWrapper.refreshSundialProfile();
        await expectTX(refreshProfileTx, 'RefreshSundialProfile').to.be
          .fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      sundialProfileCollateralValidate(sundialSerumCollateralWrapper),
      sundialProfileLoanValidate(sundialUSDCWrapper),
    );

    //recover USDC price
    await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
      price: USDC_PRICE,
      slot: new BN(await provider.connection.getSlot()),
    });
    await expectTX(
      await sundialProfileWrapper.refreshSundialProfile(),
      'RefreshSundialProfile',
    ).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
  });

  it('Mint Sundial pUSDC (Existing loan)', async () => {
    const mintAmount = new BN(10);
    await addCheckers(
      async () => {
        await mockOraclesWrapper.writePythPrice(serumOracleKP, {
          slot: new BN(await provider.connection.getSlot()),
        });

        await refreshProfile([
          sundialSerumCollateralWrapper,
          parsedSerumReserve,
        ]);

        const mintTx =
          await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
            mintAmount,
            sundialUSDCWrapper,
          );
        await expectTX(mintTx).to.be.fulfilled;

        await sundialProfileWrapper.reloadData();
      },
      checkSundialProfileNumOfLoanDiff(0),
      ...sundialProfileLoanStateChecks(mintAmount, sundialUSDCWrapper),
      ...loanBalanceDiffChecks(mintAmount, sundialUSDCWrapper),
    );
  });

  it('Mint too much Sundial pUSDC ', async () => {
    const borrowingPower = sundialProfileWrapper.getBorrowingPower();
    const mintedValue = sundialProfileWrapper.getTotalLoanValue();
    const remainingMintPower = borrowingPower.sub(mintedValue);
    const remainingMintAmount = remainingMintPower.div(USDC_PRICE).div(WAD);
    await mockOraclesWrapper.writePythPrice(serumOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });

    await expectTX(
      await sundialProfileWrapper.refreshSundialProfile(),
      'RefreshSundialProfile',
    ).to.be.fulfilled;
    await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });

    const mintTx =
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        remainingMintAmount,
        sundialUSDCWrapper,
      );
    await expectTX(mintTx).to.be.fulfilled;
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(1),
        sundialUSDCWrapper,
      ),
    ).to.be.rejected;
    await sundialProfileWrapper.reloadData();
  });

  const repayBalanceDiffChecks = (
    repayAmount: BN,
    sundialWrapper: SundialWrapper,
    userLiquidityWallet: PublicKey,
    msg?: string,
  ) => [
    checkTokenBalanceDiff(
      sdk.provider,
      async () => (await sundialWrapper.getLiquidityTokenSupplyAndBump())[0],
      repayAmount,
      `Check sundial liquidity token account diff, ${msg}`,
    ),
    checkTokenBalanceDiff(
      sdk.provider,
      async () => userLiquidityWallet,
      repayAmount.neg(),
      `Check user liquidity token account diff, ${msg}`,
    ),
  ];

  it('Repay USDC (half loan)', async () => {
    const mintedAmount = sundialProfileWrapper.getLoanAmount(
      sundialUSDCWrapper.publicKey,
    );
    const repayAmount = mintedAmount.divn(2);
    await addCheckers(
      async () => {
        const repayTx = await sundialProfileWrapper.repaySundialLiquidity(
          repayAmount,
          sundialUSDCWrapper,
          usdcVault,
        );
        await expectTX(repayTx).to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      checkSundialProfileNumOfLoanDiff(0),
      ...repayBalanceDiffChecks(repayAmount, sundialUSDCWrapper, usdcVault),
      ...sundialProfileLoanStateChecks(repayAmount.neg(), sundialUSDCWrapper),
    );
  });

  it('Repay USDC (all loan)', async () => {
    const repayAmount = sundialProfileWrapper.getLoanAmount(
      sundialUSDCWrapper.publicKey,
    );
    await addCheckers(
      async () => {
        const repayTx = await sundialProfileWrapper.repaySundialLiquidity(
          repayAmount,
          sundialUSDCWrapper,
          usdcVault,
        );
        await expectTX(repayTx).to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      ...repayBalanceDiffChecks(repayAmount, sundialUSDCWrapper, usdcVault),
      checkSundialProfileNumOfLoanDiff(-1),
    );
  });

  it('Repay USDC (more than minted)', async () => {
    const mintTx =
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(100),
        sundialUSDCWrapper,
      );
    await expectTX(mintTx).to.be.fulfilled;

    await sundialProfileWrapper.reloadData();
    const mintedAmount = sundialProfileWrapper.getLoanAmount(
      sundialUSDCWrapper.publicKey,
    );
    const repayAmount = mintedAmount.addn(1);
    await addCheckers(
      async () => {
        const repayTx = await sundialProfileWrapper.repaySundialLiquidity(
          repayAmount,
          sundialUSDCWrapper,
          usdcVault,
        );
        await expectTX(repayTx).to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      ...repayBalanceDiffChecks(mintedAmount, sundialUSDCWrapper, usdcVault),
      checkSundialProfileNumOfLoanDiff(-1),
    );
  });

  it('Withdraw Collateral (half collateral)', async () => {
    const withdrawAmount = sundialProfileWrapper
      .getCollateralAmount(sundialSerumCollateralWrapper.publicKey)
      .divn(2);
    await mockOraclesWrapper.writePythPrice(serumOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });

    await refreshProfile([sundialSerumCollateralWrapper, parsedSerumReserve]);

    await addCheckers(
      async () => {
        await expectTX(
          await sundialProfileWrapper.withdrawSundialCollateral(
            withdrawAmount,
            sundialSerumCollateralWrapper,
          ),
        ).to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
        await sundialSerumCollateralWrapper.reloadData();
      },
      ...collateralBalanceDiffChecks(
        withdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
      ...sundialProfileCollateralStateChecks(
        withdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
      checkSundialProfileNumOfCollateralDiff(0),
    );
  });

  it('Refresh Sundial Profile Fail, Sundial Collateral Stale', async () => {
    await sleep(5000);
    const refreshProfileTx =
      await sundialProfileWrapper.refreshSundialProfile();
    await expectTX(refreshProfileTx, 'RefreshSundialProfile').to.be.rejected;
  });

  it('Withdraw All Collateral (All collateral)', async () => {
    const withdrawAmount = sundialProfileWrapper.getCollateralAmount(
      sundialSerumCollateralWrapper.publicKey,
    );
    await mockOraclesWrapper.writePythPrice(serumOracleKP, {
      slot: new BN(await provider.connection.getSlot()),
    });

    await refreshProfile([sundialSerumCollateralWrapper, parsedSerumReserve]);

    await addCheckers(
      async () => {
        await expectTX(
          await sundialProfileWrapper.withdrawSundialCollateral(
            withdrawAmount,
            sundialSerumCollateralWrapper,
          ),
        ).to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      ...collateralBalanceDiffChecks(
        withdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
      checkSundialProfileNumOfCollateralDiff(-1),
    );
  });

  it('Withdraw All Collateral (More than deposits)', async () => {
    const depositTx = await sundialProfileWrapper.depositSundialCollateral(
      new BN(100),
      sundialSerumCollateralWrapper,
    );
    await expectTX(depositTx, 'Deposit Collateral').to.be.fulfilled;
    await sundialProfileWrapper.reloadData();

    const depositAmount = sundialProfileWrapper.getCollateralAmount(
      sundialSerumCollateralWrapper.publicKey,
    );
    const withdrawAmount = depositAmount.addn(1);
    await addCheckers(
      async () => {
        await expectTX(
          await sundialProfileWrapper.withdrawSundialCollateral(
            withdrawAmount,
            sundialSerumCollateralWrapper,
          ),
        ).to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      ...collateralBalanceDiffChecks(
        depositAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
      checkSundialProfileNumOfCollateralDiff(-1),
    );
  });

  const refreshThenDeposit = async (
    amount: BN,
    collateralToDeposit: SundialCollateralWrapper,
    ...collateralAndReserves: [
      SundialCollateralWrapper,
      ParsedAccount<ReserveData>,
    ][]
  ) => {
    await updateOraclesSlot();
    await refreshProfile(...collateralAndReserves);
    await expectTX(
      await sundialProfileWrapper.depositSundialCollateral(
        amount,
        collateralToDeposit,
      ),
      'Deposit Collateral',
    ).to.be.fulfilled;
    await collateralToDeposit.reloadData();
    await sundialProfileWrapper.reloadData();
  };

  const refreshThenMint = async (
    amount: BN,
    sundialWrapper: SundialWrapper,
    ...collateralAndReserves: [
      SundialCollateralWrapper,
      ParsedAccount<ReserveData>,
    ][]
  ) => {
    await updateOraclesSlot();
    await refreshProfile(...collateralAndReserves);
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        amount,
        sundialWrapper,
      ),
    ).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    await sundialWrapper.reloadData();
  };

  it('Liquidation (borderline case, exactly amount of loan that would be liquidated)', async () => {
    const updatedUSDCPrice = SERUM_PRICE;

    await refreshThenDeposit(new BN(100), sundialSerumCollateralWrapper, [
      sundialSerumCollateralWrapper,
      parsedSerumReserve,
    ]);

    await refreshThenDeposit(
      new BN(1000),
      sundialSolCollateralWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    await refreshThenMint(
      new BN(1),
      sundialSaberWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    const liquidationThresholdValueWads =
      sundialProfileWrapper.getLiquidationThreshold();
    const loanValueWads = sundialProfileWrapper.getTotalLoanValue();

    const mintAmount = divCeil(
      liquidationThresholdValueWads.sub(loanValueWads),
      updatedUSDCPrice.mul(WAD),
    );

    const shouldRepayAmount = mintAmount.divn(2);
    const shouldWithdrawAmount = divCeiln(
      divCeil(
        shouldRepayAmount.mul(updatedUSDCPrice).mul(WAD),
        Buffer2BN(
          sundialSerumCollateralWrapper.sundialCollateralData.collateralPrice,
        ),
      ).muln(
        sundialSerumCollateralWrapper.sundialCollateralData
          .sundialCollateralConfig.liquidationConfig.liquidationPenalty + 100,
      ),
      100,
    );

    const updatePriceAndPrepareLiquidation = async () => {
      await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
        price: updatedUSDCPrice,
        slot: new BN(await provider.connection.getSlot()),
      });
      await refreshProfile(
        [sundialSerumCollateralWrapper, parsedSerumReserve],
        [sundialSolCollateralWrapper, parsedSolReserve],
      );
      return await sundialProfileWrapper.liquidateSundialProfile(
        sundialSerumCollateralWrapper,
        sundialUSDCWrapper,
        usdcVault,
      );
    };

    await refreshThenMint(
      mintAmount.subn(1),
      sundialUSDCWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    await expectTX(
      await updatePriceAndPrepareLiquidation(),
      'liquidate should failed since profile is healthy',
    ).to.be.rejected;

    await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
      price: USDC_PRICE,
      slot: new BN(await provider.connection.getSlot()),
    });

    await refreshThenMint(
      new BN(1),
      sundialUSDCWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    await addCheckers(
      async () => {
        await expectTX(await updatePriceAndPrepareLiquidation(), 'liquidate').to
          .be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      ...sundialProfileLoanStateChecks(
        shouldRepayAmount.neg(),
        sundialUSDCWrapper,
      ),
      ...sundialProfileCollateralStateChecks(
        shouldWithdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
      ...repayBalanceDiffChecks(
        shouldRepayAmount,
        sundialUSDCWrapper,
        usdcVault,
      ),
      ...collateralBalanceDiffChecks(
        shouldWithdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
    );

    await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
      price: USDC_PRICE,
      slot: new BN(await provider.connection.getSlot()),
    }); //Recover normal price
  });

  it('Liquidation (Not major collateral)', async () => {
    const updatedUSDCPrice = SERUM_PRICE;

    await refreshThenDeposit(
      new BN(10000),
      sundialSolCollateralWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    const liquidationThresholdValueWads =
      sundialProfileWrapper.getLiquidationThreshold();
    const loanValueWads = sundialProfileWrapper.getTotalLoanValue();
    const mintAmount = divCeil(
      liquidationThresholdValueWads.sub(loanValueWads),
      updatedUSDCPrice.mul(WAD),
    );

    const withdrawMaxValue = sundialProfileWrapper.getCollateralValue(
      sundialSerumCollateralWrapper.publicKey,
    );
    const liquidationPenalty =
      sundialSerumCollateralWrapper.sundialCollateralData
        .sundialCollateralConfig.liquidationConfig.liquidationPenalty;
    const shouldRepayAmount = withdrawMaxValue
      .muln(100)
      .divn(liquidationPenalty + 100)
      .div(updatedUSDCPrice)
      .div(WAD);

    const shouldWithdrawValue = divCeiln(
      shouldRepayAmount
        .mul(updatedUSDCPrice)
        .muln(100 + liquidationPenalty)
        .mul(WAD),
      100,
    );
    const shouldWithdrawAmount = divCeil(
      shouldWithdrawValue,
      Buffer2BN(
        sundialSerumCollateralWrapper.sundialCollateralData.collateralPrice,
      ),
    );

    await refreshThenMint(
      mintAmount,
      sundialUSDCWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    await addCheckers(
      async () => {
        await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
          price: updatedUSDCPrice,
          slot: new BN(await provider.connection.getSlot()),
        });

        await refreshProfile(
          [sundialSerumCollateralWrapper, parsedSerumReserve],
          [sundialSolCollateralWrapper, parsedSolReserve],
        );
        const liquidateTx = await sundialProfileWrapper.liquidateSundialProfile(
          sundialSerumCollateralWrapper,
          sundialUSDCWrapper,
          usdcVault,
        );

        await expectTX(liquidateTx, 'liquidate').to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      ...sundialProfileLoanStateChecks(
        shouldRepayAmount.neg(),
        sundialUSDCWrapper,
      ),
      ...sundialProfileCollateralStateChecks(
        shouldWithdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
      ...repayBalanceDiffChecks(
        shouldRepayAmount,
        sundialUSDCWrapper,
        usdcVault,
      ),
      ...collateralBalanceDiffChecks(
        shouldWithdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
    );

    await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
      price: USDC_PRICE,
      slot: new BN(await provider.connection.getSlot()),
    }); //Recover normal price
  });

  it('Liquidation (Liquidate overtime loan first)', async () => {
    const duration = new BN(15);
    const createTx = await sundialPortWrapper.createSundial({
      sundialName: portSundialName,
      owner: provider.wallet.publicKey,
      durationInSeconds: duration,
      liquidityMint: portMint,
      reserve: parsedPortReserve,
      sundialMarket: sundialMarketBase.publicKey,
      oracle: portOracleKP.publicKey,
      lendingFeeInBips: FEE_IN_BIPS,
      borrowingFeeInBips: FEE_IN_BIPS,
    });
    await expectTX(createTx, 'Create sundial port').to.be.fulfilled;
    await sundialPortWrapper.reloadData();

    const loanValue = sundialProfileWrapper.getTotalLoanValue();
    const mintPortAmount = loanValue.muln(2).div(PORT_PRICE).div(WAD);
    const depositSerumAmount = mintPortAmount;

    //Deposit
    await refreshThenDeposit(
      depositSerumAmount,
      sundialSerumCollateralWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    //Mint Port
    await refreshThenMint(
      mintPortAmount,
      sundialPortWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    const depositValue = sundialProfileWrapper.getTotalCollateralValue();
    const mintUSDCAmount = sundialProfileWrapper.getLoanAmount(
      sundialUSDCWrapper.publicKey,
    );

    //Liquidate should fail (Since overtime loan should be liquidated first)
    const updatedUSDCPrice = depositValue.div(mintUSDCAmount).div(WAD).addn(1);
    await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
      price: updatedUSDCPrice,
      slot: new BN(await provider.connection.getSlot()),
    });
    await refreshProfile(
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );
    await sleep(duration.subn(10).toNumber() * 1000); //Sleep to make sure overtime
    await expectTX(
      await sundialProfileWrapper.liquidateSundialProfile(
        sundialSerumCollateralWrapper,
        sundialUSDCWrapper,
        usdcVault,
      ),
      'Would fail, since should liquidate overtime loan first',
    ).to.be.rejected;
    await mockOraclesWrapper.writePythPrice(usdcOracleKP, {
      price: USDC_PRICE,
      slot: new BN(await provider.connection.getSlot()),
    });

    const shouldRepayAmount = mintPortAmount;
    const shouldWithdrawAmount = divCeil(
      sundialProfileWrapper
        .getLoanValue(sundialPortWrapper.publicKey)
        .muln(
          sundialSerumCollateralWrapper.sundialCollateralData
            .sundialCollateralConfig.liquidationConfig.liquidationPenalty + 100,
        ),
      Buffer2BN(
        sundialSerumCollateralWrapper.sundialCollateralData.collateralPrice,
      ).muln(100),
    );

    //liquidate
    await addCheckers(
      async () => {
        await refreshProfile(
          [sundialSerumCollateralWrapper, parsedSerumReserve],
          [sundialSolCollateralWrapper, parsedSolReserve],
        );
        await sundialProfileWrapper.reloadData();
        const loanValue = sundialProfileWrapper.getTotalLoanValue();
        const loanPortValue = sundialProfileWrapper.getLoanValue(
          sundialPortWrapper.publicKey,
        );
        invariant(loanValue.div(loanPortValue).eqn(1));

        await expectTX(
          await sundialProfileWrapper.liquidateSundialProfile(
            sundialSerumCollateralWrapper,
            sundialPortWrapper,
            portVault,
          ),
          'liquidate overtime port collateral',
        ).to.be.fulfilled;
        await sundialProfileWrapper.reloadData();
      },
      ...sundialProfileCollateralStateChecks(
        shouldWithdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
      ...repayBalanceDiffChecks(
        shouldRepayAmount,
        sundialPortWrapper,
        portVault,
      ),
      ...collateralBalanceDiffChecks(
        shouldWithdrawAmount.neg(),
        sundialSerumCollateralWrapper,
      ),
      checkSundialProfileNumOfLoanDiff(-1),
    );
  });

  it('Unable to mint overtime loan', async () => {
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(1),
        sundialPortWrapper,
      ),
    ).to.be.rejected;
  });

  it('Borrow/Withdraw test with multi collaterals', async () => {
    const depositSolAmount = new BN(1000);
    const depositSerumAmount = new BN(10000);
    const borrowSaberAmount = new BN(100);
    const borrowUSDCAmount = new BN(5000);
    await refreshThenDeposit(
      depositSolAmount,
      sundialSolCollateralWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );
    await expectTX(
      await sundialProfileWrapper.depositSundialCollateral(
        depositSerumAmount,
        sundialSerumCollateralWrapper,
      ),
    ).to.be.fulfilled;
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        borrowUSDCAmount,
        sundialUSDCWrapper,
      ),
    ).to.be.fulfilled;
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        borrowSaberAmount,
        sundialSaberWrapper,
      ),
    ).to.be.fulfilled;
    await sundialProfileWrapper.reloadData();
    let borrowingPowder = sundialProfileWrapper.getBorrowingPower();
    let loanValue = sundialProfileWrapper.getTotalLoanValue();
    let availableBp = borrowingPowder.sub(loanValue);
    const availableSaberToBorrow = availableBp.div(SABER_PRICE).div(WAD);

    await refreshThenMint(
      availableSaberToBorrow,
      sundialSaberWrapper,
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(1),
        sundialSaberWrapper,
      ),
    ).to.be.rejected;

    borrowingPowder = sundialProfileWrapper.getBorrowingPower();
    loanValue = sundialProfileWrapper.getTotalLoanValue();
    availableBp = borrowingPowder.sub(loanValue);
    const availableUSDCToBorrow = availableBp.div(USDC_PRICE).div(WAD);
    if (!availableUSDCToBorrow.eqn(0)) {
      await refreshThenMint(
        availableUSDCToBorrow,
        sundialUSDCWrapper,
        [sundialSerumCollateralWrapper, parsedSerumReserve],
        [sundialSolCollateralWrapper, parsedSolReserve],
      );
    }
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(1),
        sundialUSDCWrapper,
      ),
    ).to.be.rejected;

    await expectTX(
      await sundialProfileWrapper.repaySundialLiquidity(
        new BN(MAX_U64.toString()),
        sundialSaberWrapper,
        saberVault,
      ),
    ).to.be.fulfilled;

    await sundialProfileWrapper.reloadData();
    borrowingPowder = sundialProfileWrapper.getBorrowingPower();
    loanValue = sundialProfileWrapper.getTotalLoanValue();
    availableBp = borrowingPowder.sub(loanValue);
    const sundialSerumCollateralData =
      sundialSerumCollateralWrapper.sundialCollateralData;
    const availableSerumToWithdraw = availableBp
      .muln(100)
      .divn(sundialSerumCollateralData.sundialCollateralConfig.ltv.ltv)
      .div(Buffer2BN(sundialSerumCollateralData.collateralPrice));

    await refreshProfile(
      [sundialSerumCollateralWrapper, parsedSerumReserve],
      [sundialSolCollateralWrapper, parsedSolReserve],
    );

    await expectTX(
      await sundialProfileWrapper.withdrawSundialCollateral(
        availableSerumToWithdraw,
        sundialSerumCollateralWrapper,
      ),
    ).to.be.fulfilled;

    await expectTX(
      await sundialProfileWrapper.withdrawSundialCollateral(
        new BN(1),
        sundialSerumCollateralWrapper,
      ),
    ).to.be.rejected;
    await sundialProfileWrapper.reloadData();
  });

  it('Change Sundial Collateral Config', async () => {
    const newLTV = 1;
    const newLiquidationThreshold = 10;
    const newLiquidationPenalty = 10;
    await addCheckers(
      async () => {
        const changeTx = sundialSerumCollateralWrapper.changeConfig({
          ...DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
          ltv: newLTV,
          liquidationPenalty: newLiquidationPenalty,
          liquidationThreshold: newLiquidationThreshold,
        });
        expectTX(changeTx).to.be.fulfilled;
        await refreshProfile(
          [sundialSerumCollateralWrapper, parsedSerumReserve],
          [sundialSolCollateralWrapper, parsedSolReserve],
        );
      },
      sundialProfileCollateralValidate(sundialSerumCollateralWrapper),
      checkAfter(
        async () =>
          sundialSerumCollateralWrapper.sundialCollateralData
            .sundialCollateralConfig,
        async (config: SundialCollateralConfig) => {
          expect(config.ltv.ltv).equal(newLTV);
          expect(config.liquidationConfig.liquidationPenalty).equal(
            newLiquidationPenalty,
          );
          expect(config.liquidationConfig.liquidationThreshold).equal(
            newLiquidationThreshold,
          );
        },
      ),
    );
  });

  it('Should fail to deposit and mint with different lending market', async () => {
    const tempSundialMarket = await sdk.createSundialMarket();
    const createTx = await sundialProfileWrapper.createSundialProfile(
      tempSundialMarket.publicKey,
    );
    await expectTX(createTx, 'create new sundial profile').to.be.fulfilled;
    await refreshProfile([sundialSerumCollateralWrapper, parsedSerumReserve]);
    await expectTX(
      await sundialProfileWrapper.depositSundialCollateral(
        new BN(1),
        sundialSerumCollateralWrapper,
      ),
    ).to.be.rejected;

    const depositAmount = new BN(100);
    const reserveInfo = await port.getReserve(USDCReserveState.address);
    const { address: lPVault, instruction: createATAIx } = await getOrCreateATA(
      {
        provider: sdk.provider,
        mint: parsedUSDCReserve.data.collateral.mintPubkey,
      },
    );
    const depositIxs = await reserveInfo.depositReserve({
      amount: depositAmount,
      userLiquidityWallet: usdcVault,
      destinationCollateralWallet: lPVault,
      userTransferAuthority: provider.wallet.publicKey,
    });
    const tx = new TransactionEnvelope(sdk.provider, [
      createATAIx,
      ...depositIxs,
    ]);
    expectTX(tx, 'Deposit to get LP').to.be.fulfilled;

    const tempUSDCSundialCollateralWrapper = sdk.sundialCollateralWrapper;
    await expectTX(
      await tempUSDCSundialCollateralWrapper.createSundialCollateral({
        name: 'USDC2',
        reserve: parsedUSDCReserve,
        sundialMarket: tempSundialMarket.publicKey,
        config: DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
      }),
    ).to.be.fulfilled;
    await tempUSDCSundialCollateralWrapper.reloadData();
    await refreshProfile([tempUSDCSundialCollateralWrapper, parsedUSDCReserve]);
    await expectTX(
      await sundialProfileWrapper.depositSundialCollateral(
        new BN(100),
        tempUSDCSundialCollateralWrapper,
      ),
    ).to.be.fulfilled;
    await expectTX(
      await sundialProfileWrapper.mintSundialLiquidityWithCollateral(
        new BN(1),
        sundialUSDCWrapper,
      ),
    ).to.be.rejected;
  });
});
