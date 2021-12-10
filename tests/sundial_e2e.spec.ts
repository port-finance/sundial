import { Provider, setProvider, BN } from "@project-serum/anchor";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { DEFAULT_RESERVE_CONFIG, PORT_LENDING } from "./constants";
import {
  createAccountRentExempt,
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
import { makeSDK } from "./workspace";
import {
  ReserveParser,
  ParsedAccount,
  ReserveData,
  ReserveInfo,
  Port,
  initObligationInstruction,
  refreshObligationInstruction,
  refreshReserveInstruction,
} from "@port.finance/port-sdk";
import { expectTX } from "@saberhq/chai-solana";
import { OBLIGATION_DATA_SIZE } from "@port.finance/port-sdk/dist/cjs/structs/PortBalanceData";

const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;

describe("sundial with positive APY", () => {
  setProvider(Provider.local());
  const provider = Provider.local();

  const sdk = makeSDK();
  const sundialSDK = sdk.sundial;
  let lendingMarketKP: Keypair;
  let reserveState: ReserveState;
  let liquidityMint: PublicKey;
  let liquidityVault: PublicKey;
  let reserveInfo: ReserveInfo;
  let parsedReserve: ParsedAccount<ReserveData>;
  const port: Port = Port.forMainNet({
    connection: provider.connection
  });

  before("Set up reserve", async () => {
    lendingMarketKP = await createLendingMarket(provider);
    const [mintPubkey, vaultPubkey] = await createMintAndVault(
      provider,
      new BN(1000000000000),
    );
    liquidityMint = mintPubkey;
    liquidityVault = vaultPubkey;
    reserveState = await createDefaultReserve(
      provider,
      1,
      vaultPubkey,
      lendingMarketKP.publicKey,
      {
        ...DEFAULT_RESERVE_CONFIG,
        minBorrowRate: 200,
        optimalBorrowRate: 200,
        maxBorrowRate: 200,
      }
    );

    const raw = {
      pubkey: reserveState.address,
      account: await provider.connection.getAccountInfo(reserveState.address),
    };
    parsedReserve = ReserveParser(raw);
    reserveInfo = await port.getReserve(reserveState.address);
    const depositInstructions = await reserveInfo.depositReserve(
      {
        amount: new BN(9999),
        userLiquidityWallet: liquidityVault,
        destinationCollateralWallet: reserveState.useCollateralAccount,
        userTransferAuthority: provider.wallet.publicKey
      }
    );

    const tx = new Transaction();
    tx.add(
      ...depositInstructions
    );
    const obligationKp = await createAccountRentExempt(
      provider,
      PORT_LENDING,
      OBLIGATION_DATA_SIZE
    );
    tx.add(
      initObligationInstruction(
        obligationKp.publicKey,
        lendingMarketKP.publicKey,
        provider.wallet.publicKey
      )
    );

    const depositObligationCollateralIxs = await reserveInfo.depositObligationCollateral(
      {
        amount: new BN(10000),
        userCollateralWallet: reserveState.useCollateralAccount,
        obligation: obligationKp.publicKey,
        obligationOwner: provider.wallet.publicKey,
        userTransferAuthority: provider.wallet.publicKey,
      }
    );

    tx.add(
      ...depositObligationCollateralIxs
    );

    await provider.send(tx);

    const borrowTx = new Transaction();
    borrowTx.add(
      refreshReserveInstruction(
        reserveState.address,
        null
      )
    );
    borrowTx.add(
      refreshObligationInstruction(
        obligationKp.publicKey,
        [reserveState.address],
        []
      )
    );
    const borrowObligationCollateralIxs = await reserveInfo.borrowObligationLiquidity(
      {
        amount: new BN(7000),
        userWallet: liquidityVault,
        obligation: obligationKp.publicKey,
        owner: provider.wallet.publicKey,
        userTransferAuthority: provider.wallet.publicKey
      }
    );
    borrowTx.add(
      ...borrowObligationCollateralIxs
    );
    await provider.send(borrowTx);
  });

  const sundialBase = Keypair.generate();
  it("Initialize Sundial", async () => {
    const duration = new BN(60); // 60 seconds from now
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
  });

  const amount = new BN(100_000_000_000);
  it("generate less principle tokens", async () => {
    await sleep(10000);
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
    const depositApy = 2 * 0.7;
    const interestAccure = amount.toNumber() * depositApy / SECONDS_IN_YEAR;
    const yieldWallet = await getTokenAccount(provider, yieldAssocTokenAccount);
    expect(principleWallet.amount.lt(yieldWallet.amount)).to.be.true;
    expect(yieldWallet.amount.sub(principleWallet.amount).toNumber()).gt(interestAccure);
  });
});
