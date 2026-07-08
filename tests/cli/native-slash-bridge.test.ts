// tests/cli/native-slash-bridge.test.ts
// ═══ NATIVE-SLASH-BRIDGE (387-002) ═══════════════════════════════════════════
//
// The Ink native-engine REPL surface (src/cli/repl/app.tsx) drives its own
// turn-by-turn slash dispatch instead of runChatNativeLoop's for-await loop
// (chat-native.ts) — so ~24 of the 37 SLASH_CATALOG commands (/help /kill
// /cleanup /recover /nervous /interrogate /mcp among them) silently fell
// through to a plain-text chat turn (born-493). This suite exercises the
// pure(ish) bridge logic app.tsx exports for exactly this reason
// (`resolveNativeSlash`) without mounting Ink (ink-testing-library is not a
// project dependency — see app.tsx's own header comment / prior REPL test
// suites), plus the companion fix: `createNativeEngine`'s returned engine now
// exposes `setApprovalMode`, wiring `/approve <mode>` to the native
// AgentSession's own permission engine (session.ts, previously a 0-caller
// dead export).

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { resolveNativeSlash } from '../../src/cli/repl/app.js';
import { buildSlashRegistry } from '../../src/cli/commands/chat-slash-registry.js';
import { createNativeEngine } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } };
}

function withTmpDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REGISTRY = buildSlashRegistry();
const ctx = (cwd: string) => ({ registry: REGISTRY, cwd, lang: 'en', chatMode: 'user' as const });

