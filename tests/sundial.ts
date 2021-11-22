import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {Sundial, IDL} from '../target/types/sundial';

describe('sundial', () => {

  anchor.setProvider(anchor.Provider.local());
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.local();

  const sundial = new Program<Sundial>(
    IDL, anchor.workspace.Sundial.programId, provider);

  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await sundial.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});
