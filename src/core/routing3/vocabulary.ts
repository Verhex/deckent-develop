// ═══ RoutingEngineV3 — Vocabulary 3-Layer Registry Loader ════════════
// Slice-0 FOUNDATION (sprint-445). Loads the open-set DOMAIN registry
// (spec §1b) across three precedence layers — builtin-base < org-overlay
// < project — mirroring the existing 3-layer config-merge pattern
// (src/core/config.ts loadConfig: global < project, absent-tolerant).
//
// Only the DOMAIN registry is layered here. WORK_TYPE and DELIVERABLE_TYPE
// stay closed-core (vocabulary-builtin.ts) — they are never user-extended.
//
// Source of truth: .analysis/routing-v3-secenek-b-detay-2026-07-14.md §1b.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { DomainDef } from './types.js';
import { DeckentError } from '../errors.js';
import { BUILTIN_DOMAINS } from './vocabulary-builtin.js';

// ─── Layer identity ───────────────────────────────────────────────────
export type VocabularyLayer = 'builtin' | 'org-overlay' | 'project';

/** Project-relative path of the highest-precedence (project) layer file. */
export const PROJECT_VOCABULARY_RELATIVE_PATH = '.deckent/routing/vocabulary.json';

// ─── Zod schema — one DomainDef entry (spec §1b JSON shape) ──────────
// `id` is the only mandatory field; every other field defaults to its
// empty form so a minimal overlay (e.g. just widening pathPatterns for an
// existing builtin domain id) does not force the author to restate the
// whole DomainDef. `.strict()` on both this schema and the wrapping file
// schema rejects unknown fields loudly rather than swallowing typos.
export const DomainDefSchema = z
  .object({
    id: z.string().min(1, 'domain id must be a non-empty string'),
    aliases: z.array(z.string()).default([]),
    pathPatterns: z.array(z.string()).default([]),
    stackMarkers: z.array(z.string()).default([]),
    description: z.string().default(''),
    surfaces: z.array(z.string()).default([]),
    exclusiveRoles: z.array(z.string()).default([]),
  })
  .strict();

/** The shape of a single vocabulary layer file (org-overlay or project). */
export const VocabularyLayerFileSchema = z
  .object({
    domains: z.array(DomainDefSchema).default([]),
  })
  .strict();

// ─── Typed error — malformed layer (spec: "Typed errors for malformed
// layers"). Mirrors InvalidWorkTypeError/InvalidSubtypeError in types.ts:
// a semantic ROUTING3_* code, never a registry row. Thrown internally by
// loadLayerFile and always caught by loadVocabulary — a malformed layer
// is reported (MergeReport.invalid) and skipped, it never aborts the
// overall merge or propagates out of loadVocabulary. ─────────────────
export class VocabularyLayerParseError extends DeckentError {
  /** Which layer failed to load. */
  public readonly layer: VocabularyLayer;
  /** The file path that failed to load. */
  public readonly path: string;
  constructor(layer: VocabularyLayer, path: string, detail: string) {
    super(
      'ROUTING3_VOCABULARY_LAYER_INVALID',
      `Vocabulary layer "${layer}" at ${path} is malformed: ${detail}`,
      'Fix the JSON syntax or schema violation in this vocabulary layer file, or remove it to fall back to the layer below. A malformed layer is skipped (fail-soft) but always reported — see MergeReport.invalid.',
    );
    this.name = 'VocabularyLayerParseError';
    this.layer = layer;
    this.path = path;
  }
}

// ─── loadVocabulary() options ─────────────────────────────────────────
export interface LoadVocabularyOptions {
  /**
   * Path to the org-overlay vocabulary file (enterprise-shared, spec §1b
   * layer 3). Absent-tolerant: when omitted, or when the file at this path
   * does not exist, the org-overlay layer contributes nothing (count 0,
   * no MergeReport.invalid entry) — this is the normal, expected case for
   * a project with no organization-wide overlay configured.
   */
  readonly orgOverlayPath?: string;
}

// ─── MergeReport ──────────────────────────────────────────────────────
export interface VocabularyLayerCounts {
  readonly builtin: number;
  readonly orgOverlay: number;
  readonly project: number;
}

/** One domain id whose definition from a lower layer was overridden. */
export interface ShadowedDomainEntry {
  readonly domainId: string;
  /** The layer whose definition was overridden. */
  readonly shadowedLayer: VocabularyLayer;
  /** The layer that provided the winning definition. */
  readonly shadowingLayer: VocabularyLayer;
}

/** One layer file that failed to load (malformed JSON or schema violation). */
export interface InvalidLayerEntry {
  readonly layer: VocabularyLayer;
  readonly path: string;
  readonly reason: string;
  readonly error: VocabularyLayerParseError;
}

export interface MergeReport {
  readonly layerCounts: VocabularyLayerCounts;
  readonly shadowed: readonly ShadowedDomainEntry[];
  readonly invalid: readonly InvalidLayerEntry[];
}

export interface VocabularyRegistry {
  readonly domains: readonly DomainDef[];
  readonly mergeReport: MergeReport;
}

// ─── Internals ────────────────────────────────────────────────────────

