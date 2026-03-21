import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SkillDefinition, ProjectStack, SkillStats } from '../../src/core/skill-types.js';
import { createSkillDefinition, createDefaultSkillStats } from '../../src/core/skill-types.js';
import type { Task, TaskScope, GoNoGoCriteria, TaskStatus, ModelType, TaskEffort, TaskPriority } from '../../src/core/types.js';

// ─── Skill Selection Logic ──────────────────────────────────────────

/**
 * Detect project stack from file existence and dependency checks.
 */
function detectProjectStack(
  fileExists: (path: string) => boolean,
  readPackageJson: () => Record<string, unknown> | null,
): ProjectStack {
  const stack: ProjectStack = {
    language: 'unknown',
    framework: 'unknown',
    dependencies: [],
    buildTool: 'unknown',
    testFramework: 'unknown',
    detectedAt: new Date().toISOString(),
  };

  if (fileExists('tsconfig.json')) {
    stack.language = 'typescript';
    stack.buildTool = 'tsc';
  } else if (fileExists('package.json')) {
    stack.language = 'javascript';
  }

  const pkg = readPackageJson();
  if (pkg) {
    const allDeps = {
      ...(pkg.dependencies as Record<string, string> ?? {}),
      ...(pkg.devDependencies as Record<string, string> ?? {}),
    };
    stack.dependencies = Object.keys(allDeps);

    if (allDeps['react']) stack.framework = 'react';
    else if (allDeps['vue']) stack.framework = 'vue';
    else if (allDeps['@angular/core']) stack.framework = 'angular';
    else if (allDeps['express']) stack.framework = 'express';

    if (allDeps['vitest']) stack.testFramework = 'vitest';
    else if (allDeps['jest']) stack.testFramework = 'jest';
    else if (allDeps['mocha']) stack.testFramework = 'mocha';

    if (allDeps['vite']) stack.buildTool = 'vite';
    else if (allDeps['webpack']) stack.buildTool = 'webpack';
  }

  return stack;
}

/**
 * Score a skill against a task and project stack.
 */
function scoreSkill(
  skill: SkillDefinition,
  task: Pick<Task, 'title' | 'description'>,
  stack: ProjectStack,
): number {
  if (!skill.enabled) return 0;

  let score = 0;
  const text = `${task.title} ${task.description}`.toLowerCase();

  // Trigger matching
  for (const trigger of skill.triggers) {
    if (text.includes(trigger.toLowerCase())) {
      score += 2;
    }
  }

  // Stack detection matching
  const sd = skill.stackDetection;
  for (const dep of sd.dependencies) {
    if (stack.dependencies.includes(dep)) {
      score += 3;
    }
  }

  // Language match
  if (skill.category === 'language' && stack.language === skill.triggers[0]) {
    score += 5;
  }

  // Framework match
  if (skill.category === 'framework' && stack.framework === skill.triggers[0]) {
    score += 5;
  }

  // Priority boost
  score += skill.priority * 0.1;

  // Stats boost for proven skills
  if (skill.stats.totalUses > 0 && skill.stats.successRate > 0.7) {
    score += 1;
  }

  return score;
}

/**
 * Select skills for a task. Returns top N skills by score.
 */
