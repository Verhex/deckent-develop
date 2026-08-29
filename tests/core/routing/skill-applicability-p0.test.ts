import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveCanonicalSkillApplicability,
  evaluateSkillApplicability,
  SKILL_APPLICABILITY_VERSION,
} from '../../../src/core/routing/skill-applicability.js';
import {
  collectSkillTaskEvidence,
  normalizeEvidencePath,
} from '../../../src/core/routing/skill-task-evidence.js';
import { createSkillDefinition } from '../../../src/core/skill-types.js';
import type { Task } from '../../../src/core/task-types.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-skill-applicability-'));
  roots.push(value);
  return value;
}

function task(id: string, filesWrite: string[], directories: string[] = []): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Structural task evidence only.',
    status: 'PENDING' as Task['status'],
    priority: 'NORMAL',
    effort: 'normal',
    scope: { filesRead: [], filesWrite, directories },
  } as Task;
}

function pythonSkill(overrides: Record<string, unknown> = {}) {
  return createSkillDefinition({
    id: 'python-expert',
    name: 'Python Expert',
    description: 'Python testing and implementation guidance',
    category: 'language',
    triggers: ['python', 'pytest', 'testing'],
    stackDetection: {
      files: ['setup.py', 'pyproject.toml', 'requirements.txt'],
      dependencies: [],
      commands: [],
    },
    ...overrides,
  });
}

