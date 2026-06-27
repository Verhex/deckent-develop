// KPI Faz-2 — hermetic tests for the sprint-end KPI summary dispatch wiring
// (task 334-006). Network-zero; all DB I/O is under os.tmpdir().
//
// Proves:
//   1. buildSprintKpiSummaryFn over a real seeded <root>/.brain/memory.db returns a
//      formatted summary (non-empty, names a KPI) and ALWAYS closes the KpiService.
//   2. empty/unknown/missing sprint → null (honest no-op, never throws).
//   3. buildConnectorAdapterWithKpiSummary is a byte-for-byte no-op (null) when no
//      connectors are configured, and forwards kpiSummaryFn (broadcast on
//      sprint-finalized) when one is.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSprintKpiSummaryFn,
  buildConnectorAdapterWithKpiSummary,
} from '../../src/connectors/kpi-summary-dispatch.js';
import { KpiService } from '../../src/core/kpi/kpi-service.js';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { DeckentConfig } from '../../src/core/types.js';
import type { ConnectorId, IMessageConnector, OutgoingMessage } from '../../src/connectors/types.js';
import type { Notification } from '../../src/core/notification-dispatcher.js';

// ─── Hermetic fixtures ─────────────────────────────────────────────────────────

const tmpdirs: string[] = [];

/** A tmpdir root; when `seed` is given, a `.brain/memory.db` with finalized-sprint KPI results. */
function makeRoot(seed: { sprintId: string } | null): string {
  const root = mkdtempSync(join(tmpdir(), 'kpi-dispatch-'));
  tmpdirs.push(root);
  if (seed) {
    mkdirSync(join(root, '.brain'), { recursive: true });
    const store = new KpiStore(join(root, '.brain', 'memory.db'));
    store.upsertResults([
      { tenantId: 'default', kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: seed.sprintId, value: 1.25, target: 3.0, status: 'healthy' },
      { tenantId: 'default', kpiId: 'token_per_task', grain: 'sprint', periodKey: seed.sprintId, value: 4200, target: null, status: 'healthy' },
      { tenantId: 'default', kpiId: 'no_go_rate', grain: 'sprint', periodKey: seed.sprintId, value: 0.1, target: null, status: 'warning' },
      { tenantId: 'default', kpiId: 'completion_rate', grain: 'sprint', periodKey: seed.sprintId, value: 0.92, target: null, status: 'healthy' },
    ]);
    store.close();
  }
  return root;
}

function fakeConnector(id: ConnectorId): IMessageConnector & { sent: OutgoingMessage[] } {
  const sent: OutgoingMessage[] = [];
  return {
    id,
    name: id,
    sent,
    start: async () => {},
    stop: async () => {},
    sendMessage: async (msg: OutgoingMessage) => { sent.push(msg); },
    onMessage: () => {},
    isHealthy: () => true,
  };
}

function finalizedNotif(sprintId: string): Notification {
  return {
    priority: 'info',
    event: 'sprint-finalized',
    title: 'Sprint finalized',
    summary: 'all tasks complete',
    sprintId,
    timestamp: '2026-06-27T00:00:00.000Z',
  };
}

const tgConfig: DeckentConfig['notify_connectors'] = {
  telegram: { enabled: true, token: 'fake-token', chat_id: 'C1' },
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpdirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── buildSprintKpiSummaryFn ───────────────────────────────────────────────────

describe('buildSprintKpiSummaryFn', () => {
  it('formats a seeded finalized sprint (en): non-empty, names a KPI, closes the store', async () => {
    const root = makeRoot({ sprintId: 'sprint-334' });
    const closeSpy = vi.spyOn(KpiService.prototype, 'close');

    const summary = await buildSprintKpiSummaryFn(root, 'en')('sprint-334');

    expect(summary).not.toBeNull();
    expect(summary!.length).toBeGreaterThan(0);
    expect(summary).toContain('Cost / Sprint'); // names a headline KPI (en title)
    expect(closeSpy).toHaveBeenCalledTimes(1); // no leaked SQLite handle
  });

  it('reuses buildKpiSprintSummary i18n — renders Turkish titles when lang=tr', async () => {
    const root = makeRoot({ sprintId: 'sprint-334' });

    const summary = await buildSprintKpiSummaryFn(root, 'tr')('sprint-334');

    expect(summary).toContain('Sprint Başına Maliyet'); // tr title of cost_per_sprint
  });

  it('returns null for an unknown sprint (no data) without throwing, still closing the store', async () => {
    const root = makeRoot({ sprintId: 'sprint-334' });
    const closeSpy = vi.spyOn(KpiService.prototype, 'close');

    const summary = await buildSprintKpiSummaryFn(root, 'en')('sprint-does-not-exist');

    expect(summary).toBeNull();
    expect(closeSpy).toHaveBeenCalledTimes(1); // opened then closed even on the empty path
  });

  it('returns null (no throw) when the .brain/memory.db is missing', async () => {
    const root = makeRoot(null); // no .brain dir → DB cannot be opened

    const summary = await buildSprintKpiSummaryFn(root, 'en')('sprint-334');

    expect(summary).toBeNull();
  });
});

// ─── buildConnectorAdapterWithKpiSummary ───────────────────────────────────────

describe('buildConnectorAdapterWithKpiSummary', () => {
  it('returns null when no connectors are configured (byte-for-byte default no-op)', async () => {
    const root = makeRoot({ sprintId: 'sprint-334' });
    const opts = { kpiSummaryFn: buildSprintKpiSummaryFn(root, 'en') };

    expect(await buildConnectorAdapterWithKpiSummary(undefined, opts)).toBeNull();
    expect(await buildConnectorAdapterWithKpiSummary({}, opts)).toBeNull();
  });

  it('forwards kpiSummaryFn: broadcasts the KPI summary to the connector on sprint-finalized', async () => {
    const root = makeRoot({ sprintId: 'sprint-334' });
    const tg = fakeConnector('telegram');

    const adapter = await buildConnectorAdapterWithKpiSummary(
      tgConfig,
      { kpiSummaryFn: buildSprintKpiSummaryFn(root, 'en') },
      { makeConnector: () => tg },
    );

    expect(adapter).not.toBeNull();
    await adapter!.send(finalizedNotif('sprint-334'));

    const kpiMsg = tg.sent.find((m) => m.text.includes('Cost / Sprint'));
    expect(kpiMsg).toBeDefined();
    expect(kpiMsg!.channelId).toBe('C1');
  });

  it('does not broadcast a summary when the sprint has no KPI data (kpiSummaryFn → null)', async () => {
    const root = makeRoot({ sprintId: 'sprint-334' });
    const tg = fakeConnector('telegram');

    const adapter = await buildConnectorAdapterWithKpiSummary(
      tgConfig,
      { kpiSummaryFn: buildSprintKpiSummaryFn(root, 'en') },
      { makeConnector: () => tg },
    );

    await adapter!.send(finalizedNotif('sprint-empty')); // unknown sprint → null summary

    expect(tg.sent.some((m) => m.text.includes('📊'))).toBe(false);
  });
});
