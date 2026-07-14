// ═══ RoutingEngineV3 — Vocabulary Doctor ══════════════════════════════
// Sprint-445 Task 445-021. Read-only health report over the merged
// 3-layer domain registry (vocabulary.ts loadVocabulary): layer
// shadowing, dead pathPatterns (match nothing under projectRoot),
// duplicate aliases across domains, and domains with no description
// (the content-fit/LLM axis needs a description to work at all).
//
// EN by design, like vocabulary.ts/types.ts — this module is a structured
// data producer only, never a rendering surface. ADR-D-004 (Layer-1 Import
// Direction) binds this task: core/ MUST NOT import cli/, so no getMessage
// here — the CLI layer (src/cli/commands/doctor.ts) renders this report.

import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { matchGlob } from '../doc-tracking/glob.js';
import { loadVocabulary } from './vocabulary.js';
import type { LoadVocabularyOptions, ShadowedDomainEntry, VocabularyLayerCounts } from './vocabulary.js';

// ─── Report shape ───────────────────────────────────────────────────────

/** One domain pathPattern that matched zero files under projectRoot. */
export interface VocabularyDoctorDeadPattern {
  readonly domainId: string;
  readonly pattern: string;
}

/** One alias string shared by two or more domains. */
export interface VocabularyDoctorDuplicateAlias {
  readonly alias: string;
  readonly domainIds: readonly string[];
}

export interface VocabularyDoctorReport {
  /** Total merged domain count (builtin + org-overlay + project, deduped). */
  readonly domainCount: number;
  readonly layerCounts: VocabularyLayerCounts;
  /** Passthrough of loadVocabulary's own shadow report — the "layer shadowing" check. */
  readonly shadowed: readonly ShadowedDomainEntry[];
  readonly deadPathPatterns: readonly VocabularyDoctorDeadPattern[];
  readonly duplicateAliases: readonly VocabularyDoctorDuplicateAlias[];
  /** Domain ids whose description is empty/whitespace-only. */
  readonly domainsMissingDescription: readonly string[];
}

// ─── Project file walk (for the dead-pathPattern check) ─────────────────

/**
 * Directories pruned from the walk without descending — heavy/vendor/build
 * output that can never be meaningful positional evidence for a domain, and
 * would otherwise make the walk slow or noisy. Mirrors the existing
 * prune-heavy-dirs idiom used by doc-tracking/scanner.ts's walkMarkdown and
 * feature-truth.ts's walkSourceFiles.
 */
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', '.turbo', 'out', '.brain', '.deckent', 'vendor',
]);

const toPosix = (p: string): string => p.split(sep).join('/');

/** Recursively collect every file under `root` as a posix-relative path, pruning EXCLUDED_DIR_NAMES. Fail-soft: an unreadable directory is skipped, never thrown. */
async function walkProjectFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function rec(absDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        await rec(abs);
      } else if (entry.isFile()) {
        out.push(toPosix(relative(root, abs)));
      }
    }
  }

  await rec(root);
  return out;
}

// ─── Checks ───────────────────────────────────────────────────────────

function findDeadPathPatterns(
  domains: readonly { id: string; pathPatterns: readonly string[] }[],
  projectFiles: readonly string[],
): VocabularyDoctorDeadPattern[] {
  const dead: VocabularyDoctorDeadPattern[] = [];
  for (const domain of domains) {
    for (const pattern of domain.pathPatterns) {
      const matched = projectFiles.some((file) => matchGlob(file, pattern));
      if (!matched) {
        dead.push({ domainId: domain.id, pattern });
      }
    }
  }
  return dead;
}

function findDuplicateAliases(
  domains: readonly { id: string; aliases: readonly string[] }[],
): VocabularyDoctorDuplicateAlias[] {
  const owners = new Map<string, string[]>();
  for (const domain of domains) {
    for (const alias of domain.aliases) {
      const existing = owners.get(alias);
      if (existing) {
        existing.push(domain.id);
      } else {
        owners.set(alias, [domain.id]);
      }
    }
  }
  const duplicates: VocabularyDoctorDuplicateAlias[] = [];
  for (const [alias, domainIds] of owners) {
    if (domainIds.length > 1) {
      duplicates.push({ alias, domainIds });
    }
  }
  return duplicates;
}

function findDomainsMissingDescription(
  domains: readonly { id: string; description: string }[],
): string[] {
  return domains.filter((d) => d.description.trim().length === 0).map((d) => d.id);
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Build the read-only vocabulary health report for `projectRoot`. Loads the
 * merged 3-layer domain registry via loadVocabulary (fail-soft — a malformed
 * layer is already reported there via mergeReport.invalid and never breaks
 * this check), then evaluates the four vocabulary-doctor checks against the
 * merged domain list.
 */
export async function runVocabularyDoctor(
  projectRoot: string,
  opts: LoadVocabularyOptions = {},
): Promise<VocabularyDoctorReport> {
  const registry = await loadVocabulary(projectRoot, opts);
  const projectFiles = await walkProjectFiles(projectRoot);

  return {
    domainCount: registry.domains.length,
    layerCounts: registry.mergeReport.layerCounts,
    shadowed: registry.mergeReport.shadowed,
    deadPathPatterns: findDeadPathPatterns(registry.domains, projectFiles),
    duplicateAliases: findDuplicateAliases(registry.domains),
    domainsMissingDescription: findDomainsMissingDescription(registry.domains),
  };
}
