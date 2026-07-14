# DIRECTIVES — SPRINT: U4 FOCUSED-RENDER — persona guidance slices + goCriteria repeat-merge + cost measurement (PCOMP-8 / spec: .analysis/u4-focused-render-spec-2026-07-14.md)

## Goal
Worker prompts currently inject the FULL agent PROMPT.md (4.9-6.4KB) regardless of task intent,
and goCriteria themes repeat ~4.5x across prompt sections. Deliver: (1) intent-matched persona
guidance slices (5-15 lines, author-pinned markers INSIDE PROMPT.md — ADR-G-027 single-source),
rendered with the full body one pointer away; (2) render-level goCriteria repeat-merge;
(3) a real-corpus measurement harness proving the reduction (A6 exam artifact).
Config-gated: `prompt.persona_render` defaults to 'full' — the default flip is a separate
Alperen decision after measurement. Read the spec file FIRST: `.analysis/u4-focused-render-spec-2026-07-14.md`.

## 🔒 BINDING (every task)
- Write ONLY to your own Files list · `.deckent/` runtime is READ-ONLY · never touch `.brain/` or `.tasks/` · no git stash/reset · `npm run build` FORBIDDEN · notes is ONE STRING · self-assessment HONEST.
- ADR-G-027 is binding: no persona/skill/ADR content deletion; full persona stays on disk one pointer away; PROMPT.md remains the single persona source (no guidance field in agent.json).
- No string-throw (typed-error family). No report/summary markdown outside `.analysis/u4-olcum/`.
- Tests hermetic (tmpdir, no spawnSync). `tsc` alone is NOT proof — behavior tests/runs required.

## Task 1: U4 persona-guidance parser and slice selector
- Files: src/core/persona-guidance.ts, tests/core/persona-guidance.test.ts, scripts/validate-guidance.mjs
- Scope: src/core/, tests/core/, scripts/
- Dependencies: none
### Description
New module `src/core/persona-guidance.ts` (pure, no I/O):
`parseGuidanceSections(promptMd)` → readonly map of intent→slice plus an issues list, and
`selectGuidanceSlice(promptMd, intent)` → `{ slice, source: 'intent'|'default'|'full-body' }`.
Marker grammar: `<!-- guidance:<intent>-start -->` … `<!-- guidance:<intent>-end -->` where
<intent> is one of ALL_INTENT_TYPES (src/core/routing-types.ts) or `default`.
Edge policies (spec §3, all MUST be tested): unknown intent key → ignored + reported;
duplicate same-intent markers → first wins + reported; unclosed marker → section ignored +
reported; no markers → source 'full-body'. Never throws on malformed input (fail-soft).
Fallback chain: exact intent → default → full-body. Mirror the marker-extraction idiom of
`extractMarkedSlice` in src/orchestra/adr-selector.ts — do not invent a new grammar style.
Also ship `scripts/validate-guidance.mjs <agent-dir>`: reads the prompt file under <agent-dir>, validates
marker grammar and that every slice is 5-15 non-empty lines and a `default` slice exists;
prints findings; exit code 1 on any violation, 0 when clean. Content tasks use it as their smoke.
### goNogo
- goCriteria: parser + selector behavior-tested for every spec edge (unknown/duplicate/unclosed/no-marker/fallback chain); validator script run-proven on a fixture dir (both pass and fail cases); vitest tests/core/persona-guidance.test.ts green.
- nogo: parser throws on malformed markers NO_GO; validator false-positives on a clean fixture NO_GO.

