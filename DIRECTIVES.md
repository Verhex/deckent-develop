# DIRECTIVES — NT-06 REAL progressive disclosure: bounded provider tool surface

## Goal

MASTER 7078 NT-06 (owner order 2026-08-18: "NT-06 ile başla"). Progressive disclosure
is currently FAKE: the meta-tools (deckent_search_tools / deckent_describe_tool /
deckent_call_tool) exist, but src/agent/loop.ts ships EVERY registered schema every
round via registry.toNativeSchemas() — 46+ eager schemas per request, external MCPs on
top (the incident baseline). This sprint makes the provider-facing tool surface
config-gated, bounded and session-sticky: a core set + the meta-tools go eagerly; every
other tool's schema enters the surface only after the model discovers it
(describe/call), and discovery responses are bounded and cursor-capable. Package-4 exit
gate: a 1000-tool catalog keeps eager schema bytes bounded without losing callability.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Parallel execution ADMITTED; single-writer chokepoints: ONLY task 1 writes
  src/agent/tools/exposure.ts, src/agent/tools/registry.ts and
  src/cli/repl/native-tool-registry.ts; ONLY task 2 writes src/agent/loop.ts and
  src/cli/repl/native-agent-bridge.ts; ONLY task 3 writes its test file.
- Flag-gate discipline (quality bar): the new behavior activates ONLY when effective
  config `tool_surface.progressive === true` (fail-closed resolver, mirrors
  resolveToolSurfaceOptions); flag absent/false → provider surface byte-identical to
  today's full eager list. No blind default flip in this sprint.
- Mechanism modules string-free; user-visible signals via getMessage en+tr; hermetic
  tmpdir tests only; billing/usage counters never reset.
- Use worker comms: write a sharedNotes summary of your landing; dependent tasks state
  received handoffs in .result notes.
- Smoke lines must NOT reference dist/ artifacts; the host builds post-sprint.
- Echo the policy digest in your .result as runPolicyEvidence exactly as the prompt's
  Result contract instructs.

## Task 1: provider tool-exposure policy + registry surface view (NT-06 core)
- Files: src/agent/tools/exposure.ts, src/agent/tools/registry.ts, src/cli/repl/native-tool-registry.ts, tests/agent/tool-exposure.test.ts
- Scope: src/agent/, src/cli/repl/, tests/agent/
- Provider: codex
- Model: gpt-5.6-sol

### Description
1. New src/agent/tools/exposure.ts: `createToolExposure(opts: {progressive: boolean})`
   returning a session-scoped object { isExposed(name), reveal(name),
   revealedNames() }. Non-progressive → everything exposed (byte-identical legacy).
   Progressive → exposed = core-declared tools + already-revealed names; reveal() is
   idempotent, session-sticky (NEVER un-reveals), and bounded by the registry's real
   names (revealing an unknown name is a typed no-op, not a throw).
2. ToolDefinition gains optional `exposure?: 'core' | 'discoverable'` (default
   'discoverable' under progressive; irrelevant otherwise). ToolRegistry gains
   `toNativeSchemas(filter?: (def) => boolean)` — no filter → exact current behavior
   (pinned by existing tests untouched).
3. native-tool-registry.ts: the three meta-tools and the direct exec core set the REPL
   already registers are declared `exposure: 'core'` AT REGISTRATION (declaration at
   source, not a config name list — KANUN 10). deckent_describe_tool and
   deckent_call_tool handlers call exposure.reveal(name) for the named tool BEFORE
   returning, so the described/called tool's schema rides the NEXT round.
   deckent_search_tools results stay bounded (existing limit) and gain a stable
   `cursor` continuation field when more hits exist (offset-based is acceptable; it
   must be deterministic).
4. `resolveToolSurfaceOptions` (or a sibling pure resolver) resolves
   `tool_surface.progressive` fail-closed: only literal true enables.
5. Hermetic tests: legacy mode byte-identical schemas; progressive mode exposes only
   core+meta; describe→reveal→next-schema-list contains the tool; reveal idempotent +
   unknown-name typed no-op; search cursor determinism.

GO: suite green; tsc 0; progressive-off surface byte-identical; describe/call reveal
proven by schema-list diff in tests.
NO_GO: any config-name-list of tools, un-reveal path, or legacy-mode byte drift.

## Task 2: loop consumes the exposure view per round (NT-06 wire)
- Files: src/agent/loop.ts, src/cli/repl/native-agent-bridge.ts, tests/agent/loop-exposure-wire.test.ts
- Scope: src/agent/, src/cli/repl/, tests/agent/
- Provider: claude
- Model: claude-opus-5

### Description
1. LoopDeps gains optional `getProviderToolSchemas?: () => NativeToolSchema[]`; the
   loop's per-round `const toolSchemas = deps.registry.toNativeSchemas()` becomes
   `deps.getProviderToolSchemas?.() ?? deps.registry.toNativeSchemas()` — schemas are
   already re-read every round, so a tool revealed in round N appears in round N+1
   with no other loop change. Admission arithmetic (NT-02) automatically prices the
   smaller schema list; do not touch it.
2. native-agent-bridge.ts (createNativeEngine): build the session ToolExposure from the
   resolved toolSurface options (progressive flag), wire
   `getProviderToolSchemas: () => registry.toNativeSchemas(def => exposure.isExposed(def.name))`
   into createAgentSession's LoopDeps, and pass the SAME exposure object into the
   registry builder seam Task 1 exposes so describe/call reveals feed the getter.
   Progressive-off → do not construct the getter at all (legacy path untouched).
3. Tests: fake registry with 5 tools (2 core) — round-1 request carries only core+meta
   schemas; after a scripted describe tool-call, round-2 carries the revealed schema;
   progressive-off carries all 5 both rounds; loop without the new dep behaves
   byte-identically (regression pin).

GO: suite green; tsc 0; round-over-round schema-list growth proven on the REAL loop
with a scripted adapter.
NO_GO: loop learning exposure semantics (it may only consume the getter), or
progressive-off drift.

## Task 3: 1000-tool bounded-surface regression (depends on Tasks 1,2)
- Files: tests/agent/tool-surface-scale.test.ts
- Scope: tests/agent/
- Provider: claude
- Model: claude-sonnet-5

### Description
Generate a synthetic 1000-tool catalog (deterministic names/descriptions, no wall
clock). Drive the REAL runAgentTurn with a scripted adapter in progressive mode:
(a) round-1 serialized schema bytes stay under a named ceiling
(BASELINE_MAX_EAGER_SCHEMA_BYTES) that is an order of magnitude below the full
catalog's serialization — assert both numbers; (b) a scripted
search→describe→call chain against one deep-catalog tool completes and the called
tool's schema appears in the following round's request; (c) legacy mode with the same
catalog ships all 1000 schemas (honest contrast assertion). Depends on Tasks 1-2;
consume their sharedNotes handoffs and state them in .result notes.

GO: both scenarios deterministic and green; named-constant baselines asserted.
NO_GO: assertions on exact serialized bytes that would break on unrelated description
edits (use ceilings/ratios, not exact equality), or wall-clock reliance.
