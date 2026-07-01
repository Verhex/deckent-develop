/**
 * Credential Redaction — Core Module
 *
 * Moved from src/cli/helpers/output.ts to src/core/ per ADR-008:
 * agents/ must not import from cli/. Placing this in core/ breaks
 * the agents/ → cli/ dependency violation in worker-log.ts.
 */

const REDACTED = '[REDACTED]';

/**
 * Redact sensitive credentials from text to prevent leaking secrets in logs.
 * Handles: API keys, Bearer tokens, passwords in URLs, env var assignments,
 * AWS access keys, GitHub tokens, JWTs, generic password/token/secret= assignments.
 */
export function redactSensitive(text: string): string {
  if (!text) return text;

  let result = text;

  // API keys: sk-... patterns (OpenAI, Anthropic style) — at least 20 chars after prefix
  result = result.replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, REDACTED);

  // API keys: key-... patterns — at least 20 chars after prefix
  result = result.replace(/\b(key-[a-zA-Z0-9_-]{20,})\b/g, REDACTED);

  // Bearer tokens: "Bearer <token>" or "bearer <token>"
  result = result.replace(/(Bearer\s+)[^\s"',;]+/gi, `$1${REDACTED}`);

  // Passwords in URLs: ://user:password@host
  result = result.replace(/(:\/\/[^:/?#\s]+:)[^@\s]+(@)/g, `$1${REDACTED}$2`);

  // Environment variable assignments for known sensitive keys
  result = result.replace(
    /((?:OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|API_KEY|SECRET_KEY|ACCESS_TOKEN|AUTH_TOKEN|PRIVATE_KEY)=)[^\s"';]+/gi,
    `$1${REDACTED}`,
  );

  // AWS access key IDs — exact-length, e.g. AKIAIOSFODNN7EXAMPLE
  result = result.replace(/\b(AKIA[0-9A-Z]{16})\b/g, REDACTED);

  // GitHub tokens: classic PAT (ghp_/gho_) and fine-grained PAT (github_pat_)
  // e.g. ghp_16C7e42F292c6912E7710c838347Ae178B4a / github_pat_11AAAAAAA0aaaaaaaaaaaa_aaaa...
  result = result.replace(/\b((?:ghp_|gho_|github_pat_)[a-zA-Z0-9_]{20,})\b/g, REDACTED);

  // JWTs: three dot-separated base64url segments starting with the "eyJ" header prefix
  // e.g. eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U
  result = result.replace(/\b(eyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,})\b/g, REDACTED);

  // Generic assignments, e.g. password=hunter2, token=abc123 (key= is preserved, value redacted)
  result = result.replace(/\b((?:password|passwd|token|secret)=)[^\s"';]+/gi, `$1${REDACTED}`);

  return result;
}
