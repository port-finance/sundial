import { Provider, setProvider, workspace, BN } from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {Sundial, IDL} from '../target/types/sundial';
import {Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY, Transaction} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { DEFAULT_RESERVE_CONFIG, PORT_LENDING } from './constants';
import { createMintAndVault, getTokenAccount } from '@project-serum/common';
import {assert} from 'chai';
import { createDefaultReserve, createLendingMarket, ReserveState } from './utils';
import { refreshReserveInstruction, ReserveInfo } from '@port.finance/port-sdk';
import {ReserveParser} from '@port.finance/port-sdk/lib/parsers/ReserveParser'
import { ParsedAccount } from '@port.finance/port-sdk/lib/parsers/ParsedAccount';
import { ReserveData } from '@port.finance/port-sdk/lib/structs/ReserveData';
import { makeSDK } from './workspace';


describe('sundial', () => {

  setProvider(Provider.local());
  const provider = Provider.local();

  const sundial = new Program<Sundial>(
    IDL, workspace.Sundial.programId, provider);
  const sdk = makeSDK();
  const sundialSDK = sdk.sundial;
  let lendingMarket: Keypair;
  it ('Initialize Lending Market', async () => {
    lendingMarket = await createLendingMarket(provider);
  })

  let reserveState: ReserveState;
  let liquidityMint: PublicKey;
  let liquidityVault: PublicKey;
  it ('Initialize Reserve', async () => {
    const [mintPubkey, vaultPubkey] = await createMintAndVault(provider, new BN(1000000000000), provider.wallet.publicKey, 6);
    liquidityMint = mintPubkey;
    liquidityVault = vaultPubkey;
    reserveState = await createDefaultReserve(
      provider, 1, vaultPubkey, lendingMarket.publicKey, DEFAULT_RESERVE_CONFIG);
  })

  const poolName = "USDC";
  const strToUint8 = (str: string) => {
    return Uint8Array.from(str.split("").map(c => c.charCodeAt(0)))
  }
  it('Initialize Sundial!', async () => {
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
      new BN(1849276800), // 8th of August 2028
      PORT_LENDING,
      {
        accounts: {
          sundial: sundialAcc,
          sundialAuthority: sundialAuthority,
          sundialPortLiquidityWallet: liquidityTokenSupply,
          sundialPortLpWallet: lpTokenSupply,
          principleTokenMint: principleTokenMint,
          yieldTokenMint: yieldTokenMint,
          portLiquidityMint: liquidityMint,
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
  });

  it('Mints principle and yield tokens', async () => {
    const [sundialAcc] = await PublicKey.findProgramAddress(
      [strToUint8(poolName)],
      sundial.programId
    );

    sundialSDK.setSundial(sundialAcc);
    await sundialSDK.reloadSundial();


    const principleTokenMint = (await sundialSDK.getPrincipleMintAndNounce())[0];
    const yieldTokenMint = (await sundialSDK.getYieldMintAndNounce())[0];

    const raw = {
      pubkey: reserveState.address,
      account: await provider.connection.getAccountInfo(reserveState.address)
    }
    const reserveInfo = ReserveInfo.fromRaw(
      ReserveParser(raw) as ParsedAccount<ReserveData>
    );

    const createPrincipleAndYieldTokenWalletsTx = new Transaction();

    const principleAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      principleTokenMint,
      provider.wallet.publicKey
    );

    const yieldAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      yieldTokenMint,
      provider.wallet.publicKey
    );

    createPrincipleAndYieldTokenWalletsTx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        principleTokenMint,
        principleAssocTokenAccount,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
      ),
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        yieldTokenMint,
        yieldAssocTokenAccount,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
      ),
    );

    await provider.send(
      createPrincipleAndYieldTokenWalletsTx
    );

    const amount = new BN(100000000);
    const transactionEnvelope = await sundialSDK.mintPrincipleAndYieldTokens(
      {
        amount: amount,
        userLiquidityWallet: liquidityVault,
        userPrincipleTokenWallet: principleAssocTokenAccount,
        userYieldTokenWallet: yieldAssocTokenAccount,
        userAuthority: provider.wallet.publicKey,
        reserve: reserveInfo,
        lendingMarket: lendingMarket.publicKey
      }
    );

    const refreshReserveIx = refreshReserveInstruction(
      reserveState.address,
      null
    );

    const depositTx = new Transaction();
    depositTx.add(
      refreshReserveIx,
      ...transactionEnvelope.instructions
    );
    await provider.send(depositTx);
    const principleWallet = await getTokenAccount(provider, principleAssocTokenAccount);
    const yieldWallet = await getTokenAccount(provider, yieldAssocTokenAccount);

    assert(principleWallet.amount.toString() === amount.toString(), "Didn't receive expected amount of principle tokens");
    assert(yieldWallet.amount.toString() === amount.toString(), "Didn't receive expected amount of yield tokens");
  });
});

