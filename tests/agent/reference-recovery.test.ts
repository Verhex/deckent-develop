import { it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { openReferenceNativeLedger } from '../../src/agent/reference-native-ledger.js';
import { createNativeBudgetState } from '../../src/agent/guards/recursion.js';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
const hash = (x: string) => createHash('sha256').update(x).digest('hex');
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function dir() { const root = await mkdtemp(join(tmpdir(), 'reference-recovery-')); roots.push(root); return root; }
it('pins source and nodes, recreates store custody and makes source digest readable through the existing reader', async () => {
  const root = await dir(), store = createSessionToolContentStore({ dir: root });
  const capture = store.beginCapture({ channel: 'stdout', previewBytes: 1 }); capture.append(Buffer.from('data😀')); const source = capture.finish();
  const node = store.write(Buffer.from('node'));
  const pin = { source: { detailRef: source.detailRef!, sha256: source.storedSha256! }, nodeRefs: [node.sha256] };
  await store.pinReferenceContent!(hash('program'), pin, Date.now() + 60_000);
  const restored = createSessionToolContentStore({ dir: root });
  expect(await restored.restoreReferenceContent!(hash('program'))).toEqual(pin);
  const read = await restored.readContentRef({ sha256: source.storedSha256!, offset: 0, limit: 65536 });
  expect(read.kind).toBe('loaded'); if (read.kind === 'loaded') expect(Buffer.from(read.bytes).toString()).toBe('data😀');
  expect((await restored.readContentRef({ sha256: node.sha256, offset: 0, limit: 65536 })).kind).toBe('loaded');
});
it('tampered and changed members fail without publishing partially restored refs', async () => {
  const root = await dir(), store = createSessionToolContentStore({ dir: root });
  const capture = store.beginCapture({ channel: 'stdout', previewBytes: 1 }); capture.append(Buffer.from('data')); const source = capture.finish(); const node = store.write(Buffer.from('node'));
  await store.pinReferenceContent!(hash('p'), { source: { detailRef: source.detailRef!, sha256: source.storedSha256! }, nodeRefs: [node.sha256] }, Date.now() + 60_000);
  await writeFile(node.path, 'evil');
  const restored = createSessionToolContentStore({ dir: root }); await expect(restored.restoreReferenceContent!(hash('p'))).rejects.toThrow();
  expect((await restored.readContentRef({ sha256: source.storedSha256!, offset: 0, limit: 5 })).kind).toBe('hold');
  const pinFile = join(dirname(node.path), (await readdir(dirname(node.path))).find(x => x.startsWith('reference-pin-'))!); await writeFile(pinFile, '{}');
  await expect(createSessionToolContentStore({ dir: root }).restoreReferenceContent!(hash('p'))).rejects.toThrow();
});
it('native ledger restores the SAME counters and cost, settles IDs once across reopen, and keeps ordinary usage', async () => {
  const root = await dir(), budget = resolveNativeAgentBudget({ policy: { native_agent: { largeReference: { enabled: true } } } });
  const state = createNativeBudgetState(), usage = { inputTokens: 0, outputTokens: 0, reports: 0 }, cost = { spentTokens: 0, usdPerMillionTokens: 1 };
  const first = await openReferenceNativeLedger({ root, scopeDigest: hash('scope'), state, budget, usage, cost });
  const id = hash('request'), reported = { type: 'usage' as const, inputTokens: 100, outputTokens: 20 };
  expect(await first.ledger.reserve(id, { inputTokens: 100, outputTokens: 50, rounds: 1 })).toBe(true);
  await first.ledger.settle(id, reported); await first.ledger.settle(id, reported);
  state.seenCallDigests.add('seen-tool'); state.noProgressCheckpointRequested = true; state.tokenPressureCheckpointRequested = true;
  state.rounds++; state.cumulativeTokens += 30; usage.outputTokens += 30; cost.spentTokens += 30; await first.checkpoint();
  const nextState = createNativeBudgetState(), nextUsage = { inputTokens: 0, outputTokens: 0, reports: 0 }, nextCost = { spentTokens: 0, usdPerMillionTokens: 1 };
  const next = await openReferenceNativeLedger({ root, scopeDigest: hash('scope'), state: nextState, budget, usage: nextUsage, cost: nextCost });
  expect(nextState.seenCallDigests.has('seen-tool')).toBe(true); expect(nextState.noProgressCheckpointRequested).toBe(true); expect(nextState.tokenPressureCheckpointRequested).toBe(true);
  expect(nextState.rounds).toBe(2); expect(nextState.cumulativeTokens).toBe(150); expect(nextCost.spentTokens).toBe(150);
  await next.ledger.settle(id, reported); expect(nextState.cumulativeTokens).toBe(150);
  await expect(next.ledger.settle(id, { ...reported, inputTokens: 101 })).rejects.toMatchObject({ code: 'REFERENCE_USAGE_UNCERTAIN' });
});
it('owner budget renewal rebinds the working counters while cumulative usage remains', async () => {
  const root = await dir(), budget = resolveNativeAgentBudget({}); const usage = { inputTokens: 10, outputTokens: 20, reports: 1 };
  const state = createNativeBudgetState(); state.rounds = 10;
  const ledger = await openReferenceNativeLedger({ root, scopeDigest: hash('scope'), state, budget, usage });
  const renewed = createNativeBudgetState(); ledger.rebindState(renewed); await ledger.checkpoint();
  const text = await readFile(join(root, 'reference-native-usage.json'), 'utf8'); const payload = JSON.parse(JSON.parse(text).payload);
  expect(payload.projection.rounds).toBe(0); expect(payload.projection.inputTokens).toBe(10);
});

it('rejects expired pins and accounts restored captures against the live byte allowance', async () => {
  const root = await dir(), store = createSessionToolContentStore({ dir: root });
  const capture = store.beginCapture({ channel: 'stdout', previewBytes: 1 }); capture.append(Buffer.from('data')); const source = capture.finish();
  const expiry = Date.now() + 60000;
  await store.pinReferenceContent!(hash('expiry'), { source: { detailRef: source.detailRef!, sha256: source.storedSha256! }, nodeRefs: [] }, expiry);
  const bounded = createSessionToolContentStore({ dir: root, maxSessionBytes: 4 });
  await bounded.restoreReferenceContent!(hash('expiry'));
  const next = bounded.beginCapture({ channel: 'stdout', previewBytes: 1 }); next.append(Buffer.from('more'));
  expect(next.finish().storedBytes).toBe(0);
  vi.spyOn(Date, 'now').mockReturnValue(expiry + 1);
  await expect(createSessionToolContentStore({ dir: root }).restoreReferenceContent!(hash('expiry'))).rejects.toThrow();
});
