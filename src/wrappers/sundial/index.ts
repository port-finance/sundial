import { PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TransactionEnvelope } from "@saberhq/solana-contrib";
import { SundialData, SundialProgram } from "../../programs/sundial";
import { SundialSDK } from "../../sdk";
import invariant from "tiny-invariant";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ReserveInfo } from "@port.finance/port-sdk";
import BN from "bn.js";


const PRINCIPLE_MINT_KEY = "principle_mint";
const YIELD_MINT_KEY = "yield_mint";
const LIQUIDITY_KEY = "liquidity";
const LP_KEY = "lp";
const FEE_RECEIVER_KEY = "fee_receiver";
export class SundialWrapper {
  public readonly program: SundialProgram;
  public sundial?: PublicKey;
  public sundialData?: SundialData;

  constructor(public readonly sdk: SundialSDK) {
    this.program = sdk.programs.Sundial;
  }

  public async createSundial({
    name,
    owner,
    endTimeStamp,
    liquidityMint,
    reserve
  }: {
    name: string;
    owner: PublicKey;
    endTimeStamp: BN;
    liquidityMint: PublicKey;
    reserve: ReserveInfo;
  }): Promise<TransactionEnvelope> {
    const [sundialPubkey, sundialBump] = await this.getSundialAccountAndNounce(name);
    this.setSundial(sundialPubkey);
    const [principleTokenMint, principleBump] = await this.getPrincipleMintAndNounce();
    const [yieldTokenMint, yieldBump] = await this.getYieldMintAndNounce();
    const [liquidityTokenSupply, liquidityBump] = await this.getLiquidityTokenSupplyAndNounce();
    const [lpTokenSupply, lpBump] = await this.getLPTokenSupplyAndNounce();
    const [redeemFeeReceiver, feeReceiverBump] = await this.getFeeReceiverAndNounce();
    const [sundialAuthority, authorityBump] = await this.getSundialAuthorityAndNounce();

    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.initialize(
      {
          sundialBump: sundialBump,
          authorityBump: authorityBump,
          portLiquidityBump: liquidityBump,
          portLpBump: lpBump,
          principleMintBump: principleBump,
          yieldMintBump: yieldBump,
          feeReceiverBump: feeReceiverBump
        },
        name,
        endTimeStamp, 
        PORT_LENDING,
        {
          accounts: {
            sundial: sundialPubkey,
            sundialAuthority: sundialAuthority,
            sundialPortLiquidityWallet: liquidityTokenSupply,
            sundialPortLpWallet: lpTokenSupply,
            principleTokenMint: principleTokenMint,
            yieldTokenMint: yieldTokenMint,
            portLiquidityMint: liquidityMint,
            portLpMint: reserve.getShareId().key,
            feeReceiverWallet: redeemFeeReceiver,
            reserve: reserve.getReserveId().key,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
            user: owner,
            clock: SYSVAR_CLOCK_PUBKEY,
          },
        }),
    ]);
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
      [],
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
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLiquidityWallet: (await this.getLiquidityTokenSupplyAndNounce())[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndNounce())[0],
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
