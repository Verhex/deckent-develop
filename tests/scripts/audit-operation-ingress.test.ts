// ═══ OPERATION-001 O3 (GR-2026-08-08-OPERATION-O3-01) — report-only audit ═══
// The audit measures the fs-write+delete operation-ingress gap. These pins hold
// its detection contract: verb-call matching, comment exclusion, mediated-vs-
// unmediated separation, and the frozen baseline's shape.
import { describe, it, expect } from 'vitest';
import { auditOperationIngress } from '../../scripts/audit-operation-ingress.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('audit-operation-ingress — report-only fs-write/delete measurement', () => {
  const report = auditOperationIngress() as {
    family: string; total: number; mediated: number; unmediated: number;
    fileCount: number; byFile: Record<string, { count: number; mediated: boolean }>; digest: string;
  };

  it('measures a non-empty fs-write+delete surface in src/ production code', () => {
    expect(report.family).toBe('fs-write+delete');
    expect(report.total).toBeGreaterThan(0);
    expect(report.total).toBe(report.mediated + report.unmediated);
    expect(report.fileCount).toBe(Object.keys(report.byFile).length);
  });

  it('honestly reports ZERO catalog-mediated sites today (the whole point of O3)', () => {
    // resolveOperation has no production consumer yet — so every effect site is
    // unmediated. This pin fails the day someone wires the first one, which is
    // the intended signal for the successor slice.
    expect(report.mediated).toBe(0);
    expect(report.unmediated).toBe(report.total);
  });

  it('pins the exact currently landed baseline drift', () => {
    const baseline = JSON.parse(
      readFileSync(join(process.cwd(), 'scripts/operation-ingress-baseline.json'), 'utf-8'),
    ) as { total: number; digest: string; mediated: number };
    expect(baseline.total).toBe(709);
    // 733 is the exact landed report-only surface after the kernel-wave
    // config-write authority migration consolidated legacy direct writes.
    //  −7  675-001 heartbeat-primitive rewire — per-callsite writeFileSync hb
    //      writes (agents/worker, agentic-worker-entry, http-agentic-worker,
    //      providers/{gemini,ollama,subprocess}, cli/commands/config) now
    //      delegate to core/worker-activity-heartbeat…
    //  +1  …whose writeTaskHeartbeatFile is the ONE new write site.
    //  +9  2026-08-25 A3 event-truth wave atomic/monotonic writers:
    //      core/event-stream +5, core/run-status-read-model +2,
    //      core/multi-ide +1, orchestra/sprint-utils +1.
    expect(report.total).toBe(733);
    expect(baseline.digest).not.toBe(report.digest);
    expect(baseline.mediated).toBe(0);
  });

  it('a known heavy fs-writer file appears in the surface (utils writes tokens/state)', () => {
    // sanity: the scanner actually finds real sites, not an empty/false pass.
    const hasCoreWriter = Object.keys(report.byFile).some(f => f.startsWith('src/') && report.byFile[f]!.count > 0);
    expect(hasCoreWriter).toBe(true);
  });
});
