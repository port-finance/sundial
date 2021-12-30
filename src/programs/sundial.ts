import type { AnchorTypes } from "@saberhq/anchor-contrib";
import { SundialIDL } from "../idls/sundial";

export type SundialTypes = AnchorTypes<
  SundialIDL, {
    sundial: SundialData;
    sundialCollateral: SundialCollateralData;
    sundialProfile: SundialProfileData;
  }
>;

type Accounts = SundialTypes["Accounts"];
export type SundialData = Accounts["Sundial"];
export type SundialCollateralData = Accounts["SundialCollateral"];
export type SundialProfileData = Accounts["SundialProfile"];
export type SundialProgram = SundialTypes["Program"];
