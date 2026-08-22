# DIRECTIVES — 9040 ENFORCE-CANARY AUTHORITY-RESTART CLOSURE

## Outcome

Sprint-618'in `ABORTED` terminal receipt'indeki iki unresolved lineage'i, diskte zaten
LOCAL_VERIFIED olan acceptance-confirmation foundation'i yeniden yazmadan tamamla. Yeni disk
kaniti: human kararinin restart verifier'i broker MAC authority'sine baglandi; ancak LLM terminal
karari terminal store'a yazildiktan sonra PREPARED/APPLIED'dan once process duserse yalniz
`cross-verify-verdict:sha256:*` ref'i kalir ve restart reconciler exact settlement ref'i bulamaz.
Bu boslugu bounded, indexed, fail-closed authority binding ile kapat; sonra serve ownership ve
authority duplication ratchet'ini tamamla.

## Global invariants

- Source evaluation verdict immutable kalir. Yalniz source `UNDECIDABLE` ve non-expired,
  authenticated, exact-lineage `CONFIRMED` karari provisional acceptance debt'ini resolve eder.
- Full lineage zorunlu: `tenantId`, `projectId`, `sprintId`, `taskId`, `attemptId`, `generation`,
  `confirmationId`, `resultDigest`, `evaluationDigest`, `policyDigest`, `sourceDigest`.
- PREPARED receipt debt CAS'tan once, APPLIED receipt CAS'tan sonra yazilir. APPLIED yoksa
  CLI/API/audit success yazamaz.
- Human authority yalniz authenticated ApprovalDecision MAC envelope'idir. LLM authority yalniz
  genuine `cross-verify-verdict:sha256:*` + typed host adjudication + exact task settlement ref'tir.
  Provider prose, bool seam veya filesystem scan authority degildir.
- LLM binding terminal confirmation write'inden ONCE private, immutable, first-writer-wins ve
  canonical-digestli yazilir; restart read O(1) indexed olur. Foreign tenant/project/lineage,
  mismatched verdict/ref veya corrupt binding fail-closed kalir.
- Origin first-writer-wins terminal truth'tur. Late/replayed/foreign karar effect uretemez.
- Read surface mutation yapmaz. MCP decision surface eklenmez.
- `deckent serve`, approval human authority disabled/HOLD olsa bile mevcut LLM settlement
  intent'lerini reconcile edebilir; human branch bu durumda fail-closed kalir.
- User-facing string hardcode edilmez; EN/TR `getMessage` kullanilir.
- ADR-G-041: tek kernel/runtime lineage; Enterprise icin ikinci authority, scheduler veya
  evidence chain yoktur.
- Task Test komutlarinda repo-global `tsc`, `npm run build`, `build:all`, sprint
  start/kill/cleanup veya auth mutation YOK. Wave sonunda Brain bunlari ayri kosar.

## Foundation evidence

- Sprint-618 terminal receipt: `ABORTED`; Task 2 DONE, Task 3 exact battery 2 files/7 tests green;
  controller eski 618-001 receipt identity ile `SETTLEMENT_RECEIPT_CONFLICT` verdi.
- Root bounded recovery: `npx tsc --noEmit` green; serve/API exact battery 2 files/7 tests green.
- Task 3 scale: 10,000 APPLIED first pass 4.431s, replay 2.409s; unchanged 10s bound.

## Task 1: Durable LLM authority binding and restart verifier

Provider: codex
Model: gpt-5.6-sol
Files: src/core/acceptance-decision-authority.ts, src/orchestra/acceptance-confirmation-composition.ts, src/cli/commands/xverify.ts, src/cli/commands/confirmations.ts, tests/core/acceptance-decision-authority.test.ts, tests/cli/confirmations-acceptance-service.test.ts, tests/orchestra/acceptance-confirmation-composition.test.ts
Implement: `XverifyResult` yalniz runner'in `validatedAdjudicationReceipt.receipt` bytes'indan exact
`TaskResultSettlementRefV1` projekte etsin. LLM settlement oncesi confirmation full-lineage + verdict
+ receiptRef + settlementRef private FWW binding'e yazilsin. Canonical verifier indexed binding'i
fresh-read edip `readCrossVerifyVerdictReceipt` ile genuine host receipt, effective verdict,
receipt ref, tenant/project/full-lineage ve digest parity'yi yeniden dogrulasin. Human broker MAC
verifier ayni canonical factory'nin ayri branch'i olsun. Scan, provider prose, prefix-only kabul,
consumer-local digest veya fake receipt yasak.
Test: `npx vitest run tests/core/acceptance-decision-authority.test.ts tests/cli/confirmations-acceptance-service.test.ts tests/orchestra/acceptance-confirmation-composition.test.ts`
GO: Crash terminal-write ile PREPARED arasinda olsa bile restart exact LLM receipt'i O(1) bulur ve
APPLIED'a ilerler; corrupt/foreign/mismatch/replay fail-closed kanitli.
NO_GO: Yalniz in-memory boolean, directory scan, unverifiable ref veya raw store settle.

