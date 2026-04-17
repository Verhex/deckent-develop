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
 * Handles: API keys, Bearer tokens, passwords in URLs, env var assignments.
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

  return result;
}
