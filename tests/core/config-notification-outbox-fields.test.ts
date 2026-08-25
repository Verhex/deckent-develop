// 671-001 — Config authority for the owner-notification outbox drain interval
// (`notify_outbox_drain_interval_ms`, consumed by the bot-daemon durable
// owner-notification drain loop) and the notification_delivery_health-only
// pending-age threshold (`pending_age_threshold_ms` on NervousDetectorConfig,
// consumed by the delivery-health detector). This task only authors the
// config triple (typed field + DEFAULT + CONFIG_METADATA); both downstream
// consumers are separate tasks. Hermetic: every config lives under a
// mkdtemp'd project root, cleaned up in afterEach.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadConfig,
  clearConfigCache,
  CONFIG_METADATA,
  NERVOUS_DETECTOR_SCHEMA,
} from '../../src/core/config.js';

const dirs: string[] = [];
function project(cfg: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), 'cfg-notify-outbox-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  writeFileSync(join(d, '.deckent', 'config.json'), JSON.stringify({ mode: 'balanced', ...cfg }));
  return d;
}

afterEach(() => {
  clearConfigCache();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('config — notify_outbox_drain_interval_ms / pending_age_threshold_ms (671-001)', () => {
  it('(a) a config omitting both fields resolves to the documented defaults', async () => {
    clearConfigCache();
    const d = project({});
    const cfg = await loadConfig(d, { force: true });

    // Drain cadence default: 30s — well under operator tolerance for a stuck
    // pause-notification.
    expect(cfg.notify_outbox_drain_interval_ms).toBe(30_000);

    // Pending-age default: 5 min — several multiples of the 30s drain cadence,
    // scoped to notification_delivery_health only.
    expect(cfg.nervous_system?.detectors.notification_delivery_health.pending_age_threshold_ms).toBe(300_000);

    // The stale_worker-only threshold_ms field must remain untouched by this
    // task's default (no accidental reuse/cross-contamination).
    expect(cfg.nervous_system?.detectors.stale_worker.threshold_ms).toBe(120_000);
    expect(cfg.nervous_system?.detectors.stale_worker.pending_age_threshold_ms).toBeUndefined();
  });

  it('(b) a config setting both fields survives validation with the authored values intact', async () => {
    clearConfigCache();
    const d = project({
      notify_outbox_drain_interval_ms: 15_000,
      nervous_system: {
        detectors: {
          notification_delivery_health: { enabled: true, pending_age_threshold_ms: 600_000 },
        },
      },
    });
    const cfg = await loadConfig(d, { force: true });

    expect(cfg.notify_outbox_drain_interval_ms).toBe(15_000);
    expect(cfg.nervous_system?.detectors.notification_delivery_health.enabled).toBe(true);
    expect(cfg.nervous_system?.detectors.notification_delivery_health.pending_age_threshold_ms).toBe(600_000);

    // Sibling detector defaults must remain intact — the merge/override must
    // not clobber unrelated detector blocks.
    expect(cfg.nervous_system?.detectors.stale_worker.threshold_ms).toBe(120_000);

    // The nervous-detector zod schema (mirrors NervousDetectorConfig) must
    // accept the field directly — a strict schema without this key would
    // reject/strip it instead of validating it.
    const parsed = NERVOUS_DETECTOR_SCHEMA.parse({ enabled: true, pending_age_threshold_ms: 600_000 });
    expect(parsed.pending_age_threshold_ms).toBe(600_000);
  });

  it('(c) CONFIG_METADATA carries exactly one entry per new field', () => {
    expect(CONFIG_METADATA['notify_outbox_drain_interval_ms']).toBeDefined();
    expect(CONFIG_METADATA['notify_outbox_drain_interval_ms']?.default).toBe(30_000);

    const pendingAgeKeys = Object.keys(CONFIG_METADATA).filter((key) =>
      key.includes('pending_age_threshold_ms'),
    );
    expect(pendingAgeKeys).toHaveLength(1);
    expect(CONFIG_METADATA[pendingAgeKeys[0]!]?.default).toBe(300_000);

    const drainIntervalKeys = Object.keys(CONFIG_METADATA).filter((key) =>
      key.includes('notify_outbox_drain_interval_ms'),
    );
    expect(drainIntervalKeys).toHaveLength(1);
  });
});
