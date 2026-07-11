// tests/orchestra/fix-phase-trace.test.ts
// TT551 (416-003) FIX-PHASE-TRACE — the FIX phase recorded ZERO training
// traces. `recordSprintWorkerTrace` was called ONLY from runEvaluatePhase, so
// the NO_GO→FIX→DONE trajectory (the highest-value SFT signal: an error+fix
// PAIR) and every INTERMEDIATE NO_GO fix-verdict went off-record — the
// sprint-worker corpus was success-biased (27 DONE / 9 debt / 0 NO_GO). This
// proves:
//   (1) additive meta schema (attempt/retryOf/purpose/verdict) flows through
//       the SINGLE recorder mapping API (toSprintTrainingExample) and is
//       OMITTED when unset — pre-TT551 shape byte-identical, so the existing
//       consumer (training/pipeline.ts buildLabels) is unaffected;
//   (2) a fix-worker trace is recorded as its OWN entry, SEPARATE from the
//       original attempt, and a NO_GO fix verdict IS recorded (de-biases corpus);
//   (3) RED→GREEN composition pin: runFixPhase actually WIRES the recorder —
//       sliced to the function body, because a whole-file grep would false-pass
//       on the EVALUATE-phase call + the top-of-file import.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OutputCollector } from '../../src/core/output-collector.js';
import { recordSprintWorkerTrace, sprintTraceFilePath } from '../../src/orchestra/output-collector.js';
import { toSprintTrainingExample } from '../../src/agent/trace-recorder.js';
import type { LogEvent } from '../../src/core/log-event.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function makeProjectRoot(taskId: string, events: LogEvent[]): string {
  const root = mkdtempSync(join(tmpdir(), 'tt551-'));
  dirs.push(root);
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, `task-${taskId}.log`),
    events.map((ev) => JSON.stringify(ev)).join('\n') + '\n',
    'utf-8',
  );
  return root;
}

const EVENTS: LogEvent[] = [
  { ts: '2026-07-01T00:00:00.000Z', seq: 1, type: 'turn', content: { note: 'start' } },
  { ts: '2026-07-01T00:00:01.000Z', seq: 2, type: 'text', content: 'applying the fix' },
  { ts: '2026-07-01T00:00:02.000Z', seq: 3, type: 'tool_result', content: { output: 'ok' } },
];

// ─── (1) additive schema on the SINGLE recorder mapping API ──────────────────
describe('TT551 additive FIX-phase meta schema (toSprintTrainingExample)', () => {
  it('threads attempt/retryOf/purpose/verdict into the written meta when provided', () => {
    const ex = toSprintTrainingExample(EVENTS, {
      taskId: '416-003-fix',
      sprintId: 'sprint-416',
      agent: 'api-builder',
      model: 'opus',
      selfAssessment: 'NO_GO',
      workerSelfAssessment: 'DONE',
      verdict: 'NO_GO',
      purpose: 'fix',
      attempt: 2,
      retryOf: '416-003',
      ts: 'T',
    });
    expect(ex.meta).toMatchObject({
      verdict: 'NO_GO',
      purpose: 'fix',
      attempt: 2,
      retryOf: '416-003',
    });
    // Brain-verdict label + worker-claim delta still carried (born-614 unbroken).
    expect(ex.meta.selfAssessment).toBe('NO_GO');
    expect(ex.meta.workerSelfAssessment).toBe('DONE');
  });

  it('additive: unset fields are OMITTED (pre-TT551 shape byte-identical — consumer-safe)', () => {
    const ex = toSprintTrainingExample(EVENTS, {
      taskId: 't', sprintId: 's', agent: 'a', model: 'm', selfAssessment: 'DONE', ts: 'T',
    });
    expect('verdict' in ex.meta).toBe(false);
    expect('purpose' in ex.meta).toBe(false);
    expect('attempt' in ex.meta).toBe(false);
    expect('retryOf' in ex.meta).toBe(false);
  });
});

