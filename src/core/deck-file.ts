import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// ─── Constants ──────────────────────────────────────────────────────────────

/** The .deck file name used in project roots. */
export const DECK_FILE_NAME = '.deck' as const;

/** All known DECKENT_ keys that are valid in a .deck file. */
export const KNOWN_DECK_KEYS = [
  'DECKENT_CLAUDE_API_KEY',
  'DECKENT_OPENAI_API_KEY',
  'DECKENT_GOOGLE_API_KEY',
  'DECKENT_SMTP_HOST',
  'DECKENT_SMTP_USER',
  'DECKENT_SMTP_PASS',
  'DECKENT_WEBHOOK_URL',
  'DECKENT_DB_URL',
  'DECKENT_TELEMETRY_ID',
] as const;

/** A known DECKENT_ key. */
export type KnownDeckKey = (typeof KNOWN_DECK_KEYS)[number];

// ─── Types ──────────────────────────────────────────────────────────────────

/** Result of validating a .deck file's contents. */
export interface DeckFileValidation {
  /** Whether the file is valid (no errors). Warnings do not affect validity. */
  valid: boolean;
  /** Warnings for unknown keys (not in KNOWN_DECK_KEYS). */
  warnings: string[];
  /** Errors for invalid format (malformed lines). */
  errors: string[];
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Parse a .deck file content into key-value pairs.
 * Format: KEY=VALUE lines, # comments, blank lines skipped, whitespace trimmed.
 * Supports = in values, quoted values (single/double quotes stripped).
 */
export function parseDeckFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) continue;

    // Must contain = separator
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    if (key === '') continue;

    let value = line.slice(eqIndex + 1).trim();

    // Strip matching quotes (single or double)
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Load secrets from .deck file in project root.
 * Does NOT inject into process.env — Brain decides what to pass to workers.
 * Returns empty record if file missing.
 */
export function loadDeckSecrets(projectRoot: string): Record<string, string> {
  const deckPath = join(projectRoot, DECK_FILE_NAME);

  if (!existsSync(deckPath)) return {};

  try {
    const content = readFileSync(deckPath, 'utf-8');
    return parseDeckFile(content);
  } catch {
    return {};
  }
}

/**
 * Validate .deck file contents against known DECKENT_ keys.
 * Returns warnings for unknown keys, errors for invalid format.
 */
export function validateDeckFile(secrets: Record<string, string>): DeckFileValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const key of Object.keys(secrets)) {
    // Check key format: must be non-empty, alphanumeric + underscore
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`Invalid key format: "${key}" — keys must be alphanumeric with underscores`);
      continue;
    }

    // Check if key is in known list
    if (!KNOWN_DECK_KEYS.includes(key as KnownDeckKey)) {
      warnings.push(`Unknown key: "${key}" — not in known DECKENT_ keys`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Create .deck template with all known keys as empty values with comments.
 */
export function createDeckTemplate(projectRoot: string): void {
  const deckPath = join(projectRoot, DECK_FILE_NAME);

  const lines: string[] = [
    '# ─── Deckent Secrets (.deck) ─────────────────────────────────────',
    '# This file is Deckent\'s equivalent of .env.',
    '# NEVER commit this file to version control.',
    '# Brain reads this file and decides what to pass to workers.',
    '',
    '# ─── API Keys ────────────────────────────────────────────────────',
    'DECKENT_CLAUDE_API_KEY=',
    'DECKENT_OPENAI_API_KEY=',
    'DECKENT_GOOGLE_API_KEY=',
    '',
    '# ─── SMTP (email notifications) ─────────────────────────────────',
    'DECKENT_SMTP_HOST=',
    'DECKENT_SMTP_USER=',
    'DECKENT_SMTP_PASS=',
    '',
    '# ─── Integrations ────────────────────────────────────────────────',
    'DECKENT_WEBHOOK_URL=',
    'DECKENT_DB_URL=',
    'DECKENT_TELEMETRY_ID=',
    '',
  ];

  writeFileSync(deckPath, lines.join('\n'), 'utf-8');
}

/**
 * Ensure .deck is in .gitignore. Adds it if missing, skips if already present.
 */
export function ensureDeckGitignore(projectRoot: string): void {
  const gitignorePath = join(projectRoot, '.gitignore');

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n');

    // Check if .deck is already listed (exact match on trimmed line)
    const alreadyPresent = lines.some((line) => line.trim() === '.deck');
    if (alreadyPresent) return;

    // Append .deck entry
    const needsNewline = content.length > 0 && !content.endsWith('\n');
    const entry = `${needsNewline ? '\n' : ''}.deck\n`;
    appendFileSync(gitignorePath, entry, 'utf-8');
  } else {
    // Create .gitignore with .deck entry
    writeFileSync(gitignorePath, '.deck\n', 'utf-8');
  }
}

/**
 * Check if .deck file is committed to git (tracked). Returns true if tracked — this is a security risk.
 */
export function isDeckFileCommitted(projectRoot: string): boolean {
  try {
    const result = execSync('git ls-files --error-unmatch .deck', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    // If command succeeds (exit 0), file is tracked
    return result !== undefined;
  } catch {
    // Exit code 1 means file is not tracked
    return false;
  }
}
