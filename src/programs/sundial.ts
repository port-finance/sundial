import type { AnchorTypes } from '@saberhq/anchor-contrib';
import { SundialIDL } from '../idls/sundial';

export type SundialTypes = AnchorTypes<
  SundialIDL,
  {
    sundial: SundialData;
    sundialCollateral: SundialCollateralData;
    sundialProfile: SundialProfileData;
  },
  {
    AssetInfo: Defined['AssetInfo'];
    SundialProfileCollateral: Defined['SundialProfileCollateral'];
    SundialProfileLoan: Defined['SundialProfileLoan'];
    Fee: Defined['Fee'];
    SundialCollateralConfig: Defined['SundialCollateralConfig'];
    LTV: Defined['LTV'];
    SundialProfileCollateralConfig: Defined['SundialProfileCollateralConfig'];
    LiquidationConfig: Defined['LiquidationConfig'];
  }
>;

type Accounts = SundialTypes['Accounts'];
type Defined = SundialTypes['Defined'];

export type SundialData = Accounts['Sundial'];
export type SundialCollateralData = Accounts['SundialCollateral'];
export type SundialProfileData = Accounts['SundialProfile'];

export type SundialProgram = SundialTypes['Program'];

export type SundialAccountData =
  | { type: 'sundial'; data?: SundialData }
  | { type: 'sundialCollateral'; data?: SundialCollateralData }
  | { type: 'sundialProfile'; data?: SundialProfileData };
