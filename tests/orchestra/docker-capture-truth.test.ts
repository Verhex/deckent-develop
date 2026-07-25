// tests/orchestra/docker-capture-truth.test.ts
// born-671 (416-001 CAPTURE-TRUTH / TT549): docker-logs capture must NOT silently
// truncate at Node's 1 MiB spawnSync maxBuffer default.
//
// KANIT (trace-audit, CC-doğrulandı): monitorContainer captured `docker logs` via
// spawnSync with NO maxBuffer → 44% (16/36) of the trace corpus was cut at the
// 1.075–1.171 MB band, AND the ENOBUFS error spawnSync set was never checked. The
// cut dropped the terminal usage envelope → patchResultUsageFromEnvelope got
// truncated input → cost-heuristic 293× drift (413-001).
//
// This suite pins the fix (captureDockerLogs — async stream, 256 MiB honest-marker
// ceiling, exit/error honesty, spawn-injectable) and — the crux — proves the fix
// RESCUES the usage-patch by routing the patch through captureDockerLogs's OWN
// output (ceiling knob models the old 1 MiB cut). The usage-patch CONTRACT is
// untouched: patchResultUsageFromEnvelope is called unchanged; only its INPUT
// (full vs 1 MiB-truncated) differs.
//
// Hermetic: injected spawn (no real docker), tmpdir for all file I/O. The single
// real `spawnSync` (RED-A) is a Node-maxBuffer mechanism characterization only.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureDockerLogs,
  patchResultUsageFromEnvelope,
  DOCKER_LOG_CAPTURE_CEILING_BYTES,
  type DockerLogsSpawnImpl,
  type DockerLogsChildLike,
} from '../../src/orchestra/spawn-backend-docker.js';

// ─── cleanup ─────────────────────────────────────────────────────────────────

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─── fake spawn (hermetic — no real docker) ────────────────────────────────────

interface FakeOpts {
  /** stdout chunks emitted in order (objectMode — each element is one 'data' event). */
  stdout?: Array<Buffer | string>;
  /** stderr chunks emitted in order. */
  stderr?: Array<Buffer | string>;
  /** exit code for the synthesized 'close' (default 0). */
  closeCode?: number | null;
  /** terminating signal for the synthesized 'close' (default null). */
  closeSignal?: NodeJS.Signals | null;
  /** emit 'error' with this Error instead of a clean 'close' once streams drain. */
  errorAfterData?: Error;
  /** never synthesize a 'close' (drives the timeout path). */
  neverClose?: boolean;
}

function makeFakeSpawn(opts: FakeOpts): {
  spawnImpl: DockerLogsSpawnImpl;
  killed: () => boolean;
  calls: Array<{ command: string; args: string[] }>;
} {
  let wasKilled = false;
  const calls: Array<{ command: string; args: string[] }> = [];

  const spawnImpl: DockerLogsSpawnImpl = (command, args) => {
    calls.push({ command, args: [...args] });
    const emitter = new EventEmitter();
    const stdout = Readable.from(opts.stdout ?? []);
    const stderr = Readable.from(opts.stderr ?? []);
    let ended = 0;
    const onEnd = (): void => {
      ended += 1;
      if (ended < 2) return;
      if (opts.neverClose) return;
      // Defer so any final synchronous 'data' is fully absorbed before we settle.
      queueMicrotask(() => {
        if (opts.errorAfterData) emitter.emit('error', opts.errorAfterData);
        else emitter.emit('close', opts.closeCode ?? 0, opts.closeSignal ?? null);
      });
    };
    stdout.on('end', onEnd);
    stderr.on('end', onEnd);

    const child: DockerLogsChildLike = {
      stdout: stdout as unknown as NodeJS.ReadableStream,
      stderr: stderr as unknown as NodeJS.ReadableStream,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on(event: 'close' | 'error', listener: (...a: any[]) => void) {
        emitter.on(event, listener);
        return child;
      },
      kill() {
        wasKilled = true;
        return true;
      },
    };
    return child;
  };

  return { spawnImpl, killed: () => wasKilled, calls };
}

