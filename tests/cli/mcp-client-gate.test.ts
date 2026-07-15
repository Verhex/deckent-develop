// 387-013 MCP-CLIENT-GATE — mcp_client_enabled: WIRED (REPL-575 K1, 2026-07-15).
//
// History: 387-013 found `isMcpClientEnabled`/`initReplMcpBridge` correct in
// isolation but with ZERO production callers — `run.tsx` auto-connected MCP
// servers UNCONDITIONALLY at native boot and `chat-native.ts` gated only on
// server presence. This file then pinned that unwired state so wiring required
// a conscious test update. That update is this one: the 2026-07-08 REPL review
// flagged the unconditional auto-connect as a security finding (arbitrary
// external processes on plain `deckent` launch), and REPL-575 K1 wired the
// gate for real.
//
// This file's two jobs now:
//   1) Re-confirm the gate's own truth-table + composition behavior in
//      isolation (this module's boundary).
//   2) Pin the WIRED state (source-scan regression-guard): schema declaration,
//      resolved-literal pass-through (born-464 flag-drop pattern), docs entry,
//      and both entry points consulting the gate — so the auto-connect hole
//      cannot silently reopen.
//
// Hermetic: (1) uses tmpdir + a duck-typed fake broker, no MCP subprocess/
// network; (2) reads only committed repo source (not gitignored state) for
// the regression-guard scan.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initReplMcpBridge, isMcpClientEnabled } from '../../src/cli/repl/mcp-bridge.js';
import type { BridgeBrokerLike } from '../../src/cli/commands/chat-mcp-bridge.js';
import type { McpServerDef, McpToolDescriptor } from '../../src/mcp-client/types.js';

const ROOT = join(import.meta.dirname, '..', '..');

function fakeBroker(): BridgeBrokerLike & { connectCalls: number } {
  return {
    connectCalls: 0,
    async connect(_name: string, _def: McpServerDef): Promise<void> {
      this.connectCalls += 1;
    },
    async listTools(_name: string): Promise<McpToolDescriptor[]> {
      return [];
    },
    async callTool(): Promise<unknown> {
      return {};
    },
    isConnected(): boolean {
      return false;
    },
    list(): string[] {
      return [];
    },
  };
}

function listFilesRecursive(dir: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...listFilesRecursive(p, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-mcp-client-gate-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('mcp_client_enabled gate — isolated behavior (387-013)', () => {
  it('truth-table: only an explicit true opts in', () => {
    expect(isMcpClientEnabled(undefined)).toBe(false);
    expect(isMcpClientEnabled({})).toBe(false);
    expect(isMcpClientEnabled({ mcp_client_enabled: false })).toBe(false);
    expect(isMcpClientEnabled({ mcp_client_enabled: true })).toBe(true);
  });

  it('off → initReplMcpBridge returns null, no connection attempted', () => {
    const broker = fakeBroker();
    const bridge = initReplMcpBridge({
      config: { mcp_client_enabled: false },
      projectRoot,
      deps: { broker },
    });
    expect(bridge).toBeNull();
    expect(broker.connectCalls).toBe(0);
  });

  it('on → initReplMcpBridge composes a bridge but still does not auto-connect', () => {
    const broker = fakeBroker();
    const bridge = initReplMcpBridge({
      config: { mcp_client_enabled: true },
      projectRoot,
      deps: { broker },
    });
    expect(bridge).not.toBeNull();
    expect(bridge?.listTools()).toEqual([]);
    expect(broker.connectCalls).toBe(0);
  });
});

describe('mcp_client_enabled — config-schema + docs (387-013 → wired, REPL-575 K1)', () => {
  it('is declared in the config schema and passed through the resolved-literals (born-464 pattern)', () => {
    const types = readFileSync(join(ROOT, 'src', 'core', 'config-types.ts'), 'utf-8');
    expect(types).toMatch(/mcp_client_enabled\?: boolean/);
    const src = readFileSync(join(ROOT, 'src', 'core', 'config.ts'), 'utf-8');
    // Both resolved-object literals must carry the flag or loadConfig drops it.
    const passThroughs = src.match(/mcp_client_enabled: config\.mcp_client_enabled/g) ?? [];
    expect(passThroughs.length).toBeGreaterThanOrEqual(2);
  });

  it('is documented as a supported option in docs/reference', () => {
    const referenceDir = join(ROOT, 'docs', 'reference');
    const files = listFilesRecursive(referenceDir, (n) => n.endsWith('.md'));
    const hits = files.filter((f) => readFileSync(f, 'utf-8').includes('mcp_client_enabled'));
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

describe('mcp_client_enabled — production-wiring regression guard (387-013 → wired, REPL-575 K1)', () => {
  // 387-013 originally pinned these two files as UNWIRED bypass sites so that
  // wiring the flag required a conscious test update — it did (2026-07-15).
  // The guard now pins the WIRED state: both production entry points must keep
  // consulting the gate, so the auto-connect security hole cannot silently
  // reopen.
  it('run.tsx (native-agent default REPL path) consults the gate', () => {
    const src = readFileSync(join(ROOT, 'src', 'cli', 'repl', 'run.tsx'), 'utf-8');
    expect(src).toMatch(/isMcpClientEnabled/);
  });

  it('chat-native.ts (legacy REPL loop) consults the gate', () => {
    const src = readFileSync(join(ROOT, 'src', 'cli', 'commands', 'chat-native.ts'), 'utf-8');
    expect(src).toMatch(/isMcpClientEnabled/);
  });
});
