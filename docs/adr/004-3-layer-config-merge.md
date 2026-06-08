# ADR-004: 3-Layer Config Merge

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Config loads in 3 layers: hardcoded defaults → `~/.deckent/config.json` → `.deckent/config.json`.
**Context:** Users need global defaults (plan type, language) and per-project overrides.
**Consequence:** `deepMerge` function handles nested object merge. Arrays are replaced, not merged. `undefined` values are skipped.

**Note:** This ADR records the original **3-layer** decision. At runtime an additional **environment-variable override layer** sits on top (e.g. `DECKENT_BRAIN_PROVIDER`, `DECKENT_MAX_WORKERS`), so the effective precedence is: defaults → `~/.deckent/config.json` → `.deckent/config.json` → **env overrides** (env wins). See `src/core/config.ts` and the "Config Layers" section of `docs/architecture/architecture.md` (Layer 4 — Environment Variables). Behavior unchanged; documentation alignment only.