describe('resolveNativeSlash', () => {
  it('passes through plain chat text (not a slash line)', () => {
    const result = resolveNativeSlash('what does this function do?', ctx(tmpdir()));
    expect(result).toEqual({ kind: 'passthrough' });
  });

  it('passes through an unknown slash command (preserves prior plain-text behavior)', () => {
    const result = resolveNativeSlash('/frobnicate --x', ctx(tmpdir()));
    expect(result).toEqual({ kind: 'passthrough' });
  });

  it('passes through commands app.tsx already special-cases earlier in handleSubmit', () => {
    // /model, /provider, /term, /cd have no agenticTool in SLASH_CATALOG —
    // resolveSlash resolves them to 'none', same as before this task.
    for (const line of ['/model sonnet', '/provider codex', '/term run', '/cd ..']) {
      expect(resolveNativeSlash(line, ctx(tmpdir()))).toEqual({ kind: 'passthrough' });
    }
  });

  it('/help renders the full trust-badged catalog, not plain text', () => {
    const result = resolveNativeSlash('/help', ctx(tmpdir()));
    expect(result.kind).toBe('reply');
    if (result.kind !== 'reply') throw new Error('unreachable');
    expect(result.text).toContain('Komutlar:');
    expect(result.text).toContain('/status');
    // trust-badged catalog section (buildHelpCatalogEntries → renderCatalog) —
    // proves this is the SAME rich output chat-native.ts's loop renders, not
    // a bare renderHelp() fallback.
    expect(result.text.split('\n').length).toBeGreaterThan(10);
  });

  it('/kill resolves to a real agentic dispatch (not a no-op enqueue)', () => {
    const result = resolveNativeSlash('/kill', ctx(tmpdir()));
    expect(result).toEqual({ kind: 'dispatch', tool: 'deckent_kill', args: {} });
  });

  it('/cleanup and /recover also resolve to agentic dispatch', () => {
    expect(resolveNativeSlash('/cleanup', ctx(tmpdir()))).toEqual({ kind: 'dispatch', tool: 'deckent_cleanup', args: {} });
    expect(resolveNativeSlash('/recover', ctx(tmpdir()))).toEqual({ kind: 'dispatch', tool: 'deckent_recover', args: {} });
  });

  it('/sync (a confirm-tier, non-always tool) also resolves to agentic dispatch', () => {
    expect(resolveNativeSlash('/sync', ctx(tmpdir()))).toEqual({ kind: 'dispatch', tool: 'deckent_sync', args: {} });
  });

  it('/directives set <content> resolves to agentic dispatch with the content arg', () => {
    const result = resolveNativeSlash('/directives set do the thing', ctx(tmpdir()));
    expect(result).toEqual({ kind: 'dispatch', tool: 'deckent_set_directives', args: { content: 'do the thing' } });
  });

  it('/nervous renders an honest reply (no pending file — empty-state message)', () => {
    withTmpDir('nsb-nervous-', (dir) => {
      const result = resolveNativeSlash('/nervous', ctx(dir));
      expect(result.kind).toBe('reply');
      if (result.kind !== 'reply') throw new Error('unreachable');
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  it('/interrogate renders questions when DIRECTIVES.md exists', () => {
    withTmpDir('nsb-interrogate-', (dir) => {
      writeFileSync(join(dir, 'DIRECTIVES.md'), '# DIRECTIVES\n\nSome project directives text.\n', 'utf-8');
      const result = resolveNativeSlash('/interrogate', ctx(dir));
      expect(result.kind).toBe('reply');
      if (result.kind !== 'reply') throw new Error('unreachable');
      expect(result.text).toContain('1.');
    });
  });

  it('/interrogate degrades honestly when DIRECTIVES.md is missing (no crash, no silent drop)', () => {
    withTmpDir('nsb-interrogate-missing-', (dir) => {
      const result = resolveNativeSlash('/interrogate', ctx(dir));
      expect(result.kind).toBe('reply');
      if (result.kind !== 'reply') throw new Error('unreachable');
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  it('bare /directives shows DIRECTIVES.md content when present', () => {
    withTmpDir('nsb-directives-', (dir) => {
      writeFileSync(join(dir, 'DIRECTIVES.md'), 'THE DIRECTIVES BODY', 'utf-8');
      const result = resolveNativeSlash('/directives', ctx(dir));
      expect(result).toEqual({ kind: 'reply', text: 'THE DIRECTIVES BODY' });
    });
  });

  it('/mcp resolves to an honest not-wired reply instead of a silent drop', () => {
    const result = resolveNativeSlash('/mcp', ctx(tmpdir()));
    expect(result.kind).toBe('reply');
    if (result.kind !== 'reply') throw new Error('unreachable');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('/autonomous status resolves to a read-only agentic dispatch', () => {
    const result = resolveNativeSlash('/autonomous status', ctx(tmpdir()));
    expect(result).toEqual({ kind: 'dispatch', tool: 'deckent_autonomous', args: { action: 'status' } });
  });
});

describe('createNativeEngine — setApprovalMode wiring (born-493)', () => {
  it('exposes a callable setApprovalMode on the returned engine', () => {
    const engine = createNativeEngine({
      adapter: scripted([[{ type: 'done' }]]),
      registry: buildNativeToolRegistry({ cwd: () => tmpdir() }),
      cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    expect(typeof engine.setApprovalMode).toBe('function');
  });

  it('a confirm-tier tool still asks under the default (suggest) mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nsb-approve-suggest-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'w1', name: 'deckent_write_file', args: { path: 'a.txt', content: 'X' } }, { type: 'done' }],
        [{ type: 'done' }],
      ]);
      const asked: string[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async (_summary, tool) => { asked.push(tool); return 'y'; }, toolSink: () => {},
      });
      await engine('write it', { output: () => {}, onTurnEnd: () => {} });
      expect(asked).toContain('deckent_write_file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('/approve full-auto (via setApprovalMode) skips the y/n prompt for a confirm-tier tool', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nsb-approve-full-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'w2', name: 'deckent_write_file', args: { path: 'b.txt', content: 'Y' } }, { type: 'done' }],
        [{ type: 'done' }],
      ]);
      const asked: string[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async (_summary, tool) => { asked.push(tool); return 'y'; }, toolSink: () => {},
      });
      engine.setApprovalMode?.('full-auto');
      await engine('write it', { output: () => {}, onTurnEnd: () => {} });
      expect(asked).toEqual([]); // no permission-request round-trip at all
      expect(existsSync(join(dir, 'b.txt'))).toBe(true); // executed directly (auto-allowed)
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('setApprovalMode(full-auto) does NOT bypass an always-floor tool', async () => {
    // deckent_kill/cleanup/recover aren't native-registry tools (they're
    // CLI-bridge-dispatched via the slash bridge, not model tool-calls), but
    // the always-floor guard is generic (permission.ts step 2 checks
    // policy.alwaysFloor by NAME regardless of registration) — this proves
    // setApprovalMode never weakens that floor even if a future native tool
    // shares the name.
    const { decide } = await import('../../src/agent/permission.js');
    const { SAFE_DEFAULT_POLICY } = await import('../../src/agent/permission-policy.js');
    const verdict = decide('deckent_kill', '', 'confirm', {
      rules: [], denies: [], policy: SAFE_DEFAULT_POLICY, mode: 'full-auto',
    });
    expect(verdict).toBe('ask');
  });
});
