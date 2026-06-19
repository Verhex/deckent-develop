// ═══ Capability Realizer — AS4-P1 (Capability Realization Layer) ═════════════
// Converts a CapabilitySpec into provider-native CLI args (claude) or a
// text-fallback string (non-claude providers). Integration point for
// spawn-backend command-building — additive and opt-in (default-off).
//
// Claude path:
//   skill    → --append-system-prompt <content>
//   subagent → --agents <agentId>
//   mcp      → --mcp-config <configPath>
//
// Non-claude path (codex / gemini / ollama / custom):
//   All entries → textFallback (prompt-injection equivalent).
//
// ADR-008: orchestra/ may import core/; core/ must not import orchestra/. ✓
// ADR-010: Node built-ins only (fs, path). ✓

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CapabilitySpec,
  SkillCapabilityEntry,
} from '../core/capability-spec.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILLS_BASE = '.deckent/skills';
const SKILL_ENTRYPOINT = 'SKILL.md';

// ─── Result type ──────────────────────────────────────────────────────────────

/** Realized output for a specific provider. */
export interface RealizedCapabilities {
  /** The provider these args / fallback are realized for. */
  provider: string;
  /**
   * Extra CLI args to append to the provider's command (claude only).
   * Empty array for providers that use textFallback instead.
   */
  extraArgs: readonly string[];
  /**
   * Text block to prepend to the worker prompt as a system-context injection.
   * Present when the provider's CLI has no native capability flags.
   */
  textFallback?: string;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface RealizeCapabilitiesOptions {
  /**
   * Project root for resolving skill file paths when a SkillCapabilityEntry
   * has no pre-loaded `content`. When absent, missing content falls back to a
   * placeholder string (safe, hermetic for tests).
   */
  projectRoot?: string;
  /**
   * Opt-in native skills passthrough (AS4-P2). Maps to config
   * `native_skills_passthrough: true` or task field `useNativeSkills: true`.
   *
   * When true AND projectRoot is set: scans `<projectRoot>/.claude/skills/`
   * for skill directories and injects them as `--setting-sources <dir>` (claude)
   * or as a text-fallback block (non-claude providers).
   *
   * Default-off — v1-default spawn behavior is preserved when absent or false.
   */
  useNativeSkills?: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a CapabilitySpec into provider-native CLI args or a text-fallback.
 *
 * An empty spec is a no-op: returns `{ provider, extraArgs: [] }` with no
 * textFallback — preserving the v1-default spawn behavior (backward-safe).
 *
 * @param spec     The capability set to realize.
 * @param provider The target provider name, e.g. 'claude' | 'ollama'.
 * @param opts     Optional project root for skill file resolution.
 */
export function realizeCapabilities(
  spec: CapabilitySpec,
  provider: string,
  opts: RealizeCapabilitiesOptions = {},
): RealizedCapabilities {
  const isEmpty =
    !spec.skills?.length &&
    !spec.subagents?.length &&
    !spec.mcp?.length &&
    !opts.useNativeSkills;
  if (isEmpty) {
    return { provider, extraArgs: [] };
  }

  if (provider === 'claude') {
    return realizeForClaude(spec, opts);
  }
  return realizeWithTextFallback(spec, provider, opts);
}

// ─── Claude path ─────────────────────────────────────────────────────────────

function realizeForClaude(
  spec: CapabilitySpec,
  opts: RealizeCapabilitiesOptions,
): RealizedCapabilities {
  const args: string[] = [];

  for (const skill of spec.skills ?? []) {
    const content = resolveSkillContent(skill, opts.projectRoot);
    args.push('--append-system-prompt', content);
  }

  for (const subagent of spec.subagents ?? []) {
    args.push('--agents', subagent.agentId);
  }

  for (const mcpEntry of spec.mcp ?? []) {
    args.push('--mcp-config', mcpEntry.configPath);
  }

  if (opts.useNativeSkills && opts.projectRoot) {
    for (const dir of scanNativeSkillDirs(opts.projectRoot)) {
      args.push('--setting-sources', dir);
    }
  }

  return { provider: 'claude', extraArgs: args };
}

// ─── Text-fallback path (non-claude) ─────────────────────────────────────────

function realizeWithTextFallback(
  spec: CapabilitySpec,
  provider: string,
  opts: RealizeCapabilitiesOptions,
): RealizedCapabilities {
  const sections: string[] = [];

  for (const skill of spec.skills ?? []) {
    const content = resolveSkillContent(skill, opts.projectRoot);
    sections.push(`=== Skill: ${skill.skillId} ===\n${content}`);
  }

  for (const subagent of spec.subagents ?? []) {
    const desc = subagent.description ? `: ${subagent.description}` : '';
    sections.push(`=== Subagent: ${subagent.agentId}${desc} ===`);
  }

  for (const mcpEntry of spec.mcp ?? []) {
    sections.push(`=== MCP: ${mcpEntry.serverName} (${mcpEntry.configPath}) ===`);
  }

  if (opts.useNativeSkills && opts.projectRoot) {
    const dirs = scanNativeSkillDirs(opts.projectRoot);
    if (dirs.length > 0) {
      const ids = dirs.map((d) => d.split('/').pop() ?? d).join(', ');
      sections.push(`=== Native Skills: ${ids} ===\n(Available via .claude/skills/)`);
    }
  }

  return { provider, extraArgs: [], textFallback: sections.join('\n\n') };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Scan `<projectRoot>/.claude/skills/` and return absolute paths of skill
 * subdirectories. Used by the `useNativeSkills` / `native_skills_passthrough`
 * feature to build `--setting-sources` args for the claude provider.
 */
function scanNativeSkillDirs(projectRoot: string): string[] {
  const skillsDir = join(projectRoot, '.claude', 'skills');
  if (!existsSync(skillsDir)) return [];
  try {
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(skillsDir, e.name));
  } catch {
    return [];
  }
}

function resolveSkillContent(
  entry: SkillCapabilityEntry,
  projectRoot?: string,
): string {
  if (entry.content !== undefined) return entry.content;
  if (!projectRoot) return `[skill: ${entry.skillId}]`;

  const filePath = join(projectRoot, SKILLS_BASE, entry.skillId, SKILL_ENTRYPOINT);
  if (existsSync(filePath)) {
    try {
      return readFileSync(filePath, 'utf8');
    } catch {
      return `[skill: ${entry.skillId}]`;
    }
  }
  return `[skill: ${entry.skillId}]`;
}
