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

// ─── Skill Pool Manager ────────────────────────────────────────────────────

export class SkillPoolManager {
  constructor(private projectRoot: string) {}

  /** Manifests skipped during the most recent loadSkills() call (born-590 — see getInvalidManifests). */
  private invalidManifests: InvalidManifestEntry[] = [];

  /**
   * Record a manifest that failed load-time validation or JSON parsing, and
   * emit a visible signal via the existing debugLog primitive (stderr when
   * DECKENT_DEBUG is set, always persisted to .brain/ERRORS.md) — replacing
   * the previous fully-silent skip (born-590).
   */
  private _recordInvalidManifest(id: string, manifestPath: string, errors: string[]): void {
    this.invalidManifests.push({ id, path: manifestPath, errors });
    debugLog('skill-pool:invalid-manifest', `${id} (${manifestPath}): ${errors.join('; ')}`);
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
   * Load all skills from .deckent/skills/ directory.
   * Returns a Map<string, SkillDefinition>.
   * Skips directories with invalid manifest.json files — visibly (born-590):
   * see getInvalidManifests()/getInvalidCount() for what was skipped and why.
   */
  loadSkills(): Map<string, SkillDefinition> {
    const pool = new Map<string, SkillDefinition>();
    this.invalidManifests = [];
    const skillsDir = path.join(this.projectRoot, SKILLS_DIR);
    // Read once — overlaid onto every skill as it's constructed (unified read,
    // born-605): sidecar value wins when present, else the manifest-loaded
    // `stats` is left as-is.
    const statsLedger = readStatsSidecarLedger(this.projectRoot);

    if (fs.existsSync(skillsDir)) {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      } catch {
        entries = [];
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(skillsDir, entry.name, MANIFEST_FILENAME);
        if (!fs.existsSync(manifestPath)) continue;
        const raw = readJsonSafe<Record<string, unknown>>(manifestPath);
        if (raw) {
          const validation = SkillPoolManager.validateSkillDefinition(raw);
          if (validation.valid) {
            normalizeSkillManifest(raw);
            const skill = raw as unknown as SkillDefinition;
            this._overlayStats(skill, statsLedger);
            pool.set(skill.id, skill);
          } else {
            this._recordInvalidManifest(entry.name, manifestPath, validation.errors);
          }
        } else {
          this._recordInvalidManifest(entry.name, manifestPath, ['manifest.json exists but is unreadable or contains invalid JSON']);
        }
      }
    }

    this._loadBuiltinFallback(pool, statsLedger);

    return pool;
  }

  /**
   * Overlay sidecar stats onto `skill` when present for its id — sidecar wins,
   * else the manifest-loaded `stats` value is left as-is (unified read, born-605).
   */
  private _overlayStats(skill: SkillDefinition, statsLedger: StatsSidecarLedger): void {
    const sidecarStats = statsLedger.skills[skill.id];
    if (sidecarStats && typeof sidecarStats === 'object') {
      skill.stats = sidecarStats;
    }
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

  /**
   * Fallback layer (371-001): make builtin skills pool-visible even when
   * .deckent/skills/<id>/manifest.json has never been materialized. D-004
   * precedence — any id already present (a .deckent override) is left
   * untouched; only ids absent from `pool` are considered here.
   *
   * Gated on .deckent/config.json existing — i.e. this projectRoot has
   * actually been through `deckent init`, not merely a directory that
   * happens to contain a `.deckent/skills/<id>/` subdirectory (e.g. a
   * narrow test fixture). Without this gate, any project/fixture lacking
   * .deckent/skills entirely would inherit this INSTALLATION's full builtin
   * catalog, since resolveBuiltinSkillsDir() intentionally resolves relative
   * to the running module's own location (not `this.projectRoot`) — that
   * part is required for real npm-installed usage, where builtins live
   * under node_modules/deckent/, never under the user's own project root.
   */
  private _loadBuiltinFallback(pool: Map<string, SkillDefinition>, statsLedger: StatsSidecarLedger): void {
    if (!fs.existsSync(path.join(this.projectRoot, CONFIG_FILENAME))) return;

    const builtinDir = resolveBuiltinSkillsDir();
    if (!fs.existsSync(builtinDir)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(builtinDir, { withFileTypes: true });
    } catch {
      return;
    }
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (pool.has(entry.name)) continue;

      const entryDir = path.join(builtinDir, entry.name);
      let files: fs.Dirent[];
      try {
        files = fs.readdirSync(entryDir, { withFileTypes: true });
      } catch {
        continue;
      }
      if (!Array.isArray(files)) continue;

      // Only the "SKILL.md with no manifest anywhere" gap is this task's actual
      // scope (368-001's 3 new skills). A builtin that already ships its OWN
      // manifest.json is deliberately NOT read here — trusting arbitrary builtin
      // manifest content as complete is unnecessary generality this task's
      // goCriteria never requires, and at least one shipped manifest
      // (secure-coding) omits the required `stackDetection` field, which crashes
      // routing-engine.ts's stack-bonus scoring when read verbatim. If `id`
      // already has a manifest.json in the builtin tree, it belongs in
      // .deckent/skills/<id>/ via the normal override path, not this fallback.
      if (files.some((f) => f.name === MANIFEST_FILENAME)) continue;
      if (!files.some((f) => f.name === SKILL_MD_FILENAME)) continue;

      const raw = synthesizeSkillManifest(entry.name, path.join(entryDir, SKILL_MD_FILENAME));
      if (!raw) continue;
      const validation = SkillPoolManager.validateSkillDefinition(raw);
      if (!validation.valid) {
        this._recordInvalidManifest(entry.name, path.join(entryDir, SKILL_MD_FILENAME), validation.errors);
        continue;
      }
      normalizeSkillManifest(raw);
      const skill = raw as unknown as SkillDefinition;
      this._overlayStats(skill, statsLedger);
      pool.set(skill.id, skill);
    }
  }

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
