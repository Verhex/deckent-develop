# U4-026 Integration Notes — guidance-mode e2e (sprint-443 Task-26, delivered in sprint-444 as 444-006)

Companion to `.analysis/u4-olcum/report.md` (443-005 cost measurement). This note documents the
integration suite `tests/orchestra/u4-integration-compose.test.ts` and the shadow-precedence /
sync-propagation contract it pins.

## 1 · What the suite proves (4 e2e assertions, all green)

Run: `npx vitest run tests/orchestra/u4-integration-compose.test.ts` — 5 tests (assertion 3 is
split into 3a/3b, both required by the "post-F1 contract" clause), 0 failures.

Unlike `tests/orchestra/prompt-god-template-persona.test.ts` (synthetic-persona unit coverage of
the render-mode switch), this suite drives the REAL production compose path —
`buildTaskPromptSegmented` / `buildTaskPrompt` (`src/orchestra/prompt-god-template.ts`) — over
REAL builtin `PROMPT.md` content read from disk at test time:

1. **devops-intent + devops-engineer, guidance mode** — the real
   `src/core/builtins/agents/devops-engineer/PROMPT.md` renders its `guidance:devops` slice plus
   the `[full persona: .deckent/agents/devops-engineer/PROMPT.md — read it if this slice is not
   enough]` pointer; full-body-only content (the Dockerfile sample, "Blue-Green Deployment",
   "Canary Deployment") and other intents' slices (security's "Rotate secrets on a schedule") are
   absent.
2. **implementation-intent coordinator-style task (sprint-442 442-003 shape) → NO Docker
   guidance** — the real fixture shape is `scripts/measure-prompt-cost.mjs`'s embedded corpus
   (`FIXTURES_B64`, decoded): task 442-003 = "Hermetik coordinator test-ailesi alti senaryo"
   (hermetic tests for `src/orchestra/run-flow-coordinator.ts`), `assignedAgent: 'refactorer'`,
   intent `implementation`. `refactorer`'s real PROMPT.md carries no `implementation` guidance key
   (only `default`/`refactor`/`architecture`), so guidance mode falls back to `default` — and since
   refactorer's persona contains no Docker content anywhere, the composed prompt is
   Docker-guidance-free by construction.
3. **Full-mode pin (post-F1 contract)** — both directions: a marker-free persona renders
   byte-identical (no pointer appended); a marker-carrying persona (devops-engineer, real file)
   renders `personaCoreBody(agentPrompt)` + the appendix pointer, with non-guidance-block content
   (the Dockerfile sample, "Blue-Green Deployment") still present since F1 only strips the marked
   slice spans, not the rest of the document.
4. **Shadow-precedence** — a hermetic tmpdir project root with a distinct
   `.deckent/agents/devops-engineer/PROMPT.md` (`SHADOW-DEVOPS-SLICE-4471` marker text, absent from
   the builtin). `getAgentPrompt('devops-engineer', tmpRoot)` resolves `source: 'prompt-md'`,
   `degraded: false`, `content` byte-equal to the shadow (not the builtin), `resolvedFrom` pointing
   at the tmp shadow path — then that resolved content is fed back through
   `buildTaskPromptSegmented` in guidance mode, confirming the SHADOW's own slice (not the
   builtin's `pin action versions by commit SHA` text) is what actually reaches the composed
   worker prompt.

## 2 · getAgentPrompt resolution order (pinned by assertion 4)

`src/core/agent-pool.ts` `getAgentPrompt(agentId, projectRoot)`:

1. `<projectRoot>/.deckent/agents/<id>/PROMPT.md` — canonical, persistent shadow (wins if
   non-empty).
2. `<projectRoot>/.tasks/agents/<id>/PROMPT.md` — temp-agent scope.
3. `src/core/builtins/agents/<id>/PROMPT.md` — builtin fallback, only when neither of the above has
   ANY record (not even a bare `agent.json`) for this id.
4. `agent.json::systemPrompt` — degraded fallback, emits a warning.

Step 1 short-circuits on any non-empty content, so a project shadow always wins over the builtin
regardless of the shadow's own content quality — this is exactly the "shadow SHADOWS the builtin"
contract assertion 4 pins.

## 3 · Which sync path propagates guidance into the shadow tree (Task 5's module)

Per the mini-sprint spec (`.analysis/f3-sync-mini-spec-2026-07-14.md` §1c / §2), the propagation
path is a NEW module, task 444-005 ("F4 three-way builtin to shadow prompt-file sync"):

- **Module**: `src/core/agent-prompt-sync.ts` (new) — three-way sync of
  `src/core/builtins/agents/<id>/PROMPT.md` → `.deckent/agents/<id>/PROMPT.md`:
  (a) shadow byte-equal to the last-synced builtin content → safe update; (b) shadow locally
  edited (differs from both) → KEEP local + collect a typed conflict notice, never silent
  overwrite; (c) shadow missing → create.
- **Wiring**: behind the existing sync flags inside `deckent sync`'s adapter phase — alongside
  `syncAdapterFiles()` in `src/cli/commands/sync.ts` (the `registerSync` command action, gated by
  `--adapters-only` / default-on, same phase as the current CLAUDE.md/AGENTS.md/GEMINI.md/
  `.cursor/rules`/`.codex/AGENTS.md` adapter sync at `src/cli/commands/sync.ts:412-444`).
- **Status at the time this note was written**: `src/core/agent-prompt-sync.ts` does **not yet
  exist** in this working tree. Task 444-006 (this task) has no `dependencies` entry on 444-005, so
  the two can complete in either order within sprint-444; this integration suite does not import
  or depend on 444-005's module — it exercises `getAgentPrompt` shadow-precedence directly (§2),
  which is independent of how a shadow file gets there. Live evidence for why this matters: the
  REAL `.deckent/agents/devops-engineer/PROMPT.md` in this repo currently has **zero** guidance
  markers (checked directly — `grep -c 'guidance:' .deckent/agents/devops-engineer/PROMPT.md` = 0)
  while the builtin source has 4 sections (devops/security/config/default). Until 444-005 lands and
  is run, guidance mode against the real project falls back to the full body for every
  builtin-derived agent whose shadow predates the U4 guidance-marker work — a real, live instance
  of the "F4-core" gap the mini-spec opened this mini-sprint to close.

## 4 · Host-side smoke command

Per the mini-spec §5 ("Sync" proof line) and this project's binding rule
(`npm run build` forbidden mid-sprint; sprint mechanics in `CLAUDE.md` `<operating_rules>`), the
real-binary proof is a **host-side, post-build** smoke Brain runs after the sprint, not something
this worker (or any in-sprint worker) can run itself:

```
node dist/cli/entry.js sync --adapters-only
```

Expected: exit 0, adapter file list printed (CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules,
.codex/AGENTS.md, plus the new prompt-sync report once 444-005's wiring lands) — no EISDIR crash
(444-004's regression fix), no silent overwrite of a locally-edited `.deckent/agents/**` shadow
(444-005's conflict-detection branch).
