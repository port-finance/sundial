import "chai-bn";

import * as anchor from "@project-serum/anchor";
import { chaiSolana } from "@saberhq/chai-solana";
import { SolanaProvider } from "@saberhq/solana-contrib";
import chai from "chai";

import type { Programs } from "../src";
import { SundialSDK } from "../src/sdk";
import { BN } from "@project-serum/anchor";

chai.use(chaiSolana);

export const INITIAL_MINT_AMOUNT = new BN(1000000000000);
export const RESERVE_INIT_LIQUIDITY = new BN(1);

export type Workspace = Programs;

export const makeSDK = (): SundialSDK => {
  const anchorProvider = anchor.Provider.env();
  anchor.setProvider(anchorProvider);

  const provider = SolanaProvider.load({
    connection: anchorProvider.connection,
    sendConnection: anchorProvider.connection,
    wallet: anchorProvider.wallet,
    opts: anchorProvider.opts,
  });
  return SundialSDK.load({
    provider,
  });
};

