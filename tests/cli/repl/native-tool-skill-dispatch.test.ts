// tests/cli/repl/native-tool-skill-dispatch.test.ts
// F11 (334-011) — the native tool registry exposes a skill-dispatch tool that,
// given a skill id + args, invokes the existing skill executor (skill-pool/cache
// live path) and returns its result in the REPL tool-result shape { ok, output }.
//
// Hermetic: the injected-seam tests use a fake McpToolDispatcher (no spawn, no
// disk); the default-path proof-of-function builds a skill under os.tmpdir() and
// tears it down in finally. No real subprocess, no network.

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildNativeToolRegistry } from '../../../src/cli/repl/native-tool-registry.js';
import type { McpToolDispatcher } from '../../../src/cli/commands/chat-native.js';

const SKILL_TOOL = 'deckent_skill_dispatch';

describe('buildNativeToolRegistry — skill-dispatch tool (F11)', () => {
  it('registers a skill-dispatch tool (RED pre-fix: no such tool was registered)', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const def = reg.get(SKILL_TOOL);
    expect(def).toBeDefined();
    // Read-only guidance resolution → silent; model-facing builtin in the 'skill' category.
    expect(def!.tier).toBe('silent');
    expect(def!.category).toBe('skill');
    expect(def!.source).toBe('builtin');
    // skillId is a required input.
    const schema = def!.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
    expect(schema.required).toContain('skillId');
    expect(schema.properties).toHaveProperty('skillId');
  });

  it('delegates to the injected skill executor seam and returns its result in tool-result shape', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const skillDispatcher: McpToolDispatcher = {
      async dispatch(name, args) {
        calls.push({ name, args });
        return `guidance for ${name}`;
      },
    };
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), skillDispatcher });
    const r = await reg.get(SKILL_TOOL)!.handler({ skillId: 'typescript-expert', args: { topic: 'generics' } });

    expect(r).toEqual({ ok: true, output: 'guidance for typescript-expert' });
    // The skill id (not the tool name) + args flow through to the existing executor.
    expect(calls).toEqual([{ name: 'typescript-expert', args: { topic: 'generics' } }]);
  });

  it('maps an executor [mcp-error] string to ok:false (toolResultFrom reuse)', async () => {
    const skillDispatcher: McpToolDispatcher = {
      async dispatch() { return '[mcp-error] deckent_skill_dispatch: unknown skill: nope'; },
    };
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), skillDispatcher });
    const r = await reg.get(SKILL_TOOL)!.handler({ skillId: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/mcp-error/);
  });

  it('guards a missing/empty skillId without invoking the executor', async () => {
    let invoked = 0;
    const skillDispatcher: McpToolDispatcher = {
      async dispatch() { invoked += 1; return 'should-not-run'; },
    };
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), skillDispatcher });

    const empty = await reg.get(SKILL_TOOL)!.handler({ skillId: '   ' });
    expect(empty.ok).toBe(false);
    expect(empty.output).toMatch(/skillId required/);

    const missing = await reg.get(SKILL_TOOL)!.handler({});
    expect(missing.ok).toBe(false);

    expect(invoked).toBe(0);
  });

  it('default live path resolves SKILL.md guidance from the skill-pool (proof-of-function, hermetic)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ntr-skill-'));
    try {
      const skillDir = join(dir, '.deckent', 'skills', 'demo-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'manifest.json'),
        JSON.stringify({ id: 'demo-skill', name: 'Demo Skill', category: 'tool', enabled: true }),
      );
      writeFileSync(join(skillDir, 'SKILL.md'), '# Demo Skill\nAlways prefer the existing pattern.');

      // No injected seam → exercises createDefaultSkillDispatcher (live skill-pool/cache).
      const reg = buildNativeToolRegistry({ cwd: () => dir });
      const ok = await reg.get(SKILL_TOOL)!.handler({ skillId: 'demo-skill' });
      expect(ok.ok).toBe(true);
      expect(ok.output).toContain('Always prefer the existing pattern.');

      const unknown = await reg.get(SKILL_TOOL)!.handler({ skillId: 'no-such-skill' });
      expect(unknown.ok).toBe(false);
      expect(unknown.output).toMatch(/unknown skill/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is additive — existing exec/CLI tool registrations are unchanged', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const names = reg.list().map((t) => t.name);
    // Existing exec + CLI tools still present with their original tiers.
    expect(names).toEqual(expect.arrayContaining([
      'deckent_read_file', 'deckent_write_file', 'deckent_edit_file', 'deckent_bash', 'deckent_status',
    ]));
    expect(reg.get('deckent_read_file')!.tier).toBe('silent');
    expect(reg.get('deckent_write_file')!.tier).toBe('confirm');
    expect(reg.get('deckent_bash')!.tier).toBe('confirm');
    expect(reg.get('deckent_status')!.tier).toBe('silent');
    // …plus the new tool, additively.
    expect(names).toContain(SKILL_TOOL);
  });
});
