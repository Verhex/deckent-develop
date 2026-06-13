// src/cli/repl/native-tool-registry.ts
// ═══ Native tool registry (SP-1 M3) ═════════════════════════════════════════
// Wraps the REPL's existing tool dispatchers (chat-tool-exec: read/write/edit/
// bash; chat-tool-bridge: deckent_* CLI) as native ToolDefinitions for the
// AgentSession. The dispatchers run with NO internal confirm — the AgentSession
// permission engine + guards are the SINGLE gate (no double-prompt). Legacy tier
// names ('read'|'confirm'|'always') map to the engine's ('silent'|'confirm'|
// 'always'); read→silent. (MCP tool source is a deferred follow-up.)

import { ToolRegistry } from '../../agent/tools/registry.js';
import type { ToolDefinition, ToolPermissionTier, ToolResult } from '../../agent/tools/types.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createCliToolDispatcher } from '../commands/chat-tool-bridge.js';
import { classifyTool } from './tool-permissions.js';
import type { McpToolDispatcher } from '../commands/chat-native.js';

/** Minimal structural shape of the buildMcpBridge return (chat-mcp-bridge.ts). */
export interface NativeMcpBridge {
  listTools(): Array<{ namespacedName: string; descriptor: { description?: string; inputSchema?: Record<string, unknown> } }>;
  dispatch(namespacedName: string, args: Record<string, unknown>, confirmFn: (a: unknown) => Promise<boolean>): Promise<{ ok: boolean; output: string }>;
}

export interface NativeToolRegistryOptions {
  /** Resolved per-call so the REPL's /cd is followed live. */
  cwd: () => string;
  /** Optional connected MCP bridge — its tools register as confirm-tier defs. */
  mcpBridge?: NativeMcpBridge;
}

const LEGACY_TIER: Record<'read' | 'confirm' | 'always', ToolPermissionTier> = {
  read: 'silent',
  confirm: 'confirm',
  always: 'always',
};

// Exec tools that have side-effects — classified as 'confirm' regardless of
// classifyTool result (which doesn't know about these tool names and returns 'read').
const EXEC_SIDE_EFFECTING: ReadonlySet<string> = new Set([
  'deckent_write_file',
  'deckent_edit_file',
  'deckent_bash',
]);

/** A minimal JSON-schema for each tool's args (provider tool_use input_schema). */
const SCHEMAS: Record<string, Record<string, unknown>> = {
  deckent_read_file: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  deckent_write_file: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  deckent_edit_file: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] },
  deckent_bash: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] },
};

const DESCRIPTIONS: Record<string, string> = {
  deckent_read_file: 'Read a file within the project (returns its content).',
  deckent_write_file: 'Write content to a file within the project.',
  deckent_edit_file: 'Replace a substring in a file within the project.',
  deckent_bash: 'Run a shell command in the project directory.',
};

function toolResultFrom(output: string): ToolResult {
  const ok = !(output.startsWith('[mcp-error]') || output.startsWith('[deckent-denied]'));
  return { ok, output };
}

function execToolTier(name: string): ToolPermissionTier {
  return EXEC_SIDE_EFFECTING.has(name) ? 'confirm' : 'silent';
}

function defineFromDispatcher(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  tier: ToolPermissionTier,
  dispatcher: McpToolDispatcher,
): ToolDefinition {
  return {
    name,
    description,
    inputSchema,
    category: 'coding',
    tier,
    source: 'builtin',
    handler: async (args) => toolResultFrom(await dispatcher.dispatch(name, args)),
  };
}

export function buildNativeToolRegistry(opts: NativeToolRegistryOptions): ToolRegistry {
  const registry = new ToolRegistry();

  // Exec tools — NO confirm injected (single gate = AgentSession permission engine).
  const exec = createToolExecDispatcher({ cwd: opts.cwd });
  for (const name of ['deckent_read_file', 'deckent_write_file', 'deckent_edit_file', 'deckent_bash'] as const) {
    registry.register(defineFromDispatcher(name, DESCRIPTIONS[name]!, SCHEMAS[name]!, execToolTier(name), exec));
  }

  // CLI-bridge tools (deckent_status/history/plan/…) — tier from classifyTool.
  const cli = createCliToolDispatcher();
  const genericSchema: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: true };
  for (const name of ['deckent_status', 'deckent_history', 'deckent_retro', 'deckent_doctor', 'deckent_models', 'deckent_review'] as const) {
    const tier = LEGACY_TIER[classifyTool(name, {})];
    registry.register(defineFromDispatcher(name, `Run the ${name} deckent command.`, genericSchema, tier, cli));
  }

  // MCP tools (external) — always 'confirm' (never silent); single gate via no-op confirm.
  if (opts.mcpBridge) {
    const alwaysApprove = async (): Promise<boolean> => true;
    const bridge = opts.mcpBridge;
    for (const t of bridge.listTools()) {
      registry.register({
        name: t.namespacedName,
        description: t.descriptor.description ?? `MCP tool ${t.namespacedName}`,
        inputSchema: t.descriptor.inputSchema ?? { type: 'object', additionalProperties: true },
        category: 'mcp',
        tier: 'confirm',
        source: 'mcp',
        handler: async (args) => {
          const r = await bridge.dispatch(t.namespacedName, args, alwaysApprove);
          return { ok: r.ok, output: r.output };
        },
      });
    }
  }

  return registry;
}
