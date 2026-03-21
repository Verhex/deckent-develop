import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillSandbox } from '../../../src/core/marketplace/skill-sandbox.js';
import type { SkillSandboxFS, SafetyReport, ManifestValidation } from '../../../src/core/marketplace/skill-sandbox.js';

// ─── Mock FS ─────────────────────────────────────────────────────────────────

function createMockFS(files: Record<string, string> = {}, dirs: Set<string> = new Set()): SkillSandboxFS {
  const store = new Map(Object.entries(files));

  return {
    existsSync: vi.fn((p: string) => store.has(p) || dirs.has(p)),
    mkdirSync: vi.fn((p: string) => { dirs.add(p); }),
    readdirSync: vi.fn((dirPath: string) => {
      const entries: Array<{ name: string; isDirectory: () => boolean }> = [];
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      const seen = new Set<string>();

      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const parts = rest.split('/');
          const name = parts[0]!;
          if (seen.has(name)) continue;
          seen.add(name);
          entries.push({
            name,
            isDirectory: () => parts.length > 1,
          });
        }
      }
      return entries;
    }),
    readFileSync: vi.fn((p: string) => {
      if (!store.has(p)) throw new Error(`ENOENT: ${p}`);
      return store.get(p)!;
    }),
    renameSync: vi.fn((from: string, to: string) => {
      for (const [key, val] of store) {
        if (key.startsWith(from)) {
          store.delete(key);
          store.set(key.replace(from, to), val);
        }
      }
    }),
    writeFileSync: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SkillSandbox', () => {
  const projectRoot = '/test/project';

  describe('validateSkillSafety', () => {
    it('returns safe for clean skill', () => {
      const fs = createMockFS({
        '/skills/test-skill/index.ts': 'export function hello() { return "hi"; }',
        '/skills/test-skill/manifest.json': '{"id":"test"}',
      }, new Set(['/skills/test-skill']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/test-skill');
      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.scannedFiles).toBeGreaterThan(0);
    });

    it('detects eval() usage', () => {
      const fs = createMockFS({
        '/skills/bad/code.ts': 'const result = eval("2+2");',
      }, new Set(['/skills/bad']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/bad');
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.includes('eval()'))).toBe(true);
    });

    it('detects child_process usage', () => {
      const fs = createMockFS({
        '/skills/bad/runner.ts': 'import { exec } from "node:child_process";',
      }, new Set(['/skills/bad']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/bad');
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.includes('child_process'))).toBe(true);
    });

    it('detects process.env access', () => {
      const fs = createMockFS({
        '/skills/bad/env.ts': 'const key = process.env.SECRET;',
      }, new Set(['/skills/bad']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/bad');
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.includes('Environment variable'))).toBe(true);
    });

    it('detects Function constructor', () => {
      const fs = createMockFS({
        '/skills/bad/dyn.ts': 'const fn = new Function("return 42");',
      }, new Set(['/skills/bad']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/bad');
      expect(result.safe).toBe(false);
    });

    it('returns unsafe for non-existent directory', () => {
      const fs = createMockFS();
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/nonexistent');
      expect(result.safe).toBe(false);
      expect(result.issues).toContain('Skill directory does not exist');
    });

    it('counts scanned files correctly', () => {
      const fs = createMockFS({
        '/skills/multi/a.ts': 'const x = 1;',
        '/skills/multi/b.ts': 'const y = 2;',
        '/skills/multi/c.json': '{}',
      }, new Set(['/skills/multi']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/multi');
      expect(result.scannedFiles).toBe(3);
    });
  });

  describe('validateManifest', () => {
    it('returns valid for correct manifest', () => {
      const fs = createMockFS({
        '/manifest.json': JSON.stringify({ id: 'test', name: 'Test Skill', version: '1.0.0' }),
      });
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateManifest('/manifest.json');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing id', () => {
      const fs = createMockFS({
        '/manifest.json': JSON.stringify({ name: 'Test', version: '1.0.0' }),
      });
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateManifest('/manifest.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('id'))).toBe(true);
    });

    it('rejects invalid semver', () => {
      const fs = createMockFS({
        '/manifest.json': JSON.stringify({ id: 'x', name: 'X', version: 'abc' }),
      });
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateManifest('/manifest.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('semver'))).toBe(true);
    });

    it('rejects non-existent manifest', () => {
      const fs = createMockFS();
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateManifest('/nonexistent');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Manifest file does not exist');
    });

    it('handles parse errors', () => {
      const fs = createMockFS({
        '/manifest.json': 'not json{{{',
      });
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateManifest('/manifest.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('parse'))).toBe(true);
    });
  });

  describe('quarantine', () => {
    it('moves skill to .quarantine directory', () => {
      const skillDir = `${projectRoot}/.deckent/skills/bad-skill`;
      const fs = createMockFS({}, new Set([skillDir]));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.quarantine('bad-skill');
      expect(result).toBe(true);
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('returns false for non-existent skill', () => {
      const fs = createMockFS();
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.quarantine('nonexistent');
      expect(result).toBe(false);
    });

    it('creates quarantine directory if needed', () => {
      const skillDir = `${projectRoot}/.deckent/skills/bad-skill`;
      const fs = createMockFS({}, new Set([skillDir]));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      sandbox.quarantine('bad-skill');
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.quarantine'), { recursive: true });
    });
  });

  describe('trustSkill / isTrusted', () => {
    it('built-in skills are trusted', () => {
      const fs = createMockFS();
      const sandbox = new SkillSandbox(projectRoot, { fs });

      expect(sandbox.isTrusted('typescript-expert')).toBe(true);
      expect(sandbox.isTrusted('react-expert')).toBe(true);
    });

    it('unknown skills are not trusted by default', () => {
      const fs = createMockFS();
      const sandbox = new SkillSandbox(projectRoot, { fs });

      expect(sandbox.isTrusted('custom-skill')).toBe(false);
    });

    it('trustSkill adds skill to trusted set', () => {
      const fs = createMockFS();
      const sandbox = new SkillSandbox(projectRoot, { fs });

      sandbox.trustSkill('my-custom-skill');
      expect(sandbox.isTrusted('my-custom-skill')).toBe(true);
    });

    it('extraTrusted option pre-trusts skills', () => {
      const fs = createMockFS();
      const sandbox = new SkillSandbox(projectRoot, { fs, extraTrusted: ['pre-trusted'] });

      expect(sandbox.isTrusted('pre-trusted')).toBe(true);
    });
  });

  describe('getBuiltinTrustedSkills', () => {
    it('returns list of built-in trusted skills', () => {
      const fs = createMockFS();
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const builtins = sandbox.getBuiltinTrustedSkills();
      expect(builtins).toContain('typescript-expert');
      expect(builtins).toContain('react-expert');
      expect(builtins).toContain('node-expert');
      expect(builtins.length).toBeGreaterThanOrEqual(5);
    });
  });
});
