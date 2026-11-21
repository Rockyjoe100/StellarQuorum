import { jest } from '@jest/globals';
import { QuorumClient, TESTNET } from '../src/client';
import type { QuorumClientConfig } from '../src/types';

const CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';
const PROPOSER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const COSPONSOR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe('Co-sponsored and conviction proposal helpers (#451)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('buildCreateCosponsoredProposal calls create_cosponsored_proposal with cosponsors vector', async () => {
    const client = new QuorumClient({ ...TESTNET, governanceContractId: CONTRACT } as QuorumClientConfig);
    const buildSpy = jest
      .spyOn(client as unknown as { buildGovernanceTransaction: (...args: unknown[]) => Promise<string> }, 'buildGovernanceTransaction')
      .mockResolvedValue('AAAA-COSPONSORED-XDR');

    const xdr = await client.buildCreateCosponsoredProposal(
      PROPOSER,
      [COSPONSOR],
      'Joint Grant',
      'Co-sponsored proposal',
      'ipfs://spec',
    );

    expect(xdr).toBe('AAAA-COSPONSORED-XDR');
    expect(buildSpy).toHaveBeenCalledWith(
      PROPOSER,
      'create_cosponsored_proposal',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('buildCreateConvictionProposal calls create_conviction_proposal', async () => {
    const client = new QuorumClient({ ...TESTNET, governanceContractId: CONTRACT } as QuorumClientConfig);
    const buildSpy = jest
      .spyOn(client as unknown as { buildGovernanceTransaction: (...args: unknown[]) => Promise<string> }, 'buildGovernanceTransaction')
      .mockResolvedValue('AAAA-CONVICTION-XDR');

    const xdr = await client.buildCreateConvictionProposal(
      PROPOSER,
      'Conviction Grant',
      'Continuous voting',
    );

    expect(xdr).toBe('AAAA-CONVICTION-XDR');
    expect(buildSpy).toHaveBeenCalledWith(
      PROPOSER,
      'create_conviction_proposal',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('getCosponsors returns cosponsor addresses from get_cosponsors simulation', async () => {
    const client = new QuorumClient({ ...TESTNET, governanceContractId: CONTRACT } as QuorumClientConfig);
    jest
      .spyOn(client as unknown as { simulate: (...args: unknown[]) => Promise<unknown> }, 'simulate')
      .mockResolvedValue([COSPONSOR]);

    const cosponsors = await client.getCosponsors(7n);
    expect(cosponsors).toEqual([COSPONSOR]);
  });

  it('getConviction decodes ConvictionTally and returns null for non-conviction proposals', async () => {
    const client = new QuorumClient({ ...TESTNET, governanceContractId: CONTRACT } as QuorumClientConfig);
    const simSpy = jest
      .spyOn(client as unknown as { simulate: (...args: unknown[]) => Promise<unknown> }, 'simulate')
      .mockResolvedValueOnce({
        for_conviction: 500n,
        against_conviction: 120n,
        updated_ledger: 4200,
      })
      .mockResolvedValueOnce(null);

    expect(await client.getConviction(7n)).toEqual({
      forConviction: 500n,
      againstConviction: 120n,
      updatedLedger: 4200,
    });
    expect(await client.getConviction(8n)).toBeNull();
    expect(simSpy).toHaveBeenCalledTimes(2);
  });
});
