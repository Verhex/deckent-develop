// tests/orchestra/trn1-sprint-trace-wire.test.ts
// TRN-1 — trace-recorder wired into the sprint-worker output-collector JSONL
// contract. Proves: flag ON records a redacted + labeled trace entry, flag
// OFF is a byte-identical no-op, and a throwing collector never breaks the
// sprint (fail-soft, ADR-G-009).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OutputCollector } from '../../src/core/output-collector.js';
import type { LogEvent } from '../../src/core/log-event.js';
import {
  recordSprintWorkerTrace,
  sprintTraceFilePath,
} from '../../src/orchestra/output-collector.js';
import { toSprintTrainingExample } from '../../src/agent/trace-recorder.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function makeProjectRoot(taskId: string, events: LogEvent[]): string {
  const root = mkdtempSync(join(tmpdir(), 'trn1-'));
  dirs.push(root);
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  const lines = events.map((ev) => JSON.stringify(ev)).join('\n') + '\n';
  writeFileSync(join(tasksDir, `task-${taskId}.log`), lines, 'utf-8');
  return root;
}

const SECRET = 'sk-abcdefghijklmnopqrstuvwxyz012345';

const EVENTS: LogEvent[] = [
  { ts: '2026-07-01T00:00:00.000Z', seq: 1, type: 'turn', content: { note: 'start' } },
  { ts: '2026-07-01T00:00:01.000Z', seq: 2, type: 'text', content: `here is my key ${SECRET}` },
  { ts: '2026-07-01T00:00:02.000Z', seq: 3, type: 'tool_result', content: { output: 'ok' } },
];

describe('recordSprintWorkerTrace (TRN-1)', () => {
  it('flag ON: records a redacted, labeled trace entry from the collected LogEvent stream', () => {
    const root = makeProjectRoot('350-777', EVENTS);
    const collector = new OutputCollector(root);

    recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector,
      meta: {
        taskId: '350-777',
        sprintId: 'sprint-350',
        agent: 'architect',
        model: 'sonnet',
        selfAssessment: 'DONE',
        ts: '2026-07-01T00:00:03.000Z',
      },
    });

    const file = sprintTraceFilePath(root);
    expect(existsSync(file)).toBe(true);
    const line = readFileSync(file, 'utf-8').trim();
    expect(line.split('\n')).toHaveLength(1);

    const written = JSON.parse(line) as { messages: Array<{ content: string }>; meta: Record<string, unknown> };

    // Secrets masked.
    expect(JSON.stringify(written)).not.toContain(SECRET);
    expect(JSON.stringify(written)).toContain('[REDACTED]');

    // Labels present.
    expect(written.meta).toMatchObject({
      taskId: '350-777',
      sprintId: 'sprint-350',
      agent: 'architect',
      model: 'sonnet',
      selfAssessment: 'DONE',
    });

    // 3 collected events -> 3 mapped messages, tool_result -> role 'tool'.
    expect(written.messages).toHaveLength(3);

    collector.dispose();
  });

  it('flag OFF: byte-identical no-op — collector is never read, no file is written', () => {
    const root = makeProjectRoot('350-778', EVENTS);
    let readCalls = 0;
    const spyCollector = {
      readLogEvents: (): LogEvent[] => { readCalls++; return []; },
    };

    recordSprintWorkerTrace({
      enabled: false,
      projectRoot: root,
      collector: spyCollector,
      meta: {
        taskId: '350-778',
        sprintId: 'sprint-350',
        agent: 'architect',
        model: 'sonnet',
        selfAssessment: 'DONE',
        ts: '2026-07-01T00:00:03.000Z',
      },
    });

    expect(readCalls).toBe(0);
    expect(existsSync(sprintTraceFilePath(root))).toBe(false);
  });

  it('fail-soft: a throwing collector never throws out of recordSprintWorkerTrace', () => {
    const root = mkdtempSync(join(tmpdir(), 'trn1-'));
    dirs.push(root);
    const throwingCollector = {
      readLogEvents: (): LogEvent[] => { throw new Error('disk read failed'); },
    };

    expect(() => recordSprintWorkerTrace({
      enabled: true,
      projectRoot: root,
      collector: throwingCollector,
      meta: {
        taskId: '350-779',
        sprintId: 'sprint-350',
        agent: 'architect',
        model: 'sonnet',
        selfAssessment: 'NO_GO',
        ts: '2026-07-01T00:00:03.000Z',
      },
    })).not.toThrow();

    expect(existsSync(sprintTraceFilePath(root))).toBe(false);
  });
});

