// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.
import { DEFAULT_RESERVE_CONFIG, PORT_LENDING } from "../tests/constants";
import {createMintAndVault} from "@project-serum/common"
import * as anchor from "@project-serum/anchor";
import { createDefaultReserve, createLendingMarket } from "../tests/utils";
import { PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
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

  const poolName = "USDC";
  const strToUint8 = (str: string) => {
    return Uint8Array.from(str.split("").map(c => c.charCodeAt(0)))
  }
  const [sundialAcc, sundialBump] = await PublicKey.findProgramAddress(
    [strToUint8(poolName)],
    sundial.programId
  );
  const [principleTokenMint, principleBump] = await PublicKey.findProgramAddress(
    [sundialAcc.toBuffer(), strToUint8("principle_mint") ],
    sundial.programId
  );
  const [yieldTokenMint, yieldBump] = await PublicKey.findProgramAddress(
    [sundialAcc.toBuffer(), strToUint8("yield_mint")],
    sundial.programId
  );
  const [liquidityTokenSupply, liquidityBump] = await PublicKey.findProgramAddress(
    [sundialAcc.toBuffer(), strToUint8("liquidity")],
    sundial.programId
  );
  const [lpTokenSupply, lpBump] = await PublicKey.findProgramAddress(
    [sundialAcc.toBuffer(), strToUint8("lp")],
    sundial.programId
  );
  const [redeemFeeReceiver, feeReceiverBump] = await PublicKey.findProgramAddress(
    [sundialAcc.toBuffer(), strToUint8("fee_receiver")],
    sundial.programId
  );
  const [sundialAuthority, authorityBump] = await PublicKey.findProgramAddress(
    [],
    sundial.programId
  );
  await sundial.rpc.initialize(
    {
      sundialBump: sundialBump,
      authorityBump: authorityBump,
      portLiquidityBump: liquidityBump,
      portLpBump: lpBump,
      principleMintBump: principleBump,
      yieldMintBump: yieldBump,
      feeReceiverBump: feeReceiverBump
    },
    poolName,
    new anchor.BN(1849276800), // 8th of August 2028
    PORT_LENDING,
    {
      accounts: {
        sundial: sundialAcc,
        sundialAuthority: sundialAuthority,
        sundialPortLiquidityWallet: liquidityTokenSupply,
        sundialPortLpWallet: lpTokenSupply,
        principleTokenMint: principleTokenMint,
        yieldTokenMint: yieldTokenMint,
        portLiquidityMint: mintPubkey,
        portLpMint: reserveState.collateralMintAccount,
        feeReceiverWallet: redeemFeeReceiver,
        reserve: reserveState.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        user: provider.wallet.publicKey,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
      signers: []
    }
  );
}
