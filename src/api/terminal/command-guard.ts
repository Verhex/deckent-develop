/**
 * Command guard — pre-write deny-list for terminal `shell` sessions on remote
 * hosts (sub-project #2 invariant I3: default-deny on host != 127.0.0.1).
 */

const LOCALHOST_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export type CommandGuardPatternId =
  | 'rm_rf_root'
  | 'mkfs'
  | 'dd_of_dev'
  | 'fork_bomb'
  | 'ssh_keygen_rewrite'
  | 'authorized_keys_write';

export interface CommandGuardMatch {
  patternId: CommandGuardPatternId;
  offset: number;
}

export interface CommandGuardContext {
  kind: string;
  host?: string;
}

const PATTERNS: { id: CommandGuardPatternId; re: RegExp }[] = [
  { id: 'rm_rf_root', re: /\brm\s+-[a-zA-Z]*(?=[a-zA-Z]*r)(?=[a-zA-Z]*f)[a-zA-Z]*\s+\/(?:\s|$)/ },
  { id: 'mkfs', re: /\bmkfs(?:\.[a-z0-9]+)?\b/i },
  { id: 'dd_of_dev', re: /\bdd\b[^\n;|&]*\bof=\/dev\/[a-z0-9]+/i },
  { id: 'fork_bomb', re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
  { id: 'ssh_keygen_rewrite', re: /\bssh-keygen\b[^\n;|&]*\s-f\s+\S*\.?ssh\/[a-zA-Z0-9_.-]+/i },
  {
    id: 'authorized_keys_write',
    re: /(?:>>?\s*\S*authorized_keys\b|\btee\b(?:\s+-a)?\s+\S*authorized_keys\b)/i,
  },
];

export function matchCommandPatterns(input: string): CommandGuardMatch[] {
  if (!input) return [];
  const out: CommandGuardMatch[] = [];
  for (const { id, re } of PATTERNS) {
    const m = re.exec(input);
    if (m && typeof m.index === 'number') {
      out.push({ patternId: id, offset: m.index });
    }
  }
  out.sort((a, b) => a.offset - b.offset);
  return out;
}

export function checkCommandGuard(
  input: string,
  ctx: CommandGuardContext,
): CommandGuardMatch[] {
  if (ctx.kind !== 'shell') return [];
  if (ctx.host !== undefined && LOCALHOST_HOSTS.has(ctx.host)) return [];
  return matchCommandPatterns(input);
}

export function formatCommandGuardDetail(match: CommandGuardMatch): string {
  return match.patternId + ':' + match.offset + ':cmd';
}

export const COMMAND_GUARD_LOCALHOST_HOSTS = LOCALHOST_HOSTS;
