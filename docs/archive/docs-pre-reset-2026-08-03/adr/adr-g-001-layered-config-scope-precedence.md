# ADR-G-001: Layered Config & Scope Precedence

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`config.ts` `deepMerge` layered load (defaults→global→project→env, last-wins) + `autoMigrateOnLoad`, structural-deterministic → tomorrow=scope-aware resolution bound to global-install+project topology, config-precedence mirrors the ADR-G-019 G>U>D analogue
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-004 (Layered Config Merge) · **Supersedes:** —
**Crosswalk:** ADR-004 → ADR-G-001

---

## Context

deckent runs in three overlapping configuration realities at once: a machine-wide default a user sets once (plan tier, language), a per-project override checked in beside a repo, and a per-invocation override for CI / one-off runs. ADR-004 (2026-04-16) fixed the precedence: hardcoded defaults form the floor, `~/.deckent/config.json` (global) layers on top, `.deckent/config.json` (project) on top of that, and `DECKENT_*` environment variables win last. Documented originally as "3-layer" (three *file* layers), the live runtime adds the env-override layer, making **four effective layers**. The merge is a `deepMerge` (`src/core/config.ts`): nested objects merge, arrays are replaced (not concatenated), and `undefined` values are skipped so a partial upper layer never erases a lower one.

That precedence works and is live-proven, but it was framed as an internal config detail. The 2026-06-30 ADR review reframed it as a **global constitution-level law**: config layering is the runtime sibling of the ADR taxonomy's own G>U>D precedence (ADR-G-019), and it must scale cleanly onto the global-install + project-scope topology deckent is moving toward.

## Decision (Today)

Config loads in **layered precedence — four effective layers, last wins**:

```
defaults (hardcoded floor)
  → ~/.deckent/config.json        (global, user-machine-wide)
    → .deckent/config.json        (project, per-repo)
      → DECKENT_* env overrides   (per-invocation; env always wins)
```

- Merge is `deepMerge` (`src/core/config.ts`): nested objects deep-merge; **arrays are replaced, not merged**; `undefined` values are skipped (a sparse upper layer never nulls a lower one).
- Env overrides apply last via a **curated `DECKENT_*` allowlist** (today: `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`, `DECKENT_MODE`, `DECKENT_LANGUAGE`, `DECKENT_STYLE`) — the CI / one-off escape hatch. It is a *specific curated set*, **not** an arbitrary `DECKENT_*`→any-key mapping; keys documented elsewhere but **unwired** (e.g. `DECKENT_MAX_WORKERS`, `DECKENT_MODEL`) are tracked in CONFIG-ENV-SYNC.
- `autoMigrateOnLoad` upgrades legacy **project** config shapes on read (`migrateConfig(projectConfigPath)`); the global `~/.deckent/config.json` is read + merged but **not** auto-migrated today (tracked: CONFIG-ENV-SYNC / global-migrate).
- The architecture doc's "Config Layers" section (Layer 4 — Environment Variables) is the human-facing mirror of this loader.

This is a structural, deterministic guarantee for the **runtime effective config**: every effective-config consumer goes through `loadConfig` (the layered path). Raw/admin helpers (`readGlobalConfig`, `loadGlobalConfig`) intentionally read a single layer by design and are *not* effective-config consumers. **Caching caveat:** precedence is exact on cold/forced load, but a long-running process caches keyed on the *project* config mtime only — so a global-config or env-var change is re-read only via `clearConfigCache` / `DECKENT_CONFIG_RELOAD=1` / `force` / a project-mtime change (CONFIG-CACHE-GLOBAL).

## Intent / Roadmap (Tomorrow)

- **Scope-aware resolution tied to install topology.** As deckent ships as a global install + project-scope product, the two file layers gain explicit identity: `~/.deckent/config.json` is the **user-global** scope and `.deckent/config.json` is the **user-project** scope. Config resolution becomes scope-addressable, not merely precedence-ordered.
- **Config precedence mirrors ADR G>U>D (roadmap).** The config layering is the operational analogue of the ADR-G-019 precedence: publisher defaults (floor) < user-global < user-project for *additive/tightening* keys, while any publisher-locked invariant (an ADR-G-backed setting) *must not* be loosened by a lower-priority file. **Today the merge is pure last-wins `deepMerge` with no invariant-lock — a project layer CAN currently override a global setting; the lock is roadmap (CONFIG-LOCK), not yet enforced.** The two precedence systems (config-merge and ADR-authority) are kept conceptually aligned so a user reasons about both the same way.
- **Tenant/scope extension.** Multi-tenant + global-install layering (per-host, per-org) extends the same `deepMerge` spine rather than introducing a parallel mechanism.

## Consequences

**(+)** One deterministic, well-understood merge spine covers machine defaults, project overrides, and CI escape hatches; `undefined`-skip + array-replace semantics make partial layers safe and predictable; `autoMigrateOnLoad` keeps old configs forward-compatible; reframing as ADR-G ties config precedence to the project's governance precedence so the two never drift.

**(−)** Array-replace (not merge) is a deliberate sharp edge — a project layer that sets an array fully replaces the global one, which can surprise; the scope-aware + G>U>D-analogue binding is roadmap (today the layers are precedence-ordered but not yet formally scope-addressed); env-override breadth (`DECKENT_*`) must stay documented so a CI override is never silently shadowed.

## References / Absorbed

- **Absorbs:** ADR-004 (Layered Config Merge — defaults→global→project→env, `deepMerge` semantics, 4-effective-layer clarification).
- **Implementation:** `src/core/config.ts` (`deepMerge`, env-override layer, `autoMigrateOnLoad`); `docs/architecture/architecture.md` "Config Layers" (Layer 4 — Environment Variables).
- **Precedence sibling:** ADR-G-019 (ADR Governance & 4-Layer Taxonomy — the G>U>D precedence this config layering mirrors).
- **Cross-ref:** ADR-G-012 (Plan Tier & Config Customization — every config-knob real-in-code), ADR-G-005 (Secret File System — shared global<project scope spine).
- **Born work-items:** CONFIG-ENV-SYNC (curate-vs-expand the env-layer set incl. `DECKENT_MAX_WORKERS`/`DECKENT_MODEL` + sync the `architecture.md` Config-Layers mirror), CONFIG-CACHE-GLOBAL (cache-key incl. global-mtime + env-snapshot for long-running correctness), CONFIG-LOCK (G>U>D publisher-invariant-lock → ADR-G-019/G-020).
- **Direction:** global-install + project-scope topology (MASTER-PLAN ADR-LAYER / install-wiring); `.analysis/adr-review-crosswalk.md` row 004.
