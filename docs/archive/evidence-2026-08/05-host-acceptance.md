# FO05 host acceptance receipt

**Measured:** 2026-08-23, Europe/Istanbul
**Outcome boundary:** sprint-628 bounded final-only containment parity plus
post-terminal host review. This is not a full FO-04/FO-05/FO-11 closure receipt.

## Production and real-binary proof

- Shared consumer: `src/core/final-only-usage-containment.ts`.
- Wired task ingresses: manual `deckent spawn`, initial sprint wave, and
  retry/FIX/continuation.
- Scoped parity battery: 6 files, **74/74 pass**.
- Recovery/finalization battery: 5 files, **106/106 pass**.
- Adjacent spawn/Docker/approval battery: 8 files, **97/97 pass**.
- Relevant XVerify preservation cases: **5/5 pass**; 63 unrelated cases were
  intentionally excluded by the name filter.
- Built CLI canary: `dist/cli/entry.js spawn` ran in a separate OS process over
  a suite-owned project/host fixture. A final-only Codex task with a live turn
  ceiling and no owner grant exited 1 with
  `owner-authorization-missing` before worker success or Docker/provider
  dispatch.
- Hermetic source registry: zero confirmed violations; measured unresolved
  ratchet `15118:cf5f3260...`, production inventory
  `1305:898f6ffb...`.
- Full `npm run lint` covers root/dashboard typecheck plus policy, i18n,
  hermeticity, manifest, MASTER and operating-policy gates.

## Canonical archive acceptance

`deckent archive verify --sprint sprint-628 --json` verifies the existing
manifest: `ok=true`, 230 checked artifacts, valid manifest digest, and empty
missing/mismatched/untracked sets. Brain recall exposes
`archive-sprint-628` as `230 artifacts; COMPLETE`.

That integrity result is not promoted to terminal completeness. The archived
event journal has 123 records while the hot journal has 127. Sequences 124–127
are the recovery receipt authorization, cleanup settlement, FIX→COMPLETE phase
change, and recovery terminalization completion. Read-only `archive inspect`
therefore proposes two conflicts (`events.jsonl`, `seq`) and a 232-artifact
candidate manifest. The archive is internally valid but late-terminal-event
incomplete.

**Disposition:** bounded final-only parity is `LOCAL_VERIFIED`; sprint-628 run
state is terminal `COMPLETE`; canonical finalizer acceptance remains `HOLD`
until terminal publication precedes the final archive snapshot and a fresh
multi-task canary proves zero late raw write/conflict.

## Explicit negative space

- FO-04 tenant/run/task/attempt/expiry/single-use authorization binding remains
  OPEN.
- FO-05 autonomous/process/XVerify convergence remains OPEN.
- FO-11 valid paid completion, hang, child, crash, missing-final and real
  duplicate-dispatch matrix remains OPEN.
- The full `cross-verify-wire` suite has 11 exact-coordinator failures in
  unmodified, out-of-scope production sources; this receipt relies only on the
  five named final-only preservation cases.
- Runtime hygiene formal different-provider XVerify is owner-deferred until
  2026-08-24 20:00 Europe/Istanbul and was not run or claimed here.
