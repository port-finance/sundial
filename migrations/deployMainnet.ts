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
import { ADMIN, BASE_MARKET_KEY } from './utils';

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

  const reservePubkey = new PublicKey(
    'DcENuKuYd6BWGhKfGr7eARxodqG12Bz1sN5WA8NwvLRx',
  );
  const raw = {
    pubkey: reservePubkey,
    account: await provider.connection.getAccountInfo(reservePubkey),
  };
  const reserveInfo = ReserveParser(raw) as ParsedAccount<ReserveData>;

  const serumMarketKp = Keypair.generate();
  const sundialMarketKp = Keypair.fromSecretKey(Buffer.from(BASE_MARKET_KEY));
  const createMarketTx = await sundialSDK.getCreateSundialMarketTx({
    sundialMarketBase: sundialMarketKp,
    owner: ADMIN,
    payer: provider.wallet.publicKey,
  });
  await createMarketTx.confirm();
  const sundialName = 'USDC - July 2022';
  const usdcOraclePubKey = new PublicKey(
    'Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD',
  );
  const usdcMintPubkey = new PublicKey(
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  );
  const [sundialKey, serumMarket] = await setupSundialAndSerumMarket({
    provider: solanaProvider,
    sundialName,
    sundialSDK,
    mintPubkey: usdcMintPubkey,
    oraclePubkey: usdcOraclePubKey,
    sundialMarket: sundialMarketKp.publicKey,
    reserveInfo,
    serumMarketKp,
    durationInSeconds: new anchor.BN(3 * MONTH_IN_SECS),
    shouldPlaceOrder: false,
  });

  console.log(
    'Sundial Public Keys: ',
    sundialKey.toString(),
    serumMarket.toString(),
  );
};
