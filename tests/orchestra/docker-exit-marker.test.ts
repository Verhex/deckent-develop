// ─── Sprint 272 T-003: exit-without-result enriched marker ──────────────────
//
// Validates the wrapper-side fix for the 3-sprint live pattern where a worker
// finishes its work (git diff on disk, hb seq high) but exits — often cleanly,
// exitCode 0, on a usage-limit / stream interruption — WITHOUT writing `.result`.
// The old EXIT-trap else-branch wrote a blind NO_GO; now it writes an enriched
// `EXIT_WITHOUT_RESULT` marker (workPresent + diffStat + last hb) after a
// last-chance flush window, so Task 272-004's FIX can verify-and-complete.
//
// Coverage:
//   1. buildExitWithoutResultMarker — pure marker shape (fields, workPresent,
//      diffStat, last hb, signal info, defaults).
//   2. buildOnExitTrap — shell string contains the last-chance loop + enriched
//      marker tokens AND preserves the TIMEOUT_WITH_WORK regression surface.
//   3. Real `sh` run of the generated NORESULTEOF heredoc — proves the template
//      produces VALID JSON with the right fields (proof-of-function; the bug class
//      this task fixes is silent marker corruption, which a string check misses).
//
// Hermetic: tmpdir for all I/O, async spawn (no spawnSync), no docker, no git.

import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildExitWithoutResultMarker,
  buildOnExitTrap,
} from '../../src/orchestra/spawn-backend-docker.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
});

function freshTmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-exitmarker-'));
  tmpDirs.push(d);
  return d;
}

/** Extract the `cat > "$RFILE" <<MARKER ... MARKER` heredoc block from a trap script. */
function extractHeredocBlock(script: string, marker: string): string {
  const lines = script.split('\n');
  const startIdx = lines.findIndex((l) => l.includes(`<<${marker}`));
  if (startIdx === -1) throw new Error(`heredoc start <<${marker} not found`);
  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === marker) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) throw new Error(`heredoc terminator ${marker} not found`);
  return lines.slice(startIdx, endIdx + 1).join('\n');
}

/**
 * Run the generated NORESULTEOF heredoc with controlled shell vars and return the
 * JSON it emits. Proves the real template produces valid sh + valid JSON.
 */
async function runMarkerHeredoc(vars: {
  workPresent: boolean;
  diffStat: string;
  hbStatus: string;
  hbSeq: number;
  exitCode: number;
  signalInfo: string;
}): Promise<Record<string, unknown>> {
  const dir = freshTmp();
  const rfile = join(dir, 'out.result');
  const scriptPath = join(dir, 'run.sh');
  const heredoc = extractHeredocBlock(buildOnExitTrap('rt-001', 'opus'), 'NORESULTEOF');
  const script = [
    `work_present=${vars.workPresent ? 'true' : 'false'}`,
    `diff_stat=${JSON.stringify(vars.diffStat)}`,
    `hb_status=${JSON.stringify(vars.hbStatus)}`,
    `hb_seq=${vars.hbSeq}`,
    `exit_code=${vars.exitCode}`,
    `signal_info_nw=${JSON.stringify(vars.signalInfo)}`,
    `RFILE=${JSON.stringify(rfile)}`,
    heredoc,
  ].join('\n');
  writeFileSync(scriptPath, script, { mode: 0o755 });
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn('sh', [scriptPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`sh exited ${code}: ${stderr}`));
    });
  });
  return JSON.parse(readFileSync(rfile, 'utf-8')) as Record<string, unknown>;
}

// ─── 1. buildExitWithoutResultMarker — pure shape ────────────────────────────

