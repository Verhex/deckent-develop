export type DocStatus = 'active' | 'draft' | 'temp' | 'frozen' | 'superseded';
export type DocState = 'FRESH' | 'DRIFT' | 'STALE' | 'CRITICAL_STALE' | 'EXEMPT';

export interface DocFrontmatter {
  doc_rank?: number;
  status?: DocStatus;
  last_updated?: string;
  content_hash?: string;
  tracks?: string[];
  [key: string]: unknown;
}

export interface DocSignals {
  content_drift: boolean;
  code_drift: boolean | null; // null = not evaluated (no `tracks`)
  age_days: number;
}

export interface DocRecord {
  path: string;            // repo-relative POSIX
  content_hash: string | null;
  last_updated: string;    // ISO8601
  doc_rank: number;
  status: DocStatus;
  stale_score: number;     // 0..100 (rank-independent severity)
  priority_score: number;  // 0..100 (rank-weighted urgency)
  state: DocState;
  signals: DocSignals;
  tracked_code: string[] | null;
  first_seen: string;      // ISO8601
  last_scanned: string;    // ISO8601
}

export interface DocTrackingScoringConfig {
  weights: { content: number; code: number; ageMax: number };
  criticalAt: number;
  staleAt: number;
  maxRank: number;
}

export interface DocTrackingConfig {
  rankMap: Record<string, number>;
  defaultRank: number;
  trackIgnore: string[];
  noFrontmatter: string[];
  scoring: DocTrackingScoringConfig;
  sizeCapBytes: number;
}

export const DEFAULT_DOC_TRACKING_CONFIG: DocTrackingConfig = {
  rankMap: {
    'CLAUDE.md': 0, 'DECKENT.md': 0, 'AGENTS.md': 0,
    'docs/DOC-POLICY.md': 0, 'docs/MASTER-PLAN.md': 0,
    'docs/architecture/**': 5,
    'docs/adr/**': 1,
    'docs/reference/**': 10,
    'docs/guide/**': 20, 'docs/development/**': 20,
    'docs/analysis/**': 90,
    'docs/customer/**': 95, 'docs/launch/**': 95,
  },
  defaultRank: 50,
  trackIgnore: [
    'node_modules/**', 'dist/**', '.git/**', '**/worktrees/**',
    '.brain/exports/**', '.brain/archive/**', '**/archive/**',
    'scratch/**', 'coverage/**', '**/*.template.md',
  ],
  noFrontmatter: ['CLAUDE.md', 'DECKENT.md', 'AGENTS.md', 'GEMINI.md'],
  scoring: {
    weights: { content: 50, code: 30, ageMax: 20 },
    criticalAt: 80,
    staleAt: 50,
    maxRank: 100,
  },
  sizeCapBytes: 2 * 1024 * 1024,
};
