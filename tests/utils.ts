import {
  initLendingMarketInstruction,
  initReserveInstruction,
  ReserveConfigProto,
} from '@port.finance/port-sdk';
import { BN, Provider } from '@project-serum/anchor';
import {
  getMintInfo,
  getTokenAccount as saberGetTokenAccount,
} from '@saberhq/token-utils';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Transaction } from '@solana/web3.js';
import { SystemProgram } from '@solana/web3.js';
import {
  LENDING_MARKET_LEN,
  PORT_LENDING,
  RESERVE_LEN,
  TOKEN_ACCOUNT_LEN,
  TOKEN_MINT_LEN,
} from './constants';
import { expect } from 'chai';
import Big from 'big.js';
import { Provider as SaberProvider } from '@saberhq/solana-contrib';
import { getTokenAccount } from '@project-serum/common';
import { parsePriceData } from '@pythnetwork/client';

export async function getPythPrice(
  provider: Provider,
  oracle: PublicKey,
): Promise<Big> {
  const pythData = await provider.connection.getAccountInfo(oracle);
  const priceData = parsePriceData(pythData.data);
  return new Big(10).pow(priceData.exponent).mul(priceData.price);
}

export class checkerBuilder<T, S> {
  protected checkers: ((x: T) => Promise<void>)[] = [];
  constructor(public readonly n: S) {}
  public toChecker(): (x: T) => Promise<void> {
    return async x => {
      for (const checker of this.checkers) {
        await checker(x);
      }
    };
  }
}

export class numberChecker extends checkerBuilder<number | string, number> {
  constructor(n: number) {
    super(n);
  }
  public eq(msg?: string) {
    const checker = async (m: number | string) => {
      expect(this.n).equal(m, msg);
    };
    this.checkers.push(checker);
    return this;
  }
}
export class BNChecker extends checkerBuilder<BN | number | string, BN> {
  constructor(n: BN) {
    super(n);
  }
  public eq(msg?: string) {
    const checker = async (m: BN | number | string) => {
      expect(this.n).to.bignumber.eq(new BN(m), msg);
    };
    this.checkers.push(checker);
    return this;
  }
  public lt(msg?: string) {
    const checker = async (m: BN | number | string) => {
      expect(this.n).to.bignumber.lt(new BN(m), msg);
    };
    this.checkers.push(checker);
    return this;
  }
  public gt(msg?: string) {
    const checker = async (m: BN | number | string) => {
      expect(this.n).to.bignumber.gt(new BN(m), msg);
    };
    this.checkers.push(checker);
    return this;
  }

  public closeTo(delta: string, msg?: string) {
    const checker = async (m: BN | number | string) => {
      expect(this.n).to.bignumber.closeTo(new BN(m), delta, msg);
    };
    this.checkers.push(checker);
    return this;
  }
}

export class KeyChecker extends checkerBuilder<PublicKey | string, PublicKey> {
  constructor(n: PublicKey) {
    super(n);
  }
  public eq(msg?: string) {
    const checker = async (m: PublicKey | string) => {
      expect(this.n).eqAddress(new PublicKey(m), msg);
    };
    this.checkers.push(checker);
    return this;
  }
}

export class BigChecker extends checkerBuilder<Big | string, Big> {
  constructor(n: Big) {
    super(n);
  }
  public eq(msg?: string) {
    const checker = async (m: Big | string) => {
      expect(this.n.toString()).eq(m.toString(), msg);
    };
    this.checkers.push(checker);
    return this;
  }
}

export interface stateFilter {
  getBefore?: boolean;
  getAfter?: boolean;
}

export const checkBNEqual =
  (msg?: string) =>
  async ([left, right]: [BN, BN]) => {
    expect(left, msg).to.bignumber.eq(right);
  };