describe('toSprintTrainingExample', () => {
  it('maps tool_result events to role "tool", everything else to role "assistant"', () => {
    const ex = toSprintTrainingExample(EVENTS, {
      taskId: '350-780',
      sprintId: 'sprint-350',
      agent: 'architect',
      model: 'sonnet',
      selfAssessment: 'DONE',
      ts: 'T',
    });

    expect(ex.messages[0]!.role).toBe('assistant');
    expect(ex.messages[1]!.role).toBe('assistant');
    expect(ex.messages[2]!.role).toBe('tool');
    expect(ex.messages[1]!.content).not.toContain(SECRET);
    expect(ex.messages[1]!.content).toContain('[REDACTED]');
  });

  it('born-614: carries workerSelfAssessment alongside the Brain-verdict label (honesty-gap signal)', () => {
    const ex = toSprintTrainingExample(EVENTS, {
      taskId: '350-780',
      sprintId: 'sprint-350',
      agent: 'architect',
      model: 'sonnet',
      selfAssessment: 'NO_GO',            // Brain'in nihai verdict'i = outcome-label kaynagi
      workerSelfAssessment: 'DONE',       // worker'in kendi (yanlis) iddiasi
      ts: 'T',
    });
    expect(ex.meta.selfAssessment).toBe('NO_GO');
    expect(ex.meta.workerSelfAssessment).toBe('DONE');
  });

  it('born-614: workerSelfAssessment absent -> field omitted (pre-614 shape byte-identical)', () => {
    const ex = toSprintTrainingExample(EVENTS, {
      taskId: 't', sprintId: 's', agent: 'a', model: 'm', selfAssessment: 'DONE', ts: 'T',
    });
    expect('workerSelfAssessment' in ex.meta).toBe(false);
  });
});

describe('born-614 call-site composition pin (yarim-wire sinifina karsi)', () => {
  it('runEvaluatePhase contains the training_trace-gated recordSprintWorkerTrace sweep', () => {
    // Ayni siniftan uc yarim-wire yasandi (desktop isLocalRendererUrl, tool_surface
    // default-ON, recordSprintWorkerTrace'in kendisi) - modul testli olsa da cagiran
    // kaybolursa bu pin kirmiziya doner.
    const src = readFileSync(join(process.cwd(), 'src', 'orchestra', 'sprint-phases.ts'), 'utf-8');
    const evalPhase = src.slice(src.indexOf('export async function runEvaluatePhase('));
    expect(evalPhase).toContain("config?.training_trace?.enabled === true");
    expect(evalPhase).toContain('recordSprintWorkerTrace({');
    expect(evalPhase).toContain('workerSelfAssessment: traceResult.selfAssessment');
    // Verdict (Brain evaluation) label olarak geciyor - worker-iddiasi degil:
    expect(evalPhase).toContain('selfAssessment: verdict');
  });

  it('CANLI-KANIT DERSI (sprint-400): sprint-controller call-siteleri config parametresini GECIRIR', () => {
    // Ilk canli-sinav TAM BU yuzden basarisiz oldu: sweep runEvaluatePhase'te vardi
    // ama iki cagri-sitesi de config'i `undefined` geciyordu (a778151a tool_surface
    // olum-bicimiyle ayni: opsiyonel-param yarim-wire). Bu pin cagri-sitelerini kilitler.
    const src = readFileSync(join(process.cwd(), 'src', 'orchestra', 'sprint-controller.ts'), 'utf-8');
    const calls = src.split('await runEvaluatePhase(').slice(1);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      // Yorumlari ve whitespace'i normalize et — cagri-siteleri artik multiline
      // (incremental streaming call-site dahil) ve 8. arg farklilasabiliyor
      // (deferredTaskIds | undefined). Degismez olan sey: 6. pozisyonel arg
      // CONFIG'tir, undefined DEGILDIR.
      const argsHead = c.slice(0, 700)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\s+/g, ' ');
      // 5. arg coverage-floor'dan hemen sonra 6. arg config gelmeli:
      expect(argsHead).toMatch(/, config, undefined,/);
    }
  });
});
