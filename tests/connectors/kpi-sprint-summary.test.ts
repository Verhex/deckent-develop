// Hermetic unit tests for buildKpiSprintSummary (KPI Faz-2, task 332-014).
//
// All tests are network-zero and DB-zero: KpiView stubs are built inline.
// makeConnectorNotificationAdapter non-blocking hook test is also included.

import { describe, it, expect, vi } from 'vitest';
import { buildKpiSprintSummary } from '../../src/connectors/kpi-sprint-summary.js';
import { makeConnectorNotificationAdapter } from '../../src/connectors/connector-notify-adapter.js';
import type { KpiView } from '../../src/core/kpi/kpi-service.js';
import type { KpiDefinitionSpec } from '../../src/core/kpi/kpi-definitions.js';
import type { ResultRow } from '../../src/core/kpi/kpi-store.js';
import type { ConnectorId, IMessageConnector, OutgoingMessage } from '../../src/connectors/types.js';
import type { Notification } from '../../src/core/notification-dispatcher.js';

// ─── Stubs ───────────────────────────────────────────────────────────────────

function makeDef(
  id: string,
  titleEn: string,
  titleTr: string,
  format: KpiDefinitionSpec['format'] = 'number',
  direction: KpiDefinitionSpec['direction'] = 'down',
): KpiDefinitionSpec {
  return {
    id,
    title: { en: titleEn, tr: titleTr },
    formula: 'x',
    unit: 'n',
    format,
    direction,
    grain: 'sprint',
    tier: 'universal',
    scope: 'global',
    enabled: true,
  };
}

function makeResult(
  kpiId: string,
  value: number,
  status: ResultRow['status'] = 'healthy',
): ResultRow {
  return {
    tenantId: 'default',
    kpiId,
    grain: 'sprint',
    periodKey: 'sprint-332',
    value,
    target: null,
    status,
    computedAt: '2026-06-27T00:00:00.000Z',
  };
}

function makeView(
  id: string,
  titleEn: string,
  titleTr: string,
  format: KpiDefinitionSpec['format'],
  direction: KpiDefinitionSpec['direction'],
  value: number,
  status: ResultRow['status'] = 'healthy',
): KpiView {
  return {
    definition: makeDef(id, titleEn, titleTr, format, direction),
    result: makeResult(id, value, status),
  };
}

function seededViews(): KpiView[] {
  return [
    makeView('cost_per_sprint', 'Cost / Sprint', 'Sprint Başına Maliyet', 'currency', 'down', 1.23, 'healthy'),
    makeView('token_per_task', 'Tokens / Task', 'Görev Başına Token', 'number', 'down', 50000, 'warning'),
    makeView('no_go_rate', 'No-Go Rate', 'NO-GO Oranı', 'percent', 'down', 0.0, 'healthy'),
    makeView('completion_rate', 'Completion Rate', 'Tamamlanma Oranı', 'percent', 'up', 1.0, 'healthy'),
  ];
}

function fakeConnector(
  id: ConnectorId,
  behavior: { throw?: boolean } = {},
): IMessageConnector & { sent: OutgoingMessage[] } {
  const sent: OutgoingMessage[] = [];
  return {
    id, name: id, sent,
    start: async () => {},
    stop: async () => {},
    sendMessage: async (msg: OutgoingMessage) => {
      if (behavior.throw) throw new Error('connector-boom');
      sent.push(msg);
    },
    onMessage: () => {},
    isHealthy: () => true,
  };
}

function sprintFinalizedNotif(sprintId = 'sprint-332'): Notification {
  return {
    priority: 'info',
    event: 'sprint-finalized',
    title: 'Sprint done',
    summary: '16/16 tasks complete',
    sprintId,
    timestamp: '2026-06-27T00:00:00.000Z',
  };
}

// ─── buildKpiSprintSummary ────────────────────────────────────────────────────

