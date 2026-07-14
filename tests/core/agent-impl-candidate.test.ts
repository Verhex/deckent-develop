import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

import * as fs from 'node:fs';
import {
  AgentPoolManager,
  applyBuiltinImplementationRules,
  BUILTIN_IMPLEMENTATION_INTENT_RULES,
} from '../../src/core/agent-pool.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';

const ROOT = '/test/project';

function mockDirEntry(name: string): fs.Dirent {
  return { name, isDirectory: () => true } as unknown as fs.Dirent;
}

function makeBuiltinAgent(
  id: string,
  activation: ActivationConfig,
): AgentDefinition {
  return createAgentDefinition({
    id,
    name: id,
    source: 'builtin',
    manifestVersion: 2,
    activation,
  });
}

// Sprint 204 Task 204-003 origin; Sprint 444 F3 era: the implementation floor
// moved onto the `implementer` builtin's own manifest, refactorer was DROPPED
// from the injection map (refactor-only by spec), and only architect's
// secondary candidacy (6) is still injected at load time.
describe('built-in implementation intent candidacy (implementer era)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── 1. refactorer is refactor-only: NO injected candidacy ──────────────────

  it('does not add an implementation rule to refactorer (dropped from the map)', () => {
    const refactorer = makeBuiltinAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'refactor' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    const changed = applyBuiltinImplementationRules(refactorer);
    expect(changed).toBe(false);

    const implRule = refactorer.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRule).toBeUndefined();
  });

  // ─── 2. architect gets implementation@6 ─────────────────────────────────────

  it('adds implementation intent rule at score 6 to architect', () => {
    const architect = makeBuiltinAgent('architect', {
      rules: [
        { when: { 'intent.primary': 'design' }, score: 8 },
        { when: { 'complexity.estimatedSize': { $in: ['large', 'epic'] } }, score: 10 },
      ],
      exclude: [],
      minScore: 5,
    });

    applyBuiltinImplementationRules(architect);

    const implRule = architect.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRule).toBeDefined();
    expect(implRule?.score).toBe(6);
  });

  // ─── 3. existing rules are preserved (architect design@8) ───────────────────

  it('preserves architect existing design intent rule (no clobber)', () => {
    const architect = makeBuiltinAgent('architect', {
      rules: [{ when: { 'intent.primary': 'design' }, score: 8 }],
      exclude: [],
      minScore: 5,
    });

    applyBuiltinImplementationRules(architect);

    const designRule = architect.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'design',
    );
    expect(designRule).toBeDefined();
    expect(designRule?.score).toBe(8);
  });

  // ─── 4. refactorer's own refactor@10 rule is untouched by the no-op ─────────

  it('preserves refactorer existing refactor intent rule (no clobber)', () => {
    const refactorer = makeBuiltinAgent('refactorer', {
      rules: [{ when: { 'intent.primary': 'refactor' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    applyBuiltinImplementationRules(refactorer);

    const refactorRule = refactorer.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'refactor',
    );
    expect(refactorRule).toBeDefined();
    expect(refactorRule?.score).toBe(10);
    expect(refactorer.activation!.rules).toHaveLength(1);
  });

  // ─── 5. idempotent: re-applying never duplicates (architect) ────────────────

  it('does not duplicate implementation rule on repeated application (idempotent)', () => {
    const architect = makeBuiltinAgent('architect', {
      rules: [{ when: { 'intent.primary': 'design' }, score: 8 }],
      exclude: [],
      minScore: 5,
    });

    applyBuiltinImplementationRules(architect);
    const changedAgain = applyBuiltinImplementationRules(architect);
    expect(changedAgain).toBe(false);

    const implRules = architect.activation!.rules.filter(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRules).toHaveLength(1);
  });

  // ─── 6. non-built-in (temp/user) agents are NOT augmented ───────────────────

  it('does not augment non-builtin agents (temp-react-ts-specialist untouched)', () => {
    const tempReact = createAgentDefinition({
      id: 'temp-react-ts-specialist',
      name: 'Temp React',
      source: 'learned',
      manifestVersion: 2,
      activation: {
        rules: [{ when: { 'intent.primary': 'implementation' }, score: 6 }],
        exclude: [],
        minScore: 5,
      },
    });

    const changed = applyBuiltinImplementationRules(tempReact);
    expect(changed).toBe(false);
    expect(tempReact.activation!.rules).toHaveLength(1);
    expect(tempReact.activation!.rules[0]!.score).toBe(6);
  });

  // ─── 7. agents outside the mapping are untouched (security-auditor) ─────────

  it('does not augment unrelated built-in agents (security-auditor untouched)', () => {
    const securityAuditor = makeBuiltinAgent('security-auditor', {
      rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
      exclude: [],
      minScore: 5,
    });

    const changed = applyBuiltinImplementationRules(securityAuditor);
    expect(changed).toBe(false);

    const implRule = securityAuditor.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRule).toBeUndefined();
  });

  // ─── 8. constant map shape sanity ───────────────────────────────────────────

  it('exposes a BUILTIN_IMPLEMENTATION_INTENT_RULES map covering only architect', () => {
    expect(BUILTIN_IMPLEMENTATION_INTENT_RULES.refactorer).toBeUndefined();
    expect(BUILTIN_IMPLEMENTATION_INTENT_RULES.architect?.score).toBe(6);
    expect(Object.keys(BUILTIN_IMPLEMENTATION_INTENT_RULES)).toEqual(['architect']);
  });

  // ─── 9. wiring: loadAgents applies the rule end-to-end ──────────────────────

  it('loadAgents wires the rule for architect loaded from .deckent/agents/', () => {
    const architect = makeBuiltinAgent('architect', {
      rules: [{ when: { 'intent.primary': 'design' }, score: 8 }],
      exclude: [],
      minScore: 5,
    });

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s.includes('.deckent/agents') && !s.includes('.tasks');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('architect')] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(architect));

    const manager = new AgentPoolManager(ROOT);
    const pool = manager.loadAgents();
    const loaded = pool.get('architect');

    expect(loaded).toBeDefined();
    const implRule = loaded?.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRule?.score).toBe(6);
  });

  // ─── 10. agents without activation gain a config + rule ─────────────────────

  it('initializes activation config when missing (manifestVersion=1 built-in)', () => {
    const legacyArchitect = createAgentDefinition({
      id: 'architect',
      name: 'Architect',
      source: 'builtin',
      manifestVersion: 1,
    });
    expect(legacyArchitect.activation).toBeUndefined();

    const changed = applyBuiltinImplementationRules(legacyArchitect);
    expect(changed).toBe(true);

    const implRule = legacyArchitect.activation?.rules.find(
      (r) => r.when['intent.primary'] === 'implementation',
    );
    expect(implRule?.score).toBe(6);
  });
});
