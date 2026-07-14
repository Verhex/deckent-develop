# U4 SPEC — Focused Persona Render + Prompt Repeat-Merge + Cost Measurement
> Format: docs/templates/spec-template.md (PCOMP-8 U3). Execution: dogfood sprint (A5 decision, Alperen-approved).

## 1 · PURPOSE
Worker prompts inject the FULL agent PROMPT.md body (4.9-6.4KB measured) regardless of task
intent — sprint-442's coordinator tasks would have received the devops persona's full Docker
guidance. Additionally, goCriteria themes repeat ~4.5× across prompt sections (A5 measurement).
U4 delivers: (a) intent-matched persona guidance slices (5-15 lines) rendered instead of the
full body, with the full body one pointer away on disk; (b) render-level repeat-merge of
goCriteria themes; (c) a real-corpus measurement harness proving the reduction with segment
breakdown (persona / ADR / skills / task-core). A5 target: ≈ −28-32% total prompt bytes; the
persona share alone ≈ −15-18%. The ADR clause piece may already be partially live (PCOMP-W4
operative render) — the harness MEASURES it first; further ADR tightening happens only if the
measured ADR segment still exceeds ~1KB avg (evidence-driven, no reinvention).

**Deviation from A5 wording (reason: ADR-G-027):** A5 said guidance sections go "into the
manifest". ADR-G-027 fixes agent-prompt single-source = PROMPT.md. Guidance slices therefore
live INSIDE PROMPT.md as author-pinned marked sections (same idiom as ADR operative markers),
NOT as a second content source in agent.json. G-027's sanctioned-bound shape is honored:
condensed render + `[full persona: <path>]` pointer, full source on disk in worker read scope
— no truncation of WHAT, optimization of HOW.

## 2 · FILE SCOPE
- **Write:**
  - new: `src/core/persona-guidance.ts` (marked-section parser + slice selector)
  - new: `tests/core/persona-guidance.test.ts`
  - `src/core/config-types.ts`, `src/core/config.ts` (knob `prompt.persona_render: 'full'|'guidance'`, default 'full')
  - `src/orchestra/prompt-god-template.ts` (buildAgentBlock guidance mode; goCriteria repeat-merge)
  - `tests/orchestra/prompt-god-template*.test.ts` (mode + dedup pins)
  - `src/core/builtins/agents/<id>/PROMPT.md` × 20 (guidance sections per activation intent + default)
  - new: `scripts/measure-prompt-cost.mjs` + `.analysis/u4-olcum/` reports
- **Read-critical:** `docs/adr/adr-g-027-prompt-lifecycle-worker-context.md` (single-source +
  no-truncation contract) · `src/core/agent-pool.ts` getAgentPrompt (resolution precedence:
  .deckent shadows builtins → integration MUST sync/verify) · `src/orchestra/adr-selector.ts`
  (marker-extraction idiom to mirror) · `src/core/routing-types.ts` ALL_INTENT_TYPES (guidance keys).
- **Separate-test decision:** together (each code task carries its mirror test; content tasks
  are verified by the parser test corpus + integration compose).

## 3 · EDGE POLICIES
- Marker grammar: `<!-- guidance:<intent>-start -->` … `<!-- guidance:<intent>-end -->`, plus
  `guidance:default`. Unknown intent key in a PROMPT.md → ignored + listed in parser result
  (no throw). Duplicate same-intent markers → FIRST wins, rest reported. Unclosed marker →
  that section ignored + reported (fail-soft; the full-body fallback keeps the worker whole).
- No markers present in PROMPT.md (or mode='full') → render the full body EXACTLY as today
  (byte-identical legacy path; default config keeps production unchanged until flip).
- Intent 'unknown' or missing taskDNA → 'default' slice; no default section → full body.
- Concurrency: 19 content tasks each write a DIFFERENT builtin PROMPT.md — no lock contention;
  god-template is written by exactly two tasks sequenced by dependency (compose → dedup).
- Legacy: `.deckent/agents/<id>/PROMPT.md` copies SHADOW builtins (getAgentPrompt step 1).
  Integration task must run the real sync path and verify shadowed copies carry the markers;
  if sync does not propagate → NO_GO with the gap named (no silent pass).
- Error path: parser never throws on malformed markers (fail-soft + report). Config validation
  rejects values outside 'full'|'guidance' with the existing typed config-error family.

## 4 · RETURN/MUTATION SEMANTICS
- `parseGuidanceSections(promptMd)` → readonly map + issues list; pure, no I/O.
- `selectGuidanceSlice(promptMd, intent)` → `{ slice, source: 'intent'|'default'|'full-body' }`;
  never mutates input; deterministic per (content, intent) — cache-prefix safety: the agent
  block stays deterministic per (agent, intent) pair; segment tier classification (T0/T1)
  must remain unchanged (F1-TOK: never split the shared Skills→Agent→ADR prefix mid-region).
- buildAgentBlock keeps its existing signature; mode arrives via ctx/config, not a new
  positional param explosion. Existing export signatures unchanged.
- Behavior-precedence / verify-precedence notes (which override persona) are UNAFFECTED —
  they attach to the task region, not the agent block.

## 5 · PROOF (behavior run MANDATORY)
- Unit: parser grammar (all §3 edges), slice selection fallback chain, config validation,
  compose-mode pins (guidance mode: identity + slice + pointer present, full body ABSENT;
  full mode: byte-identical to pre-U4 render for a pinned fixture).
- Corpus measurement (real-binary run): `node scripts/measure-prompt-cost.mjs` composes worker
  prompts for ≥8 real task fixtures spanning ≥5 intents (incl. the four sprint-442 tasks) in
  both modes; writes `.analysis/u4-olcum/report.md` with per-segment bytes and totals.
  Acceptance: persona segment −≥60% on guidance-covered agents AND total prompt −≥15% vs
  same-corpus 'full' baseline; report archived (A6 exam artifact for Alperen scoring).
- Integration smoke: one real compose through the production path with the flag ON
  (guidance slice + pointer in the emitted prompt; `tsc` alone is NOT proof).
- goCriteria dedup: pinned before/after fixture showing theme count 4.5→≤2 on the measured
  corpus without dropping any UNIQUE criterion text.

## 6 · PROHIBITIONS (fixed block)
- Do NOT produce report/summary/verification markdown files beyond `.analysis/u4-olcum/`
  measurement artifacts (proof = tests + run output).
- goNogo may name only file paths genuinely written by THIS task; example/invented paths forbidden.
- No commas/separators in task titles. No string-throw; typed-error family only.
- Existing export signatures do NOT change unless the task explicitly demands it.
- ADR constraints binding; conflicts → amendment-proposal note instead of the task.
  Specifically: ADR-G-027 — no persona/skill/ADR content deletion; full persona stays one
  pointer away on disk; PROMPT.md remains the single persona source (no manifest guidance field).
- Flag stays default-'full' in this sprint; the default flip to 'guidance' is a SEPARATE
  Alperen decision after the measurement report (quality-bar: flag-gate → verify → default).

## 7 · SIZE
Heavy work → micro-task decomposition (law 8): ~25 tasks / 8 parallel workers.
Core mechanism 4 (parser+tests, config knob, compose mode, goCriteria dedup) → content 19
(one builtin agent PROMPT.md each, guidance sections for that agent's activation intents +
default, distilled from its existing body — no invented rules) → measurement harness 1 →
integration+sync-verify 1. Dependencies: content ∥ after parser; compose after parser+config;
dedup after compose (same-file sequencing); integration last.
