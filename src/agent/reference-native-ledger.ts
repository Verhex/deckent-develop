import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { NativeBudgetState } from './guards/recursion.js';
import type { CostGuardState } from './guards/cost.js';
import type { ProviderUsage } from './provider-tooluse/types.js';
import type { ReferenceUsageLedger } from './reference-digest-runner-types.js';
import type { ResolvedNativeAgentBudget } from '../core/execution-budget-policy.js';
import { ReferenceDigestError } from './reference-digest-types.js';

interface NativeProjection {
  rounds: number; cumulativeTokens: number; lastInputTokens: number; startedAtMs: number;
  toolCalls: number; noProgressRounds: number; lastCheckpointRound: number; lastCheckpointToolCalls: number;
  costTokens: number; inputTokens: number; outputTokens: number; reports: number;
  seenCallDigests: string[]; noProgressCheckpointRequested: boolean; tokenPressureCheckpointRequested: boolean;
}
interface LedgerRecord { inputTokens: number; outputTokens: number; usage?: ProviderUsage }
/** The session's actual budget objects are projected durably after both ordinary
 * rounds and digest child requests. No parallel accounting total replaces them. */
export async function openReferenceNativeLedger(input: {
  root: string; scopeDigest: string; state: NativeBudgetState; budget: ResolvedNativeAgentBudget;
  usage: { inputTokens: number; outputTokens: number; reports: number }; cost?: CostGuardState;
}) {
  if (!constants.O_NOFOLLOW) throw new ReferenceDigestError('REFERENCE_STORE_FAILED');
  const root = await realpath(input.root), owned = await lstat(input.root);
  const path = join(root, 'reference-native-usage.json');
  let records: Record<string, LedgerRecord> = {};
  let sequence: Promise<unknown> = Promise.resolve();
  const project = (): NativeProjection => ({ rounds: input.state.rounds, cumulativeTokens: input.state.cumulativeTokens,
    lastInputTokens: input.state.lastInputTokens, toolCalls: input.state.toolCalls, noProgressRounds: input.state.noProgressRounds,
    lastCheckpointRound: input.state.lastCheckpointRound, lastCheckpointToolCalls: input.state.lastCheckpointToolCalls, startedAtMs: input.state.startedAtMs, costTokens: input.cost?.spentTokens ?? 0, ...input.usage,
    seenCallDigests: [...input.state.seenCallDigests], noProgressCheckpointRequested: input.state.noProgressCheckpointRequested,
    tokenPressureCheckpointRequested: input.state.tokenPressureCheckpointRequested });
  const fail = (): never => { throw new ReferenceDigestError('REFERENCE_STORE_FAILED'); };
  async function custody(): Promise<void> {
    const now = await lstat(input.root);
    if (!now.isDirectory() || now.isSymbolicLink() || now.dev !== owned.dev || now.ino !== owned.ino || await realpath(input.root) !== root) fail();
  }
  await custody();
  let file;
  try { file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (file) {
    try {
      const st = await file.stat(); if (!st.isFile() || st.size > 32 * 1024 * 1024) fail();
      const bytes = Buffer.alloc(st.size);
      let offset = 0;
      while (offset < bytes.length) { const read = await file.read(bytes, offset, bytes.length - offset, offset); if (!read.bytesRead) fail(); offset += read.bytesRead; }
      if ((await file.stat()).size !== st.size) fail();
      const envelope = JSON.parse(bytes.toString('utf8')) as { payload: string; sha256: string };
      if (createHash('sha256').update(envelope.payload).digest('hex') !== envelope.sha256) fail();
      const row = JSON.parse(envelope.payload) as { schemaVersion: number; scopeDigest: string; projection: NativeProjection; records: Record<string, LedgerRecord> };
      const numericKeys = ['rounds', 'cumulativeTokens', 'lastInputTokens', 'startedAtMs', 'toolCalls', 'noProgressRounds',
        'lastCheckpointRound', 'lastCheckpointToolCalls', 'costTokens', 'inputTokens', 'outputTokens', 'reports'] as const;
      if (row.schemaVersion !== 1 || row.scopeDigest !== input.scopeDigest || !row.projection
        || numericKeys.some(key => !Number.isSafeInteger(row.projection[key]) || row.projection[key] < 0)
        || !Array.isArray(row.projection.seenCallDigests) || row.projection.seenCallDigests.some(id => typeof id !== 'string')
        || typeof row.projection.noProgressCheckpointRequested !== 'boolean' || typeof row.projection.tokenPressureCheckpointRequested !== 'boolean'
        || !row.records || typeof row.records !== 'object' || Array.isArray(row.records)) fail();
      records = row.records;
      for (const [id, record] of Object.entries(records)) {
        if (!/^[a-f0-9]{64}$/.test(id) || ![record.inputTokens, record.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)
          || (record.usage && ![record.usage.inputTokens, record.usage.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0))) fail();
      }
      Object.assign(input.state, { rounds: row.projection.rounds, cumulativeTokens: row.projection.cumulativeTokens,
        lastInputTokens: row.projection.lastInputTokens, toolCalls: row.projection.toolCalls, noProgressRounds: row.projection.noProgressRounds,
        lastCheckpointRound: row.projection.lastCheckpointRound, lastCheckpointToolCalls: row.projection.lastCheckpointToolCalls, startedAtMs: row.projection.startedAtMs, seenCallDigests: new Set(row.projection.seenCallDigests),
        noProgressCheckpointRequested: row.projection.noProgressCheckpointRequested, tokenPressureCheckpointRequested: row.projection.tokenPressureCheckpointRequested });
      Object.assign(input.usage, { inputTokens: row.projection.inputTokens, outputTokens: row.projection.outputTokens, reports: row.projection.reports });
      if (input.cost) input.cost.spentTokens = row.projection.costTokens;
    } finally { await file.close(); }
  }
  async function persist(): Promise<void> {
    await custody();
    const payload = JSON.stringify({ schemaVersion: 1, scopeDigest: input.scopeDigest, projection: project(), records });
    if (Buffer.byteLength(payload) > 32 * 1024 * 1024) fail();
    const bytes = JSON.stringify({ payload, sha256: createHash('sha256').update(payload).digest('hex') });
    const temp = join(root, `.reference-native-usage-${randomUUID()}.tmp`);
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await custody(); await rename(temp, path);
  }
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = sequence.then(fn); sequence = next; return next;
  }
  const ledger: ReferenceUsageLedger = {
    reserve: (id, reserved) => serial(async () => {
      const prior = records[id];
      if (prior) {
        if (prior.inputTokens !== reserved.inputTokens || prior.outputTokens !== reserved.outputTokens) throw new ReferenceDigestError('REFERENCE_USAGE_UNCERTAIN');
        return true;
      }
      const outstanding = Object.values(records).reduce((n, r) => n + (r.usage ? 0 : r.inputTokens + r.outputTokens), 0);
      if (input.state.rounds + 2 > input.budget.maxModelRounds
        || Date.now() - input.state.startedAtMs >= input.budget.maxWallTimeMs
        || input.state.cumulativeTokens + outstanding + reserved.inputTokens + reserved.outputTokens + input.budget.largeReference.finalAnswerReserveTokens > input.budget.maxCumulativeTokens) return false;
      if (input.cost?.ceilingUsd !== undefined
        && (input.cost.spentTokens + outstanding + reserved.inputTokens + reserved.outputTokens) / 1_000_000 * input.cost.usdPerMillionTokens > input.cost.ceilingUsd) return false;
      records[id] = { inputTokens: reserved.inputTokens, outputTokens: reserved.outputTokens };
      input.state.rounds++; await persist(); return true;
    }),
    settle: (id, usage) => serial(async () => {
      const record = records[id]; if (!record) throw new ReferenceDigestError('REFERENCE_USAGE_UNCERTAIN');
      if (record.usage) {
        if (record.usage.inputTokens !== usage.inputTokens || record.usage.outputTokens !== usage.outputTokens) throw new ReferenceDigestError('REFERENCE_USAGE_UNCERTAIN');
        return;
      }
      record.usage = usage;
      input.state.cumulativeTokens += usage.inputTokens + usage.outputTokens;
      input.usage.inputTokens += usage.inputTokens; input.usage.outputTokens += usage.outputTokens; input.usage.reports++;
      if (input.cost) input.cost.spentTokens += usage.inputTokens + usage.outputTokens;
      await persist();
    }),
  };
  return { ledger, checkpoint: () => serial(persist), rebindState: (state: NativeBudgetState): void => { input.state = state; } };
}