## Task 2: Serve dual-authority default composition and ownership

Provider: codex
Model: gpt-5.6-sol
Dependencies: Task 1
Files: src/cli/commands/serve.ts, src/api/server.ts, tests/cli/commands/serve-acceptance-composition.test.ts, tests/api/acceptance-confirmation-runtime-wire.test.ts
Implement: `deckent serve` resolved tenant/project/lifecycle/clock ile production reconciler'i her
zaman acar; verifier Task 1 canonical factory'sidir. Approval runtime ready ise human MAC branch'i
eklenir, disabled/HOLD ise yalniz human branch fail-closed olur ve durable LLM drain calisir. API
tick production reconciler'i dogrudan tuketir; structured audit durable yazilir. Shutdown sirasi API
driver stop + in-flight drain, sonra reconciler/approval/provider exactly-once close'dur. Startup
partial ownership all-settled kapanir.
Test: `npx vitest run tests/cli/commands/serve-acceptance-composition.test.ts tests/api/acceptance-confirmation-runtime-wire.test.ts`
GO: Default serve restart drain, dual authority, audit ve ownership closure behavior ile kanitli.
NO_GO: OIDC verifier'i decision verifier sanmak, injection-only runtime veya concurrent early close.

## Task 3: Authority duplication ratchet

Provider: codex
Model: gpt-5.6-sol
Dependencies: Task 2
Files: scripts/lint-acceptance-confirmation-authority.mjs, tests/scripts/lint-acceptance-confirmation-authority.test.ts
Implement: Duplicate identity/receipt/reducer/digest/authority-binding declarationlarini, forbidden
casts'i, direct confirmation/debt settlement bypass'ini, unindexed reconciler adapterini,
prefix-only xverify trust'ini ve non-i18n surface textini syntax-aware ratchet ile engelle. Exact
allowlist comment zorunlu; broad baseline suppression yok. Closure battery komutunu outputta listele.
Test: `npx vitest run tests/scripts/lint-acceptance-confirmation-authority.test.ts && node scripts/lint-acceptance-confirmation-authority.mjs`
GO: Current tree clean ve seeded violations cross-platform deterministic fail.
NO_GO: Broad grep false positive, baseline suppression veya canonical authority duplication survives.

## Task 4: End-to-end restart, race and real composition proof

Provider: codex
Model: gpt-5.6-sol
Dependencies: Task 3
Files: tests/orchestra/acceptance-authority-restart.integration.test.ts, tests/orchestra/acceptance-all-surface-closure.integration.test.ts, tests/core/acceptance-confirmation-race-scale.integration.test.ts
Implement: Production imports ile human broker-MAC ve LLM typed-host receipt yollarinda
producer -> confirmation -> authority binding/decision -> process restart -> PREPARED -> debt CAS
-> APPLIED -> audit zincirini; expiry race, foreign tenant/project, corrupt binding, duplicate tick,
no replay/no leak ve mevcut 10,000 <=10s sinirini kanitla. Fixture-local canonicalization yok.
Test: `npx vitest run tests/orchestra/acceptance-authority-restart.integration.test.ts tests/orchestra/acceptance-all-surface-closure.integration.test.ts tests/core/acceptance-confirmation-race-scale.integration.test.ts`
GO: Her iki authority yolu restart sonrasi production composition ile exact APPLIED veya typed HOLD.
NO_GO: Mock-only end-to-end, relaxed threshold, fabricated receipt veya bypass.

## Wave closure

Brain, Task 4 sonrasinda tek dalga olarak `npx tsc --noEmit`, tum 9040 scoped battery,
authority ratchet ve `git diff --check` kosar. XVerify same-provider kullanmaz; available
different-provider verifier author capability'sinden dusukse typed unavailable/HOLD yazilir. Build,
bot restart ve real-binary smoke yalniz terminal settlement sonrasinda root landing tarafinda yapilir.
