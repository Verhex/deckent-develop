# R34 — Release HOLD propagation repair, in progress

Observed UTC: 2026-09-15T04:31:16.531318+00:00

Authority: existing owner-admitted ADR-D-007 repair, MASTER 3178 / parent 120.
Disposition: PARTIAL / HOLD. This is not product closure or formal XVerify.

## Source changes

- E1: separate RELEASE_DIAGNOSTIC Store observation class and path; existing EFFECT_DIAGNOSTIC slot preserved. Real Store test verifies independent immutable slots. Producer and reader use exact class.
- Automatic replay: execution lock plus deterministic first-writer claim; immutable post-replay outcome artifact; independent budget/publication flags. Cold recovery refuses to reset a spent automatic replay budget. Operator recovery remains distinct.
- E2: pre-mount compensation exhaustion returns preparation-hold, handled by scheduler and continuation executor without throwing through the spawn wave. No synthetic mount reconciliation receipt.
- E3 foundation: backend reader revalidates admission/dispatch/provider exit, claim/outcome receipts, current release progress and diagnostic receipt; registry checks exact task/attempt/generation identity and re-reads evidence. No TaskResult is invented. Existing E077 guards remain intact.

## Verification

- Four targeted test files: 144/144 PASS, exit 0; e3-tests.log.
- TypeScript: npx tsc --noEmit, exit 0; tsc-final.log (empty success output).
- Store diagnostic focused run: 2 PASS, 176 skipped, exit 0; store-tests.log. Separate scope, not a full Store suite claim.
- No R34 build, production sprint, provider call, runtime settlement, commit or push.
- Registry tests use injected backend evidence; they do NOT prove real Store replay, Docker or restart closure.

## Outstanding exact work

1. Complete E1/E3 real Store replay/outcome proof, concurrent-monitor claim proof, cold rehydration and unknown release-diagnostic typed unreadable behavior. A spent claim without outcome stays HOLD; never silently replays.
2. E4 collector/IPC held set: finish independent B, leave dependent C unrun, no synthetic A result; preserve live custody until absence evidence.
3. E5 checkpoint/controller/lifecycle/restore/evaluate: verified EFFECT_HOLD parks resumably, contradictions still fatal, outer COMPLETE prohibited. All consumers must agree before weakening any E077 guard.
4. Real Docker pre-mount compensation -> NOT_DISPATCHED -> generation 2 proof.
5. Build and real A->C/B integration including restart, operator recovery and eventual settlement. Existing long-lived MCP binaries need coordinated reconnect after build; compatibility is not claimed.

766 recovery was measured in R33; R34 did not repeat or mutate that recovery. No new sprint until the above chain is proven.
