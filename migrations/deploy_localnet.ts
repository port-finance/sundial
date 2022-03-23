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

const JSON_OUTPUT_FILE = 'env.localnet.json';
const sundialName = 'USDC';
const sundialCollateralName = 'SRM';

// Public Key: `jDNZtiREbJdF3kzN7RZhgpgWUhCrCprBzZWtmYYa77w`
const sundialMarket = [
  173, 111, 205, 179, 204, 98, 130, 46, 108, 165, 157, 104, 105, 215, 157, 147,
  181, 182, 179, 134, 117, 129, 157, 89, 120, 28, 205, 182, 4, 186, 54, 44, 10,
  208, 98, 3, 240, 16, 194, 151, 51, 114, 43, 180, 124, 126, 163, 199, 188, 194,
  235, 1, 213, 62, 121, 192, 171, 251, 118, 45, 207, 226, 206, 98,
];

// Public Key: `4vhDYDrMGHk6DVxe74sFR7RGeiJTUB9EeJx75Fco7wui`
const serumMarketKey = [
  98, 94, 127, 179, 30, 1, 252, 26, 184, 247, 141, 165, 108, 210, 0, 22, 76, 75,
  165, 23, 125, 76, 75, 122, 151, 11, 227, 124, 220, 35, 102, 113, 58, 84, 80,
  244, 233, 100, 225, 52, 248, 16, 232, 41, 14, 17, 229, 218, 118, 29, 250, 14,
  149, 218, 73, 177, 23, 195, 198, 27, 67, 160, 85, 185,
];

const mintAmount = new anchor.BN(1000000000000);
module.exports = async function (provider: anchor.Provider) {
  anchor.setProvider(provider);
  const solanaProvider = SolanaProvider.init({
    connection: provider.connection,
    wallet: provider.wallet,
    opts: provider.opts,
  });
  console.log('Provider public key: ', provider.wallet.publicKey.toString());

  const lendingMarket = await createLendingMarket(provider);
  console.log('marketPublicKey: ', lendingMarket.publicKey.toString());

  const [mintPubkey, address] = await createTokenAndMintToATA({
    provider: solanaProvider,
    amount: mintAmount,
  });

  const reserveState = await createDefaultReserve(
    provider,
    1,
    address,
    lendingMarket.publicKey,
    DEFAULT_RESERVE_CONFIG,
  );
  console.log('ReserveState', reserveState.address.toString());

  const sundialSDK = SundialSDK.load({
    provider: solanaProvider,
  });
  const sundialMarketBase = Keypair.fromSecretKey(Buffer.from(sundialMarket));
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
  const createSundialTx = await sundialSDK.sundialWrapper.createSundial({
    sundialName,
    owner: provider.wallet.publicKey,
    durationInSeconds: new anchor.BN(8640000), // 100 days
    liquidityMint: mintPubkey,
    oracle: usdcOracleKP.publicKey,
    sundialMarket: sundialMarketBase.publicKey,
    reserve: reserveInfo,
    liquidityCap,
  });
  await createSundialTx.confirm();

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

  const [sundialId] = await SundialWrapper.getSundialKeyAndBump(
    sundialName,
    sundialMarketBase.publicKey,
  );
  const [principalMint] = await sundialSDK.getPrincipleMintAndBump(sundialId);
  console.log('principalMint', principalMint.toString());

  const serumMarket = await setupSerumMarket({
    provider: solanaProvider,
    baseMint: principalMint,
    quoteMint: mintPubkey,
    market: Keypair.fromSecretKey(Buffer.from(serumMarketKey)),
  });
  console.log('serum market: ', serumMarket.toString());

  const jsonLog = JSON.stringify({
    provider: provider.wallet.publicKey.toString(),
    lendingMarket: lendingMarket.publicKey.toString(),
    sundialMarket: sundialMarketBase.publicKey.toString(),
    serumMarket: serumMarket.toString(),
    oraclePriv: Array.from(usdcOracleKP.secretKey),
  });
  await fsPromises.writeFile(JSON_OUTPUT_FILE, jsonLog);
  console.log(`Environment info wrote to .anchor/${JSON_OUTPUT_FILE}`);

  const loadedSerumMarket = await Market.load(
    provider.connection,
    serumMarket,
    {},
    DEX_PID,
  );

  const sundialW = sundialSDK.sundialWrapper;
  sundialW.publicKey = sundialId;
  await sundialW.reloadData();
  const depositTx = await sundialW.mintPrincipleAndYieldTokens({
    amount: new BN(1000_000_000),
    reserve: reserveInfo,
    userLiquidityWallet: address,
  });
  console.log('Generating Principal and yield tokens');
  await depositTx.confirm();

  console.log('Placing orders');
  await placeOrders({
    provider: solanaProvider,
    asks: [[1, 1000]],
    bids: [[0.9, 1000]],
    market: loadedSerumMarket,
  });
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
      1000000000000,
    ),
  ]);
  await moveToAtaTx.confirm();
  return [mintPubkey, address];
};

const setupSundialAndSerumMarket = async ({
  provider,
  sundialName,
  sundialSDK,
  mintPubkey,
  oraclePubkey,
  sundialMarket,
  reserveInfo,
}: {
  provider: SolanaProvider;
  sundialName: string;
  sundialSDK: SundialSDK;
  mintPubkey: PublicKey;
  oraclePubkey: PublicKey;
  sundialMarket: PublicKey;
  reserveInfo: ParsedAccount<ReserveData>;
}): Promise<[PublicKey, PublicKey]> => {
  const liquidityCap = new BN(10_000_000_000);
  const createSundialTx = await sundialSDK.sundialWrapper.createSundial({
    sundialName,
    owner: provider.wallet.publicKey,
    durationInSeconds: new anchor.BN(8640000), // 100 days
    liquidityMint: mintPubkey,
    oracle: oraclePubkey,
    sundialMarket,
    reserve: reserveInfo,
    liquidityCap,
  });
  await createSundialTx.confirm();

  const [sundialId] = await SundialWrapper.getSundialKeyAndBump(
    sundialName,
    sundialMarket,
  );
  const [principalMint] = await sundialSDK.getPrincipleMintAndBump(sundialId);

  const serumMarket = await setupSerumMarket({
    provider,
    baseMint: principalMint,
    quoteMint: mintPubkey,
    market: Keypair.fromSecretKey(Buffer.from(serumMarketKey)),
  });

  const sundialW = sundialSDK.sundialWrapper;
  sundialW.publicKey = sundialId;
  await sundialW.reloadData();

  const { address: userLiquidityWallet } = await getOrCreateATA({
    provider,
    mint: reserveInfo.data.liquidity.mintPubkey,
  });
  const depositTx = await sundialW.mintPrincipleAndYieldTokens({
    amount: new BN(1000_000_000),
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

  return [sundialId, serumMarket];
};
