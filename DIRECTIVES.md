# DIRECTIVES — NT CORRECTION core: tool-result containment, scratch wire, context admission (multi-provider DAG)

> **SETTLED 2026-08-18 — NOT AN ACTIVE RUN.** sprint-553 closed ABORTED (2/5 DONE);
> the remainders were hand-completed by Brain (ADR-D-007 seam, owner directive) and
> landed on main. Evidence: MASTER 7078 row. This file awaits the next run's contract.

## Goal

MASTER 7078 NT-correction core (owner admission 2026-08-18; NO new umbrella). The Qwen
incident exposed three structural terminal defects: tool outputs enter the context raw
and unbounded (one deckent_models call = 470k chars — NT-01/04), the scratch checkpoint
chain is a production DEAD WIRE (the bridge never passes scratch into
createAgentSession — NT-03), and context admission is arithmetic-only (no output
ceiling on the wire, no effective-context resolution at boot — NT-02/07/08). Plus:
CLI/bash results resolve ok:true without exit-code truth (NT-05), auto-decision audit
events are not durable and trace capture violates config authority (NT-12/13). This
sprint closes the CORE SIX on four different models working in parallel.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Parallel execution ADMITTED; single-writer chokepoints: ONLY task 1 writes
  src/agent/tool-result-broker.ts, src/cli/commands/chat-tool-exec.ts and
  src/cli/commands/chat-tool-bridge.ts; ONLY task 2 writes
  src/cli/repl/native-agent-bridge.ts, src/cli/repl/run.tsx and
  src/cli/repl/trace-wire.ts; ONLY task 3 writes src/agent/loop.ts,
  src/agent/provider-tooluse/types.ts, src/agent/provider-tooluse/openai.ts and
  src/cli/repl/native-transport.ts.
- Billing/usage/audit counters NEVER reset; scratch/content stores are session-scoped
  mkdtemp (0700/0600 best-effort), NEVER the source tree, NEVER a '/tmp' literal.
- Hermetic tmpdir tests only; mechanism modules string-free; i18n via getMessage en+tr.
- Use worker comms: write a sharedNotes summary of your landing; dependent tasks state
  received handoffs in .result notes.
- Smoke lines must NOT reference dist/ artifacts; the host builds and runs the real
  Qwen/PTY proof post-sprint.
- Echo the policy digest in your .result as runPolicyEvidence exactly as the prompt's
  Result contract instructs.

## Task 1: universal tool-result budget broker (NT-01/04/05 core)
- Files: src/agent/tool-result-broker.ts, src/cli/commands/chat-tool-exec.ts, src/cli/commands/chat-tool-bridge.ts, tests/agent/tool-result-broker.test.ts
- Scope: src/agent/, src/cli/commands/, tests/agent/
- Provider: claude
- Model: claude-opus-5

### Description
New single chokepoint src/agent/tool-result-broker.ts:

1. `containToolResult(raw: {output: string, ok: boolean, exitCode?: number|null,
   stderr?: string}, opts: {store: ScratchStore-like contentWriter, maxPreviewBytes?
   (default 16_384, hard cap 65_536)})` → canonical envelope
   { summary (first line, ≤200 chars), boundedPreview, contentRef: string|null,
   sha256, bytes, approxTokens, truncated: boolean, exitCode, ok } — when the raw
   output exceeds the preview cap the FULL bytes go to the session content store
   (temp+rename atomic, sha256-named file) and the model receives ONLY
   preview+digest+contentRef+counts; under the cap → contentRef null, full text inline.
2. EXIT-CODE TRUTH (NT-05): the CLI subprocess dispatcher (chat-tool-bridge.ts:162
   region) resolves ok from the REAL exit code/signal/timeout — non-zero exit or
   timeout → ok:false with the typed reason in the envelope; bash results whose output
   ends with the `[exit N]` marker (N≠0) are ok:false. stderr rides a separate field,
   never silently merged.
3. chat-tool-exec.ts (read_file/bash/grep and friends — the 12 direct exec tools) and
   chat-tool-bridge.ts (29 CLI tools) BOTH route their results through
   containToolResult before returning to the loop. read_file additionally accepts
   optional {offset, limit} args honored server-side (range read).
4. Content store: accept an injected writer {write(bytes)→{path,sha256}} so Task-2's
   session scratch store plugs in; standalone fallback = session-scoped mkdtemp dir.
5. Hermetic tests: >preview-cap output → envelope with contentRef + full bytes readable
   from the store + sha256 verifies; under-cap inline; exit 2 bash → ok:false;
   timeout → ok:false typed; 470k-char fixture (generated, not copied from the real
   trace) stays ≤ preview cap in the returned envelope.

GO: suite green; tsc 0; a generated 470k-char tool output reaches the loop as a ≤64KB
envelope with a readable contentRef; non-zero exits are ok:false.
NO_GO: any raw unbounded output path left in the two dispatchers, or fabricated ok.

## Task 2: scratch production wire + durable audit + trace config authority (NT-03/12/13)
- Files: src/cli/repl/native-agent-bridge.ts, src/cli/repl/run.tsx, src/cli/repl/trace-wire.ts, tests/cli/native-agent-scratch-wire.test.ts
- Scope: src/cli/repl/, tests/cli/
- Provider: claude
- Model: claude-sonnet-5

