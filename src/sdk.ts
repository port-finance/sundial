import { Programs, SUNDIAL_ADDRESSES, SUNDIAL_IDLS } from './constants';
import type { Provider } from '@saberhq/solana-contrib';
import {
  DEFAULT_PROVIDER_OPTIONS,
  SignerWallet,
  SolanaProvider,
} from '@saberhq/solana-contrib';
import { ConfirmOptions, Signer } from '@solana/web3.js';
import mapValues from 'lodash.mapvalues';
import {
  Address,
  Program,
  Provider as AnchorProvider,
  Idl,
} from '@project-serum/anchor';
import { SundialWrapper } from './wrappers/sundial';

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

  get sundial(): SundialWrapper {
    return new SundialWrapper(this);
  }
}
