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
import { Keypair } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { getOrCreateATA, MAX_U64 } from '@saberhq/token-utils';
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

const mintAmount = new anchor.BN(1000000000000);
module.exports = async function (provider: anchor.Provider) {
  anchor.setProvider(provider);
  const solanaProvider = SolanaProvider.load({
    connection: provider.connection,
    sendConnection: provider.connection,
    wallet: provider.wallet,
    opts: provider.opts,
  });
  console.log('Provider public key: ', provider.wallet.publicKey.toString());
  const lendingMarket = await createLendingMarket(provider);
  console.log('marketPublicKey: ', lendingMarket.publicKey.toString());
  const [mintPubkey, vaultPubkey] = await createMintAndVault(
    provider,
    mintAmount,
    provider.wallet.publicKey,
    6,
  );

  const { address, instruction } = await getOrCreateATA({
    provider: solanaProvider,
    mint: mintPubkey,
  });
  const moveToAtaTx = new TransactionEnvelope(solanaProvider, [
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
  const reserveState = await createDefaultReserve(
    provider,
    1,
    address,
    lendingMarket.publicKey,
    DEFAULT_RESERVE_CONFIG,
  );
  console.log('mintPubkey', mintPubkey.toString());
  console.log('reserveState', reserveState.address.toString());

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
  const createSundialTx = await sundialSDK.sundialWrapper.createSundial({
    sundialName,
    owner: provider.wallet.publicKey,
    durationInSeconds: new anchor.BN(8640000), // 8th of August 2028
    liquidityMint: mintPubkey,
    oracle: usdcOracleKP.publicKey,
    sundialMarket: sundialMarketBase.publicKey,
    reserve: reserveInfo,
    liquidityCap: new BN(MAX_U64.toString()),
  });
  await createSundialTx.confirm();

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

  const [sundialId] = await SundialWrapper.getSundialKeyAndBump(
    sundialName,
    sundialMarketBase.publicKey,
  );
  const [principalMint] = await sundialSDK.getPrincipleMintAndBump(sundialId);
  console.log('principalMint', principalMint.toString());

  const jsonLog = JSON.stringify({
    provider: provider.wallet.publicKey.toString(),
    walletPriv: [],
    lendingMarket: lendingMarket.publicKey.toString(),
    sundialMarket: sundialMarketBase.publicKey.toString(),
    liquidityMint: mintPubkey.toString(),
    principalMint: principalMint.toString(),
    reserveState: reserveState.address.toString(),
    oraclePriv: Array.from(usdcOracleKP.secretKey),
  });
  await fsPromises.writeFile(JSON_OUTPUT_FILE, jsonLog);
  console.log(`Environment info wrote to .anchor/${JSON_OUTPUT_FILE}`);
  const serumMarket = await setupSerumMarket({
    provider: solanaProvider,
    baseMint: principalMint,
    quoteMint: mintPubkey,
  });
  console.log('serum market: ', serumMarket.toString());

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
    amount: new BN(100_000_000),
    lendingMarket: lendingMarket.publicKey,
    reserve: reserveInfo,
    userLiquidityWallet: address,
  });
  console.log('Generating Principal and yield tokens');
  await depositTx.confirm();

  console.log('Placing orders');
  await placeOrders({
    provider: solanaProvider,
    asks: [[1.1, 1]],
    bids: [[0.9, 1]],
    market: loadedSerumMarket,
  });
};
