import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const filePath = join(process.cwd(), 'docs', 'guide', 'autonomous.md');
const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

describe('docs/guide/autonomous.md', () => {
  it('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(1000);
  });

  it('covers all three subcommands matching src/cli/commands/autonomous.ts', () => {
    expect(content).toContain('autonomous start');
    expect(content).toContain('autonomous status');
    expect(content).toContain('autonomous stop');
  });

  it('documents all options from registerAutonomous() in autonomous.ts', () => {
    expect(content).toContain('--interval-ms');
    expect(content).toContain('--max-iterations');
    expect(content).toContain('--root');
    expect(content).toContain('--lang');
  });

  it('explains the security model (default-deny, no auto-approve, no auto-sprint-start)', () => {
    expect(content).toContain('default-deny');
    expect(content).toContain('no-auto-approve');
    expect(content).toContain('No auto-sprint-start');
    expect(content).toContain('needs_approval');
  });

  it('references F3-009 and AS-6 feature context', () => {
    expect(content).toContain('F3-009');
    expect(content).toContain('AS-6');
  });

  it('describes the loop architecture stages', () => {
    expect(content).toContain('Trigger');
    expect(content).toContain('Authority');
    expect(content).toContain('Approval');
    expect(content).toContain('Action');
    expect(content).toContain('Audit');
  });

  it('references ADR-037 and ADR-040', () => {
    expect(content).toContain('ADR-037');
    expect(content).toContain('ADR-040');
  });

  it('contains code examples', () => {
    expect(content).toContain('```bash');
    expect(content).toContain('deckent autonomous start');
  });
});
