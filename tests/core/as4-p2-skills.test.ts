// ─── AS4-P2 Native Skills Passthrough — hermetic tests ───────────────────────
// Tests for the useNativeSkills / native_skills_passthrough opt-in feature in
// capability-realizer.ts. All tests are hermetic: tmpdir for file I/O, no
// gitignored state read, no spawnSync.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CapabilitySpec } from '../../src/core/capability-spec.js';
import { realizeCapabilities } from '../../src/orchestra/capability-realizer.js';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

interface SkillFixture {
  projectRoot: string;
  cleanup: () => void;
}

function makeSkillFixture(skillIds: string[]): SkillFixture {
  const projectRoot = join(tmpdir(), `as4p2-${process.pid}-${Math.floor(Math.random() * 1e6)}`);
  const skillsBase = join(projectRoot, '.claude', 'skills');
  mkdirSync(skillsBase, { recursive: true });
  for (const id of skillIds) {
    mkdirSync(join(skillsBase, id), { recursive: true });
  }
  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

// ─── Default-off (backward-compat) ───────────────────────────────────────────

describe('AS4-P2 — default-off (backward-compat)', () => {
  it('no useNativeSkills flag → no --setting-sources args (empty spec)', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['typescript-expert']);
    try {
      const spec: CapabilitySpec = {};
      const result = realizeCapabilities(spec, 'claude', { projectRoot });
      expect(result.extraArgs).toHaveLength(0);
      expect(result.textFallback).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('useNativeSkills: false → no --setting-sources args', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['typescript-expert']);
    try {
      const spec: CapabilitySpec = {};
      const result = realizeCapabilities(spec, 'claude', {
        projectRoot,
        useNativeSkills: false,
      });
      expect(result.extraArgs).toHaveLength(0);
      expect(result.textFallback).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('useNativeSkills: true but no projectRoot → no --setting-sources (safe)', () => {
    const spec: CapabilitySpec = {};
    const result = realizeCapabilities(spec, 'claude', { useNativeSkills: true });
    expect(result.extraArgs).toHaveLength(0);
    expect(result.textFallback).toBeUndefined();
  });

  it('useNativeSkills: true but missing .claude/skills dir → no crash, no args', () => {
    const projectRoot = join(tmpdir(), `as4p2-noskilsdir-${process.pid}`);
    mkdirSync(projectRoot, { recursive: true });
    try {
      const spec: CapabilitySpec = {};
      const result = realizeCapabilities(spec, 'claude', {
        projectRoot,
        useNativeSkills: true,
      });
      expect(result.extraArgs).toHaveLength(0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

// ─── Config-toggle: useNativeSkills: true (claude) ───────────────────────────

describe('AS4-P2 — config-toggle (claude)', () => {
  it('single skill dir → one --setting-sources entry', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['typescript-expert']);
    try {
      const spec: CapabilitySpec = {};
      const result = realizeCapabilities(spec, 'claude', {
        projectRoot,
        useNativeSkills: true,
      });
      const args = [...result.extraArgs];
      expect(args).toContain('--setting-sources');
      expect(args.length).toBe(2);
      expect(args[0]).toBe('--setting-sources');
      expect(args[1]).toContain('typescript-expert');
    } finally {
      cleanup();
    }
  });

  it('two skill dirs → two --setting-sources entries (in order)', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['skill-a', 'skill-b']);
    try {
      const spec: CapabilitySpec = {};
      const result = realizeCapabilities(spec, 'claude', {
        projectRoot,
        useNativeSkills: true,
      });
      const args = [...result.extraArgs];
      expect(args.length).toBe(4);
      expect(args[0]).toBe('--setting-sources');
      expect(args[2]).toBe('--setting-sources');
      const paths = [args[1], args[3]];
      expect(paths.some((p) => p.includes('skill-a'))).toBe(true);
      expect(paths.some((p) => p.includes('skill-b'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('empty skills dir → no --setting-sources entries (dir exists but empty)', () => {
    const { projectRoot, cleanup } = makeSkillFixture([]);
    try {
      const spec: CapabilitySpec = {};
      const result = realizeCapabilities(spec, 'claude', {
        projectRoot,
        useNativeSkills: true,
      });
      expect(result.extraArgs).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});

// ─── Skill-dir maps to correct --setting-sources path ────────────────────────

describe('AS4-P2 — skill-dir → --setting-sources path mapping', () => {
  it('path contains projectRoot + .claude/skills/<id>', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['my-skill']);
    try {
      const result = realizeCapabilities({}, 'claude', {
        projectRoot,
        useNativeSkills: true,
      });
      const args = [...result.extraArgs];
      const settingSourcePath = args[1];
      expect(settingSourcePath).toContain('.claude');
      expect(settingSourcePath).toContain('skills');
      expect(settingSourcePath).toContain('my-skill');
      expect(settingSourcePath).toContain(projectRoot);
    } finally {
      cleanup();
    }
  });

  it('no extraArgs for non-claude even with useNativeSkills', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['typescript-expert']);
    try {
      const result = realizeCapabilities({}, 'ollama', {
        projectRoot,
        useNativeSkills: true,
      });
      expect(result.extraArgs).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});

// ─── Non-claude text-fallback with native skills ──────────────────────────────

describe('AS4-P2 — non-claude text-fallback', () => {
  it('useNativeSkills: true + ollama → textFallback contains skill id, no extraArgs', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['my-native-skill']);
    try {
      const result = realizeCapabilities({}, 'ollama', {
        projectRoot,
        useNativeSkills: true,
      });
      expect(result.extraArgs).toHaveLength(0);
      expect(result.textFallback).toBeDefined();
      expect(result.textFallback).toContain('my-native-skill');
    } finally {
      cleanup();
    }
  });

  it('useNativeSkills: true + codex → textFallback contains all skill ids', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['skill-x', 'skill-y']);
    try {
      const result = realizeCapabilities({}, 'codex', {
        projectRoot,
        useNativeSkills: true,
      });
      expect(result.extraArgs).toHaveLength(0);
      expect(result.textFallback).toBeDefined();
      expect(result.textFallback).toContain('skill-x');
      expect(result.textFallback).toContain('skill-y');
    } finally {
      cleanup();
    }
  });

  it('useNativeSkills: false + ollama + skills dir → no textFallback', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['my-native-skill']);
    try {
      const result = realizeCapabilities({}, 'ollama', {
        projectRoot,
        useNativeSkills: false,
      });
      expect(result.extraArgs).toHaveLength(0);
      expect(result.textFallback).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

// ─── Composability: native skills + spec-level skills together ────────────────

describe('AS4-P2 — composability with existing spec', () => {
  it('claude: spec skill + native skill → both --append-system-prompt and --setting-sources', () => {
    const { projectRoot, cleanup } = makeSkillFixture(['native-ts']);
    try {
      const spec: CapabilitySpec = {
        skills: [{ skillId: 'injected', content: 'Injected content' }],
      };
      const result = realizeCapabilities(spec, 'claude', {
        projectRoot,
        useNativeSkills: true,
      });
      const args = [...result.extraArgs];
      expect(args).toContain('--append-system-prompt');
      expect(args).toContain('--setting-sources');
      expect(args).toContain('Injected content');
      expect(args.some((a) => a.includes('native-ts'))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
