import type { AnchorTypes } from "@saberhq/anchor-contrib";
import { SundialIDL } from "../idls/sundial";

export type SundialTypes = AnchorTypes<
  SundialIDL, {
    sundialLending: SundialLendingData;
  }
>;

type Accounts = SundialTypes["Accounts"];
export type SundialLendingData = Accounts["SundialLending"];
export type SundialBorrowingData = Accounts["SundialBorrowing"];
export type SundialProfileData = Accounts["SundialProfile"];
export type SundialProgram = SundialTypes["Program"];
