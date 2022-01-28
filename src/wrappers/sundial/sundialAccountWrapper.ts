import { SundialAccountData, SundialProgram } from '../../programs';
import { PublicKey } from '@solana/web3.js';
import { SundialSDK } from '../../sdk';
import invariant from 'tiny-invariant';

export class SundialAccountWrapper {
  public readonly program: SundialProgram;
  private key?: PublicKey;
  private data: SundialAccountData;

  constructor(
    public readonly sdk: SundialSDK,
    type: 'sundial' | 'sundialCollateral' | 'sundialProfile',
  ) {
    this.program = sdk.programs.Sundial;
    this.data = {
      type,
    };
  }

  public async reloadData(): Promise<void> {
    invariant(this.key, 'key not set');
    this.data = {
      type: this.data.type,
      data: await this.program.account[this.data.type].fetch(this.key),
    };
  }

  set publicKey(key: PublicKey) {
    this.key = key;
  }

  get publicKey() {
    invariant(this.key, 'key not set');
    return this.key;
  }

  public checkStateValid(): void {
    invariant(this.key, 'key not set');
    invariant(this.data.data, 'data not set');
  }

  get sundialData() {
    this.checkStateValid();
    invariant(this.data.type === 'sundial', 'Not SundialData');
    return this.data.data;
  }

  get sundialCollateralData() {
    this.checkStateValid();
    invariant(
      this.data.type === 'sundialCollateral',
      'Not SundialCollateralData',
    );
    return this.data.data;
  }

  get sundialProfileData() {
    this.checkStateValid();
    invariant(this.data.type === 'sundialProfile', 'Not SundialProfileData');
    return this.data.data;
  }

  public async getAuthorityAndBump(): Promise<[PublicKey, number]> {
    invariant(this.key, 'key not set');
    return this.sdk.getAuthorityAndBump(this.key);
  }
  public async getPrincipleMintAndBump(): Promise<[PublicKey, number]> {
    invariant(this.key, 'key not set');
    return this.sdk.getPrincipleMintAndBump(this.key);
  }

  public async getYieldMintAndBump(): Promise<[PublicKey, number]> {
    invariant(this.key, 'key not set');
    return this.sdk.getYieldMintAndBump(this.key);
  }

  public async getLiquidityTokenSupplyAndBump(): Promise<[PublicKey, number]> {
    invariant(this.key, 'key not set');
    return this.sdk.getLiquidityTokenSupplyAndBump(this.key);
  }

  public async getLPTokenSupplyAndBump(): Promise<[PublicKey, number]> {
    invariant(this.key, 'key not set');
    return this.sdk.getLPTokenSupplyAndNounce(this.key);
  }

  public async getFeeReceiverAndBump(): Promise<[PublicKey, number]> {
    invariant(this.key, 'key not set');
    return this.sdk.getFeeReceiverAndBump(this.key);
  }
}