export function checkState<T>(
  stateAccessor: () => Promise<T>,
  stateChecker: (T) => (T) => Promise<void>,
  { getBefore = true, getAfter = true }: stateFilter = {
    getAfter: true,
    getBefore: true,
  },
): (f: () => Promise<void>) => () => Promise<void> {
  return f => async () => {
    const before = getBefore ? await stateAccessor() : undefined;
    await f();
    const after = getAfter ? await stateAccessor() : undefined;
    await stateChecker(before)(after);
  };
}

export function checkBefore<T>(
  stateAccessor: () => Promise<T>,
  beforeChecker: (T) => Promise<void>,
): (f: () => Promise<void>) => () => Promise<void> {
  //eslint-disable-next-line @typescript-eslint/no-unused-vars
  const checker = before => after => {
    return beforeChecker(before);
  };
  return checkState(stateAccessor, checker, { getAfter: false });
}

export function checkAfter<T>(
  stateAccessor: () => Promise<T>,
  afterChecker: (T) => Promise<void>,
): (f: () => Promise<void>) => () => Promise<void> {
  //eslint-disable-next-line @typescript-eslint/no-unused-vars
  const checker = before => after => {
    return afterChecker(after);
  };
  return checkState(stateAccessor, checker, { getBefore: false });
}

export function checkMintAmountDiff(
  provider: SaberProvider,
  mint: () => Promise<PublicKey>,
  diff: BN,
  msg = '',
): (f: () => Promise<void>) => () => Promise<void> {
  const getAmount = async () => {
    try {
      return (await getMintInfo(provider, await mint())).supply;
    } catch (_) {
      return new BN(0);
    }
  };
  const diffChecker = (before: BN) => async (after: BN) => {
    expect(
      diff,
      `${msg}, 
            Before 
            ${before.toString()}, 
            After ${after.toString()}, 
            expected diff ${diff.toString()}`,
    ).to.bignumber.eq(after.sub(before));
  };
  return checkState(getAmount, diffChecker);
}

export function checkTokenBalanceDiff(
  provider: SaberProvider,
  tokenAccount: () => Promise<PublicKey>,
  diff: BN,
  msg = '',
): (f: () => Promise<void>) => () => Promise<void> {
  const getAmount = async () => {
    try {
      return (await saberGetTokenAccount(provider, await tokenAccount()))
        .amount;
    } catch (_) {
      return new BN(0);
    }
  };
  const diffChecker = (before: BN) => async (after: BN) => {
    expect(
      diff,
      `${msg}, 
            Before 
            ${before.toString()}, 
            After ${after.toString()}, 
            expected diff ${diff.toString()}`,
    ).to.bignumber.eq(after.sub(before));
  };

  return checkState(getAmount, diffChecker);
}

export function checkBNDiff(
  stateAccessor: () => Promise<BN>,
  diff: BN,
  msg = '',
): (f: () => Promise<void>) => () => Promise<void> {
  const diffChecker = (before: BN) => async (after: BN) => {
    expect(diff).to.bignumber.eq(
      after.sub(before),
      `${msg} ,Before ${before.toString()}, 
        After ${after.toString()}, expected diff ${diff.toString()}`,
    );
  };
  return checkState(stateAccessor, diffChecker);
}

export function checkBigDiff(
  stateAccessor: () => Promise<Big>,
  diff: Big,
  msg = '',
): (f: () => Promise<void>) => () => Promise<void> {
  const diffChecker = (before: Big) => async (after: Big) => {
    expect(diff.toString()).equal(
      after.sub(before).toString(),
      `${msg} ,Before ${before.toString()}, 
  After ${after.toString()}, expected diff ${diff.toString()}`,
    );
  };
  return checkState(stateAccessor, diffChecker);
}

export function addCheckers(
  func: () => Promise<void>,
  ...checkers: ((f: () => Promise<void>) => () => Promise<void>)[]
): Promise<void> {
  return checkers.reduce((f, checker) => checker(f), func)();
}

export function divCeiln(dividend: BN, divisor: number): BN {
  return dividend.addn(divisor - 1).divn(divisor);
}

