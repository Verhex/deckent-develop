// src/orchestra/autonomous/reactive/reactive-map.ts
import { existsSync, readFileSync } from 'node:fs';
import type { BacklogEntry } from '../backlog-types.js';
import {
  type ReactiveEvent, type ReactiveMapFile, type ReactiveRule,
  riskAtLeast, severityAtLeast,
} from './reactive-types.js';

const KINDS = new Set(['task', 'sprint']);
const POLICIES = new Set(['auto', 'approval-required', 'risk-tagged']);

/** Returns first violation, or null when valid. */
export function validateReactiveRule(r: unknown): string | null {
  if (!r || typeof r !== 'object') return 'rule must be an object';
  const rule = r as Record<string, unknown>;
  const m = rule.match as Record<string, unknown> | undefined;
  if (!m || typeof m !== 'object') return 'rule.match must be an object';
  if (m.groupKey === undefined && m.minRisk === undefined && m.minSeverity === undefined) {
    return 'rule.match must specify at least one of groupKey/minRisk/minSeverity';
  }
  const t = rule.entryTemplate as Record<string, unknown> | undefined;
  if (!t || typeof t !== 'object') return 'rule.entryTemplate must be an object';
  if (!KINDS.has(t.kind as string)) return 'rule.entryTemplate.kind must be task|sprint';
  if (!POLICIES.has(t.policy as string)) return 'rule.entryTemplate.policy must be auto|approval-required|risk-tagged';
  if (!t.spec || typeof t.spec !== 'object') return 'rule.entryTemplate.spec must be an object';
  return null;
}

/** Load + validate. Missing file → empty map. */
export function loadReactiveMap(path: string): ReactiveMapFile {
  if (!existsSync(path)) return { _version: '1.0', rules: [] };
  let raw: ReactiveMapFile;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8')) as ReactiveMapFile;
  } catch (e) {
    throw new Error(`reactive-map at ${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(raw.rules)) throw new Error('reactive-map.rules must be an array');
  for (const r of raw.rules) {
    const err = validateReactiveRule(r);
    if (err) throw new Error(`Invalid reactive rule: ${err}`);
  }
  return { _version: typeof raw._version === 'string' ? raw._version : '1.0', rules: raw.rules };
}

function ruleMatches(rule: ReactiveRule, ev: ReactiveEvent): boolean {
  const m = rule.match;
  if (m.groupKey !== undefined && ev.groupKey !== m.groupKey) return false;
  if (m.minRisk !== undefined && !riskAtLeast(ev.risk, m.minRisk)) return false;
  if (m.minSeverity !== undefined && !severityAtLeast(ev.severity, m.minSeverity)) return false;
  return true;
}

/**
 * Map a reactive event to a durable BacklogEntry via the first matching rule.
 * `idGen` supplies the entry id (injected for deterministic tests).
 * Returns null when no rule matches.
 */
export function mapEventToEntry(
  ev: ReactiveEvent,
  map: ReactiveMapFile,
  idGen: () => string,
): BacklogEntry | null {
  const rule = map.rules.find((r) => ruleMatches(r, ev));
  if (!rule) return null;
  const t = rule.entryTemplate;
  // Prefix is intentionally `[nervous ...]` for ALL source types — every event here originates
  // from the nervous-system detector pipeline. `group=webhook.x` or `group=repo.x` in the
  // suffix indicates the reactive source; the `nervous` label identifies the dispatch channel.
  const ctx = `[nervous risk=${ev.risk}${ev.severity ? ` severity=${ev.severity}` : ''}${ev.groupKey ? ` group=${ev.groupKey}` : ''}]`;
  const baseDesc = t.spec.description ?? '';
  return {
    id: idGen(),
    title: `${t.titlePrefix ?? '[reactive]'} ${ev.groupKey ?? ev.risk}`.trim(),
    kind: t.kind,
    spec: {
      ...t.spec,
      description: `${baseDesc} ${ctx}`.trim(),
    },
    policy: t.policy,
    provider: t.provider,
    model: t.model,
    trigger: { type: 'reactive', detector: ev.groupKey ?? 'nervous' },
    status: 'pending',
    lastRun: null,
    lastResult: null,
  };
}
