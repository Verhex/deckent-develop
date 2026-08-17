import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CATALOG_STATS_PATH = join('.deckent', 'stats', 'catalog-stats.json');

export interface CatalogEntityStats {
  uses: number;
  successes: number;
  successRatio: number | null;
  successPercent: number | null;
  lastUsedInSprint: string | null;
}

export interface CatalogStatsReadModel {
  source: 'sidecar' | 'absent';
  agents: Record<string, CatalogEntityStats>;
  skills: Record<string, CatalogEntityStats>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readNonNegativeNumber(
  value: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      return candidate;
    }
  }
  return null;
}

function projectEntity(value: unknown): CatalogEntityStats | null {
  if (!isRecord(value)) return null;

  const usesValue = readNonNegativeNumber(value, 'totalUses', 'uses');
  if (usesValue === null) return null;
  const uses = Math.floor(usesValue);

  const explicitSuccesses = readNonNegativeNumber(value, 'successCount', 'successes');
  const storedRatio = readNonNegativeNumber(value, 'successRate', 'successRatio');
  const successes = Math.min(
    uses,
    explicitSuccesses === null
      ? Math.round((storedRatio ?? 0) * uses)
      : Math.floor(explicitSuccesses),
  );
  const successRatio = uses === 0
    ? null
    : Math.max(0, Math.min(1, explicitSuccesses === null && storedRatio !== null
      ? storedRatio
      : successes / uses));
  const lastUsed = value['lastUsedInSprint'];

  return {
    uses,
    successes,
    successRatio,
    successPercent: successRatio === null ? null : Math.round(successRatio * 100),
    lastUsedInSprint: typeof lastUsed === 'string' && lastUsed.length > 0 ? lastUsed : null,
  };
}

function projectEntities(value: Record<string, unknown>): Record<string, CatalogEntityStats> {
  const projected: Record<string, CatalogEntityStats> = {};
  for (const [id, stats] of Object.entries(value)) {
    const entity = projectEntity(stats);
    if (entity) projected[id] = entity;
  }
  return projected;
}

function absentCatalogStats(): CatalogStatsReadModel {
  return { source: 'absent', agents: {}, skills: {} };
}

/**
 * Read the catalog-stats sidecar without mutating or trusting it. Missing, torn,
 * unreadable, or structurally malformed bytes are an honest absent projection.
 */
export function readCatalogStats(projectRoot: string): CatalogStatsReadModel {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(projectRoot, CATALOG_STATS_PATH), 'utf8'));
    if (!isRecord(parsed) || !isRecord(parsed['agents']) || !isRecord(parsed['skills'])) {
      return absentCatalogStats();
    }
    return {
      source: 'sidecar',
      agents: projectEntities(parsed['agents']),
      skills: projectEntities(parsed['skills']),
    };
  } catch {
    return absentCatalogStats();
  }
}
