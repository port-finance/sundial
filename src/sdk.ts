import { Programs, SUNDIAL_ADDRESSES, SUNDIAL_IDLS } from './constants';
import type { Provider } from '@saberhq/solana-contrib';
import {
  DEFAULT_PROVIDER_OPTIONS,
  SignerWallet,
  SolanaProvider,
  TransactionEnvelope,
} from '@saberhq/solana-contrib';
import {
  ConfirmOptions,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
} from '@solana/web3.js';
import mapValues from 'lodash.mapvalues';
import {
  Address,
  Program,
  Provider as AnchorProvider,
  Idl,
  utils,
} from '@project-serum/anchor';

import { expectTX } from '@saberhq/chai-solana';
import { SundialProfileWrapper, SundialWrapper } from './wrappers';
import { SundialCollateralWrapper } from './wrappers';

const AUTHORITY = 'authority';
const FEE_RECEIVER_KEY = 'fee_receiver';
const PRINCIPLE_MINT_KEY = 'principle_mint';
const YIELD_MINT_KEY = 'yield_mint';
const LIQUIDITY_KEY = 'liquidity';
const LP_KEY = 'lp';

export class SundialSDK {
  constructor(
    public readonly provider: Provider,
    public readonly programs: Programs,
  ) {}

  /**
   * Creates a new instance of the SDK with the given keypair.
   */
  public withSigner(signer: Signer): SundialSDK {
    const wallet = new SignerWallet(signer);
    const provider = new SolanaProvider(
      this.provider.connection,
      this.provider.broadcaster,
      wallet,
      this.provider.opts,
    );
    return SundialSDK.load({
      provider,
      addresses: mapValues(this.programs, v => v.programId),
    });
  }

  get programList(): Program[] {
    return Object.values(this.programs) as Program[];
  }

  get sundialWrapper() {
    return new SundialWrapper(this);
  }

  get sundialCollateralWrapper() {
    return new SundialCollateralWrapper(this);
  }

  get sundialProfileWrapper() {
    return new SundialProfileWrapper(this);
  }

  /**
   * Loads the SDK.
   * @returns SundialSDK
   */
  public static load({
    provider,
    addresses = SUNDIAL_ADDRESSES,
    confirmOptions = DEFAULT_PROVIDER_OPTIONS,
  }: {
    // Provider
    provider: Provider;
    // Addresses of each program.
    addresses?: { [K in keyof Programs]?: Address };
    idls?: { [K in keyof Programs]?: unknown };
    confirmOptions?: ConfirmOptions;
  }): SundialSDK {
    const allAddresses = { ...SUNDIAL_ADDRESSES, ...addresses };
    const programs: Programs = mapValues(
      SUNDIAL_ADDRESSES,
      (_: Address, programName: keyof Programs): Program => {
        const address = allAddresses[programName];
        const idl = SUNDIAL_IDLS[programName];
        const anchorProvider = new AnchorProvider(
          provider.connection,
          provider.wallet,
          confirmOptions,
        );
        return new Program(
          idl as Idl,
          address,
          anchorProvider,
        ) as unknown as Program;
      },
    ) as unknown as Programs;
    return new SundialSDK(provider, programs);
  }

  public async getAuthorityAndBump(
    key: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [key.toBuffer(), utils.bytes.utf8.encode(AUTHORITY)],
      this.programs.Sundial.programId,
    );
  }

  public async getPrincipleMintAndBump(
    key: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [key.toBuffer(), utils.bytes.utf8.encode(PRINCIPLE_MINT_KEY)],
      this.programs.Sundial.programId,
    );
  }

  public async getYieldMintAndBump(
    key: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [key.toBuffer(), utils.bytes.utf8.encode(YIELD_MINT_KEY)],
      this.programs.Sundial.programId,
    );
  }

  public async getLiquidityTokenSupplyAndBump(
    key: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [key.toBuffer(), utils.bytes.utf8.encode(LIQUIDITY_KEY)],
      this.programs.Sundial.programId,
    );
  }

  public async getLPTokenSupplyAndNounce(
    key: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [key.toBuffer(), utils.bytes.utf8.encode(LP_KEY)],
      this.programs.Sundial.programId,
    );
  }

  public async getFeeReceiverAndBump(
    key: PublicKey,
  ): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [key.toBuffer(), utils.bytes.utf8.encode(FEE_RECEIVER_KEY)],
      this.programs.Sundial.programId,
    );
  }

  public async getCreateSundialMarketTx({
    sundialMarketBase,
    owner,
    payer,
  }: {
    sundialMarketBase: Keypair;
    owner: PublicKey;
    payer: PublicKey;
  }): Promise<TransactionEnvelope> {
    const tx = new TransactionEnvelope(this.provider, [
      this.programs.Sundial.instruction.initializeSundialMarket(owner, {
        accounts: {
          sundialMarket: sundialMarketBase.publicKey,
          payer,
          systemProgram: SystemProgram.programId,
        },
      }),
    ]);
    return tx.addSigners(sundialMarketBase);
  }

  public async createSundialMarket(owner?: PublicKey): Promise<Keypair> {
    const sundialMarket = Keypair.generate();
    const tx = await this.getCreateSundialMarketTx({
      sundialMarketBase: sundialMarket,
      owner: owner ? owner : this.provider.wallet.publicKey,
      payer: this.provider.wallet.publicKey,
    });
    await expectTX(tx, 'init sundial market').to.be.fulfilled;
    return sundialMarket;
  }
}
