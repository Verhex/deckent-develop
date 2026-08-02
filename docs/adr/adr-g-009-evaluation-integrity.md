# ADR-G-009: Evaluation Integrity (Language-Agnostic Verify · Coverage-Exemption · Proof-of-Function)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=language-agnostic verify (TaskKind×TechStack criteria-deriver) + signal-based coverage-exemption (disk-derived, agent-independent, deterministic) + zero-hardcode (live-registry authoritative) + proof-of-function Tier-1 run-verify gate (`Smoke:` real-binary; mock-only=GO_WITH_TECH_DEBT, never DONE) — "wired ≠ working" → tomorrow=hard-enforce A9/A14 via ADR-G-020 flag-gated vein at GA-V2 + more stacks in the deriver (Law #2) + deeper signal-based eval (WM-7: language-mismatch-penalty, stack-aware coverage) + cross-verify (XVER-1)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-019 (Language-Agnostic Worker Verify) + ADR-070 (Brain Evaluation Integrity) + ADR-079 (Proof-of-Function DoD)
**Crosswalk:** 019 (+070+079) → ADR-G-009

> **Moat note:** Honest, real evaluation is a core deckent differentiator. This ADR makes evaluation language-agnostic, gaming-proof, and run-verified — the "wired ≠ working" law.

---

## Context

Evaluation must judge work **honestly and for real**, across any language, without false NO_GO or hollow DONE. Three problems were solved across sprints: (019) a single code-rubric falsely failed audit/doc tasks and assumed a TS toolchain on non-TS stacks; (070) an agent-name allowlist produced false-FIX cascades and stale hardcoded model IDs leaked into cost output; (079) a mocked unit test stamped DONE on a `serve` that was actually 401-broken ("hollow DONE"). The 2026-06-30 review unifies these into one evaluation-integrity law.

---

## Decision (Today)

```xml
<evaluation-integrity>
  <language-agnostic>verify criteria derived by task-kind × tech-stack (WM-7
    criteria-deriver): a C++ project is NOT held to `tsc`-clean; coverage is required
    only on COVERAGE_MEASURABLE_STACKS. doc→files-on-disk, audit→findings,
    code→detected-stack commands.</language-agnostic>
  <coverage-exemption signal-based="true">if a worker changed a test file
    (.test.*/.spec.*) coverage is optional — AGENT-INDEPENDENT + idempotent +
    deterministic (derived from result.filesChanged, disk ground-truth). Signal-based is
    the canonical/primary path; a transitional agent-allowlist bridge
    (COVERAGE_OPTIONAL_AGENTS, P0-2: refactorer/code-reviewer) still remains, checked
    first (070 false-FIX root → COVERAGE-BRIDGE-RETIRE).</coverage-exemption>
  <zero-hard-code>any string a running deckent can derive from live data MUST NOT be
    hardcoded — model IDs read from the live registry (bundled snapshot = offline
    fallback only); no stale `claude-opus-4-6` in cost/status output. Scope = user-facing
    cost/status OUTPUT (display labels derived from the live registry); test fixtures,
    backward aliases, and the pricing-baseline snapshot are excluded — not a repo-wide
    literal ban.</zero-hard-code>
  <proof-of-function>isUserSurfaceTask (Tier-1) = touches src/cli/commands/ |
    src/dashboard/ | src/api/ (orthogonal to TaskType). Tier-1 DoD = Tier-0 +
    a recorded REAL-BINARY run via the `Smoke:` directive. A mocked unit test alone =
    GO_WITH_TECH_DEBT, never DONE. The verify module (proof-of-function.ts, async spawn,
    host-side) runs the smoke + returns failed/passed/no-op; the EVALUATE phase
    (sprint-phases.ts) applies the DONE→GO_WTD downgrade + emits PROOF_OF_FUNCTION_MISMATCH
    (applyProofOfFunctionGate = the reusable helper form).
    Surface-aware routing prefers api-builder/frontend-designer/ci-guardian.</proof-of-function>
</evaluation-integrity>
```

The "wired ≠ working" principle is permanent: structural/disk proof (Tier-0) is insufficient for user surfaces; only a real-binary run closes a Tier-1 task.

---

## Intent / Roadmap (Tomorrow)

- **Hard-enforce path** via ADR-G-020's flag-gated vein: A9 (ADR-compliance — permanently fail-open by design) + A14 (tech-debt-ratio downgrade) graduate from dogfood-flag to default at GA-V2.
- **More stacks** in the language-agnostic deriver (the stack matrix grows with provider/environment expansion — Law #2).
- **Deeper signal-based eval** (WM-7 extensions: language-mismatch-penalty, stack-aware coverage) — "measurement-gap ≠ quality-failure" generalized.
- **Cross-verify** (XVER-1): different-provider adversarial verification feeding evaluation as an advisory signal.

---

## Consequences

**(+)** Evaluation is honest across languages, gaming-proof (signal/disk-derived, not agent-name), zero-hardcode, and run-verified for user surfaces. Hollow-DONE is structurally impossible for a Tier-1 task **that carries a valid `Smoke:`** (an absent `Smoke:` is a no-op today — see below). False-NO_GO on doc/audit/non-TS tasks eliminated.

**(−)** Tier-1 gate adds EVALUATE latency (only when `Smoke:` present; absent → no-op, **not fail-closed**) — workers may forget the `Smoke:` line (anchored in worker rules + FIX-phase pressure; fail-closed Smoke-required is SMOKE-REQUIRED-ENFORCE). The coverage-exemption still keeps a transitional agent-allowlist bridge alongside the signal path (COVERAGE-BRIDGE-RETIRE). Hard-enforcement of A9/A14 is roadmap (today the vein is dogfood-flag).

---

## References / Absorbed

- **Absorbs:** ADR-019 + ADR-070 + ADR-079.
- **Cross-ref:** ADR-G-028 (Work Taxonomy — TaskKind×TechStack, the deriver inputs) · ADR-G-020 (enforcement vein A9/A14) · ADR-G-006 (surface-aware routing) · ADR-G-018 (verification protocol channels) · ADR-G-025 (worker-live-trace / observability).
- **Born / MASTER-PLAN:** WM-7 (criteria-deriver) · XVER-1 (cross-verify) · COVERAGE-BRIDGE-RETIRE (retire `COVERAGE_OPTIONAL_AGENTS` once signal-path proven) · SMOKE-REQUIRED-ENFORCE (fail-closed Smoke for Tier-1 vs today's no-op) · zero-hardcode (`feedback_zero_hardcode_live_data`).
- **Memory:** `feedback_proof_of_function_dod` · `feedback_zero_hardcode_live_data`.
