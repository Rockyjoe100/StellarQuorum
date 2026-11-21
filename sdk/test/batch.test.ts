import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { nativeToScVal, scValToNative, SorobanDataBuilder, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { QuorumClient } from '../src/client';
import { RpcTimeoutError } from '../src/errors';
import { structVal, enumVariant } from './xdr';

const CONTRACT = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';
const SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const NETWORK = 'Test SDF Network ; September 2015';
interface Request { jsonrpc: string; id: number; method: string; params: { transaction: string } }
type Mode = 'supported' | 'rejected' | 'http-rejected' | 'missing-id' | 'duplicate-id' | 'invalid-json' | 'missing-result' | 'contract-error' | 'rpc-error' | 'timeout' | 'body-timeout' | 'transient';
let server: Server;
let rpcUrl: string;
let requests: (Request | Request[])[];
let mode: Mode;

function proposal(id: bigint): xdr.ScVal {
  return structVal({
    id: nativeToScVal(id, { type: 'u64' }), proposer: nativeToScVal(SOURCE),
    title: nativeToScVal(`Proposal ${id}`, { type: 'string' }), description: nativeToScVal('Details', { type: 'string' }),
    for_votes: nativeToScVal(1n), against_votes: nativeToScVal(0n), abstain_votes: nativeToScVal(0n),
    snapshot_ledger: nativeToScVal(1, { type: 'u32' }), start_ledger: nativeToScVal(2, { type: 'u32' }),
    end_ledger: nativeToScVal(3, { type: 'u32' }), queue_ledger: nativeToScVal(0, { type: 'u32' }),
    quorum_required: nativeToScVal(1n), status: enumVariant('Active'),
  });
}

function result(request: Request) {
  const tx = TransactionBuilder.fromXDR(request.params.transaction, NETWORK) as Transaction;
  const func = (tx.operations[0] as { func: xdr.HostFunction }).func;
  if (func.type !== 'hostFunctionTypeInvokeContract') throw new Error('Expected a contract read');
  const invocation = func.invokeContract;
  const isCount = invocation.functionName.toString() === 'get_proposal_count';
  const id = isCount ? 0n : scValToNative(invocation.args[0]) as bigint;
  return {
    jsonrpc: '2.0', id: request.id,
    result: {
      latestLedger: 1000, events: [], minResourceFee: '100',
      transactionData: new SorobanDataBuilder().build().toXDR('base64'),
      results: [{ auth: [], xdr: (isCount ? nativeToScVal(5n, { type: 'u64' }) : proposal(id)).toXDR('base64') }],
    },
  };
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const request = JSON.parse(Buffer.concat(chunks).toString()) as Request | Request[];
    requests.push(request);
    res.setHeader('Content-Type', 'application/json');
    if (!Array.isArray(request)) { res.end(JSON.stringify(result(request))); return; }
    if (mode === 'timeout') return;
    if (mode === 'body-timeout') { res.writeHead(200); res.write('['); return; }
    if (mode === 'http-rejected') { res.writeHead(400).end(); return; }
    if (mode === 'transient' && requests.filter(Array.isArray).length === 1) { res.writeHead(503).end(); return; }
    if (mode === 'invalid-json') { res.end('<html>unsupported</html>'); return; }
    if (mode === 'rejected') { res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch unsupported' } })); return; }
    const responses = request.map(result).reverse();
    if (mode === 'missing-id') responses.pop();
    if (mode === 'duplicate-id') responses[0].id = responses[1].id;
    if (mode === 'contract-error') responses[0].result = { error: 'HostError: Error(Contract, #3)' } as unknown as typeof responses[0]['result'];
    if (mode === 'rpc-error') Object.assign(responses[0], { result: undefined, error: { code: -32000, message: 'provider failure' } });
    if (mode === 'missing-result') responses[0].result.results = [];
    res.end(JSON.stringify(responses));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  rpcUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => { requests = []; mode = 'supported'; });
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

function client(batchSimulation = true, extra = {}) {
  return new QuorumClient({ rpcUrl, networkPassphrase: NETWORK, governanceContractId: CONTRACT, batchSimulation, readRetryAttempts: 0, ...extra });
}

test('a page uses one count plus one batch, preserving order despite reversed response ids', async () => {
  const sdk = client();
  const proposals = await sdk.getProposals({ offset: 1, limit: 3 });
  expect(proposals.map(p => p.id)).toEqual([2n, 3n, 4n]);
  expect(requests).toHaveLength(3);
  expect(Array.isArray(requests[2]) && requests[2].length).toBe(3);
});

test('getAllProposals and chunked pages retain the same values as individual reads', async () => {
  const expected = await client(false).getAllProposals();
  expect(requests).toHaveLength(7);
  requests = [];
  expect(await client(true, { simulationBatchSize: 2 }).getAllProposals()).toEqual(expected);
  expect(requests).toHaveLength(5); // get_proposals probe + count + 2 batches + singleton
});

test.each(['rejected', 'http-rejected', 'missing-id', 'duplicate-id', 'invalid-json'] as Mode[])(
  'falls back on %s and does not probe again', async unsupported => {
    mode = unsupported;
    const sdk = client();
    expect(await sdk.getProposals({ limit: 3 })).toHaveLength(3);
    expect(requests).toHaveLength(6); // get_proposals probe, count, rejected batch, 3 reads
    expect(await sdk.getProposals({ limit: 3 })).toHaveLength(3);
    expect(requests).toHaveLength(10); // no second probe
    expect(requests.filter(Array.isArray)).toHaveLength(1);
  },
);

test('ProposalNotFound remains null and is filtered out of the list', async () => {
  mode = 'contract-error';
  expect((await client().getProposals({ limit: 3 })).map(p => p.id)).toEqual([1n, 2n]);
  expect(requests).toHaveLength(3);
});

test.each(['rpc-error', 'missing-result'] as Mode[])('surfaces %s instead of silently dropping a proposal', async failure => {
  mode = failure;
  await expect(client().getProposals({ limit: 3 })).rejects.toBeDefined();
  expect(requests).toHaveLength(3);
});

test('retries transient HTTP errors without falling back', async () => {
  mode = 'transient';
  expect(await client(true, { readRetryAttempts: 1, retryBaseDelayMs: 0, retryJitterMs: 0 }).getProposals({ limit: 3 })).toHaveLength(3);
  expect(requests).toHaveLength(4);
});

test.each(['timeout', 'body-timeout'] as Mode[])('times out and aborts a stalled batch (%s)', async stalled => {
  mode = stalled;
  await expect(client(true, { requestTimeoutMs: 200 }).getProposals({ limit: 3 })).rejects.toBeInstanceOf(RpcTimeoutError);
  expect(requests).toHaveLength(3); // get_proposals probe + count + batch, without fallback
});

test('empty/singleton pages skip batching and invalid windows do not send requests', async () => {
  const sdk = client();
  expect(await sdk.getProposals({ limit: 0 })).toEqual([]);
  await expect(sdk.getAllProposals({ offset: -1 })).rejects.toThrow('Invalid offset');
  expect(requests).toHaveLength(0);
  expect(await sdk.getProposals({ offset: 5 })).toEqual([]);
  expect(await sdk.getProposals({ limit: 1 })).toHaveLength(1);
  expect(requests.filter(Array.isArray)).toHaveLength(0);
});

test('batch reads populate the same cache used by single reads and support bypass', async () => {
  const sdk = client(true, { cache: { enabled: true } });
  await sdk.getProposals({ limit: 3 });
  expect((await sdk.getProposal(2n))?.id).toBe(2n);
  await sdk.getProposals({ limit: 3 });
  expect(requests).toHaveLength(3);
  await sdk.getProposals({ limit: 3, bypassCache: true });
  expect(requests).toHaveLength(5);
});

test('rejects invalid batch sizes', () => {
  for (const simulationBatchSize of [0, -1, 1.5, 101, NaN]) {
    expect(() => client(true, { simulationBatchSize })).toThrow('simulationBatchSize');
  }
});