function selectSkills(
  task: Pick<Task, 'title' | 'description'>,
  skills: SkillDefinition[],
  stack: ProjectStack,
  maxSkills = 3,
): { skills: SkillDefinition[]; scores: Map<string, number>; truncated: boolean } {
  const scored: Array<{ skill: SkillDefinition; score: number }> = [];

  for (const skill of skills) {
    const score = scoreSkill(skill, task, stack);
    if (score > 0) {
      scored.push({ skill, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const truncated = scored.length > maxSkills;
  const selected = scored.slice(0, maxSkills);

  const scoresMap = new Map<string, number>();
  for (const { skill, score } of scored) {
    scoresMap.set(skill.id, score);
  }

  return {
    skills: selected.map(s => s.skill),
    scores: scoresMap,
    truncated,
  };
}

/**
 * Build prompt injection from selected skills.
 */
function buildSkillPrompt(skills: SkillDefinition[], skillContents: Map<string, string>): string {
  const sections: string[] = [];
  for (const skill of skills) {
    const content = skillContents.get(skill.id);
    if (content) {
      sections.push(`## Skill: ${skill.name}\n\n${content}`);
    }
  }
  return sections.join('\n\n---\n\n');
}

/**
 * Update skill stats after evaluation.
 */
function updateSkillStats(
  skill: SkillDefinition,
  success: boolean,
  coverage: number,
  sprintId: string,
): SkillDefinition {
  const stats = { ...skill.stats };
  const prevTotal = stats.totalUses;
  stats.totalUses += 1;
  stats.successRate = (stats.successRate * prevTotal + (success ? 1 : 0)) / stats.totalUses;
  stats.avgCoverage = (stats.avgCoverage * prevTotal + coverage) / stats.totalUses;
  stats.lastUsedInSprint = sprintId;
  return { ...skill, stats };
}

// ─── Mock Skill Definitions ──────────────────────────────────────────

function makeSkill(overrides: Partial<SkillDefinition>): SkillDefinition {
  return createSkillDefinition({
    id: overrides.id ?? 'generic-skill',
    name: overrides.name ?? 'Generic Skill',
    ...overrides,
  });
}

function makeTask(overrides: Partial<{ title: string; description: string }>): Pick<Task, 'title' | 'description'> {
  return {
    title: overrides.title ?? 'Default task',
    description: overrides.description ?? 'Default description',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Skill Selection E2E Integration', () => {
  let typescriptExpert: SkillDefinition;
  let reactSpecialist: SkillDefinition;
  let testingExpert: SkillDefinition;
  let securitySpecialist: SkillDefinition;
  let performanceOptimizer: SkillDefinition;

  let mockStack: ProjectStack;

  beforeEach(() => {
    typescriptExpert = makeSkill({
      id: 'typescript-expert',
      name: 'TypeScript Expert',
      category: 'language',
      triggers: ['typescript', 'type', 'interface', 'generic', 'enum', 'tsconfig'],
      stackDetection: { files: ['tsconfig.json'], dependencies: ['typescript'], commands: [] },
      composableWith: ['react-specialist', 'testing-expert'],
      priority: 10,
      stats: { totalUses: 20, successRate: 0.9, avgCoverage: 85, lastUsedInSprint: 'sprint-025' },
    });

    reactSpecialist = makeSkill({
      id: 'react-specialist',
      name: 'React Specialist',
      category: 'framework',
      triggers: ['react', 'component', 'jsx', 'hook', 'useState', 'useEffect'],
      stackDetection: { files: [], dependencies: ['react', 'react-dom'], commands: [] },
      composableWith: ['typescript-expert', 'testing-expert'],
      priority: 8,
      stats: { totalUses: 15, successRate: 0.85, avgCoverage: 80, lastUsedInSprint: 'sprint-024' },
    });

    testingExpert = makeSkill({
      id: 'testing-expert',
      name: 'Testing Expert',
      category: 'tool',
      triggers: ['test', 'spec', 'coverage', 'vitest', 'jest', 'mock'],
      stackDetection: { files: [], dependencies: ['vitest'], commands: [] },
      composableWith: ['typescript-expert', 'react-specialist'],
      priority: 7,
    });

    securitySpecialist = makeSkill({
      id: 'security-specialist',
      name: 'Security Specialist',
      category: 'domain',
      triggers: ['security', 'auth', 'jwt', 'xss', 'csrf', 'vulnerability'],
      stackDetection: { files: [], dependencies: [], commands: [] },
      composableWith: ['typescript-expert'],
      priority: 9,
    });

    performanceOptimizer = makeSkill({
      id: 'performance-optimizer',
      name: 'Performance Optimizer',
      category: 'domain',
      triggers: ['performance', 'optimize', 'cache', 'lazy', 'bundle'],
      stackDetection: { files: [], dependencies: [], commands: [] },
      composableWith: ['typescript-expert', 'react-specialist'],
      priority: 6,
    });

    mockStack = {
      language: 'typescript',
      framework: 'react',
      dependencies: ['typescript', 'react', 'react-dom', 'vitest'],
      buildTool: 'tsc',
      testFramework: 'vitest',
      detectedAt: new Date().toISOString(),
    };
  });

  // ─── Stack Detection ───────────────────────────────────────────

  it('detects TypeScript + React stack from project files', () => {
    const fileExists = (path: string) => {
      return path === 'tsconfig.json' || path === 'package.json';
    };
    const readPkg = () => ({
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
    });
    const stack = detectProjectStack(fileExists, readPkg);
    expect(stack.language).toBe('typescript');
    expect(stack.framework).toBe('react');
    expect(stack.testFramework).toBe('vitest');
    expect(stack.dependencies).toContain('react');
    expect(stack.dependencies).toContain('typescript');
  });

  it('detects JavaScript when no tsconfig.json', () => {
    const fileExists = (path: string) => path === 'package.json';
    const readPkg = () => ({
      dependencies: { express: '^4.0.0' },
      devDependencies: { jest: '^29.0.0' },
    });
    const stack = detectProjectStack(fileExists, readPkg);
    expect(stack.language).toBe('javascript');
    expect(stack.framework).toBe('express');
    expect(stack.testFramework).toBe('jest');
  });

  // ─── Skill Selection ──────────────────────────────────────────

  it('selects typescript-expert and react-specialist for React component task', () => {
    const task = makeTask({
      title: 'Build React login component',
      description: 'Create a login page component with form validation using TypeScript',
    });
    const skills = [typescriptExpert, reactSpecialist, testingExpert, securitySpecialist, performanceOptimizer];
    const result = selectSkills(task, skills, mockStack);
    const selectedIds = result.skills.map(s => s.id);
    expect(selectedIds).toContain('typescript-expert');
    expect(selectedIds).toContain('react-specialist');
  });

  it('selects security-specialist for JWT auth task', () => {
    const task = makeTask({
      title: 'Fix JWT authentication vulnerability',
      description: 'Token validation has a critical security flaw with CSRF',
    });
    const skills = [typescriptExpert, reactSpecialist, testingExpert, securitySpecialist];
    const result = selectSkills(task, skills, mockStack);
    const selectedIds = result.skills.map(s => s.id);
    expect(selectedIds).toContain('security-specialist');
  });

  it('selects testing-expert for test coverage task', () => {
    const task = makeTask({
      title: 'Write unit tests for auth module',
      description: 'Add comprehensive test coverage with vitest mocks',
    });
    const skills = [typescriptExpert, reactSpecialist, testingExpert, securitySpecialist];
    const result = selectSkills(task, skills, mockStack);
    const selectedIds = result.skills.map(s => s.id);
    expect(selectedIds).toContain('testing-expert');
  });

  it('returns empty selection when no skills match and all disabled', () => {
    const task = makeTask({
      title: 'Deploy to production',
      description: 'Set up CI/CD pipeline for deployment',
    });
    const disabledSkill = { ...securitySpecialist, enabled: false };
    const noDepStack: ProjectStack = {
      ...mockStack,
      dependencies: [],
    };
    const result = selectSkills(task, [disabledSkill], noDepStack);
    expect(result.skills).toHaveLength(0);
  });

  it('returns empty when all skills disabled', () => {
    const disabled1 = { ...typescriptExpert, enabled: false };
    const disabled2 = { ...reactSpecialist, enabled: false };
    const task = makeTask({ title: 'Build React TypeScript component' });
    const result = selectSkills(task, [disabled1, disabled2], mockStack);
    expect(result.skills).toHaveLength(0);
  });

  it('respects maxSkills limit', () => {
    const task = makeTask({
      title: 'Build React login component with test coverage and security',
      description: 'TypeScript component with auth, tests, security, and performance optimization',
    });
    const skills = [typescriptExpert, reactSpecialist, testingExpert, securitySpecialist, performanceOptimizer];
    const result = selectSkills(task, skills, mockStack, 2);
    expect(result.skills.length).toBeLessThanOrEqual(2);
    expect(result.truncated).toBe(true);
  });

  it('truncated is false when within limit', () => {
    const task = makeTask({ title: 'Build React component' });
    const skills = [typescriptExpert, reactSpecialist];
    const result = selectSkills(task, skills, mockStack, 5);
    expect(result.truncated).toBe(false);
  });

  it('scores higher for stack dependency matches', () => {
    const task = makeTask({
      title: 'Add new feature',
      description: 'General feature addition',
    });
    const skills = [typescriptExpert, reactSpecialist, securitySpecialist];
    const result = selectSkills(task, skills, mockStack);
    // typescript-expert and react-specialist have stack dep matches
    const scores = result.scores;
    const tsScore = scores.get('typescript-expert') ?? 0;
    const secScore = scores.get('security-specialist') ?? 0;
    expect(tsScore).toBeGreaterThan(secScore);
  });

  it('scores higher for proven skills with good stats', () => {
    const provenSkill = makeSkill({
      id: 'proven-tool',
      name: 'Proven Tool',
      category: 'tool',
      triggers: ['optimize'],
      stackDetection: { files: [], dependencies: [], commands: [] },
      priority: 6,
      stats: { totalUses: 50, successRate: 0.95, avgCoverage: 90, lastUsedInSprint: 'sprint-025' },
    });
    const newSkill = makeSkill({
      id: 'new-tool',
      name: 'New Tool',
      category: 'tool',
      triggers: ['optimize'],
      stackDetection: { files: [], dependencies: [], commands: [] },
      priority: 6,
      stats: createDefaultSkillStats(),
    });
    const task = makeTask({ title: 'Optimize build pipeline' });
    const emptyStack: ProjectStack = { ...mockStack, dependencies: [] };
    const provenScore = scoreSkill(provenSkill, task, emptyStack);
    const newScore = scoreSkill(newSkill, task, emptyStack);
    expect(provenScore).toBeGreaterThan(newScore);
  });

  // ─── Prompt Injection ─────────────────────────────────────────

  it('builds prompt with both SKILL.md contents', () => {
    const skills = [typescriptExpert, reactSpecialist];
    const contents = new Map<string, string>([
      ['typescript-expert', '# TypeScript Expert\n\nUse strict typing. Prefer interfaces.'],
      ['react-specialist', '# React Specialist\n\nUse functional components. Prefer hooks.'],
    ]);
    const prompt = buildSkillPrompt(skills, contents);
    expect(prompt).toContain('## Skill: TypeScript Expert');
    expect(prompt).toContain('Use strict typing');
    expect(prompt).toContain('## Skill: React Specialist');
    expect(prompt).toContain('functional components');
  });

  it('skips skills without content in prompt', () => {
    const skills = [typescriptExpert, reactSpecialist];
    const contents = new Map<string, string>([
      ['typescript-expert', '# TypeScript Expert\n\nContent here.'],
    ]);
    const prompt = buildSkillPrompt(skills, contents);
    expect(prompt).toContain('TypeScript Expert');
    expect(prompt).not.toContain('## Skill: React Specialist');
  });

  it('separates skill sections with dividers', () => {
    const skills = [typescriptExpert, reactSpecialist];
    const contents = new Map<string, string>([
      ['typescript-expert', 'TS content'],
      ['react-specialist', 'React content'],
    ]);
    const prompt = buildSkillPrompt(skills, contents);
    expect(prompt).toContain('---');
  });

  // ─── Stats Update After Evaluation ────────────────────────────

  it('updates stats after successful evaluation', () => {
    const updated = updateSkillStats(typescriptExpert, true, 90, 'sprint-026');
    expect(updated.stats.totalUses).toBe(21);
    expect(updated.stats.successRate).toBeGreaterThan(typescriptExpert.stats.successRate * 0.9);
    expect(updated.stats.lastUsedInSprint).toBe('sprint-026');
  });

  it('updates stats after failed evaluation', () => {
    const updated = updateSkillStats(typescriptExpert, false, 30, 'sprint-026');
    expect(updated.stats.totalUses).toBe(21);
    expect(updated.stats.successRate).toBeLessThan(typescriptExpert.stats.successRate);
  });

  it('calculates rolling average coverage', () => {
    const fresh = makeSkill({
      id: 'fresh',
      name: 'Fresh',
      stats: { totalUses: 1, successRate: 1.0, avgCoverage: 50, lastUsedInSprint: 'sprint-001' },
    });
    const updated = updateSkillStats(fresh, true, 100, 'sprint-002');
    expect(updated.stats.avgCoverage).toBe(75); // (50 * 1 + 100) / 2
  });

  // ─── Full E2E Flow ────────────────────────────────────────────

  it('full E2E: detect stack -> select skills -> build prompt -> update stats', () => {
    // Step 1: Detect stack
    const fileExists = (path: string) => path === 'tsconfig.json' || path === 'package.json';
    const readPkg = () => ({
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
    });
    const stack = detectProjectStack(fileExists, readPkg);
    expect(stack.language).toBe('typescript');
    expect(stack.framework).toBe('react');

    // Step 2: Create task
    const task = makeTask({
      title: 'Build React login component',
      description: 'Create a TypeScript React component with form validation',
    });

    // Step 3: Select skills
    const allSkills = [typescriptExpert, reactSpecialist, testingExpert, securitySpecialist];
    const selection = selectSkills(task, allSkills, stack);
    expect(selection.skills.length).toBeGreaterThan(0);

    // Step 4: Build prompt
    const contents = new Map<string, string>();
    for (const skill of selection.skills) {
      contents.set(skill.id, `# ${skill.name}\n\nExpert knowledge here.`);
    }
    const prompt = buildSkillPrompt(selection.skills, contents);
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Skill:');

    // Step 5: Simulate evaluation and update stats
    for (const skill of selection.skills) {
      const updated = updateSkillStats(skill, true, 85, 'sprint-027');
      expect(updated.stats.totalUses).toBeGreaterThan(skill.stats.totalUses);
      expect(updated.stats.lastUsedInSprint).toBe('sprint-027');
    }
  });

  it('handles empty skill pool gracefully', () => {
    const task = makeTask({ title: 'Build something' });
    const result = selectSkills(task, [], mockStack);
    expect(result.skills).toHaveLength(0);
    expect(result.scores.size).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