const MIB = 1024 * 1024;

// ─── RED-A: the swallowed root-cause mechanism (Node maxBuffer characterization) ─

describe('RED-A — spawnSync default maxBuffer silently truncates >1MiB + swallows the error', () => {
  it('the OLD capture pattern loses data and never sees the ENOBUFS error', () => {
    const TWO_MIB = 2 * MIB;
    const res = spawnSync(
      process.execPath,
      ['-e', `process.stdout.write('A'.repeat(${TWO_MIB}))`],
      { encoding: 'utf-8' }, // NO maxBuffer → Node 1 MiB default (exactly the old bug)
    );
    // Node sets `.error` (ENOBUFS) on overflow — the old code checked NEITHER
    // `.error` NOR `.status`, so the loss was invisible.
    expect(res.error).toBeTruthy();
    // The old concat the monitor used: `(stdout ?? '') + (stderr ?? '')`.
    const oldConcat = (res.stdout ?? '') + (res.stderr ?? '');
    // Truncated — NOT the full 2 MiB. (Retained size runs one chunk past the 1 MiB
    // cap, which is why the KANIT band is 1.075–1.171 MB, not a clean 1.048 MB — so
    // assert "< full", not a pinned ~1 MiB.)
    expect(Buffer.byteLength(oldConcat, 'utf-8')).toBeLessThan(TWO_MIB);
  });
});

// ─── GREEN: captureDockerLogs streams the FULL payload, no 1MiB cut ─────────────

describe('captureDockerLogs — full capture (the fix)', () => {
  it('GREEN: streams a 2 MiB single chunk fully — truncated=false, captureIncomplete=false', async () => {
    const big = Buffer.alloc(2 * MIB, 0x41); // 2 MiB of 'A' — 2× the old 1 MiB cap
    const { spawnImpl } = makeFakeSpawn({ stdout: [big], closeCode: 0 });

    const cap = await captureDockerLogs('c-green', spawnImpl);

    expect(cap.bytesCaptured).toBe(2 * MIB);
    expect(Buffer.byteLength(cap.content, 'utf-8')).toBe(2 * MIB);
    expect(cap.truncated).toBe(false);
    expect(cap.captureIncomplete).toBe(false);
    expect(cap.exitCode).toBe(0);
  });

  it('GREEN: reassembles many chunks past 1 MiB (no per-chunk cap)', async () => {
    const chunk = Buffer.alloc(300 * 1024, 0x42); // 300 KiB
    const chunks = Array.from({ length: 5 }, () => chunk); // 1.5 MiB total
    const { spawnImpl } = makeFakeSpawn({ stdout: chunks, closeCode: 0 });

    const cap = await captureDockerLogs('c-multi', spawnImpl);

    expect(cap.bytesCaptured).toBe(5 * 300 * 1024);
    expect(cap.truncated).toBe(false);
    expect(cap.captureIncomplete).toBe(false);
  });

  it('concatenates stdout THEN stderr (old `(stdout)+(stderr)` order preserved)', async () => {
    const { spawnImpl } = makeFakeSpawn({ stdout: ['OUT'], stderr: ['ERR'], closeCode: 0 });
    const cap = await captureDockerLogs('c-order', spawnImpl);
    expect(cap.content).toBe('OUTERR');
  });

  it('spawn-injectable: invokes `docker logs <container>` via the injected spawn only', async () => {
    const fake = makeFakeSpawn({ stdout: ['hi'], closeCode: 0 });
    const cap = await captureDockerLogs('c-inject', fake.spawnImpl);
    expect(fake.calls).toEqual([{ command: 'docker', args: ['logs', 'c-inject'] }]);
    expect(cap.content).toBe('hi');
  });

  it('sanity: the production default ceiling is 256 MiB (not 1 MiB)', () => {
    expect(DOCKER_LOG_CAPTURE_CEILING_BYTES).toBe(256 * MIB);
  });
});

