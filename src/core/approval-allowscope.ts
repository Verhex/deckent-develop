// ─── ApprovalAllowScope — scoped "always allow" grants (APR-ALLOWSCOPE) ──────
// MASTER-PLAN Sıra-69. A grant is bound to the quadruple (scopeId + ApprovalScope
// + maxRisk + expiresAt) — NEVER global. This module is a standalone lookup: it
// does NOT modify approval-policy.ts and does NOT wire itself into the broker or
// decidePolicy(). Composing `matchesAllow()` in FRONT of the policy engine (so an
// always-allow grant can short-circuit a `require-approval`/`notify` verdict) is a
// deliberate follow-up task — out of scope here. This module depends only on the
// approval-contract.ts vocabulary, never on approval-policy.ts or approval-broker.ts.
//
// Persistence: a single JSON file at `.deckent/settings/approval-allows.json`
// (SETTINGS_DIR, constants.ts) holding a bare array of grants. Atomic write
// (tmp-file + rename, best-effort unlink of the tmp file on a failed rename) —
// the SAME pattern approval-store.ts / approval-broker.ts already use for their
// own on-disk state, re-derived here rather than imported (this module is a PEER,
// not a wrapper — it must recover its full state from a plain re-read of the
// file, with zero reliance on any broker/store in-memory state). A missing file,
// unparsable JSON, or a top-level shape that isn't an array is fail-soft: the
// store starts from an empty set, never throws.
//
// Never-global enforcement lives at the schema level in two ways: `scope` is a
// concrete 7-value enum (a single ApprovalScope, never "all scopes" — the type
// itself makes a wildcard scope structurally impossible), and `scopeId` is
// refined to reject a small set of reserved wildcard tokens ('*', '**', 'all',
// 'any', 'global') that would otherwise let a grant claim to match every scopeId.
// A rejected grant THROWS (ApprovalAllowScopeError) — it is never silently
// dropped or silently narrowed.

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { SETTINGS_DIR } from './constants.js';
import {
  ALL_APPROVAL_RISKS,
  ALL_APPROVAL_SCOPES,
  type ApprovalRequest,
  type ApprovalRisk,
} from './approval-contract.js';
import type { ApprovalRiskTier } from './config-types.js';
import { approvalRiskTierFor } from './approval-channel-authenticator.js';

/** Root-relative path (under `<projectRoot>/`) to the persisted allow-list. */
export const APPROVAL_ALLOWS_FILE = join(SETTINGS_DIR, 'approval-allows.json');

// ─── Never-global guard ───────────────────────────────────────────────────────

/** Reserved `scopeId` tokens that would mean "match every scopeId" — rejected
 *  at the schema level, case-insensitively, so a grant can never be global. */
const GLOBAL_WILDCARD_SCOPE_IDS = new Set(['*', '**', 'all', 'any', 'global']);

function isGlobalWildcardScopeId(scopeId: string): boolean {
  return GLOBAL_WILDCARD_SCOPE_IDS.has(scopeId.trim().toLowerCase());
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const isoDateTimeSchema = z.string().datetime();

const allowScopeRuleSchema = z
  .object({
    id: z.string().min(1),
    /** The exact resource/tool-run identity this grant applies to — mirrors
     *  `ApprovalRequest.scopeId` semantics 1:1 (never a pattern, never a glob;
     *  matching is plain string equality). */
    scopeId: z
      .string()
      .min(1)
      .refine((v) => !isGlobalWildcardScopeId(v), {
        message:
          'scopeId must not be a global wildcard (e.g. "*", "all", "any", "global") — an always-allow grant must bind to one concrete scopeId',
      }),
    scope: z.enum(ALL_APPROVAL_SCOPES),
    /** The highest risk tier this grant covers — a request matches only when
     *  `request.risk <= maxRisk` (rank-compared, see {@link riskRank}). */
    maxRisk: z.enum(ALL_APPROVAL_RISKS),
    expiresAt: isoDateTimeSchema,
    grantedBy: z.string().min(1),
    grantedAt: isoDateTimeSchema,
    reason: z.string().default(''),
  })
  .strict();

/** The canonical always-allow grant type — inferred from {@link allowScopeRuleSchema}. */
export type ApprovalAllowScopeRule = z.infer<typeof allowScopeRuleSchema>;

/** Caller input to {@link ApprovalAllowScopeStore.grantAllow} — `id`/`grantedAt`
 *  are store-owned (generated at grant time), never caller-supplied. */
export type ApprovalAllowScopeGrantInput = Omit<z.input<typeof allowScopeRuleSchema>, 'id' | 'grantedAt'>;

/** The narrow slice of {@link ApprovalRequest} {@link ApprovalAllowScopeStore.matchesAllow}
 *  needs — a structural subset so a caller can match against a full request or a
 *  minimal hand-built descriptor without adapting either shape. */
export type ApprovalAllowScopeMatchInput = Pick<ApprovalRequest, 'scopeId' | 'scope' | 'risk'> & {
  readonly riskTier?: ApprovalRiskTier;
};

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ApprovalAllowScopeErrorCode = 'APR_ALLOWSCOPE_INVALID_GRANT';

export class ApprovalAllowScopeError extends Error {
  constructor(
    message: string,
    public readonly code: ApprovalAllowScopeErrorCode,
  ) {
    super(message);
    this.name = 'ApprovalAllowScopeError';
  }
}

// ─── Risk ranking (reuses the contract's own low->high enum order) ──────────

const RISK_RANK: Record<ApprovalRisk, number> = Object.fromEntries(
  ALL_APPROVAL_RISKS.map((risk, index) => [risk, index]),
) as Record<ApprovalRisk, number>;

// ─── Disk load (pure, fail-soft — never throws) ──────────────────────────────

/** Tolerant JSON read — a missing/unparsable file yields `undefined` rather
 *  than throwing, mirroring approval-store.ts `readJson`. */
function readJson(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return undefined;
  }
}