/** Fresh, independently-mutable clone of a DomainDef (never alias shared arrays). */
function cloneDomainDef(domain: DomainDef): DomainDef {
  return {
    id: domain.id,
    aliases: [...domain.aliases],
    pathPatterns: [...domain.pathPatterns],
    stackMarkers: [...domain.stackMarkers],
    description: domain.description,
    surfaces: [...domain.surfaces],
    exclusiveRoles: [...domain.exclusiveRoles],
  };
}

interface MergedEntry {
  readonly domain: DomainDef;
  readonly layer: VocabularyLayer;
}

/**
 * Apply one layer's domains onto the accumulating merge map, in order.
 * Any domain id already present (from a lower layer, OR an earlier entry
 * within this same layer file) is recorded as shadowed — shadowing is
 * reported, never silent, regardless of where the collision originates.
 */
function applyLayer(
  merged: Map<string, MergedEntry>,
  incoming: readonly DomainDef[],
  layer: VocabularyLayer,
  shadowed: ShadowedDomainEntry[],
): void {
  for (const raw of incoming) {
    const domain = cloneDomainDef(raw);
    const existing = merged.get(domain.id);
    if (existing) {
      shadowed.push({
        domainId: domain.id,
        shadowedLayer: existing.layer,
        shadowingLayer: layer,
      });
    }
    merged.set(domain.id, { domain, layer });
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type LayerLoadResult =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly error: VocabularyLayerParseError }
  | { readonly status: 'ok'; readonly domains: readonly DomainDef[] };

/** Read + parse + zod-validate one layer file. Never throws. */
async function loadLayerFile(layer: VocabularyLayer, filePath: string): Promise<LayerLoadResult> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if (isEnoent(err)) {
      return { status: 'absent' };
    }
    return { status: 'invalid', error: new VocabularyLayerParseError(layer, filePath, `read error: ${errMessage(err)}`) };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { status: 'invalid', error: new VocabularyLayerParseError(layer, filePath, `invalid JSON: ${errMessage(err)}`) };
  }

  const parsed = VocabularyLayerFileSchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '<root>'}: ${issue.message}`)
      .join('; ');
    return { status: 'invalid', error: new VocabularyLayerParseError(layer, filePath, detail) };
  }

  return { status: 'ok', domains: parsed.data.domains };
}

/** Recursively Object.freeze a plain-object/array tree (idempotent, cycle-free by construction here). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Load the 3-layer domain registry: builtin-base < org-overlay < project.
 *
 * - builtin: BUILTIN_DOMAINS (in-memory, always present).
 * - org-overlay: `opts.orgOverlayPath`, when given — absent-tolerant (no
 *   path, or a path whose file does not exist, silently contributes 0).
 * - project: `<projectRoot>/.deckent/routing/vocabulary.json` — missing
 *   file = builtin-only, the zero-config path.
 *
 * Higher layer wins on duplicate domain id (whole-entry replace). Each
 * layer file is zod-validated as a unit; a malformed layer is skipped and
 * reported in `mergeReport.invalid` — it never aborts the merge. Every
 * override is recorded in `mergeReport.shadowed`. The returned object
 * (and every nested array/object within it) is deep-frozen.
 */
export async function loadVocabulary(
  projectRoot: string,
  opts: LoadVocabularyOptions = {},
): Promise<VocabularyRegistry> {
  const merged = new Map<string, MergedEntry>();
  const shadowed: ShadowedDomainEntry[] = [];
  const invalid: InvalidLayerEntry[] = [];

  // Layer 1 — builtin-base.
  applyLayer(merged, BUILTIN_DOMAINS, 'builtin', shadowed);
  const builtinCount = BUILTIN_DOMAINS.length;

  // Layer 2 — org-overlay (absent-tolerant).
  let orgOverlayCount = 0;
  if (opts.orgOverlayPath) {
    const result = await loadLayerFile('org-overlay', opts.orgOverlayPath);
    if (result.status === 'ok') {
      orgOverlayCount = result.domains.length;
      applyLayer(merged, result.domains, 'org-overlay', shadowed);
    } else if (result.status === 'invalid') {
      invalid.push({
        layer: 'org-overlay',
        path: opts.orgOverlayPath,
        reason: result.error.message,
        error: result.error,
      });
    }
  }

  // Layer 3 — project (highest precedence; zero-config when missing).
  const projectPath = join(projectRoot, PROJECT_VOCABULARY_RELATIVE_PATH);
  let projectCount = 0;
  const projectResult = await loadLayerFile('project', projectPath);
  if (projectResult.status === 'ok') {
    projectCount = projectResult.domains.length;
    applyLayer(merged, projectResult.domains, 'project', shadowed);
  } else if (projectResult.status === 'invalid') {
    invalid.push({
      layer: 'project',
      path: projectPath,
      reason: projectResult.error.message,
      error: projectResult.error,
    });
  }

  const registry: VocabularyRegistry = {
    domains: Array.from(merged.values(), (entry) => entry.domain),
    mergeReport: {
      layerCounts: { builtin: builtinCount, orgOverlay: orgOverlayCount, project: projectCount },
      shadowed,
      invalid,
    },
  };

  return deepFreeze(registry);
}
