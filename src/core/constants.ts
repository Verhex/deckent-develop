import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Path Constants ──────────────────────────────────────────────────
export const DECKENT_DIR = '.deckent' as const;
export const PROJECT_CONFIG_PATH = join(DECKENT_DIR, 'config.json');
export const GLOBAL_DECKENT_DIR = join(homedir(), '.deckent');
export const GLOBAL_CONFIG_PATH = join(GLOBAL_DECKENT_DIR, 'config.json');
export const GLOBAL_CREDENTIALS_DIR = join(GLOBAL_DECKENT_DIR, 'credentials');

export const BRAIN_DIR = '.brain' as const;
export const TASKS_DIR = '.tasks' as const;
export const LOCKS_DIR = '.locks' as const;
export const CONTRACTS_DIR = '.contracts' as const;
export const CLAUDE_RULES_DIR = join('.claude', 'rules');
export const WORKSPACE_DIR = join(DECKENT_DIR, 'workspace');
export const PLUGINS_DIR = join(DECKENT_DIR, 'plugins');
export const I18N_DIR = join(DECKENT_DIR, 'i18n');
export const JOBS_DIR = join(DECKENT_DIR, 'jobs');
export const DECISIONS_LOG_DIR = join(DECKENT_DIR, 'decisions');
export const DOCS_CONFIG_FILE = join(DECKENT_DIR, 'docs.json');
export const DASHBOARD_FILE = '.dashboard' as const;

// ─── Memory Files (relative to BRAIN_DIR) ────────────────────────────
export const ERRORS_FILE = 'ERRORS.md' as const;
export const ERRORS_MAX_LINES = 600 as const; // Sprint 140 pre-flight: 200→600 (3x)
export const MEMORY_FILE = 'MEMORY.md' as const;
export const DECISIONS_FILE = 'DECISIONS.md' as const;
export const DECISIONS_MAX_LINES = 1200 as const; // Sprint 140 pre-flight: explicit cap (ADR governance, 37+ ADR canlı)
export const DEBT_FILE = 'DEBT.md' as const;
export const PATTERNS_FILE = 'PATTERNS.md' as const;
export const RETRO_FILE = 'RETRO.md' as const;
export const PROJECT_IDENTITY_FILE = 'PROJECT-IDENTITY.md' as const;
export const SPRINTS_DIR = 'sprints' as const;
export const ARCHIVE_DIR = 'archive' as const;

// ─── Agent Files ─────────────────────────────────────────────────────
export const AGENTS_FILE = 'AGENTS.md' as const;
export const CLAUDE_FILE = 'CLAUDE.md' as const;
export const DIRECTIVES_FILE = 'DIRECTIVES.md' as const;
export const DECKENT_FILE = 'DECKENT.md' as const;

// ─── Memory Limits ───────────────────────────────────────────────────
// Sprint 140 pre-flight: Self-Analysis Ayna Sprint için 5000 satır toplam budget
// hedefi (Sprint 139 öncesi 900 satır toplam). Her kategori 3-5x büyütüldü.
// Motivasyon: 400-1000 task read-only analysis sprint'inde worker raporları
// .deckent/sprint-140-analysis/ altına yazılacak ama brain özet + cross-ref
// .brain/ altına aktarılacak, 900 satır budget 5.5x yetersiz.
export const MEMORY_MAX_LINES = 1500 as const;       // 300→1500 (5x)
export const PATTERNS_MAX_LINES = 800 as const;      // 150→800 (5.3x)
export const RETRO_MAX_LINES = 400 as const;         // 120→400 (3.3x)
export const SPRINT_LOG_MAX_LINES = 500 as const;    // 100→500 (5x)

// ─── Task File Extensions ────────────────────────────────────────────
export const TASK_FILE_EXTENSIONS = ['.json', '.plan', '.hb', '.result', '.paused', '.log'] as const;

// ─── tmux ────────────────────────────────────────────────────────────
export const TMUX_SESSION_NAME = 'deckent' as const;
export const TMUX_BRAIN_WINDOW = 'brain' as const;
export const TMUX_AUDITOR_WINDOW = 'auditor' as const;
export const TMUX_DASHBOARD_WINDOW = 'dashboard' as const;
export const TMUX_WORKER_PREFIX = 'w-' as const;

// ─── Tech Debt Escalation ────────────────────────────────────────────
export const DEBT_HIGH_PRIORITY_SPRINTS = 2 as const;
export const DEBT_CRITICAL_SPRINTS = 3 as const;
export const DEBT_TABLE_HEADER = '| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |' as const;

// ─── Defaults ────────────────────────────────────────────────────────
export const DEFAULT_LANGUAGE = 'en' as const;
export const DEFAULT_MODE = 'performance' as const;
export const DECKENT_VERSION: string = (() => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
export const SUPPORTED_LANGUAGES = ['en', 'tr'] as const;

// ─── Brain AI Planner ───────────────────────────────────────────────
export const BRAIN_PLAN_TIMEOUT_MS = 60_000 as const;
export const BRAIN_PLAN_MAX_CONTEXT_LINES = 200 as const;

// ─── Timing (deprecated — prefer config: scan_interval, heartbeat_timeout) ──
/** @deprecated Use config.scan_interval instead. Kept for backward compat & tests. */
export const AUDITOR_SCAN_INTERVAL_MS = 30_000 as const;
/** @deprecated Use config.heartbeat_timeout instead. Kept for backward compat & tests. */
export const HEARTBEAT_STALE_THRESHOLD_MS = 120_000 as const;
/** @deprecated Use config.lock_stale_threshold instead. Kept for backward compat & tests. */
export const LOCK_STALE_THRESHOLD_MS = 300_000 as const;
export const HEARTBEAT_WRITE_INTERVAL_MS = 15_000 as const;
export const LOCK_TIMEOUT_MS = 30_000 as const;

// ─── Memory Budget (deprecated — prefer config: memory_budget, decay_after_sprints) ──
/** @deprecated Use config.memory_budget instead. Kept for backward compat & tests. */
// Sprint 140 pre-flight: 900→5000 (5.5x). MEMORY 1500 + PATTERNS 800 + RETRO 400
// + SPRINT_LOG 500 + ERRORS 600 + DECISIONS 1200 = 5000 toplam hedef.
export const BRAIN_TOTAL_LINE_BUDGET = 5000 as const;
/** @deprecated Use config.decay_after_sprints instead. Kept for backward compat & tests. */
// Sprint 140 pre-flight: 8→20 (2.5x), self-analysis sprint'i büyük hacim üretecek,
// decay'i yavaşlat ki analiz raporları hemen silinmesin.
export const MEMORY_DECAY_SPRINTS = 20 as const;
export const PATTERN_DECAY_SPRINTS = 25 as const;
