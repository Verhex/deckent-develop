# ADR-093: Real Token/Cost Capture via Provider-Native Usage Stores

**Status:** accepted

**Date:** 2026-06-27

**Sprint:** 334

---

**Context:**

Every worker `.result` file since the beginning of the codebase carried **heuristic token/cost
estimates** — not real usage reported by the provider. A structural audit across 61 consecutive
`.result` files confirmed the pattern with 100% incidence:

- `cacheReadInputTokens = inputTokens × 4` (exactly, every case)
- `outputTokens = linesAdded × 15` (exactly, every case)
- `cacheCreationInputTokens = undefined` (61/61 — the field was never populated)
- `tokenUsage.source = undefined` (61/61 — no provenance tag)

Root cause: `src/orchestra/token-counter.ts` reads `.tasks/task-{id}.log` and
`.tasks/task-{id}.cli-output.json` looking for a `--output-format json` envelope that never lands
in those files (workers write ≈65-byte stdout there, not the full JSON envelope). The fallback
path — `estimateTokenUsage` (token-counter.ts:401-403) — was therefore activated for every task
without exception.

The consequence was a compounding inaccuracy: `cacheCreationInputTokens` — the **limit-dominant
cost component** (charged at 1.25× the base input rate per the cost-calculator at
`cost-calculator.ts:349/387`) — was structurally zero in every sprint's cost rollup. A real worker
session produced `cacheCreation=47514` tokens (a dominant fraction of total cost) while the
heuristic reported `cacheCreation=0` for the same session — a complete miss.

The ground truth exists and is accessible: the Claude provider writes per-turn usage to a
session-store jsonl under `~/.claude/projects/{slugified-cwd}/*.jsonl`. Each turn's
`message.usage` object carries all four fields: `input_tokens`, `output_tokens`,
`cache_read_input_tokens`, and `cache_creation_input_tokens`. Summing these across all turns of a
worker session gives the real usage reported by the provider — identical to what Anthropic bills.

No analogous on-disk store existed for the Codex or Gemini providers at the time of this decision.

---

**Decision:**

Introduce a **provider-agnostic native-usage-store seam** as the authoritative source of truth for
token/cost capture, with the heuristic path retained as an honest, labeled last-resort fallback.

### Part A — `TokenUsage` type extension (additive)

Two optional fields are added to `TokenUsage` in `src/core/task-types.ts`:

- `cacheCreationTokens?: number` — real cache-write tokens (previously always missing)
- `source?: 'session-store' | 'envelope' | 'estimate' | string` — provenance tag

Both fields are strictly additive and optional. Existing consumers that do not read them are
unaffected. The `cacheCreationTokens` field name is aligned with the cost-calculator's
`RegimeCostUsage.cacheCreationTokens` field (`:236`) so the cost pipeline auto-corrects with
**zero changes** to `cost-calculator.ts`.

### Part B — `session-usage-store.ts` (new pure module)

`src/providers/session-usage-store.ts` exposes a single public function:

```
readNativeUsage(
  provider: string,
  opts: {
    projectRoot: string;
    taskId: string;
    sessionId?: string;
    spawnWindow?: { start: number; end: number };
    sessionRoot?: string;   // injectable — defaults to ~/.claude/projects/{slug}
  }
): Promise<RealUsage | null>
```

For `provider === 'claude'`, the function:

1. Resolves the session jsonl directory from `sessionRoot` (injectable; defaults to the
   slugified-cwd path under `~/.claude/projects/`). The `sessionRoot` parameter is the test
   hermeticity seam — **the real `~/.claude` is never read in any test**.
2. Identifies the correct `.jsonl` file by matching `session_id` (when available from a prior
   spawn envelope) or by correlating on modification timestamp within the `spawnWindow`.
3. Reads and parses the jsonl line-by-line, summing every `message.usage` object's four fields
   across all turns.
4. Returns a `RealUsage` object with `inputTokens`, `outputTokens`, `cacheReadTokens`, and
   `cacheCreationTokens` — all real values summed from the provider's store.

