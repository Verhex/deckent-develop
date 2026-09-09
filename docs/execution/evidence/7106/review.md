# 7106 revision — READY_FOR_REVIEW, not product DONE

Worktree `/tmp/deckent-7106-preamble-revised-20260909`, branch `implementation/7106-preamble-revised-20260909`, base `e7b32aaf8`. Thirteen source/test files, +468/-24 including the three new files; exact bytes in `source-manifest.json`, detailed counts in `diffstat.txt`. Fable epoch-5 retains execution/landing custody. No Astra commit/push, main source/build/runtime/auth mutation or MASTER change. Owner gate bekliyor.

## Result and production wiring

B1: the configured `.15` preamble share is a target. `src/core/execution-budget-policy.ts:62` resolves the additional `minTranscriptShareOfContext` reserve, default `.10`, with strict ratio validation at :95. `src/agent/preamble-budget.ts:101` prices the hard ceiling as window minus output reserve, safety reserve and ceil(window × transcript reserve share). Every composition candidate uses the existing complete-request measurement authority, retaining exact/conservative provenance. At :151 the existing search/describe/call seam can replace core execution schemas under pressure; at :157 an irreducible floor above target is admitted only inside that hard ceiling. Without all three meta tools, capabilities are never silently removed. Full original composition remains byte-identical when it already fits (million-token-window regression).

`src/agent/session.ts:337` resolves the policy and passes the same budgeter to preflight and loop requests. `src/cli/repl/native-agent-bridge.ts:702` shares one ToolExposure object with registered meta handlers, the NT-06 getter and session at :753. Search reveals propagate to the same object; exposed schemas are added when the target permits, otherwise existing permissioned meta dispatch remains available. No new dispatcher or permission bypass. `src/agent/loop.ts:251` catches only PreambleBudgetError; unrelated errors retain their identity.

`src/cli/repl/run.tsx:896` projects typed `floor-admitted` through the EN/TR message at `src/cli/helpers/messages.ts:3764`. The hold message at :3760 names the target and reserve configuration keys and explains that increasing the target alone cannot fix a reserve conflict. `preamble-budget.ts:51` keys verified durable reference stubs by language, kind and digest, with a named summary-length constant. Reference bytes are written through the existing content store and SHA256-checked against actual readback; failure preserves full text. Immutable safety is never transformed. Changes to run.tsx remain formatter/label-only.

B2: main's restored `INPUT_CONTEXT_OVERFLOW + MEASURED_CONTEXT_PRESSURE` incident test is preserved at `tests/agent/context-lifecycle-battery.test.ts:1128` (20k window, `'x '.repeat(30_000)` expanded prompt). The impossible five-token preamble test is separate. The former `.5` preamble overrides in epoch fixtures are removed; defaults now pass. Tests additionally cover shared exposure identity/search-to-next-request, unknown preparation faults, EN/TR reference stubs and floor warnings, reserve refusal, malformed storage and unavailable discovery.

## Evidence

`checks.json` records exact commands, exit codes, UTC observations and log digests. Combined 18-file suite: 277/277, exit0. Rebase exposed an obsolete i18n key only in the new negative assertion; it was changed to the current pressure key and the complete battery rerun 41/41, exit0, without that warning. TypeScript, i18n, config-writers, diff check, isolated compiler and asset copy all exit0. LOCAL_VERIFIED; REMOTE_ADVISORY NOT_RUN. No repo-wide green claim.

Production registry matrix (`tests/agent/preamble-budget-registry-matrix.test.ts:13`) uses actual repository DECKENT.md/identity copied to a disposable workspace, a fixture model label and no scratch section:

| Window | Disposition | Preamble | Target | Schemas |
|---:|---|---:|---:|---:|
| 8192, default reserves | HOLD: only1228 tokens remain for preamble | 4453 | 1228 | 3 |
| 8192, resolved output512/safety256 | floor admitted, hard6604 | 4452 | 1228 | 3 |
| 16384 | floor admitted, hard8601 | 4453 | 2457 | 3 |
| 32768 | within target | 4453 | 4915 | 3 |
| 65536 | within target | 7825 | 9830 | 15 |
| 131072 | within target | 11130 | 19660 | 15 |

Actual Terminal includes scratch instructions and actual model framing, so its floor is measured independently. `acceptance-proof.json` records the real local Qwen probe with configuration `native_context_tokens=32768`, default native budget and fresh disposable cwd. First turn HELLO32: input5230, preamble5146/target4915, three meta schemas, explicit floor-admitted warning. One limited search followed by list/read/grep via the real meta dispatcher completes with correct `alpha beta` / `needle gamma` and line2, then DONE32. Three real provider calls total; all HTTP200; provider input6495/output681/reports3 exactly matches `/context`. Final actual request8609, epoch1, checkpoint empty. No interruption/checkpoint/extra describe call. Terminal exit0. Tap forwards original requests/responses, retains only metadata/usage/digests and never stores reasoning text. Source and binary manifests were checked against the executed artifact.

Smoke: `env TERM=xterm-256color DECKENT_INK=1 DECKENT_NATIVE_AGENT=1 node --import proof/wire-32k.mjs dist/cli/entry.js --native` from the disposable cwd → HELLO32, real discovery/list/read/grep, DONE32, `/context`32768/floor-admitted and matched6495/681, `/exit`0. Exact paths are in `acceptance.typescript` and `config-evidence.json`.

## Limits and retained findings

The earlier unrestricted three-search/three-describe probe is retained in `proof/prior/32k.typescript` and `wire-32k.jsonl`. It triggered retained-tool pressure checkpoints, then repeated grep calls and an invalid read; the disposable attempt was interrupted and exited0. It is a diagnostic/stress attempt, NOT acceptance PASS. The passing probe supplies explicit tool arguments and uses a directory grep target (`path:"."`); the earlier prompt supplied a file target to the directory-walking grep implementation. General discovery/checkpoint/argument recovery remains a RELATED_BUT_NONBLOCKING finding for Fable's review, not a silently fixed or closed capability. The 128k prior proof remains historical evidence, not proof of these new bytes.

RB3/RB4/RB6/RB7/RB8/RB9 were record-only and remain outside this patch. In particular no exact-tokenizer capability, hydration exposure persistence, training-trace parity or broad automatic recovery claim was added. Claude-live, Windows-native and hydrated-resume probes NOT_RUN. BLOCKS_CURRENT_DONE: independent Fable adjudication and owner landing/settlement gates; no product DONE or durable XVerify settlement claim.

Review evidence observed UTC: 2026-09-09T12:43:33.356978+00:00