// ─── ceiling: honest truncation, never silent ──────────────────────────────────

describe('captureDockerLogs — safety ceiling is HONEST (marker + loud warn), never silent', () => {
  it('ceiling hit → truncated + captureIncomplete + on-disk marker + loud warn + child killed', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const big = Buffer.alloc(5000, 0x41);
    const { spawnImpl, killed } = makeFakeSpawn({ stdout: [big], closeCode: 0 });

    const cap = await captureDockerLogs('c-ceil', spawnImpl, { ceilingBytes: 1000 });

    expect(cap.truncated).toBe(true);
    expect(cap.captureIncomplete).toBe(true);
    expect(cap.bytesCaptured).toBe(1000);
    expect(cap.content).toContain('TRUNCATED'); // honest marker embedded IN the content
    expect(cap.content).toContain('captureIncomplete=true');
    expect(killed()).toBe(true); // stream was actively stopped
    expect(warnSpy).toHaveBeenCalled(); // loud — not silent
  });
});

// ─── exit/error honesty: partial data delivered, loss flagged not hidden ────────

describe('captureDockerLogs — exit/error honesty', () => {
  it('non-zero exit → captureIncomplete=true, partial content STILL returned (not hidden)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spawnImpl } = makeFakeSpawn({ stdout: ['partial output'], closeCode: 1 });

    const cap = await captureDockerLogs('c-exit1', spawnImpl);

    expect(cap.exitCode).toBe(1);
    expect(cap.captureIncomplete).toBe(true);
    expect(cap.truncated).toBe(false);
    expect(cap.content).toBe('partial output');
  });

  it('terminating signal → captureIncomplete=true, signal surfaced', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spawnImpl } = makeFakeSpawn({ stdout: ['x'], closeCode: null, closeSignal: 'SIGKILL' });

    const cap = await captureDockerLogs('c-sig', spawnImpl);

    expect(cap.signal).toBe('SIGKILL');
    expect(cap.captureIncomplete).toBe(true);
    expect(cap.content).toBe('x');
  });

  it("spawn 'error' event → captureIncomplete=true, no throw, exitCode null", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spawnImpl } = makeFakeSpawn({ stdout: [], errorAfterData: new Error('docker daemon gone') });

    const cap = await captureDockerLogs('c-err', spawnImpl);

    expect(cap.captureIncomplete).toBe(true);
    expect(cap.exitCode).toBeNull();
  });

  it('hung docker logs → timeout kills the child + returns captureIncomplete', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spawnImpl, killed } = makeFakeSpawn({ stdout: [], neverClose: true });

    const cap = await captureDockerLogs('c-hang', spawnImpl, { timeoutMs: 50 });

    expect(cap.captureIncomplete).toBe(true);
    expect(killed()).toBe(true);
  });

  it('clean exit-0 → captureIncomplete=false (normal path is not falsely flagged)', async () => {
    const { spawnImpl } = makeFakeSpawn({ stdout: ['all good'], closeCode: 0 });
    const cap = await captureDockerLogs('c-ok', spawnImpl);
    expect(cap.captureIncomplete).toBe(false);
    expect(cap.truncated).toBe(false);
  });
});

// ─── usage-patch pin — the crux: the fix RESCUES patchResultUsageFromEnvelope ───
// Routed THROUGH captureDockerLogs's own output so we prove the capture DELIVERS
// full input to the (unchanged) patch — not merely that the patch works on a
// hand-built string. The ceiling knob models the exact production 1 MiB cut.

