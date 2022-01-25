import { SundialAccountWrapper } from './sundialAccountWrapper';
import { SundialSDK } from '../../sdk';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { BN, utils } from '@project-serum/anchor';
import { SUNDIAL_ADDRESSES } from '../../constants';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { SundialCollateralWrapper } from './sundialCollateralWrapper';
import { getATAAddress, getOrCreateATA } from '@saberhq/token-utils';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SundialWrapper } from './sundialWrapper';
const PROFILE = 'profile';
export class SundialProfileWrapper extends SundialAccountWrapper {
  constructor(sdk: SundialSDK) {
    super(sdk, 'sundialProfile');
  }

  static async getSundialProfileKey(
    user: PublicKey,
    sundialMarket: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [
        sundialMarket.toBytes(),
        user.toBytes(),
        utils.bytes.utf8.encode(PROFILE),
      ],
      SUNDIAL_ADDRESSES.Sundial,
    );
  }

  public async createSundialProfile(
    user: PublicKey,
    sundialMarket: PublicKey,
  ): Promise<TransactionEnvelope> {
    const [sundialProfile, bump] =
      await SundialProfileWrapper.getSundialProfileKey(user, sundialMarket);

    this.publicKey = sundialProfile;
    const ix = this.program.instruction.initializeSundialProfile(
      bump,
      sundialMarket,
      {
        accounts: {
          sundialProfile,
          user,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        },
      },
    );
    return new TransactionEnvelope(this.sdk.provider, [ix]);
  }

  public async refreshSundialProfile(): Promise<TransactionEnvelope> {
    this.checkStateValid();
    const ix = this.program.instruction.refreshSundialProfile({
      accounts: {
        sundialProfile: this.publicKey,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
    });

    const sundialProfile = this.sundialProfile;
    const collaterals = sundialProfile.collaterals.map(
      c => c.sundialCollateral,
    );
    const oracles = sundialProfile.loans.map(l => l.oracle);
    const collateralAndOraclesMetas = collaterals.concat(oracles).map(k => {
      return {
        pubkey: k,
        isSigner: false,
        isWritable: false,
      };
    });

    ix.keys.push(...collateralAndOraclesMetas);

    return new TransactionEnvelope(this.sdk.provider, [ix]);
  }

  public async depositSundialCollateral(
    amount: BN,
    sundialCollateralWrapper: SundialCollateralWrapper,
    userPortLpWalletPubkey?: PublicKey,
    userPubkey?: PublicKey,
    transferAuthorityKP?: Keypair,
  ): Promise<TransactionEnvelope> {
    this.checkStateValid();

    const user = userPubkey ?? this.program.provider.wallet.publicKey;
    const userPortLpWallet =
      userPortLpWalletPubkey ??
      (await getATAAddress({
        mint: sundialCollateralWrapper.sundialCollateralData.collateralMint,
        owner: user,
      }));

    const transferAuthority = transferAuthorityKP
      ? transferAuthorityKP.publicKey
      : user;
    const sundialCollateral = sundialCollateralWrapper.publicKey;
    const sundialCollateralPortLpWallet = (
      await sundialCollateralWrapper.getCollateralWalletAndBump()
    )[0];

    const ix = this.program.instruction.depositSundialCollateral(amount, {
      accounts: {
        sundialProfile: this.publicKey,
        sundialCollateral,
        sundialCollateralPortLpWallet,
        userPortLpWallet,
        tokenProgram: TOKEN_PROGRAM_ID,
        user,
        transferAuthority,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
    });
    const tx = new TransactionEnvelope(this.sdk.provider, [ix]);
    if (transferAuthorityKP) {
      tx.addSigners(transferAuthorityKP);
    }
    return tx;
  }

  public async mintSundialLiquidityWithCollateral(
    amount: BN,
    sundialWrapper: SundialWrapper,
    userPubkey?: PublicKey,
    userPrincipleWalletPubkey?: PublicKey,
  ): Promise<TransactionEnvelope> {
    this.checkStateValid();
    const user = userPubkey ?? this.program.provider.wallet.publicKey;
    const sundialPrincipleMint = (
      await sundialWrapper.getPrincipleMintAndBump()
    )[0];
    const sundialAuthority = (await sundialWrapper.getAuthorityAndBump())[0];
    const feeReceiverWallet = (await sundialWrapper.getFeeReceiverAndBump())[0];

    const { address: userPrincipleWallet, instruction: ix1 } =
      userPrincipleWalletPubkey
        ? {
            address: userPrincipleWalletPubkey,
            instruction: null,
          }
        : await getOrCreateATA({
            provider: this.sdk.provider,
            mint: sundialPrincipleMint,
            owner: user,
          });

    const ix2 = this.program.instruction.mintSundialLiquidityWithCollateral(
      amount,
      {
        accounts: {
          sundialProfile: this.publicKey,
          sundial: sundialWrapper.publicKey,
          sundialAuthority,
          sundialPrincipleMint,
          feeReceiverWallet,
          userPrincipleWallet,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
          user,
        },
      },
    );
    return new TransactionEnvelope(
      this.sdk.provider,
      [ix1, ix2].filter(ix => !!ix),
    );
  }

  public async withdrawSundialCollateral(
    amount: BN,
    sundialCollateralWrapper: SundialCollateralWrapper,
    userPortLpWalletPubkey?: PublicKey,
    userPubkey?: PublicKey,
  ): Promise<TransactionEnvelope> {
    this.checkStateValid();

    const user = userPubkey ?? this.program.provider.wallet.publicKey;
    const sundialCollateralAuthority = (
      await sundialCollateralWrapper.getAuthorityAndBump()
    )[0];
    const sundialCollateralPortLpWallet = (
      await sundialCollateralWrapper.getCollateralWalletAndBump()
    )[0];
    const { address: userPortLpWallet, instruction: ix1 } =
      userPortLpWalletPubkey
        ? {
            address: userPortLpWalletPubkey,
            instruction: null,
          }
        : await getOrCreateATA({
            provider: this.sdk.provider,
            mint: userPortLpWalletPubkey,
            owner: user,
          });

    const ix2 = this.program.instruction.withdrawSundialCollateral(amount, {
      accounts: {
        sundialProfile: this.publicKey,
        sundialCollateral: sundialCollateralWrapper.publicKey,
        sundialCollateralAuthority,
        sundialCollateralPortLpWallet,
        userPortLpWallet,
        tokenProgram: TOKEN_PROGRAM_ID,
        clock: SYSVAR_CLOCK_PUBKEY,
        user,
      },
    });

    return new TransactionEnvelope(
      this.sdk.provider,
      [ix1, ix2].filter(ix => !!ix),
    );
  }

  public async repaySundialLiquidity(
    amount: BN,
    sundialWrapper: SundialWrapper,
    userLiquidityWallet: PublicKey,
    userPubkey?: PublicKey,
    transferAuthorityKP?: Keypair,
  ): Promise<TransactionEnvelope> {
    this.checkStateValid();
    const user = userPubkey ?? this.program.provider.wallet.publicKey;
    const transferAuthority = transferAuthorityKP
      ? transferAuthorityKP.publicKey
      : user;

    const sundialLiquidityWallet = (
      await sundialWrapper.getLiquidityTokenSupplyAndBump()
    )[0];
    const ix = this.program.instruction.repaySundialLiquidity(amount, {
      accounts: {
        sundialProfile: this.publicKey,
        sundial: sundialWrapper.publicKey,
        sundialLiquidityWallet,
        userLiquidityWallet,
        user,
        transferAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });

    const tx = new TransactionEnvelope(this.sdk.provider, [ix]);
    if (transferAuthorityKP) {
      tx.addSigners(transferAuthorityKP);
    }

    return tx;
  }

  public async liquidateSundialProfile(
    repayLiquidityWallet: PublicKey,
    withdrawCollateralWallet: PublicKey,
    sundialCollateralWrapper: SundialCollateralWrapper,
    sundialWrapper: SundialWrapper,
    userRepayLiquidityWallet: PublicKey,
    userWithdrawCollateralWalletPubkey?: PublicKey,
    userPubkey?: PublicKey,
    transferAuthorityKP?: Keypair,
  ): Promise<TransactionEnvelope> {
    this.checkStateValid();

    const user = userPubkey ?? this.sdk.provider.wallet.publicKey;
    const { address: userWithdrawCollateralWallet, instruction: ix1 } =
      userWithdrawCollateralWalletPubkey
        ? {
            address: userWithdrawCollateralWalletPubkey,
            instruction: null,
          }
        : await getOrCreateATA({
            provider: this.sdk.provider,
            mint: sundialCollateralWrapper.sundialCollateralData.collateralMint,
            owner: user,
          });

    const sundialLiquidityWallet = (
      await sundialWrapper.getLiquidityTokenSupplyAndBump()
    )[0];
    const sundialCollateralAuthority = (
      await sundialCollateralWrapper.getAuthorityAndBump()
    )[0];
    const sundialCollateralWallet = (
      await sundialCollateralWrapper.getCollateralWalletAndBump()
    )[0];
    const transferAuthority = transferAuthorityKP
      ? transferAuthorityKP.publicKey
      : user;
    const ix2 = this.program.instruction.liquidateSundialProfile({
      accounts: {
        sundialProfile: this.publicKey,
        userRepayLiquidityWallet,
        userWithdrawCollateralWallet,
        sundial: sundialWrapper.publicKey,
        sundialCollateral: sundialCollateralWrapper.publicKey,
        sundialCollateralAuthority,
        sundialLiquidityWallet,
        sundialCollateralWallet,
        transferAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
    });
    const tx = new TransactionEnvelope(
      this.sdk.provider,
      [ix1, ix2].filter(ix => !!ix),
    );
    if (transferAuthorityKP) {
      tx.addSigners(transferAuthorityKP);
    }
    return tx;
  }
}
