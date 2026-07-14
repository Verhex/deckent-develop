// ═══ RoutingEngineV3 — Project Vocabulary Bootstrap ══════════════════
// Slice-0 FOUNDATION (sprint-445, task 445-022). Derives project-layer
// DomainDef *candidates* from a project's own directory shape + detected
// stack — never applied automatically. bootstrapProjectVocabulary() is a
// pure, read-only analysis step; writeVocabulary() is the only path that
// may ever touch `.deckent/routing/vocabulary.json`, and it never
// silently overwrites a user-edited file (three-way protection, mirroring
// agent-prompt-sync.ts's builtin-vs-shadow precedent).
//
// Source of truth: .analysis/routing-v3-secenek-b-detay-2026-07-14.md §1b.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { DomainDef } from './types.js';
import type { ProjectStack } from '../skill-types.js';
import { BUILTIN_DOMAINS } from './vocabulary-builtin.js';
import { PROJECT_VOCABULARY_RELATIVE_PATH } from './vocabulary.js';

// ─── Bootstrap types ──────────────────────────────────────────────────

/** One project-derived domain candidate, paired with why it was proposed. */
export interface VocabularyBootstrapCandidate {
  readonly domain: DomainDef;
  readonly rationale: string;
}

/** Why a top-level src/ subdirectory did NOT become a candidate. */
export type SkippedSubdirReason = 'not-substantial' | 'already-represented';

export interface SkippedSubdir {
  readonly name: string;
  readonly reason: SkippedSubdirReason;
  readonly detail: string;
}

export interface VocabularyBootstrapResult {
  /** New project-layer domain candidates — for human/Brain review, never auto-applied. */
  readonly candidates: readonly VocabularyBootstrapCandidate[];
  /** Every top-level src/ subdirectory that was considered and rejected, with a reason. */
  readonly skipped: readonly SkippedSubdir[];
}

// ─── Internals — directory scan ──────────────────────────────────────

const SCAN_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.deckent', '.brain', '__pycache__', '.venv', 'venv', '.next',
]);

