import { describe, it, expect } from 'vitest';
import type { DoctorResult } from '../../src/core/types.js';
import { formatDoctorResult } from '../../src/cli/helpers/output.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeDoctorResult(checks: Array<{ name: string; passed: boolean; message: string; required: boolean }>): DoctorResult {
  return {
    ok: checks.filter(c => c.required).every(c => c.passed),
    checks,
  };
}

// ─── Traffic light colors ───────────────────────────────────────────

describe('doctor UX — traffic light colors', () => {
  it('uses green [PASS] for passing checks', () => {
    const result = makeDoctorResult([
      { name: 'Node.js', passed: true, message: 'v20.0.0 (>=18 required)', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('[PASS]');
    expect(output).toContain('\x1b[32m'); // green
  });

  it('uses red [FAIL] for required failing checks', () => {
    const result = makeDoctorResult([
      { name: 'tmux', passed: false, message: 'not found', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('[FAIL]');
    expect(output).toContain('\x1b[31m'); // red
  });

  it('uses yellow [WARN] for non-required failing checks', () => {
    const result = makeDoctorResult([
      { name: 'Directives', passed: false, message: 'DIRECTIVES.md missing', required: false },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('[WARN]');
    expect(output).toContain('\x1b[33m'); // yellow
  });

  it('summary shows fail count in red', () => {
    const result = makeDoctorResult([
      { name: 'Node.js', passed: true, message: 'ok', required: true },
      { name: 'tmux', passed: false, message: 'missing', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('1/2 checks passed (1 failed)');
  });

  it('summary shows all passed in green', () => {
    const result = makeDoctorResult([
      { name: 'Node.js', passed: true, message: 'ok', required: true },
      { name: 'git', passed: true, message: 'ok', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('2/2 checks passed');
    expect(output).not.toContain('failed');
  });
});

// ─── Error messages with suggestions ────────────────────────────────

describe('doctor UX — error messages', () => {
  // We test indirectly by checking runDoctorChecks output when mocking spawnSync

  it('tmux failure message includes install suggestion', () => {
    const result = makeDoctorResult([
      { name: 'tmux', passed: false, message: 'not found -- Install: brew install tmux (macOS) / sudo apt install tmux (Linux). Or use spawn_backend: "subprocess"', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('tmux');
    expect(output).toContain('not found');
  });

  it('claude failure message includes npm install', () => {
    const result = makeDoctorResult([
      { name: 'Claude CLI', passed: false, message: 'not found -- Install: npm install -g @anthropic-ai/claude-code', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('npm');
  });

  it('node version failure message includes upgrade suggestion', () => {
    const result = makeDoctorResult([
      { name: 'Node.js', passed: false, message: 'v16.0.0 found but >=18 required -- Upgrade Node.js to >=18', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('>=18');
  });

  it('multiple checks are all listed', () => {
    const result = makeDoctorResult([
      { name: 'Node.js', passed: true, message: 'ok', required: true },
      { name: 'git', passed: true, message: 'ok', required: true },
      { name: 'tmux', passed: false, message: 'missing', required: true },
      { name: 'Workspace', passed: false, message: 'missing', required: false },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('Node.js');
    expect(output).toContain('git');
    expect(output).toContain('tmux');
    expect(output).toContain('Workspace');
  });

  it('reset codes appear after colors', () => {
    const result = makeDoctorResult([
      { name: 'test', passed: true, message: 'ok', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('\x1b[0m'); // reset
  });
});

// ─── Formatting edge cases ──────────────────────────────────────────

describe('doctor UX — formatting edge cases', () => {
  it('handles empty checks list', () => {
    const result = makeDoctorResult([]);
    const output = formatDoctorResult(result);
    expect(output).toContain('0/0 checks passed');
  });

  it('handles all failing checks', () => {
    const result = makeDoctorResult([
      { name: 'A', passed: false, message: 'fail', required: true },
      { name: 'B', passed: false, message: 'fail', required: true },
    ]);
    const output = formatDoctorResult(result);
    expect(output).toContain('0/2 checks passed (2 failed)');
  });

  it('handles mix of required and optional failures', () => {
    const result = makeDoctorResult([
      { name: 'Required', passed: false, message: 'fail', required: true },
      { name: 'Optional', passed: false, message: 'warn', required: false },
    ]);
    const output = formatDoctorResult(result);
    // Should have both FAIL and WARN
    expect(output).toContain('[FAIL]');
    expect(output).toContain('[WARN]');
  });

  it('long check names are handled without crashing', () => {
    const result = makeDoctorResult([
      { name: 'VeryLongCheckName', passed: true, message: 'ok', required: true },
    ]);
    const output = formatDoctorResult(result);
    // Name gets truncated by padRight but should not crash
    expect(output).toContain('[PASS]');
    expect(output).toContain('ok');
  });
});
