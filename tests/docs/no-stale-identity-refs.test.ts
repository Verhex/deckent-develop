import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CLI_REF = join(ROOT, 'docs', 'reference', 'cli.md');
const CLI_COMMANDS = join(ROOT, 'docs', 'reference', 'cli-commands.md');

function readDoc(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('no-stale-identity-refs: docs/reference/cli.md', () => {
  const content = readDoc(CLI_REF);

  it('(a) PROJECT-IDENTITY.md reference must be 0', () => {
    const matches = content.match(/PROJECT-IDENTITY/g);
    expect(matches).toBeNull();
  });

  it('(b) .deckent/workspace/IDENTITY.md is the correct replacement path', () => {
    expect(content).toContain('.deckent/workspace/IDENTITY.md');
  });

  it('(c) finalize description references memory.db (Memory V2)', () => {
    expect(content).toContain('memory.db');
  });
});

describe('no-stale-identity-refs: docs/reference/cli-commands.md', () => {
  const content = readDoc(CLI_COMMANDS);

  it('(a) PROJECT-IDENTITY.md reference must be 0', () => {
    const matches = content.match(/PROJECT-IDENTITY/g);
    expect(matches).toBeNull();
  });

  it('(b) .deckent/workspace/IDENTITY.md is the correct replacement path', () => {
    expect(content).toContain('.deckent/workspace/IDENTITY.md');
  });

  it('(c) finalize description references memory.db (Memory V2)', () => {
    expect(content).toContain('memory.db');
  });
});
