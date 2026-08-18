// ═══ ToolRegistry — single registry for all tool sources (SP-1 §8) ══════════
// Sources (builtin/MCP/user/package/config) register ToolDefinitions here.
// toNativeSchemas() emits the provider tool_use schema list for the loop.

import { validateToolDefinition, type ToolDefinition } from './types.js';
import type {} from './exposure.js';

export interface NativeToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /** Register (or replace, last-write-wins) a tool. Throws on invalid shape. */
  register(def: ToolDefinition): void {
    const violation = validateToolDefinition(def);
    if (violation) throw new Error(`invalid tool definition: ${violation}`);
    this.tools.set(def.name, def);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Provider-native tool_use schema list (Anthropic/OpenAI-compat shape). */
  toNativeSchemas(filter?: (def: ToolDefinition) => boolean): NativeToolSchema[] {
    const definitions = filter ? this.list().filter(filter) : this.list();
    return definitions.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }
}
