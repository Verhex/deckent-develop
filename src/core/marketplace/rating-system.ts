// ─── Rating System ───────────────────────────────────────────────────────────
// Local and remote skill rating system for the marketplace.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillRatingData {
  skillId: string;
  successRate: number;    // 0.0-1.0
  avgCoverage: number;    // 0-100
  frequency: number;      // number of uses
  rating: number;         // calculated 0-5 scale
  updatedAt: string;
}

export interface RatingSubmission {
  skillId: string;
  rating: number;         // 1-5
  comment?: string;
  submittedAt: string;
}

export interface RatingsFile {
  ratings: SkillRatingData[];
  submissions: RatingSubmission[];
  updatedAt: string;
}

// ─── Filesystem abstraction for testing ──────────────────────────────────────

export interface RatingSystemFS {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  mkdirSync: typeof mkdirSync;
}

const defaultFS: RatingSystemFS = {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
};

// ─── Constants ───────────────────────────────────────────────────────────────

const RATINGS_FILENAME = 'ratings.json';
const SUCCESS_WEIGHT = 0.6;
const COVERAGE_WEIGHT = 0.3;
const FREQUENCY_WEIGHT = 0.1;
const MAX_RATING = 5;
const MIN_RATING = 0;
const MAX_FREQUENCY_CAP = 100;

// ─── RatingSystem ────────────────────────────────────────────────────────────

export class RatingSystem {
  private readonly dataDir: string;
  private readonly fs: RatingSystemFS;

  constructor(dataDir: string, options?: { fs?: RatingSystemFS }) {
    this.dataDir = dataDir;
    this.fs = options?.fs ?? defaultFS;
  }

  /**
   * Calculate a local rating for a skill based on success rate, coverage, and frequency.
   * Formula: (successRate * 0.6 + avgCoverage/100 * 0.3 + min(frequency,100)/100 * 0.1) * 5
   * Scale: 0-5.
   */
  calculateLocalRating(
    skillId: string,
    stats: { successRate: number; avgCoverage: number; frequency: number },
  ): number {
    const successComponent = Math.max(0, Math.min(1, stats.successRate)) * SUCCESS_WEIGHT;
    const coverageComponent = Math.max(0, Math.min(100, stats.avgCoverage)) / 100 * COVERAGE_WEIGHT;
    const frequencyComponent = Math.min(stats.frequency, MAX_FREQUENCY_CAP) / MAX_FREQUENCY_CAP * FREQUENCY_WEIGHT;

    const raw = (successComponent + coverageComponent + frequencyComponent) * MAX_RATING;
    const rating = Math.round(raw * 100) / 100; // 2 decimal places

    // Save to local data
    this._saveRating(skillId, stats, rating);

    return Math.max(MIN_RATING, Math.min(MAX_RATING, rating));
  }

  /**
   * Submit a user rating (1-5) for a skill.
   */
  submitRating(skillId: string, rating: number, comment?: string): RatingSubmission {
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error('Rating must be an integer between 1 and 5');
    }

    const submission: RatingSubmission = {
      skillId,
      rating,
      comment,
      submittedAt: new Date().toISOString(),
    };

    const data = this._readData();
    data.submissions.push(submission);
    data.updatedAt = new Date().toISOString();
    this._writeData(data);

    return submission;
  }

  /**
   * Get all ratings data (local calculated + user submissions).
   */
  getRatings(): RatingsFile {
    return this._readData();
  }

  /**
   * Get rating for a specific skill. Returns null if not found.
   */
  getSkillRating(skillId: string): SkillRatingData | null {
    const data = this._readData();
    return data.ratings.find((r) => r.skillId === skillId) ?? null;
  }

  /**
   * Get user submissions for a specific skill.
   */
  getSkillSubmissions(skillId: string): RatingSubmission[] {
    const data = this._readData();
    return data.submissions.filter((s) => s.skillId === skillId);
  }

  /**
   * Format a rating as a human-readable string (e.g. "3.5/5").
   */
  formatRating(rating: number): string {
    const clamped = Math.max(MIN_RATING, Math.min(MAX_RATING, rating));
    const rounded = Math.round(clamped * 10) / 10;
    return `${rounded}/${MAX_RATING}`;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _dataFilePath(): string {
    return join(this.dataDir, RATINGS_FILENAME);
  }

  private _readData(): RatingsFile {
    const filePath = this._dataFilePath();
    try {
      if (this.fs.existsSync(filePath)) {
        const raw = this.fs.readFileSync(filePath, 'utf-8') as string;
        const parsed = JSON.parse(raw) as RatingsFile;
        if (parsed && Array.isArray(parsed.ratings) && Array.isArray(parsed.submissions)) {
          return parsed;
        }
      }
    } catch {
      // Fall through to default
    }
    return { ratings: [], submissions: [], updatedAt: new Date().toISOString() };
  }

  private _writeData(data: RatingsFile): void {
    const filePath = this._dataFilePath();
    if (!this.fs.existsSync(this.dataDir)) {
      this.fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  private _saveRating(
    skillId: string,
    stats: { successRate: number; avgCoverage: number; frequency: number },
    rating: number,
  ): void {
    const data = this._readData();
    const existing = data.ratings.findIndex((r) => r.skillId === skillId);
    const entry: SkillRatingData = {
      skillId,
      successRate: stats.successRate,
      avgCoverage: stats.avgCoverage,
      frequency: stats.frequency,
      rating,
      updatedAt: new Date().toISOString(),
    };

    if (existing >= 0) {
      data.ratings[existing] = entry;
    } else {
      data.ratings.push(entry);
    }
    data.updatedAt = new Date().toISOString();
    this._writeData(data);
  }
}
