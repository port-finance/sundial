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
import {
  getATAAddress,
  getOrCreateATA,
} from "@saberhq/token-utils";
import { makeSDK } from "./workspace";
import {
  ReserveParser,
  ParsedAccount,
  ReserveData,
} from "@port.finance/port-sdk";
import { expectTX } from "@saberhq/chai-solana";
import { SolanaProvider } from "@saberhq/solana-contrib";

describe("sundial", () => {
  setProvider(Provider.local());
  const provider = Provider.local();

  const sdk = makeSDK();
  const sundialSDK = sdk.sundial;
  let lendingMarketKP: Keypair;
  it("Initialize Lending Market", async () => {
    lendingMarketKP = await createLendingMarket(provider);
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
      lendingMarketKP.publicKey,
      DEFAULT_RESERVE_CONFIG
    );

    const raw = {
      pubkey: reserveState.address,
      account: await provider.connection.getAccountInfo(reserveState.address),
    };
    reserveInfo = ReserveParser(raw);
  });


  const redeemPortLp = async () => {
    sundialSDK.setSundial(sundialBase.publicKey);

    await sundialSDK.reloadSundial();
    const redeemTx = await sundialSDK.redeemPortLp({
      lendingMarket: lendingMarketKP.publicKey,
      reserve: reserveInfo,
    });
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
      lendingMarket: lendingMarketKP.publicKey,
    });

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
  };

  const sundialBase = Keypair.generate();
  it("Initialize Sundial", async () => {
    const duration = new BN(2); // 2 seconds from now
    const createTx = await sundialSDK.createSundial({
      sundialBase: sundialBase,
      owner: provider.wallet.publicKey,
      durationInSeconds: duration, // 8th of August 2028
      liquidityMint: liquidityMint,
      reserve: reserveInfo,
    });
    expectTX(createTx, "Crate sundial").to.be.fulfilled;
    sundialSDK.setSundial(sundialBase.publicKey);
    await sundialSDK.reloadSundial();
    const principleMintBump = (await sundialSDK.getPrincipleMintAndNounce())[1];
    const yieldMintBump = (await sundialSDK.getYieldMintAndNounce())[1];
    expect(sundialSDK.sundialData.durationInSeconds.toString()).equal(
      duration.toString()
    );
    expect(sundialSDK.sundialData.bumps.principleMintBump).equal(principleMintBump);
    expect(sundialSDK.sundialData.bumps.yieldMintBump).equal(yieldMintBump);
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
  it("Unable to redeem Port Lp", async () => await sleep(3000));
  it("Sleep", async () => await sleep(3000));
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
    expect(liquidityGot.toString()).equal("0");
  });

  // TODO: test for the case where there is actual tokens obtained when redeem yield tokens.
  // TODO: add tests for failing case such as:
  // - didn't refresh reserve
});
