// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.
import { DEFAULT_RESERVE_CONFIG } from "../tests/constants";
import { createMintAndVault } from "@project-serum/common";
import * as anchor from "@project-serum/anchor";
import { createDefaultReserve, createLendingMarket } from "../tests/utils";
import { SolanaProvider } from "@saberhq/solana-contrib";
import { SundialSDK } from "../src";
import { ReserveParser } from "@port.finance/port-sdk/lib/parsers/ReserveParser";
import { ReserveData } from "@port.finance/port-sdk/lib/structs/ReserveData";
import { ParsedAccount } from "@port.finance/port-sdk/lib/parsers/ParsedAccount";
import { Keypair } from "@solana/web3.js";

module.exports = async function (provider) {
  anchor.setProvider(provider);
  console.log("Provider public key: ", provider.wallet.publicKey.toString());
  const lendingMarket = await createLendingMarket(provider);
  console.log("marketPublicKey", lendingMarket.publicKey.toString());
  const [mintPubkey, vaultPubkey] = await createMintAndVault(
    provider,
    new anchor.BN(1000000000000),
    provider.wallet.publicKey,
    6
  );
  const reserveState = await createDefaultReserve(
    provider,
    1,
    vaultPubkey,
    lendingMarket.publicKey,
    DEFAULT_RESERVE_CONFIG
  );
  console.log("mintPubkey", mintPubkey.toString());
  console.log("reserveState", reserveState.address.toString());
  const solanaProvider = SolanaProvider.load({
    connection: provider.connection,
    sendConnection: provider.connection,
    wallet: provider.wallet,
    opts: provider.opts,
  });
  const sundialSDK = SundialSDK.load({
    provider: solanaProvider,
  });

  const raw = {
    pubkey: reserveState.address,
    account: await provider.connection.getAccountInfo(reserveState.address),
  };
  const reserveInfo = ReserveParser(raw) as ParsedAccount<ReserveData>;
  const sundialKeypair = await Keypair.generate();
  const createTx = await sundialSDK.sundial.createSundial({
    sundialBase: sundialKeypair,
    owner: provider.wallet.publicKey,
    durationInSeconds: new anchor.BN(8640000), // 8th of August 2028
    liquidityMint: mintPubkey,
    reserve: reserveInfo,
  });
  console.log("sundialKeypair publicKey: ", sundialKeypair.publicKey.toString());
  await createTx.confirm();
};
