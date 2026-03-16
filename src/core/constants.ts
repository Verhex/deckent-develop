import { homedir } from 'node:os';
import { join } from 'node:path';

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
export const DASHBOARD_FILE = '.dashboard' as const;

// ─── Memory Files (relative to BRAIN_DIR) ────────────────────────────
export const MEMORY_FILE = 'MEMORY.md' as const;
export const DECISIONS_FILE = 'DECISIONS.md' as const;
export const DEBT_FILE = 'DEBT.md' as const;
export const PATTERNS_FILE = 'PATTERNS.md' as const;
export const RETRO_FILE = 'RETRO.md' as const;
export const SPRINTS_DIR = 'sprints' as const;
export const ARCHIVE_DIR = 'archive' as const;

// ─── Agent Files ─────────────────────────────────────────────────────
export const AGENTS_FILE = 'AGENTS.md' as const;
export const CLAUDE_FILE = 'CLAUDE.md' as const;
export const DIRECTIVES_FILE = 'DIRECTIVES.md' as const;

// ─── Timing ──────────────────────────────────────────────────────────
export const AUDITOR_SCAN_INTERVAL_MS = 30_000 as const;
export const HEARTBEAT_STALE_THRESHOLD_MS = 120_000 as const;
export const HEARTBEAT_WRITE_INTERVAL_MS = 15_000 as const;
export const LOCK_TIMEOUT_MS = 30_000 as const;
export const LOCK_STALE_THRESHOLD_MS = 300_000 as const;

// ─── Memory Limits ───────────────────────────────────────────────────
export const MEMORY_MAX_LINES = 100 as const;
export const PATTERNS_MAX_LINES = 80 as const;
export const RETRO_MAX_LINES = 60 as const;
export const SPRINT_LOG_MAX_LINES = 50 as const;
export const BRAIN_TOTAL_LINE_BUDGET = 300 as const;
export const MEMORY_DECAY_SPRINTS = 3 as const;
export const PATTERN_DECAY_SPRINTS = 5 as const;

// ─── Task File Extensions ────────────────────────────────────────────
export const TASK_FILE_EXTENSIONS = ['.json', '.plan', '.hb', '.result', '.paused'] as const;

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
export const DECKENT_VERSION = '0.1.0' as const;
export const SUPPORTED_LANGUAGES = ['en', 'tr'] as const;
