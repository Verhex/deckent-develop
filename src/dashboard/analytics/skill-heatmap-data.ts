// ─── Types ───────────────────────────────────────────────────────────────────

export interface LearningEntry {
  skills: string[];
  success: boolean;
}

export interface SkillPair {
  skillA: string;
  skillB: string;
  count: number;
  successCount: number;
}

export interface HeatmapCell {
  row: string;
  col: string;
  count: number;
  intensity: number;
}

// ─── SkillHeatmapData ────────────────────────────────────────────────────────

export class SkillHeatmapData {
  buildCoUsageMatrix(entries: LearningEntry[]): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();

    for (const entry of entries) {
      const skills = [...new Set(entry.skills)].sort();

      for (let i = 0; i < skills.length; i++) {
        for (let j = i; j < skills.length; j++) {
          const a = skills[i]!;
          const b = skills[j]!;

          if (!matrix.has(a)) matrix.set(a, new Map());
          const row = matrix.get(a)!;
          const current = row.get(b) ?? 0;
          row.set(b, current + 1);

          // Mirror for non-diagonal
          if (a !== b) {
            if (!matrix.has(b)) matrix.set(b, new Map());
            const mirrorRow = matrix.get(b)!;
            const mirrorCurrent = mirrorRow.get(a) ?? 0;
            mirrorRow.set(a, mirrorCurrent + 1);
          }
        }
      }
    }

    return matrix;
  }

  getMostCommonPair(entries: LearningEntry[]): SkillPair | null {
    const pairs = this.getAllPairs(entries);
    if (pairs.length === 0) return null;

    let best = pairs[0]!;
    for (const pair of pairs) {
      if (pair.count > best.count) {
        best = pair;
      }
    }
    return best;
  }

  getSuccessfulPairs(entries: LearningEntry[], threshold: number): SkillPair[] {
    const pairs = this.getAllPairs(entries);
    return pairs.filter((p) => {
      const rate = p.count > 0 ? p.successCount / p.count : 0;
      return rate >= threshold;
    });
  }

  formatCell(count: number, maxCount: number): number {
    if (maxCount <= 0) return 0;
    if (count <= 0) return 0;
    return Math.round((count / maxCount) * 100) / 100;
  }

  buildHeatmapCells(matrix: Map<string, Map<string, number>>): HeatmapCell[] {
    let maxCount = 0;
    for (const [, row] of matrix) {
      for (const [, count] of row) {
        if (count > maxCount) maxCount = count;
      }
    }

    const cells: HeatmapCell[] = [];
    for (const [rowKey, row] of matrix) {
      for (const [colKey, count] of row) {
        cells.push({
          row: rowKey,
          col: colKey,
          count,
          intensity: this.formatCell(count, maxCount),
        });
      }
    }
    return cells;
  }

  getUniqueSkills(entries: LearningEntry[]): string[] {
    const skills = new Set<string>();
    for (const entry of entries) {
      for (const skill of entry.skills) {
        skills.add(skill);
      }
    }
    return [...skills].sort();
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private getAllPairs(entries: LearningEntry[]): SkillPair[] {
    const pairMap = new Map<string, { count: number; successCount: number }>();

    for (const entry of entries) {
      const skills = [...new Set(entry.skills)].sort();

      for (let i = 0; i < skills.length; i++) {
        for (let j = i + 1; j < skills.length; j++) {
          const key = `${skills[i]}|${skills[j]}`;
          const existing = pairMap.get(key) ?? { count: 0, successCount: 0 };
          existing.count += 1;
          if (entry.success) existing.successCount += 1;
          pairMap.set(key, existing);
        }
      }
    }

    const pairs: SkillPair[] = [];
    for (const [key, data] of pairMap) {
      const [a, b] = key.split('|') as [string, string];
      pairs.push({
        skillA: a,
        skillB: b,
        count: data.count,
        successCount: data.successCount,
      });
    }

    return pairs;
  }
}
