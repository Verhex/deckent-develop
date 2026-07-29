import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateCursorConfig } from '../../../src/cli/helpers/cursor-config.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('cursor-config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-cursor-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── MCP config creation ─────────────────────────────────────────

  it('creates .cursor/mcp.json with deckent entry', () => {
    const result = generateCursorConfig(tempDir);
    expect(existsSync(result.mcpPath)).toBe(true);
    const raw = readFileSync(result.mcpPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent).toEqual({
      command: 'deckent-mcp',
      args: [],
      timeout: 600,
    });
  });

  it('creates .cursor/rules/deckent.mdc', () => {
    const result = generateCursorConfig(tempDir);
    expect(existsSync(result.rulesPath)).toBe(true);
    const content = readFileSync(result.rulesPath, 'utf-8');
    expect(content).toContain('description: Deckent AI Agent Orchestrator rules');
    expect(content).toContain('globs: **/*');
    expect(content).toContain('@DECKENT.md');
  });

  it('returns correct paths', () => {
    const result = generateCursorConfig(tempDir);
    expect(result.mcpPath).toBe(join(tempDir, '.cursor', 'mcp.json'));
    expect(result.rulesPath).toBe(join(tempDir, '.cursor', 'rules', 'deckent.mdc'));
  });

  // ─── Directory creation ──────────────────────────────────────────

  it('creates .cursor directory if missing', () => {
    expect(existsSync(join(tempDir, '.cursor'))).toBe(false);
    generateCursorConfig(tempDir);
    expect(existsSync(join(tempDir, '.cursor'))).toBe(true);
    expect(existsSync(join(tempDir, '.cursor', 'rules'))).toBe(true);
  });

  // ─── Merge with existing ─────────────────────────────────────────

  it('preserves existing mcpServers entries', () => {
    const cursorDir = join(tempDir, '.cursor');
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'other-tool' } }, extraKey: true }),
      'utf-8',
    );

    generateCursorConfig(tempDir);

    const raw = readFileSync(join(cursorDir, 'mcp.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.other.command).toBe('other-tool');
    expect(parsed.extraKey).toBe(true);
    expect(parsed.mcpServers.deckent.command).toBe('deckent-mcp');
  });

  it('updates existing deckent entry in mcp.json', () => {
    const cursorDir = join(tempDir, '.cursor');
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { deckent: { command: 'old' } } }),
      'utf-8',
    );

    generateCursorConfig(tempDir);

    const raw = readFileSync(join(cursorDir, 'mcp.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent.command).toBe('deckent-mcp');
    expect(parsed.mcpServers.deckent.timeout).toBe(600);
  });

  // ─── Duplicate prevention ────────────────────────────────────────

  it('is idempotent — running twice produces same mcp.json', () => {
    generateCursorConfig(tempDir);
    const first = readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8');
    generateCursorConfig(tempDir);
    const second = readFileSync(join(tempDir, '.cursor', 'mcp.json'), 'utf-8');
    expect(first).toBe(second);
  });

  it('is idempotent — running twice produces same rules file', () => {
    generateCursorConfig(tempDir);
    const first = readFileSync(join(tempDir, '.cursor', 'rules', 'deckent.mdc'), 'utf-8');
    generateCursorConfig(tempDir);
    const second = readFileSync(join(tempDir, '.cursor', 'rules', 'deckent.mdc'), 'utf-8');
    expect(first).toBe(second);
  });

  it('preserves owner-authored Cursor rules and adds only the Deckent reference', () => {
    const rulesDir = join(tempDir, '.cursor', 'rules');
    const rulesPath = join(rulesDir, 'deckent.mdc');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(
      rulesPath,
      '---\ndescription: Owner rules\nglobs: **/*\n---\n# Owner Policy\nNever replace this.\n',
      'utf-8',
    );

    generateCursorConfig(tempDir);

    const content = readFileSync(rulesPath, 'utf-8');
    expect(content).toContain('description: Owner rules');
    expect(content).toContain('# Owner Policy');
    expect(content).toContain('Never replace this.');
    expect(content.indexOf('@DECKENT.md')).toBeGreaterThan(content.indexOf('\n---\n'));
    expect(content.match(/@DECKENT\.md/g)).toHaveLength(1);
  });

  // ─── Invalid existing file ───────────────────────────────────────

  it('handles invalid JSON in mcp.json gracefully', () => {
    const cursorDir = join(tempDir, '.cursor');
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(join(cursorDir, 'mcp.json'), 'not-json!!!', 'utf-8');

    expect(() => generateCursorConfig(tempDir)).not.toThrow();
    const raw = readFileSync(join(cursorDir, 'mcp.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent.command).toBe('deckent-mcp');
  });

  it('handles mcpServers being a non-object in mcp.json', () => {
    const cursorDir = join(tempDir, '.cursor');
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      join(cursorDir, 'mcp.json'),
      JSON.stringify({ mcpServers: 42 }),
      'utf-8',
    );

    generateCursorConfig(tempDir);

    const raw = readFileSync(join(cursorDir, 'mcp.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.deckent.command).toBe('deckent-mcp');
  });

  // ─── Rules content ───────────────────────────────────────────────

  it('rules file contains all required sections', () => {
    generateCursorConfig(tempDir);
    const content = readFileSync(join(tempDir, '.cursor', 'rules', 'deckent.mdc'), 'utf-8');
    expect(content).toContain('# Deckent Integration');
    expect(content).toContain('## Rules');
    expect(content).toContain('Read DIRECTIVES.md');
    expect(content).toContain('Follow task scope boundaries');
    expect(content).toContain('Run tests before reporting completion');
    expect(content).toContain('## Context');
  });
});