function typescriptSkill() {
  return createSkillDefinition({
    id: 'typescript-expert',
    name: 'TypeScript Expert',
    description: 'TypeScript guidance',
    category: 'language',
    triggers: ['typescript'],
    stackDetection: {
      files: ['tsconfig.json'],
      dependencies: ['typescript'],
      commands: [],
    },
  });
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('skill applicability P0 — structural authority', () => {
  it('derives language ownership only from structural stack metadata, never prose/triggers', () => {
    const first = deriveCanonicalSkillApplicability(pythonSkill());
    const poisoned = deriveCanonicalSkillApplicability(pythonSkill({
      description: 'TypeScript React docs security testing everything',
      triggers: ['typescript', 'react', 'docs', 'security'],
    }));

    expect(SKILL_APPLICABILITY_VERSION).toBe(1);
    expect(first).toEqual(poisoned);
    expect(first).toMatchObject({
      status: 'applicable-profile',
      origin: 'derived-applicability',
      profile: {
        applicabilityVersion: 1,
        required: { all: [{ kind: 'language', value: 'python', scope: 'task' }] },
      },
    });
  });

  it('holds an unknown language category instead of minting wildcard authority', () => {
    const result = deriveCanonicalSkillApplicability(createSkillDefinition({
      id: 'novel-language-expert',
      name: 'Novel Language Expert',
      description: 'Novel language guidance',
      category: 'language',
      triggers: ['novel'],
      stackDetection: { files: [], dependencies: [], commands: [] },
    }));

    expect(result).toMatchObject({
      status: 'unroutable',
      diagnostic: { disposition: 'HOLD', reasonCode: 'language-identity-unresolved' },
    });
  });

  it('rejects Python for a TypeScript task even when the repository root contains Python markers', () => {
    const projectRoot = root();
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'feature.ts'), 'export const feature = true;\n');
    writeFileSync(join(projectRoot, 'tsconfig.json'), '{}\n');
    writeFileSync(join(projectRoot, 'pyproject.toml'), '[project]\nname = "side-tool"\n');
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: { typescript: '^6.0.0' },
    }));

    const evidence = collectSkillTaskEvidence(
      projectRoot,
      task('ts-task', ['src/feature.ts']),
      { platform: { os: 'linux', arch: 'x64', wsl: false } },
    );
    const python = deriveCanonicalSkillApplicability(pythonSkill());
    const typescript = deriveCanonicalSkillApplicability(typescriptSkill());
    if (python.status !== 'applicable-profile' || typescript.status !== 'applicable-profile') {
      throw new Error('fixtures must derive');
    }

    expect(evidence.languages).toEqual(['typescript']);
    expect(evaluateSkillApplicability(python.profile, evidence)).toMatchObject({
      admitted: false,
      reason: 'required-evidence-missing',
    });
    expect(evaluateSkillApplicability(typescript.profile, evidence)).toMatchObject({ admitted: true });
  });

  it('uses explicit task files as language authority inside a mixed-language monorepo directory', () => {
    const projectRoot = root();
    mkdirSync(join(projectRoot, 'packages', 'mixed'), { recursive: true });
    writeFileSync(join(projectRoot, 'packages', 'mixed', 'feature.ts'), 'export const feature = true;\n');
    writeFileSync(join(projectRoot, 'packages', 'mixed', 'tool.py'), 'print("tool")\n');
    const evidence = collectSkillTaskEvidence(
      projectRoot,
      task('mixed-task', ['packages/mixed/feature.ts'], ['packages/mixed']),
      { platform: { os: 'linux', arch: 'x64', wsl: false } },
    );

    expect(evidence.declaredScopePaths).toEqual(['packages/mixed/feature.ts']);
    expect(evidence.scopePaths).toContain('packages/mixed/tool.py');
    expect(evidence.languages).toEqual(['typescript']);
  });

  it('admits Python from a new task-local .py write path without requiring an existing file', () => {
    const projectRoot = root();
    const evidence = collectSkillTaskEvidence(
      projectRoot,
      task('py-task', ['services/worker/main.py']),
      { platform: { os: 'darwin', arch: 'arm64', wsl: false } },
    );
    const python = deriveCanonicalSkillApplicability(pythonSkill());
    if (python.status !== 'applicable-profile') throw new Error('fixture must derive');

    expect(evidence.languages).toEqual(['python']);
    expect(evaluateSkillApplicability(python.profile, evidence)).toMatchObject({ admitted: true });
  });

  it('normalizes Windows/WSL separators byte-identically for task-local evidence', () => {
    expect(normalizeEvidencePath('packages\\api\\src\\index.ts')).toBe('packages/api/src/index.ts');
    expect(normalizeEvidencePath('./packages/api/src/../src/index.ts')).toBe('packages/api/src/index.ts');

    const projectRoot = root();
    const evidence = collectSkillTaskEvidence(
      projectRoot,
      task('win-task', ['packages\\api\\src\\index.ts']),
      { platform: { os: 'win32', arch: 'x64', wsl: false } },
    );
    expect(evidence.scopePaths).toEqual(['packages/api/src/index.ts']);
    expect(evidence.languages).toEqual(['typescript']);
  });

  it('rejects POSIX, Windows-drive, and UNC absolute scope paths on every host', () => {
    const projectRoot = root();
    const evidence = collectSkillTaskEvidence(
      projectRoot,
      task('escape-task', [
        '/outside/escape.py',
        'C:\\outside\\escape.py',
        '\\\\server\\share\\escape.py',
      ]),
      { platform: { os: 'linux', arch: 'x64', wsl: false } },
    );

    expect(evidence.declaredScopePaths).toEqual([]);
    expect(evidence.scopePaths).toEqual([]);
    expect(evidence.languages).toEqual([]);
  });

  it('enforces Linux, macOS, Windows-native, and WSL platform predicates exactly', () => {
    const derived = deriveCanonicalSkillApplicability(createSkillDefinition({
      id: 'platform-specific',
      name: 'Platform Specific',
      description: 'Structural platform contract',
      category: 'domain',
      applicability: {
        applicabilityVersion: 1,
        required: { all: [], any: [] },
        forbidden: [],
        platforms: ['wsl', 'darwin', 'win32'],
      },
    }));
    if (derived.status !== 'applicable-profile') throw new Error('fixture must derive');
    const projectRoot = root();
    const platforms = [
      { os: 'linux' as const, arch: 'x64', wsl: false, admitted: false },
      { os: 'linux' as const, arch: 'x64', wsl: true, admitted: true },
      { os: 'darwin' as const, arch: 'arm64', wsl: false, admitted: true },
      { os: 'win32' as const, arch: 'x64', wsl: false, admitted: true },
    ];

    for (const { admitted, ...platform } of platforms) {
      const evidence = collectSkillTaskEvidence(
        projectRoot, task(`platform-${platform.os}-${platform.wsl}`, ['src/index.ts']), { platform },
      );
      expect(evaluateSkillApplicability(derived.profile, evidence).admitted).toBe(admitted);
    }
  });

  it('enforces authored required, forbidden, platform, tenant, and policy evidence together', () => {
    const definition = createSkillDefinition({
      id: 'regulated-postgres',
      name: 'Regulated Postgres',
      description: 'Database operations',
      category: 'domain',
      applicability: {
        applicabilityVersion: 1,
        required: {
          all: [
            { kind: 'dependency', value: 'pg', scope: 'project' },
            { kind: 'tenant', value: 'tenant-a', scope: 'task' },
            { kind: 'policy-tag', value: 'regulated', scope: 'task' },
          ],
        },
        forbidden: [{ kind: 'framework', value: 'sqlite', scope: 'project' }],
        platforms: ['linux'],
      },
    });
    const derived = deriveCanonicalSkillApplicability(definition);
    expect(derived).toMatchObject({ status: 'applicable-profile', origin: 'manifest-applicability' });
    if (derived.status !== 'applicable-profile') return;

    const projectRoot = root();
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ dependencies: { pg: '^9' } }));
    const input = task('tenant-task', ['src/db.ts']);
    input.actor = { id: 'owner', tenantId: 'tenant-a' };
    input.routingMeta = { policyTags: ['regulated'] } as Task['routingMeta'];
    const evidence = collectSkillTaskEvidence(projectRoot, input, {
      platform: { os: 'linux', arch: 'x64', wsl: false },
    });

    expect(evaluateSkillApplicability(derived.profile, evidence)).toMatchObject({ admitted: true });
    expect(evaluateSkillApplicability(derived.profile, {
      ...evidence,
      frameworks: ['sqlite'],
    })).toMatchObject({ admitted: false, reason: 'forbidden-evidence-present' });
    expect(evaluateSkillApplicability(derived.profile, {
      ...evidence,
      partial: true,
    })).toMatchObject({ admitted: false, reason: 'partial-evidence' });
  });
});
