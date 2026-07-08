// 387-013 MCP-CLIENT-GATE — mcp_client_enabled ölü-gate: wire ya da kaldır (P2).
//
// Investigation (see src/cli/repl/mcp-bridge.ts module header for the full
// write-up): `isMcpClientEnabled`/`initReplMcpBridge` are correct in isolation
// but have ZERO production callers — neither `run.tsx` (native-agent default
// path) nor `chat-native.ts` (legacy loop) ever consults `mcp_client_enabled`;
// both build their own MCP broker/bridge inline instead. The flag is also
// absent from `DeckentConfig`/`core/config.ts` and from every `docs/reference`
// page — so it was never a real, documented config knob either.
//
// This file has two jobs:
//   1) Re-confirm the gate's own truth-table + composition behavior in
//      isolation (this module's boundary — NOT a claim about production).
//   2) Lock the current "unwired" state in as an executable, CI-visible fact
//      (source-scan regression-guard) instead of a silent landmine. If a
//      future task wires `run.tsx`/`chat-native.ts` to the flag for real, this
//      guard breaks — forcing a conscious update rather than a silent drift
//      back to "documented but dead."
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

describe('mcp_client_enabled — config-schema + docs (387-013 goCriteria OR-branch)', () => {
  it('is not declared anywhere in core/config.ts (DeckentConfig schema)', () => {
    const src = readFileSync(join(ROOT, 'src', 'core', 'config.ts'), 'utf-8');
    expect(src).not.toMatch(/mcp_client_enabled/);
  });

  it('is not documented as a supported option in any docs/reference page', () => {
    const referenceDir = join(ROOT, 'docs', 'reference');
    const files = listFilesRecursive(referenceDir, (n) => n.endsWith('.md'));
    const hits = files.filter((f) => readFileSync(f, 'utf-8').includes('mcp_client_enabled'));
    expect(hits).toEqual([]);
  });
});

describe('mcp_client_enabled — production-wiring regression guard (387-013)', () => {
  // These two files are the confirmed bypass sites (see mcp-bridge.ts module
  // header). This test does NOT assert the flag should stay unwired forever —
  // it asserts today's known state so drift back to "silently misleading" is
  // impossible without a failing test forcing an explicit decision.
  it('run.tsx (native-agent default REPL path) does not consult the gate', () => {
    const src = readFileSync(join(ROOT, 'src', 'cli', 'repl', 'run.tsx'), 'utf-8');
    expect(src).not.toMatch(/isMcpClientEnabled|initReplMcpBridge|mcp_client_enabled/);
  });

  it('chat-native.ts (legacy REPL loop) does not consult the gate', () => {
    const src = readFileSync(join(ROOT, 'src', 'cli', 'commands', 'chat-native.ts'), 'utf-8');
    expect(src).not.toMatch(/isMcpClientEnabled|initReplMcpBridge|mcp_client_enabled/);
  });
});
