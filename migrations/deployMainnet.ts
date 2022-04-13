import * as anchor from '@project-serum/anchor';
import { SolanaProvider } from '@saberhq/solana-contrib';
import { SundialSDK } from '../src';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  ParsedAccount,
  ReserveData,
  ReserveParser,
} from '@port.finance/port-sdk';
import { setupSundialAndSerumMarket } from './deployLocalNet';
import {
  ADMIN,
  BASE_MARKET_KEY,
  PYTH_USDC_PRICE_ACCOUNT,
  USDC_MINT_PUB_KEY,
  USDC_RESERVE_PUB_KEY,
} from './utils';

const DAY_IN_SECS = 24 * 60 * 60;
const MONTH_IN_SECS = 30 * DAY_IN_SECS;

export const deployMainnet = async function (provider) {
  anchor.setProvider(provider);
  const solanaProvider = SolanaProvider.init({
    connection: provider.connection,
    wallet: provider.wallet,
    opts: provider.opts,
  });
  const sundialSDK = SundialSDK.load({
    provider: solanaProvider,
  });

  console.log('Fetching Reserve Info...');
  const raw = {
    pubkey: USDC_RESERVE_PUB_KEY,
    account: await provider.connection.getAccountInfo(USDC_RESERVE_PUB_KEY),
  };
  const reserveInfo = ReserveParser(raw) as ParsedAccount<ReserveData>;

  const serumMarketKp = Keypair.generate();
  const sundialMarketKp = Keypair.fromSecretKey(Buffer.from(BASE_MARKET_KEY));
  const createMarketTx = await sundialSDK.getCreateSundialMarketTx({
    sundialMarketBase: sundialMarketKp,
    owner: ADMIN,
    payer: provider.wallet.publicKey,
  });

  console.log('Creating Sundial Market...');
  await createMarketTx.confirm();
  const sundialName = 'USDC - July 2022';

  console.log('Setting up Sundial and Serum market...');
  const [sundialKey, serumMarket] = await setupSundialAndSerumMarket({
    provider: solanaProvider,
    sundialName,
    sundialSDK,
    mintPubkey: USDC_MINT_PUB_KEY,
    oraclePubkey: PYTH_USDC_PRICE_ACCOUNT,
    sundialMarket: sundialMarketKp.publicKey,
    reserveInfo,
    serumMarketKp,
    durationInSeconds: new anchor.BN(3 * MONTH_IN_SECS),
    shouldPlaceOrder: false,
  });

  console.log('Sundial Key: ', sundialKey.toString());
  console.log('Serum market: ', serumMarket.toString());
};
