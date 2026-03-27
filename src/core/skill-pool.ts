// ─── Skill Pool Manager ─────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillDefinition, SkillCategory } from './skill-types.js';
import { createDefaultSkillStats } from './skill-types.js';
import { readJsonSafe } from './utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const SKILLS_DIR = '.deckent/skills';
const MANIFEST_FILENAME = 'manifest.json';

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

    if (!fs.existsSync(skillsDir)) return pool;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch {
      return pool;
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

    return pool;
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
