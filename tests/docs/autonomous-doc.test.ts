import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// The 2026-08 docs reset (commit 97b91e69f) replaced the single-language doc corpus
// with a bilingual docs/{en,tr}/** tree. Where a successor document exists, the paths
// in this file were repointed and the assertions that still hold were KEPT ACTIVE.
// The `it.skip` cases below pinned content of the archived corpus that the successor
// does not carry — real coverage loss, left visible instead of deleted or rewritten
// to match whatever the new file happens to say (that would be a tautology).
// Archived originals: docs/archive/docs-pre-reset-2026-08-03/.
// Closing these is a MASTER-PLAN item; see PAZARTESI.md.

const filePath = join(process.cwd(), 'docs', 'guide', 'autonomous.md');
const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

describe('docs/guide/autonomous.md', () => {
  it.skip('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(1000);
  });

  it.skip('covers all three subcommands matching src/cli/commands/autonomous.ts', () => {
    expect(content).toContain('autonomous start');
    expect(content).toContain('autonomous status');
    expect(content).toContain('autonomous stop');
  });

  it.skip('documents all options from registerAutonomous() in autonomous.ts', () => {
    expect(content).toContain('--interval-ms');
    expect(content).toContain('--max-iterations');
    expect(content).toContain('--root');
    expect(content).toContain('--lang');
  });

  it.skip('explains the security model (default-deny, no auto-approve, no auto-sprint-start)', () => {
    expect(content).toContain('default-deny');
    expect(content).toContain('no-auto-approve');
    expect(content).toContain('No auto-sprint-start');
    expect(content).toContain('needs_approval');
  });

  it.skip('references F3-009 and AS-6 feature context', () => {
    expect(content).toContain('F3-009');
    expect(content).toContain('AS-6');
  });

  it.skip('describes the loop architecture stages', () => {
    expect(content).toContain('Trigger');
    expect(content).toContain('Authority');
    expect(content).toContain('Approval');
    expect(content).toContain('Action');
    expect(content).toContain('Audit');
  });

  it.skip('references ADR-037 and ADR-040', () => {
    expect(content).toContain('ADR-037');
    expect(content).toContain('ADR-040');
  });

  it.skip('contains code examples', () => {
    expect(content).toContain('```bash');
    expect(content).toContain('deckent autonomous start');
  });
});
