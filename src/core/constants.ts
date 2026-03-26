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
export const DASHBOARD_FILE = '.dashboard' as const;

// ─── Memory Files (relative to BRAIN_DIR) ────────────────────────────
export const MEMORY_FILE = 'MEMORY.md' as const;
export const DECISIONS_FILE = 'DECISIONS.md' as const;
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

// ─── Timing ──────────────────────────────────────────────────────────
export const AUDITOR_SCAN_INTERVAL_MS = 30_000 as const;
export const HEARTBEAT_STALE_THRESHOLD_MS = 120_000 as const;
export const HEARTBEAT_WRITE_INTERVAL_MS = 15_000 as const;
export const LOCK_TIMEOUT_MS = 30_000 as const;
export const LOCK_STALE_THRESHOLD_MS = 300_000 as const;

// ─── Memory Limits ───────────────────────────────────────────────────
export const MEMORY_MAX_LINES = 300 as const;
export const PATTERNS_MAX_LINES = 150 as const;
export const RETRO_MAX_LINES = 120 as const;
export const SPRINT_LOG_MAX_LINES = 100 as const;
export const BRAIN_TOTAL_LINE_BUDGET = 900 as const;
export const MEMORY_DECAY_SPRINTS = 8 as const;
export const PATTERN_DECAY_SPRINTS = 12 as const;

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
export const DEFAULT_MODE = 'max_plan' as const;
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
