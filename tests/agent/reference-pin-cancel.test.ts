// 7113-C-PIN-CANCEL-FIX — the reference pin under cancellation.
//
// Two separate facts, proven separately:
//   (1) the STORE never publishes an aborted attempt (the canonical rename is
//       skipped and the attempt's own temporary file is removed), and
//   (2) the ORCHESTRATOR's wait is bounded by the composed turn/deadline
//       signal, so a filesystem call that never returns can no longer hold the
//       user's turn open.
// A Node fs syscall is not physically cancelled and nothing here claims it is.
import { it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createSessionToolContentStore, type SessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { prepareReferenceDigests } from '../../src/agent/reference-session.js';
import { ReferenceDigestError } from '../../src/agent/reference-digest-types.js';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import { createNativeBudgetState } from '../../src/agent/guards/recursion.js';
import type { ProviderAdapter } from '../../src/agent/provider-tooluse/types.js';

const hash = (x: string): string => createHash('sha256').update(x).digest('hex');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function dir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'reference-pin-cancel-'));
  roots.push(root);
  return root;
}

async function seeded(root: string) {
  const store = createSessionToolContentStore({ dir: root });
  const capture = store.beginCapture({ channel: 'stdout', previewBytes: 1 });
  capture.append(Buffer.from('source bytes 😀'));
  const source = capture.finish();
  const node = store.write(Buffer.from('node payload'));
  const pin = { source: { detailRef: source.detailRef!, sha256: source.storedSha256! }, nodeRefs: [node.sha256] };
  return { store, pin, source, node };
}
const pinFiles = async (root: string): Promise<string[]> =>
  (await readdir(root)).filter((name) => name.includes('reference-pin-'));

it('an aborted pin publishes nothing and leaves no temporary behind', async () => {
  const root = await dir();
  const { store, pin } = await seeded(root);
  const controller = new AbortController();
  controller.abort();
  await expect(store.pinReferenceContent!(hash('program'), pin, Date.now() + 60_000, controller.signal)).rejects.toThrow();
  expect(await pinFiles(root)).toEqual([]);
  expect(await store.restoreReferenceContent!(hash('program'))).toBeNull();
});

it('an attempt aborted mid-flight still publishes nothing, and a later clean attempt does', async () => {
  const root = await dir();
  const { store, pin } = await seeded(root);
  const controller = new AbortController();
  // Abort while the readbacks are in flight: the attempt may finish its writes
  // afterwards, but its rename must never happen.
  const attempt = store.pinReferenceContent!(hash('program'), pin, Date.now() + 60_000, controller.signal);
  controller.abort();
  await expect(attempt).rejects.toThrow();
  // Give a late completion every chance to appear on disk.
  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(await pinFiles(root)).toEqual([]);
  expect(await store.restoreReferenceContent!(hash('program'))).toBeNull();
  // The same store still pins normally afterwards: the abort closed one
  // attempt, not the capability.
  await store.pinReferenceContent!(hash('program'), pin, Date.now() + 60_000);
  expect(await store.restoreReferenceContent!(hash('program'))).toEqual(pin);
  const reopened = createSessionToolContentStore({ dir: root });
  expect(await reopened.restoreReferenceContent!(hash('program'))).toEqual(pin);
});

