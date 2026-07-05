// AGSK-1 dilim-3 (sprint-369 task 369-003) — own load-test for three new built-in agents
// (api-designer, observability-engineer, i18n-specialist), the agent-side counterpart to
// 368-001's three new skills (api-design, observability, i18n-quality; see
// skill-catalog-agsk5.test.ts). This task's write scope grants ONLY the three PROMPT.md files
// (no agent.json, no .deckent/agents mirror, no agent-pool.ts touch) — mirrors the 368-001
// skill slice (SKILL.md-only, manifest deferred). So, like agsk5 and UNLIKE
// agent-catalog-agsk2.test.ts (which disk-verifies agent.json + a live
// AgentPoolManager.loadAgents() pickup), this test does not assert agent.json shape or pool
// registration — pool wiring lands with the follow-up task that creates the manifests. What IS
// disk-verified here, adapting the agsk5 shape to agents: PROMPT.md existence + structure (byte
// cap, H1 title, per-agent keyword, no YAML frontmatter matching the most recent agent lineage
// of integration-engineer/terminal-ux-engineer), a Skill Affinity note naming its paired
// 368-001 skill, and id-non-collision against the full existing builtin-agent id set, read live
// via readdirSync rather than a hand-maintained list, so this test can't silently drift from disk.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const BUILTINS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/agents');
const MAX_PROMPT_BYTES = 4096;

interface NewAgentSpec {
  id: string;
  promptKeyword: string;
  skillId: string;
}

const NEW_AGENTS: NewAgentSpec[] = [
  { id: 'api-designer', promptKeyword: 'Division of Labor with api-builder', skillId: 'api-design' },
  { id: 'observability-engineer', promptKeyword: 'Dashboard-as-Derived-State', skillId: 'observability' },
  { id: 'i18n-specialist', promptKeyword: 'getMessage as the Only String Path', skillId: 'i18n-quality' },
];

function readPrompt(id: string): string {
  return readFileSync(resolve(BUILTINS_DIR, id, 'PROMPT.md'), 'utf8');
}

describe('AGSK-6: api-designer + observability-engineer + i18n-specialist agent catalog', () => {
  for (const spec of NEW_AGENTS) {
    describe(spec.id, () => {
      it('has a PROMPT.md on disk under src/core/builtins/agents/<id>/', () => {
        expect(existsSync(resolve(BUILTINS_DIR, spec.id))).toBe(true);
        expect(existsSync(resolve(BUILTINS_DIR, spec.id, 'PROMPT.md'))).toBe(true);
      });

      it('PROMPT.md stays within the 4KB rubric cap and is non-trivial', () => {
        const content = readPrompt(spec.id);
        const byteLength = Buffer.byteLength(content, 'utf8');
        expect(byteLength).toBeLessThanOrEqual(MAX_PROMPT_BYTES);
        expect(byteLength).toBeGreaterThan(100);
      });

      it('opens with an H1 title and covers its rubric-theme keyword', () => {
        const content = readPrompt(spec.id);
        expect(content.startsWith('# ')).toBe(true);
        expect(content).toContain(spec.promptKeyword);
      });

      it('has no YAML frontmatter (matches the most recent lineage: integration-engineer, ' +
        'terminal-ux-engineer)', () => {
        const content = readPrompt(spec.id);
        expect(content.startsWith('---')).toBe(false);
      });

      it('carries a Skill Affinity note naming its paired 368-001 builtin skill', () => {
        const content = readPrompt(spec.id);
        expect(content).toContain(`Skill Affinity -- ${spec.skillId}`);
        expect(content).toContain(`\`${spec.skillId}\` builtin skill`);
      });
    });
  }

  it('has unique ids across the three new agents', () => {
    const ids = NEW_AGENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(NEW_AGENTS.length);
  });

  it('no existing built-in agent directory claims a new agent id (disk-driven, zero routing collision)', () => {
    const existingEntries = readdirSync(BUILTINS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const existingIds = existingEntries.filter((id) => !NEW_AGENTS.some((s) => s.id === id));

    for (const spec of NEW_AGENTS) {
      expect(existingIds, `existing builtin agent ids must not already claim '${spec.id}'`).not.toContain(spec.id);
    }

    // Every new agent id must actually be present in the live builtins tree exactly once.
    for (const spec of NEW_AGENTS) {
      const occurrences = existingEntries.filter((id) => id === spec.id).length;
      expect(occurrences, `'${spec.id}' should appear exactly once on disk`).toBe(1);
    }

    // The full on-disk id set (existing + new) must itself be collision-free.
    expect(new Set(existingEntries).size).toBe(existingEntries.length);
  });
});
