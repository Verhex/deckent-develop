# ADR-004: Layered Config Merge (defaults → global → project → env)

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Config loads in **layered precedence (4 effective layers, last wins):** hardcoded defaults → `~/.deckent/config.json` (global) → `.deckent/config.json` (project) → **environment-variable overrides** (env wins). Originally specified as 3 *file* layers; the runtime env-override layer makes 4 effective layers.
**Context:** Users need global defaults (plan type, language), per-project overrides, and per-invocation env overrides (CI / one-off runs).
**Consequence:** `deepMerge` function handles nested object merge. Arrays are replaced, not merged. `undefined` values are skipped. Env overrides apply last (`DECKENT_*` vars).

**Note:** This ADR records the original **3-layer** decision. At runtime an additional **environment-variable override layer** sits on top (e.g. `DECKENT_BRAIN_PROVIDER`, `DECKENT_MAX_WORKERS`), so the effective precedence is: defaults → `~/.deckent/config.json` → `.deckent/config.json` → **env overrides** (env wins). See `src/core/config.ts` and the "Config Layers" section of `docs/architecture/architecture.md` (Layer 4 — Environment Variables). Behavior unchanged; documentation alignment only.

---

**Amendment log:** 2026-06-11 — Başlık + Decision "3-Layer" → **"Layered (4 effective: defaults → global → project → env)"** netleştirildi (Alperen onayı). Davranış değişmedi; env-override katmanı (config.ts:1342) zaten canlı. md+db senkron.
