// 370-003 CATALOG-SYNC-PARITY — proof-only task for 368-001's three new built-in skills
// (api-design, observability, i18n-quality; see skill-catalog-agsk5.test.ts) and 369-003's
// three new built-in agents (api-designer, observability-engineer, i18n-specialist; see
// agent-catalog-agsk6.test.ts). Those two tasks deliberately wrote ONLY SKILL.md / PROMPT.md
// under src/core/builtins/{skills,agents}/<id>/ — no manifest.json, no agent.json, no
// .deckent mirror, no pool-code touch (see both files' header comments). This file proves,
// hermetically and read-only against the real repo tree (no fixtures copied into a tmpdir),
// whether the 6 items are visible through the actual load paths:
//   (a) SkillPoolManager.loadSkills() / AgentPoolManager.loadAgents() against this repo's
//       own already-seeded .deckent/{skills,agents} tree, and
//   (b) the real seedBuiltins() sync flow (src/cli/commands/init-steps.ts, invoked by
//       `deckent init`) copying from the live src/core/builtins tree into a disposable
//       fresh project.
// Root cause (read-only investigation, no pool/init-steps edits): both loaders hard-require
// a manifest.json / agent.json file to register an id (skill-pool.ts / agent-pool.ts read
// ONLY `.deckent/{skills,agents}/<id>/{manifest,agent}.json` — neither references
// src/core/builtins at all), and seedBuiltins() is a directory-level copy gated only on the
// destination directory's existence, not on manifest presence. Since none of the 6 items
// have a manifest.json/agent.json anywhere in the repo, they are invisible to both load
// paths today — not a pool-code defect, not a seeding-path defect, just a missing artifact
// that a follow-up task (author manifest.json/agent.json for the 6 ids) will close. Per
// task instruction, the "currently absent" assertions below are written as dynamic,
// self-adjusting checks (they pass today AND will keep passing once the follow-up lands) —
// never as a hardcoded "must stay missing" assertion kept red for documentation purposes.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { SkillPoolManager } from '../../../src/core/skill-pool.js';
import { AgentPoolManager, getAgentRole } from '../../../src/core/agent-pool.js';
import { seedBuiltins } from '../../../src/cli/commands/init-steps.js';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const DECKENT_SKILLS_DIR = resolve(PROJECT_ROOT, '.deckent/skills');
const DECKENT_AGENTS_DIR = resolve(PROJECT_ROOT, '.deckent/agents');
const SRC_BUILTIN_SKILLS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/skills');
const SRC_BUILTIN_AGENTS_DIR = resolve(PROJECT_ROOT, 'src/core/builtins/agents');

const NEW_SKILLS = ['api-design', 'observability', 'i18n-quality'];
const NEW_AGENTS = ['api-designer', 'observability-engineer', 'i18n-specialist'];

function hasSkillManifest(dir: string, id: string): boolean {
  return existsSync(join(dir, id, 'manifest.json'));
}

function hasAgentJson(dir: string, id: string): boolean {
  return existsSync(join(dir, id, 'agent.json'));
}

// Live pool state against THIS repo's own already-seeded .deckent tree — real fs reads,
// no mocking, computed once at collection time (both loaders are synchronous).
const livePoolSkills = new SkillPoolManager(PROJECT_ROOT).loadSkills();
const livePoolAgents = new AgentPoolManager(PROJECT_ROOT).loadAgents();

