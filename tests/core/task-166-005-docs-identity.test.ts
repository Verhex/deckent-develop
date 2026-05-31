// Tests for Task 166-005: docs.json schema validation + identityRegen deprecation
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname ?? __dirname, '..', '..');

describe('docs.json schema validation (Bug R fix)', () => {
  it('contains AGENTS.md entry with correct autoSections and protectedSections', () => {
    const docsJsonPath = join(PROJECT_ROOT, '.deckent', 'docs.json');
    const raw = readFileSync(docsJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { docs: Array<{ id: string; path: string; autoSections: string[]; protectedSections: string[] }> };

    const agentsEntry = parsed.docs.find(d => d.id === 'agents-md');
    expect(agentsEntry, 'agents-md entry missing from .deckent/docs.json').toBeDefined();
    expect(agentsEntry!.path).toBe('AGENTS.md');
    // The auto-managed section list was narrowed to only `Agent Performance`
    // after `Built-in Agents` and `Last Updated` were folded into the static
    // protected portion of AGENTS.md. The protected-sections contract is the
    // load-bearing half of Bug R; assert it explicitly.
    expect(agentsEntry!.autoSections).toContain('Agent Performance');
    expect(agentsEntry!.protectedSections).toContain('Identity');
    expect(agentsEntry!.protectedSections).toContain('Architecture');
  });
});

describe('identityRegen deprecation (Bug T fix)', () => {
  it('PostFinalizeHookOptions.skipIdentityRegen is annotated as deprecated in source', () => {
    const srcPath = join(PROJECT_ROOT, 'src', 'core', 'identity-generator.ts');
    const src = readFileSync(srcPath, 'utf-8');
    // The @deprecated annotation must appear near skipIdentityRegen
    const idx = src.indexOf('skipIdentityRegen');
    expect(idx).toBeGreaterThan(-1);
    // Look for @deprecated within 500 chars before the field declaration
    const context = src.slice(Math.max(0, idx - 500), idx + 100);
    expect(context).toContain('@deprecated');
  });
});
