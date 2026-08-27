import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn, spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyAcceptanceConfirmationReceipt,
  createAcceptanceConfirmationTerminalEvent,
  prepareAcceptanceConfirmationReceipt,
  type AcceptanceConfirmationReceipt,
} from '../../src/core/acceptance-confirmation-contract.js';
import { AcceptanceReconciliationStore } from '../../src/core/acceptance-reconciliation-store.js';

const roots: string[] = [];
const appliedAt = '2026-08-21T12:00:00.000Z';
const hostClassWallClockMultiplier = process.env.CI ? 3 : 1;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sandbox(): string {
  const value = mkdtempSync(join(tmpdir(), 'acceptance-race-scale-'));
  roots.push(value);
  return value;
}

function confirmation(
  tenantId: string,
  ordinal = 0,
  decision: 'accepted' | 'rejected' = 'accepted',
): AcceptanceConfirmationReceipt {
  const lineage = {
    tenantId, projectId: 'shared-project', sprintId: 'sprint-618', taskId: `task-${ordinal}`,
    attemptId: `shared-attempt-${ordinal}`, generation: 7,
    evaluationDigest: digest(`evaluation:${ordinal}`),
    resultDigest: digest(`result:${ordinal}`),
    policyDigest: digest('policy:shared'),
    sourceDigest: digest(`source:${ordinal}`),
  };
  const terminal = createAcceptanceConfirmationTerminalEvent({
    lineage, decision: decision === 'accepted' ? 'ACCEPTED' : 'REJECTED',
    terminalAt: '2026-08-21T11:59:58.000Z',
  });
  if (!terminal.ok) throw new Error(terminal.error.message);
  const prepared = prepareAcceptanceConfirmationReceipt({
    terminalEvent: terminal.value, preparedAt: '2026-08-21T11:59:59.000Z', expectedLineage: lineage,
  });
  if (!prepared.ok) throw new Error(prepared.error.message);
  return prepared.value;
}

function appliedConfirmation(receipt: AcceptanceConfirmationReceipt): AcceptanceConfirmationReceipt {
  const applied = applyAcceptanceConfirmationReceipt({ preparedReceipt: receipt, appliedAt });
  if (!applied.ok) throw new Error(applied.error.message);
  return applied.value;
}

function projectionDigest(
  store: AcceptanceReconciliationStore,
  tenantIds: readonly string[],
): { readonly digest: string; readonly appliedCount: number } {
  const hash = createHash('sha256');
  let appliedCount = 0;
  for (const tenantId of tenantIds) {
    let afterSequence = 0;
    while (true) {
      const page = store.readTenantPage({
        tenantId,
        projectId: 'shared-project',
        afterSequence,
        limit: 1_000,
      });
      for (const result of page.receipts) {
        if (result.state !== 'FOUND') throw new Error('durable projection is corrupt');
        hash.update(JSON.stringify(result.receipt));
        if (result.receipt.state === 'APPLIED') appliedCount += 1;
      }
      if (page.nextSequence === null) break;
      afterSequence = page.nextSequence;
    }
  }
  return { digest: hash.digest('hex'), appliedCount };
}

function appendAfterProcessRestart(
  root: string,
  input: Parameters<AcceptanceReconciliationStore['append']>[0],
): unknown {
  const helper = join(root, 'restart-reconciliation.ts');
  const resultPath = join(root, 'restart-result.json');
  writeFileSync(helper, `
    import { writeFileSync } from 'node:fs';
    import { AcceptanceReconciliationStore } from '${join(process.cwd(), 'src/core/acceptance-reconciliation-store.ts')}';
    const input = JSON.parse(process.env.ACCEPTANCE_INPUT ?? 'null');
    const result = new AcceptanceReconciliationStore(process.env.ACCEPTANCE_ROOT ?? '').append(input);
    writeFileSync(process.env.ACCEPTANCE_RESULT ?? '', JSON.stringify(result));
  `);
  const child = spawnSync(join(process.cwd(), 'node_modules', '.bin', 'vite-node'), [helper], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ACCEPTANCE_INPUT: JSON.stringify(input),
      ACCEPTANCE_ROOT: root,
      ACCEPTANCE_RESULT: resultPath,
    },
    timeout: 30_000 * hostClassWallClockMultiplier,
  });
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(readFileSync(resultPath, 'utf8')) as unknown;
}

