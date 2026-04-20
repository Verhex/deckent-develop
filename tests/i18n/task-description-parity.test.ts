// ─── i18n Parity Test — TR/EN Task Description Routing Identical ─────────────
// Sprint 148 Task 18
//
// Verifies that semantically equivalent tasks described in Turkish (TR) and
// English (EN) produce identical routing decisions:
//   1. Same primary intent classification
//   2. Same agent selection via fallback chain
//
// The classifyIntent() function uses scope-based signals as the dominant factor,
// so identical scope directories → identical routing regardless of description language.

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import { AGENT_FALLBACK_CHAIN, selectAgentByFallback } from '../../src/core/routing-engine.js';
import type { IntentType } from '../../src/core/routing-types.js';

// ─── Task Fixtures ───────────────────────────────────────────────────────────

const ACTIVE_AGENT_IDS = new Set([
  'architect',
  'refactorer',
  'bug-fixer',
  'doc-writer',
  'code-reviewer',
  'security-auditor',
  'api-builder',
  'performance-analyzer',
  'ci-guardian',
  'architecture-planner',
  'accessibility-auditor',
  'data-engineer',
  'devops-engineer',
  'frontend-designer',
  'migration-specialist',
  // test-writer intentionally absent (Sprint 148 taxonomy reform)
]);

interface TaskFixture {
  title: string;
  description: string;
  scope: {
    directories: string[];
    filesWrite: string[];
    filesRead: string[];
  };
}

// Task pair 1: Core implementation — src/core/ scope
const TR_TASK_1: TaskFixture = {
  title: 'Nervous types runtime tiplerini genişlet',
  description: 'Nervous types runtime tiplerini genişlet ve yeni alanlar ekle',
  scope: {
    directories: ['src/core/'],
    filesWrite: ['src/core/nervous-types.ts'],
    filesRead: ['src/core/routing-types.ts'],
  },
};

const EN_TASK_1: TaskFixture = {
  title: 'Extend nervous types runtime types',
  description: 'Extend nervous types runtime types and add new fields',
  scope: {
    directories: ['src/core/'],
    filesWrite: ['src/core/nervous-types.ts'],
    filesRead: ['src/core/routing-types.ts'],
  },
};

// Task pair 2: Test scope — tests/nervous/ scope (gets test-coverage tag)
const TR_TASK_2: TaskFixture = {
  title: 'DIRECTIVES.md koruma detektörü test et',
  description: 'DIRECTIVES.md koruma detektörü için unit testler yaz',
  scope: {
    directories: ['tests/nervous/'],
    filesWrite: ['tests/nervous/detectors/directives-protection-stress.test.ts'],
    filesRead: ['src/nervous/detectors/directives-protection.ts'],
  },
};

const EN_TASK_2: TaskFixture = {
  title: 'Test DIRECTIVES.md protection detector',
  description: 'Write unit tests for the DIRECTIVES.md protection detector',
  scope: {
    directories: ['tests/nervous/'],
    filesWrite: ['tests/nervous/detectors/directives-protection-stress.test.ts'],
    filesRead: ['src/nervous/detectors/directives-protection.ts'],
  },
};

// Task pair 3: MCP implementation — src/mcp/ scope
const TR_TASK_3: TaskFixture = {
  title: 'MCP nervous tool 5 adet ekle',
  description: 'MCP nervous tool 5 adet ekle ve endpoint\'leri implement et',
  scope: {
    directories: ['src/mcp/'],
    filesWrite: ['src/mcp/nervous-tools.ts'],
    filesRead: ['src/core/nervous-types.ts'],
  },
};

const EN_TASK_3: TaskFixture = {
  title: 'Add 5 MCP nervous tools',
  description: 'Add 5 MCP nervous tools and implement the endpoints',
  scope: {
    directories: ['src/mcp/'],
    filesWrite: ['src/mcp/nervous-tools.ts'],
    filesRead: ['src/core/nervous-types.ts'],
  },
};

// Task pair 4: Documentation — docs/ scope
const TR_TASK_4: TaskFixture = {
  title: 'Dokümantasyon güncelle',
  description: 'Sprint 148 için dokümantasyon güncelleme ve changelog yaz',
  scope: {
    directories: ['docs/'],
    filesWrite: ['docs/audits/sprint-148/i18n-validation.md', 'CHANGELOG.md'],
    filesRead: [],
  },
};

const EN_TASK_4: TaskFixture = {
  title: 'Update documentation',
  description: 'Update documentation for sprint 148 and write changelog',
  scope: {
    directories: ['docs/'],
    filesWrite: ['docs/audits/sprint-148/i18n-validation.md', 'CHANGELOG.md'],
    filesRead: [],
  },
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function getRouting(task: TaskFixture): { primary: IntentType; agent: string } {
  const dna = classifyIntent(task);
  const primary = dna.intent.primary;
  const agent = selectAgentByFallback(primary, ACTIVE_AGENT_IDS);
  return { primary, agent };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('i18n Parity — TR/EN Task Description Routing Identical', () => {
  describe('Pair 1: src/core/ scope (implementation intent)', () => {
    it('TR and EN produce the same primary intent', () => {
      const tr = getRouting(TR_TASK_1);
      const en = getRouting(EN_TASK_1);
      expect(tr.primary).toBe(en.primary);
    });

    it('TR and EN produce the same agent selection', () => {
      const tr = getRouting(TR_TASK_1);
      const en = getRouting(EN_TASK_1);
      expect(tr.agent).toBe(en.agent);
    });
  });

  describe('Pair 2: tests/nervous/ scope (implementation + test-coverage tag)', () => {
    it('TR and EN produce the same primary intent', () => {
      const tr = getRouting(TR_TASK_2);
      const en = getRouting(EN_TASK_2);
      expect(tr.primary).toBe(en.primary);
    });

    it('TR and EN produce the same agent selection', () => {
      const tr = getRouting(TR_TASK_2);
      const en = getRouting(EN_TASK_2);
      expect(tr.agent).toBe(en.agent);
    });
  });

  describe('Pair 3: src/mcp/ scope (implementation intent)', () => {
    it('TR and EN produce the same primary intent', () => {
      const tr = getRouting(TR_TASK_3);
      const en = getRouting(EN_TASK_3);
      expect(tr.primary).toBe(en.primary);
    });

    it('TR and EN produce the same agent selection', () => {
      const tr = getRouting(TR_TASK_3);
      const en = getRouting(EN_TASK_3);
      expect(tr.agent).toBe(en.agent);
    });
  });

  describe('Pair 4: docs/ scope (documentation intent)', () => {
    it('TR and EN produce the same primary intent', () => {
      const tr = getRouting(TR_TASK_4);
      const en = getRouting(EN_TASK_4);
      expect(tr.primary).toBe(en.primary);
    });

    it('TR and EN produce the same agent selection', () => {
      const tr = getRouting(TR_TASK_4);
      const en = getRouting(EN_TASK_4);
      expect(tr.agent).toBe(en.agent);
    });
  });

  // Bonus: verify test-writer is NOT in AGENT_FALLBACK_CHAIN outputs for any intent
  it('test-writer is not reachable via any fallback chain', () => {
    const allAgents = Object.values(AGENT_FALLBACK_CHAIN).flat();
    expect(allAgents).not.toContain('test-writer');
  });
});
