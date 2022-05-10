import {
  DEFAULT_RESERVE_CONFIG,
  DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
  MOCK_ORACLES,
} from '../tests/constants';
import { createMintAndVault } from '@project-serum/common';
import * as anchor from '@project-serum/anchor';
import { createDefaultReserve, createLendingMarket } from '../tests/utils';
import { SolanaProvider, TransactionEnvelope } from '@saberhq/solana-contrib';
import {
  DEX_PID,
  placeOrders,
  setupSerumMarket,
  SundialSDK,
  SundialWrapper,
} from '../src';
import { Keypair, PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { getOrCreateATA } from '@saberhq/token-utils';
import { promises as fsPromises } from 'fs';
import {
  ParsedAccount,
  ReserveData,
  ReserveParser,
} from '@port.finance/port-sdk';
import { MockOraclesWrapper } from '@port.finance/mock-oracles';
import { Market } from '@project-serum/serum';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BASE_MARKET_KEY } from './utils';

const JSON_OUTPUT_FILE = 'env.localnet.json';
const sundialName = 'USDCJune2022';
const sundialName2 = 'USDCMay2022';
const sundialCollateralName = 'SRM';

// Public Key: `4vhDYDrMGHk6DVxe74sFR7RGeiJTUB9EeJx75Fco7wui`
const serumMarketKey = [
  98, 94, 127, 179, 30, 1, 252, 26, 184, 247, 141, 165, 108, 210, 0, 22, 76, 75,
  165, 23, 125, 76, 75, 122, 151, 11, 227, 124, 220, 35, 102, 113, 58, 84, 80,
  244, 233, 100, 225, 52, 248, 16, 232, 41, 14, 17, 229, 218, 118, 29, 250, 14,
  149, 218, 73, 177, 23, 195, 198, 27, 67, 160, 85, 185,
];

// Public Key: `4e4Bjzr5jByGYoPgYmg5KPCMxx4UviF92j4D622k4voD`
const serumMarketKey2 = [
  159, 75, 249, 52, 121, 44, 118, 150, 228, 232, 31, 161, 127, 137, 233, 13,
  209, 138, 78, 196, 128, 8, 96, 6, 36, 23, 193, 119, 145, 173, 46, 10, 54, 17,
  38, 248, 85, 68, 141, 192, 207, 184, 255, 31, 160, 171, 152, 195, 11, 32, 21,
  173, 115, 116, 170, 239, 105, 210, 93, 145, 140, 91, 125, 116,
];

const mintAmount = new anchor.BN(1000000000000);
export const deployLocalNet = async function (provider: anchor.Provider) {
  anchor.setProvider(provider);
  const solanaProvider = SolanaProvider.init({
    connection: provider.connection,
    wallet: provider.wallet,
    opts: provider.opts,
  });
  console.log('Provider public key: ', provider.wallet.publicKey.toString());

  const lendingMarket = await createLendingMarket(provider);
  console.log('marketPublicKey: ', lendingMarket.publicKey.toString());

  const [mintPubkey, vaultAddress] = await createTokenAndMintToATA({
    provider: solanaProvider,
    amount: mintAmount,
  });

  const reserveState = await createDefaultReserve(
    provider,
    1,
    vaultAddress,
    lendingMarket.publicKey,
    DEFAULT_RESERVE_CONFIG,
  );
  console.log('ReserveState', reserveState.address.toString());

  const sundialSDK = SundialSDK.load({
    provider: solanaProvider,
  });
  const sundialMarketBase = Keypair.fromSecretKey(Buffer.from(BASE_MARKET_KEY));
  const createMarketTx = await sundialSDK.getCreateSundialMarketTx({
    sundialMarketBase,
    owner: provider.wallet.publicKey,
    payer: provider.wallet.publicKey,
  });
  createMarketTx.confirm();

  const raw = {
    pubkey: reserveState.address,
    account: await provider.connection.getAccountInfo(reserveState.address),
  };
  const reserveInfo = ReserveParser(raw) as ParsedAccount<ReserveData>;
  const mockOraclesWrapper = new MockOraclesWrapper(provider, MOCK_ORACLES);
  const usdcOracleKP = await mockOraclesWrapper.createAccount(
    mockOraclesWrapper.PYTH_PRICE_ACCOUNT_SIZE,
  );

  const liquidityCap = new BN(10_000_000_000);

  const createSundialCollateralTx =
    await sundialSDK.sundialCollateralWrapper.createSundialCollateral({
      name: sundialCollateralName,
      reserve: reserveInfo,
      sundialMarket: sundialMarketBase.publicKey,
      config: {
        ...DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
        liquidityCap,
      },
    });
  await createSundialCollateralTx.confirm();

  const [sundialKey, serumMarket] = await setupSundialAndSerumMarket({
    provider: solanaProvider,
    sundialName,
    sundialSDK,
    mintPubkey,
    oraclePubkey: usdcOracleKP.publicKey,
    sundialMarket: sundialMarketBase.publicKey,
    reserveInfo,
    serumMarketKp: Keypair.fromSecretKey(Buffer.from(serumMarketKey)),
  });

  console.log(
    'sundial Key',
    sundialKey.toString(),
    'serum market',
    serumMarket.toString(),
  );

  const [sundialKey2, serumMarket2] = await setupSundialAndSerumMarket({
    provider: solanaProvider,
    sundialName: sundialName2,
    sundialSDK,
    mintPubkey,
    oraclePubkey: usdcOracleKP.publicKey,
    sundialMarket: sundialMarketBase.publicKey,
    reserveInfo,
    durationInSeconds: new BN(3600),
    serumMarketKp: Keypair.fromSecretKey(Buffer.from(serumMarketKey2)),
  });

  console.log(
    'sundial Key',
    sundialKey2.toString(),
    'serum market',
    serumMarket2.toString(),
  );

  const [principalMint] = await sundialSDK.getPrincipleMintAndBump(sundialKey);
  const [principalMint2] = await sundialSDK.getPrincipleMintAndBump(
    sundialKey2,
  );

  const jsonLog = JSON.stringify({
    provider: provider.wallet.publicKey.toString(),
    lendingMarket: lendingMarket.publicKey.toString(),
    sundialMarket: sundialMarketBase.publicKey.toString(),
    principalMint: principalMint.toString(),
    principalMint2: principalMint2.toString(),
    liquidityMint: mintPubkey.toString(),
    sundialKey: sundialKey.toString(),
    serumMarket: serumMarket.toString(),
    sundialKey2: sundialKey2.toString(),
    serumMarket2: serumMarket2.toString(),
    reserveState: reserveState.address.toString(),
    oraclePriv: Array.from(usdcOracleKP.secretKey),
  });
  await fsPromises.writeFile(JSON_OUTPUT_FILE, jsonLog);
  console.log(`Environment info wrote to .anchor/${JSON_OUTPUT_FILE}`);
};

