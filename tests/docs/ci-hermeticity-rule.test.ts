import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RULE_PATH = join(process.cwd(), '.claude/rules/karpathy-discipline.md');

describe('CI-hermeticity rule in karpathy-discipline.md', () => {
  it('karpathy-discipline.md exists and contains a CUSTOM Test Hermeticity section', () => {
    expect(existsSync(RULE_PATH)).toBe(true);
    const content = readFileSync(RULE_PATH, 'utf-8');
    expect(content).toMatch(/##\s+CUSTOM\s*[—–-]\s*Test Hermeticity/i);
  });

  it('hermeticity keywords present: hermetic, tmpdir, gitignored (≥3 matches)', () => {
    const content = readFileSync(RULE_PATH, 'utf-8');
    const matches = (content.match(/hermetic|tmpdir|gitignored|fresh checkout|ci-sim/gi) || []);
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('ci-sim reference is present in the rule', () => {
    const content = readFileSync(RULE_PATH, 'utf-8');
    expect(content).toMatch(/ci-sim/i);
  });

  it('rule mentions ci-guardian agent and ci-testing skill for routing', () => {
    const content = readFileSync(RULE_PATH, 'utf-8');
    expect(content).toMatch(/ci-guardian/i);
    expect(content).toMatch(/ci-testing/i);
  });
});
