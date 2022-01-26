import { ReserveConfigProto } from '@port.finance/port-sdk';
import { BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { SundialCollateralConfigParams } from '../src';
import { MAX_U64 } from '@saberhq/token-utils';

export const TOKEN_ACCOUNT_LEN = 165;
export const TOKEN_MINT_LEN = 82;
export const RESERVE_LEN = 575;
export const LENDING_MARKET_LEN = 258;
export const STAKING_POOL_LEN = 298;
export const PORT_LENDING = new PublicKey(
  'Port7uDYB3wk6GJAw4KT1WpTeMtSu9bTcChBHkX2LfR',
);
export const DEFAULT_RESERVE_CONFIG: ReserveConfigProto = {
  optimalUtilizationRate: 80,
  loanToValueRatio: 80,
  liquidationBonus: 5,
  liquidationThreshold: 85,
  minBorrowRate: 0,
  optimalBorrowRate: 40,
  maxBorrowRate: 90,
  fees: {
    borrowFeeWad: new BN(10000000000000),
    flashLoanFeeWad: new BN(30000000000000),
    hostFeePercentage: 0,
  },
  stakingPoolOption: 0,
  stakingPool: TOKEN_PROGRAM_ID, // dummy
};
export const DEFAULT_SUNDIAL_COLLATERAL_CONFIG: SundialCollateralConfigParams =
  {
    ltv: 95,
    liquidationThreshold: 90,
    liquidationPenalty: 5,
    liquidityCap: new BN(MAX_U64.toString()),
  };

export const MOCK_ORACLES = new PublicKey(
  'FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH',
);
