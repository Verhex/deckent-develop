// ─── Managed Docs Types ───────────────────────────────────────────────────
// Type definitions for user-defined document management.

import type { DocUpdateContext, DocUpdateResult } from '../doc-updaters/types.js';

// ─── ManagedDocEntry ──────────────────────────────────────────────────────

export interface ManagedDocEntry {
  /** Unique identifier (auto-generated from file path) */
  id: string;
  /** Relative file path from project root (e.g., "CLAUDE.md", "docs/ARCHITECTURE.md") */
  path: string;
  /** Section headings that Deckent auto-updates each sprint */
  autoSections?: string[];
  /** Section headings that Deckent never touches */
  protectedSections?: string[];
  /** Skill IDs to reference when generating content */
  skills?: string[];
  /** Max total lines for auto sections (0 = unlimited) */
  maxLines?: number;
  /** Whether this doc is managed (default: true) */
  enabled?: boolean;
}

// ─── DocsConfig ───────────────────────────────────────────────────────────

export interface DocsConfig {
  /** Schema version */
  version: 1;
  /** Array of managed document entries */
  docs: ManagedDocEntry[];
}

// ─── ParsedSection ────────────────────────────────────────────────────────

export interface ParsedSection {
  /** Full heading text (e.g., "## Module Map") */
  heading: string;
  /** Heading level (1 = #, 2 = ##, 3 = ###) */
  level: number;
  /** Line index where heading starts (0-based) */
  startLine: number;
  /** Line index where section ends (exclusive — next heading or EOF) */
  endLine: number;
  /** Section content (lines between heading and endLine, excluding heading) */
  content: string;
}

// ─── SectionGenerator ─────────────────────────────────────────────────────

export interface SectionGenerator {
  /** Matching patterns for section titles (case-insensitive) */
  patterns: string[];
  /** Generate section content from sprint context */
  generate(ctx: DocUpdateContext): string;
}

// ─── ManagedDocUpdateResult ───────────────────────────────────────────────

export interface ManagedDocUpdateResult extends DocUpdateResult {
  /** Which sections were updated */
  sectionsUpdated?: string[];
}
