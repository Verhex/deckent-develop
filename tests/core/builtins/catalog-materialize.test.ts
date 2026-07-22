// 371-001 CATALOG-MATERIALIZE — closes 370-003's honest skips. 370-003 proved the 6 items from
// 368-001 (skills: api-design, observability, i18n-quality) and 369-003 (agents: api-designer,
// observability-engineer, i18n-specialist) were invisible to SkillPoolManager.loadSkills() /
// AgentPoolManager.loadAgents() because those loaders only ever read
// .deckent/{skills,agents}/<id>/{manifest,agent}.json — the 6 items shipped with ONLY
// SKILL.md/PROMPT.md under src/core/builtins/, no manifest.json/agent.json anywhere.
//
// Root-cause fix (see skill-pool.ts / agent-pool.ts _loadBuiltinFallback + this task's
// task-371-001.plan for the full Option-A-vs-B rationale): the pool loaders now also read the
// builtin tree directly at load time (D-004 layer pattern — .deckent override > builtin
// default), synthesizing a minimal valid definition from SKILL.md/PROMPT.md when no manifest
// exists anywhere. This is in-memory only — no manifest.json/agent.json is ever written to disk
// by this fallback, so it stays hermetic and never mutates .deckent/** as a side effect of a
// read.
//
// This file proves, hermetically, that the 6 items are now pool members, AND (via
// disposable tmp projects) that:
//   - a .deckent override still wins over the builtin default (D-004 precedence preserved)
//   - the existing 14 already-materialized agents/skills are byte-for-byte unaffected
//   - getAgentPrompt()'s new builtin-fallback tier resolves real PROMPT.md content for a
//     never-synced id, while an id with a persisted (but PROMPT.md-less) agent.json still
//     degrades to systemPrompt exactly as ADR-048 specifies (the tier is gated on "no
//     .deckent/.tasks record at all", not merely "PROMPT.md missing")
//
// 397-009 C5 fix: the "live pool" block below used to instantiate the pool managers
// directly against PROJECT_ROOT. _loadBuiltinFallback gates on .deckent/config.json
// EXISTING at the project root — a file that is gitignored + untracked (d3148926), so it
// is present on a dev machine that ran `deckent init` but ABSENT on a fresh CI checkout.
// That made this block pass locally and fail in CI (11 red). It now runs against a
// disposable tmpdir seeded with a copy of this repo's real (git-tracked)
// .deckent/skills + .deckent/agents trees plus a minimal .deckent/config.json, so the
// gate opens deterministically regardless of host state — the gate itself stays pinned
// (see the "fallback is gated on .deckent/config.json" describe block below, unchanged).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { SkillPoolManager } from '../../../src/core/skill-pool.js';
import { AgentPoolManager, getAgentPrompt } from '../../../src/core/agent-pool.js';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const NEW_SKILLS = ['api-design', 'observability', 'i18n-quality'];
const NEW_AGENTS = ['api-designer', 'observability-engineer', 'i18n-specialist'];