For `provider === 'codex'` and `provider === 'gemini'`: returns `null` immediately with a
`// TODO(phase2)` comment noting that each provider's own native usage store should be plugged
here. This is a documented, honest extension point (Law #2 — every environment). A `null` result
propagates to the heuristic fallback, preserving current behavior for these providers.

Returns `null` on any I/O or parse error (session jsonl absent, malformed lines, etc.) — never
throws.

### Part C — `token-counter.ts` priority chain

`src/orchestra/token-counter.ts` is updated to apply a strict priority order before reaching the
heuristic:

1. **Session-store read** (`readNativeUsage`) — if a non-null result is returned, build the
   `TokenUsage` from summed real usage and set `source = 'session-store'`.
2. **Envelope extraction** — if the existing `extractUsage` path finds a well-formed
   `--output-format json` envelope, use it and set `source = 'envelope'`.
3. **Heuristic fallback** — `estimateTokenUsage` is called only when both (1) and (2) yield
   nothing. The estimate result is returned unchanged in shape, but `source` is set to
   `'estimate'` as an explicit, honest provenance label. The estimate algorithm itself is not
   modified — behavior is byte-equivalent for consumers that relied on the estimates.

The `source` tag is the single most operationally useful addition: it lets any downstream
consumer (dashboard, retro, auditor) distinguish a real measurement from an estimate without
inspecting token ratios.

### Test hermeticity requirement

All tests for `session-usage-store.ts` and the updated `token-counter.ts` must use an injected
`sessionRoot` pointing to a tmpdir fixture. The fixture must contain at least two turns with
real-shaped `message.usage` objects (including `cache_creation_input_tokens > 0`) so the sum
assertion covers the dominant cost field. No test may read from the real `~/.claude` directory.

---

**Consequences (+):**

- `cacheCreationInputTokens` is now captured for Claude-provider workers, closing the largest
  cost-accuracy gap. The existing `cost-calculator.ts` (`cacheWrite = cacheCreationTokens ?? 0`,
  `:349/:387`) picks up the real value with no changes to the cost-calculator.
- `source = 'session-store'` gives every downstream consumer a machine-readable provenance tag
  so heuristic estimates are no longer indistinguishable from real measurements.
- Codex and Gemini are first-class documented extension points — the `null` return with
  `TODO(phase2)` is an explicit seam, not a silent omission (Law #2).
- Test hermeticity is enforced by design: the `sessionRoot` injection parameter prevents any test
  from accidentally touching the developer's real `~/.claude` directory.
- No changes are required to `cost-calculator.ts`, `collection.ts`, `sprint-finalizer.ts`, or
  any other consumer — the `TokenUsage` extension is additive, and `cost-calculator.ts` already
  reads `cacheCreationTokens ?? 0`.

**Consequences (-):**

- Only Claude is a real implementation today; Codex and Gemini fall back to the heuristic path
  until phase-2 extensions are written.
- Session jsonl correlation relies on a spawn-time window when `session_id` is not captured from
  the spawn envelope. On high-concurrency machines with many simultaneous workers, the correlation
  window must be conservative to avoid false matches.
- The `~/.claude/projects/{slug}` path is platform-specific. Cross-platform path resolution
  (macOS, Linux, Windows native, WSL) must be handled inside `session-usage-store.ts`; the
  injectable `sessionRoot` is also the platform-portability escape hatch for future adapters.
- Heuristic estimates remain in the fallback path for sessions where no native store is readable.
  The `source = 'estimate'` tag makes this visible, but does not eliminate the inaccuracy.

**Alternatives Considered:**

- **Parse the `--output-format json` stdout envelope directly:** the envelope is written to the
  provider process's stdout, not to `.tasks/task-{id}.log` or `.tasks/task-{id}.cli-output.json`.
  The task log capture path never receives it. Fixing the log capture to intercept the envelope
  would require invasive changes to the spawn/pipe architecture. Rejected: higher blast radius,
  same data available from the session-store with simpler read-only access.
- **Instrument token counts at spawn time via a middleware:** insert a pass-through byte counter
  around the provider's stdio streams. Rejected: provider-specific framing, fragile under
  streaming/chunking, requires changes across all provider adapters. The session-store is the
  provider's own authoritative record and requires no stream interception.
- **Retain the heuristic permanently, accept the inaccuracy:** the heuristic was structurally
  wrong for `cacheCreationTokens` (always zero) and linearly wrong for `inputTokens` (correlated
  with lines-added, not real model context). The `cacheCreationInputTokens` miss meant the most
  expensive token category was invisible to all cost reporting. Rejected: materially misleads
  sprint cost decisions and KPI targets.
- **Provider SDK call to fetch usage post-completion:** query the Anthropic Messages API usage
  endpoint after the worker session ends. Rejected: requires an additional API credential path,
  adds network I/O to every finalize cycle, and is redundant when the session-store already holds
  the same data locally.

**References:**

- `src/providers/session-usage-store.ts` — new pure module (provider-native usage reader)
- `src/core/task-types.ts` — `TokenUsage` type (additive `cacheCreationTokens`, `source` fields)
- `src/orchestra/token-counter.ts` — updated priority chain (session-store → envelope → estimate)
- `tests/providers/session-usage-store.test.ts` — hermetic fixture-based test
- `tests/orchestra/token-counter-real-usage.test.ts` — integration test with tmpdir sessionRoot
- `src/core/cost-calculator.ts:349/387` — `RegimeCostUsage.cacheCreationTokens` (no edit needed)
- ADR-076: Auth-Precedence Fix — established the provider auth-isolation contract that this ADR
  builds on (subscription vs API mode; no cross-provider credential leak)
- ADR-066: Provider Independence — multi-provider backend parity principle (this ADR's
  provider-agnostic seam is a direct application)
- ADR-087: Async I/O and Test Hermeticity Standard — the `sessionRoot` injection pattern follows
  the test hermeticity requirements mandated by this ADR
- `docs/audits/OVERNIGHT-2026-06-27-findings.md` — root-cause analysis and session-store ground
  truth proof that motivated this decision
