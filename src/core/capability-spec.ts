// ═══ Capability Spec — AS4-P1 (Capability Realization Layer) ═════════════════
// Describes a set of capabilities (skills, subagents, MCP servers) that a task
// wants wired into its provider at spawn time. `realizeCapabilities()` in
// `src/orchestra/capability-realizer.ts` converts a CapabilitySpec into either
// provider-native CLI args (claude) or a text-fallback (non-claude providers).
//
// ADR-008 (core/ must not import orchestra/): types only; no I/O here.
// ADR-010 (single runtime dep): no imports — pure type declarations.

/** A skill to inject into the provider's context. */
export interface SkillCapabilityEntry {
  /** Deckent skill id, e.g. 'typescript-expert'. */
  skillId: string;
  /**
   * Pre-loaded content of the skill's SKILL.md.
   * When present, used directly; when absent, `realizeCapabilities` tries to
   * read from `<projectRoot>/.deckent/skills/<skillId>/SKILL.md`.
   */
  content?: string;
}

/** A subagent the task should orchestrate. */
export interface SubagentCapabilityEntry {
  /** Deckent agent id, e.g. 'code-reviewer'. */
  agentId: string;
  /** Optional human-readable purpose — used in text-fallback blocks. */
  description?: string;
}

/** An MCP server config to wire into the provider (AS-5, future). */
export interface McpCapabilityEntry {
  /** Server identifier, e.g. 'github'. */
  serverName: string;
  /** Absolute path to the MCP config JSON consumed by the provider CLI. */
  configPath: string;
}

/**
 * Describes the complete set of capabilities a task requests at spawn time.
 * All fields are optional: an empty CapabilitySpec is a no-op (backward-safe).
 *
 * Consumed by `realizeCapabilities()` in `src/orchestra/capability-realizer.ts`
 * to produce provider-native CLI args (claude) or prompt-injection text (others).
 */
export interface CapabilitySpec {
  /** Skills whose content should be injected into the provider's context. */
  skills?: SkillCapabilityEntry[];
  /** Subagents the task wants the provider to orchestrate. */
  subagents?: SubagentCapabilityEntry[];
  /** MCP server configs to wire into the provider (AS-5). */
  mcp?: McpCapabilityEntry[];
}
