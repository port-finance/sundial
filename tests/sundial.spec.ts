import { Provider, setProvider, workspace, BN } from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {Sundial, IDL} from '../target/types/sundial';
import {Keypair, PublicKey, Transaction} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { DEFAULT_RESERVE_CONFIG } from './constants';
import {createMintAndVault, getTokenAccount, sleep} from '@project-serum/common';
import {assert} from 'chai';
import { createDefaultReserve, createLendingMarket, ReserveState } from './utils';
import {refreshReserveInstruction} from '@port.finance/port-sdk';
import { makeSDK } from './workspace';
import { ReserveParser, ParsedAccount, ReserveData } from '@port.finance/port-sdk';


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
  let reserveInfo: ParsedAccount<ReserveData>;

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
    reserveInfo = ReserveParser(raw);
  })

  const poolName = "USDC";
  const strToUint8 = (str: string) => {
    return Uint8Array.from(str.split("").map(c => c.charCodeAt(0)))
  }

  const initSundial = (duration: number) => async () => {
    const createTx = await sundialSDK.createSundial(
      {
        name: poolName,
        owner: provider.wallet.publicKey,
        durationInSeconds: new BN(duration), // 8th of August 2028
        liquidityMint: liquidityMint,
        reserve: reserveInfo
      }
    );

    await provider.send(
      createTx.build()
    );
  };

  const redeemPortLp = async () => {
    const [sundialAcc] = await PublicKey.findProgramAddress(
      [strToUint8(poolName)],
      sundial.programId
    );
    sundialSDK.setSundial(sundialAcc);

    await sundialSDK.reloadSundial();
    const trans = await sundialSDK.redeemPortLp(
      {
        lendingMarket: lendingMarket.publicKey,
        reserve: reserveInfo
      });
    trans.instructions.push(refreshReserveInstruction(reserveState.address, null));
    trans.instructions.reverse();
    await trans.confirm();

    const liquidityWalletPubkey = (await sundialSDK.getLiquidityTokenSupplyAndNounce())[0];
    const liquidityWallet = await getTokenAccount(provider, liquidityWalletPubkey);
    assert(liquidityWallet.amount.toString() != "0", "Should get some liquidity")
  }

  const redeemPrinciple = (amount: number | string) => async () => {
    const [sundialAcc] = await PublicKey.findProgramAddress(
      [strToUint8(poolName)],
      sundial.programId
    );
    sundialSDK.setSundial(sundialAcc);
    const principleTokenMint = (await sundialSDK.getPrincipleMintAndNounce())[0];

    const principleAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      principleTokenMint,
      provider.wallet.publicKey
    );
    const beforeLiquidityAmount = (await provider.connection.getTokenAccountBalance(liquidityVault)).value.amount;
    await sundialSDK.reloadSundial();
    const trans = await sundialSDK.redeemPrincipleTokens(
      {
        userLiquidityWallet: liquidityVault,
        userPrincipleTokenWallet: principleAssocTokenAccount,
        userAuthority: provider.wallet.publicKey
      }, new BN(amount));
    await trans.confirm();
    const afterLiquidityAmount = (await provider.connection.getTokenAccountBalance(liquidityVault)).value.amount;
    const liquidityGot = new BN(afterLiquidityAmount).sub(new BN(beforeLiquidityAmount));
    assert(liquidityGot.toString() == amount.toString(), "Incorrect principle amount got");
  }

  const redeemYield = (amount: number | string) => async () => {
    const [sundialAcc] = await PublicKey.findProgramAddress(
      [strToUint8(poolName)],
      sundial.programId
    );
    sundialSDK.setSundial(sundialAcc);

    const yieldTokenMint = (await sundialSDK.getYieldMintAndNounce())[0];

    const yieldAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      yieldTokenMint,
      provider.wallet.publicKey
    );

    await sundialSDK.reloadSundial();
    const trans = await sundialSDK.redeemYieldTokens(
      {
        userLiquidityWallet: liquidityVault,
        userYieldTokenWallet: yieldAssocTokenAccount,
        userAuthority: provider.wallet.publicKey,
      }, new BN(amount));
    const beforeLiquidityAmount = (await provider.connection.getTokenAccountBalance(liquidityVault)).value.amount;

    await trans.confirm();

    const afterLiquidityAmount = (await provider.connection.getTokenAccountBalance(liquidityVault)).value.amount;
    const liquidityGot = new BN(afterLiquidityAmount).sub(new BN(beforeLiquidityAmount));
    assert(liquidityGot.toString() == "0", "Incorrect yield amount got");
  }

  const depositAndMint = (amount: number | string) => async () => {
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

    const deposit_amount = new BN(amount);
    const transactionEnvelope = await sundialSDK.mintPrincipleAndYieldTokens(
      {
        amount: deposit_amount,
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

    const sundialLpWallet = (await sundialSDK.getLPTokenSupplyAndNounce())[0]
    const sundialLpAmount = (await getTokenAccount(provider, sundialLpWallet)).amount.toString();

    assert(sundialLpAmount != "0", "Should get some port lp tokens");
    assert(principleWallet.amount.toString() === amount.toString(), "Didn't receive expected amount of principle tokens");
    assert(yieldWallet.amount.toString() === amount.toString(), "Didn't receive expected amount of yield tokens");
  };

  it('Initialize Sundial', initSundial(2));
  it('Mints principle and yield tokens', depositAndMint(100000));
  it('Sleep',  async () => await sleep(2000))
  it("Redeem Port Lp", redeemPortLp);
  it("Redeem principle", redeemPrinciple(100));
  it("Redeem yield", redeemYield(100));
});

