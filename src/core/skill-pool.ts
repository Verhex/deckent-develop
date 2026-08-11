// ─── Skill Pool Manager ─────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SkillDefinition, SkillCategory, SkillStats } from './skill-types.js';
import { createDefaultSkillStats } from './skill-types.js';
import { createDefaultActivationConfig } from './routing-types.js';
import { readJsonSafe, debugLog } from './utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const SKILLS_DIR = '.deckent/skills';
const MANIFEST_FILENAME = 'manifest.json';
const SKILL_MD_FILENAME = 'SKILL.md';
const CONFIG_FILENAME = path.join('.deckent', 'config.json');

// ─── Builtin Fallback (371-001 CATALOG-MATERIALIZE) ─────────────────────────
//
// D-004 layer pattern: .deckent override > builtin default. A builtin skill
// that has never been materialized into .deckent/skills/<id>/manifest.json
// (e.g. shipped in src/core/builtins/skills/<id>/ with only a SKILL.md, no
// manifest.json anywhere yet) must still be pool-visible — otherwise it is
// invisible to routing/selection until some future `deckent init` re-seed
// AND a manifest is hand-authored, which never happens automatically.
//
// This reads the builtin tree directly at load time (in-memory synthesis
// only, never writes to disk) rather than having the sync step
// (seedBuiltins/init-steps.ts) materialize manifests — that function lives
// outside this module's write authority, and writing a manifest as a
// side-effect of a *read* method would make loadSkills() non-hermetic.

/**
 * Resolve the builtin skills directory relative to THIS module's own file
 * location (src/core/skill-pool.ts or dist/core/skill-pool.js — either way
 * builtins/ is a direct sibling, copied to dist/ by scripts/copy-assets.mjs).
 */
function resolveBuiltinSkillsDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, 'builtins', 'skills');
}

