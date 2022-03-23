import { BN, utils } from '@project-serum/anchor';
import {
  TokenInstructions,
  Market,
  DexInstructions,
} from '@project-serum/serum';
import { SolanaProvider, TransactionEnvelope } from '@saberhq/solana-contrib';
import { getOrCreateATA } from '@saberhq/token-utils';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';

export * from './constants';
export * from './sdk';
export * from './wrappers';
export * from './programs';

export const DEX_PID = new PublicKey(
  '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
);

/**
 * Setting up a Serum market.
 *
 * @param param0
 */
export const setupSerumMarket = async ({
  provider,
  baseMint,
  quoteMint,
  market = Keypair.generate(),
  baseLotSize = 10000,
  quoteLotSize = 100,
  feeRateBps = 0,
}: {
  provider: SolanaProvider;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  market?: Keypair;
  baseLotSize?: number;
  quoteLotSize?: number;
  feeRateBps?: number;
}) => {
  const requestQueue = new Keypair();
  const eventQueue = new Keypair();
  const bids = new Keypair();
  const asks = new Keypair();
  const baseVault = new Keypair();
  const quoteVault = new Keypair();
  const quoteDustThreshold = new BN(100);
  const wallet = provider.wallet;
  const connection = provider.connection;

  const [vaultOwner, vaultSignerNonce] = await getVaultOwnerAndNonce(
    market.publicKey,
    DEX_PID,
  );

  const tx1 = new TransactionEnvelope(provider, []);
  tx1.append(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: baseVault.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(165),
      space: 165,
      programId: TOKEN_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: quoteVault.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(165),
      space: 165,
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeAccount({
      account: baseVault.publicKey,
      mint: baseMint,
      owner: vaultOwner,
    }),
    TokenInstructions.initializeAccount({
      account: quoteVault.publicKey,
      mint: quoteMint,
      owner: vaultOwner,
    }),
  );

  const tx2 = new TransactionEnvelope(provider, []);
  tx2.append(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: market.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(
        Market.getLayout(DEX_PID).span,
      ),
      space: Market.getLayout(DEX_PID).span,
      programId: DEX_PID,
    }),
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: requestQueue.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(5120 + 12),
      space: 5120 + 12,
      programId: DEX_PID,
    }),
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: eventQueue.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(262144 + 12),
      space: 262144 + 12,
      programId: DEX_PID,
    }),
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: bids.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
      space: 65536 + 12,
      programId: DEX_PID,
    }),
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: asks.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
      space: 65536 + 12,
      programId: DEX_PID,
    }),
    DexInstructions.initializeMarket({
      market: market.publicKey,
      requestQueue: requestQueue.publicKey,
      eventQueue: eventQueue.publicKey,
      bids: bids.publicKey,
      asks: asks.publicKey,
      baseVault: baseVault.publicKey,
      quoteVault: quoteVault.publicKey,
      baseMint,
      quoteMint,
      baseLotSize: new BN(baseLotSize),
      quoteLotSize: new BN(quoteLotSize),
      feeRateBps,
      vaultSignerNonce,
      quoteDustThreshold,
      programId: DEX_PID,
    }),
  );

  tx1.addSigners(baseVault, quoteVault);
  tx2.addSigners(market, requestQueue, eventQueue, bids, asks);
  await tx1.confirm();
  await tx2.confirm();

  return market.publicKey;
};

export const findMarketAddress = async (
  principalMint: PublicKey,
  underlyingMint: PublicKey,
) => {
  return await PublicKey.findProgramAddress(
    [
      utils.bytes.utf8.encode('SerumMarket'),
      principalMint.toBuffer(),
      underlyingMint.toBuffer(),
    ],
    DEX_PID,
  );
};

/**
 * Place orders on Serum according to the given price ranges.
 *
 * @param param0
 */
export const placeOrders = async ({
  provider,
  asks,
  bids,
  market,
}: {
  provider: SolanaProvider;
  asks: number[][];
  bids: number[][];
  market: Market;
}) => {
  const { address: baseAccount, instruction: ix1 } = await getOrCreateATA({
    provider: provider,
    mint: market.baseMintAddress,
  });
  const { address: quoteAccount, instruction: ix2 } = await getOrCreateATA({
    provider: provider,
    mint: market.quoteMintAddress,
  });

  if (ix1 || ix2) {
    throw new Error('No base/quote tokens');
  }

  for (let i = 0; i < asks.length; i++) {
    const ask = asks[i];
    if (!ask || ask.length < 2) {
      throw new Error('ask format not correct');
    }
    const [askPrice, askSize] = ask;
    if (!askPrice || !askSize) {
      throw new Error('ask price or size not correct');
    }
    const { transaction, signers } = await market.makePlaceOrderTransaction(
      provider.connection,
      {
        owner: provider.wallet.publicKey,
        payer: baseAccount,
        side: 'sell',
        price: askPrice,
        size: askSize,
        orderType: 'postOnly',
        clientId: undefined,
        openOrdersAddressKey: undefined,
        openOrdersAccount: undefined,
        feeDiscountPubkey: null,
        selfTradeBehavior: 'abortTransaction',
      },
    );
    await provider.send(transaction, signers);
  }

  for (let i = 0; i < bids.length; i++) {
    const bid = bids[i];
    if (!bid || bid.length < 2) {
      throw new Error('ask format not correct');
    }
    const [bidPrice, bidSize] = bid;
    if (!bidPrice || !bidSize) {
      throw new Error('ask price or size not correct');
    }
    const { transaction, signers } = await market.makePlaceOrderTransaction(
      provider.connection,
      {
        owner: provider.wallet.publicKey,
        payer: quoteAccount,
        side: 'buy',
        price: bidPrice,
        size: bidSize,
        orderType: 'postOnly',
        clientId: undefined,
        openOrdersAddressKey: undefined,
        openOrdersAccount: undefined,
        feeDiscountPubkey: null,
        selfTradeBehavior: 'abortTransaction',
      },
    );
    await provider.send(transaction, signers);
  }
};

async function getVaultOwnerAndNonce(
  marketPublicKey: PublicKey,
  dexProgramId: PublicKey = DEX_PID,
) {
  const nonce = new BN(0);
  while (nonce.toNumber() < 255) {
    try {
      const vaultOwner = await PublicKey.createProgramAddress(
        [marketPublicKey.toBuffer(), nonce.toArrayLike(Buffer, 'le', 8)],
        dexProgramId,
      );
      return [vaultOwner, nonce];
    } catch (e) {
      nonce.iaddn(1);
    }
  }
  throw new Error('Unable to find nonce');
}