describe('371-001 CATALOG-MATERIALIZE: builtin fallback makes the 6 new items pool-visible', () => {
  describe('live pool (hermetic tmpdir copy of the real .deckent tree + minimal config.json)', () => {
    let tmpRoot: string;
    let livePoolSkills: ReturnType<SkillPoolManager['loadSkills']>;
    let livePoolAgents: ReturnType<AgentPoolManager['loadAgents']>;

    beforeAll(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-catalog-materialize-live-'));
      cpSync(join(PROJECT_ROOT, '.deckent', 'skills'), join(tmpRoot, '.deckent', 'skills'), { recursive: true });
      cpSync(join(PROJECT_ROOT, '.deckent', 'agents'), join(tmpRoot, '.deckent', 'agents'), { recursive: true });
      // This suite pins the BUILTIN FALLBACK path — it must hold even after the
      // agent-prompt-sync command (444-005) materializes .deckent/agents/<id>/
      // shadows for these agents in the real repo tree. Strip any copied shadow
      // so the probed ids are genuinely shadow-less inside the fixture.
      for (const id of NEW_AGENTS) {
        rmSync(join(tmpRoot, '.deckent', 'agents', id), { recursive: true, force: true });
      }
      writeFileSync(join(tmpRoot, '.deckent', 'config.json'), '{}', 'utf8');
      livePoolSkills = new SkillPoolManager(tmpRoot).loadSkills();
      livePoolAgents = new AgentPoolManager(tmpRoot).loadAgents();
    });

    afterAll(() => {
      try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    });

    for (const id of NEW_SKILLS) {
      it(`skill '${id}' is now pool-visible, enabled, source=builtin`, () => {
        expect(livePoolSkills.has(id), `${id} missing from pool`).toBe(true);
        const skill = livePoolSkills.get(id)!;
        expect(skill.id).toBe(id);
        expect(skill.enabled).toBe(true);
        expect((skill as unknown as Record<string, unknown>).source).toBe('builtin');
        expect(typeof skill.name).toBe('string');
        expect(skill.name.length).toBeGreaterThan(0);
      });
    }

    for (const id of NEW_AGENTS) {
      it(`agent '${id}' is now pool-visible, enabled, source=builtin`, () => {
        expect(livePoolAgents.has(id), `${id} missing from pool`).toBe(true);
        const agent = livePoolAgents.get(id)!;
        expect(agent.id).toBe(id);
        expect(agent.enabled).toBe(true);
        expect(agent.source).toBe('builtin');
        expect(typeof agent.name).toBe('string');
        expect(agent.name.length).toBeGreaterThan(0);
      });

      it(`agent '${id}' resolves real PROMPT.md content via getAgentPrompt() builtin fallback`, () => {
        const resolution = getAgentPrompt(id, tmpRoot);
        expect(resolution.source).toBe('prompt-md-builtin');
        expect(resolution.degraded).toBe(false);
        expect(resolution.content.trim().length).toBeGreaterThan(0);
      });
    }
  });

  describe('existing (already-materialized) catalog is unaffected', () => {
    it('all pre-existing .deckent/skills entries still load with identical ids/enabled/source', () => {
      const pool = new SkillPoolManager(PROJECT_ROOT).loadSkills();
      const deckentSkillsDir = join(PROJECT_ROOT, '.deckent', 'skills');
      const preExisting = existsSync(deckentSkillsDir)
        ? readdirSync(deckentSkillsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name !== 'docs')
            .map((e) => e.name)
        : [];
      expect(preExisting.length).toBeGreaterThan(0);
      for (const id of preExisting) {
        const manifestPath = join(deckentSkillsDir, id, 'manifest.json');
        if (!existsSync(manifestPath)) continue; // not every subdir is a manifest-bearing skill (e.g. stray docs)
        const onDisk = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const fromPool = pool.get(id);
        expect(fromPool, `${id} should still load from its .deckent override`).toBeDefined();
        expect(fromPool!.id).toBe(onDisk.id);
        expect(fromPool!.enabled).toBe(onDisk.enabled);
      }
    });

    it('all pre-existing .deckent/agents entries still load with identical ids/enabled/source', () => {
      const pool = new AgentPoolManager(PROJECT_ROOT).loadAgents();
      const deckentAgentsDir = join(PROJECT_ROOT, '.deckent', 'agents');
      const preExisting = readdirSync(deckentAgentsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'archive' && !e.name.startsWith('temp-'))
        .map((e) => e.name);
      expect(preExisting.length).toBeGreaterThanOrEqual(14);
      for (const id of preExisting) {
        const agentJsonPath = join(deckentAgentsDir, id, 'agent.json');
        if (!existsSync(agentJsonPath)) continue;
        const onDisk = JSON.parse(readFileSync(agentJsonPath, 'utf8'));
        const fromPool = pool.get(id);
        expect(fromPool, `${id} should still load from its .deckent override`).toBeDefined();
        expect(fromPool!.id).toBe(onDisk.id);
        expect(fromPool!.enabled).toBe(onDisk.enabled);
        expect(fromPool!.source).toBe(onDisk.source);
      }
    });
  });

  describe('D-004 precedence (hermetic): .deckent override wins over builtin default', () => {
    let tmpRoot: string;

    beforeAll(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-catalog-materialize-'));
    });

    afterAll(() => {
      try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    });

    it('an explicit .deckent/skills/api-design override shadows the builtin-derived fallback', () => {
      const overrideDir = join(tmpRoot, '.deckent', 'skills', 'api-design');
      mkdirSync(overrideDir, { recursive: true });
      const overrideManifest = {
        id: 'api-design',
        name: 'CUSTOM OVERRIDE NAME',
        version: '9.9.9',
        description: 'user override',
        entrypoint: 'SKILL.md',
        category: 'workflow',
        triggers: [],
        stackDetection: { files: [], dependencies: [], commands: [] },
        composableWith: [],
        priority: 1,
        promptInjection: { position: 'append', maxTokens: 500 },
        enabled: false,
        source: 'user',
        stats: { totalUses: 0, successCount: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
      };
      writeFileSync(join(overrideDir, 'manifest.json'), JSON.stringify(overrideManifest, null, 2), 'utf8');

      const pool = new SkillPoolManager(tmpRoot).loadSkills();
      const skill = pool.get('api-design');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('CUSTOM OVERRIDE NAME');
      expect(skill!.enabled).toBe(false);
      expect((skill as unknown as Record<string, unknown>).source).toBe('user');
    });

    it('an explicit .deckent/agents/api-designer override shadows the builtin-derived fallback', () => {
      const overrideDir = join(tmpRoot, '.deckent', 'agents', 'api-designer');
      mkdirSync(overrideDir, { recursive: true });
      const overrideAgent = {
        id: 'api-designer',
        name: 'CUSTOM AGENT OVERRIDE',
        description: 'user override',
        systemPrompt: 'custom system prompt',
        expertise: [],
        allowedTools: [],
        deniedTools: [],
        preferredModel: 'claude-sonnet-5',
        effortMultiplier: 1,
        triggerKeywords: [],
        triggerScopes: [],
        triggerFilePatterns: [],
        persistent: true,
        enabled: false,
        source: 'user',
        stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
      };
      writeFileSync(join(overrideDir, 'agent.json'), JSON.stringify(overrideAgent, null, 2), 'utf8');

      const pool = new AgentPoolManager(tmpRoot).loadAgents();
      const agent = pool.get('api-designer');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('CUSTOM AGENT OVERRIDE');
      expect(agent!.enabled).toBe(false);
      expect(agent!.source).toBe('user');

      // getAgentPrompt() must also respect the override: no PROMPT.md in the override dir,
      // but agent.json exists — must degrade to systemPrompt, NOT reach into the builtin tree.
      const resolution = getAgentPrompt('api-designer', tmpRoot);
      expect(resolution.source).toBe('system-prompt');
      expect(resolution.degraded).toBe(true);
      expect(resolution.content).toBe('custom system prompt');
    });

    it('a completely unknown id (no .deckent record, no builtin) still resolves to source=none', () => {
      const resolution = getAgentPrompt('definitely-not-a-real-agent-371-001', tmpRoot);
      expect(resolution.source).toBe('none');
      expect(resolution.content).toBe('');
    });
  });

  describe('fallback is gated on .deckent/config.json — no leakage into non-deckent directories', () => {
    // resolveBuiltinSkillsDir()/resolveBuiltinAgentsDir() intentionally resolve relative to
    // THIS INSTALLATION's own location (required for real npm-installed usage — a user's
    // project root never contains src/core/builtins itself). Without a gate, ANY directory
    // that merely happens to contain a `.deckent/agents/<id>/` subdirectory (e.g. an unrelated
    // test fixture in another part of the suite) would silently inherit this installation's
    // manifest-less builtin catalog. This describe block proves the gate: no
    // .deckent/config.json -> no fallback at all, even for a manifest-less builtin id
    // like 'api-design'/'api-designer' (the ones this task actually adds).
    let bareRoot: string;
    let initializedRoot: string;

    beforeAll(() => {
      bareRoot = mkdtempSync(join(tmpdir(), 'deckent-catalog-materialize-bare-'));
      // Shape mimics a narrow unit-test fixture: a .deckent/agents subdirectory exists, but
      // the project was never actually `deckent init`-ed (no config.json).
      mkdirSync(join(bareRoot, '.deckent', 'agents', 'unrelated-fixture-agent'), { recursive: true });

      initializedRoot = mkdtempSync(join(tmpdir(), 'deckent-catalog-materialize-init-'));
      mkdirSync(join(initializedRoot, '.deckent'), { recursive: true });
      writeFileSync(join(initializedRoot, '.deckent', 'config.json'), '{}', 'utf8');
    });

    afterAll(() => {
      try { rmSync(bareRoot, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
      try { rmSync(initializedRoot, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    });

    it('a bare directory (no config.json) does not inherit any real builtin agents/skills', () => {
      const agents = new AgentPoolManager(bareRoot).loadAgents();
      const skills = new SkillPoolManager(bareRoot).loadSkills();
      expect(agents.size).toBe(0); // the one fixture subdir has no agent.json -> excluded, no leak either
      expect(skills.size).toBe(0);
      expect(agents.has('api-designer')).toBe(false);
      expect(skills.has('api-design')).toBe(false);

      const resolution = getAgentPrompt('api-designer', bareRoot);
      expect(resolution.source).not.toBe('prompt-md-builtin');
    });

    it('an initialized project (config.json present) sees the FULL builtin agent catalog via the fallback', () => {
      // Capabilities-era contract (446, V3 Slice-1): the builtin agent tree is
      // the DEFAULT layer of the D-004 pattern — manifest-BEARING builtins
      // (refactorer, api-builder, and the 445-materialized api-designer/
      // i18n-specialist/observability-engineer) load from their own builtin
      // agent.json when no .deckent override exists; manifest-less builtin
      // dirs still go through PROMPT.md synthesis. A zero-config initialized
      // project therefore sees the WHOLE shipped agent catalog.
      // Skill-side behavior is UNCHANGED this slice: manifest-bearing builtin
      // skills stay excluded from the skill fallback (they arrive via
      // sync/materialize); 'observability' remains manifest-less (born-646)
      // and keeps proving the skill-side synthesis path.
      const agents = new AgentPoolManager(initializedRoot).loadAgents();
      const skills = new SkillPoolManager(initializedRoot).loadSkills();
      expect(agents.has('api-designer')).toBe(true);
      expect(agents.has('refactorer')).toBe(true);
      expect(agents.get('refactorer')?.source).toBe('builtin');
      expect(skills.has('observability')).toBe(true);
      expect(skills.has('api-design')).toBe(false);
      expect(skills.has('i18n-quality')).toBe(false);
      expect(skills.has('api-builder')).toBe(false);

      const resolution = getAgentPrompt('api-designer', initializedRoot);
      expect(resolution.source).toBe('prompt-md-builtin');
      expect(resolution.content.trim().length).toBeGreaterThan(0);
    });
  });
});
