import { BN } from '@project-serum/anchor';

export * from './sundialWrapper';
export * from './sundialAccountWrapper';
export * from './sundialCollateralWrapper';
export * from './sundialProfileWrapper';

export const Buffer2BN = (BNArray: BN[]) => {
  const buffer = Buffer.alloc(BNArray.length * 8);
  BNArray.forEach((num, i) => {
    num.toBuffer('be', 8).copy(buffer, (BNArray.length - i - 1) * 8);
  });
  return new BN(buffer, undefined, 'be');
};

export const WAD = new BN('1000000000000000000');
