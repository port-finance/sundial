// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.
import { DEFAULT_RESERVE_CONFIG } from "../tests/constants";
import {createMintAndVault} from "@project-serum/common"
import * as anchor from "@project-serum/anchor";
import { createDefaultReserve, createLendingMarket } from "../tests/utils";
import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import {Sundial, IDL} from '../target/types/sundial';
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

module.exports = async function (provider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);
  console.log("Provider public key: ", provider.wallet.publicKey.toString());
  const lendingMarket = await createLendingMarket(provider);
  const [mintPubkey, vaultPubkey] = await createMintAndVault(provider, new anchor.BN(1000000000000), provider.wallet.publicKey, 6);
  const reserveState = await createDefaultReserve(
    provider, 1, vaultPubkey, lendingMarket.publicKey, DEFAULT_RESERVE_CONFIG);

  const sundial = new Program<Sundial>(
    IDL,
    anchor.workspace.Sundial.programId,
    provider
  );
  const principleTokenMint = Keypair.generate();
  const yieldTokenMint = Keypair.generate();
  const liquidityTokenSupply = Keypair.generate();
  const collateralTokenSupply = Keypair.generate();
  const redeemFeeReceiver = Keypair.generate();
  const owner = Keypair.generate();
  const sundialAcc = Keypair.generate();
  const [sundialAuthority, nounce] = await PublicKey.findProgramAddress(
    [],
    sundial.programId
  );

  await sundial.rpc.initialize(
    nounce,
    new anchor.BN(1849276800), // 8th of August 2028
    {
      accounts: {
        sundial: sundialAcc.publicKey,
        sundialAuthority: sundialAuthority,
        portLiquiditySupply: liquidityTokenSupply.publicKey,
        portCollateralSupply: collateralTokenSupply.publicKey,
        principleTokenMint: principleTokenMint.publicKey,
        yieldTokenMint: yieldTokenMint.publicKey,
        portLiquidityMint: mintPubkey,
        portCollateralMint: reserveState.collateralMintAccount,
        redeemFeeReceiver: redeemFeeReceiver.publicKey,
        reservePubkey: reserveState.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        user: provider.wallet.publicKey,
        owner: owner.publicKey,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
      instructions: [],
      signers: [
        sundialAcc, 
        principleTokenMint, 
        yieldTokenMint, 
        liquidityTokenSupply, 
        collateralTokenSupply, 
        redeemFeeReceiver
      ]
    }
  );
}
