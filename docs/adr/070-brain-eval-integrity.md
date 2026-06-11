# ADR-070: Brain Evaluation Integrity — Signal-Based Coverage Exemption + Zero-Hard-Code Principle

**Status:** accepted

**Date:** 2026-05-31

**Accepted:** Sprint 207

---

## Context

Two systemic problems were identified and fixed in Sprint 207:

### Problem A — False-FIX Cascade from coverage:null

Sprint 206 produced 7 false-FIX cycles where the identical worker result was evaluated as
`DONE` under `bug-fixer` but `NO_GO` under `refactorer`. The root cause was in
`coverageOptional()` (rubric-registry.ts): the function used an agent-name allowlist to
determine whether `coverage:null` was acceptable. `refactorer` was not on the list, so any
refactoring task that didn't produce a numeric coverage value triggered a NO_GO → FIX loop.

This was a **false signal**: a refactorer that rewrites a function and adds new test files
clearly exercised the codebase. The absence of a `coverage` number is an instrumentation
gap, not a quality failure. The agent-based allowlist was a leaky abstraction — it required
manual maintenance every time a new agent type appeared in the system.

### Problem B — Bundled Hard-Coded Model IDs (Zero-Hard-Code Violation)

`model-registry.ts` contained `apiId: 'claude-opus-4-6'` as a bundled snapshot value. The
actual current Opus model is `claude-opus-4-8`. This stale hard-code propagated into:
- `deckent start` cost-estimate output (showed old model name to users)
- `bootstrapFromCatalog` (models.dev live catalog fetch): apiId was not overriding the
  bundled snapshot even when the remote catalog had updated entries
- `cost-calculator.ts` model-label generation: used registry values but the registry itself
  had stale bundled data

The principle: any string that a running deckent instance can derive from live data MUST NOT
be hard-coded in source. Bundled snapshots are an offline fallback, not a source of truth.

---

## Decision

### Decision A — Signal-Based coverage Exemption (agent-independent)

`coverageOptional(task, result)` was extended with a **signal-based path** that runs before
the agent-name allowlist check:

```typescript
if (result) {
  const wroteTests = result.filesChanged?.some(
    f => f.includes('.test.') || f.includes('.spec.')
  ) ?? false;
  if (wroteTests) return true;
}
```

Semantics:
- If a worker changed at least one test file (`.test.*` or `.spec.*`), coverage is optional.
- This is **agent-independent** — the same result evaluates identically regardless of which
  agent ran the task.
- It is **idempotent** — re-evaluating the same result always produces the same decision.
- It is **deterministic** — derived entirely from `result.filesChanged`, which is disk-level
  ground truth.

**Bridge fix (P0-2):** `refactorer` and `code-reviewer` were also added to the
`COVERAGE_OPTIONAL_AGENTS` allowlist as a bridge. The signal-based path is the permanent
solution; the allowlist entries prevent regression during the transition.

Implemented in: `src/orchestra/rubric-registry.ts` (Sprint 207 P0-1 + P0-2).

### Decision B — Zero-Hard-Code: Live Registry as Authoritative Source

Three rules now govern model identity strings in deckent:

1. **Bundled snapshot apiId must be kept current at build time.** If the bundled opus entry
   says `claude-opus-4-6` and the actual model is `claude-opus-4-8`, every cost estimate and
   status output shown to users is wrong. Bundled values are updated in the same PR as model
   promotions.

2. **`bootstrapFromCatalog` overrides bundled apiId from live catalog.** If `models.dev`
   returns an entry for a given model key, its `apiId` field WINS over the bundled snapshot.
   The bundled value is only used when the catalog is unreachable (offline fallback).

3. **`cost-calculator` and all display paths read `registry.get(model).apiId`
   parametrically.** No hard-coded `'anthropic/claude-opus-4-6'` or similar strings in
   display logic. If the registry has a stale value, the display is still consistent — the
   fix goes in one place (the registry), not scattered across callers.

Implemented in: `src/core/model-registry.ts`, `src/core/model-catalog.ts`,
`src/core/cost-calculator.ts` (Sprint 207 001/002/003).

### RBAC Gate Wire (F4-001 progress)