// ─── (2) fix-attempt recorded as its OWN entry + NO_GO verdict captured ──────
describe('TT551 FIX-phase trace: fix + original AYRI kayıt, NO_GO verdict recorded', () => {
  it('records the fix attempt as a separate labeled entry alongside the NO_GO original', () => {
    const root = makeProjectRoot('416-003-fix', EVENTS);
    // The original NO_GO attempt shares the tmpdir .log for its own taskId.
    writeFileSync(
      join(root, '.tasks', 'task-416-003.log'),
      EVENTS.map((ev) => JSON.stringify(ev)).join('\n') + '\n',
      'utf-8',
    );
    const collector = new OutputCollector(root);

    // attempt-1 — original worker, evaluated NO_GO by Brain.
    recordSprintWorkerTrace({
      enabled: true, projectRoot: root, collector,
      meta: {
        taskId: '416-003', sprintId: 'sprint-416', agent: 'api-builder', model: 'opus',
        selfAssessment: 'NO_GO', verdict: 'NO_GO', purpose: 'original', attempt: 1,
        ts: '2026-07-01T00:00:03.000Z',
      },
    });
    // attempt-2 — the SEPARATE fix re-run, which ALSO lands NO_GO (intermediate verdict).
    recordSprintWorkerTrace({
      enabled: true, projectRoot: root, collector,
      meta: {
        taskId: '416-003-fix', sprintId: 'sprint-416', agent: 'api-builder', model: 'opus',
        selfAssessment: 'NO_GO', workerSelfAssessment: 'DONE',
        verdict: 'NO_GO', purpose: 'fix', attempt: 2, retryOf: '416-003',
        ts: '2026-07-01T00:00:04.000Z',
      },
    });

    const file = sprintTraceFilePath(root);
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2); // fix + original = AYRI kayıt (two separate entries)

    const recs = lines.map((l) => JSON.parse(l) as { meta: Record<string, unknown> });
    const original = recs.find((r) => r.meta.taskId === '416-003')!;
    const fix = recs.find((r) => r.meta.taskId === '416-003-fix')!;
    expect(original.meta).toMatchObject({ purpose: 'original', attempt: 1, verdict: 'NO_GO' });
    expect(fix.meta).toMatchObject({ purpose: 'fix', attempt: 2, retryOf: '416-003', verdict: 'NO_GO' });
    // The de-bias: a NO_GO verdict is now on record from the FIX path (was 0 before).
    expect(recs.some((r) => r.meta.verdict === 'NO_GO')).toBe(true);

    collector.dispose();
  });
});

// ─── (3) RED→GREEN: runFixPhase WIRES the recorder (sliced to the fn body) ───
describe('TT551 runFixPhase call-site composition pin', () => {
  it('runFixPhase body wires the training_trace-gated recorder with additive fix labels', () => {
    // Slice to the runFixPhase body ONLY: a whole-file grep would false-pass on
    // the top-of-file `recordSprintWorkerTrace` import + the EVALUATE-phase call.
    const src = readFileSync(join(process.cwd(), 'src', 'orchestra', 'sprint-phases.ts'), 'utf-8');
    const start = src.indexOf('export async function runFixPhase(');
    expect(start).toBeGreaterThan(-1);
    const after = src.indexOf('\nexport ', start + 1);
    const fixBody = src.slice(start, after === -1 ? undefined : after);

    // Anchors below are all ABSENT from the pre-TT551 runFixPhase body (the word
    // "attempt" alone is NOT anchored on — it already appears in the re-dispatch
    // logic — so a genuine RED is preserved).
    expect(fixBody).toContain('recordFixWorkerTrace');
    expect(fixBody).toContain('config?.training_trace?.enabled === true');
    expect(fixBody).toContain('recordSprintWorkerTrace({');
    expect(fixBody).toContain('purpose');
    expect(fixBody).toContain('verdict');
    expect(fixBody).toContain('retryOf');
  });
});
