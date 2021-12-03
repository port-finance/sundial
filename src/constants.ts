import { PublicKey } from "@solana/web3.js";
import { SundialProgram } from "./programs/sundial";
import { SundialJSON } from "./idls/sundial";

export interface Programs {
  Sundial: SundialProgram;
}

/**
 * Sundial program addresses.
 */
export const SUNDIAL_ADDRESSES = {
  Sundial: new PublicKey("SDLxV7m1qmoqkytqYRGY1x438AbYCqekPsPxK4kvwuk"),

};

export const SUNDIAL_IDLS = {
  Sundial: SundialJSON,
};