describe('buildExitWithoutResultMarker', () => {
  it('emits the canonical EXIT_WITHOUT_RESULT fields (NO_GO + tokenUsage 4 fields)', () => {
    const m = buildExitWithoutResultMarker({ taskId: '272-003', model: 'opus', exitCode: 0, workPresent: true });
    expect(m.taskId).toBe('272-003');
    expect(m.workerId).toBe('docker-272-003');
    expect(m.selfAssessment).toBe('NO_GO');
    expect(m.markerType).toBe('EXIT_WITHOUT_RESULT');
    expect(m.exitCode).toBe(0);
    expect(m.filesChanged).toEqual([]);
    expect(m.tokenUsage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      provider: 'claude',
      model: 'opus',
    });
    // Preserve the classifier-matched phrase so existing note routing still works.
    // Host-path helper keeps the lowercase `code=` form (wrapper uses `exitCode=`).
    expect(m.notes).toContain('Worker exited without writing result');
    expect(m.notes).toContain('code=0');
  });

  it('workPresent=true → flag set + verify-and-complete hint in notes', () => {
    const m = buildExitWithoutResultMarker({
      taskId: 't1', model: 'sonnet', exitCode: 0, workPresent: true,
      diffStat: '3 files changed, 40 insertions(+)',
    });
    expect(m.workPresent).toBe(true);
    expect(m.diffStat).toBe('3 files changed, 40 insertions(+)');
    expect(m.notes).toContain('verify-and-complete');
    expect(m.notes).toContain('workPresent=true');
  });

  it('workPresent=false → flag clear + "nothing to recover" note (work-absent case)', () => {
    const m = buildExitWithoutResultMarker({ taskId: 't2', model: 'haiku', exitCode: 0, workPresent: false });
    expect(m.workPresent).toBe(false);
    expect(m.diffStat).toBe('');
    expect(m.notes).toContain('workPresent=false');
    expect(m.notes).toContain('nothing to recover');
  });

  it('trims diffStat and defaults last-hb fields to unknown/0', () => {
    const withHb = buildExitWithoutResultMarker({
      taskId: 't3', model: 'opus', exitCode: 0, workPresent: true,
      diffStat: '   2 files changed   ', lastHbStatus: 'EXECUTING', lastHbSequence: 17,
    });
    expect(withHb.diffStat).toBe('2 files changed');
    expect(withHb.lastHbStatus).toBe('EXECUTING');
    expect(withHb.lastHbSequence).toBe(17);

    const noHb = buildExitWithoutResultMarker({ taskId: 't3b', model: 'opus', exitCode: 0, workPresent: false });
    expect(noHb.lastHbStatus).toBe('unknown');
    expect(noHb.lastHbSequence).toBe(0);
  });

  it('exitCode>128 surfaces signal info; source defaults to host', () => {
    const m = buildExitWithoutResultMarker({ taskId: 't4', model: 'opus', exitCode: 137, workPresent: false });
    expect(m.exitCode).toBe(137);
    expect(m.notes).toContain('signal=9');
    expect(m.notes).toContain('source=host');
    // host-fallback note must still contain "code=137" (docker-exit-reproducer guard)
    expect(m.notes).toContain('code=137');
  });

  it('source=wrapper is reflected in notes when provided', () => {
    const m = buildExitWithoutResultMarker({
      taskId: 't5', model: 'opus', exitCode: 0, workPresent: true, source: 'wrapper',
    });
    expect(m.notes).toContain('source=wrapper');
  });
});

// ─── 2. buildOnExitTrap — shell string content ───────────────────────────────

describe('buildOnExitTrap', () => {
  const trap = buildOnExitTrap('abc-001', 'opus');

  it('adds the last-chance flush window (5×1s re-check before synthesizing a marker)', () => {
    expect(trap).toContain('lc_wait=0');
    expect(trap).toContain('"$lc_wait" -lt 5');
    expect(trap).toContain('sleep 1');
  });

  it('writes the enriched EXIT_WITHOUT_RESULT marker with discriminator fields', () => {
    expect(trap).toContain('EXIT_WITHOUT_RESULT');
    expect(trap).toContain('"workPresent":$work_present');
    expect(trap).toContain('"diffStat":"$diff_stat"');
    expect(trap).toContain('"lastHbStatus":"$hb_status"');
    expect(trap).toContain('"lastHbSequence":$hb_seq');
    expect(trap).toContain('git diff --shortstat');
    // last hb pulled from the heartbeat file
    expect(trap).toContain('"sequence":');
    expect(trap).toContain('"status":"');
  });

  it('preserves the TIMEOUT_WITH_WORK regression surface (timeout-with-work guard)', () => {
    expect(trap).toContain('on_exit()');
    expect(trap).toContain('git diff --name-only');
    expect(trap).toContain('TIMEOUT_WITH_WORK');
    expect(trap).toContain('if [ -f "$RFILE" ]; then');
    expect(trap).toContain('"selfAssessment":"NO_GO"');
    // .result-exists fast path returns without overwriting
    expect(trap).toContain('return');
  });
});

// ─── 3. Real sh run of the generated marker heredoc (proof-of-function) ───────

describe('buildOnExitTrap — NORESULTEOF heredoc emits valid JSON', () => {
  it('work-present run → valid JSON marker with workPresent=true and passthrough fields', async () => {
    const json = await runMarkerHeredoc({
      workPresent: true,
      diffStat: '3 files changed, 45 insertions(+), 2 deletions(-)',
      hbStatus: 'DONE',
      hbSeq: 42,
      exitCode: 0,
      signalInfo: '',
    });
    expect(json.selfAssessment).toBe('NO_GO');
    expect(json.markerType).toBe('EXIT_WITHOUT_RESULT');
    expect(json.workPresent).toBe(true);
    expect(json.diffStat).toBe('3 files changed, 45 insertions(+), 2 deletions(-)');
    expect(json.lastHbStatus).toBe('DONE');
    expect(json.lastHbSequence).toBe(42);
    expect(json.taskId).toBe('rt-001');
    expect(json.exitCode).toBe(0);
    expect((json.tokenUsage as Record<string, unknown>).model).toBe('opus');
    expect(json.notes).toContain('exited without writing result (exitCode=0');
  });

  it('work-absent run → valid JSON marker with workPresent=false and empty diffStat', async () => {
    const json = await runMarkerHeredoc({
      workPresent: false,
      diffStat: '',
      hbStatus: 'unknown',
      hbSeq: 0,
      exitCode: 0,
      signalInfo: '',
    });
    expect(json.workPresent).toBe(false);
    expect(json.diffStat).toBe('');
    expect(json.markerType).toBe('EXIT_WITHOUT_RESULT');
    expect(json.selfAssessment).toBe('NO_GO');
  });
});
