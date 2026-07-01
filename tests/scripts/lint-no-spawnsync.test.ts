// Tests for scripts/lint-no-spawnsync.mjs — the ADR-D-002 no-new-spawnSync ratchet
// + hot-path hard-block gate.

import { describe, it, expect } from 'vitest';
import {
  extractSpawnSyncCalls,
  diffAgainstBaseline,
  scanSource,
  loadBaseline,
  HOT_PATH_FILES,
} from '../../scripts/lint-no-spawnsync.mjs';

describe('extractSpawnSyncCalls', () => {
  it('detects a real spawnSync call', () => {
    const calls = extractSpawnSyncCalls(`const r = spawnSync('git', ['status']);`);
    expect(calls).toHaveLength(1);
    expect(calls[0].code).toContain("spawnSync('git'");
  });

  it('ignores the import line', () => {
    expect(extractSpawnSyncCalls(`import { spawnSync } from 'node:child_process';`)).toHaveLength(0);
    expect(extractSpawnSyncCalls(`  spawnSync,\n} from 'node:child_process';`)).toHaveLength(0);
  });

  it('detects a namespace/method call (import * as cp) — the evasion the ratchet must catch', () => {
    expect(extractSpawnSyncCalls(`const r = cp.spawnSync('curl', [url]);`)).toHaveLength(1);
    expect(extractSpawnSyncCalls(`child_process.spawnSync('git', []);`)).toHaveLength(1);
  });

  it('does NOT match unrelated identifiers ending in SpawnSync (capital S)', () => {
    expect(extractSpawnSyncCalls(`nodeSpawnSync('x', []);`)).toHaveLength(0);
    expect(extractSpawnSyncCalls(`mySpawnSync('x', []);`)).toHaveLength(0);
  });

  it('ignores comment lines', () => {
    expect(extractSpawnSyncCalls(`// uses spawnSync('docker', ...) here`)).toHaveLength(0);
    expect(extractSpawnSyncCalls(` * never spawnSync() in a loop`)).toHaveLength(0);
  });

  it('ignores the ADR-G-002 detection-pattern string (data, not a call)', () => {
    expect(extractSpawnSyncCalls(`pattern: 'spawnSync.*shell.*true',`)).toHaveLength(0);
    expect(extractSpawnSyncCalls(`const re = /spawnSync\\s*\\(/;`)).toHaveLength(0);
  });

  it('counts multiple distinct calls in one file', () => {
    const src = `spawnSync('a', []);\nfoo();\nspawnSync('b', []);`;
    expect(extractSpawnSyncCalls(src)).toHaveLength(2);
  });
});

describe('diffAgainstBaseline', () => {
  const baseline = {
    sanctioned: [{ file: 'src/core/x.ts', code: "spawnSync('git', ['a']);" }],
    hotPathDebt: [{ file: 'src/monitor/auditor.ts', code: "spawnSync('docker', ['ps']);", owner: 'ADR-087-W' }],
  };

  it('passes when the scan equals the baseline', () => {
    const scan = {
      sanctionedFound: [{ file: 'src/core/x.ts', code: "spawnSync('git', ['a']);" }],
      hotPathFound: [{ file: 'src/monitor/auditor.ts', code: "spawnSync('docker', ['ps']);" }],
    };
    expect(diffAgainstBaseline(scan, baseline).newCalls).toHaveLength(0);
  });

  it('flags a NEW non-hot-path spawnSync', () => {
    const scan = {
      sanctionedFound: [
        { file: 'src/core/x.ts', code: "spawnSync('git', ['a']);" },
        { file: 'src/core/new.ts', code: "spawnSync('curl', [u]);" },
      ],
      hotPathFound: [{ file: 'src/monitor/auditor.ts', code: "spawnSync('docker', ['ps']);" }],
    };
    const { newCalls } = diffAgainstBaseline(scan, baseline);
    expect(newCalls).toHaveLength(1);
    expect(newCalls[0].hotPath).toBe(false);
    expect(newCalls[0].file).toBe('src/core/new.ts');
  });

  it('flags a NEW hot-path spawnSync and attaches its owner', () => {
    const scan = {
      sanctionedFound: [{ file: 'src/core/x.ts', code: "spawnSync('git', ['a']);" }],
      hotPathFound: [
        { file: 'src/monitor/auditor.ts', code: "spawnSync('docker', ['ps']);" },
        { file: 'src/monitor/auditor.ts', code: "spawnSync('git', ['newcmd']);" },
      ],
    };
    const { newCalls } = diffAgainstBaseline(scan, baseline);
    expect(newCalls).toHaveLength(1);
    expect(newCalls[0].hotPath).toBe(true);
    expect(newCalls[0].owner).toContain('ADR-087-W');
  });

  it('is count-based — a second identical call beyond the baseline count is NEW', () => {
    const scan = {
      sanctionedFound: [
        { file: 'src/core/x.ts', code: "spawnSync('git', ['a']);" },
        { file: 'src/core/x.ts', code: "spawnSync('git', ['a']);" }, // duplicated
      ],
      hotPathFound: [{ file: 'src/monitor/auditor.ts', code: "spawnSync('docker', ['ps']);" }],
    };
    expect(diffAgainstBaseline(scan, baseline).newCalls).toHaveLength(1);
  });
});

describe('HOT_PATH_FILES owners are honest', () => {
  it('auditor is owned by ADR-087-W; the spawn backends + probes by the born-item', () => {
    expect(HOT_PATH_FILES['src/monitor/auditor.ts']).toContain('ADR-087-W');
    for (const f of [
      'src/orchestra/spawn-backend-docker.ts',
      'src/orchestra/tmux.ts',
      'src/orchestra/worker-liveness.ts',
      'src/orchestra/monitor-adapter.ts',
      'src/core/output-collector.ts',
    ] as const) {
      expect(HOT_PATH_FILES[f], `${f} owner`).toContain('HOTPATH-SPAWN-ASYNC');
    }
  });
});

describe('live baseline is in sync (the committed gate is green)', () => {
  it('the checked-in baseline has no new spawnSync vs the live source tree', () => {
    // Regression: if a dev adds a spawnSync without --update, or the baseline
    // drifts, this fails here (mirroring `npm run lint:spawnsync`).
    const { newCalls } = diffAgainstBaseline(scanSource(), loadBaseline());
    expect(newCalls, `new spawnSync sites: ${JSON.stringify(newCalls)}`).toHaveLength(0);
  });
});
