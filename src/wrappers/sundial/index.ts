import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { SundialData, SundialProgram } from '../../programs/sundial';
import { SundialSDK } from '../../sdk';
import invariant from 'tiny-invariant';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import BN from 'bn.js';
import {
  ReserveData,
  ParsedAccount,
  refreshReserveInstruction,
} from '@port.finance/port-sdk';
import { getOrCreateATA } from '@saberhq/token-utils';
import { utils } from '@project-serum/anchor';

const PRINCIPLE_MINT_KEY = 'principle_mint';
const YIELD_MINT_KEY = 'yield_mint';
const LIQUIDITY_KEY = 'liquidity';
const LP_KEY = 'lp';
const FEE_RECEIVER_KEY = 'fee_receiver';
const AUTHORITY = 'authority';

export class SundialWrapper {
  public readonly program: SundialProgram;
  public sundial?: PublicKey;
  public sundialData?: SundialData;

  constructor(public readonly sdk: SundialSDK) {
    this.program = sdk.programs.Sundial;
  }

  public async initSundialMarket({
    sundialMarketBase,
    owner,
    payer,
  }: {
    sundialMarketBase: Keypair;
    owner: PublicKey;
    payer: PublicKey;
  }): Promise<TransactionEnvelope> {
    const tx = new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.initializeSundialMarket(owner, {
        accounts: {
          sundialMarket: sundialMarketBase.publicKey,
          payer,
          systemProgram: SystemProgram.programId,
        },
      }),
    ]);
    return tx.addSigners(sundialMarketBase);
  }

  public async createSundialLending({
    sundialBase,
    owner,
    durationInSeconds,
    liquidityMint,
    oracle,
    sundialMarket,
    reserve,
    liquidityCap,
    lendingFeeInBips = 0,
    borrowingFeeInBips = 0,
  }: {
    sundialBase: Keypair;
    owner: PublicKey;
    durationInSeconds: BN;
    liquidityMint: PublicKey;
    oracle: PublicKey;
    sundialMarket: PublicKey;
    reserve: ParsedAccount<ReserveData>;
    liquidityCap: BN;
    lendingFeeInBips?: number;
    borrowingFeeInBips?: number;
  }): Promise<TransactionEnvelope> {
    this.setSundial(sundialBase.publicKey);
    const [principleTokenMint, principleBump] =
      await this.getPrincipleMintAndNounce();
    const [yieldTokenMint, yieldBump] = await this.getYieldMintAndNounce();
    const [liquidityTokenSupply, liquidityBump] =
      await this.getLiquidityTokenSupplyAndNounce();
    const [lpTokenSupply, lpBump] = await this.getLPTokenSupplyAndNounce();
    const [redeemFeeReceiver, feeReceiverBump] =
      await this.getLendingFeeReceiverAndNounce();
    const [sundialAuthority, authorityBump] =
      await this.getSundialAuthorityAndNounce();

    const tx = new TransactionEnvelope(this.sdk.provider, [
      refreshReserveInstruction(
        reserve.pubkey,
        reserve.data.liquidity.oracleOption === 1
          ? reserve.data.liquidity.oraclePubkey
          : null,
      ),
      this.program.instruction.initializeSundial(
        {
          authorityBump: authorityBump,
          portLiquidityBump: liquidityBump,
          portLpBump: lpBump,
          principleMintBump: principleBump,
          yieldMintBump: yieldBump,
          feeReceiverBump: feeReceiverBump,
        },
        durationInSeconds,
        PORT_LENDING,
        {
          lendingFee: lendingFeeInBips,
          borrowFee: borrowingFeeInBips,
          liquidityCap: liquidityCap,
        },
        oracle,
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
            owner,
            sundialMarket,
            clock: SYSVAR_CLOCK_PUBKEY,
          },
        },
      ),
    ]);
    return tx.addSigners(sundialBase);
  }

  public setSundial(key: PublicKey): void {
    this.sundial = key;
  }

  public async reloadSundial(): Promise<void> {
    invariant(this.sundial, 'sundial key not set');
    this.sundialData = await this.program.account.sundial.fetch(this.sundial);
  }

  public getSundial(): PublicKey {
    invariant(this.sundial, 'sundial key not set');
    return this.sundial;
  }

  public async getSundialAccountAndNounce(
    name: string,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [utils.bytes.utf8.encode(name)],
      this.program.programId,
    );
  }

  public async getSundialAuthorityAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), utils.bytes.utf8.encode(AUTHORITY)],
      this.program.programId,
    );
  }

  public async getPrincipleMintAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), utils.bytes.utf8.encode(PRINCIPLE_MINT_KEY)],
      this.program.programId,
    );
  }

  public async getYieldMintAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), utils.bytes.utf8.encode(YIELD_MINT_KEY)],
      this.program.programId,
    );
  }

  public async getLiquidityTokenSupplyAndNounce(): Promise<
    [PublicKey, number]
  > {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), utils.bytes.utf8.encode(LIQUIDITY_KEY)],
      this.program.programId,
    );
  }

  public async getLPTokenSupplyAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), utils.bytes.utf8.encode(LP_KEY)],
      this.program.programId,
    );
  }

  public async getLendingFeeReceiverAndNounce(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [this.sundial.toBuffer(), utils.bytes.utf8.encode(FEE_RECEIVER_KEY)],
      this.program.programId,
    );
  }

  public async mintPrincipleAndYieldTokens({
    amount,
    lendingMarket,
    reserve,
    userLiquidityWallet,
    userAuthority,
  }: {
    amount: BN;
    lendingMarket: PublicKey;
    reserve: ParsedAccount<ReserveData>;
    userLiquidityWallet: PublicKey;
    userAuthority: PublicKey;
  }) {
    invariant(this.sundial, 'sundial key not set');
    invariant(this.sundialData, 'sundial data not loaded');

    const [principleTokenMint] = await this.getPrincipleMintAndNounce();
    const [yieldTokenMint] = await this.getYieldMintAndNounce();

    const { address: principleTokenAccount, instruction: ix1 } =
      await getOrCreateATA({
        provider: this.sdk.provider,
        mint: principleTokenMint,
      });

    const { address: yieldTokenAccount, instruction: ix2 } =
      await getOrCreateATA({
        provider: this.sdk.provider,
        mint: yieldTokenMint,
      });

    const ixs = [ix1, ix2].filter((ix): ix is TransactionInstruction => !!ix);

    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.toBuffer()],
      PORT_LENDING,
    );

    ixs.push(
      refreshReserveInstruction(reserve.pubkey, null),
      this.program.instruction.mintPrincipleTokensAndYieldTokens(amount, {
        accounts: {
          sundial: this.sundial,
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndNounce())[0],
          sundialFeeReceiverWallet: (
            await this.getLendingFeeReceiverAndNounce()
          )[0],
          principleTokenMint: (await this.getPrincipleMintAndNounce())[0],
          yieldTokenMint: (await this.getYieldMintAndNounce())[0],
          userLiquidityWallet: userLiquidityWallet,
          userPrincipleTokenWallet: principleTokenAccount,
          userYieldTokenWallet: yieldTokenAccount,
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
        },
      }),
    );

    return new TransactionEnvelope(this.sdk.provider, ixs);
  }

  public async redeemPrincipleTokens({
    amount,
    owner,
    userLiquidityWallet,
    userAuthority,
  }: {
    amount: BN;
    owner: PublicKey;
    userLiquidityWallet: PublicKey;
    userAuthority: PublicKey;
  }) {
    invariant(this.sundial, 'sundial key not set');
    invariant(this.sundialData, 'sundial data not loaded');

    const [principleTokenMint] = await this.getPrincipleMintAndNounce();

    const principleAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      principleTokenMint,
      owner,
    );
    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemPrincipleTokens(amount, {
        accounts: {
          sundial: this.sundial,
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLiquidityWallet: (
            await this.getLiquidityTokenSupplyAndNounce()
          )[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndNounce())[0],
          principleTokenMint: (await this.getPrincipleMintAndNounce())[0],
          userLiquidityWallet: userLiquidityWallet,
          userPrincipleTokenWallet: principleAssocTokenAccount,
          userAuthority: userAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
      }),
    ]);
  }

  public async redeemYieldTokens({
    amount,
    userLiquidityWallet,
    owner,
    userAuthority,
  }: {
    amount: BN;
    userLiquidityWallet: PublicKey;
    owner: PublicKey;
    userAuthority: PublicKey;
  }) {
    invariant(this.sundial, 'sundial key not set');
    invariant(this.sundialData, 'sundial data not loaded');

    const [yieldTokenMint] = await this.getYieldMintAndNounce();

    const yieldAssocTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      yieldTokenMint,
      owner,
    );

    return new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemYieldTokens(amount, {
        accounts: {
          sundial: this.sundial,
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLiquidityWallet: (
            await this.getLiquidityTokenSupplyAndNounce()
          )[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndNounce())[0],
          yieldTokenMint: (await this.getYieldMintAndNounce())[0],
          principleTokenMint: (await this.getPrincipleMintAndNounce())[0],
          userLiquidityWallet: userLiquidityWallet,
          userYieldTokenWallet: yieldAssocTokenAccount,
          userAuthority: userAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
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
    invariant(this.sundial, 'sundial key not set');
    invariant(this.sundialData, 'sundial data not loaded');

    const ixs = [refreshReserveInstruction(reserve.pubkey, null)];
    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.toBuffer()],
      PORT_LENDING,
    );

    ixs.push(
      this.program.instruction.redeemLp({
        accounts: {
          sundial: this.sundial,
          sundialAuthority: (await this.getSundialAuthorityAndNounce())[0],
          sundialPortLiquidityWallet: (
            await this.getLiquidityTokenSupplyAndNounce()
          )[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndNounce())[0],
          portAccounts: {
            lendingMarket: lendingMarket,
            lendingMarketAuthority: lendingMarketAuthority,
            reserve: reserve.pubkey,
            reserveLiquidityWallet: reserve.data.liquidity.supplyPubkey,
            reserveCollateralMint: reserve.data.collateral.mintPubkey,
            portLendingProgram: PORT_LENDING,
          },
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
      }),
    );

    return new TransactionEnvelope(this.sdk.provider, ixs);
  }
}

const PORT_LENDING = new PublicKey(
  'Port7uDYB3wk6GJAw4KT1WpTeMtSu9bTcChBHkX2LfR',
);
