import { Provider, setProvider, BN } from "@project-serum/anchor";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { DEFAULT_RESERVE_CONFIG, PORT_LENDING } from "./constants";
import {
  createMintAndVault,
  getTokenAccount,
  sleep,
} from "@project-serum/common";
import { expect } from "chai";
import {
  createDefaultReserve,
  createLendingMarket,
  ReserveState,
} from "./utils";
import { refreshReserveInstruction } from "@port.finance/port-sdk";
import { makeSDK } from "./workspace";
import {
  ReserveParser,
  ParsedAccount,
  ReserveData,
} from "@port.finance/port-sdk";

describe("sundial", () => {
  setProvider(Provider.local());
  const provider = Provider.local();

  const sdk = makeSDK();
  const sundialSDK = sdk.sundial;
  let lendingMarket: Keypair;
  it("Initialize Lending Market", async () => {
    lendingMarket = await createLendingMarket(provider);
  });

  let reserveState: ReserveState;
  let liquidityMint: PublicKey;
  let liquidityVault: PublicKey;
  let reserveInfo: ParsedAccount<ReserveData>;

  it("Initialize Reserve", async () => {
    const [mintPubkey, vaultPubkey] = await createMintAndVault(
      provider,
      new BN(1000000000000),
      provider.wallet.publicKey,
      6
    );
    liquidityMint = mintPubkey;
    liquidityVault = vaultPubkey;
    reserveState = await createDefaultReserve(
      provider,
      1,
      vaultPubkey,
      lendingMarket.publicKey,
      DEFAULT_RESERVE_CONFIG
    );
    const raw = {
      pubkey: reserveState.address,
      account: await provider.connection.getAccountInfo(reserveState.address),
    };
    reserveInfo = ReserveParser(raw);
  });

  const sundialBase = Keypair.generate();

  const initSundial = async (duration: BN) => {
    const createTx = await sundialSDK.createSundial({
      sundialBase: sundialBase,
      owner: provider.wallet.publicKey,
      durationInSeconds: duration, // 8th of August 2028
      liquidityMint: liquidityMint,
      reserve: reserveInfo,
    });
    await createTx.confirm();
  };

  const redeemPortLp = async () => {
    sundialSDK.setSundial(sundialBase.publicKey);

    await sundialSDK.reloadSundial();
    const redeemTx = await sundialSDK.redeemPortLp({
      lendingMarket: lendingMarket.publicKey,
      reserve: reserveInfo,
    });
    redeemTx.instructions.push(
      refreshReserveInstruction(reserveState.address, null)
    );
    redeemTx.instructions.reverse();
    await redeemTx.confirm();
  };

  const redeemPrinciple = async (amount: BN) => {
    sundialSDK.setSundial(sundialBase.publicKey);
    const principleTokenMint = (
      await sundialSDK.getPrincipleMintAndNounce()
    )[0];

    const principleAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      principleTokenMint,
      provider.wallet.publicKey
    );
    await sundialSDK.reloadSundial();
    const trans = await sundialSDK.redeemPrincipleTokens(
      {
        userLiquidityWallet: liquidityVault,
        userPrincipleTokenWallet: principleAssocTokenAccount,
        userAuthority: provider.wallet.publicKey,
      },
      new BN(amount)
    );
    await trans.confirm();
  };

  const redeemYield = async (amount: BN) => {
    sundialSDK.setSundial(sundialBase.publicKey);

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
      },
      new BN(amount)
    );

    await trans.confirm();
  };

  const depositAndMint = async (amount: BN) => {
    sundialSDK.setSundial(sundialBase.publicKey);

    await sundialSDK.reloadSundial();

    const principleTokenMint = (
      await sundialSDK.getPrincipleMintAndNounce()
    )[0];
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
        provider.wallet.publicKey
      ),
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        yieldTokenMint,
        yieldAssocTokenAccount,
        provider.wallet.publicKey,
        provider.wallet.publicKey
      )
    );

    await provider.send(createPrincipleAndYieldTokenWalletsTx);

    const deposit_amount = new BN(amount);
    const transactionEnvelope = await sundialSDK.mintPrincipleAndYieldTokens({
      amount: deposit_amount,
      userLiquidityWallet: liquidityVault,
      userPrincipleTokenWallet: principleAssocTokenAccount,
      userYieldTokenWallet: yieldAssocTokenAccount,
      userAuthority: provider.wallet.publicKey,
      reserve: reserveInfo,
      lendingMarket: lendingMarket.publicKey,
    });

    const refreshReserveIx = refreshReserveInstruction(
      reserveState.address,
      null
    );

    const depositTx = new Transaction();
    depositTx.add(refreshReserveIx, ...transactionEnvelope.instructions);
    await provider.send(depositTx);
  };

  it("Initialize Sundial", async () => {
    const duration = new BN(2);
    await initSundial(duration);
    sundialSDK.setSundial(sundialBase.publicKey);
    await sundialSDK.reloadSundial();
    expect(sundialSDK.sundialData.durationInSeconds.toString()).equal(
      duration.toString()
    );
    expect(sundialSDK.sundialData.reserve).eqAddress(reserveInfo.pubkey);
    expect(sundialSDK.sundialData.portLendingProgram).eqAddress(PORT_LENDING);
  });
  it("Mints principle and yield tokens", async () => {
    const amount = new BN(100000);
    await depositAndMint(amount);

    sundialSDK.setSundial(sundialBase.publicKey);
    await sundialSDK.reloadSundial();

    const principleAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      (
        await sundialSDK.getPrincipleMintAndNounce()
      )[0],
      provider.wallet.publicKey
    );

    const yieldAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      (
        await sundialSDK.getYieldMintAndNounce()
      )[0],
      provider.wallet.publicKey
    );
    const principleWallet = await getTokenAccount(
      provider,
      principleAssocTokenAccount
    );
    const yieldWallet = await getTokenAccount(provider, yieldAssocTokenAccount);

    const sundialLpWallet = (await sundialSDK.getLPTokenSupplyAndNounce())[0];
    const sundialLpAmount = (await getTokenAccount(provider, sundialLpWallet))
      .amount;

    expect(sundialLpAmount.toString()).not.equal("0");
    expect(principleWallet.amount.toString()).equal(amount.toString());
    expect(yieldWallet.amount.toString()).equal(amount.toString());
  });
  it("Sleep", async () => await sleep(2000));
  it("Redeem Port Lp", async () => {
    await redeemPortLp();
    const liquidityWalletPubkey = (
      await sundialSDK.getLiquidityTokenSupplyAndNounce()
    )[0];
    const liquidityWallet = await getTokenAccount(
      provider,
      liquidityWalletPubkey
    );
    expect(liquidityWallet.amount.toString()).not.equal("0");
  });
  it("Redeem principle", async () => {
    const amount = new BN(100);
    const beforeLiquidityWallet = await getTokenAccount(
      provider,
      liquidityVault
    );
    await redeemPrinciple(amount);
    const afterLiquidityWallet = await getTokenAccount(
      provider,
      liquidityVault
    );
    const liquidityGot = afterLiquidityWallet.amount.sub(
      beforeLiquidityWallet.amount
    );
    expect(liquidityGot.toString()).equal(amount.toString());
  });
  it("Redeem yield", async () => {
    const amount = new BN(100);
    const beforeLiquidityWallet = await getTokenAccount(
      provider,
      liquidityVault
    );
    await redeemYield(amount);
    const afterLiquidityWallet = await getTokenAccount(
      provider,
      liquidityVault
    );
    const liquidityGot = afterLiquidityWallet.amount.sub(
      beforeLiquidityWallet.amount
    );
    // TODO: test for the case where there is actual tokens obtained when redeem yield tokens.
    expect(liquidityGot.toString()).equal("0");
  });
});
