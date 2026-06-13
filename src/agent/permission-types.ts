// ═══ Permission core types + glob matcher (SP-1 §6) ═════════════════════════
// A grant/deny is a rule = tool(resource-pattern). matchRule does glob:
//   **  → any chars incl. '/'      *  → any chars except '/'
// All other glob metachars are treated literally (escaped).

export type ApprovalMode = 'suggest' | 'auto-edit' | 'full-auto';
export type PermissionDecision = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  /** Exact tool name this rule applies to. */
  tool: string;
  /** Glob over the tool's primary resource (path / command / url). */
  pattern: string;
}

/** Compile a glob to a RegExp: `**`→`.*`, `*`→`[^/]*`, rest escaped. */
function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] as string;
    if (c === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') { out += '.*'; i++; }
      else { out += '[^/]*'; }
    } else if ('\\^$.|?+()[]{}'.includes(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

/** True if `rule` applies to `tool` and its `resource` matches the pattern. */
export function matchRule(rule: PermissionRule, tool: string, resource: string): boolean {
  if (rule.tool !== tool) return false;
  return globToRegExp(rule.pattern).test(resource);
}
