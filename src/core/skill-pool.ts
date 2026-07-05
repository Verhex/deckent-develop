// ─── Skill Pool Manager ─────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillDefinition, SkillCategory } from './skill-types.js';
import { createDefaultSkillStats } from './skill-types.js';
import { createDefaultActivationConfig } from './routing-types.js';
import { readJsonSafe } from './utils.js';

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
import { ALL_MODELS } from './types.js';
const VALID_MODELS = ALL_MODELS;

// ─── Skill Pool Manager ────────────────────────────────────────────────────

export class SkillPoolManager {
  constructor(private projectRoot: string) {}

  // ─── Load ───────────────────────────────────────────────────────────────────

  /**
   * Load all skills from .deckent/skills/ directory.
   * Returns a Map<string, SkillDefinition>.
   * Skips directories with invalid manifest.json files silently.
   */
  loadSkills(): Map<string, SkillDefinition> {
    const pool = new Map<string, SkillDefinition>();
    const skillsDir = path.join(this.projectRoot, SKILLS_DIR);

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
            const skill = raw as unknown as SkillDefinition;
            pool.set(skill.id, skill);
          }
        }
      }
    }

    this._loadBuiltinFallback(pool);

    return pool;
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
  private _loadBuiltinFallback(pool: Map<string, SkillDefinition>): void {
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
      if (!validation.valid) continue;
      const skill = raw as unknown as SkillDefinition;
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
   */
  updateSkillStats(
    id: string,
    evaluation: string,
    coverage: number,
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

    // Recalculate average coverage
    const prevTotalCoverage = stats.avgCoverage * prevTotal;
    stats.avgCoverage = stats.totalUses > 0 ? (prevTotalCoverage + coverage) / stats.totalUses : 0;

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
      if (!(VALID_MODELS as readonly string[]).includes(obj['model'] as typeof VALID_MODELS[number])) {
        errors.push(`"model" must be one of: ${VALID_MODELS.join(', ')}`);
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

    return { valid: errors.length === 0, errors };
  }
}