describe('370-003 CATALOG-SYNC-PARITY: 368-001 skills + 369-003 agents pool-load visibility', () => {
  it('src/core/builtins carries all 6 new items on disk (SKILL.md / PROMPT.md), read live off the real tree', () => {
    for (const id of NEW_SKILLS) {
      expect(existsSync(join(SRC_BUILTIN_SKILLS_DIR, id, 'SKILL.md')), `${id}/SKILL.md missing`).toBe(true);
    }
    for (const id of NEW_AGENTS) {
      expect(existsSync(join(SRC_BUILTIN_AGENTS_DIR, id, 'PROMPT.md')), `${id}/PROMPT.md missing`).toBe(true);
    }
  });

  describe('skills: live .deckent/skills pool parity', () => {
    for (const id of NEW_SKILLS) {
      const inPool = livePoolSkills.has(id);

      describe(id, () => {
        it.skipIf(!inPool)(
          `pool entry is a valid, enabled builtin skill (currently ${inPool ? 'PRESENT' : 'ABSENT -- skipped, see catalog-sync-parity notes'})`,
          () => {
            const skill = livePoolSkills.get(id);
            if (!skill) throw new Error(`unexpected: '${id}' missing from pool despite inPool=true`);
            const raw = skill as unknown as Record<string, unknown>;
            expect(raw.id).toBe(id);
            expect(skill.enabled).toBe(true);
            expect(raw.source).toBe('builtin');
          },
        );

        it('pool membership follows the two-layer contract: .deckent manifest OR builtin-tree presence (371-001 D-004 fallback — supersedes the manifest-only invariant)', () => {
          // 371-001 (CATALOG-MATERIALIZE, Option A) taught the pool to read the
          // builtin tree directly as a fallback layer (.deckent override >
          // builtin default). These ids exist in src/core/builtins (asserted
          // above), so pool membership is now GUARANTEED even without a
          // .deckent manifest — the old "manifest-only" invariant is obsolete.
          expect(inPool, `'${id}' exists in the builtin tree, so the two-layer pool must include it`).toBe(true);
        });
      });
    }
  });

  describe('agents: live .deckent/agents pool parity', () => {
    for (const id of NEW_AGENTS) {
      const inPool = livePoolAgents.has(id);

      describe(id, () => {
        it.skipIf(!inPool)(
          `pool entry is a valid, enabled builtin agent (currently ${inPool ? 'PRESENT' : 'ABSENT -- skipped, see catalog-sync-parity notes'})`,
          () => {
            const agent = livePoolAgents.get(id);
            if (!agent) throw new Error(`unexpected: '${id}' missing from pool despite inPool=true`);
            expect(agent.id).toBe(id);
            expect(agent.enabled).toBe(true);
            expect(agent.source).toBe('builtin');
            expect(getAgentRole(agent)).toBe('implementer');
          },
        );

        it('pool membership follows the two-layer contract: .deckent agent.json OR builtin-tree presence (371-001 D-004 fallback — supersedes the json-only invariant)', () => {
          // Same 371-001 two-layer contract as the skills block above.
          expect(inPool, `'${id}' exists in the builtin tree, so the two-layer pool must include it`).toBe(true);
        });
      });
    }
  });

  describe('sync-flow proof: real seedBuiltins() into a disposable fresh project (isolates the seeding path from the manifest gate)', () => {
    let tmpRoot: string;

    beforeAll(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-catalog-sync-parity-'));
      // Real seeding: read-only against the live src/core/builtins (or dist) tree per
      // src/cli/commands/init-steps.ts -- this never touches the repo's own .deckent tree,
      // it only writes into the disposable tmpRoot created above.
      seedBuiltins(tmpRoot);
    });

    afterAll(() => {
      try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    });

    it('the directory-level copy is unconditional: all 6 new items land in the fresh .deckent tree regardless of manifest/agent.json', () => {
      for (const id of NEW_SKILLS) {
        expect(existsSync(join(tmpRoot, '.deckent', 'skills', id, 'SKILL.md')), `${id}/SKILL.md not seeded`).toBe(true);
      }
      for (const id of NEW_AGENTS) {
        expect(existsSync(join(tmpRoot, '.deckent', 'agents', id, 'PROMPT.md')), `${id}/PROMPT.md not seeded`).toBe(true);
      }
    });

    it('even freshly seeded, the pool loaders only recognize an item once its manifest/agent.json exists (proves the gate is the manifest, not the seeding path)', () => {
      const seededSkills = new SkillPoolManager(tmpRoot).loadSkills();
      const seededAgents = new AgentPoolManager(tmpRoot).loadAgents();

      for (const id of NEW_SKILLS) {
        const hasSrcManifest = hasSkillManifest(SRC_BUILTIN_SKILLS_DIR, id);
        expect(seededSkills.has(id), `seeded pool membership for '${id}' should track its source manifest.json`).toBe(hasSrcManifest);
      }
      for (const id of NEW_AGENTS) {
        const hasSrcAgentJson = hasAgentJson(SRC_BUILTIN_AGENTS_DIR, id);
        expect(seededAgents.has(id), `seeded pool membership for '${id}' should track its source agent.json`).toBe(hasSrcAgentJson);
      }
    });
  });
});