describe('usage-patch pin (413-001) — captureDockerLogs feeds patchResultUsageFromEnvelope', () => {
  const USAGE = { input_tokens: 4242, output_tokens: 909, cache_read_input_tokens: 700, cache_creation_input_tokens: 33 };
  const FINAL_ENVELOPE = JSON.stringify({
    type: 'result', subtype: 'success', result: 'done', usage: USAGE,
    total_cost_usd: 1.2345,
    modelUsage: { 'claude-sonnet-5': { inputTokens: 4242, outputTokens: 909, costUSD: 1.2345 } },
  });

  /** A >1 MiB fake docker-logs stream whose FINAL line is the usage envelope. */
  function buildBigStream(): Buffer[] {
    const fillerLine =
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'x'.repeat(200) }] } }) + '\n';
    const repeat = Math.ceil((1.3 * MIB) / fillerLine.length);
    const filler = Buffer.from(fillerLine.repeat(repeat)); // ~1.3 MiB — past the 1 MiB cap
    const envelope = Buffer.from(FINAL_ENVELOPE + '\n');   // terminal usage line
    return [filler, envelope];
  }

  function makeTaskDir(taskId: string): string {
    const root = mkdtempSync(join(tmpdir(), 'docker-capture-'));
    dirs.push(root);
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(
      join(root, '.tasks', `task-${taskId}.result`),
      JSON.stringify({
        taskId,
        selfAssessment: 'DONE',
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          provider: 'claude',
          model: 'claude-sonnet-5',
        },
      }),
      'utf-8',
    );
    return join(root, '.tasks');
  }

  it('RED: a 1 MiB-capped capture drops the terminal usage line → patch DIES (tokens stay 0)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spawnImpl } = makeFakeSpawn({ stdout: buildBigStream(), closeCode: 0 });

    // ceilingBytes: 1 MiB — models the OLD spawnSync maxBuffer default exactly.
    const cap = await captureDockerLogs('usage-red', spawnImpl, { ceilingBytes: MIB });
    expect(cap.truncated).toBe(true);
    expect(cap.content).not.toContain('"usage"'); // terminal envelope was cut off

    const tasksDir = makeTaskDir('usage-red');
    patchResultUsageFromEnvelope(tasksDir, 'usage-red', 'claude-sonnet-5', cap.content);

    const r = JSON.parse(readFileSync(join(tasksDir, 'task-usage-red.result'), 'utf-8')) as {
      tokenUsage: Record<string, number>;
    };
    // Patch could not find the usage envelope → tokens stay 0 (the 293× drift bug).
    expect(r.tokenUsage.inputTokens).toBe(0);
    expect(r.tokenUsage.outputTokens).toBe(0);
  });

  it('GREEN: the full 256 MiB-ceiling capture keeps the terminal usage line → patch writes REAL tokens', async () => {
    const { spawnImpl } = makeFakeSpawn({ stdout: buildBigStream(), closeCode: 0 });

    // Default (256 MiB) ceiling — the fix. Same stream, same unchanged patch fn.
    const cap = await captureDockerLogs('usage-green', spawnImpl);
    expect(cap.truncated).toBe(false);
    expect(cap.captureIncomplete).toBe(false);
    expect(cap.content).toContain('"usage"'); // terminal envelope survived the >1 MiB payload

    const tasksDir = makeTaskDir('usage-green');
    patchResultUsageFromEnvelope(tasksDir, 'usage-green', 'claude-sonnet-5', cap.content);

    const r = JSON.parse(readFileSync(join(tasksDir, 'task-usage-green.result'), 'utf-8')) as {
      tokenUsage: Record<string, number>;
      providerBilling: { providerReportedUsd: number; modelUsage: Record<string, unknown> };
    };
    // REAL numbers recovered — the fix rescued the patch.
    expect(r.tokenUsage.inputTokens).toBe(4242);
    expect(r.tokenUsage.outputTokens).toBe(909);
    expect(r.tokenUsage.cacheReadTokens).toBe(700);
    expect(r.providerBilling.providerReportedUsd).toBe(1.2345);
    expect(r.providerBilling.modelUsage).toHaveProperty('claude-sonnet-5');
  });
});
