import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { TransactionEnvelope } from '@saberhq/solana-contrib';

import { SundialSDK } from '../../sdk';
import invariant from 'tiny-invariant';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import {
  ParsedAccount,
  refreshReserveInstruction,
  ReserveData,
} from '@port.finance/port-sdk';
import { getATAAddress, getOrCreateATA, MAX_U64 } from '@saberhq/token-utils';
import { SundialAccountWrapper } from './sundialAccountWrapper';
import { SUNDIAL_ADDRESSES } from '../../constants';
import { utils } from '@project-serum/anchor';

const PORT_LENDING = new PublicKey(
  'Port7uDYB3wk6GJAw4KT1WpTeMtSu9bTcChBHkX2LfR',
);

export class SundialWrapper extends SundialAccountWrapper {
  constructor(sdk: SundialSDK) {
    super(sdk, 'sundial');
  }

  public getSundial(): PublicKey {
    invariant(this.publicKey, 'sundial key not set');
    return this.publicKey;
  }

  static async getSundialKey(
    name: string,
    sundialMarket: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [sundialMarket.toBytes(), utils.bytes.utf8.encode(name)],
      SUNDIAL_ADDRESSES.Sundial,
    );
  }

  public async createSundial({
    sundialName,
    owner,
    durationInSeconds,
    liquidityMint,
    oracle,
    sundialMarket,
    reserve,
    liquidityCap = new BN(MAX_U64.toString()),
    lendingFeeInBips = 0,
    borrowingFeeInBips = 0,
  }: {
    sundialName: string;
    owner: PublicKey;
    durationInSeconds: BN;
    liquidityMint: PublicKey;
    oracle: PublicKey;
    sundialMarket: PublicKey;
    reserve: ParsedAccount<ReserveData>;
    liquidityCap?: BN;
    lendingFeeInBips?: number;
    borrowingFeeInBips?: number;
  }): Promise<TransactionEnvelope> {
    const [sundial, pdaBump] = await SundialWrapper.getSundialKey(
      sundialName,
      sundialMarket,
    );
    this.publicKey = sundial;
    const [principleTokenMint, principleMintBump] =
      await this.getPrincipleMintAndBump();
    const [yieldTokenMint, yieldMintBump] = await this.getYieldMintAndBump();
    const [sundialPortLiquidityWallet, portLiquidityBump] =
      await this.getLiquidityTokenSupplyAndBump();
    const [sundialPortLpWallet, portLpBump] =
      await this.getLPTokenSupplyAndBump();
    const [feeReceiverWallet, feeReceiverBump] =
      await this.getFeeReceiverAndBump();
    const [sundialAuthority, authorityBump] = await this.getAuthorityAndBump();

    return new TransactionEnvelope(this.sdk.provider, [
      refreshReserveInstruction(
        reserve.pubkey,
        reserve.data.liquidity.oracleOption === 1
          ? reserve.data.liquidity.oraclePubkey
          : null,
      ),
      this.program.instruction.initializeSundial(
        {
          authorityBump,
          portLiquidityBump,
          portLpBump,
          principleMintBump,
          yieldMintBump,
          feeReceiverBump,
        },
        durationInSeconds,
        PORT_LENDING,
        {
          lendingFee: lendingFeeInBips,
          borrowFee: borrowingFeeInBips,
          liquidityCap,
        },
        oracle,
        sundialName,
        pdaBump,
        {
          accounts: {
            sundial,
            sundialAuthority,
            sundialPortLiquidityWallet,
            sundialPortLpWallet,
            principleTokenMint,
            yieldTokenMint,
            portLiquidityMint: liquidityMint,
            portLpMint: reserve.data.collateral.mintPubkey,
            feeReceiverWallet,
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
  }

  public async mintPrincipleAndYieldTokens({
    amount,
    lendingMarket,
    reserve,
    userLiquidityWallet,
    userAuthorityKP,
  }: {
    amount: BN;
    lendingMarket: PublicKey;
    reserve: ParsedAccount<ReserveData>;
    userLiquidityWallet: PublicKey;
    userAuthorityKP?: Keypair;
  }) {
    this.checkStateValid();
    const [principleTokenMint] = await this.getPrincipleMintAndBump();
    const [yieldTokenMint] = await this.getYieldMintAndBump();
    const userAuthority = userAuthorityKP
      ? userAuthorityKP.publicKey
      : this.program.provider.wallet.publicKey;
    const { address: userPrincipleTokenWallet, instruction: ix1 } =
      await getOrCreateATA({
        provider: this.sdk.provider,
        mint: principleTokenMint,
      });

    const { address: userYieldTokenWallet, instruction: ix2 } =
      await getOrCreateATA({
        provider: this.sdk.provider,
        mint: yieldTokenMint,
      });

    const ixs = [ix1, ix2].filter(ix => !!ix);

    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.toBuffer()],
      PORT_LENDING,
    );

    ixs.push(
      refreshReserveInstruction(
        reserve.pubkey,
        reserve.data.liquidity.oracleOption == 1
          ? reserve.data.liquidity.oraclePubkey
          : null,
      ),
      this.program.instruction.mintPrincipleTokensAndYieldTokens(amount, {
        accounts: {
          sundial: this.publicKey,
          sundialAuthority: (await this.getAuthorityAndBump())[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndBump())[0],
          sundialFeeReceiverWallet: (await this.getFeeReceiverAndBump())[0],
          principleTokenMint: (await this.getPrincipleMintAndBump())[0],
          yieldTokenMint: (await this.getYieldMintAndBump())[0],
          userLiquidityWallet,
          userPrincipleTokenWallet,
          userYieldTokenWallet,
          userAuthority,
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

    const tx = new TransactionEnvelope(this.sdk.provider, ixs);
    if (userAuthorityKP) {
      tx.addSigners(userAuthorityKP);
    }
    return tx;
  }

  public async redeemPrincipleTokens({
    amount,
    ownerPubkey,
    userLiquidityWallet,
    userAuthorityKP,
  }: {
    amount: BN;
    ownerPubkey?: PublicKey;
    userLiquidityWallet: PublicKey;
    userAuthorityKP?: Keypair;
  }) {
    this.checkStateValid();

    const [principleTokenMint] = await this.getPrincipleMintAndBump();
    const owner = ownerPubkey
      ? ownerPubkey
      : this.sdk.provider.wallet.publicKey;
    const userAuthority = userAuthorityKP ? userAuthorityKP.publicKey : owner;

    const principleAssocTokenAccount = await getATAAddress({
      mint: principleTokenMint,
      owner,
    });

    const tx = new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemPrincipleTokens(amount, {
        accounts: {
          sundial: this.publicKey,
          sundialAuthority: (await this.getAuthorityAndBump())[0],
          sundialPortLiquidityWallet: (
            await this.getLiquidityTokenSupplyAndBump()
          )[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndBump())[0],
          principleTokenMint: (await this.getPrincipleMintAndBump())[0],
          userLiquidityWallet,
          userPrincipleTokenWallet: principleAssocTokenAccount,
          userAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
      }),
    ]);
    if (userAuthorityKP) {
      tx.addSigners(userAuthorityKP);
    }
    return tx;
  }

  public async redeemYieldTokens({
    amount,
    userLiquidityWallet,
    ownerPubkey,
    userAuthorityKP,
  }: {
    amount: BN;
    userLiquidityWallet: PublicKey;
    ownerPubkey?: PublicKey;
    userAuthorityKP?: Keypair;
  }) {
    this.checkStateValid();

    const [yieldTokenMint] = await this.getYieldMintAndBump();
    const owner = ownerPubkey
      ? ownerPubkey
      : this.sdk.provider.wallet.publicKey;

    const userAuthority = userAuthorityKP ? userAuthorityKP.publicKey : owner;

    const userYieldTokenWallet = await getATAAddress({
      mint: yieldTokenMint,
      owner,
    });

    const tx = new TransactionEnvelope(this.sdk.provider, [
      this.program.instruction.redeemYieldTokens(amount, {
        accounts: {
          sundial: this.publicKey,
          sundialAuthority: (await this.getAuthorityAndBump())[0],
          sundialPortLiquidityWallet: (
            await this.getLiquidityTokenSupplyAndBump()
          )[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndBump())[0],
          yieldTokenMint: (await this.getYieldMintAndBump())[0],
          principleTokenMint: (await this.getPrincipleMintAndBump())[0],
          userLiquidityWallet,
          userYieldTokenWallet,
          userAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
      }),
    ]);

    if (userAuthorityKP) {
      tx.addSigners(userAuthorityKP);
    }
    return tx;
  }

  public async redeemPortLp({
    lendingMarket,
    reserve,
  }: {
    lendingMarket: PublicKey;
    reserve: ParsedAccount<ReserveData>;
  }) {
    this.checkStateValid();

    const ixs = [refreshReserveInstruction(reserve.pubkey, null)];
    const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
      [lendingMarket.toBuffer()],
      PORT_LENDING,
    );

    ixs.push(
      this.program.instruction.redeemLp({
        accounts: {
          sundial: this.publicKey,
          sundialAuthority: (await this.getAuthorityAndBump())[0],
          sundialPortLiquidityWallet: (
            await this.getLiquidityTokenSupplyAndBump()
          )[0],
          sundialPortLpWallet: (await this.getLPTokenSupplyAndBump())[0],
          portAccounts: {
            lendingMarket,
            lendingMarketAuthority,
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
