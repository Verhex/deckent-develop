/**
 * Tests for container-path-sanitizer.ts — Layer-2 container-path leakage gate.
 * Follows tests/orchestra/disk-verify.test.ts conventions (node:os tmpdir +
 * node:fs temp dirs, cleaned up in afterEach).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  sanitizeContainerPaths,
  sanitizeHostFacingFiles,
  isHostFacingFile,
  CONTAINER_WORKSPACE_RE,
  PORTABLE_PROJECT_DIR,
  HOST_PROJECT_DIR_TOKEN,
  CONTAINER_PATH_SANITIZED_CHANNEL,
} from '../../src/orchestra/container-path-sanitizer.js';

describe('container-path-sanitizer', () => {
  describe('constants', () => {
    it('exports the portable project dir token', () => {
      expect(PORTABLE_PROJECT_DIR).toBe('$CLAUDE_PROJECT_DIR');
    });

    it('exports the host project dir token alias', () => {
      expect(HOST_PROJECT_DIR_TOKEN).toBe('$CLAUDE_PROJECT_DIR');
    });

    it('exports the sanitized audit channel', () => {
      expect(CONTAINER_PATH_SANITIZED_CHANNEL).toBe('BRAIN→AUDITOR:CONTAINER_PATH_SANITIZED');
    });

    it('CONTAINER_WORKSPACE_RE is a global regex', () => {
      expect(CONTAINER_WORKSPACE_RE.flags).toContain('g');
    });
  });

  describe('sanitizeContainerPaths — boundary cases', () => {
    const cases: Array<{ name: string; input: string; expected: string; rewrites: number }> = [
      {
        name: 'segment with subpath',
        input: '/workspace/scripts/x.mjs',
        expected: '$CLAUDE_PROJECT_DIR/scripts/x.mjs',
        rewrites: 1,
      },
      {
        name: 'bare /workspace at end-of-string',
        input: '/workspace',
        expected: '$CLAUDE_PROJECT_DIR',
        rewrites: 1,
      },
      {
        name: 'two occurrences joined by shell operator',
        input: 'node /workspace/a && node /workspace/b',
        expected: 'node $CLAUDE_PROJECT_DIR/a && node $CLAUDE_PROJECT_DIR/b',
        rewrites: 2,
      },
      {
        name: 'inside JSON string value',
        input: '"command": "node /workspace/s.mjs"',
        expected: '"command": "node $CLAUDE_PROJECT_DIR/s.mjs"',
        rewrites: 1,
      },
      {
        name: 'dash suffix must stay unchanged',
        input: '/workspace-old/x',
        expected: '/workspace-old/x',
        rewrites: 0,
      },
      {
        name: 'dot suffix must stay unchanged',
        input: '/workspace.bak',
        expected: '/workspace.bak',
        rewrites: 0,
      },
      {
        name: 'codespaces /workspaces must stay unchanged',
        input: '/workspaces/foo',
        expected: '/workspaces/foo',
        rewrites: 0,
      },
      {
        name: '.deckent/workspace path must stay unchanged',
        input: '.deckent/workspace/IDENTITY.md',
        expected: '.deckent/workspace/IDENTITY.md',
        rewrites: 0,
      },
      {
        name: 'nested host workspace path must stay unchanged',
        input: 'cd /home/x/workspace/y',
        expected: 'cd /home/x/workspace/y',
        rewrites: 0,
      },
      {
        name: 'my-workspace relative dir must stay unchanged',
        input: 'my-workspace/file',
        expected: 'my-workspace/file',
        rewrites: 0,
      },
    ];

    for (const c of cases) {
      it(c.name, () => {
        const { content, rewrites } = sanitizeContainerPaths(c.input);
        expect(content).toBe(c.expected);
        expect(rewrites).toBe(c.rewrites);
      });
    }

    it('is idempotent — a second pass rewrites nothing', () => {
      const first = sanitizeContainerPaths('/workspace/scripts/x.mjs');
      const second = sanitizeContainerPaths(first.content);
      expect(second.rewrites).toBe(0);
      expect(second.content).toBe(first.content);
    });
  });

  describe('isHostFacingFile', () => {
    const positives = [
      '.claude/settings.json',
      '.claude/settings.local.json',
      'package.json',
      'sub/dir/package.json',
      '.github/workflows/ci.yml',
      '.github/workflows/deploy.yaml',
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml',
      '.pre-commit-config.yaml',
      'Makefile',
      'scripts/build.sh',
      'install.sh',
    ];

    const negatives = [
      'src/foo.ts',
      'tests/foo.test.ts',
      'Dockerfile',
      'Dockerfile.worker',
      'tsconfig.json',
      'vitest.config.ts',
      'vite.config.ts',
      'README.md',
      '.github/dependabot.yml',
      'docker-compose.txt',
      'makefile.txt',
    ];

    for (const p of positives) {
      it(`positive: ${p}`, () => {
        expect(isHostFacingFile(p)).toBe(true);
      });
    }

    for (const n of negatives) {
      it(`negative: ${n}`, () => {
        expect(isHostFacingFile(n)).toBe(false);
      });
    }

    it('normalizes windows separators', () => {
      expect(isHostFacingFile('.claude\\settings.json')).toBe(true);
    });

    it('handles a /workspace/-prefixed (container-absolute) host-facing path', () => {
      expect(isHostFacingFile('/workspace/package.json')).toBe(true);
    });
  });

  describe('sanitizeHostFacingFiles — real fs sweep', () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'cps-test-'));
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    function write(rel: string, content: string): void {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf8');
    }

    function read(rel: string): string {
      return readFileSync(join(root, rel), 'utf8');
    }

    it('rewrites leaks across all host-facing file types', () => {
      write('.claude/settings.json', '{"hook":"node /workspace/h.mjs"}');
      write('package.json', '{"scripts":{"x":"node /workspace/s.mjs"}}');
      write('.github/workflows/ci.yml', 'run: node /workspace/ci.mjs');
      write('docker-compose.yml', 'command: node /workspace/svc.mjs');
      write('Makefile', 'build:\n\tnode /workspace/m.mjs');

      const changed = [
        '.claude/settings.json',
        'package.json',
        '.github/workflows/ci.yml',
        'docker-compose.yml',
        'Makefile',
      ];
      const res = sanitizeHostFacingFiles(root, changed);

      expect(res.totalRewrites).toBe(5);
      expect(res.scanned).toBe(5);
      const rewrittenFiles = res.rewritten.map(r => r.file).sort();
      expect(rewrittenFiles).toEqual(changed.slice().sort());

      expect(read('.claude/settings.json')).toContain('$CLAUDE_PROJECT_DIR/h.mjs');
      expect(read('package.json')).toContain('$CLAUDE_PROJECT_DIR/s.mjs');
      expect(read('.github/workflows/ci.yml')).toContain('$CLAUDE_PROJECT_DIR/ci.mjs');
      expect(read('docker-compose.yml')).toContain('$CLAUDE_PROJECT_DIR/svc.mjs');
      expect(read('Makefile')).toContain('$CLAUDE_PROJECT_DIR/m.mjs');
    });

    it('is idempotent on re-run (totalRewrites=0)', () => {
      write('package.json', '{"scripts":{"x":"node /workspace/s.mjs"}}');
      const first = sanitizeHostFacingFiles(root, ['package.json']);
      expect(first.totalRewrites).toBe(1);
      const second = sanitizeHostFacingFiles(root, ['package.json']);
      expect(second.totalRewrites).toBe(0);
      expect(second.rewritten).toEqual([]);
    });

    it('does NOT sweep non-host-facing files', () => {
      write('src/foo.ts', 'const p = "/workspace/x";');
      const res = sanitizeHostFacingFiles(root, ['src/foo.ts']);
      expect(res.totalRewrites).toBe(0);
      expect(res.scanned).toBe(0);
      expect(res.rewritten).toEqual([]);
      expect(read('src/foo.ts')).toContain('/workspace/x');
    });

    it('does NOT corrupt a .deckent/workspace path inside a host-facing file', () => {
      write('package.json', '{"identity":".deckent/workspace/IDENTITY.md"}');
      const res = sanitizeHostFacingFiles(root, ['package.json']);
      expect(res.totalRewrites).toBe(0);
      expect(read('package.json')).toContain('.deckent/workspace/IDENTITY.md');
    });

    it('skips files that do not exist on disk', () => {
      const res = sanitizeHostFacingFiles(root, ['package.json']);
      expect(res.totalRewrites).toBe(0);
      expect(res.scanned).toBe(0);
      expect(res.rewritten).toEqual([]);
    });
  });
});
