import {
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { utils } from '@project-serum/anchor';
import BN from 'bn.js';
import {
  ParsedAccount,
  refreshReserveInstruction,
  ReserveData,
} from '@port.finance/port-sdk';
import { SundialSDK } from '../../sdk';
import { SundialAccountWrapper } from './index';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SUNDIAL_ADDRESSES } from '../../constants';
import invariant from 'tiny-invariant';

const COLLATERAL = 'collateral';
export class SundialCollateralWrapper extends SundialAccountWrapper {
  constructor(sdk: SundialSDK) {
    super(sdk, 'sundialCollateral');
  }

  static async getSundialCollateralKey(
    name: string,
    sundialMarket: PublicKey,
  ): Promise<[PublicKey, number]> {
    const bumpBytes = [COLLATERAL, name].map(utils.bytes.utf8.encode);
    bumpBytes.unshift(sundialMarket.toBytes());
    return await PublicKey.findProgramAddress(
      bumpBytes,
      SUNDIAL_ADDRESSES.Sundial,
    );
  }

  public async getCollateralWalletAndBump(): Promise<[PublicKey, number]> {
    return this.getLPTokenSupplyAndBump();
  }

  public async createSundialCollateral({
    name,
    reserve,
    sundialMarket,
    config,
  }: CreateSundialCollateralParams): Promise<TransactionEnvelope> {
    const [sundialCollateral, pdaBump] =
      await SundialCollateralWrapper.getSundialCollateralKey(
        name,
        sundialMarket,
      );
    this.publicKey = sundialCollateral;
    const [sundialCollateralLpWallet, portLpBump] =
      await this.getLPTokenSupplyAndBump();
    const [sundialCollateralAuthority, authorityBump] =
      await this.getAuthorityAndBump();
    const bumps = {
      portLpBump,
      authorityBump,
    };

    const ix = this.program.instruction.initializeSundialCollateral(
      bumps,
      config,
      name,
      pdaBump,
      {
        accounts: {
          sundialCollateral,
          sundialCollateralAuthority,
          sundialCollateralLpWallet,
          portCollateralReserve: reserve.pubkey,
          portLpMint: reserve.data.collateral.mintPubkey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
          owner: this.sdk.provider.wallet.publicKey,
          sundialMarket,
        },
      },
    );

    return new TransactionEnvelope(this.sdk.provider, [ix]);
  }

  public async refreshSundialCollateral(
    reserve: ParsedAccount<ReserveData>,
  ): Promise<TransactionEnvelope> {
    this.checkStateValid();
    invariant(
      this.sundialCollateralData.portCollateralReserve == reserve.pubkey,
      'Wrong reserve provided',
    );
    const ix = this.program.instruction.refreshSundialCollateral({
      accounts: {
        sundialCollateral: this.publicKey,
        portCollateralReserve: reserve.pubkey,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
    });
    return new TransactionEnvelope(this.sdk.provider, [
      refreshReserveInstruction(
        reserve.pubkey,
        reserve.data.liquidity.oracleOption == 1
          ? reserve.data.liquidity.oraclePubkey
          : null,
      ),
      ix,
    ]);
  }
}

export interface SundialCollateralConfigParams {
  ltv: number;
  liquidationThreshold: number;
  liquidationPenalty: number;
  liquidityCap: BN;
}

export interface CreateSundialCollateralParams {
  name: string;
  reserve: ParsedAccount<ReserveData>;
  sundialMarket: PublicKey;
  config: SundialCollateralConfigParams;
}
