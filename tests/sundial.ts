import { Provider, setProvider, workspace, BN } from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {Sundial, IDL} from '../target/types/sundial';
import {Keypair, PublicKey, Transaction} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { DEFAULT_RESERVE_CONFIG } from './constants';
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
  let reserveInfo: ReserveInfo;
  it ('Initialize Reserve', async () => {
    const [mintPubkey, vaultPubkey] = await createMintAndVault(provider, new BN(1000000000000), provider.wallet.publicKey, 6);
    liquidityMint = mintPubkey;
    liquidityVault = vaultPubkey;
    reserveState = await createDefaultReserve(
      provider, 1, vaultPubkey, lendingMarket.publicKey, DEFAULT_RESERVE_CONFIG);
    const raw = {
      pubkey: reserveState.address,
      account: await provider.connection.getAccountInfo(reserveState.address)
    }
    reserveInfo = ReserveInfo.fromRaw(
      ReserveParser(raw) as ParsedAccount<ReserveData>
    );
  })

  const poolName = "USDC";
  const strToUint8 = (str: string) => {
    return Uint8Array.from(str.split("").map(c => c.charCodeAt(0)))
  }
  it('Initialize Sundial!', async () => {
    const createTx = await sundialSDK.createSundial(
      {
        name: poolName,
        owner: provider.wallet.publicKey,
        endTimeStamp: new BN(1849276800), // 8th of August 2028
        liquidityMint: liquidityMint,
        reserve: reserveInfo
      }
    );

    await provider.send(
      createTx.build()
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

