# ADR-G-012: Plan Tier & Config Customization

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`config.ts` `VALID_MODES` provider-agnostic **plan-mode** set (`config.mode`; each maps to a model-tier strategy — economy/standard/premium/premium_plus) + `autoMigrateOnLoad` legacy-alias map (validated on load; persistent `config-migration.ts` map lacks `unlimited`) → tomorrow=common/standard + custom tier + NL-terminal customize-ALL-settings (ONB-CHAT), every config-knob real-in-code (honesty / zero-hardcode)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-023 (Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri) · **Supersedes:** —
**Crosswalk:** ADR-023 → ADR-G-012

---

## Context

Plan tier names were Claude-specific — `max_plan`, `max5x_plan`, `pro_plan` — meaningless to Codex or Gemini users. A provider-agnostic CLI must not bake one provider's vocabulary into its core config surface. ADR-023 (Sprint 072) generalized the tier names and changed the init wizard from "Select your Claude plan" to "Select your plan," keeping legacy names as backward-compatible aliases.

A code-verification note corrected two details. **(1) Terminology:** these are **plan modes** (`config.mode`, type `PlanMode`), NOT *model tiers*. The canonical plan-mode set is `VALID_MODES = ['performance', 'balanced', 'economic', 'api']` (`src/core/config.ts`); each plan mode maps to a **model-tier strategy** (`brain_tier`/`worker_tier`/`min_tier`/`max_tier` ∈ `economy`/`standard`/`premium`/`premium_plus`, via `mode-presets.ts`). "Plan mode" and "model tier" are distinct axes — this ADR governs the plan-mode axis. **(2)** `unlimited` was **not** preserved as a standalone mode — it is remapped to `api`.

The 2026-06-30 review expanded the decision's scope from "rename tiers" to "**config customization as a first-class, honest surface**": provider-agnostic standard tiers PLUS a user-defined custom tier, customizable conversationally (NL-terminal / ONB-CHAT), under the hard rule that **every config-knob is real-in-code** — no dormant settings that look configurable but do nothing (DORMANT-2 honesty, zero-hardcode).

## Decision (Today)

### 1. Provider-agnostic plan-mode names
The canonical **plan-mode** set (`config.mode`) is `VALID_MODES = ['performance', 'balanced', 'economic', 'api']` (`src/core/config.ts`) — each maps to a model-tier strategy, it is not a tier itself:

| Plan mode | Meaning (→ model-tier strategy) |
|---|---|
| `performance` | highest quality, highest cost (was `max_plan`) |
| `balanced` | quality/cost balance (was `max5x_plan`) |
| `economic` | low cost, basic tasks (was `pro_plan`) |
| `api` | metered API usage (was `unlimited`, remapped — no standalone `unlimited` tier) |

### 2. Backward-compatible migration
`autoMigrateOnLoad` (`src/core/config.ts`) recognizes the legacy names as aliases (`max_plan→performance`, `max5x_plan→balanced`, `pro_plan→economic`, `unlimited→api`) and upgrades on read. **Gap:** the *persistent* migration map (`src/core/config-migration.ts`) covers only `max_plan`/`max5x_plan`/`pro_plan` — **not `unlimited`** — so `unlimited` is remapped at runtime but not durably rewritten to disk (CONFIG-MIGRATE-UNLIMITED). The init wizard reads "Select your plan" (provider-neutral). All docs use the new names.

### 3. Honest config surface (seed)
Tier selection is real-in-code: a chosen tier maps to actual model-equivalence behavior via the provider layer (ADR-G-008), not a cosmetic label. This is the seed of the broader config-customization honesty rule below.

## Intent / Roadmap (Tomorrow)

- **Common/standard + custom tiers.** Beyond the standard provider-agnostic set, users define their **own custom tier** (their own quality/cost/model mapping), so the tier system is a template, not a fixed enum — consistent for solo users and configurable for enterprises.
- **NL-terminal customize-ALL-settings (ONB-CHAT).** Every setting — tier included — is customizable conversationally from the native terminal (CONFIG-CUSTOMIZE / ONB-CHAT), prioritizing ease + consistency over hand-editing JSON. This is part of the terminal-as-primary-surface direction.
- **Every config-knob real-in-code (honesty / zero-hardcode).** A binding constraint: a setting that appears in config MUST have a genuine, live effect in code. No dormant/cosmetic knobs (DORMANT-2 honesty); no hardcoded value masquerading as configurable (zero-hardcode). Config customization is only trustworthy if every knob is wired.

## Consequences

**(+)** Provider-agnostic terminology serves Codex / Gemini / any-provider users equally; `autoMigrateOnLoad` makes the rename invisible to existing users; reframing as ADR-G binds tier/config customization to the honesty + zero-hardcode laws so a knob can never become a lie; the custom-tier + NL-customize direction makes config a first-class product surface, not an internal file.

**(−)** Today only the standard plan-mode set is live — `validateConfig` **rejects** any non-canonical `config.mode`, so custom modes + NL-terminal customize-all are roadmap (CONFIG-CUSTOMIZE / CFG-1), and a stale "custom mode fallback" line in `docs/reference/config-reference.md` must be corrected. The every-knob-real rule (DORMANT-2 honesty) is a standing audit obligation that regresses if not enforced continuously; the plan-mode→model-tier semantics depend on the provider layer (ADR-G-008), so the two evolve together.

## References / Absorbed

- **Absorbs:** ADR-023 (Plan Tier Generalizasyonu — provider-agnostic tier names, wizard rename, alias migration).
- **Implementation:** `src/core/config.ts` (`VALID_MODES`, `autoMigrateOnLoad`, legacy-alias map).
- **Born work-items:** CONFIG-CUSTOMIZE (common/standard + custom mode/tier + NL-terminal customize-ALL via ONB-CHAT + ease/consistency + every-knob-real-in-code), CFG-1, DORMANT-2 (config-knob honesty audit), CONFIG-MIGRATE-UNLIMITED (add `unlimited→api` to the persistent `config-migration.ts` map), CONFIG-REF-CUSTOM-FIX (correct the stale "custom mode fallback" in `config-reference.md`).
- **Cross-ref:** ADR-G-008 (Provider Abstraction, Fleet & Native-Usage — tier→model-equivalence resolution; original merge-candidate 066/077), ADR-G-001 (Layered Config & Scope), ADR-G-019 (ADR-AUTHORING-STD today+tomorrow framing), ADR-G-030 (Consent / Onboarding — ONB-CHAT NL-setup).
- **Direction:** owner-approved terminal-as-primary-surface pivot; `.analysis/adr-review-crosswalk.md` row 023.