As part of Sprint 207 zero-hard-code + F4 work, `audit-query.ts` was wired to RBAC:
`queryAudit(params, role)` now calls `can(role, 'audit:read', tenantId)` — unauthorized
roles receive an empty/error response. This moves F4-001 from pure skeleton to enforced gate.

---

## Consequences

**Positive:**
- False-FIX cascade eliminated. The Brain no longer generates unnecessary FIX tasks for
  `refactorer`/`code-reviewer` results that include new test files.
- Evaluation is agent-independent: routing decisions cannot change the GO/NO-GO outcome for
  the same work product.
- Cost estimates show accurate model names to users without manual bundled-value maintenance.
- Zero-hard-code principle is now a documented constraint — new callers default to the
  registry API, not inline strings.
- RBAC enforcement on audit-query closes the audit access-control gap opened in Sprint 205.

**Negative:**
- Signal-based path depends on `filesChanged` being populated accurately by workers. A worker
  that wrote test files but omitted them from `filesChanged` would still get NO_GO. This is
  intentional: honest result reporting is a separate contract (ADR-035).
- Bundled apiId updates require a manual step at release time. Automated catalog-to-bundled
  sync is deferred (no Sprint 207 scope).
- `bootstrapFromCatalog` apiId override only fires when the network is available. Offline
  environments always use the bundled value — acceptable, as offline means "last known good."

---

## Alternatives Considered

- **Agent allowlist only (no signal path):** Required adding every new agent type manually.
  Sprint 206's 7 false-FIX cycles were the direct cost of this approach. Rejected.
- **Disable coverage check entirely:** Removes a meaningful quality signal for tasks that
  clearly should produce coverage (e.g., new API endpoint with no test files). Rejected.
- **Remote model catalog as sole source (no bundled fallback):** Breaks offline usage and
  adds a network call to every startup. ADR-010 (minimal runtime dependency) + offline
  resilience requirement both argue against this. Rejected.
- **Hard-coded apiId with comment:** The comment rots; the string stays wrong. Zero-hard-code
  principle requires the live source to win. Rejected.

---

## References

- `src/orchestra/rubric-registry.ts` — `coverageOptional()` signal-based path (Sprint 207 P0-1)
- `src/core/model-registry.ts` — bundled opus apiId updated to `claude-opus-4-8` (Sprint 207-001)
- `src/core/model-catalog.ts` — `bootstrapFromCatalog` apiId merge wire (Sprint 207-002)
- `src/core/cost-calculator.ts` — parametric model-label from registry (Sprint 207-003)
- `src/core/audit-query.ts` — RBAC gate wire via `can()` (Sprint 207-007)
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard
- ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0
- ADR-069: Event-Driven Triggers + RBAC — F3 Webhook & F4 RBAC
- ROADMAP F4-001: OIDC/SSO AuthProvider impl + RBAC → Sprint 207-007 gate wire

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (değerlendirme adaleti + doğru model/maliyet gösterimi ürün-kanunu).

**Re-verified (üç karar da birebir canlı):** Decision-A signal-based `wroteTests` (`rubric-registry.ts:281-282`) + bridge-allowlist (:246) ✓ · Decision-B bundled apiId'ler **güncel-tutulmuş** — `claude-opus-4-8` (:78) ve `claude-fable-5` (:67, en yeni model dahil; zero-hard-code ilkesi yaşıyor) ✓ · RBAC-gate `queryAudit` → `can(role, Permission.READ, tenantId)` (`audit-query.ts:73`) ✓ (ADR'deki `'audit:read'` ifadesi implementasyonda `Permission.READ` — semantik aynı, imza-nüansı).

**Evrim — sinyal-ilkesi STACK boyutu kazandı (WM-7, Sprint 254):** coverage-muafiyet artık yalnız wroteTests-sinyali değil, **tech-stack-duyarlı** da: `COVERAGE_MEASURABLE_STACKS` (`core/work-model.ts`) vitest-ölçülemez stack'leri (C++/Go/…) coverage-zorunluluğundan muaf tutar — "ölçüm-boşluğu ≠ kalite-hatası" ilkesinin (bu ADR'nin özü) taksonomi-eksenine genişlemesi (ADR-053 Sprint-281 amendment cross-ref). md+db senkron (Alperen ADR-review).
