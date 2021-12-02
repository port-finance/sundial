import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { TransactionEnvelope } from "@saberhq/solana-contrib";
import { SundialData, SundialProgram } from "../../programs/sundial";
import { SundialSDK } from "../../sdk";
import invariant from "tiny-invariant";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ReserveInfo } from "@port.finance/port-sdk";


export class SundialWrapper {
  public readonly program: SundialProgram;
  public sundial?: PublicKey;
  public sundialData?: SundialData;

  constructor(public readonly sdk: SundialSDK) {
    this.program = sdk.programs.Sundial;
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

  public async getSundialAuthority(): Promise<PublicKey> {
    return await PublicKey.findProgramAddress(
      [],
      this.program.programId
    )[0];
  }

  public async getPrincipleMint(): Promise<PublicKey> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8("principle_mint") ],
      this.program.programId
    )[0];
  }


  public async getYieldMint(): Promise<PublicKey> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8("yield_mint")],
      this.program.programId
    )[0];
  }

  public async getLiquidityTokenSupply(): Promise<PublicKey> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8("lp")],
      this.program.programId
    )[0];
  }

  public async getLPTokenSupply(): Promise<PublicKey> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), strToUint8("lp")],
      this.program.programId
    )[0];
  }

  public async mintPrincipleAndYieldTokens({
    lendingMarket,
    reserve,
    userLiquidityWallet,
    userPrincipleTokenWallet,
    userYieldTokenWallet,
    userAuthority,
  }: {
    lendingMarket: PublicKey;
    reserve: ReserveInfo;
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
      this.program.instruction.mintPrincipleTokensAndYieldTokens({
        accounts: {
          sundial: this.sundial,
          sundialAuthority: await this.getSundialAuthority(),
          sundialPortLpWallet: await this.getLPTokenSupply(),

          principleTokenMint: await this.getPrincipleMint(),
          yieldTokenMint: await this.getYieldMint(),

          userLiquidityWallet: userLiquidityWallet,
          userPrincipleTokenWallet: userPrincipleTokenWallet,
          userYieldTokenWallet: userYieldTokenWallet,
          userAuthority: userAuthority,
          portAccounts: {
            lendingMarket: reserve.marketId.key,
            lendingMarketAuthority: lendingMarketAuthority,
            reserve: reserve.getReserveId().key,
            reserveCollateralMint: reserve.getShareId().key,
            reserveLiquidityWallet: reserve.getAssetBalanceId().key,
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
  }) {
    invariant(this.sundial, "sundial key not set");
    invariant(this.sundialData, "sundial data not loaded");

    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemPrincipleTokens({
        accounts: {
          sundial: this.sundial,
          sundialAuthority: await this.getSundialAuthority(),
          sundialPortLiquidityWallet: await this.getLiquidityTokenSupply(),
          principleTokenMint: await this.getPrincipleMint(),
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
    lendingMarket: PublicKey;
    reserve: ReserveInfo;
    userLiquidityWallet: PublicKey;
    userYieldTokenWallet: PublicKey;
    userAuthority: PublicKey;
  }) {
    invariant(this.sundial, "sundial key not set");
    invariant(this.sundialData, "sundial data not loaded");

    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemYieldTokens({
        accounts: {
          sundial: this.sundial,
          sundialAuthority: await this.getSundialAuthority(),
          sundialPortLiquidityWallet: await this.getLiquidityTokenSupply(),
          yieldTokenMint: await this.getYieldMint(),
          principleTokenMint: await this.getPrincipleMint(),
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
    reserve: ReserveInfo;
  }) {
    invariant(this.sundial, "sundial key not set");
    invariant(this.sundialData, "sundial data not loaded");

    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.toBuffer()],
      PORT_LENDING
    );

    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemLp({
        accounts: {
          sundial: this.sundial,
          sundialAuthority: await this.getSundialAuthority(),
          sundialPortLiquidityWallet: await this.getLiquidityTokenSupply(),
          sundialPortLpWallet: await this.getLPTokenSupply(),
          portAccounts: {
            lendingMarket: lendingMarket,
            lendingMarketAuthority: lendingMarketAuthority,
            reserve: reserve.getReserveId().key,
            reserveLiquidityWallet: reserve.getAssetBalanceId().key,
            reserveCollateralMint: reserve.getShareId().key,
            portLendingProgram: PORT_LENDING
          },
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        }
      }),
    ]);
  }

}

const strToUint8 = (str: string) => {
  return Uint8Array.from(str.split("").map(c => c.charCodeAt(0)))
}

const PORT_LENDING = new PublicKey("Port7uDYB3wk6GJAw4KT1WpTeMtSu9bTcChBHkX2LfR");
