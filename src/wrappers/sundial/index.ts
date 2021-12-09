import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TransactionEnvelope } from "@saberhq/solana-contrib";
import { SundialData, SundialProgram } from "../../programs/sundial";
import { SundialSDK } from "../../sdk";
import invariant from "tiny-invariant";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { ReserveData, ParsedAccount, refreshReserveInstruction } from "@port.finance/port-sdk";


const PRINCIPLE_MINT_KEY = "principle_mint";
const YIELD_MINT_KEY = "yield_mint";
const LIQUIDITY_KEY = "liquidity";
const LP_KEY = "lp";
const FEE_RECEIVER_KEY = "fee_receiver";
const AUTHORITY = "authority"

export class SundialWrapper {
  public readonly program: SundialProgram;
  public sundial?: PublicKey;
  public sundialData?: SundialData;

  constructor(public readonly sdk: SundialSDK) {
    this.program = sdk.programs.Sundial;
  }

  public async createSundial({
    sundialBase,
    owner,
    durationInSeconds,
    liquidityMint,
    reserve
  }: {
    sundialBase: Keypair;
    owner: PublicKey;
    durationInSeconds: BN;
    liquidityMint: PublicKey;
    reserve: ParsedAccount<ReserveData>;
  }): Promise<TransactionEnvelope> {
    this.setSundial(sundialBase.publicKey);
    const [principleTokenMint, principleBump] = await this.getPrincipleMintAndNounce();
    const [yieldTokenMint, yieldBump] = await this.getYieldMintAndNounce();
    const [liquidityTokenSupply, liquidityBump] = await this.getLiquidityTokenSupplyAndNounce();
    const [lpTokenSupply, lpBump] = await this.getLPTokenSupplyAndNounce();
    const [redeemFeeReceiver, feeReceiverBump] = await this.getFeeReceiverAndNounce();
    const [sundialAuthority, authorityBump] = await this.getSundialAuthorityAndNounce();

    const tx = new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.initialize(
        {
          authorityBump: authorityBump,
          portLiquidityBump: liquidityBump,
          portLpBump: lpBump,
          principleMintBump: principleBump,
          yieldMintBump: yieldBump,
          feeReceiverBump: feeReceiverBump
        },
        durationInSeconds,
        PORT_LENDING,
        {
          accounts: {
            sundial: sundialBase.publicKey,
            sundialAuthority: sundialAuthority,
            sundialPortLiquidityWallet: liquidityTokenSupply,
            sundialPortLpWallet: lpTokenSupply,
            principleTokenMint: principleTokenMint,
            yieldTokenMint: yieldTokenMint,
            portLiquidityMint: liquidityMint,
            portLpMint: reserve.data.collateral.mintPubkey,
            feeReceiverWallet: redeemFeeReceiver,
            reserve: reserve.pubkey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
            user: owner,
            clock: SYSVAR_CLOCK_PUBKEY,
          },
        }),
    ]);
    return tx.addSigners(sundialBase);
  }

  public setSundial(key: PublicKey): void {
    this.sundial = key;
  }

  public async reloadSundial(): Promise<void> {
    invariant(this.sundial, "sundial key not set");
    this.sundialData = await this.program.account.sundial.fetch(
      this.sundial
    );
  }

  public getSundial(): PublicKey {
    invariant(this.sundial, "sundial key not set");
    return this.sundial;
  }

  public async getSundialAccountAndNounce(name: string): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [strToUint8(name)],
      this.program.programId
    );
  }

  public async getSundialAuthorityAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8(AUTHORITY)],
      this.program.programId
    );
  }

  public async getPrincipleMintAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8(PRINCIPLE_MINT_KEY) ],
      this.program.programId
    );
  }


  public async getYieldMintAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8(YIELD_MINT_KEY)],
      this.program.programId
    );
  }

  public async getLiquidityTokenSupplyAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8(LIQUIDITY_KEY)],
      this.program.programId
    );
  }

  public async getLPTokenSupplyAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8(LP_KEY)],
      this.program.programId
    );
  }

  public async getFeeReceiverAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8(FEE_RECEIVER_KEY)],
      this.program.programId
    );
  }

  public async mintPrincipleAndYieldTokens({
    amount,
    lendingMarket,
    reserve,
    userLiquidityWallet,
    userPrincipleTokenWallet,
    userYieldTokenWallet,
    userAuthority,
  }: {
    amount: BN;
    lendingMarket: PublicKey;
    reserve: ParsedAccount<ReserveData>;
    userLiquidityWallet: PublicKey;
    userPrincipleTokenWallet: PublicKey;
    userYieldTokenWallet: PublicKey;
    userAuthority: PublicKey;
  }) {
    invariant(this.sundial, "sundial key not set");
    invariant(this.sundialData, "sundial data not loaded");

    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.toBuffer()],
      PORT_LENDING
    );
    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.mintPrincipleTokensAndYieldTokens(
        amount,
        {
        accounts: {
          sundial: this.sundial,
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndNounce())[0],

          principleTokenMint: (await this.getPrincipleMintAndNounce())[0],
          yieldTokenMint: (await this.getYieldMintAndNounce())[0],

          userLiquidityWallet: userLiquidityWallet,
          userPrincipleTokenWallet: userPrincipleTokenWallet,
          userYieldTokenWallet: userYieldTokenWallet,
          userAuthority: userAuthority,
          portAccounts: {
            lendingMarket: reserve.data.lendingMarket,
            lendingMarketAuthority: lendingMarketAuthority,
            reserve: reserve.pubkey,
            reserveCollateralMint: reserve.data.collateral.mintPubkey,
            reserveLiquidityWallet: reserve.data.liquidity.supplyPubkey,
            portLendingProgram: PORT_LENDING,
          },
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        }
      }),
    ]);
  }

  public async redeemPrincipleTokens({
    userLiquidityWallet,
    userPrincipleTokenWallet,
    userAuthority,
  }: {
    userLiquidityWallet: PublicKey;
    userPrincipleTokenWallet: PublicKey;
    userAuthority: PublicKey;
  }, amount: BN) {
    invariant(this.sundial, "sundial key not set");
    invariant(this.sundialData, "sundial data not loaded");

    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemPrincipleTokens(amount,{
        accounts: {
          sundial: this.sundial,
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLiquidityWallet: (await this.getLiquidityTokenSupplyAndNounce())[0],
          principleTokenMint: (await this.getPrincipleMintAndNounce())[0],
          userLiquidityWallet: userLiquidityWallet,
          userPrincipleTokenWallet: userPrincipleTokenWallet,
          userAuthority: userAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        }
      }),
    ]);
  }

  public async redeemYieldTokens({
    userLiquidityWallet,
    userYieldTokenWallet,
    userAuthority,
  }: {
    userLiquidityWallet: PublicKey;
    userYieldTokenWallet: PublicKey;
    userAuthority: PublicKey;
  }, amount: BN) {
    invariant(this.sundial, "sundial key not set");
    invariant(this.sundialData, "sundial data not loaded");

    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemYieldTokens( amount,{

        accounts: {
          sundial: this.sundial,
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLiquidityWallet: (await this.getLiquidityTokenSupplyAndNounce())[0],
          yieldTokenMint: (await this.getYieldMintAndNounce())[0],
          principleTokenMint: (await this.getPrincipleMintAndNounce())[0],
          userLiquidityWallet: userLiquidityWallet,
          userYieldTokenWallet: userYieldTokenWallet,
          userAuthority: userAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        }
      }),
    ]);
  }

  public async redeemPortLp({
    lendingMarket,
    reserve,
  }: {
    lendingMarket: PublicKey;
    reserve: ParsedAccount<ReserveData>;
  }) {
    invariant(this.sundial, "sundial key not set");
    invariant(this.sundialData, "sundial data not loaded");

    const ixs = [
      refreshReserveInstruction(reserve.pubkey, null)
    ];
    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.toBuffer()],
      PORT_LENDING
    );

    ixs.push(
      this.program.instruction.redeemLp({
        accounts: {
          sundial: this.sundial,
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLiquidityWallet: (await this.getLiquidityTokenSupplyAndNounce())[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndNounce())[0],
          portAccounts: {
            lendingMarket: lendingMarket,
            lendingMarketAuthority: lendingMarketAuthority,
            reserve: reserve.pubkey,
            reserveLiquidityWallet: reserve.data.liquidity.supplyPubkey,
            reserveCollateralMint: reserve.data.collateral.mintPubkey,
            portLendingProgram: PORT_LENDING
          },
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        }
      }),
    )

    return new TransactionEnvelope(this.sdk.provider, ixs);
  }

}

const strToUint8 = (str: string) => {
  return Uint8Array.from(str.split("").map(c => c.charCodeAt(0)))
}

const PORT_LENDING = new PublicKey("Port7uDYB3wk6GJAw4KT1WpTeMtSu9bTcChBHkX2LfR");
