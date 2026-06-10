import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd());

const ADAPTERS = ['.claude', '.codex', '.gemini'] as const;

function readRule(adapter: string, file: string): string {
  const path = join(ROOT, adapter, 'rules', file);
  if (!existsSync(path)) throw new Error(`Missing: ${adapter}/rules/${file}`);
  return readFileSync(path, 'utf-8');
}

// Critical sections that every worker-default.md must contain (section-presence check)
const WORKER_DEFAULT_SECTIONS = [
  { key: 'Karpathy 4-Discipline Anchor', pattern: /Karpathy 4-Discipline Anchor/i },
  { key: 'Proof-of-Function', pattern: /Proof-of-Function/i },
  { key: 'CUSTOM-START marker', pattern: /<!--\s*CUSTOM-START\s*-->/ },
  { key: 'CUSTOM-END marker', pattern: /<!--\s*CUSTOM-END\s*-->/ },
  { key: 'Test Hermeticity reference (karpathy-discipline.md)', pattern: /karpathy-discipline/i },
];

// Critical sections that every karpathy-discipline.md must contain
const KARPATHY_SECTIONS = [
  { key: 'Discipline 1 — Think Before Coding', pattern: /Think Before Coding/i },
  { key: 'Discipline 2 — Simplicity First', pattern: /Simplicity First/i },
  { key: 'Discipline 3 — Surgical Changes', pattern: /Surgical Changes/i },
  { key: 'Discipline 4 — Goal-Driven Execution', pattern: /Goal-Driven Execution/i },
  { key: 'CUSTOM Test Hermeticity section', pattern: /CUSTOM\s*[—–-]\s*Test Hermeticity/i },
  { key: 'Quick Reference Checklist', pattern: /Quick Reference Checklist/i },
];

describe('rules-parity: worker-default.md — critical sections across all adapters', () => {
  for (const adapter of ADAPTERS) {
    describe(`${adapter}/rules/worker-default.md`, () => {
      it('file exists', () => {
        expect(existsSync(join(ROOT, adapter, 'rules', 'worker-default.md'))).toBe(true);
      });

      for (const section of WORKER_DEFAULT_SECTIONS) {
        it(`contains "${section.key}"`, () => {
          const content = readRule(adapter, 'worker-default.md');
          expect(content).toMatch(section.pattern);
        });
      }
    });
  }
});

describe('rules-parity: karpathy-discipline.md — critical sections across all adapters', () => {
  for (const adapter of ADAPTERS) {
    describe(`${adapter}/rules/karpathy-discipline.md`, () => {
      it('file exists', () => {
        expect(existsSync(join(ROOT, adapter, 'rules', 'karpathy-discipline.md'))).toBe(true);
      });

      for (const section of KARPATHY_SECTIONS) {
        it(`contains "${section.key}"`, () => {
          const content = readRule(adapter, 'karpathy-discipline.md');
          expect(content).toMatch(section.pattern);
        });
      }
    });
  }
});
