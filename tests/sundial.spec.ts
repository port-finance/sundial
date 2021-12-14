import { Provider, setProvider, BN } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
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
import { INITIAL_MINT_AMOUNT, makeSDK } from "./workspace";
import {
  ReserveParser,
  ParsedAccount,
  ReserveData,
} from "@port.finance/port-sdk";
import { expectTX } from "@saberhq/chai-solana";


describe("sundial", () => {
  setProvider(Provider.local());
  const provider = Provider.local();

  const sdk = makeSDK();
  const sundialSDK = sdk.sundial;
  let lendingMarketKP: Keypair;
  let reserveState: ReserveState;
  let liquidityMint: PublicKey;
  let liquidityVault: PublicKey;
  let parsedReserve: ParsedAccount<ReserveData>;
  before("Initialize Lending Market", async () => {
    lendingMarketKP = await createLendingMarket(provider);
    const [mintPubkey, vaultPubkey] = await createMintAndVault(
      provider,
      INITIAL_MINT_AMOUNT,
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
    parsedReserve = ReserveParser(raw);
  });

  const sundialBase = Keypair.generate();
  it("Initialize Sundial", async () => {
    const duration = new BN(3); // 3 seconds from now
    const createTx = await sundialSDK.createSundial({
      sundialBase: sundialBase,
      owner: provider.wallet.publicKey,
      durationInSeconds: duration, // 8th of August 2028
      liquidityMint: liquidityMint,
      reserve: parsedReserve,
    });
    await expectTX(createTx, "Create sundial").to.be.fulfilled;
    sundialSDK.setSundial(sundialBase.publicKey);
    await sundialSDK.reloadSundial();
    const principleMintBump = (await sundialSDK.getPrincipleMintAndNounce())[1];
    const yieldMintBump = (await sundialSDK.getYieldMintAndNounce())[1];
    expect(sundialSDK.sundialData.durationInSeconds.toString()).equal(
      duration.toString()
    );
    expect(sundialSDK.sundialData.bumps.principleMintBump).equal(principleMintBump);
    expect(sundialSDK.sundialData.bumps.yieldMintBump).equal(yieldMintBump);
    expect(sundialSDK.sundialData.reserve).eqAddress(parsedReserve.pubkey);
    expect(sundialSDK.sundialData.portLendingProgram).eqAddress(PORT_LENDING);
  });
  const amount = INITIAL_MINT_AMOUNT.subn(1);
  it("Mints principle and yield tokens", async () => {
    const depositTx = await sundialSDK.mintPrincipleAndYieldTokens({
      amount,
      userLiquidityWallet: liquidityVault,
      userAuthority: provider.wallet.publicKey,
      reserve: parsedReserve,
      lendingMarket: lendingMarketKP.publicKey,
    });
    await expectTX(depositTx, "mint principle and yield").to.be.fulfilled;

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
    const liquidityWallet = await getTokenAccount(provider, liquidityVault);

    const sundialLpWallet = (await sundialSDK.getLPTokenSupplyAndNounce())[0];
    const sundialLpAmount = (await getTokenAccount(provider, sundialLpWallet))
      .amount;

    expect(sundialLpAmount.toString()).not.equal("0");
    expect(sundialLpAmount.toString()).equal(amount.toString());
    expect(principleWallet.amount.toString()).equal(amount.toString());
    expect(yieldWallet.amount.toString()).equal(amount.toString());
    expect(liquidityWallet.amount.toString()).equal("0");
  });
  it("Unable to redeem Port Lp before end date", async () => {
    const redeemTx = await sundialSDK.redeemPortLp({
      lendingMarket: lendingMarketKP.publicKey,
      reserve: parsedReserve,
    });
    await expectTX(redeemTx, "redeem from Port failed").to.be.rejected;
  });
  it("Unable to redeem Principal tokens before end date", async () => {
    const tx = await sundialSDK.redeemPrincipleTokens(
      {
        amount,
        owner: provider.wallet.publicKey,
        userLiquidityWallet: liquidityVault,
        userAuthority: provider.wallet.publicKey,
      },
    );
    await expectTX(tx, "redeem principle failed").to.be.rejected;
  });
  it("Unable to redeem Yield tokens before end date", async () => {
    const tx = await sundialSDK.redeemYieldTokens(
      {
        amount,
        owner: provider.wallet.publicKey,
        userLiquidityWallet: liquidityVault,
        userAuthority: provider.wallet.publicKey,
      },
    );
    await expectTX(tx, "redeem yield failed").to.be.rejected;
  });
  it("Redeem Port Lp", async () => {
    await sleep(4000);
    const redeemTx = await sundialSDK.redeemPortLp({
      lendingMarket: lendingMarketKP.publicKey,
      reserve: parsedReserve,
    });
    await expectTX(redeemTx, "redeem from Port successful").to.be.fulfilled;
    const sundialLiquidityWalletPubkey = (
      await sundialSDK.getLiquidityTokenSupplyAndNounce()
    )[0];
    const sundialLiquidityWallet = await getTokenAccount(
      provider,
      sundialLiquidityWalletPubkey
    );
    expect(sundialLiquidityWallet.amount.toString()).not.equal("0");
  });
  it("Redeem principal tokens", async () => {
    const tx = await sundialSDK.redeemPrincipleTokens(
      {
        amount,
        owner: provider.wallet.publicKey,
        userLiquidityWallet: liquidityVault,
        userAuthority: provider.wallet.publicKey,
      },
    );
    await expectTX(tx, "redeem principal tokens succesfully").to.be.fulfilled;
    const userLiquidityWallet = await getTokenAccount(
      provider,
      liquidityVault
    );
    expect(userLiquidityWallet.amount.toString()).equal(amount.toString());
  });
  it("Redeem yield token", async () => {
    const redeemTx = await sundialSDK.redeemYieldTokens(
      {
        amount,
        userLiquidityWallet: liquidityVault,
        owner: provider.wallet.publicKey,
        userAuthority: provider.wallet.publicKey,
      },
    );
    await expectTX(redeemTx, "redeem yield token").to.be.fulfilled;
    const userLiquidityWallet = await getTokenAccount(
      provider,
      liquidityVault
    );
    expect(userLiquidityWallet.amount.toString()).equal(amount.toString());
  });
});
