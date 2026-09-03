import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateCodexConfig, mergeDeckentSection } from '../../../src/cli/helpers/codex-config.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('codex-config', () => {
  let tempDir: string;
  let fakeHome: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-codex-test-'));
    fakeHome = join(tempDir, 'home');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── mergeDeckentSection (pure string manipulation) ───────────────

  describe('mergeDeckentSection', () => {
    it('creates section from empty string', () => {
      const result = mergeDeckentSection('');
      expect(result).toContain('[mcp_servers.deckent]');
      expect(result).toContain('command = "deckent-mcp"');
      expect(result).toContain('args = []');
      expect(result).toContain('tool_timeout_sec = 600');
    });

    it('appends section to existing TOML', () => {
      const existing = `[some_other]
key = "value"`;
      const result = mergeDeckentSection(existing);
      expect(result).toContain('[some_other]');
      expect(result).toContain('key = "value"');
      expect(result).toContain('[mcp_servers.deckent]');
    });

    it('replaces existing deckent section', () => {
      const existing = `[mcp_servers.deckent]
command = "old-command"
args = ["old"]
tool_timeout_sec = 30`;
      const result = mergeDeckentSection(existing);
      expect(result).not.toContain('old-command');
      expect(result).toContain('command = "deckent-mcp"');
      // Should only have one deckent section
      const count = result.split('[mcp_servers.deckent]').length - 1;
      expect(count).toBe(1);
    });

    it('replaces deckent section while preserving other sections', () => {
      const existing = `[general]
model = "opus"

[mcp_servers.deckent]
command = "old"
args = ["old"]

[mcp_servers.other]
command = "other"`;
      const result = mergeDeckentSection(existing);
      expect(result).toContain('[general]');
      expect(result).toContain('model = "opus"');
      expect(result).toContain('[mcp_servers.other]');
      expect(result).toContain('command = "other"');
      expect(result).not.toContain('command = "old"');
      expect(result).toContain('command = "deckent-mcp"');
    });

    it('does not duplicate on repeated calls', () => {
      let result = mergeDeckentSection('');
      result = mergeDeckentSection(result);
      result = mergeDeckentSection(result);
      const count = result.split('[mcp_servers.deckent]').length - 1;
      expect(count).toBe(1);
    });

    it('handles deckent section at end of file', () => {
      const existing = `[general]
model = "opus"

[mcp_servers.deckent]
command = "old"`;
      const result = mergeDeckentSection(existing);
      expect(result).toContain('[general]');
      expect(result).toContain('command = "deckent-mcp"');
      expect(result).not.toContain('command = "old"');
    });
  });

  // ─── generateCodexConfig (file I/O) ──────────────────────────────

  describe('generateCodexConfig', () => {
    it('creates project .codex/config.toml in project root', () => {
      const result = generateCodexConfig(tempDir, { homeDir: fakeHome });
      expect(result.project).toBe(join(tempDir, '.codex', 'config.toml'));
      expect(existsSync(result.project)).toBe(true);
      const content = readFileSync(result.project, 'utf-8');
      expect(content).toContain('[mcp_servers.deckent]');
    });

    it('creates .codex directory if missing', () => {
      expect(existsSync(join(tempDir, '.codex'))).toBe(false);
      generateCodexConfig(tempDir, { homeDir: fakeHome });
      expect(existsSync(join(tempDir, '.codex'))).toBe(true);
    });

    it('preserves existing project config', () => {
      const codexDir = join(tempDir, '.codex');
      mkdirSync(codexDir, { recursive: true });
      writeFileSync(join(codexDir, 'config.toml'), '[general]\nmodel = "opus"\n', 'utf-8');

      generateCodexConfig(tempDir, { homeDir: fakeHome });

      const content = readFileSync(join(codexDir, 'config.toml'), 'utf-8');
      expect(content).toContain('[general]');
      expect(content).toContain('model = "opus"');
      expect(content).toContain('[mcp_servers.deckent]');
    });

    it('handles invalid existing file gracefully', () => {
      const codexDir = join(tempDir, '.codex');
      mkdirSync(codexDir, { recursive: true });
      // Write binary-like garbage
      writeFileSync(join(codexDir, 'config.toml'), Buffer.from([0x00, 0x01, 0x02]));

      // Should not throw
      expect(() => generateCodexConfig(tempDir, { homeDir: fakeHome })).not.toThrow();
      const content = readFileSync(join(codexDir, 'config.toml'), 'utf-8');
      expect(content).toContain('[mcp_servers.deckent]');
    });

    it('returns both global and project paths', () => {
      const result = generateCodexConfig(tempDir, { homeDir: fakeHome });
      expect(result.global).toBe(join(fakeHome, '.codex', 'config.toml'));
      expect(result.project).toBe(join(tempDir, '.codex', 'config.toml'));
    });

    it('is idempotent — running twice produces same result', () => {
      generateCodexConfig(tempDir, { homeDir: fakeHome });
      const first = readFileSync(join(tempDir, '.codex', 'config.toml'), 'utf-8');
      generateCodexConfig(tempDir, { homeDir: fakeHome });
      const second = readFileSync(join(tempDir, '.codex', 'config.toml'), 'utf-8');
      expect(first).toBe(second);
    });
  });
});