interface AppendChild {
  readonly ready: Promise<void>;
  readonly result: Promise<ReturnType<AcceptanceReconciliationStore['append']>>;
  release(): void;
}

function racingAppendChild(
  root: string,
  input: Parameters<AcceptanceReconciliationStore['append']>[0],
  delayMs: number,
): AppendChild {
  const helper = join(root, 'race-reconciliation.ts');
  writeFileSync(helper, `
    import { AcceptanceReconciliationStore } from '${join(process.cwd(), 'src/core/acceptance-reconciliation-store.ts')}';
    const input = JSON.parse(process.env.ACCEPTANCE_INPUT ?? 'null');
    process.send?.({ type: 'ready' });
    process.once('message', () => setTimeout(() => {
      try {
        const result = new AcceptanceReconciliationStore(process.env.ACCEPTANCE_ROOT ?? '').append(input);
        process.send?.({ type: 'result', result }, () => process.disconnect?.());
      } catch (error) {
        process.send?.({ type: 'error', error: error instanceof Error ? error.message : String(error) }, () => process.disconnect?.());
      }
    }, Number(process.env.ACCEPTANCE_DELAY_MS ?? '0')));
  `);
  const child = spawn(join(process.cwd(), 'node_modules', '.bin', 'vite-node'), [helper], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ACCEPTANCE_INPUT: JSON.stringify(input),
      ACCEPTANCE_ROOT: root,
      ACCEPTANCE_DELAY_MS: String(delayMs),
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('acceptance race child barrier timed out')),
      // Readiness gate, not a performance claim: a vite-node child cold-start on a
      // saturated CI runner legitimately exceeds the old 10s base (933b6492c red at
      // ~31.6s). Align the barrier with the completion budget below — the gate must
      // never be tighter than the run it guards.
      30_000 * hostClassWallClockMultiplier,
    );
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('message', () => { clearTimeout(timer); resolve(); });
  });
  const result = new Promise<ReturnType<AcceptanceReconciliationStore['append']>>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('acceptance race child completion timed out'));
    }, 30_000 * hostClassWallClockMultiplier);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.on('message', (message: unknown) => {
      if (typeof message !== 'object' || message === null || !('type' in message)) return;
      if (message.type === 'result' && 'result' in message) {
        clearTimeout(timer);
        resolve(message.result as ReturnType<AcceptanceReconciliationStore['append']>);
      } else if (message.type === 'error' && 'error' in message) {
        clearTimeout(timer);
        reject(new Error(`acceptance race child error: ${String(message.error)}`));
      }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`acceptance race child failed code=${String(code)} signal=${String(signal)}: ${stderr}`));
      }
    });
  });
  return { ready, result, release: () => child.send({ type: 'release' }) };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('acceptance confirmation multi-tenant race, restart, and scale proof', () => {
  it.each([
    ['human-first', digest('human'), digest('timeout')],
    ['timeout-first', digest('timeout'), digest('human')],
  ] as const)('preserves first-writer-wins across a %s race and restart', async (_label, winner, loser) => {
    const root = sandbox();
    const receipts = ['tenant-race-a', 'tenant-race-b'].map(tenantId => confirmation(tenantId));

    // Both tenants deliberately reuse every caller-controlled identifier. Each
    // tenant must nevertheless get an independent FWW race and restart proof.
    expect(receipts[0]?.terminalEvent.lineage.attemptId)
      .toBe(receipts[1]?.terminalEvent.lineage.attemptId);
    for (const receipt of receipts) {
      const winnerChild = racingAppendChild(
        root,
        { confirmationReceipt: receipt, debtProjectionDigest: winner },
        0,
      );
      const loserChild = racingAppendChild(
        root,
        { confirmationReceipt: receipt, debtProjectionDigest: loser },
        100,
      );
      await Promise.all([winnerChild.ready, loserChild.ready]);
      winnerChild.release();
      loserChild.release();
      const [first, second] = await Promise.all([winnerChild.result, loserChild.result]);

      expect(first).toMatchObject({ state: 'PREPARED', receipt: { debtProjectionDigest: winner } });
      expect(second).toMatchObject({ state: 'HOLD', reasonCode: 'CONFLICTING_DIGEST' });
      if (first.state !== 'PREPARED') throw new Error('first writer did not prepare');
      const appliedInput = {
        confirmationReceipt: appliedConfirmation(receipt), debtProjectionDigest: winner,
      };
      const applied = new AcceptanceReconciliationStore(root).append(appliedInput);
      expect(applied).toMatchObject({ state: 'APPLIED', receipt: { debtProjectionDigest: winner } });
      if (applied.state !== 'APPLIED') throw new Error('winning receipt did not apply');
      const durableStore = new AcceptanceReconciliationStore(root, { adoptLegacy: false });
      const durableReceipt = durableStore.read(applied.receipt.reconciliationKey, 'APPLIED');
      durableStore.close();

      expect(appendAfterProcessRestart(root, appliedInput))
        .toMatchObject({ state: 'REPLAYED', receipt: { receiptDigest: applied.receipt.receiptDigest } });
      expect(appendAfterProcessRestart(root, { confirmationReceipt: receipt, debtProjectionDigest: loser }))
        .toMatchObject({ state: 'HOLD', reasonCode: 'CONFLICTING_DIGEST' });
      const afterRestart = new AcceptanceReconciliationStore(root, { adoptLegacy: false });
      expect(afterRestart.read(applied.receipt.reconciliationKey, 'APPLIED')).toEqual(durableReceipt);
      afterRestart.close();
    }
    const projection = new AcceptanceReconciliationStore(root, { adoptLegacy: false });
    expect(projection.readTenantPage({ tenantId: 'tenant-race-a', limit: 10 }).receipts).toHaveLength(2);
    expect(projection.readTenantPage({ tenantId: 'tenant-race-b', limit: 10 }).receipts).toHaveLength(2);
    projection.close();
  }, 30_000 * hostClassWallClockMultiplier);

  it('isolates tenants that reuse every caller-controlled confirmation identifier', () => {
    const root = sandbox();
    const store = new AcceptanceReconciliationStore(root);
    const tenantA = confirmation('tenant-a');
    const tenantB = confirmation('tenant-b');
    const aDigest = digest('tenant-a-debt'); const bDigest = digest('tenant-b-debt');
    expect(store.append({ confirmationReceipt: tenantA, debtProjectionDigest: aDigest }).state).toBe('PREPARED');
    expect(store.append({ confirmationReceipt: tenantB, debtProjectionDigest: bDigest }).state).toBe('PREPARED');
    const a = store.append({ confirmationReceipt: appliedConfirmation(tenantA), debtProjectionDigest: aDigest });
    const b = store.append({ confirmationReceipt: appliedConfirmation(tenantB), debtProjectionDigest: bDigest });

    expect(a.state).toBe('APPLIED');
    expect(b.state).toBe('APPLIED');
    if (a.state !== 'APPLIED' || b.state !== 'APPLIED') throw new Error('tenant receipt not applied');
    expect(a.receipt.reconciliationKey).not.toBe(b.receipt.reconciliationKey);
    expect(a.receipt.confirmationReceipt.terminalEvent.lineage.tenantId).toBe('tenant-a');
    expect(b.receipt.confirmationReceipt.terminalEvent.lineage.tenantId).toBe('tenant-b');
    expect(store.readTenantPage({ tenantId: 'tenant-a', limit: 10 }).receipts).toHaveLength(2);
    expect(store.readTenantPage({ tenantId: 'tenant-b', limit: 10 }).receipts).toHaveLength(2);
  });

  it('fails closed on a corrupt durable receipt and never converts it into replay authority', () => {
    const root = sandbox();
    const store = new AcceptanceReconciliationStore(root);
    const prepared = confirmation('tenant-corrupt');
    const input = { confirmationReceipt: appliedConfirmation(prepared), debtProjectionDigest: digest('debt') };
    expect(store.append({ ...input, confirmationReceipt: prepared }).state).toBe('PREPARED');
    const applied = store.append(input);
    if (applied.state !== 'APPLIED') throw new Error('fixture receipt not applied');
    store.close();
    const db = new Database(join(root, '.deckent', 'runtime', 'acceptance-reconciliation.db'));
    db.exec('DROP TRIGGER acceptance_reconciliation_no_update');
    db.prepare("UPDATE acceptance_reconciliation_receipts SET receipt_digest=? WHERE reconciliation_key=? AND receipt_state='APPLIED'")
      .run(digest('corrupt-receipt'), applied.receipt.reconciliationKey);
    db.close();

    expect(new AcceptanceReconciliationStore(root).append(input))
      .toMatchObject({ state: 'HOLD', reasonCode: 'CORRUPT_RECEIPT' });
  });

  it('measures 10k canonical rows within the host-class budget and a digest-stable replay', { timeout: 30_000 * hostClassWallClockMultiplier }, async () => {
    const root = sandbox();
    const partitionCount = 10;
    const partitionSize = 1_000;
    const partitionInputs = (partition: number) =>
      Array.from({ length: partitionSize }, (_, offset) => {
        const ordinal = partition * partitionSize + offset;
        return {
          confirmationReceipt: confirmation(`tenant-${partition}`, ordinal),
          debtProjectionDigest: digest(`debt:${partition}:${offset}`),
        };
      });
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    const store = new AcceptanceReconciliationStore(root);
    for (let partitionIndex = 0; partitionIndex < partitionCount; partitionIndex += 1) {
      const partition = partitionInputs(partitionIndex);
      expect(partition).toHaveLength(1_000);
      const results = store.appendBatch(partition.flatMap(input => [
        input,
        { ...input, confirmationReceipt: appliedConfirmation(input.confirmationReceipt) },
      ]));
      expect(results).toHaveLength(2_000);
      expect(results.every((result, index) => result.state === (index % 2 === 0 ? 'PREPARED' : 'APPLIED')))
        .toBe(true);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    const elapsedMs = performance.now() - startedAt;
    const heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
    const tenantIds = Array.from({ length: partitionCount }, (_, index) => `tenant-${index}`);
    const firstProjection = projectionDigest(store, tenantIds);

    const secondStartedAt = performance.now();
    const restarted = new AcceptanceReconciliationStore(root);
    for (let partitionIndex = 0; partitionIndex < partitionCount; partitionIndex += 1) {
      const partition = partitionInputs(partitionIndex);
      const replay = restarted.appendBatch(partition.map(input => ({
        ...input,
        confirmationReceipt: appliedConfirmation(input.confirmationReceipt),
      })));
      expect(replay.every(result => result.state === 'REPLAYED')).toBe(true);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    const secondElapsedMs = performance.now() - secondStartedAt;
    const secondProjection = projectionDigest(restarted, tenantIds);
    // Shared CI runners have a deliberately wider wall-clock envelope than an
    // operator workstation, while row-count, replay and heap assertions remain
    // identical. The multiplier is fixed here (not caller-controlled), so the
    // performance contract cannot be silently disabled by an environment value.
    const performanceBudgetMs = 10_000 * hostClassWallClockMultiplier;
    console.info(`[acceptance-reconciliation-scale] rows=10000 partitions=10 firstMs=${elapsedMs.toFixed(1)} secondMs=${secondElapsedMs.toFixed(1)} budgetMs=${performanceBudgetMs} heapGrowthBytes=${heapGrowthBytes}`);

    expect(firstProjection.appliedCount).toBe(10_000);
    expect(secondProjection.appliedCount).toBe(10_000);
    expect(elapsedMs).toBeLessThan(performanceBudgetMs);
    expect(secondElapsedMs).toBeLessThan(performanceBudgetMs);
    expect(heapGrowthBytes).toBeLessThan(256 * 1024 * 1024);
    expect(secondProjection.digest).toBe(firstProjection.digest);
  });
});
