/**
 * i18n-hardcode-cleanup.test.ts
 * Verifies that the three sets of strings migrated in Task 333-010 are:
 *  (a) present in messages.ts for both 'en' and 'tr' with non-empty, distinct values
 *  (b) no longer hardcoded in doctor-checks.ts, evolve.ts, or sync.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMessage } from '../../src/cli/helpers/messages.js';

const ROOT = resolve(process.cwd());

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

// ─── doctor.daemon_* keys ────────────────────────────────────────────────────

describe('doctor.daemon_* keys in messages.ts', () => {
  const daemonKeys = [
    'doctor.daemon_header',
    'doctor.daemon_clean',
    'doctor.daemon_found',
    'doctor.daemon_entry',
    'doctor.daemon_kill_hint',
    'doctor.daemon_unsupported',
    'doctor.daemon_check_failed',
  ] as const;

  for (const key of daemonKeys) {
    it(`${key} resolves to non-empty en string`, () => {
      const en = getMessage(key, 'en');
      expect(en).toBeTruthy();
      expect(en).not.toBe(key);
    });

    it(`${key} resolves to non-empty tr string distinct from en`, () => {
      const en = getMessage(key, 'en');
      const tr = getMessage(key, 'tr');
      expect(tr).toBeTruthy();
      expect(tr).not.toBe(key);
      expect(tr).not.toBe(en);
    });
  }

  it('doctor.daemon_header en equals prior literal', () => {
    expect(getMessage('doctor.daemon_header', 'en')).toBe('Daemon Hygiene:');
  });

  it('doctor.daemon_clean en equals prior literal', () => {
    expect(getMessage('doctor.daemon_clean', 'en')).toBe('No stale deckent daemons detected.');
  });

  it('doctor.daemon_found en equals prior literal (interpolated)', () => {
    const result = getMessage('doctor.daemon_found', 'en', { count: '2' });
    expect(result).toBe('2 stale deckent daemon(s) detected (advisory — deckent never auto-kills):');
  });

  it('doctor.daemon_entry en equals prior literal (interpolated)', () => {
    const result = getMessage('doctor.daemon_entry', 'en', { pid: '12345', kind: 'brain', age: '2h 5m' });
    expect(result).toBe('PID 12345 — brain, running for 2h 5m');
  });

  it('doctor.daemon_kill_hint en equals prior literal (interpolated)', () => {
    const result = getMessage('doctor.daemon_kill_hint', 'en', { killCmd: 'kill 123', winKillCmd: 'taskkill /F /PID 123' });
    expect(result).toBe('To stop them, run: kill 123   (Windows: taskkill /F /PID 123)');
  });
});

// ─── evolve.* keys ────────────────────────────────────────────────────────────

describe('evolve.* keys in messages.ts', () => {
  const evolveKeys = [
    'evolve.no_sprint_data',
    'evolve.report_header',
    'evolve.nogo_trend',
    'evolve.agent_trends',
    'evolve.skill_trends',
  ] as const;

  for (const key of evolveKeys) {
    it(`${key} resolves to non-empty en string`, () => {
      const en = getMessage(key, 'en');
      expect(en).toBeTruthy();
      expect(en).not.toBe(key);
    });

    it(`${key} resolves to non-empty tr string distinct from en`, () => {
      const en = getMessage(key, 'en');
      const tr = getMessage(key, 'tr');
      expect(tr).toBeTruthy();
      expect(tr).not.toBe(key);
      expect(tr).not.toBe(en);
    });
  }

  it('evolve.no_sprint_data en matches prior literal', () => {
    expect(getMessage('evolve.no_sprint_data', 'en')).toBe(
      'No sprint data found. Run some sprints first to see evolution trends.',
    );
  });

  it('evolve.report_header en matches prior template (interpolated)', () => {
    const result = getMessage('evolve.report_header', 'en', { count: '10' });
    expect(result).toBe('\nEvolution Report — 10 sprints analyzed\n');
  });

  it('evolve.nogo_trend en matches prior template (interpolated)', () => {
    const result = getMessage('evolve.nogo_trend', 'en', { icon: '↑', direction: 'improving' });
    expect(result).toBe('NO_GO trend: ↑ improving');
  });

  it('evolve.agent_trends en matches prior literal', () => {
    expect(getMessage('evolve.agent_trends', 'en')).toBe('Agent Trends:');
  });

  it('evolve.skill_trends en matches prior literal', () => {
    expect(getMessage('evolve.skill_trends', 'en')).toBe('Skill Trends:');
  });
});

// ─── sync.deckent_not_found key ───────────────────────────────────────────────

describe('sync.deckent_not_found key in messages.ts', () => {
  it('resolves to non-empty en string', () => {
    const en = getMessage('sync.deckent_not_found', 'en');
    expect(en).toBeTruthy();
    expect(en).not.toBe('sync.deckent_not_found');
  });

  it('resolves to non-empty tr string distinct from en', () => {
    const en = getMessage('sync.deckent_not_found', 'en');
    const tr = getMessage('sync.deckent_not_found', 'tr');
    expect(tr).toBeTruthy();
    expect(tr).not.toBe('sync.deckent_not_found');
    expect(tr).not.toBe(en);
  });

  it('en matches prior literal exactly', () => {
    expect(getMessage('sync.deckent_not_found', 'en')).toBe(
      'DECKENT.md not found. Run deckent init first.',
    );
  });
});

// ─── Hardcoded literal removal assertions ─────────────────────────────────────

describe('doctor-checks.ts no longer contains hardcoded daemon strings', () => {
  const src = readSrc('src/cli/commands/doctor-checks.ts');

  it('does not contain DAEMON_MESSAGES', () => {
    expect(src).not.toContain('DAEMON_MESSAGES');
  });

  it('does not contain daemonMsg function definition', () => {
    expect(src).not.toContain('function daemonMsg(');
  });

  it('does not contain hardcoded "Daemon Hygiene:" literal', () => {
    expect(src).not.toContain("'Daemon Hygiene:'");
    expect(src).not.toContain('"Daemon Hygiene:"');
  });

  it('does not contain hardcoded "No stale deckent daemons" literal', () => {
    expect(src).not.toContain('No stale deckent daemons');
  });

  it('uses getMessage for daemon strings', () => {
    expect(src).toContain("getMessage('doctor.daemon_header'");
  });
});

describe('evolve.ts no longer contains hardcoded evolution strings', () => {
  const src = readSrc('src/cli/commands/evolve.ts');

  it('does not contain hardcoded "No sprint data found" literal', () => {
    expect(src).not.toContain('No sprint data found');
  });

  it('does not contain hardcoded "Evolution Report —" string literal', () => {
    expect(src).not.toContain("'\\nEvolution Report —");
    expect(src).not.toContain('`\\nEvolution Report —');
    // The i18n key name itself is fine; only the runtime string must be gone
    expect(src).not.toMatch(/console\.log\(`\\nEvolution Report/);
  });

  it('does not contain hardcoded "Agent Trends:" literal', () => {
    expect(src).not.toContain("'Agent Trends:'");
    expect(src).not.toContain('"Agent Trends:"');
  });

  it('does not contain hardcoded "Skill Trends:" literal', () => {
    expect(src).not.toContain("'Skill Trends:'");
    expect(src).not.toContain('"Skill Trends:"');
  });

  it('uses getMessage for evolution strings', () => {
    expect(src).toContain("getMessage('evolve.no_sprint_data'");
    expect(src).toContain("getMessage('evolve.report_header'");
    expect(src).toContain("getMessage('evolve.agent_trends'");
    expect(src).toContain("getMessage('evolve.skill_trends'");
  });
});

describe('sync.ts no longer contains hardcoded DECKENT.md not found string', () => {
  const src = readSrc('src/cli/commands/sync.ts');

  it('does not contain hardcoded "DECKENT.md not found" literal', () => {
    expect(src).not.toContain("'DECKENT.md not found. Run deckent init first.'");
    expect(src).not.toContain('"DECKENT.md not found. Run deckent init first."');
  });

  it('uses getMessage for DECKENT.md not found string', () => {
    expect(src).toContain("getMessage('sync.deckent_not_found'");
  });
});