/** Title-case a kebab/snake-case id as a last-resort name (e.g. "api-design" -> "Api Design"). */
function titleCaseFromId(id: string): string {
  return id
    .split(/[-_]/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Parse a builtin SKILL.md/PROMPT.md body for its H1 title and lead paragraph
 * (the free-text block directly under the title, before the next heading or
 * blank-line gap). Tolerates an optional YAML frontmatter block. Returns
 * empty strings when no title/lead paragraph is present — both are optional
 * on SkillDefinition/AgentDefinition, so callers fall back to id-derived
 * defaults rather than failing.
 */
function parseMarkdownTitleAndLead(markdown: string): { title: string; lead: string } {
  const withoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
  const lines = withoutFrontmatter.split('\n');

  let title = '';
  let titleIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = /^#\s+(.+)$/.exec(lines[i]!.trim());
    if (match) {
      title = match[1]!.trim();
      titleIndex = i;
      break;
    }
  }

  const leadLines: string[] = [];
  if (titleIndex >= 0) {
    for (let i = titleIndex + 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '') {
        if (leadLines.length > 0) break;
        continue;
      }
      if (/^#{1,6}\s/.test(line)) break;
      leadLines.push(line);
    }
  }

  return { title, lead: leadLines.join(' ').trim() };
}

/**
 * Synthesize a minimal, valid SkillDefinition (as a raw JSON-shaped record,
 * matching the readJsonSafe<Record<string,unknown>> shape used for on-disk
 * manifests) from a builtin SKILL.md that has no accompanying manifest.json.
 * Returns null if the file cannot be read.
 */
function synthesizeSkillManifest(id: string, skillMdPath: string): Record<string, unknown> | null {
  let content: string;
  try {
    content = fs.readFileSync(skillMdPath, 'utf8');
  } catch {
    return null;
  }

  const { title, lead } = parseMarkdownTitleAndLead(content);
  const name = title || titleCaseFromId(id);

  return {
    id,
    name,
    version: '0.1.0',
    description: lead,
    entrypoint: SKILL_MD_FILENAME,
    category: 'domain',
    manifestVersion: 2,
    triggers: [],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 5,
    promptInjection: { position: 'append', maxTokens: 1500 },
    enabled: true,
    source: 'builtin',
    stats: createDefaultSkillStats(),
    // Well-formed but inert (no rules -> never scores above minScore): the V2
    // routing engine indexes activation.rules unconditionally for every
    // pool member, so leaving this field undefined (rather than an empty,
    // valid ActivationConfig) breaks scoring for the WHOLE pool, not just
    // this entry.
    activation: createDefaultActivationConfig(),
  };
}

// ─── Validation Constants ───────────────────────────────────────────────────

const VALID_CATEGORIES: SkillCategory[] = ['language', 'framework', 'tool', 'domain', 'workflow'];
const VALID_POSITIONS = ['prepend', 'append', 'section'] as const;
import { modelRegistry, resolveCanonicalModelIdentity } from './model-registry.js';

// ─── Activation Schema (born-590 ACTIVATION-VALIDATION) ─────────────────────
//
// `activation` (ActivationConfig — routing-types.ts) is the sole real
// scoring input the routing/activation engine reads (activation-engine.ts
// indexes `config.rules`/`config.exclude`/`config.minScore` unconditionally
// for every pool member), yet it was never validated at load time — a
// manually-edited manifest with a malformed `activation` block silently
// entered the pool with a broken scoring shape instead of being excluded.
// Mirrors the ActivationConfig/ActivationRule/ExclusionRule interfaces
// (routing-types.ts) exactly — kept file-local rather than importing a
// schema from routing-types.ts (a types-only module outside this task's
// write scope) and duplicated in agent-pool.ts for the same reason
// parseMarkdownTitleAndLead is duplicated there: the two pool managers are
// outside each other's write/read scope for this task.
const activationRuleSchema = z.object({
  name: z.string().optional(),
  when: z.record(z.string(), z.unknown()),
  score: z.number(),
});
const activationExclusionRuleSchema = z.object({
  name: z.string().optional(),
  when: z.record(z.string(), z.unknown()),
  reason: z.string().optional(),
});
const activationConfigSchema = z.object({
  rules: z.array(activationRuleSchema),
  exclude: z.array(activationExclusionRuleSchema),
  minScore: z.number(),
});

/**
 * Validate `activation` (when present) against {@link activationConfigSchema}
 * and append one human-readable error per zod issue to `errors`. Absent
 * `activation` is intentionally left unvalidated — downstream already
 * defaults it via createDefaultActivationConfig() at synthesis time, and
 * requiring it on every hand-authored manifest would be a behavior-narrowing
 * this task does not ask for ("davranışı DARALTMA").
 */
function validateActivationField(activation: unknown, errors: string[]): void {
  if (activation === undefined) return;
  const result = activationConfigSchema.safeParse(activation);
  if (result.success) return;
  for (const issue of result.error.issues) {
    const fieldPath = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
    errors.push(`"activation${fieldPath}" ${issue.message}`);
  }
}

// ─── Manifest Normalization (born-641 POOL-LOAD-NORMALIZE) ──────────────────
//
// born-641 (secure-coding-shaped manifest missing an optional field) dropped V2
// routing TWICE via two DIFFERENT unguarded downstream reads (stackDetection,
// then composableWith) — each incident got a point-guard (`?? []`) at its own
// crash site, but the underlying class (a manifest that omits an optional field
// passes validation, yet the field stays `undefined` for every OTHER consumer)
// was never closed. This normalizes the pool-load path itself so no downstream
// engine (routing/selector/gate) ever sees `undefined` for these fields again —
// applied ONLY after validate*Definition() confirms the manifest is valid, so a
// present-but-wrong-typed field is still rejected (fail-soft skip+warn is
// UNCHANGED); this only fills fields that are literally absent. Limited to
// fields already declared on SkillDefinition — no new fields invented.
function normalizeSkillManifest(raw: Record<string, unknown>): void {
  if (raw['triggers'] === undefined) raw['triggers'] = [];
  if (raw['composableWith'] === undefined) raw['composableWith'] = [];
  if (raw['category'] === undefined) raw['category'] = 'domain';

  if (raw['stackDetection'] === undefined) {
    raw['stackDetection'] = { files: [], dependencies: [], commands: [] };
  } else if (raw['stackDetection'] && typeof raw['stackDetection'] === 'object' && !Array.isArray(raw['stackDetection'])) {
    const sd = raw['stackDetection'] as Record<string, unknown>;
    if (sd['files'] === undefined) sd['files'] = [];
    if (sd['dependencies'] === undefined) sd['dependencies'] = [];
    if (sd['commands'] === undefined) sd['commands'] = [];
  }
}

// ─── Load Diagnostics (born-590) ─────────────────────────────────────────────

/** A manifest skipped during the most recent load because it failed validation or JSON parsing. */
export interface InvalidManifestEntry {
  id: string;
  path: string;
  errors: string[];
}

// ─── Stats Sidecar (born-605 STATS-SIDECAR) ─────────────────────────────────
//
// Mirrors agent-pool.ts's identical sidecar section — see that file's comment
// for the full rationale. Duplicated file-local (not a shared module) because
// the two pool managers are outside each other's write/read scope for this
// task, same reasoning as the existing parseMarkdownTitleAndLead duplication.
// Both pool managers target the SAME physical ledger file
// (`.deckent/stats/catalog-stats.json`, `{agents:{}, skills:{}}`) — each write
// re-reads the full ledger first (read-merge-write) so a same-tick write from
// the other pool manager's own key is never clobbered.

const STATS_SIDECAR_RELATIVE_PATH = path.join('.deckent', 'stats', 'catalog-stats.json');

interface StatsSidecarLedger {
  agents: Record<string, unknown>;
  skills: Record<string, SkillStats>;
}

/** Defensive read — a missing/corrupt/malformed ledger degrades to an empty one, never throws. */
function readStatsSidecarLedger(projectRoot: string): StatsSidecarLedger {
  const raw = readJsonSafe<Partial<StatsSidecarLedger>>(
    path.join(projectRoot, STATS_SIDECAR_RELATIVE_PATH),
  );
  const agents = raw?.agents && typeof raw.agents === 'object' && !Array.isArray(raw.agents)
    ? raw.agents
    : {};
  const skills = raw?.skills && typeof raw.skills === 'object' && !Array.isArray(raw.skills)
    ? raw.skills
    : {};
  return { agents, skills: skills as Record<string, SkillStats> };
}

/**
 * Read-merge-write a single skill's stats into the shared sidecar ledger, atomically
 * (tmp file + rename — mirrors approval-broker.ts's atomicWriteJson pattern).
 */
function writeSkillStatsToSidecar(projectRoot: string, id: string, stats: SkillStats): void {
  const ledger = readStatsSidecarLedger(projectRoot);
  ledger.skills[id] = stats;
  const fullPath = path.join(projectRoot, STATS_SIDECAR_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tmpPath = `${fullPath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmpPath, fullPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }
}

// ─── Effective Skill Catalog — the single read model (521-004, design S1) ───
//
// follow-up-works/skill-catalog-authority-design-2026-08-11.md §3.1/§3.6/§4/§5.
// Before this slice there were two directory-scan paths inside this module
// (loadSkills' project scan and _loadBuiltinFallback's private builtin rescan),
// each with its own layer coverage, and neither could express "this id exists
// but is withdrawn". Now there is ONE resolver: it collects every content layer,
// applies the D1 precedence, masks the disposition layers and reports invalid
// manifests — every public method on SkillPoolManager is a projection of it.

/**
 * Layers that can supply skill CONTENT (§3.1 L1–L3), ordered by
 * {@link SKILL_LAYER_RANK}. L4 (quarantined) and L5 (retired) are deliberately
 * NOT layers here: they are dispositions that mask content, because absence on
 * disk is indistinguishable from "never installed" (§3.1).
 */
export type SkillCatalogLayer = 'builtin' | 'project' | 'generated';

/**
 * Content-layer precedence — OWNER DECISION D1 (2026-08-11, Alperen):
 * generated/learned sits BELOW a hand-authored project override, so the
 * learning loop can never silently overwrite operator intent. Both outrank the
 * shipped builtin package.
 */
export const SKILL_LAYER_RANK: Record<SkillCatalogLayer, number> = {
  project: 3,
  generated: 2,
  builtin: 1,
};

/** §3.1 L4/L5 + the existing `enabled` boolean, expressed as one typed state. */
export type SkillDispositionState = 'active' | 'disabled' | 'quarantined' | 'retired';

/** §3.3 `provenance.kind` — typed, never inferred from directory position alone. */
export type SkillProvenanceKind = 'builtin' | 'project' | 'generated' | 'imported' | 'marketplace';

export interface SkillDisposition {
  state: SkillDispositionState;
  reasonCode: string | null;
  since: string | null;
  supersededBy: string | null;
}

/** One resolved catalog row — what "this skill, right now, for this project" means. */
export interface EffectiveSkill {
  id: string;
  /** Which content layer won the precedence contest. */
  layer: SkillCatalogLayer;
  provenance: { kind: SkillProvenanceKind };
  disposition: SkillDisposition;
  /** Quarantined/retired ids are never resolvable by any surface (§3.1 fail-closed). */
  masked: boolean;
  definition: SkillDefinition;
  /** The file this record's content came from (manifest.json, or a builtin SKILL.md). */
  sourcePath: string;
  /** Layer trail of the records this one shadowed, e.g. `['builtin@0.1.0']` (§3.6). */
  overrides: string[];
  statsSource: 'sidecar' | 'manifest' | 'defaults';
}

export interface SkillCatalogResolution {
  /** Every known id, sorted byte-wise by id (§5 rule 1), INCLUDING masked records. */
  entries: EffectiveSkill[];
  /** Manifests excluded from the catalog — reported, never silently skipped (§4 point 3). */
  invalid: InvalidManifestEntry[];
}

// ─── Flat skill-id contract (§3.2 + OWNER DECISION D9) ──────────────────────
//
// D9 ALTERNATİF KABUL: flat ids + registry mapping — a `publisher/id` qualified
// id is NOT a skill id. Path-safety is normative, not incidental: this string is
// used as a directory name by every writer, so it must be safe on the whole
// platform matrix (Immutable Law 2), not on Linux only.

const SKILL_ID_MAX_LENGTH = 64;
const FLAT_SKILL_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Windows reserved device names — unusable as a directory on the whole matrix. */
const WINDOWS_RESERVED_IDS: ReadonlySet<string> = new Set([
  'con', 'prn', 'aux', 'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

export type SkillIdParseResult = { ok: true; id: string } | { ok: false; reason: string };

/**
 * The single skill-id contract. Fail-closed: an id that cannot be a safe
 * directory name on every supported platform is rejected with a typed reason
 * rather than becoming a second catalog entry (or a path-traversal primitive).
 */
export function parseSkillId(raw: unknown): SkillIdParseResult {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: '"id" must be a non-empty string' };
  }
  if (raw.length > SKILL_ID_MAX_LENGTH) {
    return { ok: false, reason: `"id" must be at most ${SKILL_ID_MAX_LENGTH} characters` };
  }
  if (raw.includes('/') || raw.includes('\\')) {
    return {
      ok: false,
      reason: '"id" must be a flat id — publisher-qualified or path-bearing ids are rejected (D9: flat-id + registry mapping)',
    };
  }
  if (!FLAT_SKILL_ID_PATTERN.test(raw)) {
    return {
      ok: false,
      reason: '"id" must match the flat skill-id grammar: lowercase ASCII letters/digits with interior hyphens, no leading or trailing hyphen',
    };
  }
  if (WINDOWS_RESERVED_IDS.has(raw)) {
    return { ok: false, reason: `"id" must not be a reserved filesystem device name ("${raw}")` };
  }
  return { ok: true, id: raw };
}

// ─── Disposition ledger (§3.1 L4/L5, read-only in this slice) ───────────────
//
// Quarantine and retirement become DATA here. Writing the ledger (wrapping
// SkillSandbox.quarantine's directory move, retire + id-lock, the spawner's
// typed HOLD extension) is slice S7 and lives outside this module — this slice
// only guarantees that when the ledger says an id is withdrawn, no surface can
// resolve it, and that `getEffective()` still returns its tombstone.

const DISPOSITION_LEDGER_RELATIVE_PATH = path.join('.deckent', 'catalog', 'skill-dispositions.json');
// `active` is deliberately absent: an active ledger row carries no information
// the manifest does not already carry, and letting it win would let the ledger
// silently contradict a manifest's own `enabled: false`.
const DISPOSITION_LEDGER_STATES: ReadonlySet<string> = new Set(['disabled', 'quarantined', 'retired']);
const MASKING_STATES: ReadonlySet<string> = new Set(['quarantined', 'retired']);

/** Defensive read — a missing/corrupt/malformed ledger degrades to "no dispositions", never throws. */
function readDispositionLedger(projectRoot: string): Map<string, SkillDisposition> {
  const dispositions = new Map<string, SkillDisposition>();
  const raw = readJsonSafe<{ entries?: unknown }>(
    path.join(projectRoot, DISPOSITION_LEDGER_RELATIVE_PATH),
  );
  const entries = raw?.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return dispositions;

  for (const [rawId, value] of Object.entries(entries as Record<string, unknown>)) {
    const parsedId = parseSkillId(rawId);
    if (!parsedId.ok) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const state = record['state'];
    if (typeof state !== 'string' || !DISPOSITION_LEDGER_STATES.has(state)) continue;
    dispositions.set(parsedId.id, {
      state: state as SkillDispositionState,
      reasonCode: typeof record['reasonCode'] === 'string' ? record['reasonCode'] : null,
      since: typeof record['since'] === 'string' ? record['since'] : null,
      supersededBy: typeof record['supersededBy'] === 'string' ? record['supersededBy'] : null,
    });
  }
  return dispositions;
}

// ─── Resolver internals ─────────────────────────────────────────────────────

/**
 * The single directory-scan primitive for the skill catalog.
 * {@link resolveSkillCatalog} is its ONLY caller — that is what makes the D10
 * enforcement ratchet (a surviving private `readdirSync` over the catalog roots
 * becomes a lint failure) mechanically possible in a later slice.
 */
function scanCatalogDirectory(dir: string): fs.Dirent[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return Array.isArray(entries) ? entries : [];
}

/** Values that mark a manifest as machine-produced (`source` today, `provenance.kind` in schema v1). */
const GENERATED_PROVENANCE_VALUES: ReadonlySet<string> = new Set(['generated', 'learned']);

/** Read the declared provenance kind, preferring the typed block over the legacy `source` string. */
function readDeclaredProvenance(raw: Record<string, unknown>): string | undefined {
  const provenance = raw['provenance'];
  if (provenance && typeof provenance === 'object' && !Array.isArray(provenance)) {
    const kind = (provenance as Record<string, unknown>)['kind'];
    if (typeof kind === 'string') return kind;
  }
  const source = raw['source'];
  return typeof source === 'string' ? source : undefined;
}

/**
 * L2 vs L3 for a project-tree manifest: both live in `.deckent/skills/<id>/`,
 * so the layer follows the manifest's own declared provenance, never its path.
 */
function classifyProjectLayer(raw: Record<string, unknown>): SkillCatalogLayer {
  const declared = readDeclaredProvenance(raw);
  return declared !== undefined && GENERATED_PROVENANCE_VALUES.has(declared) ? 'generated' : 'project';
}

function classifyProvenanceKind(raw: Record<string, unknown>, layer: SkillCatalogLayer): SkillProvenanceKind {
  const declared = readDeclaredProvenance(raw);
  switch (declared) {
    case 'builtin':
    case 'project':
    case 'generated':
    case 'imported':
    case 'marketplace':
      return declared;
    case 'learned':
      return 'generated';
    default:
      return layer;
  }
}

/**
 * Apply the D1 precedence to the candidates collected for ONE id: highest
 * {@link SKILL_LAYER_RANK} wins; a tie keeps the first candidate, so resolution
 * is a pure function of the candidate list and never of scan order.
 */
export function pickEffectiveLayer<T extends { layer: SkillCatalogLayer }>(
  candidates: readonly T[],
): T | undefined {
  let winner: T | undefined;
  for (const candidate of candidates) {
    if (!winner || SKILL_LAYER_RANK[candidate.layer] > SKILL_LAYER_RANK[winner.layer]) {
      winner = candidate;
    }
  }
  return winner;
}

/**
 * Resolve the effective skill catalog for one project root — the single
 * resolution path behind every skill-pool read.
 *
 * Layer coverage is the union of what the two previous scan paths saw:
 * `.deckent/skills/<id>/manifest.json` (L2 hand-authored / L3 generated, split
 * by declared provenance) and the shipped builtin package (L1), synthesised
 * in-memory from `SKILL.md` under exactly the pre-existing gates — the project
 * must have been through `deckent init` (`.deckent/config.json` exists), and a
 * builtin directory that ships its own `manifest.json` is left to the normal
 * override path. Dispositions mask; sidecar stats overlay; invalid manifests
 * are reported rather than dropped; entries come back sorted by id.
 */
export function resolveSkillCatalog(projectRoot: string): SkillCatalogResolution {
  const invalid: InvalidManifestEntry[] = [];
  const candidates = new Map<string, EffectiveSkill[]>();

  const addCandidate = (
    raw: Record<string, unknown>,
    sourcePath: string,
    layer: SkillCatalogLayer,
    fallbackId: string,
  ): void => {
    const validation = SkillPoolManager.validateSkillDefinition(raw);
    if (!validation.valid) {
      invalid.push({ id: fallbackId, path: sourcePath, errors: validation.errors });
      return;
    }
    const parsedId = parseSkillId(raw['id']);
    if (!parsedId.ok) {
      invalid.push({ id: fallbackId, path: sourcePath, errors: [parsedId.reason] });
      return;
    }
    normalizeSkillManifest(raw);
    const definition = raw as unknown as SkillDefinition;
    const record: EffectiveSkill = {
      id: parsedId.id,
      layer,
      provenance: { kind: classifyProvenanceKind(raw, layer) },
      disposition: {
        state: definition.enabled === false ? 'disabled' : 'active',
        reasonCode: null,
        since: null,
        supersededBy: null,
      },
      masked: false,
      definition,
      sourcePath,
      overrides: [],
      statsSource: raw['stats'] !== undefined ? 'manifest' : 'defaults',
    };
    const group = candidates.get(record.id);
    if (group) group.push(record);
    else candidates.set(record.id, [record]);
  };

  // ── L2 / L3 — project tree ────────────────────────────────────────────────
  const skillsDir = path.join(projectRoot, SKILLS_DIR);
  if (fs.existsSync(skillsDir)) {
    for (const entry of scanCatalogDirectory(skillsDir)) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(skillsDir, entry.name, MANIFEST_FILENAME);
      if (!fs.existsSync(manifestPath)) continue;
      const raw = readJsonSafe<Record<string, unknown>>(manifestPath);
      if (!raw) {
        invalid.push({
          id: entry.name,
          path: manifestPath,
          errors: ['manifest.json exists but is unreadable or contains invalid JSON'],
        });
        continue;
      }
      addCandidate(raw, manifestPath, classifyProjectLayer(raw), entry.name);
    }
  }

  // ── L1 — shipped builtin package ──────────────────────────────────────────
  if (fs.existsSync(path.join(projectRoot, CONFIG_FILENAME))) {
    const builtinDir = resolveBuiltinSkillsDir();
    if (fs.existsSync(builtinDir)) {
      for (const entry of scanCatalogDirectory(builtinDir)) {
        if (!entry.isDirectory()) continue;
        const entryDir = path.join(builtinDir, entry.name);
        const files = scanCatalogDirectory(entryDir);
        if (files.some((f) => f.name === MANIFEST_FILENAME)) continue;
        if (!files.some((f) => f.name === SKILL_MD_FILENAME)) continue;
        const skillMdPath = path.join(entryDir, SKILL_MD_FILENAME);
        const raw = synthesizeSkillManifest(entry.name, skillMdPath);
        if (!raw) continue;
        addCandidate(raw, skillMdPath, 'builtin', entry.name);
      }
    }
  }

  // ── Merge: precedence → disposition → effective stats ─────────────────────
  const statsLedger = readStatsSidecarLedger(projectRoot);
  const dispositions = readDispositionLedger(projectRoot);
  const entries: EffectiveSkill[] = [];

  for (const [id, group] of candidates) {
    const winner = pickEffectiveLayer(group);
    if (!winner) continue;

    winner.overrides = group
      .filter((candidate) => candidate !== winner)
      .map((candidate) => `${candidate.layer}@${candidate.definition.version || '0.0.0'}`)
      .sort();

    const declared = dispositions.get(id);
    if (declared) winner.disposition = declared;
    winner.masked = MASKING_STATES.has(winner.disposition.state);

    const sidecarStats = statsLedger.skills[id];
    if (sidecarStats && typeof sidecarStats === 'object') {
      winner.definition.stats = sidecarStats;
      winner.statsSource = 'sidecar';
    }

    entries.push(winner);
  }

  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { entries, invalid };
}

// ─── Skill Pool Manager ────────────────────────────────────────────────────

export class SkillPoolManager {
  constructor(private projectRoot: string) {}

  /** Manifests skipped during the most recent loadSkills() call (born-590 — see getInvalidManifests). */
  private invalidManifests: InvalidManifestEntry[] = [];

  /**
   * Run the single resolver, publish its invalid-manifest report, and emit a
   * visible signal per skipped manifest via the existing debugLog primitive
   * (stderr when DECKENT_DEBUG is set, always persisted to .brain/ERRORS.md) —
   * the never-silent-skip contract from born-590, now sourced from the one
   * resolution path instead of from two private scans.
   */
  private _resolveCatalog(): SkillCatalogResolution {
    const resolution = resolveSkillCatalog(this.projectRoot);
    this.invalidManifests = resolution.invalid;
    for (const entry of resolution.invalid) {
      debugLog('skill-pool:invalid-manifest', `${entry.id} (${entry.path}): ${entry.errors.join('; ')}`);
    }
    return resolution;
  }

  /** Manifests skipped during the most recent loadSkills() call because they failed validation or JSON parsing (born-590). */
  getInvalidManifests(): InvalidManifestEntry[] {
    return [...this.invalidManifests];
  }

  /** Count of manifests skipped during the most recent loadSkills() call (born-590). */
  getInvalidCount(): number {
    return this.invalidManifests.length;
  }

  // ─── Load ───────────────────────────────────────────────────────────────────

  /**
   * Load the resolvable skills for this project as a Map<string, SkillDefinition>.
   *
   * A projection of the single resolver (see {@link resolveSkillCatalog}): the
   * pool is every effective record whose disposition does not mask it. A
   * `disabled` skill still loads — `enabled` has always been enforced by the
   * consumer (listEnabled/the spawner's forced-skill HOLD), not by the loader —
   * while a quarantined or retired id is unresolvable here by construction.
   * Manifests that fail validation or JSON parsing are excluded visibly
   * (born-590): see getInvalidManifests()/getInvalidCount().
   */
  loadSkills(): Map<string, SkillDefinition> {
    const pool = new Map<string, SkillDefinition>();
    for (const entry of this._resolveCatalog().entries) {
      if (entry.masked) continue;
      pool.set(entry.id, entry.definition);
    }
    return pool;
  }

  // ─── Effective read model (521-004) ─────────────────────────────────────────

  /**
   * Every id this catalog knows, sorted by id and INCLUDING masked
   * (quarantined/retired) records with their disposition.
   */
  listEffective(): EffectiveSkill[] {
    return this._resolveCatalog().entries;
  }

  /**
   * The effective record for one id — returned even when the id is quarantined
   * or retired (design §4 contract point 1: "unknown id" and "withdrawn id"
   * must be distinguishable, the operator-facing difference between a typo and
   * a security action). `undefined` means the id is genuinely unknown.
   */
  getEffective(id: string): EffectiveSkill | undefined {
    const parsedId = parseSkillId(id);
    if (!parsedId.ok) return undefined;
    return this._resolveCatalog().entries.find((entry) => entry.id === parsedId.id);
  }

  /**
   * Persist ONLY `stats` for a skill to the gitignored stats sidecar
   * (.deckent/stats/catalog-stats.json) — the git-tracked manifest.json is
   * never touched by this call (born-605: sprint-finalizer's per-sprint sync
   * no longer mutates the manifest). Does not affect saveSkill()/
   * updateSkillStats(), whose manifest-write contract is unchanged.
   */
  saveSkillStats(id: string, stats: SkillStats): void {
    writeSkillStatsToSidecar(this.projectRoot, id, stats);
  }

  // NOTE (521-004): the private builtin rescan `_loadBuiltinFallback` is RETIRED.
  // Its layer coverage — the 371-001 gap where a builtin ships only a SKILL.md
  // and was invisible to routing until someone hand-authored a manifest — now
  // lives in resolveSkillCatalog()'s L1 branch, with its two gates preserved
  // verbatim (`.deckent/config.json` must exist; a builtin dir that ships its
  // own manifest.json is left to the normal override path). What changes is
  // only that the builtin layer is now DECLARED (`layer: 'builtin'`) instead of
  // silently synthesised behind a second scan, so the same id is the same entry
  // on a clean checkout and on a long-lived tree (design §5 rule 3).

  // ─── Get / List ─────────────────────────────────────────────────────────────

  /**
   * Get a single skill by id. Returns undefined if not found.
   */
  getSkill(id: string): SkillDefinition | undefined {
    const pool = this.loadSkills();
    return pool.get(id);
  }

  /**
   * List all skills as an array.
   */
  listSkills(): SkillDefinition[] {
    const pool = this.loadSkills();
    return Array.from(pool.values());
  }

  /**
   * List skills filtered by category.
   */
  listByCategory(category: SkillCategory): SkillDefinition[] {
    return this.listSkills().filter((s) => s.category === category);
  }

  /**
   * List only enabled skills.
   */
  listEnabled(): SkillDefinition[] {
    return this.listSkills().filter((s) => s.enabled);
  }

  // ─── Enable / Disable ───────────────────────────────────────────────────────

  /**
   * Enable a skill by id. Returns true if the skill was found and enabled.
   */
  enableSkill(id: string): boolean {
    const skill = this.getSkill(id);
    if (!skill) return false;
    skill.enabled = true;
    this.saveSkill(skill);
    return true;
  }

  /**
   * Disable a skill by id. Returns true if the skill was found and disabled.
   */
  disableSkill(id: string): boolean {
    const skill = this.getSkill(id);
    if (!skill) return false;
    skill.enabled = false;
    this.saveSkill(skill);
    return true;
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  /**
   * Save a skill definition to .deckent/skills/{id}/manifest.json.
   */
  saveSkill(skill: SkillDefinition): void {
    const skillDir = path.join(this.projectRoot, SKILLS_DIR, skill.id);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, MANIFEST_FILENAME),
      JSON.stringify(skill, null, 2) + '\n',
      'utf8',
    );
  }

  /**
   * Persist a generated skill's manifest and exact rendered entrypoint together.
   *
   * Generated content is intentionally not part of SkillDefinition's persisted
   * manifest contract. Keeping it in SKILL.md makes later worker prompt
   * resolution independent of the in-memory PLAN catalog that created it.
   */
  saveGeneratedSkill(skill: SkillDefinition, content: string): void {
    const skillDir = path.join(this.projectRoot, SKILLS_DIR, skill.id);
    const { _generatedContent: _ignored, ...manifest } = skill as SkillDefinition & {
      _generatedContent?: string;
    };
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, MANIFEST_FILENAME),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8',
    );
    fs.writeFileSync(path.join(skillDir, SKILL_MD_FILENAME), content, 'utf8');
  }

  // ─── Remove ─────────────────────────────────────────────────────────────────

  /**
   * Remove a skill by id. Returns true if removed, false if not found.
   */
  removeSkill(id: string): boolean {
    const skillDir = path.join(this.projectRoot, SKILLS_DIR, id);
    if (!fs.existsSync(skillDir)) return false;
    fs.rmSync(skillDir, { recursive: true, force: true });
    return true;
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  /**
   * Update stats for a skill after task evaluation.
   * `coverage: null` means no coverage was measured for this task (a MEASUREMENT
   * GAP, not a 0%) — totalUses/successRate still advance, but avgCoverage is left
   * untouched so the gap can never dilute it toward 0 (born-591 P0 dilution fix,
   * mirrors AgentPoolManager.updateAgentStats).
   */
  updateSkillStats(
    id: string,
    evaluation: string,
    coverage: number | null,
    sprintId: string,
  ): void {
    const skill = this.getSkill(id);
    if (!skill) return;

    const stats = skill.stats ?? createDefaultSkillStats();
    const prevTotal = stats.totalUses;
    stats.totalUses += 1;

    // Recalculate success rate (DONE and GO_WITH_TECH_DEBT count as success)
    const wasSuccess = evaluation === 'DONE' || evaluation === 'GO_WITH_TECH_DEBT';
    // Use explicit successCount if available, else derive from legacy successRate
    const prevSuccessCount = stats.successCount ?? Math.round(stats.successRate * prevTotal);
    const newSuccessCount = prevSuccessCount + (wasSuccess ? 1 : 0);
    stats.successCount = newSuccessCount;
    stats.successRate = stats.totalUses > 0 ? newSuccessCount / stats.totalUses : 0;

    // Recalculate average coverage — skip entirely when this task had no real
    // coverage measurement (null), so it never enters the running average.
    if (coverage !== null) {
      const prevTotalCoverage = stats.avgCoverage * prevTotal;
      stats.avgCoverage = stats.totalUses > 0 ? (prevTotalCoverage + coverage) / stats.totalUses : 0;
    }

    stats.lastUsedInSprint = sprintId;
    skill.stats = stats;

    this.saveSkill(skill);
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate an unknown value as a SkillDefinition.
   * Returns { valid: boolean, errors: string[] }.
   */
  static validateSkillDefinition(skill: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
      return { valid: false, errors: ['Skill definition must be a non-null object'] };
    }

    const obj = skill as Record<string, unknown>;

    // Required string fields
    for (const field of ['id', 'name'] as const) {
      if (typeof obj[field] !== 'string' || !(obj[field] as string).trim()) {
        errors.push(`"${field}" must be a non-empty string`);
      }
    }

    // Optional string fields that must be strings if present
    for (const field of ['version', 'description', 'entrypoint'] as const) {
      if (obj[field] !== undefined && typeof obj[field] !== 'string') {
        errors.push(`"${field}" must be a string`);
      }
    }

    // category validation
    if (obj['category'] !== undefined) {
      if (!(VALID_CATEGORIES as readonly string[]).includes(obj['category'] as string)) {
        errors.push(`"category" must be one of: ${VALID_CATEGORIES.join(', ')}`);
      }
    }

    // model validation
    if (obj['model'] !== undefined) {
      try {
        if (typeof obj['model'] !== 'string') throw new Error('invalid model type');
        resolveCanonicalModelIdentity(obj['model'], { registerParametric: false });
      } catch {
        errors.push(`"model" must be a canonical registered model ID: ${modelRegistry.getAllModelIds().join(', ')}`);
      }
    }

    // priority validation
    if (obj['priority'] !== undefined) {
      if (typeof obj['priority'] !== 'number') {
        errors.push('"priority" must be a number');
      }
    }

    // Boolean fields
    if (obj['enabled'] !== undefined && typeof obj['enabled'] !== 'boolean') {
      errors.push('"enabled" must be a boolean');
    }

    // Array fields
    for (const field of ['triggers', 'composableWith'] as const) {
      if (obj[field] !== undefined) {
        if (!Array.isArray(obj[field])) {
          errors.push(`"${field}" must be an array`);
        } else {
          for (const item of obj[field] as unknown[]) {
            if (typeof item !== 'string') {
              errors.push(`"${field}" must be an array of strings`);
              break;
            }
          }
        }
      }
    }

    // stackDetection validation
    if (obj['stackDetection'] !== undefined) {
      if (!obj['stackDetection'] || typeof obj['stackDetection'] !== 'object' || Array.isArray(obj['stackDetection'])) {
        errors.push('"stackDetection" must be an object');
      } else {
        const sd = obj['stackDetection'] as Record<string, unknown>;
        for (const field of ['files', 'dependencies', 'commands'] as const) {
          if (sd[field] !== undefined && !Array.isArray(sd[field])) {
            errors.push(`"stackDetection.${field}" must be an array`);
          }
        }
      }
    }

    // promptInjection validation
    if (obj['promptInjection'] !== undefined) {
      if (!obj['promptInjection'] || typeof obj['promptInjection'] !== 'object' || Array.isArray(obj['promptInjection'])) {
        errors.push('"promptInjection" must be an object');
      } else {
        const pi = obj['promptInjection'] as Record<string, unknown>;
        if (pi['position'] !== undefined) {
          if (!(VALID_POSITIONS as readonly string[]).includes(pi['position'] as string)) {
            errors.push(`"promptInjection.position" must be one of: ${VALID_POSITIONS.join(', ')}`);
          }
        }
        if (pi['maxTokens'] !== undefined && typeof pi['maxTokens'] !== 'number') {
          errors.push('"promptInjection.maxTokens" must be a number');
        }
      }
    }

    // Stats validation
    if (obj['stats'] !== undefined) {
      if (!obj['stats'] || typeof obj['stats'] !== 'object' || Array.isArray(obj['stats'])) {
        errors.push('"stats" must be an object');
      } else {
        const stats = obj['stats'] as Record<string, unknown>;
        if (stats['totalUses'] !== undefined && typeof stats['totalUses'] !== 'number') {
          errors.push('"stats.totalUses" must be a number');
        }
        if (stats['successRate'] !== undefined && typeof stats['successRate'] !== 'number') {
          errors.push('"stats.successRate" must be a number');
        }
        if (stats['avgCoverage'] !== undefined && typeof stats['avgCoverage'] !== 'number') {
          errors.push('"stats.avgCoverage" must be a number');
        }
        if (stats['lastUsedInSprint'] !== undefined && typeof stats['lastUsedInSprint'] !== 'string') {
          errors.push('"stats.lastUsedInSprint" must be a string');
        }
      }
    }

    // activation validation (born-590 — the sole real scoring input; previously unchecked)
    validateActivationField(obj['activation'], errors);

    return { valid: errors.length === 0, errors };
  }
}