const createTokenAndMintToATA = async ({
  provider,
  amount,
  owner = provider.wallet.publicKey,
  decimal = 6,
}: {
  provider: SolanaProvider;
  amount: BN;
  owner?: PublicKey;
  decimal?: number;
}): Promise<[PublicKey, PublicKey]> => {
  const [mintPubkey, vaultPubkey] = await createMintAndVault(
    new anchor.Provider(provider.connection, provider.wallet, provider.opts),
    amount,
    owner,
    decimal,
  );
  console.log('mintPubkey', mintPubkey.toString());

  const { address, instruction } = await getOrCreateATA({
    provider,
    mint: mintPubkey,
  });
  const moveToAtaTx = new TransactionEnvelope(provider, [
    instruction,
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      vaultPubkey,
      address,
      provider.wallet.publicKey,
      [],
      amount.toNumber(),
    ),
  ]);
  await moveToAtaTx.confirm();
  return [mintPubkey, address];
};

export const setupSundialAndSerumMarket = async ({
  provider,
  sundialName,
  serumMarketKp,
  sundialSDK,
  mintPubkey,
  oraclePubkey,
  sundialMarket,
  reserveInfo,
  durationInSeconds = new anchor.BN(8640000), // 100 days
  shouldPlaceOrder = true,
  liquidityCap = new BN(1_000_000_000_000),
}: {
  provider: SolanaProvider;
  sundialName: string;
  serumMarketKp: Keypair;
  sundialSDK: SundialSDK;
  mintPubkey: PublicKey;
  oraclePubkey: PublicKey;
  sundialMarket: PublicKey;
  reserveInfo: ParsedAccount<ReserveData>;
  durationInSeconds?: anchor.BN;
  shouldPlaceOrder?: boolean;
  liquidityCap?: BN;
}): Promise<[PublicKey, PublicKey]> => {
  const createSundialTx = await sundialSDK.sundialWrapper.createSundial({
    sundialName,
    owner: provider.wallet.publicKey,
    durationInSeconds,
    liquidityMint: mintPubkey,
    oracle: oraclePubkey,
    sundialMarket,
    reserve: reserveInfo,
    liquidityCap,
  });
  console.log('Setting up Sundial...');
  await createSundialTx.confirm();

  const [sundialId] = await SundialWrapper.getSundialKeyAndBump(
    sundialName,
    sundialMarket,
  );
  const [principalMint] = await sundialSDK.getPrincipleMintAndBump(sundialId);

  console.log('Setting up Serum market...');
  const serumMarket = await setupSerumMarket({
    provider,
    baseMint: principalMint,
    quoteMint: mintPubkey,
    market: serumMarketKp,
  });

  const sundialW = sundialSDK.sundialWrapper;
  sundialW.publicKey = sundialId;
  await sundialW.reloadData();

  if (shouldPlaceOrder) {
    const { address: userLiquidityWallet } = await getOrCreateATA({
      provider,
      mint: reserveInfo.data.liquidity.mintPubkey,
    });
    const depositTx = await sundialW.mintPrincipleAndYieldTokens({
      amount: new BN(1_000_000_000),
      reserve: reserveInfo,
      userLiquidityWallet,
    });
    await depositTx.confirm();

    const loadedSerumMarket = await Market.load(
      provider.connection,
      serumMarket,
      {},
      DEX_PID,
    );
    await placeOrders({
      provider,
      asks: [[1, 1000]],
      bids: [[0.9, 1000]],
      market: loadedSerumMarket,
    });
  }

  return [sundialId, serumMarket];
};