it('a pin that never returns no longer holds the turn: the orchestrator wait is bounded', async () => {
  const root = await dir();
  const { store } = await seeded(root);
  let pinCalls = 0;
  const hanging: SessionToolContentStore = {
    ...store,
    pinReferenceContent: async () => { pinCalls++; return new Promise<never>(() => { /* never returns */ }); },
    restoreReferenceContent: async () => null,
  };
  const adapter: ProviderAdapter = {
    name: 'unused',
    reasoningControl: () => ({ toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'configured' }),
    structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
    async *send() { throw new Error('the digest program must never reach a provider call here'); },
  };
  const budget = resolveNativeAgentBudget({ policy: { native_agent: { largeReference: { enabled: true, maxWallTimeMs: 250 } } } });
  const controller = new AbortController();
  const started = Date.now();
  const failure = await prepareReferenceDigests({
    turn: { rawIntent: 'analyse @big.md', expandedPayload: 'analyse @big.md', references: [], referenceRequests: ['big.md'] },
    scope: { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') },
    capability: {
      snapshot: async () => ({
        metadata: {
          schemaVersion: 1 as const, scope: { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') },
          sourceAuthority: 'reference-data' as const, sourceDigest: hash('big'), bytes: 64 * 1024,
          encoding: 'utf-8' as const, createdAt: new Date(0).toISOString(), snapshotRef: 'fixture',
        },
        async *stream() { yield Buffer.from('x'.repeat(64 * 1024)); },
      }),
      inline: (raw) => ({ prompt: raw, references: [] }),
    },
    authorizeRead: () => true,
    adapter,
    context: { provider: 'fixture', model: 'fixture', contextWindowTokens: 32_768, contextProvenance: 'configured-narrowing' },
    budget, state: createNativeBudgetState(), store: hanging, scratch: { root, sessionRoot: root, tenantId: 't', projectId: 'p', sessionId: 's', recoveryWindowMs: 60_000 },
    ledger: { reserve: async () => true, settle: async () => undefined },
    signal: controller.signal,
    fits: async () => false,
    onMeasurement: () => {},
    onProgress: () => {},
  }).catch((error: unknown) => error);
  const elapsed = Date.now() - started;
  expect(pinCalls).toBe(1);
  expect(failure).toBeInstanceOf(ReferenceDigestError);
  expect((failure as ReferenceDigestError).code).toBe('REFERENCE_DEADLINE');
  // Bounded by the reference wall budget, not by the hung filesystem call.
  expect(elapsed).toBeLessThan(5_000);
});

it('the turn abort also releases a hung pin wait', async () => {
  const root = await dir();
  const { store } = await seeded(root);
  const hanging: SessionToolContentStore = {
    ...store,
    pinReferenceContent: async () => new Promise<never>(() => { /* never returns */ }),
    restoreReferenceContent: async () => null,
  };
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 80);
  const budget = resolveNativeAgentBudget({ policy: { native_agent: { largeReference: { enabled: true, maxWallTimeMs: 600_000 } } } });
  const started = Date.now();
  const failure = await prepareReferenceDigests({
    turn: { rawIntent: 'analyse @big.md', expandedPayload: 'analyse @big.md', references: [], referenceRequests: ['big.md'] },
    scope: { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') },
    capability: {
      snapshot: async () => ({
        metadata: {
          schemaVersion: 1 as const, scope: { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') },
          sourceAuthority: 'reference-data' as const, sourceDigest: hash('big'), bytes: 64 * 1024,
          encoding: 'utf-8' as const, createdAt: new Date(0).toISOString(), snapshotRef: 'fixture',
        },
        async *stream() { yield Buffer.from('x'.repeat(64 * 1024)); },
      }),
      inline: (raw) => ({ prompt: raw, references: [] }),
    },
    authorizeRead: () => true,
    adapter: {
      name: 'unused',
      reasoningControl: () => ({ toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'configured' }),
    structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
      async *send() { throw new Error('unreachable'); },
    },
    context: { provider: 'fixture', model: 'fixture', contextWindowTokens: 32_768, contextProvenance: 'configured-narrowing' },
    budget, state: createNativeBudgetState(), store: hanging,
    scratch: { root, sessionRoot: root, tenantId: 't', projectId: 'p', sessionId: 's', recoveryWindowMs: 60_000 },
    ledger: { reserve: async () => true, settle: async () => undefined },
    signal: controller.signal,
    fits: async () => false,
    onMeasurement: () => {},
    onProgress: () => {},
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ReferenceDigestError);
  expect((failure as ReferenceDigestError).code).toBe('REFERENCE_CANCELLED');
  expect(Date.now() - started).toBeLessThan(5_000);
});

it('source root, tenant and digest custody survive the fix: a foreign root still refuses', async () => {
  const root = await dir();
  const { store, pin } = await seeded(root);
  await store.pinReferenceContent!(hash('program'), pin, Date.now() + 60_000);
  const foreign = createSessionToolContentStore({ dir: await dir() });
  expect(await foreign.restoreReferenceContent!(hash('program'))).toBeNull();
  // The digest is part of the identity: another program id does not resolve.
  expect(await store.restoreReferenceContent!(hash('other-program'))).toBeNull();
});
