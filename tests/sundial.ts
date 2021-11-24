import { Provider, setProvider, workspace, BN } from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {Sundial, IDL} from '../target/types/sundial';
import {Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY, Transaction} from '@solana/web3.js';
import { MintLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';

describe('sundial', () => {

  setProvider(Provider.local());
  const provider = Provider.local();

  const sundial = new Program<Sundial>(
    IDL, workspace.Sundial.programId, provider);

  it ('Initialize Lending Market', async () => {
    // TODO
  })

  it ('Initialize Reserve', async () => {
    // TODO
  })

  // TODO: prepare the lending market and reserve
  it('Sundial is initialized!', async () => {

    const sundialAcc = Keypair.generate()
    const principleTokenMint = Keypair.generate();
    const yieldTokenMint = Keypair.generate();
    const liquidityTokenSupply = Keypair.generate();
    const collateralTokenSupply = Keypair.generate();
    const redeemFeeReceiver = Keypair.generate();
    const owner = Keypair.generate();
    const reservePubkey = Keypair.generate();
    const [sundialAuthority, nounce] = await PublicKey.findProgramAddress(
      [],
      sundial.programId
    );
    const portLiquidityMint = await createAccount(
      provider,
      MintLayout.span,
      TOKEN_PROGRAM_ID
    );
    const portCollateralMint = await createAccount(
      provider,
      MintLayout.span,
      TOKEN_PROGRAM_ID,
    );

    await sundial.rpc.initialize(
      nounce,
      new BN(1637318787),
      {
        accounts: {
          sundial: sundialAcc.publicKey,
          sundialAuthority: sundialAuthority,
          portLiquiditySupply: liquidityTokenSupply.publicKey,
          portCollateralSupply: collateralTokenSupply.publicKey,
          principleTokenMint: principleTokenMint.publicKey,
          yieldTokenMint: yieldTokenMint.publicKey,
          portLiquidityMint: portLiquidityMint.publicKey,
          portCollateralMint: portCollateralMint.publicKey,
          redeemFeeReceiver: redeemFeeReceiver.publicKey,
          reservePubkey: reservePubkey.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
          user: provider.wallet.publicKey,
          owner: owner.publicKey,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
        instructions: [
          Token.createInitMintInstruction(
            TOKEN_PROGRAM_ID,
            portLiquidityMint.publicKey,
            6,
            provider.wallet.publicKey,
            provider.wallet.publicKey,
          ),
          Token.createInitMintInstruction(
            TOKEN_PROGRAM_ID,
            portCollateralMint.publicKey,
            6,
            provider.wallet.publicKey,
            provider.wallet.publicKey,
          ),
        ],
        signers: [
          sundialAcc, 
          principleTokenMint, 
          yieldTokenMint, 
          liquidityTokenSupply, 
          collateralTokenSupply, 
          redeemFeeReceiver
        ]
      }
    );
  });
});

const createAccount = async (provider: Provider, space: number, owner: PublicKey): Promise<Keypair> => {
  const newAccount = Keypair.generate();
  const createTx = new Transaction().add(
      SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: newAccount.publicKey,
          programId: owner,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
              space
          ),
          space,
      })
  );
  await provider.send(
    createTx,
    [newAccount]
  );
  return newAccount
}
