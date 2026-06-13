// tests/cli/native-tool-registry.test.ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';

describe('buildNativeToolRegistry', () => {
  it('registers the exec tools with native tiers (read→silent, write→confirm, bash floor stays confirm)', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const names = reg.list().map((t) => t.name).sort();
    expect(names).toContain('deckent_read_file');
    expect(names).toContain('deckent_write_file');
    expect(names).toContain('deckent_bash');
    expect(reg.get('deckent_read_file')!.tier).toBe('silent');   // classifyTool 'read' → 'silent'
    expect(reg.get('deckent_write_file')!.tier).toBe('confirm');  // side-effecting
    expect(reg.get('deckent_bash')!.tier).toBe('confirm');
  });

  it('exec handler runs the real dispatcher with NO internal confirm (single gate), mapping string→ToolResult', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ntr-'));
    try {
      writeFileSync(join(dir, 'f.txt'), 'HELLO');
      const reg = buildNativeToolRegistry({ cwd: () => dir });
      const read = await reg.get('deckent_read_file')!.handler({ path: 'f.txt' });
      expect(read).toEqual({ ok: true, output: 'HELLO' });
      // a side-effecting write executes WITHOUT prompting (no confirm injected) — the
      // AgentSession permission engine is the gate, not the dispatcher.
      const write = await reg.get('deckent_write_file')!.handler({ path: 'g.txt', content: 'X' });
      expect(write.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks a dispatcher error string as ok:false', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const r = await reg.get('deckent_read_file')!.handler({ path: '../escape.txt' });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/mcp-error|scope/);
  });

  it('registers the CLI-bridge tools too (deckent_status is silent/read)', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    expect(reg.get('deckent_status')).toBeDefined();
    expect(reg.get('deckent_status')!.tier).toBe('silent');
  });
});