function listTopLevelSrcSubdirs(projectRoot: string): string[] {
  const srcDir = path.join(projectRoot, 'src');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** Recursively count files under `dir`, skipping the usual noise directories. */
function countFilesRecursive(dir: string): number {
  let count = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SCAN_SKIP_DIRS.has(entry.name)) continue;
      count += countFilesRecursive(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

const MIN_SUBSTANTIAL_FILE_COUNT = 1;

// ─── Internals — coverage + candidate derivation ─────────────────────

/** True when `name` already names a builtin domain, by id OR alias (case-insensitive). */
function isRepresentedInBuiltinDomains(name: string): boolean {
  const lower = name.toLowerCase();
  return BUILTIN_DOMAINS.some(
    (d) => d.id.toLowerCase() === lower || d.aliases.some((alias) => alias.toLowerCase() === lower),
  );
}

/** kebab-case-safe domain id derived from a directory name. */
function normalizeDomainId(name: string): string {
  if (/^[a-z0-9][a-z0-9-]*$/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Dependencies from the detected stack whose full name, or scope-stripped
 * suffix (the part after the last "/", e.g. "core" from "@nestjs/core"),
 * case-insensitively equals the candidate domain id. Deliberately exact —
 * substring matching on short ids produces noisy false positives.
 */
function matchStackMarkers(domainId: string, dependencies: readonly string[]): string[] {
  const lower = domainId.toLowerCase();
  return dependencies.filter((dep) => {
    const depLower = dep.toLowerCase();
    const suffix = depLower.slice(depLower.lastIndexOf('/') + 1);
    return depLower === lower || suffix === lower;
  });
}

function describeStack(stack: ProjectStack): string {
  if (stack.framework && stack.framework !== 'unknown') {
    return `${stack.language} + ${stack.framework}`;
  }
  return stack.language;
}

/**
 * Derive project-layer DomainDef candidates from the project's own top-level
 * `src/` directory shape plus the already-detected project stack. Read-only —
 * this function never writes anything; see writeVocabulary() for the only
 * path that may persist candidates to `.deckent/routing/vocabulary.json`.
 *
 * A top-level src/ subdirectory becomes a candidate when it is (a) substantial
 * (contains at least one file, recursively) and (b) not already represented by
 * a builtin domain's id or alias. Coverage is checked by name only, NOT by
 * pathPatterns glob-overlap — several builtin domains already list patterns
 * like `src/nervous/**` or `src/agents/**` under a differently-named domain
 * (e.g. `orchestration`), and the point of this generator is to surface every
 * unnamed subdirectory for human review, not to second-guess an existing glob.
 */
export function bootstrapProjectVocabulary(projectRoot: string, stack: ProjectStack): VocabularyBootstrapResult {
  const candidates: VocabularyBootstrapCandidate[] = [];
  const skipped: SkippedSubdir[] = [];

  const subdirs = listTopLevelSrcSubdirs(projectRoot);
  const stackDescription = describeStack(stack);

  for (const subdir of subdirs) {
    const fileCount = countFilesRecursive(path.join(projectRoot, 'src', subdir));
    if (fileCount < MIN_SUBSTANTIAL_FILE_COUNT) {
      skipped.push({
        name: subdir,
        reason: 'not-substantial',
        detail: `src/${subdir}/ contains no files — not substantial enough to propose a domain.`,
      });
      continue;
    }

    if (isRepresentedInBuiltinDomains(subdir)) {
      skipped.push({
        name: subdir,
        reason: 'already-represented',
        detail: `'${subdir}' already matches a builtin domain id or alias.`,
      });
      continue;
    }

    const id = normalizeDomainId(subdir);
    const stackMarkers = matchStackMarkers(id, stack.dependencies);

    const domain: DomainDef = {
      id,
      aliases: [],
      pathPatterns: [`src/${subdir}/**`],
      stackMarkers,
      description:
        `Project-specific domain derived from the top-level directory src/${subdir}/ ` +
        `(auto-bootstrapped from ${stackDescription} project analysis).`,
      surfaces: [],
      exclusiveRoles: [],
    };

    let rationale =
      `Directory 'src/${subdir}/' contains ${fileCount} file(s) and is not represented by any ` +
      `builtin domain id or alias — proposed as new project-layer domain '${id}'.`;
    if (stackMarkers.length > 0) {
      rationale += ` Matched project dependency stackMarker(s): ${stackMarkers.join(', ')}.`;
    }

    candidates.push({ domain, rationale });
  }

  return { candidates, skipped };
}

// ─── writeVocabulary — three-way protected persistence ───────────────

const STATE_RELATIVE_PATH = path.join(path.dirname(PROJECT_VOCABULARY_RELATIVE_PATH), '.vocabulary-bootstrap-state.json');

export type VocabularyWriteStatus = 'created' | 'updated' | 'kept-local';

export interface VocabularyWriteResult {
  readonly status: VocabularyWriteStatus;
  /** Absolute path of `.deckent/routing/vocabulary.json`. */
  readonly path: string;
  /** Present only when status === 'kept-local'. */
  readonly reason?: string;
}

interface VocabularyBootstrapStateFile {
  _meta?: { generatedBy: string; schemaVersion: number };
  lastGeneratedHash?: string;
  generatedAt?: string;
}

function hashContent(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function readFileIfExists(filePath: string): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function readState(statePath: string): VocabularyBootstrapStateFile {
  let raw: Partial<VocabularyBootstrapStateFile> | null = null;
  try {
    raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<VocabularyBootstrapStateFile>;
  } catch {
    raw = null;
  }
  return {
    lastGeneratedHash: typeof raw?.lastGeneratedHash === 'string' ? raw.lastGeneratedHash : undefined,
    generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : undefined,
  };
}

/** Atomic tmp+rename write — mirrors agent-prompt-sync.ts's writeState. */
function writeState(statePath: string, lastGeneratedHash: string, generatedAt: string): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const withMeta: VocabularyBootstrapStateFile = {
    _meta: { generatedBy: 'vocabulary-bootstrap.ts', schemaVersion: 1 },
    lastGeneratedHash,
    generatedAt,
  };
  const tmpPath = `${statePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(withMeta, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmpPath, statePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }
}

/** Canonical `{ domains: [...] }` serialization — matches VocabularyLayerFileSchema exactly. */
function serializeVocabularyFile(defs: readonly DomainDef[]): string {
  const sorted = [...defs].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ domains: sorted }, null, 2) + '\n';
}

/**
 * The ONLY path allowed to persist domain definitions into
 * `.deckent/routing/vocabulary.json`. Three-way protected, mirroring
 * agent-prompt-sync.ts's builtin-vs-shadow precedent:
 *
 * (a) existing file unedited since the last bootstrap write (byte-equal to
 *     the recorded `lastGeneratedHash` baseline in the sidecar state file) ->
 *     safe to regenerate -> status 'updated'.
 * (b) existing file differs from both the newly-generated content AND the
 *     recorded baseline (or no baseline was ever recorded) -> the file was
 *     locally edited (or its provenance can't be verified) -> NEVER
 *     overwritten -> status 'kept-local', with `reason` explaining why.
 * (c) file missing -> created -> status 'created'.
 *
 * The sidecar baseline lives at `.deckent/routing/.vocabulary-bootstrap-state.json`
 * — never embedded inline in vocabulary.json itself, since that file's schema
 * (VocabularyLayerFileSchema) is zod `.strict()` with `domains` as its only key.
 */
export function writeVocabulary(projectRoot: string, defs: readonly DomainDef[]): VocabularyWriteResult {
  const targetPath = path.join(projectRoot, PROJECT_VOCABULARY_RELATIVE_PATH);
  const statePath = path.join(projectRoot, STATE_RELATIVE_PATH);

  const generatedContent = serializeVocabularyFile(defs);
  const generatedHash = hashContent(generatedContent);
  const generatedAt = new Date().toISOString();

  const existingContent = readFileIfExists(targetPath);

  // (c) missing -> create.
  if (existingContent === undefined) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, generatedContent, 'utf8');
    writeState(statePath, generatedHash, generatedAt);
    return { status: 'created', path: targetPath };
  }

  const existingHash = hashContent(existingContent);

  // Already exactly what bootstrap would generate — nothing to write; just
  // make sure the baseline stamp reflects it.
  if (existingHash === generatedHash) {
    const state = readState(statePath);
    if (state.lastGeneratedHash !== generatedHash) {
      writeState(statePath, generatedHash, generatedAt);
    }
    return { status: 'updated', path: targetPath };
  }

  const state = readState(statePath);

  // (a) unedited since the last bootstrap-generated write -> safe to regenerate.
  if (state.lastGeneratedHash !== undefined && existingHash === state.lastGeneratedHash) {
    fs.writeFileSync(targetPath, generatedContent, 'utf8');
    writeState(statePath, generatedHash, generatedAt);
    return { status: 'updated', path: targetPath };
  }

  // (b) locally edited, or provenance can't be verified -> never silently overwrite.
  return {
    status: 'kept-local',
    path: targetPath,
    reason:
      state.lastGeneratedHash === undefined
        ? 'no prior bootstrap baseline recorded for this file — its content cannot be verified as ' +
          'bootstrap-generated, refusing to overwrite'
        : 'existing vocabulary.json differs from both the last bootstrap-generated baseline and the ' +
          'newly-generated content (locally edited), refusing to overwrite',
  };
}
