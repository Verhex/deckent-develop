/**
 * Prompt guard — pre-bridge pattern matcher (I1 + I2 invariants).
 */

const BASE64_MIN_LEN = 256;
const BASE64_RE = /[A-Za-z0-9+/]{256,}={0,2}/g;
const OSC_RE = /\x1b\]/g;
const CURL_PIPE_SHELL_RE = /curl\b[^\n\r;|]*\|\s*(?:sh|bash|zsh|dash|ksh|fish)\b/gi;

export type PromptGuardPatternId = 'base_blob' | 'osc_escape' | 'curl_pipe_shell';

export interface GuardMatch {
  patternId: PromptGuardPatternId;
  offset: number;
  length: number;
}

export function matchPromptPatterns(input: string): GuardMatch[] {
  if (!input) return [];
  const out: GuardMatch[] = [];

  BASE64_RE.lastIndex = 0;
  for (let m = BASE64_RE.exec(input); m !== null; m = BASE64_RE.exec(input)) {
    if (m[0].length >= BASE64_MIN_LEN) {
      out.push({ patternId: 'base_blob', offset: m.index, length: m[0].length });
    }
  }

  OSC_RE.lastIndex = 0;
  for (let m = OSC_RE.exec(input); m !== null; m = OSC_RE.exec(input)) {
    out.push({ patternId: 'osc_escape', offset: m.index, length: 2 });
  }

  CURL_PIPE_SHELL_RE.lastIndex = 0;
  for (let m = CURL_PIPE_SHELL_RE.exec(input); m !== null; m = CURL_PIPE_SHELL_RE.exec(input)) {
    out.push({ patternId: 'curl_pipe_shell', offset: m.index, length: m[0].length });
  }

  out.sort((a, b) => a.offset - b.offset);
  return out;
}

export function formatGuardDetail(match: GuardMatch, tag?: string): string {
  const base = match.patternId + ':' + match.offset;
  if (!tag) return base;
  return base + ':' + tag;
}
