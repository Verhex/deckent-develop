# ADR-G-021: Self-Modifying Detection — Dogfood ↔ User-Project Discrimination

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** runtime detection + rollback-guard (protects deckent's own git tree)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-039 (Self-Modifying Task Detection)
**Crosswalk:** ADR-039 → ADR-G-021

> **Note (Alperen, 2026-06-30):** "Bu ADR'de düzenlenmeli — kodumuz buna dayanıyor; gayet detaylı ve düzgün ele alacağız." This is a safety law the codebase depends on; it must be handled in detail and correctly.

---

## Context

deckent runs in two fundamentally different modes: **dogfood** (deckent modifying its OWN source — runtime cache invalidation, MCP-restart, tsc-rebuild matter) and **user-project** (deckent orchestrating a user's Rails/React/Go/… project — the user's code never affects deckent's runtime). Conflating them caused the Sprint-138 Layer-4 class of failure (Brain ran stale pre-build cache after a worker rewrote `src/orchestra/`). ADR-039 formalized detection; the 2026-06-30 review elevates it to a global safety law and connects it to global-install discrimination + ROLE-GUARD.

---

## Decision (Today)

```xml
<self-modify-detection>
  <detect>detectDeckentRepo(root) = `.deckent/` exists AND package.json name === 'deckent'
    (both required; the name is the exact discriminator). isSelfModifying(task) =
    detectDeckentRepo AND task scope touches a deckent source pattern (src/core, src/orchestra,
    src/agents, src/cli, src/mcp, src/providers, src/api, src/monitor, src/dashboard,
    .deckent/agents, .deckent/skills).</detect>
  <policy>
    P1 self-modifying tasks run SEQUENTIAL (parallel tsc-rebuild race avoided).
    P2 self-modifying process → Wave-0 `tsc && vitest` health gate (design).
    P3 post-task auto-checkpoint (MCP-restart resume).
    P4 USER PROJECTS = NO-OP (detectDeckentRepo=false → zero overhead).
  </policy>
  <live-value>the proven, live consumer is the ROLLBACK-GUARD: detectDeckentRepo gates
    rollback.ts at BOTH ends — createSafetyPoint becomes a no-op AND rollbackToSafetyPoint's
    `git reset --hard` is skipped on deckent's own tree, so deckent can never wipe its own
    uncommitted source (self-git-mutation protection; worker-rollback + the self-modifying
    write-guard share the same gate). User projects get full rollback semantics
    (detectDeckentRepo=false). P1–P3 are largely dormant; in practice deckent-dev
    self-modifying runs go through the manual dispatch path (ADR-D-007).</live-value>
</self-modify-detection>
```

---

## Intent / Roadmap (Tomorrow)

- **P1–P3 wire OR formalize-the-reality (SELFMOD-W).** Either *wire* the dormant policies into a first-class **self-modify execution lane** — P1 sequential dispatch (no parallel `tsc`-rebuild race on deckent's own `dist/`), P2 a Wave-0 `tsc && vitest` health-gate that must pass before any self-modifying worker spawns, P3 post-task auto-checkpoint so an MCP-restart / runtime-cache-invalidation resumes losslessly — OR *formally adopt* the ADR-D-007 manual-dispatch path as the sanctioned dogfood self-modify route. The bar is **no silent dormancy**: the chosen reality is documented, tested, and enforced, never left implicit.
- **Global-install discrimination (every-environment law).** With deckent installed **globally** and orchestrating N user projects concurrently — macOS · Linux · Windows-native · WSL — the dogfood↔user decision is made per-process, per-project, potentially millions of times. `detectDeckentRepo` resolves per project-root (never process-global), and the `package.json name === 'deckent'` discriminator is hardened against rename/fork edge-cases with a stronger publisher-signed marker. A misclassification in *either* direction is a safety incident (self-protection skipped on the real repo, or a false-guard/overhead imposed on a user project) — so the detector is treated as a **security boundary**, not a convenience check.
- **Unify with ROLE-GUARD (ADR-G-020).** Self-git-mutation protection (never `reset --hard` deckent's own tree), the Brain-never-codes orchestrator boundary, and self-modify detection are one **self-protection family** — converged at the tool/process layer: pid/role + repo-detection enforced together, structurally (not prompt-trusted). ROLE-GUARD becomes the single enforcement point where the orchestrator process is *unable* to mutate deckent's own source/git regardless of what any LLM emits.
- **Compose with multi-project isolation (ADR-G-017).** The dogfood↔user boundary shares the project-boundary substrate with the four isolation layers (directory + cred-encryption + scope-boundary + config-boundary); the discrimination and the isolation guards compose so a worker in user-project-A can never reach deckent's core, its git, or another tenant's tree.

---

## Consequences

**(+)** deckent protects its own source/git during dogfood and imposes zero overhead on user projects (P4 no-op). The rollback-guard is a real, working defense against self-git-mutation. The discrimination scales to global-install + many user projects.

**(−)** P1–P3 are dormant (the automated sequential-wave/checkpoint didn't land; manual-dispatch covers it) — born work-item to wire-or-formalize. `package.json name` is a heuristic (a fork could rename — accepted edge case). ROLE-GUARD pid/process enforcement is roadmap.

---

## References / Absorbed

- **Absorbs:** ADR-039.
- **Cross-ref:** ADR-G-020 (ROLE-GUARD / authority) · ADR-D-007 (manual dispatch — the live dogfood path) · ADR-G-017 (multi-project isolation) · ADR-G-025 (self-modify + rebuild/restart on crash-recovery).
- **Born / MASTER-PLAN:** ROLE-GUARD · P1-P3-wire-or-formalize · global-install-discrimination.
- **Memory:** `project_deckent_self_git_mutation_bug`.
