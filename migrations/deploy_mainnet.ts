// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.
import * as anchor from "@project-serum/anchor";
import { SolanaProvider } from "@saberhq/solana-contrib";
import { SundialSDK } from "../src";
import { Keypair, PublicKey } from "@solana/web3.js";
import { ParsedAccount, ReserveData, ReserveParser } from "@port.finance/port-sdk";
import {BN} from "@project-serum/anchor";
import {MAX_U64} from "@saberhq/token-utils";

const DAY_IN_SECS = 24 * 60 * 60;
const MONTH_IN_SECS = 30 * DAY_IN_SECS;

module.exports = async function (provider) {
  anchor.setProvider(provider);
  const solanaProvider = SolanaProvider.load({
    connection: provider.connection,
    sendConnection: provider.connection,
    wallet: provider.wallet,
    opts: provider.opts,
  });
  const sundialSDK = SundialSDK.load({
    provider: solanaProvider,
  });

  const reservePubkey = new PublicKey("DcENuKuYd6BWGhKfGr7eARxodqG12Bz1sN5WA8NwvLRx");
  const raw = {
    pubkey: reservePubkey,
    account: await provider.connection.getAccountInfo(reservePubkey),
  };
  const reserveInfo = ReserveParser(raw) as ParsedAccount<ReserveData>;
  const sundialKeypair = Keypair.generate();
  const sundialMarketBase = Keypair.generate();
  const createMarketTx = await sundialSDK.sundialWrapper.createSundialMarket(
    {
      sundialMarketBase,
      owner: provider.wallet.publicKey,
      payer: provider.wallet.publicKey
    }
  );
  createMarketTx.confirm();
  const createTx = await sundialSDK.sundialWrapper.createSundial({
    sundialBase: sundialKeypair,
    owner: provider.wallet.publicKey,
    durationInSeconds: new anchor.BN(3 * MONTH_IN_SECS), // 3 months
    liquidityMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    oracle: PublicKey.default,
    sundialMarket: sundialMarketBase.publicKey,
    reserve: reserveInfo,
    liquidityCap: new BN(MAX_U64.toString())
  });
  console.log("sundialKeypair publicKey: ", sundialKeypair.publicKey.toString());
  await createTx.confirm();
};
