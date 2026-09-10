# P4 — Permission RCA: `native.permission.classification-unavailable`

**Authority:** ENTRY 167 ASSIGN (evidence-only). **UTC:** 2026-09-10T21:55Z.  
**Owner symptom (ENTRY 163):** intermittent `read_file` / `list_dir` failures with `native.permission.classification-unavailable`; `deckent_bash` sometimes succeeded.

## Executive summary

The user-visible code `native.permission.classification-unavailable` is emitted **only** when `decide()` returns **`ask`** and the ask-path preflight in `runAgentTurn` fails (`src/agent/loop.ts:1058–1066`). It is **not** emitted on the silent auto-allow path.

Under the **default native registry + `SAFE_DEFAULT_POLICY`**, `deckent_read_file` and `deckent_list_dir` are **`silent`** tier tools **without** an `approval` producer (`nativeBuiltinApprovalClassifier` returns `undefined` for them). `classifyNativeToolApproval(undefined, …)` always yields `NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE`, but **`decide(..., tier: 'silent')` → `allow`**, so the tool runs and the unavailable code **never surfaces**.

Therefore, owner-visible `classification-unavailable` on read/list tools **requires** that those calls reached **`decision === 'ask'`** (effective tier not `silent`, or deny/floor — but unavailable is specific to the ask guard). The most consistent code-level explanation for read/list is: **effective tier was elevated to `confirm`/`always` (policy `tierMap`, `alwaysFloor`, self-mod elevation on writes — N/A for pure reads), or the tool name/registry differed from the default exec registry** — not “bash bypassed permission.”

**Bash contrast (deterministic):** `deckent_bash` defaults to **`confirm`** (`execToolTier`). Proven **safe-read** commands downgrade tier to **`silent`** via `classifyShellCommand` (`loop.ts:1002–1012`), then **`allow`** without needing approval metadata. Non-safe-read bash stays **`ask`** with a **valid** `deckent_bash` approval producer when `cmd` is present. Empty/missing `cmd` → **`ask` + `blocked-reasonCode`** (same user-facing code). Safe-read bash **does not** prove read_file should pass via the same classifier; it uses a **different tier override** path.

## Code map (exact branches)

| Location | Role |
|---|---|
| `src/agent/loop.ts:995–1027` | `resolveCurrentPermission`: resource, tier, shell safe-read override, `classifyNativeToolApproval`, `decide` |
| `src/agent/loop.ts:1058–1066` | **`native.permission.classification-unavailable`** when `decision === 'ask'` AND (`reasonCode` in approval OR invalid classification OR `approval.resource !== resource`) |
| `src/agent/permission.ts:29–51` | `decide`: deny → floor → **silent allow** → grants → mode |
| `src/agent/native-tool-approval.ts:33–59` | Builtin approval producers: **bash, write, edit, git add/commit only** |
| `src/cli/repl/native-tool-registry.ts:454–474` | `defineFromDispatcher`: attaches `approval` only when producer exists |
| `src/cli/repl/native-tool-registry.ts:285–287` | `execToolTier`: side-effecting → `confirm`, else **`silent`** (read/list/grep/glob) |
| `tests/agent/native-permission-session.test.ts:450–476` | Contract: confirm-tier tool **without** producer → unavailable, no prompt |

### Collapsed failure reasons (ENTRY 167 concern)

All three pre-prompt failures share **one** operator code (`native.permission.classification-unavailable`):

1. **`reasonCode`** — missing producer, classifier returned `null`, classifier threw, or malformed scope/risk/scopeId (`native-tool-approval.ts:62–75`).
2. **`!isValidApprovalClassification`** — trim/scope/risk validation (`loop.ts:141–147`).
3. **`approval.resource !== resource`** — producer resource string differs from `primaryResource(call.args)` (`loop.ts:279–281`).

No branch distinguishes invalid vs missing vs mismatch in the UI message today.

## Deterministic reproduction (probe)

Evidence probe: `probe-permission-path.test.ts` (local vitest config in this directory).

```bash
npx vitest run --config docs/execution/evidence/terminal-winddown-20260910/p4-permission-rca/vitest.config.ts
```

**Results (2026-09-10 local):** 5/5 PASS.

| Scenario | tier | decision | ask guard |
|---|---|---|---|
| `deckent_read_file` / `deckent_list_dir`, default policy | silent | allow | not-ask (producer absent but irrelevant) |
| `deckent_read_file` + `tierMap.confirm` override | confirm | ask | **blocked-reasonCode** (no producer) |
| `deckent_bash` safe-read in repo (`grep … loop.ts`) | silent | allow | not-ask |
| `deckent_bash` `npm test` | confirm | ask | **would-prompt** (valid classification) |
| `deckent_bash` `{}` | confirm | ask | **blocked-reasonCode** |

Additional unit coverage (unchanged product tests): `tests/agent/native-tool-approval.test.ts`, `tests/agent/native-permission-session.test.ts` — 19/19 PASS.

## Owner PTY session — typed gap

No raw tool-call ledger (tool name, args digest, effective tier, decision, approval object) was archived for chat `chat-2026-09-10T21-09-07-050Z-ipknjv`. **Exact failure branch for that session: typed HOLD** — cannot pick among reasonCode vs mismatch vs policy override without session-attached evidence.

**Minimum evidence to close HOLD:** one failing call record with `{ tool, sanitizedArgs, resource, tier, decision, approvalSummary, policyDigest }` from loop or bridge logging (future implementation scope).

**Hypotheses ranked for owner follow-up (not proven on PTY disk):**

1. **Effective policy raised read tools to `confirm`** (project `.deckent/permission-policy.json` tierMap — file absent in repo root at RCA time; owner project may differ).
2. **Tool surface mismatch** — model/host used a **confirm-tier** or **unclassified** tool name (MCP/bridge) rather than builtin silent exec tools.
3. **Misread UI** — permission round projection shows `scope: unclassified` for silent tools (`native-agent-bridge.ts:947–954`) even when decision is `allow`; distinguish from tool-result code.

**Rejected inference:** “bash passed ⇒ read_file should use bash permission” — safe-read bash uses **tier downgrade to silent**, not shared read_file classifier.

## Recommended implementation scope (next ASSIGN — not executed here)

1. **Producer gap (if product intent is confirm-tier reads):** add `file-read` approval classifiers for `deckent_read_file`, `deckent_list_dir`, `deckent_grep`, `deckent_glob` mirroring write/git pattern — **only if** policy keeps or moves reads to `confirm`.
2. **Operator clarity:** split `loop.ts:1058` into distinct typed codes (missing-producer vs invalid vs resource-mismatch) with i18n keys.
3. **Observability:** structured log/receipt on ask-blocked path with tier/decision/policy digest (no secrets).
4. **Runtime verify:** on owner repro, dump effective `loadPolicy(cwd)` + resolved tier for failing call.

**Explicitly out of scope for fix proposal:** silent allow bypass, blanket approval, bash fallback for denied reads, policy floor shrink.

## File digests (RCA time, workspace)

See `receipt.json` for SHA-256 of cited sources and this analysis.
