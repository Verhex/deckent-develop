// ═══ Rule store — lifetime persistence (SP-1 §6) ════════════════════════════
// Lifetimes: 'once' (no memory), 'session' (in-memory only), 'always'
// (in-memory + .deckent/settings.local.json under permissions.rules).
// Migrates legacy permissions.allow:[toolName] → { tool, pattern: '**' }.
// Evolves chat-permissions.ts (tool-name set → rule set), same file location.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { PermissionRule } from './permission-types.js';

export type GrantLifetime = 'once' | 'session' | 'always';

export interface RuleStore {
  /** Add a rule for the given lifetime. */
  grant(rule: PermissionRule, lifetime: GrantLifetime): void;
  /** Remove a matching rule from memory + persisted store. */
  revoke(rule: PermissionRule): void;
  /** All currently-active allow rules (session + persisted). */
  activeRules(): PermissionRule[];
  /** Persisted explicit DENY rules (permissions.deny) — highest precedence in decide(). */
  activeDenies(): PermissionRule[];
}

function settingsPath(cwd: string): string {
  return join(cwd, '.deckent', 'settings.local.json');
}

function sameRule(a: PermissionRule, b: PermissionRule): boolean {
  return a.tool === b.tool && a.pattern === b.pattern;
}

function loadPersisted(cwd: string): PermissionRule[] {
  const p = settingsPath(cwd);
  if (!existsSync(p)) return [];
  try {
    const doc = JSON.parse(readFileSync(p, 'utf-8')) as {
      permissions?: { rules?: unknown; allow?: unknown };
    };
    const rules: PermissionRule[] = [];
    const raw = doc.permissions?.rules;
    if (Array.isArray(raw)) {
      for (const x of raw) {
        if (x && typeof x === 'object' && typeof (x as PermissionRule).tool === 'string' && typeof (x as PermissionRule).pattern === 'string') {
          rules.push({ tool: (x as PermissionRule).tool, pattern: (x as PermissionRule).pattern });
        }
      }
    }
    // legacy migration: permissions.allow:[toolName] → tool(**)
    const legacy = doc.permissions?.allow;
    if (Array.isArray(legacy)) {
      for (const t of legacy) {
        if (typeof t === 'string') rules.push({ tool: t, pattern: '**' });
      }
    }
    return rules;
  } catch {
    return [];
  }
}

/** Load explicit deny rules from permissions.deny. Fail-safe: malformed → []. */
function loadDenies(cwd: string): PermissionRule[] {
  const p = settingsPath(cwd);
  if (!existsSync(p)) return [];
  try {
    const doc = JSON.parse(readFileSync(p, 'utf-8')) as { permissions?: { deny?: unknown } };
    const raw = doc.permissions?.deny;
    const rules: PermissionRule[] = [];
    if (Array.isArray(raw)) {
      for (const x of raw) {
        if (x && typeof x === 'object' && typeof (x as PermissionRule).tool === 'string' && typeof (x as PermissionRule).pattern === 'string') {
          rules.push({ tool: (x as PermissionRule).tool, pattern: (x as PermissionRule).pattern });
        }
      }
    }
    return rules;
  } catch {
    return [];
  }
}

function persist(cwd: string, rules: PermissionRule[]): void {
  const p = settingsPath(cwd);
  let doc: Record<string, unknown> = {};
  try {
    if (existsSync(p)) doc = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    doc = {};
  }
  const permissions = (doc['permissions'] && typeof doc['permissions'] === 'object' && !Array.isArray(doc['permissions']))
    ? (doc['permissions'] as Record<string, unknown>)
    : {};
  permissions['rules'] = rules;
  // SP-1 M3 coexistence: while the native path (rules) runs behind a flag
  // alongside the legacy default path (allow), do NOT delete permissions.allow —
  // a native "always" grant must not wipe the legacy allow-list. The allow→rules
  // migration still happens in-memory on load; only the on-disk delete is gated.
  // M4 (legacy delete) removes this guard and resumes the cleanup.
  doc['permissions'] = permissions;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

export function createRuleStore(cwd: string): RuleStore {
  const persisted = loadPersisted(cwd);
  const denies = loadDenies(cwd);
  const session: PermissionRule[] = [];
  const active = (): PermissionRule[] => {
    const all = [...persisted];
    for (const s of session) if (!all.some((a) => sameRule(a, s))) all.push(s);
    return all;
  };
  return {
    grant(rule, lifetime) {
      if (lifetime === 'once') return;
      if (lifetime === 'session') {
        if (!session.some((s) => sameRule(s, rule))) session.push(rule);
        return;
      }
      if (!persisted.some((s) => sameRule(s, rule))) persisted.push(rule);
      persist(cwd, persisted);
    },
    revoke(rule) {
      for (let i = session.length - 1; i >= 0; i--) if (sameRule(session[i]!, rule)) session.splice(i, 1);
      const before = persisted.length;
      for (let i = persisted.length - 1; i >= 0; i--) if (sameRule(persisted[i]!, rule)) persisted.splice(i, 1);
      if (persisted.length !== before) persist(cwd, persisted);
    },
    activeRules: active,
    activeDenies: () => [...denies],
  };
}