## Task 2: U4 config knob prompt.persona_render
- Files: src/core/config-types.ts, src/core/config.ts, tests/core/config-persona-render.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
Add `prompt.persona_render?: 'full' | 'guidance'` to config-types (JSDoc: focused persona
render, ADR-G-027 sanctioned condensed+pointer shape; default 'full' = byte-identical legacy).
Validate in config.ts exactly like the existing `adr_render` knob (see the 'full'/'operative'
validation around src/core/config.ts:1097) — invalid value → existing typed config-error path.
Default 'full'. Three-layer config merge must resolve it like sibling prompt.* knobs.
### goNogo
- goCriteria: knob parses + validates + merges (tests: valid both values, invalid rejected typed, default 'full' when absent); vitest tests/core/config-persona-render.test.ts green.
- nogo: default anything other than 'full' NO_GO.

## Task 3: U4 compose guidance mode in buildAgentBlock
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/prompt-god-template-persona.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 1, Task 2
### Description
In guidance mode (`prompt.persona_render === 'guidance'`), buildAgentBlock renders:
agent identity line + the intent-matched guidance slice (selectGuidanceSlice with the task's
`routingMeta.taskDNA.intent.primary`; see the existing intent read at prompt-god-template.ts
~line 1400) + a pointer line `[full persona: <resolved prompt-file path> — read it if this slice
is not enough]`. Source 'full-body' (no markers) → render the full body exactly as today.
Mode 'full' (default) → byte-identical to the current render (pin this with a fixture test).
Do NOT change buildAgentBlock's exported signature; mode + intent arrive via the existing ctx.
Cache-prefix safety (F1-TOK): the agent block must stay deterministic per (agent, intent) and
its segment tier classification must not change — assert the segment kind/tier in the test.
Behavior-precedence and verify-precedence blocks are untouched (they live in the task region).
### goNogo
- goCriteria: guidance-mode fixture shows slice + pointer present and full body ABSENT; full-mode fixture byte-identical to pre-change render; no-marker agent falls back to full body in guidance mode; segment tier unchanged; vitest tests/orchestra/prompt-god-template-persona.test.ts green.
- nogo: buildAgentBlock signature change NO_GO; full-mode byte drift NO_GO.

## Task 4: U4 goCriteria repeat-merge in the god template
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/prompt-gocriteria-dedup.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 3
### Description
A5 measurement: each goCriteria theme surfaces ~4.5x across the composed prompt (GO/NO-GO
section, verify steps, result-contract reminders). First MAP the actual repeat sites in
prompt-god-template.ts (list them in your .plan file), then merge renders so each UNIQUE
criterion text appears at most twice (authoritative GO/NO-GO section + at most one operational
reminder). Do NOT drop any unique criterion content — this is render dedup, not content cut
(ADR-G-027). Pin with a before/after fixture that counts occurrences.
### goNogo
- goCriteria: repeat-site map in .plan; occurrence count per unique criterion at most 2 on the fixture corpus; zero unique-criterion loss (every criterion string still present at least once); vitest tests/orchestra/prompt-gocriteria-dedup.test.ts green.
- nogo: any unique criterion text absent from the composed prompt NO_GO.

## Task 5: U4 prompt cost measurement harness
- Files: scripts/measure-prompt-cost.mjs
- Scope: scripts/, .analysis/u4-olcum/
- Dependencies: Task 3
### Description
`node scripts/measure-prompt-cost.mjs` composes worker prompts for a fixed corpus of at least
8 real task fixtures spanning at least 5 intents (INCLUDE the four sprint-442 event-sourcing
tasks — real texts are in tests/core/word-match-intent-hygiene.test.ts fixtures) in BOTH
persona_render modes, using the real compose path (dist or tsx — real-binary, not a mock).
Output `.analysis/u4-olcum/report.md`: per-prompt and average segment breakdown (persona / ADR /
skills / task-core / rest) in bytes plus totals and percent deltas. The report is the A6 exam
artifact. If the measured ADR segment average exceeds 1KB in guidance mode, state it in the
report as a remaining-gap finding (do NOT patch ADR render in this task).
Smoke: node scripts/measure-prompt-cost.mjs → .analysis/u4-olcum/report.md exists and contains a percent delta table.
### goNogo
- goCriteria: run-proven on the corpus (report.md committed with real numbers); segment breakdown present; both modes compared on identical corpus.
- nogo: mocked compose path NO_GO; corpus under 8 tasks or under 5 intents NO_GO.

