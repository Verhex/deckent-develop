// Brain crash handler için sensitive data redaction.
// ADR-043: Brain Crash Recovery Protocol (Sprint 160).
//
// `redactSensitive(err)` IPC error.json'a yazılmadan önce error.message
// ve error.stack üzerindeki tüm gizli verileri (API key, OAuth token,
// env var, password, +100 char file content) `[REDACTED]` etiketiyle
// değiştirir. Best-effort scrubbing — yeni pattern eklemek bu listeye
// bir satır eklemekle yapılır.

const SENSITIVE_PATTERNS: ReadonlyArray<{ regex: RegExp; replacement: string }> = [
  // Önce specific env vars (GITHUB_TOKEN vb.) — generic token= deseninden önce.
  { regex: /(GITHUB|OPENAI|ANTHROPIC|GOOGLE)_(TOKEN|API_KEY|KEY)\s*[=:]\s*\S+/g, replacement: '$1_$2=[REDACTED]' },
  // api_key=..., api-key=...
  { regex: /api[_-]?key\s*[=:]\s*[^\s,;)'"]+/gi, replacement: 'api_key=[REDACTED]' },
  // Authorization: Bearer xxx
  { regex: /Authorization:\s*Bearer\s+[A-Za-z0-9._\-]+/g, replacement: 'Authorization: Bearer [REDACTED]' },
  // Standalone Bearer tokens
  { regex: /Bearer\s+[A-Za-z0-9._\-]{10,}/g, replacement: 'Bearer [REDACTED]' },
  // token=, secret=, password=, passwd=
  { regex: /(token|secret|password|passwd)\s*[=:]\s*[^\s,;)'"]+/gi, replacement: '$1=[REDACTED]' },
  // sk-..., pk-... API keys
  { regex: /(sk|pk)-[A-Za-z0-9]{16,}/g, replacement: '[REDACTED-key]' },
];

const MAX_CONTENT_LENGTH = 100;

function redactLongContent(text: string): string {
  return text.replace(
    /:\s*([^\s][\S\s]{100,})$/m,
    (_match, content: string) => `: [REDACTED:${content.length} chars]`,
  );
}

function redactString(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text;
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    out = out.replace(regex, replacement);
  }
  out = redactLongContent(out);
  return out;
}

export interface RedactedError {
  name: string;
  message: string;
  stack?: string;
}

export function redactSensitive(err: unknown): RedactedError {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: redactString(err.message) ?? '',
      stack: redactString(err.stack),
    };
  }
  return { name: 'NonError', message: redactString(String(err)) ?? '' };
}

export const _internals = { MAX_CONTENT_LENGTH };
