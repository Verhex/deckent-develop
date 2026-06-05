/**
 * McpToolRegistry — namespaced tool registry for outgoing MCP connections (Sprint 229 Task 229-003).
 *
 * Tools are stored under `<server>__<tool>` keys so they never clash with deckent's own 32 MCP
 * tools. Callers (e.g. the REPL bridge in Task 5) call `register(server, tools)` after `listTools`
 * returns, and `resolve(namespacedName)` to get the original server+tool pair before dispatching
 * to the broker.
 *
 * The registry is purely in-memory; the broker does NOT import this module (ADR-008 one-way dep).
 * On reconnect, the caller clears the old entries with `clear(server)` then re-registers.
 */

import type { McpToolDescriptor } from './types.js';

/** A tool entry stored under its namespaced key. */
export interface NamespacedTool {
  /** `<server>__<tool>` */
  namespacedName: string;
  server: string;
  tool: string;
  descriptor: McpToolDescriptor;
}

/** Result of `resolve()` — the original server + tool pair. */
export interface ResolvedTool {
  server: string;
  tool: string;
}

const NS_SEP = '__';

/** Build a namespace key. */
function namespacedKey(server: string, tool: string): string {
  return `${server}${NS_SEP}${tool}`;
}

export class McpToolRegistry {
  /** Map from namespaced key to full entry. */
  private readonly entries = new Map<string, NamespacedTool>();

  /**
   * Register all tools returned by `listTools(server)` under their namespaced keys.
   * Calling `register` again for the same server replaces those entries (refresh on reconnect).
   */
  register(server: string, tools: McpToolDescriptor[]): void {
    // Remove stale entries for this server before re-adding (idempotent refresh).
    this.clear(server);
    for (const descriptor of tools) {
      const namespacedName = namespacedKey(server, descriptor.name);
      this.entries.set(namespacedName, { namespacedName, server, tool: descriptor.name, descriptor });
    }
  }

  /**
   * Remove all tool entries registered under `server`.
   * Used before a reconnect to avoid stale tool entries after the server restarts.
   */
  clear(server: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(`${server}${NS_SEP}`)) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Resolve a namespaced tool name back to its `{ server, tool }` pair.
   * Returns `undefined` when the name is not registered (unknown or never connected).
   */
  resolve(namespacedName: string): ResolvedTool | undefined {
    const idx = namespacedName.indexOf(NS_SEP);
    if (idx < 0) return undefined;
    const server = namespacedName.slice(0, idx);
    const tool = namespacedName.slice(idx + NS_SEP.length);
    if (!this.entries.has(namespacedKey(server, tool))) return undefined;
    return { server, tool };
  }

  /**
   * List all currently registered tools (all servers).
   * The returned array is a snapshot — mutations to the registry after this call are not reflected.
   */
  list(): NamespacedTool[] {
    return Array.from(this.entries.values());
  }

  /** Return all namespaced tool names for a specific server. */
  listForServer(server: string): NamespacedTool[] {
    return this.list().filter((e) => e.server === server);
  }

  /** Total number of registered tools across all servers. */
  get size(): number {
    return this.entries.size;
  }
}
