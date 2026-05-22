// B12 — a fresh `deckent init` creates .deckent/workspace/IDENTITY.md, but
// without an `identity-md` managed-doc entry in docs.json the user's
// IDENTITY.md never auto-updates after sprints. The shipped template must
// include it so user projects get the same living-identity behavior as
// deckent-dev itself.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEMPLATE_PATH = join(
  process.cwd(), 'src/cli/commands/init-templates/docs.json.template',
);

interface DocEntry { id: string; path: string; autoSections?: string[]; protectedSections?: string[] }
interface DocsConfig { version: number; docs: DocEntry[] }

function loadTemplate(): DocsConfig {
  return JSON.parse(readFileSync(TEMPLATE_PATH, 'utf-8')) as DocsConfig;
}

describe('docs.json.template', () => {
  it('is valid JSON with version 1 and a docs array', () => {
    const tpl = loadTemplate();
    expect(tpl.version).toBe(1);
    expect(Array.isArray(tpl.docs)).toBe(true);
  });

  it('includes an identity-md managed-doc so user IDENTITY.md auto-updates', () => {
    const tpl = loadTemplate();
    const identityDoc = tpl.docs.find(d => d.id === 'identity-md');
    expect(identityDoc).toBeDefined();
    expect(identityDoc!.path).toBe('.deckent/workspace/IDENTITY.md');
    expect(identityDoc!.autoSections).toContain('Project Status');
  });
});
