// Tests for Task 166-005: docs.json schema validation + identityRegen deprecation
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname ?? __dirname, '..', '..');

// ─── Pure-adapter law regression (ADR-G-004 / DOCS-PURE-ADAPTER) ─────────
// Host instruction files are pure adapters (only the injected @DECKENT.md
// reference + the user's own content). They must NEVER be managed-docs — no
// sprint render, metric table, debt table, or agent-performance section is
// stamped into them. Deckent's volatile orchestration status lives ONLY in
// deckent-owned surfaces (.brain/exports/summary.md, dashboard, `deckent
// status`). This regression asserts none of the four adapter targets appear
// in the live docs.json OR the seed template that propagates to new projects.
// (Supersedes the former "agents-md must be present" assertion — that entry
// was the locale-leak root ADR-G-004 removes.)
const ADAPTER_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursor/rules/deckent.mdc'];

function readDocsConfig(relPath: string): Array<{ id: string; path: string }> {
  const raw = readFileSync(join(PROJECT_ROOT, ...relPath.split('/')), 'utf-8');
  const parsed = JSON.parse(raw) as { docs: Array<{ id: string; path: string }> };
  return parsed.docs;
}

describe('pure-adapter law: host files are NOT managed-docs (ADR-G-004)', () => {
  it('live .deckent/settings/docs.json lists no host adapter file', () => {
    const docs = readDocsConfig('.deckent/settings/docs.json');
    for (const f of ADAPTER_FILES) {
      expect(docs.find(d => d.path === f), `${f} must not be a managed-doc (pure-adapter law)`).toBeUndefined();
    }
    // Belt-and-suspenders: the legacy IDs must be gone too.
    expect(docs.find(d => d.id === 'claude-md')).toBeUndefined();
    expect(docs.find(d => d.id === 'agents-md')).toBeUndefined();
  });

  it('seed docs.json.template propagates no host adapter file to new projects', () => {
    const docs = readDocsConfig('src/cli/commands/init-templates/docs.json.template');
    for (const f of ADAPTER_FILES) {
      expect(docs.find(d => d.path === f), `${f} must not seed into new projects (pure-adapter law)`).toBeUndefined();
    }
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