export function divCeil(dividend: BN, divisor: BN): BN {
  return dividend.add(divisor.subn(1)).div(divisor);
}

export const createAccount = async (
  provider: Provider,
  space: number,
  owner: PublicKey,
  account?: Keypair,
): Promise<Keypair> => {
  const newAccount = account ?? Keypair.generate();
  const createTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: newAccount.publicKey,
      programId: owner,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(
        space,
      ),
      space,
    }),
  );
  await provider.send(createTx, [newAccount]);
  return newAccount;
};

export async function createLendingMarket(
  provider: Provider,
  marketAccount?: Keypair,
): Promise<Keypair> {
  const lendingMarket = await createAccount(
    provider,
    LENDING_MARKET_LEN,
    PORT_LENDING,
    marketAccount,
  );
  await provider.send(
    (() => {
      const tx = new Transaction();
      tx.add(
        initLendingMarketInstruction(
          provider.wallet.publicKey,
          Buffer.from(
            'USD\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0',
            'ascii',
          ),
          lendingMarket.publicKey,
        ),
      );
      return tx;
    })(),
    [],
  );
  return lendingMarket;
}

export interface ReserveState {
  address: PublicKey;
  liquiditySupplyPubkey: PublicKey;
  collateralMintAccount: PublicKey;
  collateralSupplyTokenAccount: PublicKey;
  liquidityFeeReceiver: PublicKey;
  useCollateralAccount: PublicKey;
}

export async function createDefaultReserve(
  provider: Provider,
  initialLiquidity: number | BN,
  sourceTokenWallet: PublicKey,
  lendingMarket: PublicKey,
  config: ReserveConfigProto,
  oracle?: PublicKey,
): Promise<ReserveState> {
  const reserve = await createAccount(provider, RESERVE_LEN, PORT_LENDING);

  const collateralMintAccount = await createAccount(
    provider,
    TOKEN_MINT_LEN,
    TOKEN_PROGRAM_ID,
  );

  const liquiditySupplyTokenAccount = await createAccount(
    provider,
    TOKEN_ACCOUNT_LEN,
    TOKEN_PROGRAM_ID,
  );

  const collateralSupplyTokenAccount = await createAccount(
    provider,
    TOKEN_ACCOUNT_LEN,
    TOKEN_PROGRAM_ID,
  );

  const userCollateralTokenAccount = await createAccount(
    provider,
    TOKEN_ACCOUNT_LEN,
    TOKEN_PROGRAM_ID,
  );

  const liquidityFeeReceiver = await createAccount(
    provider,
    TOKEN_ACCOUNT_LEN,
    TOKEN_PROGRAM_ID,
  );

  const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
    [lendingMarket.toBuffer()],
    PORT_LENDING,
  );

  const tokenAccount = await getTokenAccount(provider, sourceTokenWallet);

  const tx = new Transaction();

  tx.add(
    initReserveInstruction(
      initialLiquidity,
      oracle ? 0 : 1,
      new BN('1000000000000000000'),
      config,
      sourceTokenWallet,
      userCollateralTokenAccount.publicKey,
      reserve.publicKey,
      tokenAccount.mint,
      liquiditySupplyTokenAccount.publicKey,
      liquidityFeeReceiver.publicKey,
      oracle ?? Keypair.generate().publicKey,
      collateralMintAccount.publicKey,
      collateralSupplyTokenAccount.publicKey,
      lendingMarket,
      lendingMarketAuthority,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
    ),
  );

  await provider.send(tx);

  return {
    address: reserve.publicKey,
    liquiditySupplyPubkey: liquiditySupplyTokenAccount.publicKey,
    collateralMintAccount: collateralMintAccount.publicKey,
    collateralSupplyTokenAccount: collateralSupplyTokenAccount.publicKey,
    liquidityFeeReceiver: liquidityFeeReceiver.publicKey,
    useCollateralAccount: userCollateralTokenAccount.publicKey,
  };
}
