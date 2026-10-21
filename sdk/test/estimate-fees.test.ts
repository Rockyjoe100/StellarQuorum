import { Account, Contract, rpc, SorobanDataBuilder, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { jest } from '@jest/globals';
import { QuorumClient, TESTNET } from '../src/client';
import type { QuorumClientConfig } from '../src/types';

// Issue #277: estimateFees re-simulates an already-built transaction. The tests
// build real transaction XDR and script only the simulation's minResourceFee.
const simulate = jest.spyOn(rpc.Server.prototype, 'simulateTransaction');

const CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';
const VOTER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

const client = new QuorumClient({
  ...TESTNET,
  governanceContractId: CONTRACT,
} as QuorumClientConfig);

/** A transaction as build* returns it: classic fee, optionally with a declared resource fee. */
function builtTransaction(fee: string, declaredResourceFee?: bigint): string {
  const builder = new TransactionBuilder(new Account(VOTER, '0'), {
    fee,
    networkPassphrase: TESTNET.networkPassphrase!,
  })
    .addOperation(new Contract(CONTRACT).call('get_proposal_count'))
    .setTimeout(30);
  if (declaredResourceFee !== undefined) {
    builder.setSorobanData(new SorobanDataBuilder().setResourceFee(declaredResourceFee).build());
  }
  return builder.build().toXDR();
}

function simulated(minResourceFee: string) {
  return { minResourceFee } as unknown as rpc.Api.SimulateTransactionResponse;
}

afterEach(() => simulate.mockReset());

describe('estimateFees (issue #277)', () => {
  it('adds the simulated resource fee to the classic fee of an unprepared transaction', async () => {
    simulate.mockResolvedValueOnce(simulated('250'));

    const fee = await client.estimateFees(builtTransaction('100'));

    expect(fee).toEqual({ inclusionFee: 100n, resourceFee: 250n, totalFee: 350n });
  });

  it('replaces a resource fee the transaction already declares instead of adding to it', async () => {
    // A build* output: fee = inclusion (100) + the resource fee captured at build time (300).
    simulate.mockResolvedValueOnce(simulated('250'));

    const fee = await client.estimateFees(builtTransaction('400', 300n));

    expect(fee).toEqual({ inclusionFee: 100n, resourceFee: 250n, totalFee: 350n });
  });

  it('simulates the same transaction it was given', async () => {
    simulate.mockResolvedValueOnce(simulated('250'));
    const xdr = builtTransaction('100');

    await client.estimateFees(xdr);

    const sent = simulate.mock.calls.at(-1)![0] as Transaction;
    expect(sent.toXDR()).toBe(xdr);
  });

  it('throws when the simulation reports an error', async () => {
    simulate.mockResolvedValueOnce({ error: 'HostError: Error(Contract, #2)' } as unknown as rpc.Api.SimulateTransactionResponse);

    await expect(client.estimateFees(builtTransaction('100'))).rejects.toThrow(/Fee estimate failed/);
  });
});
