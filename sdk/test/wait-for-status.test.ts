import { rpc, nativeToScVal } from '@stellar/stellar-sdk';
import { jest } from '@jest/globals';
import { ProposalNotFoundError, ProposalStatusTimeoutError, QuorumClient, TESTNET } from '../src/client';
import type { QuorumClientConfig, ProposalStatus } from '../src/types';
import { enumVariant, structVal } from './xdr';

// Issue #274: waitForProposalStatus polls getProposal() through the same
// simulateTransaction path as every other read, so the tests script the
// sequence of statuses the "chain" reports.
const simulate = jest.spyOn(rpc.Server.prototype, 'simulateTransaction');

const CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

const client = new QuorumClient({
  ...TESTNET,
  governanceContractId: CONTRACT,
  pollIntervalMs: 1,
} as QuorumClientConfig);

/** A get_proposal response whose only meaningful field is the status. */
function proposalAt(status: ProposalStatus) {
  const retval = structVal({
    id: nativeToScVal(7n, { type: 'u64' }),
    status: enumVariant(status),
  });
  return { result: { retval } } as unknown as rpc.Api.SimulateTransactionResponse;
}

afterEach(() => simulate.mockReset());

describe('waitForProposalStatus (issue #274)', () => {
  it('resolves as soon as the target status is observed', async () => {
    simulate
      .mockResolvedValueOnce(proposalAt('Passed'))
      .mockResolvedValueOnce(proposalAt('Passed'))
      .mockResolvedValueOnce(proposalAt('Queued'));

    const proposal = await client.waitForProposalStatus(7n, 'Queued');

    expect(proposal.status).toBe('Queued');
    expect(simulate).toHaveBeenCalledTimes(3);
  });

  it('returns after a single poll when the proposal already has the target status', async () => {
    simulate.mockResolvedValueOnce(proposalAt('Executed'));

    await expect(client.waitForProposalStatus(7n, 'Executed')).resolves.toMatchObject({ status: 'Executed' });
    expect(simulate).toHaveBeenCalledTimes(1);
  });

  it('rejects with a typed timeout error when the status is never reached', async () => {
    simulate.mockImplementation(async () => proposalAt('Active'));

    const attempt = client.waitForProposalStatus(7n, 'Queued', { pollIntervalMs: 5, timeoutMs: 30 });

    await expect(attempt).rejects.toBeInstanceOf(ProposalStatusTimeoutError);
    await expect(attempt).rejects.toMatchObject({
      name: 'ProposalStatusTimeoutError',
      proposalId: 7n,
      targetStatus: 'Queued',
      lastStatus: 'Active',
    });
  });

  it('bypasses the read cache on every poll so a cached status cannot hide a change', async () => {
    const cached = new QuorumClient({
      ...TESTNET,
      governanceContractId: CONTRACT,
      cache: { enabled: true, ttlMs: 60_000 },
    } as QuorumClientConfig);
    simulate
      .mockResolvedValueOnce(proposalAt('Active'))
      .mockResolvedValueOnce(proposalAt('Queued'));

    await cached.getProposal(7n);
    await cached.waitForProposalStatus(7n, 'Queued', { pollIntervalMs: 1 });

    // The first read populated the cache; the wait must still have asked the RPC again.
    expect(simulate).toHaveBeenCalledTimes(2);
  });

  it('rejects with ProposalNotFoundError when the proposal does not exist', async () => {
    simulate.mockResolvedValueOnce({ error: 'HostError: Error(Contract, #3)' } as unknown as rpc.Api.SimulateTransactionResponse);

    await expect(client.waitForProposalStatus(99n, 'Queued')).rejects.toBeInstanceOf(ProposalNotFoundError);
  });
});
