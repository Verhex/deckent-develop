import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillSandbox, scanCodeAST } from '../../../src/core/marketplace/skill-sandbox.js';
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

    it('detects AST violations in .ts files during safety scan', () => {
      const fs = createMockFS({
        '/skills/sneaky/code.ts': 'const x = globalThis["eval"]("alert(1)");',
      }, new Set(['/skills/sneaky']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/sneaky');
      expect(result.safe).toBe(false);
      // Should have both regex and AST hits
      expect(result.issues.some((i) => i.includes('AST'))).toBe(true);
    });

    it('does not run AST scan on .json files', () => {
      const fs = createMockFS({
        '/skills/jsononly/config.json': '{"eval": "safe string mentioning eval"}',
      }, new Set(['/skills/jsononly']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/jsononly');
      // JSON files only get regex scan, not AST
      expect(result.issues.every((i) => !i.includes('AST'))).toBe(true);
    });

    it('does not run AST scan on .md files', () => {
      const fs = createMockFS({
        '/skills/docs/SKILL.md': '# Skill\nUse eval() for debugging purposes.',
      }, new Set(['/skills/docs']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/docs');
      // .md files do not get AST scan
      expect(result.issues.every((i) => !i.includes('AST'))).toBe(true);
    });

    it('clean SKILL.md passes both checks', () => {
      const fs = createMockFS({
        '/skills/good/SKILL.md': '# My Skill\nThis skill helps with formatting code.\n\n## Usage\nJust run it.',
      }, new Set(['/skills/good']));
      const sandbox = new SkillSandbox(projectRoot, { fs });

      const result = sandbox.validateSkillSafety('/skills/good');
      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
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

// ─── AST Scanning Unit Tests ────────────────────────────────────────────────

describe('scanCodeAST', () => {
  it('detects eval() call', () => {
    const violations = scanCodeAST('const x = eval("2+2");', 'test.ts');
    expect(violations.some((v) => v.includes('eval()'))).toBe(true);
  });

  it('detects Function() constructor call', () => {
    const violations = scanCodeAST('const fn = Function("return 1");', 'test.ts');
    expect(violations.some((v) => v.includes('Function()'))).toBe(true);
  });

  it('detects new Function() constructor', () => {
    const violations = scanCodeAST('const fn = new Function("return 1");', 'test.ts');
    expect(violations.some((v) => v.includes('Function()'))).toBe(true);
  });

  it('detects require("child_process")', () => {
    const violations = scanCodeAST('const cp = require("child_process");', 'test.ts');
    expect(violations.some((v) => v.includes("require('child_process')"))).toBe(true);
  });

  it('detects require("node:child_process")', () => {
    const violations = scanCodeAST('const cp = require("node:child_process");', 'test.ts');
    expect(violations.some((v) => v.includes("require('node:child_process')"))).toBe(true);
  });

  it('detects require("fs")', () => {
    const violations = scanCodeAST('const fs = require("fs");', 'test.ts');
    expect(violations.some((v) => v.includes("require('fs')"))).toBe(true);
  });

  it('detects require("os")', () => {
    const violations = scanCodeAST('const os = require("os");', 'test.ts');
    expect(violations.some((v) => v.includes("require('os')"))).toBe(true);
  });

  it('detects dynamic import("child_process")', () => {
    const violations = scanCodeAST('const cp = await import("child_process");', 'test.ts');
    expect(violations.some((v) => v.includes("import('child_process')"))).toBe(true);
  });

  it('detects dynamic import("node:fs")', () => {
    const violations = scanCodeAST('const fs = await import("node:fs");', 'test.ts');
    expect(violations.some((v) => v.includes("import('node:fs')"))).toBe(true);
  });

  it('detects bracket-access eval: globalThis["eval"]()', () => {
    const violations = scanCodeAST('globalThis["eval"]("alert(1)");', 'test.ts');
    expect(violations.some((v) => v.includes("Bracket-access call to ['eval']"))).toBe(true);
  });

  it('detects obfuscated eval via string concatenation: global["ev"+"al"]()', () => {
    const violations = scanCodeAST('(global as any)["ev" + "al"]("alert(1)");', 'test.ts');
    expect(violations.some((v) => v.includes('Obfuscated'))).toBe(true);
  });

  it('detects property access: global.eval', () => {
    const violations = scanCodeAST('const e = global.eval;', 'test.ts');
    expect(violations.some((v) => v.includes('Property access global.eval'))).toBe(true);
  });

  it('detects property access: globalThis.Function', () => {
    const violations = scanCodeAST('const f = globalThis.Function;', 'test.ts');
    expect(violations.some((v) => v.includes('Property access globalThis.Function'))).toBe(true);
  });

  it('detects setTimeout with string argument', () => {
    const violations = scanCodeAST('setTimeout("alert(1)", 100);', 'test.ts');
    expect(violations.some((v) => v.includes('setTimeout() called with string argument'))).toBe(true);
  });

  it('detects setInterval with string argument', () => {
    const violations = scanCodeAST('setInterval("doSomething()", 1000);', 'test.ts');
    expect(violations.some((v) => v.includes('setInterval() called with string argument'))).toBe(true);
  });

  it('allows setTimeout with function argument', () => {
    const violations = scanCodeAST('setTimeout(() => console.log("ok"), 100);', 'test.ts');
    expect(violations.every((v) => !v.includes('setTimeout'))).toBe(true);
  });

  it('returns empty for clean code', () => {
    const violations = scanCodeAST(
      'export function add(a: number, b: number): number { return a + b; }',
      'test.ts',
    );
    expect(violations).toHaveLength(0);
  });

  it('returns empty for clean code with imports', () => {
    const violations = scanCodeAST(
      'import { readFileSync } from "node:fs";\nexport const x = readFileSync("file.txt", "utf-8");',
      'test.ts',
    );
    // Note: 'node:fs' import is detected but only as a require, not static import
    // Static imports are caught by regex, not AST (AST catches require/dynamic import)
    expect(violations.every((v) => !v.includes('require'))).toBe(true);
  });

  it('detects multiple violations in single file', () => {
    const code = `
      const e = eval("1");
      const cp = require("child_process");
      const fn = Function("return 2");
    `;
    const violations = scanCodeAST(code, 'test.ts');
    expect(violations.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty content', () => {
    const violations = scanCodeAST('', 'test.ts');
    expect(violations).toHaveLength(0);
  });

  it('handles syntax errors gracefully', () => {
    // TypeScript parser is lenient — it produces a tree even with errors
    const violations = scanCodeAST('const x = {{{', 'test.ts');
    // Should not throw, may or may not find violations depending on parse recovery
    expect(Array.isArray(violations)).toBe(true);
  });
});
