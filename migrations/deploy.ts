// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.
import {
  DEFAULT_RESERVE_CONFIG,
  DEFAULT_SUNDIAL_COLLATERAL_CONFIG,
  MOCK_ORACLES,
} from '../tests/constants';
import { createMintAndVault } from '@project-serum/common';
import * as anchor from '@project-serum/anchor';
import { createDefaultReserve, createLendingMarket } from '../tests/utils';
import { SolanaProvider } from '@saberhq/solana-contrib';
import { SundialSDK, SundialWrapper } from '../src';
import { Keypair } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { MAX_U64 } from '@saberhq/token-utils';
import { promises as fsPromises } from 'fs';
import {
  ParsedAccount,
  ReserveData,
  ReserveParser,
} from '@port.finance/port-sdk';
import { MockOraclesWrapper } from '@port.finance/mock-oracles';

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

module.exports = async function (provider: anchor.Provider) {
  anchor.setProvider(provider);
  console.log('Provider public key: ', provider.wallet.publicKey.toString());
  const lendingMarket = await createLendingMarket(provider);
  console.log('marketPublicKey: ', lendingMarket.publicKey.toString());
  const [mintPubkey, vaultPubkey] = await createMintAndVault(
    provider,
    new anchor.BN(1000000000000),
    provider.wallet.publicKey,
    6,
  );
  const reserveState = await createDefaultReserve(
    provider,
    1,
    vaultPubkey,
    lendingMarket.publicKey,
    DEFAULT_RESERVE_CONFIG,
  );
  console.log('mintPubkey', mintPubkey.toString());
  console.log('reserveState', reserveState.address.toString());
  const solanaProvider = SolanaProvider.load({
    connection: provider.connection,
    sendConnection: provider.connection,
    wallet: provider.wallet,
    opts: provider.opts,
  });
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
};
