import { Provider, setProvider, workspace, BN } from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {Sundial, IDL} from '../target/types/sundial';
import {Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY, Transaction} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID, u64 } from '@solana/spl-token';
import {initLendingMarketInstruction, initReserveInstruction} from '@port.finance/port-sdk'
import { DEFAULT_RESERVE_CONFIG, LENDING_MARKET_LEN, PORT_LENDING, RESERVE_LEN, TOKEN_ACCOUNT_LEN, TOKEN_MINT_LEN } from './constants';
import { ReserveConfig } from '@port.finance/port-sdk/lib/structs/ReserveData';
import { getTokenAccount } from '@project-serum/common';
import {assert} from 'chai';

describe('sundial', () => {

  setProvider(Provider.local());
  const provider = Provider.local();

  const sundial = new Program<Sundial>(
    IDL, workspace.Sundial.programId, provider);

  let lendingMarket: Keypair;
  it ('Initialize Lending Market', async () => {
    lendingMarket = await createLendingMarket(provider);
  })

  let reserveState: ReserveState;
  let liquidityTokenMint: Keypair
  it ('Initialize Reserve', async () => {
    const tx = new Transaction();
    liquidityTokenMint = await createAccount(provider, TOKEN_MINT_LEN, TOKEN_PROGRAM_ID);
    const assocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      liquidityTokenMint.publicKey,
      provider.wallet.publicKey
    );

    tx.add(
      Token.createInitMintInstruction(
        TOKEN_PROGRAM_ID,
        liquidityTokenMint.publicKey,
        6,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
      ),
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        liquidityTokenMint.publicKey,
        assocTokenAccount,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
      ),
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        liquidityTokenMint.publicKey,
        assocTokenAccount,
        provider.wallet.publicKey,
        [],
        new u64(1000000000000)
      )
    );

    provider.send(tx);

    reserveState = await createDefaultReserve(
      provider, 1, assocTokenAccount, lendingMarket.publicKey, DEFAULT_RESERVE_CONFIG);
  })

  const sundialAcc = Keypair.generate();
  it('Initialize Sundial!', async () => {

    const principleTokenMint = Keypair.generate();
    const yieldTokenMint = Keypair.generate();
    const liquidityTokenSupply = Keypair.generate();
    const collateralTokenSupply = Keypair.generate();
    const redeemFeeReceiver = Keypair.generate();
    const owner = Keypair.generate();
    const [sundialAuthority, nounce] = await PublicKey.findProgramAddress(
      [],
      sundial.programId
    );

    await sundial.rpc.initialize(
      nounce,
      new BN(1849276800), // 8th of August 2028
      {
        accounts: {
          sundial: sundialAcc.publicKey,
          sundialAuthority: sundialAuthority,
          portLiquiditySupply: liquidityTokenSupply.publicKey,
          portCollateralSupply: collateralTokenSupply.publicKey,
          principleTokenMint: principleTokenMint.publicKey,
          yieldTokenMint: yieldTokenMint.publicKey,
          portLiquidityMint: liquidityTokenMint.publicKey,
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
  });

  it('Mints principle and yield tokens', async () => {

    const sundialPool = await sundial.account.sundial.fetch(
      sundialAcc.publicKey
    );

    const [sundialAuthority] = await PublicKey.findProgramAddress(
      [],
      sundial.programId
    );

    const createPrincipleAndYieldTokenWalletsTx = new Transaction();

    const principleAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      sundialPool.principleTokenMint,
      provider.wallet.publicKey
    );

    const yieldAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      sundialPool.yieldTokenMint,
      provider.wallet.publicKey
    );

    createPrincipleAndYieldTokenWalletsTx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        sundialPool.principleTokenMint,
        principleAssocTokenAccount,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
      ),
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        sundialPool.yieldTokenMint,
        yieldAssocTokenAccount,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
      ),
    );

    await provider.send(
      createPrincipleAndYieldTokenWalletsTx
    );

    const assocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      liquidityTokenMint.publicKey,
      provider.wallet.publicKey
    );

    const amount = new BN(100000000);
    const mintTestTokensTx = new Transaction();
    mintTestTokensTx.add(
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        liquidityTokenMint.publicKey,
        assocTokenAccount,
        provider.wallet.publicKey,
        [],
        new u64(amount.toString())
      ),
    );

    await provider.send(mintTestTokensTx);

    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.publicKey.toBuffer()],
      PORT_LENDING
    );
    
    await sundial.rpc.mintPrincipleTokensAndYieldTokens(
      amount,
      {
        accounts: {
          sundial: sundialAcc.publicKey,
          sundialAuthority: sundialAuthority,
          userSourceLiquidity: assocTokenAccount,
          principleTokenDestination: principleAssocTokenAccount,
          yieldTokenDestination: yieldAssocTokenAccount,
          userTransferAuthority: provider.wallet.publicKey,
          principleTokenMint: sundialPool.principleTokenMint,
          yieldTokenMint: sundialPool.yieldTokenMint,
          lendingMarket: lendingMarket.publicKey,
          lendingMarketAuthority: lendingMarketAuthority,
          portLendingProgram: PORT_LENDING,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
          portLiquiditySupply: sundialPool.liquiditySupplyTokenAccount,
          portCollateralSupply: sundialPool.collateralSupplyTokenAccount,
        },
        signers: []
      }
    )

    const principleWallet = await getTokenAccount(provider, principleAssocTokenAccount);
    const yieldWallet = await getTokenAccount(provider, yieldAssocTokenAccount);

    assert(principleWallet.amount.toString() === amount.toString(), "Didn't receive expected amount of principle tokens");
    assert(yieldWallet.amount.toString() === amount.toString(), "Didn't receive expected amount of yield tokens");
  });
});

const createAccount = async (provider: Provider, space: number, owner: PublicKey): Promise<Keypair> => {
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

async function createLendingMarket(provider: Provider): Promise<Keypair> {
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
        1,
        new BN("1000000"),
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