describe('buildKpiSprintSummary', () => {
  it('en: contains sprint id and all four headline KPI numeric values', () => {
    const msg = buildKpiSprintSummary(seededViews(), 'en', 'sprint-332');
    expect(msg).toContain('sprint-332');
    expect(msg).toContain('$1.23');          // cost_per_sprint, currency format
    expect(msg).toContain('50,000');         // token_per_task, number format
    expect(msg).toContain('0.0%');           // no_go_rate, percent format
    expect(msg).toContain('100.0%');         // completion_rate, percent format
  });

  it('en: uses English KPI labels from definition.title.en', () => {
    const msg = buildKpiSprintSummary(seededViews(), 'en', 'sprint-332');
    expect(msg).toContain('Cost / Sprint');
    expect(msg).toContain('Tokens / Task');
    expect(msg).toContain('No-Go Rate');
    expect(msg).toContain('Completion Rate');
    // Must NOT contain Turkish labels
    expect(msg).not.toContain('Sprint Başına Maliyet');
  });

  it('tr: uses Turkish KPI labels and title', () => {
    const msg = buildKpiSprintSummary(seededViews(), 'tr', 'sprint-332');
    expect(msg).toContain('sprint-332');
    expect(msg).toContain('Sprint Başına Maliyet');
    expect(msg).toContain('Görev Başına Token');
    expect(msg).toContain('NO-GO Oranı');
    expect(msg).toContain('Tamamlanma Oranı');
    // Must NOT contain English KPI labels
    expect(msg).not.toContain('Cost / Sprint');
  });

  it('tr: uses Turkish i18n title via kpi.title getMessage key', () => {
    const msg = buildKpiSprintSummary(seededViews(), 'tr', 'sprint-332');
    // kpi.title tr = 'KPI Karnesi — {sprint}'
    expect(msg).toContain('KPI Karnesi');
  });

  it('en: uses English i18n title via kpi.title getMessage key', () => {
    const msg = buildKpiSprintSummary(seededViews(), 'en', 'sprint-332');
    // kpi.title en = 'KPI Scorecard — {sprint}'
    expect(msg).toContain('KPI Scorecard');
  });

  it('empty views → returns kpi.no_data message (no crash)', () => {
    const msg = buildKpiSprintSummary([], 'en', 'sprint-332');
    // kpi.no_data en = 'No KPI data available for {sprint}.'
    expect(msg).toContain('No KPI data available');
    expect(msg).toContain('sprint-332');
  });

  it('empty views tr → returns Turkish no_data message', () => {
    const msg = buildKpiSprintSummary([], 'tr', 'sprint-332');
    // kpi.no_data tr = '{sprint} için KPI verisi bulunamadı.'
    expect(msg).toContain('sprint-332');
    expect(msg).toContain('KPI verisi bulunamadı');
  });

  it('views without any headline KPIs → returns no_data (no crash)', () => {
    const unrelated: KpiView[] = [
      makeView('cache_hit_rate', 'Cache Hit Rate', 'Önbellek Oranı', 'percent', 'up', 0.8),
    ];
    const msg = buildKpiSprintSummary(unrelated, 'en', 'sprint-332');
    expect(msg).toContain('No KPI data available');
  });

  it('result=null view → shows dash for the null value (no crash)', () => {
    const withNull: KpiView[] = [
      { definition: makeDef('cost_per_sprint', 'Cost / Sprint', 'Sprint Başına Maliyet', 'currency', 'down'), result: null },
    ];
    const msg = buildKpiSprintSummary(withNull, 'en', 'sprint-332');
    // formatKpiValue(null, ...) → '—'
    expect(msg).toContain('—');
    expect(msg).not.toThrow;
  });

  it('warning status → status line with warning indicator', () => {
    const views: KpiView[] = [
      makeView('cost_per_sprint', 'Cost / Sprint', 'Sprint Başına Maliyet', 'currency', 'down', 4.0, 'warning'),
    ];
    const msg = buildKpiSprintSummary(views, 'en', 'sprint-332');
    expect(msg).toContain('warning');
  });

  it('is deterministic: same input → same output', () => {
    const a = buildKpiSprintSummary(seededViews(), 'en', 'sprint-332');
    const b = buildKpiSprintSummary(seededViews(), 'en', 'sprint-332');
    expect(a).toBe(b);
  });
});

// ─── connector-notify-adapter: non-blocking KPI hook ─────────────────────────

describe('connector-notify-adapter: kpiSummaryFn hook', () => {
  it('sends KPI summary as a follow-up message on sprint-finalized', async () => {
    const tg = fakeConnector('telegram');
    const kpiSummaryFn = vi.fn().mockResolvedValue('📊 KPI Scorecard — sprint-332\nCost: $1.23');
    const adapter = makeConnectorNotificationAdapter(
      [{ connector: tg, chatId: 'TG-1' }],
      { kpiSummaryFn },
    );

    await adapter.send(sprintFinalizedNotif('sprint-332'));

    expect(kpiSummaryFn).toHaveBeenCalledWith('sprint-332');
    // First message = main notification; last message = KPI summary
    const texts = tg.sent.map((m) => m.text);
    expect(texts.some((t) => t.includes('KPI Scorecard'))).toBe(true);
  });

  it('does NOT call kpiSummaryFn for non sprint-finalized events', async () => {
    const tg = fakeConnector('telegram');
    const kpiSummaryFn = vi.fn().mockResolvedValue('KPI summary');
    const adapter = makeConnectorNotificationAdapter(
      [{ connector: tg, chatId: 'TG-1' }],
      { kpiSummaryFn },
    );

    await adapter.send({
      priority: 'info', event: 'task-done', title: 'done', summary: 'x',
      sprintId: 'sprint-332', timestamp: '2026-06-27T00:00:00.000Z',
    });

    expect(kpiSummaryFn).not.toHaveBeenCalled();
  });

  it('non-blocking: a throwing kpiSummaryFn does NOT break the notify path', async () => {
    const tg = fakeConnector('telegram');
    const kpiSummaryFn = vi.fn().mockRejectedValue(new Error('kpi-service-down'));
    const adapter = makeConnectorNotificationAdapter(
      [{ connector: tg, chatId: 'TG-1' }],
      { kpiSummaryFn },
    );

    // Must resolve (not reject) even though kpiSummaryFn throws
    await expect(adapter.send(sprintFinalizedNotif())).resolves.toBeUndefined();
    // Main notification was still delivered
    expect(tg.sent.length).toBeGreaterThan(0);
  });

  it('non-blocking: a kpiSummaryFn returning null sends no follow-up', async () => {
    const tg = fakeConnector('telegram');
    const kpiSummaryFn = vi.fn().mockResolvedValue(null);
    const adapter = makeConnectorNotificationAdapter(
      [{ connector: tg, chatId: 'TG-1' }],
      { kpiSummaryFn },
    );

    await adapter.send(sprintFinalizedNotif());

    // Only the main notification message is sent (no KPI follow-up for null)
    const texts = tg.sent.map((m) => m.text);
    expect(texts.some((t) => t.includes('KPI'))).toBe(false);
  });

  it('hook does not break without kpiSummaryFn option (opt-in)', async () => {
    const tg = fakeConnector('telegram');
    const adapter = makeConnectorNotificationAdapter([{ connector: tg, chatId: 'TG-1' }]);

    await expect(adapter.send(sprintFinalizedNotif())).resolves.toBeUndefined();
    expect(tg.sent.length).toBeGreaterThan(0);
  });
});
