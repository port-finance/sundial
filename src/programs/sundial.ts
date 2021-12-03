import type { AnchorTypes } from "@saberhq/anchor-contrib";
import { SundialIDL } from "../idls/sundial";

export type SundialTypes = AnchorTypes<
  SundialIDL, {
    sundial: SundialData;
  }
>;

type Accounts = SundialTypes["Accounts"];
export type SundialData = Accounts["Sundial"]
export type SundialProgram = SundialTypes["Program"];