### Description
1. NT-03: run.tsx resolves {tenantId (config approval.authority.tenant_id fallback
   'main'), projectId (project root digest or config), sessionId (existing session id)}
   and the bridge passes `scratch: {…, checkpointInstruction}` into createAgentSession
   — the checkpointInstruction is a typed structured-checkpoint request (English
   mechanism text is the PROVIDER contract, not user-facing i18n). Session close() is
   called on teardown with a bounded keep-for-recovery window (e.g. 10 min).
2. NT-12: the bridge consumes 'permission-auto-decision' events and persists each via
   the existing audit-writer pattern (typed, durable, append) — the trace snapshot is
   NOT the audit record.
3. NT-13: trace capture honors `training_trace.enabled` from effective config as the
   AUTHORITY (env DECKENT_TRACE may only force OFF, never ON when config says off);
   trace files are written 0600; when config is absent/off → zero capture.
4. Tests: bridge passes scratch (spy on createAgentSession deps); auto-decision events
   reach the audit sink; config-off produces zero trace writes; 0600 mode asserted
   where the platform supports it.

GO: suite green; tsc 0; checkpoint events stop being no-ops (assert the session
receives scratch); config-off trace test proves zero bytes.
NO_GO: env-default-on capture surviving, or audit events still volatile.

## Task 3: context admission + output ceiling + boot-time effective context (NT-02/07/08)
- Files: src/agent/loop.ts, src/agent/provider-tooluse/types.ts, src/agent/provider-tooluse/openai.ts, src/cli/repl/native-transport.ts, tests/agent/context-admission.test.ts
- Scope: src/agent/, src/cli/repl/, tests/agent/
- Provider: claude
- Model: claude-opus-5

### Description
1. NT-08: ProviderRequest gains `outputCeilingTokens?: number`; the OpenAI-compatible
   adapter sends it as `max_tokens`; the loop sets it from the resolved native budget's
   outputReserveTokens (absent → field omitted, behavior unchanged).
2. NT-02: HARD per-request admission in the loop before adapter.send: estimate
   system + serialized tool schemas + messages + outputCeiling + safety reserve; when
   the sum exceeds the effective context the loop first triggers ONE
   budget-checkpoint-request (epoch compaction path), and if still over after fitting
   → typed error code 'native-context.admission-denied' (i18n key exists or falls back)
   instead of shipping a doomed request. Current-turn messages are never silently
   dropped — that is exactly what the typed denial is for.
3. NT-07: native-transport's local-llm resolution performs the boot-time effective
   context resolution: min(configured native_context_tokens, server-reported context
   when discoverable) with typed provenance; the context getter run.tsx wires consumes
   THIS resolved value (explicit config may narrow, never widen above a known server
   ceiling).
4. Tests: admission denial fires at the right arithmetic; checkpoint-first ordering;
   max_tokens present in the adapter body when ceiling set; effective-context min rule
   + provenance; config-only fallback honest when the server does not report.

GO: suite green; tsc 0; a fixture whose tool results exceed the context yields the
typed admission code instead of an oversized request (assert on the fake adapter's
received body size).
NO_GO: silent current-turn drops or a widened context above a known server ceiling.

## Task 4: incident regression fixture + typed reproduction (depends on Tasks 1,3)
- Files: tests/agent/qwen-incident-regression.test.ts
- Scope: tests/agent/
- Provider: codex
- Model: gpt-5.6-sol

### Description
Turn the Qwen incident into a deterministic, immutable regression WITHOUT copying raw
user/tool content: generate synthetic fixtures matching the incident's SHAPE (three
tool calls totaling ~474k chars, one 470k single result; sizes/digests only). Drive the
REAL loop with a fake adapter: (a) with Task-1 containment the turn completes and the
provider request stays bounded (assert request bytes); (b) with Task-3 admission a
deliberately-overflowing variant terminates with the typed admission/containment code,
never an oversized request; (c) record the baseline metrics (request bytes, schema
bytes, tool-result bytes, rounds) as assertions with named constants.

GO: both scenarios deterministic and green; no raw incident content in the fixture.
NO_GO: fixture copies real trace content, or assertions rely on wall-clock.

## Task 5: correction baseline document (bounded probe task)
- Files: docs/audits/native-terminal-correction-baseline-2026-08-18.md
- Scope: docs/
- Provider: local-llm
- Model: Qwen3.8-27B-Q4_K_M

### Description
Single-file documentation task: write the correction baseline document (Turkish prose,
technical terms English) with EXACTLY these sections: (1) 'Olay' — the incident in
three sentences (25-round guard already fixed; this correction targets containment/
scratch/admission); (2) 'NT-01..NT-13 özet tablosu' — one row per finding: ID,
one-line summary, owning package (copy the finding list from the MASTER 7078 evidence
text verbatim-condensed, do not invent new findings); (3) 'Kabul senaryoları' — the 14
acceptance scenarios as a numbered checklist marked [ ] pending; (4) 'Ölçüm taban
çizgisi' — a table with the incident numbers already given (470,325 chars single tool;
474,380 total; ~118k token transcript; 46 eager schemas; 187MB traces dir). No claims
beyond the given facts; no file paths invented.

GO: file exists with the four exact sections, tables well-formed, facts match the
given numbers; nothing fabricated.
NO_GO: invented findings/paths or missing sections.
