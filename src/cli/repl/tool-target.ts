// src/cli/repl/tool-target.ts
// ═══ 7114 — bounded, secret-free tool target for the transcript tool line ═══
//
// "● deckent_read_file — tool ran" told the user nothing about WHAT ran. This
// derives a short, data-only target from the proposed args: path + range for
// file reads, the (first line of the) command for shell, the digest prefix +
// byte window for a content ref, the pattern for grep/glob. Pure, string-free
// (no human words — enum values and numbers are data the model chose), and
// every string leaf passes through the canonical credential redaction so a
// `curl -H "Authorization: Bearer …"` line never reaches the screen intact.

import { redactSensitive } from '../../core/redact-sensitive.js';

/** Hard cap on rendered target cells — a tool line is a glance, not a dump. */
export const TOOL_TARGET_MAX_CHARS = 96;
/** Digest prefix shown for content refs (sha256 hex): enough to correlate with
 *  the meta line the model saw, never the whole 64 chars. */
export const TOOL_TARGET_DIGEST_PREFIX = 12;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function int(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : undefined;
}
function firstLine(text: string): string {
  const nl = text.indexOf('\n');
  return nl === -1 ? text : `${text.slice(0, nl)} …`;
}
function clip(text: string): string {
  const chars = Array.from(text);
  return chars.length <= TOOL_TARGET_MAX_CHARS ? text : `${chars.slice(0, TOOL_TARGET_MAX_CHARS - 1).join('')}…`;
}

/** File-read window: `startLine-endLine` (inclusive), legacy `offset+limit`
 *  (1-based first line + count), or an outline/search mode marker. */
function readRange(args: Record<string, unknown>): string {
  const mode = str(args['mode']);
  const start = int(args['startLine']);
  const end = int(args['endLine']);
  const offset = int(args['offset']);
  const limit = int(args['limit']);
  const parts: string[] = [];
  if (start !== undefined || end !== undefined) parts.push(`:${start ?? 1}-${end ?? ''}`);
  else if (offset !== undefined || limit !== undefined) parts.push(`:${offset ?? 1}+${limit ?? ''}`);
  if (mode && mode !== 'content') parts.push(`[${mode}]`);
  const query = str(args['query']);
  if (mode === 'search' && query) parts.push(`"${query}"`);
  return parts.join(' ');
}

/**
 * Derive the bounded target for a tool line. Returns '' when the args carry
 * nothing displayable (never invents one). Secrets are redacted on every
 * string leaf that reaches the output.
 */
export function describeToolTarget(tool: string, args: Readonly<Record<string, unknown>> | undefined): string {
  if (!args) return '';
  const a = args as Record<string, unknown>;
  let target = '';
  const path = str(a['path']) ?? str(a['file_path']);
  const cmd = str(a['cmd']) ?? str(a['command']);
  const ref = str(a['ref']);
  const pattern = str(a['pattern']);
  if (tool === 'bash' || tool.endsWith('_bash') || (cmd !== undefined && path === undefined)) {
    target = cmd !== undefined ? firstLine(cmd) : '';
  } else if (ref !== undefined && /^[a-f0-9]{16,}$/i.test(ref)) {
    const offset = int(a['offset']);
    const limit = int(a['limit']);
    const window = offset !== undefined || limit !== undefined ? ` @${offset ?? 0}+${limit ?? ''}` : '';
    target = `${ref.slice(0, TOOL_TARGET_DIGEST_PREFIX)}…${window}`;
  } else if (path !== undefined) {
    const range = tool.endsWith('_read_file') || tool === 'read_file' ? readRange(a) : '';
    target = range ? `${path}${range.startsWith(':') ? '' : ' '}${range}` : path;
    if (pattern !== undefined) target = `${pattern} ${target}`;
  } else if (pattern !== undefined) {
    target = pattern;
  } else {
    const url = str(a['url']);
    const query = str(a['query']);
    target = url ?? query ?? '';
  }
  return target === '' ? '' : clip(redactSensitive(target));
}

/** Elapsed wall-clock between `tool-executing` and `tool-result`, clamped at 0
 *  (a backwards wall-clock step never renders a negative duration). */
export function toolElapsedMs(startedAtMs: number | undefined, nowMs: number): number | undefined {
  if (startedAtMs === undefined) return undefined;
  return Math.max(0, Math.round(nowMs - startedAtMs));
}
