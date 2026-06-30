# ADR-G-010: Output, Terminal-UX & Brand

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=rich multi-section output modules (`sprint-retro-writer.ts` / `sprint-docs-updater.ts`) + `NO_COLOR` honored + fixed `KRAKEN_ASCII` brand const (`splash.ts`) → tomorrow=terminal concise/live (TERM-LIVE) + dashboard rich-detail (ADR-G-033) + `output_splash` real-gate-or-remove (ADR-021-W)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-020 (Rich Sprint Output — multi-section), ADR-021 (Kraken ASCII Brand Identity) · **Supersedes:** —
**Crosswalk:** ADR-020 + ADR-021 → ADR-G-010

---

## Context

First impressions and run-readability are product surfaces, not internal plumbing. Two early decisions converged here:

- **ADR-020 (Rich Sprint Output):** sprint output was a single-line metric — a user could not see how many tasks completed, which files changed, or what was learned. The fix: rich, multi-section output with ANSI color + `NO_COLOR` support.
- **ADR-021 (Kraken ASCII Brand Identity):** deckent had no visual identity; in a CLI tool the first impression matters. The fix: a Kraken ASCII mascot + brand palette. The Sprint-281 re-audit classified this **user-product** (brand = the product's first impression).

Both are **ADR-G** (Global / Constitution): they define how *every user* reads deckent's output and sees its brand on every surface. The 2026-06-30 review merged them as "Output, Terminal-UX & Brand" and aligned them with the terminal-center pivot (terminal = concise/live, dashboard = rich detail).

> Note: ADR-083 ("Output & Terminal UX") was flagged a merge-candidate for ADR-020; the final taxonomy routed ADR-083 into ADR-G-033 (Dashboard, `083D`) and ADR-G-034 (Native Agentic Terminal). ADR-G-010 therefore absorbs only ADR-020 + ADR-021 and cross-references those two for the surface evolution.

---

## Decision (Today)

### A. Rich multi-section output

Sprint output is **rich + multi-section** (not a single-line metric), with ANSI color and **`NO_COLOR`** env-var support for CI-friendly plain text. The original "7-section" list is **stale**; the concrete current structure is:

```xml
<output-structure>
  <doc path=".brain/sprints/RETRO.md" writer="src/orchestra/sprint-retro-writer.ts">
    5 sections: Summary · Highlights · Issues · Metrics · Learnings
    (+ Quality Dimensions subsection). Highlights/Issues emitted only when non-empty.
  </doc>
  <doc path=".brain/sprints/sprint-NNN.md" writer="src/orchestra/sprint-docs-updater.ts">
    task-oriented log: "## Task {id}: {title}" → "### Description"
    (not the same structure as the retro).
  </doc>
  <canonical>the modules above + `deckent retro` / `deckent history` output.</canonical>
</output-structure>
```

### B. Kraken brand identity

```xml
<brand-identity source="src/cli/helpers/splash.ts">
  <ascii const="KRAKEN_ASCII" generated="false"/>   <!-- fixed const, not runtime-generated -->
  <color name="TEAL"      body     ansi="\x1b[38;2;77;184;164m"   hex="#4DB8A4"/>
  <color name="BOLD_GOLD" wordmark ansi="\x1b[1;38;2;196;168;85m" hex="#C4A855"/>  <!-- "DECKENT" -->
  <tagline dim="true">AI Agent Orchestrator</tagline>             <!-- + version, dim -->
  <no-color>NOT skipped — showSplash() returns the PLAIN-TEXT splash
            (Kraken + "DECKENT v<ver>" + tagline, no ANSI). No CI env-var handling.</no-color>
</brand-identity>
```

### C. Visibility gate (known dormant)

The splash is meant to be shown when `config.output_splash` is true, via `showSplashIfEnabled`. **Today that gated wrapper is zero-caller:** `sprint-phases.ts` calls `showSplash` directly only on the **first sprint** (`sprint.number === 1`), gateless. So `output_splash` is a **no-op knob** — toggling it changes nothing. Tracked as **ADR-021-W** (a textbook "settings feature lost" instance).

---

## Intent / Roadmap (Tomorrow)

- **Surface split (pivot-aligned):** **terminal = concise / live summary** — the TERM-LIVE run-status footer (what's running / where / approval? / next / risk; fed by ADR-G-025 worker-live-trace); **dashboard = rich detail** — the full per-task results, changes, and metrics move to ADR-G-033 (Dashboard observability surface). The rich-multi-section content migrates to the dashboard; the terminal carries a tight live status, not a wall of text.
- **`output_splash` real-gate-or-remove (ADR-021-W / DORMANT-2):** either wire `sprint-phases` to `showSplashIfEnabled` (a real gate, with the dashboard ConfigPage surface aligned) or remove the knob from the schema — settings honesty (no no-op config knobs).
- **Brand carried cross-surface:** the Kraken identity extends consistently to dashboard / native terminal / desktop (one brand, all surfaces).

---

## Consequences

**(+)** Users get the full picture of a run, brand recognition from the first invocation, and clean CI output via `NO_COLOR`. The merge unifies output + brand under one terminal-UX law. The today+tomorrow split keeps the pivot (terminal concise, dashboard rich) explicit so agents and contributors build toward it.

**(−)** `output_splash` is a **no-op knob today** (dormant config-honesty debt — ADR-021-W); the concrete section set already drifted from the original "7-section" text (canonical is now the modules, not a count). The terminal/dashboard split is roadmap — today the rich output still lands largely in the terminal/files, not yet routed to the dashboard.

---

## References / Absorbed

- **Absorbs:** ADR-020 (Rich Sprint Output — multi-section), ADR-021 (Kraken ASCII Brand Identity).
- **Surface partners:** ADR-G-033 (Dashboard — rich detail; absorbed `083D`), ADR-G-034 (Native Agentic Terminal — absorbed ADR-083 REPL-UX), ADR-G-025 (Process Resilience & Live Observability — TERM-LIVE / worker-live-trace).
- **Parity:** ADR-G-011 (Surface Parity & Thin-Wrapper — output consistent across CLI/MCP/terminal).
- **Born work-items:** ADR-021-W (`output_splash` real-gate-or-remove = DORMANT-2, MASTER-PLAN P1), TERM-LIVE (live run-status footer, P0).
- **Direction:** `.analysis/adr-review-crosswalk.md` (rows 020/021 → ADR-G-010), `.analysis/hermes-vs-deckent-direction-decisions.md` (terminal-center pivot).
