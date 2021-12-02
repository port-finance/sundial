import "chai-bn";

import * as anchor from "@project-serum/anchor";
import { chaiSolana } from "@saberhq/chai-solana";
import { SolanaProvider } from "@saberhq/solana-contrib";
import chai from "chai";

import type { Programs } from "../src";
import { SundialSDK } from "../src/sdk";

chai.use(chaiSolana);


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

