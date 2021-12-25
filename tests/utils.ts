import { initLendingMarketInstruction, initReserveInstruction } from "@port.finance/port-sdk";
import { ReserveConfig } from "@port.finance/port-sdk/src/structs/ReserveData";
import { BN, Provider } from "@project-serum/anchor";
import { getTokenAccount } from "@project-serum/common";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Transaction } from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";
import { LENDING_MARKET_LEN, PORT_LENDING, RESERVE_LEN, TOKEN_ACCOUNT_LEN, TOKEN_MINT_LEN } from "./constants";
import {RESERVE_INIT_LIQUIDITY} from "./workspace";

export const createAccount = async (provider: Provider, space: number, owner: PublicKey): Promise<Keypair> => {
  const newAccount = Keypair.generate();
  const createTx = new Transaction().add(
      SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: newAccount.publicKey,
          programId: owner,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
              space
          ),
          space,
      })
  );
  await provider.send(
    createTx,
    [newAccount]
  );
  return newAccount
}

export async function createLendingMarket(provider: Provider): Promise<Keypair> {
  const lendingMarket = await createAccount(
    provider,
    LENDING_MARKET_LEN,
    PORT_LENDING
  );
  await provider.send(
    (() => {
      const tx = new Transaction();
      tx.add(
        initLendingMarketInstruction(
          provider.wallet.publicKey,
          Buffer.from("USD\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0", 'ascii'),
          lendingMarket.publicKey,
        )
      );
      return tx;
    })(),
    []
  );
  return lendingMarket;
}

export interface ReserveState {
  address: PublicKey;
  liquiditySupplyPubkey: PublicKey;
  collateralMintAccount: PublicKey;
  collateralSupplyTokenAccount: PublicKey;
  liquidityFeeReceiver: PublicKey;
  useCollateralAccount: PublicKey;
}

export async function createDefaultReserve(
  provider: Provider, initialLiquidity: number | BN,
  sourceTokenWallet: PublicKey, lendingMarket: PublicKey,
  config: ReserveConfig): Promise<ReserveState> {
    const reserve = await createAccount(
      provider,
      RESERVE_LEN,
      PORT_LENDING
    );

    const collateralMintAccount = await createAccount(
      provider,
      TOKEN_MINT_LEN,
      TOKEN_PROGRAM_ID
    );

    const liquiditySupplyTokenAccount = await createAccount(
      provider,
      TOKEN_ACCOUNT_LEN,
      TOKEN_PROGRAM_ID
    );

    const collateralSupplyTokenAccount = await createAccount(
      provider,
      TOKEN_ACCOUNT_LEN,
      TOKEN_PROGRAM_ID
    );

    const userCollateralTokenAccount = await createAccount(
      provider,
      TOKEN_ACCOUNT_LEN,
      TOKEN_PROGRAM_ID
    );

    const liquidityFeeReceiver = await createAccount(
      provider,
      TOKEN_ACCOUNT_LEN,
      TOKEN_PROGRAM_ID
    );
    
    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.toBuffer()],
      PORT_LENDING
    );

    const tokenAccount = await getTokenAccount(provider, sourceTokenWallet);

    const tx = new Transaction();

    tx.add(
      initReserveInstruction(
        initialLiquidity,
        RESERVE_INIT_LIQUIDITY.toNumber(),
        new BN("100000000000000000000000"),
        config,
        sourceTokenWallet,
        userCollateralTokenAccount.publicKey,
        reserve.publicKey,
        tokenAccount.mint,
        liquiditySupplyTokenAccount.publicKey,
        liquidityFeeReceiver.publicKey,
        (Keypair.generate()).publicKey,
        collateralMintAccount.publicKey,
        collateralSupplyTokenAccount.publicKey,
        lendingMarket,
        lendingMarketAuthority,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
      )
    );

    await provider.send(tx);

    return {
      address: reserve.publicKey,
      liquiditySupplyPubkey: liquiditySupplyTokenAccount.publicKey,
      collateralMintAccount: collateralMintAccount.publicKey,
      collateralSupplyTokenAccount: collateralSupplyTokenAccount.publicKey,
      liquidityFeeReceiver: liquidityFeeReceiver.publicKey,
      useCollateralAccount: userCollateralTokenAccount.publicKey,
    }

}