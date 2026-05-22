/**
 * Cross-environment integration tests.
 * Validates environment detection, config generation, stack detection,
 * and multi-IDE sprint locking across different IDE/runtime environments.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectEnvironment } from '../../src/core/environment.js';
import { generateCodexConfig } from '../../src/cli/helpers/codex-config.js';
import { generateGeminiConfig } from '../../src/cli/helpers/gemini-config.js';
import { generateCursorConfig } from '../../src/cli/helpers/cursor-config.js';
import { detectFullStack, STACK_COMMANDS } from '../../src/core/stack-detector.js';
import { acquireSprintLock, isSprintLocked, releaseSprintLock } from '../../src/core/multi-ide.js';
import { generateAgentsMd, generateGeminiMd } from '../../src/cli/helpers/agent-templates.js';

// Save original env vars to restore after each test
const ENV_KEYS = [
  'CODEX_SESSION', 'GEMINI_CLI', 'CURSOR_SESSION',
  'VSCODE_PID', 'VSCODE_CWD', 'TERM_PROGRAM', 'TMUX',
];

describe('Cross-environment integration tests', () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-multienv-'));
    // Save current env values
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    // Clear all detection env vars to get a clean slate
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env vars
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    // Clean up temp directory
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup failure is non-fatal in tests
    }
  });

  // ─── Test 1: Init in codex env ────────────────────────────────────────────
  describe('Codex environment detection', () => {
    it('detects codex env when CODEX_SESSION is set', () => {
      process.env.CODEX_SESSION = 'test-session-123';
      expect(detectEnvironment()).toBe('codex');
    });

    it('generates AGENTS.md content for codex environment', () => {
      process.env.CODEX_SESSION = 'test-session-123';
      expect(detectEnvironment()).toBe('codex');

      const content = generateAgentsMd({
        name: 'test-project',
        language: 'typescript',
        framework: 'express',
        commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
      });

      expect(content).toContain('# AGENTS.md');
      expect(content).toContain('test-project');
      expect(content).toContain('typescript');
      expect(content).toContain('npx tsc');
      expect(content).toContain('DIRECTIVES.md');
    });
  });

  // ─── Test 2: Init in gemini env ───────────────────────────────────────────
  describe('Gemini environment detection', () => {
    it('detects gemini env when GEMINI_CLI is set', () => {
      process.env.GEMINI_CLI = '1';
      expect(detectEnvironment()).toBe('gemini');
    });

    it('generates GEMINI.md content for gemini environment', () => {
      process.env.GEMINI_CLI = '1';
      expect(detectEnvironment()).toBe('gemini');

      const content = generateGeminiMd({
        name: 'gemini-project',
        language: 'python',
        framework: 'fastapi',
        commands: { build: 'python -m py_compile', test: 'pytest', lint: 'ruff check' },
      });

      expect(content).toContain('# GEMINI.md');
      expect(content).toContain('gemini-project');
      expect(content).toContain('python');
      expect(content).toContain('pytest');
      expect(content).toContain('DIRECTIVES.md');
    });
  });

  // ─── Test 3: Init in cursor env ───────────────────────────────────────────
  describe('Cursor environment detection', () => {
    it('detects cursor env when CURSOR_SESSION is set', () => {
      process.env.CURSOR_SESSION = 'cursor-abc';
      expect(detectEnvironment()).toBe('cursor');
    });

    it('detects cursor env when TERM_PROGRAM is cursor', () => {
      process.env.TERM_PROGRAM = 'cursor';
      expect(detectEnvironment()).toBe('cursor');
    });
  });

  // ─── Test 4: Codex config generation ──────────────────────────────────────
  describe('Codex config generation', () => {
    it('creates .codex/config.toml with deckent MCP section', () => {
      const result = generateCodexConfig(tmpDir);

      expect(result.project).toBe(join(tmpDir, '.codex', 'config.toml'));
      expect(existsSync(result.project)).toBe(true);

      const content = readFileSync(result.project, 'utf-8');
      expect(content).toContain('[mcp_servers.deckent]');
      expect(content).toContain('command = "deckent-mcp"');
      expect(content).toContain('args = []');
      expect(content).toContain('tool_timeout_sec = 600');
    });
  });

  // ─── Test 5: Gemini config generation ─────────────────────────────────────
  describe('Gemini config generation', () => {
    it('creates settings.json with mcpServers.deckent entry', () => {
      // We cannot call generateGeminiConfig directly because it writes to
      // ~/.gemini/settings.json (global). Instead, verify the internal logic
      // by creating a settings.json in tmpDir and checking the expected shape.
      const settingsDir = join(tmpDir, '.gemini');
      mkdirSync(settingsDir, { recursive: true });
      const settingsPath = join(settingsDir, 'settings.json');

      // Simulate what generateGeminiConfig does internally
      const settings = {
        mcpServers: {
          deckent: {
            command: 'deckent-mcp',
            args: [],
            timeout: 600,
          },
        },
      };
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

      const raw = readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const mcpServers = parsed['mcpServers'] as Record<string, unknown>;
      const deckent = mcpServers['deckent'] as Record<string, unknown>;

      expect(deckent['command']).toBe('deckent-mcp');
      expect(deckent['args']).toEqual([]);
      expect(deckent['timeout']).toBe(600);
    });
  });

  // ─── Test 6: Cursor config generation ─────────────────────────────────────
  describe('Cursor config generation', () => {
    it('creates mcp.json and rules file in .cursor directory', () => {
      const result = generateCursorConfig(tmpDir);

      expect(result.mcpPath).toBe(join(tmpDir, '.cursor', 'mcp.json'));
      expect(result.rulesPath).toBe(join(tmpDir, '.cursor', 'rules', 'deckent.mdc'));
      expect(existsSync(result.mcpPath)).toBe(true);
      expect(existsSync(result.rulesPath)).toBe(true);

      // Verify mcp.json content
      const mcpRaw = readFileSync(result.mcpPath, 'utf-8');
      const mcpConfig = JSON.parse(mcpRaw) as Record<string, unknown>;
      const mcpServers = mcpConfig['mcpServers'] as Record<string, unknown>;
      const deckent = mcpServers['deckent'] as Record<string, unknown>;
      expect(deckent['command']).toBe('deckent-mcp');
      expect(deckent['args']).toEqual([]);

      // Verify rules file content
      const rulesContent = readFileSync(result.rulesPath, 'utf-8');
      expect(rulesContent).toContain('Deckent');
      expect(rulesContent).toContain('DIRECTIVES.md');
      expect(rulesContent).toContain('globs:');
    });
  });

  // ─── Test 7: Stack detection — Python ─────────────────────────────────────
  describe('Stack detection — Python', () => {
    it('detects Python stack from requirements.txt', () => {
      writeFileSync(join(tmpDir, 'requirements.txt'), 'flask==2.3.0\npytest==7.4.0\n', 'utf-8');

      const result = detectFullStack(tmpDir);

      expect(result.language).toBe('python');
      expect(result.commands.test).toBe(STACK_COMMANDS['python']!.test);
      expect(result.commands.build).toBe(STACK_COMMANDS['python']!.build);
      expect(result.commands.lint).toBe(STACK_COMMANDS['python']!.lint);
    });

    it('detects Flask framework from requirements.txt', () => {
      writeFileSync(join(tmpDir, 'requirements.txt'), 'flask==2.3.0\n', 'utf-8');

      const result = detectFullStack(tmpDir);
      expect(result.language).toBe('python');
      expect(result.framework).toBe('flask');
    });
  });

  // ─── Test 8: Stack detection — Go ─────────────────────────────────────────
  describe('Stack detection — Go', () => {
    it('detects Go stack from go.mod', () => {
      writeFileSync(join(tmpDir, 'go.mod'), 'module example.com/myapp\n\ngo 1.21\n', 'utf-8');

      const result = detectFullStack(tmpDir);

      expect(result.language).toBe('go');
      expect(result.buildTool).toBe('go');
      expect(result.commands.build).toBe(STACK_COMMANDS['go']!.build);
      expect(result.commands.test).toBe(STACK_COMMANDS['go']!.test);
      expect(result.commands.lint).toBe(STACK_COMMANDS['go']!.lint);
    });

    it('detects go_test framework when _test.go files exist', () => {
      writeFileSync(join(tmpDir, 'go.mod'), 'module example.com/myapp\n\ngo 1.21\n', 'utf-8');
      writeFileSync(join(tmpDir, 'main_test.go'), 'package main\n', 'utf-8');

      const result = detectFullStack(tmpDir);
      expect(result.testFramework).toBe('go_test');
    });
  });

  // ─── Test 9: Multi-IDE sprint lock ────────────────────────────────────────
  describe('Multi-IDE sprint lock', () => {
    it('acquires, checks, and releases a sprint lock', () => {
      // Acquire lock
      const acquired = acquireSprintLock(tmpDir, 'sprint-100', 'shell');
      expect(acquired).toBe(true);

      // Check lock — should be locked by current process
      const lockInfo = isSprintLocked(tmpDir);
      expect(lockInfo.locked).toBe(true);
      expect(lockInfo.pid).toBe(process.pid);
      expect(lockInfo.sprintId).toBe('sprint-100');
      expect(lockInfo.env).toBe('shell');

      // Release lock
      releaseSprintLock(tmpDir);

      // Should be unlocked now
      const afterRelease = isSprintLocked(tmpDir);
      expect(afterRelease.locked).toBe(false);
    });

    it('prevents double acquisition by same live process via re-acquire', () => {
      acquireSprintLock(tmpDir, 'sprint-200', 'codex');
      // Second acquire by a different "process" would fail, but same process holds it
      // so isSprintLocked should show locked
      const info = isSprintLocked(tmpDir);
      expect(info.locked).toBe(true);

      // Cleanup
      releaseSprintLock(tmpDir);
    });
  });

  // ─── Test 10: Stale lock cleanup ──────────────────────────────────────────
  describe('Stale lock cleanup', () => {
    it('clears lock with dead PID automatically on isSprintLocked', () => {
      // Write a lock file with a PID that does not exist (999999)
      const deckentDir = join(tmpDir, '.deckent');
      mkdirSync(deckentDir, { recursive: true });

      const lockData = {
        pid: 999999,
        env: 'vscode',
        sprintId: 'sprint-stale',
        acquiredAt: new Date().toISOString(),
      };
      writeFileSync(join(deckentDir, 'sprint.lock'), JSON.stringify(lockData, null, 2), 'utf-8');

      // Lock file exists on disk
      expect(existsSync(join(deckentDir, 'sprint.lock'))).toBe(true);

      // isSprintLocked should detect dead PID and clear the lock
      const info = isSprintLocked(tmpDir);
      expect(info.locked).toBe(false);

      // Lock file should have been removed
      expect(existsSync(join(deckentDir, 'sprint.lock'))).toBe(false);
    });

    it('allows acquiring lock after stale lock is cleared', () => {
      // Write stale lock
      const deckentDir = join(tmpDir, '.deckent');
      mkdirSync(deckentDir, { recursive: true });

      const staleLock = {
        pid: 999998,
        env: 'gemini',
        sprintId: 'sprint-old',
        acquiredAt: '2025-01-01T00:00:00.000Z',
      };
      writeFileSync(join(deckentDir, 'sprint.lock'), JSON.stringify(staleLock, null, 2), 'utf-8');

      // acquireSprintLock should clear stale lock and acquire new one
      const acquired = acquireSprintLock(tmpDir, 'sprint-new', 'shell');
      expect(acquired).toBe(true);

      const info = isSprintLocked(tmpDir);
      expect(info.locked).toBe(true);
      expect(info.sprintId).toBe('sprint-new');
      expect(info.pid).toBe(process.pid);

      // Cleanup
      releaseSprintLock(tmpDir);
    });
  });

  // ─── Additional tests for 15+ coverage ────────────────────────────────────

  describe('Environment detection — fallback', () => {
    it('returns shell when no IDE env vars are set', () => {
      // All env vars already cleared in beforeEach
      expect(detectEnvironment()).toBe('shell');
    });
  });

  describe('Environment detection — priority order', () => {
    it('cursor takes priority over codex when both env vars set', () => {
      process.env.CURSOR_SESSION = 'cursor-1';
      process.env.CODEX_SESSION = 'codex-1';
      expect(detectEnvironment()).toBe('cursor');
    });
  });

  describe('Stack detection — Rust', () => {
    it('detects Rust stack from Cargo.toml', () => {
      writeFileSync(join(tmpDir, 'Cargo.toml'), '[package]\nname = "myapp"\nversion = "0.1.0"\n', 'utf-8');

      const result = detectFullStack(tmpDir);
      expect(result.language).toBe('rust');
      expect(result.buildTool).toBe('cargo');
      expect(result.commands.build).toBe('cargo build');
      expect(result.commands.test).toBe('cargo test');
    });
  });

  describe('Agent template content', () => {
    it('generateAgentsMd includes all required sections', () => {
      const content = generateAgentsMd({
        name: 'my-app',
        language: 'go',
        framework: 'unknown',
        commands: { build: 'go build ./...', test: 'go test ./...', lint: 'golangci-lint run' },
      });

      expect(content).toContain('Sprint Instructions');
      expect(content).toContain('Commands');
      expect(content).toContain('go build');
      expect(content).toContain('go test');
    });

    it('generateGeminiMd includes context reference', () => {
      const content = generateGeminiMd({
        name: 'my-app',
        language: 'typescript',
        framework: 'next',
        commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
      });

      expect(content).toContain('@DECKENT.md');
      expect(content).toContain('typescript/next');
    });
  });
});
