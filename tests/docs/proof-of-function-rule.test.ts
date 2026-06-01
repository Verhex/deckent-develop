import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const WORKER_DEFAULT = join(ROOT, '.claude', 'rules', 'worker-default.md');

describe('Proof-of-Function rule in worker-default.md', () => {
  it('proof-of-function section exists in worker-default.md', () => {
    expect(existsSync(WORKER_DEFAULT)).toBe(true);
    const content = readFileSync(WORKER_DEFAULT, 'utf-8');
    expect(content).toMatch(/proof-of-function|Proof-of-Function/i);
    expect(content).toMatch(/Tier-1|user-surface/i);
  });

  it('Smoke directive requirement is documented', () => {
    const content = readFileSync(WORKER_DEFAULT, 'utf-8');
    expect(content).toMatch(/Smoke:/);
    expect(content).toMatch(/run-proven/i);
  });

  it('mock-only → GO_WITH_TECH_DEBT downgrade is documented', () => {
    const content = readFileSync(WORKER_DEFAULT, 'utf-8');
    expect(content).toMatch(/mock-only.*GO_WITH_TECH_DEBT|GO_WITH_TECH_DEBT.*mock-only/i);
  });

  it('section references karpathy-discipline.md for full spec', () => {
    const content = readFileSync(WORKER_DEFAULT, 'utf-8');
    expect(content).toMatch(/karpathy-discipline/i);
  });
});
