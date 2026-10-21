import { jest } from '@jest/globals';
import { QuorumClient, TESTNET } from '../src/client';
import type { Proposal, QuorumClientConfig } from '../src/types';

// getAllProposals issues its reads concurrently. Counting requests under a
// deterministic RPC delay catches quadratic request amplification without
// depending on machine load or requiring serial wall-clock time.
const CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';
const VOTER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const RTT_MS = 5;

describe('getAllProposals() scaling (issue #317)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([10, 50, 100, 200])('fetches %i proposals with exactly N reads in one parallel round trip', async size => {
    const client = new QuorumClient({ ...TESTNET, governanceContractId: CONTRACT } as QuorumClientConfig);
    const count = jest.spyOn(client, 'getProposalCount').mockResolvedValue(BigInt(size));
    const read = jest.spyOn(client, 'getProposal').mockImplementation(async id => {
      await new Promise(resolve => setTimeout(resolve, RTT_MS));
      return {
        id, proposer: VOTER, title: `Proposal ${id}`, description: 'Test',
        forVotes: 100n, againstVotes: 0n, abstainVotes: 0n,
        snapshotLedger: 1000, startLedger: 1001, endLedger: 2000,
        queueLedger: 0, quorumRequired: 50n, status: 'Active',
      } satisfies Proposal;
    });
    const started = performance.now();
    let completed = false;
    const pending = client.getAllProposals().then(proposals => {
      completed = true;
      return proposals;
    });
    await jest.advanceTimersByTimeAsync(RTT_MS);
    expect(completed).toBe(true);
    const proposals = await pending;
    expect(count).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(size);
    const ids = Array.from({ length: size }, (_, i) => BigInt(i + 1));
    expect(read.mock.calls.map(([id]) => id)).toEqual(ids);
    expect(proposals.map(proposal => proposal.id)).toEqual(ids);
    expect(performance.now() - started).toBe(RTT_MS);
  });
});