## Task 6: U4 guidance content — accessibility-auditor
- Files: src/core/builtins/agents/accessibility-auditor/PROMPT.md
- Scope: src/core/builtins/agents/accessibility-auditor/
- Dependencies: Task 1
### Description
Read this agent's builtin prompt file and its manifest (activation rules + expertise). Author guidance
sections INSIDE that prompt file using the Task-1 marker grammar: one 5-15 line slice per activation
intent this agent actually serves (2-4 intents, from agent.json activation/expertise) plus a
`default` slice. Slices are DISTILLED from the existing body — the operative do/don't rules a
worker needs mid-task; no new rules, no body deletion, markers wrap ADDITIVE section copies at
the end of the file under a `## Guidance Slices` heading. Keep the existing body byte-intact.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/accessibility-auditor → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 7: U4 guidance content — api-builder
- Files: src/core/builtins/agents/api-builder/PROMPT.md
- Scope: src/core/builtins/agents/api-builder/
- Dependencies: Task 1
### Description
Same contract as Task 6 for api-builder.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/api-builder → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 8: U4 guidance content — api-designer
- Files: src/core/builtins/agents/api-designer/PROMPT.md
- Scope: src/core/builtins/agents/api-designer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for api-designer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/api-designer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 9: U4 guidance content — architect
- Files: src/core/builtins/agents/architect/PROMPT.md
- Scope: src/core/builtins/agents/architect/
- Dependencies: Task 1
### Description
Same contract as Task 6 for architect.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/architect → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 10: U4 guidance content — architecture-planner
- Files: src/core/builtins/agents/architecture-planner/PROMPT.md
- Scope: src/core/builtins/agents/architecture-planner/
- Dependencies: Task 1
### Description
Same contract as Task 6 for architecture-planner.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/architecture-planner → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 11: U4 guidance content — bug-fixer
- Files: src/core/builtins/agents/bug-fixer/PROMPT.md
- Scope: src/core/builtins/agents/bug-fixer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for bug-fixer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/bug-fixer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 12: U4 guidance content — ci-guardian
- Files: src/core/builtins/agents/ci-guardian/PROMPT.md
- Scope: src/core/builtins/agents/ci-guardian/
- Dependencies: Task 1
### Description
Same contract as Task 6 for ci-guardian.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/ci-guardian → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 13: U4 guidance content — code-reviewer
- Files: src/core/builtins/agents/code-reviewer/PROMPT.md
- Scope: src/core/builtins/agents/code-reviewer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for code-reviewer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/code-reviewer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 14: U4 guidance content — data-engineer
- Files: src/core/builtins/agents/data-engineer/PROMPT.md
- Scope: src/core/builtins/agents/data-engineer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for data-engineer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/data-engineer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 15: U4 guidance content — devops-engineer
- Files: src/core/builtins/agents/devops-engineer/PROMPT.md
- Scope: src/core/builtins/agents/devops-engineer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for devops-engineer. This is the 442-canary agent: its Docker/CI
guidance must live ONLY in the devops slice so a coordinator task can never receive it.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/devops-engineer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present and Docker-free; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: Docker/pipeline content inside the default slice NO_GO.

