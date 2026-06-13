// ═══ ToolDefinition — the native-agent tool extension point (SP-1 §8) ═══════
// Any source (builtin, MCP, user, package, config) registers tools by
// implementing this contract. The registry exposes them as provider-native
// tool_use schemas. Hand-written validation (ADR-010, no schema dependency).

export type ToolPermissionTier = 'silent' | 'confirm' | 'always';
export type ToolSource = 'builtin' | 'mcp' | 'user' | 'package' | 'config';

export interface ToolResult {
  ok: boolean;
  output: string;
  meta?: Record<string, unknown>;
}

export interface ToolDefinition {
  /** Unique tool name (provider tool_use `name`). */
  name: string;
  /** Human/model-facing description (provider tool_use `description`). */
  description: string;
  /** JSON Schema for args (provider tool_use `input_schema`). */
  inputSchema: Record<string, unknown>;
  /** Open taxonomy: 'coding' | 'orchestration' | 'mcp' | 'web' | 'skill' | … */
  category: string;
  /** Default confirmation tier; policy may override by name/category. */
  tier: ToolPermissionTier;
  /** Where this tool came from (for telemetry + guard policy). */
  source: ToolSource;
  /** Executes the tool. Pure of the view; returns a structured result. */
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

const TIERS: ReadonlySet<string> = new Set(['silent', 'confirm', 'always']);
const SOURCES: ReadonlySet<string> = new Set(['builtin', 'mcp', 'user', 'package', 'config']);

/** Validate a candidate ToolDefinition; returns the first violation or null. */
export function validateToolDefinition(def: unknown): string | null {
  if (!def || typeof def !== 'object') return 'definition must be an object';
  const d = def as Partial<ToolDefinition>;
  if (typeof d.name !== 'string' || d.name.trim().length === 0) return 'name must be a non-empty string';
  if (typeof d.description !== 'string' || d.description.trim().length === 0) return 'description must be a non-empty string';
  if (!d.inputSchema || typeof d.inputSchema !== 'object' || Array.isArray(d.inputSchema)) return 'inputSchema must be a plain object';
  if (typeof d.category !== 'string' || d.category.trim().length === 0) return 'category must be a non-empty string';
  if (typeof d.tier !== 'string' || !TIERS.has(d.tier)) return `tier must be one of ${[...TIERS].join('|')}`;
  if (typeof d.source !== 'string' || !SOURCES.has(d.source)) return `source must be one of ${[...SOURCES].join('|')}`;
  if (typeof d.handler !== 'function') return 'handler must be a function';
  return null;
}
