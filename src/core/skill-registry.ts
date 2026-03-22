// ─── Skill Registry ─────────────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillDefinition } from './skill-types.js';
import { readJsonSafe } from './utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const REGISTRY_FILENAME = 'skill-registry.json';

// ─── SkillRegistry ─────────────────────────────────────────────────────────

interface RegistryData {
  skills: SkillDefinition[];
  updatedAt: string;
}

/**
 * Central skill registry backed by a JSON file.
 * Provides register, search, getPopular, getAll, and remove operations.
 */
export class SkillRegistry {
  constructor(private registryPath: string) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  /**
   * Register a new skill. If a skill with the same id exists, it is replaced.
   */
  register(skill: SkillDefinition): void {
    const data = this._readData();
    const existingIdx = data.skills.findIndex((s) => s.id === skill.id);
    if (existingIdx >= 0) {
      data.skills[existingIdx] = skill;
    } else {
      data.skills.push(skill);
    }
    this._writeData(data);
  }

  // ─── Search ───────────────────────────────────────────────────────────────

  /**
   * Search skills by query string.
   * Matches against id, name, description, triggers, and category.
   */
  search(query: string): SkillDefinition[] {
    if (!query || !query.trim()) return [];
    const data = this._readData();
    const q = query.toLowerCase().trim();
    const terms = q.split(/\s+/);

    return data.skills.filter((skill) => {
      const searchText = [
        skill.id,
        skill.name,
        skill.description,
        skill.category,
        ...skill.triggers,
      ].join(' ').toLowerCase();

      return terms.every((term) => searchText.includes(term));
    });
  }

  // ─── Get Popular ──────────────────────────────────────────────────────────

  /**
   * Get the most popular skills by totalUses, limited to `limit`.
   */
  getPopular(limit: number): SkillDefinition[] {
    const data = this._readData();
    const sorted = [...data.skills].sort(
      (a, b) => (b.stats?.totalUses ?? 0) - (a.stats?.totalUses ?? 0),
    );
    return sorted.slice(0, Math.max(0, limit));
  }

  // ─── Get All ──────────────────────────────────────────────────────────────

  /**
   * Get all registered skills.
   */
  getAll(): SkillDefinition[] {
    const data = this._readData();
    return [...data.skills];
  }

  // ─── Remove ───────────────────────────────────────────────────────────────

  /**
   * Remove a skill by id. Returns true if removed, false if not found.
   */
  remove(id: string): boolean {
    const data = this._readData();
    const before = data.skills.length;
    data.skills = data.skills.filter((s) => s.id !== id);
    if (data.skills.length === before) return false;
    this._writeData(data);
    return true;
  }

  // ─── Count ────────────────────────────────────────────────────────────────

  /**
   * Get the number of registered skills.
   */
  count(): number {
    return this._readData().skills.length;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private _getFilePath(): string {
    return path.resolve(this.registryPath, REGISTRY_FILENAME);
  }

  private _readData(): RegistryData {
    const filePath = this._getFilePath();
    const parsed = readJsonSafe<RegistryData>(filePath);
    if (parsed && Array.isArray(parsed.skills)) {
      return parsed;
    }
    return { skills: [], updatedAt: new Date().toISOString() };
  }

  private _writeData(data: RegistryData): void {
    const filePath = this._getFilePath();
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}