## Task 16: U4 guidance content — doc-writer
- Files: src/core/builtins/agents/doc-writer/PROMPT.md
- Scope: src/core/builtins/agents/doc-writer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for doc-writer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/doc-writer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 17: U4 guidance content — frontend-designer
- Files: src/core/builtins/agents/frontend-designer/PROMPT.md
- Scope: src/core/builtins/agents/frontend-designer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for frontend-designer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/frontend-designer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 18: U4 guidance content — i18n-specialist
- Files: src/core/builtins/agents/i18n-specialist/PROMPT.md
- Scope: src/core/builtins/agents/i18n-specialist/
- Dependencies: Task 1
### Description
Same contract as Task 6 for i18n-specialist.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/i18n-specialist → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 19: U4 guidance content — integration-engineer
- Files: src/core/builtins/agents/integration-engineer/PROMPT.md
- Scope: src/core/builtins/agents/integration-engineer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for integration-engineer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/integration-engineer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 20: U4 guidance content — migration-specialist
- Files: src/core/builtins/agents/migration-specialist/PROMPT.md
- Scope: src/core/builtins/agents/migration-specialist/
- Dependencies: Task 1
### Description
Same contract as Task 6 for migration-specialist.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/migration-specialist → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 21: U4 guidance content — observability-engineer
- Files: src/core/builtins/agents/observability-engineer/PROMPT.md
- Scope: src/core/builtins/agents/observability-engineer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for observability-engineer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/observability-engineer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 22: U4 guidance content — performance-analyzer
- Files: src/core/builtins/agents/performance-analyzer/PROMPT.md
- Scope: src/core/builtins/agents/performance-analyzer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for performance-analyzer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/performance-analyzer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 23: U4 guidance content — refactorer
- Files: src/core/builtins/agents/refactorer/PROMPT.md
- Scope: src/core/builtins/agents/refactorer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for refactorer. Note: this persona's "preserve behavior" mandate is
frequently overridden by behavior-precedence — keep the refactor slice honest about that
(the slice must not restate an absolute zero-change rule; reference the task authority).
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/refactorer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 24: U4 guidance content — security-auditor
- Files: src/core/builtins/agents/security-auditor/PROMPT.md
- Scope: src/core/builtins/agents/security-auditor/
- Dependencies: Task 1
### Description
Same contract as Task 6 for security-auditor.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/security-auditor → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 25: U4 guidance content — terminal-ux-engineer
- Files: src/core/builtins/agents/terminal-ux-engineer/PROMPT.md
- Scope: src/core/builtins/agents/terminal-ux-engineer/
- Dependencies: Task 1
### Description
Same contract as Task 6 for terminal-ux-engineer.
Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/terminal-ux-engineer → exit 0.
### goNogo
- goCriteria: validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.
- nogo: any deletion or rewrite of existing body text NO_GO.

## Task 26: U4 integration — flag-on compose e2e plus shadow-sync verification
- Files: tests/orchestra/u4-integration-compose.test.ts, .analysis/u4-olcum/integration-notes.md
- Scope: tests/orchestra/, .analysis/u4-olcum/
- Dependencies: Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18, Task 19, Task 20, Task 21, Task 22, Task 23, Task 24, Task 25
### Description
End-to-end through the production compose path with persona_render='guidance' (hermetic: tmpdir
project fixture): a devops-intent task with devops-engineer gets the devops slice + pointer and
NOT the full body; an implementation-intent coordinator-style task (sprint-442 shape) gets NO
Docker guidance; full mode stays byte-identical. Then the shadow-precedence check: assert via
getAgentPrompt resolution order that a `.deckent/agents/<id>/PROMPT.md` copy SHADOWS the builtin
(use a tmpdir fixture — never write the real `.deckent/`), and document in your result notes
which real sync command propagates builtin guidance to `.deckent` copies (run it read-only/
dry-run if available; if none exists, report the gap honestly as a finding — do not hack one in).
Write `.analysis/u4-olcum/integration-notes.md` with the sync finding.
### goNogo
- goCriteria: guidance-mode e2e assertions green (slice present, full body absent, 442-shape task Docker-free); full-mode byte-identical pin green; shadow-precedence test green; sync finding documented in .analysis/u4-olcum/integration-notes.md; vitest tests/orchestra/u4-integration-compose.test.ts green.
- nogo: writing to the real .deckent/ NO_GO; silent skip of the sync finding NO_GO.
