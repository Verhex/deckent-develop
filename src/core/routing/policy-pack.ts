// ─── RoutingEngineV3 — POLICY PACKS (declarative org/project routing rules) ──
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §4: enterprise governance
// as DATA — declarative when/require rules, no code execution ever. 3-layer
// (builtin-none < org < project), mirroring the vocabulary loader's merge and
// shadowing-report semantics.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { DeckentError } from '../errors.js';
import { parseSubtype, isWorkType } from './vocabulary-builtin.js';
import type { RequirementVector } from './requirement-vector.js';

export const PROJECT_POLICY_PACK_RELATIVE_PATH = '.deckent/routing/policy-pack.json';

// ─── Schema (declarative only — no executable conditions) ───────────────────

const policyWhenSchema = z
  .object({
    workTypes: z.array(z.string().refine((v) => isWorkType(parseSubtype(v).parent))).optional(),
    domains: z.array(z.string().min(1)).optional(),
    riskClass: z.array(z.enum(['low', 'medium', 'high'])).optional(),
  })
  .strict();

const policyRequireSchema = z
  .object({
    roles: z.array(z.string().min(1)).optional(),
    agentAllowlist: z.array(z.string().min(1)).optional(),
    denyAgents: z.array(z.string().min(1)).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    escalate: z.boolean().optional(),
  })
  .strict();

export const policyRuleSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    when: policyWhenSchema,
    require: policyRequireSchema,
  })
  .strict();

export type PolicyRule = z.infer<typeof policyRuleSchema>;

const policyPackFileSchema = z
  .object({
    rules: z.array(policyRuleSchema),
  })
  .strict();

// ─── Loader (3-layer; mirrors vocabulary merge semantics) ───────────────────

export class PolicyPackParseError extends DeckentError {
  constructor(layer: string, detail: string) {
    super(
      'ROUTING3_POLICY_PACK_INVALID',
      `Invalid policy-pack layer '${layer}': ${detail}`,
      'Fix the policy-pack JSON against the declarative schema: rules[{id, description, when{workTypes?,domains?,riskClass?}, require{roles?,agentAllowlist?,denyAgents?,minConfidence?,escalate?}}]. Conditions are data, never code.',
    );
    this.name = 'PolicyPackParseError';
  }
}

export interface PolicyPackRegistry {
  rules: readonly PolicyRule[];
  /** Same-id rules overridden by a higher layer — reported, never silent. */
  shadowed: Array<{ id: string; shadowedLayer: string; winningLayer: string }>;
  /** Layers that failed to parse — skipped with visibility (fail-soft). */
  invalid: Array<{ layer: string; error: string }>;
}

export interface LoadPolicyPacksOptions {
  /** Optional org-overlay file path (enterprise shared layer). */
  orgOverlayPath?: string;
}

/**
 * Load and merge policy layers (org < project; higher layer wins on rule id).
 * Absent files = empty pack (zero-config clean). Malformed layer = skipped +
 * reported (one bad layer never aborts the merge).
 */
export function loadPolicyPacks(
  projectRoot: string,
  options: LoadPolicyPacksOptions = {},
): PolicyPackRegistry {
  const layers: Array<{ name: string; file: string }> = [];
  if (options.orgOverlayPath) layers.push({ name: 'org-overlay', file: options.orgOverlayPath });
  layers.push({ name: 'project', file: path.join(projectRoot, PROJECT_POLICY_PACK_RELATIVE_PATH) });

  const byId = new Map<string, { rule: PolicyRule; layer: string }>();
  const shadowed: PolicyPackRegistry['shadowed'] = [];
  const invalid: PolicyPackRegistry['invalid'] = [];

  for (const layer of layers) {
    if (!fs.existsSync(layer.file)) continue;
    let parsed: z.infer<typeof policyPackFileSchema>;
    try {
      parsed = policyPackFileSchema.parse(JSON.parse(fs.readFileSync(layer.file, 'utf8')));
    } catch (err) {
      invalid.push({ layer: layer.name, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    for (const rule of parsed.rules) {
      const existing = byId.get(rule.id);
      if (existing) {
        shadowed.push({ id: rule.id, shadowedLayer: existing.layer, winningLayer: layer.name });
      }
      byId.set(rule.id, { rule, layer: layer.name });
    }
  }

  return Object.freeze({
    rules: Object.freeze([...byId.values()].map((v) => v.rule)),
    shadowed,
    invalid,
  });
}

// ─── Matching (pure) ─────────────────────────────────────────────────────────

/** Does a rule's when-clause match the requirement? Empty when = matches all. */
export function policyMatches(rule: PolicyRule, requirement: RequirementVector): boolean {
  const { when } = rule;
  if (when.workTypes && when.workTypes.length > 0) {
    const reqParent = parseSubtype(requirement.content.workType).parent;
    if (!when.workTypes.some((w) => parseSubtype(w).parent === reqParent)) return false;
  }
  if (when.domains && when.domains.length > 0) {
    const reqDomains = new Set(requirement.positional.domains.map((d) => d.id));
    if (!when.domains.some((d) => reqDomains.has(d))) return false;
  }
  if (when.riskClass && when.riskClass.length > 0) {
    if (!when.riskClass.includes(requirement.numerical.riskClass)) return false;
  }
  return true;
}