/**
 * Load the allow-list from `filePath`. Fail-soft at every stage: a missing
 * file, unparsable JSON, a non-array top level, or an individual entry that
 * fails schema validation never throws — that entry (or the whole file, if
 * the top level itself is malformed) is simply excluded, and the store
 * starts from an empty set rather than crashing its caller.
 */
export function loadAllowScopeFile(filePath: string): ApprovalAllowScopeRule[] {
  const raw = readJson(filePath);
  if (raw === undefined || !Array.isArray(raw)) return [];

  const rules: ApprovalAllowScopeRule[] = [];
  for (const entry of raw) {
    const parsed = allowScopeRuleSchema.safeParse(entry);
    if (parsed.success) rules.push(parsed.data);
  }
  return rules;
}

// ─── ApprovalAllowScopeStore ──────────────────────────────────────────────────

export interface ApprovalAllowScopeStoreOptions {
  /** Absolute path to the persisted allow-list file. Defaults to
   *  `<projectRoot>/.deckent/settings/approval-allows.json`. Tests MUST
   *  override with a hermetic tmpdir path — never point this at a real
   *  project's `.deckent`. */
  filePath?: string;
  /** Clock seam for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Id generator seam for deterministic tests. Defaults to `randomUUID`. */
  idFactory?: () => string;
}

/**
 * Durable store of scoped always-allow grants. One instance per process is
 * the expected usage (mirrors `ApprovalStore`) but multiple instances sharing
 * the same `filePath` stay consistent because every mutating call re-persists
 * the FULL current set immediately — there is no separate "flush" step.
 */
export class ApprovalAllowScopeStore {
  private readonly filePath: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private rules: ApprovalAllowScopeRule[];

  constructor(projectRoot: string, opts: ApprovalAllowScopeStoreOptions = {}) {
    this.filePath = opts.filePath ?? join(projectRoot, APPROVAL_ALLOWS_FILE);
    this.now = opts.now ?? (() => new Date());
    this.idFactory = opts.idFactory ?? randomUUID;
    this.rules = loadAllowScopeFile(this.filePath);
  }

  /** Atomic write — tmp file + rename, best-effort unlink of the tmp file on
   *  a failed rename. Identical shape to approval-store.ts `atomicWriteJson`. */
  private atomicWriteJson(data: unknown): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    try {
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup — the rename error below is what the caller needs.
      }
      throw err;
    }
  }

  private persist(): void {
    this.atomicWriteJson(this.rules);
  }

  /** The current in-memory grant set (defensive copy — mutating the returned
   *  array never affects the store). */
  list(): ApprovalAllowScopeRule[] {
    return [...this.rules];
  }

  /**
   * Create a new always-allow grant. Validates `input` against the schema —
   * a global-wildcard `scopeId`, or any other schema violation, THROWS
   * {@link ApprovalAllowScopeError} rather than silently dropping or
   * narrowing the request. `id` and `grantedAt` are store-owned: generated
   * here, never accepted from the caller.
   */
  grantAllow(input: ApprovalAllowScopeGrantInput): ApprovalAllowScopeRule {
    const parsed = allowScopeRuleSchema.safeParse({
      ...input,
      id: this.idFactory(),
      grantedAt: this.now().toISOString(),
    });
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
        .join('; ');
      throw new ApprovalAllowScopeError(`invalid always-allow grant: ${detail}`, 'APR_ALLOWSCOPE_INVALID_GRANT');
    }

    this.rules.push(parsed.data);
    this.persist();
    return parsed.data;
  }

  /** Remove a grant by id. Returns `true` iff a grant was actually removed
   *  (and, only then, re-persists). Removing an unknown id is a no-op. */
  revokeAllow(id: string): boolean {
    const before = this.rules.length;
    this.rules = this.rules.filter((rule) => rule.id !== id);
    const revoked = this.rules.length !== before;
    if (revoked) this.persist();
    return revoked;
  }

  /**
   * Match `request` against the live (non-expired) grant set: EXACT `scopeId`
   * equality, EXACT `scope` equality, and `request.risk <= grant.maxRisk`
   * (rank-compared). Any grant whose `expiresAt` has passed is purged from
   * the in-memory set — and the purge is persisted — as part of THIS call,
   * so an expired grant never lingers past the next match attempt. Returns
   * the first matching grant, or `null`.
   */
  matchesAllow(request: ApprovalAllowScopeMatchInput): ApprovalAllowScopeRule | null {
    const nowMs = this.now().getTime();
    const live: ApprovalAllowScopeRule[] = [];
    let purged = false;
    for (const rule of this.rules) {
      if (Date.parse(rule.expiresAt) <= nowMs) {
        purged = true;
        continue;
      }
      live.push(rule);
    }
    if (purged) {
      this.rules = live;
      this.persist();
    }

    const riskTier = approvalRiskTierFor(request);
    if (riskTier === null || riskTier === 'critical') return null;

    return (
      live.find(
        (rule) =>
          rule.scopeId === request.scopeId &&
          rule.scope === request.scope &&
          RISK_RANK[request.risk] <= RISK_RANK[rule.maxRisk],
      ) ?? null
    );
  }
}
