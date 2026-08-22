# DIRECTIVES — 7092 RECOVERY-TRUTH CONTINUATION CLOSURE

## Outcome

Sprint-621'in kanitli ABORTED settlement'indan kalan dort unresolved lineage'i ve bu
recovery sirasinda canli yakalanan uc engine seam'ini ayni RECOVERY-TRUTH-001 outcome'u
icinde kapat. Onceki sprintte landed production degisikliklerini yeniden yazma;
current disk truth ile `already-closed` ise exact testle pinle. Yeni feature admission yok.

## Global invariants

- Tek ACTIVE product outcome RECOVERY-TRUTH-001; baska MASTER isi bu run'a girmez.
- Source/test/artifact delete YOK. Canonical archive + digest-bound snapshot disinda task
  artifact tasinmaz.
- Canonical resume checkpoint explicit successor veya terminal receipt olmadan tasinmaz,
  temizlenmez ve yeniden uydurulmaz.
- Immutable exact-attempt evaluation receipt restartta replay edilir; changed shared-worktree
  uzerinde ayni attempt yeniden rubric degerlendirmesine sokulmaz.
- Checkpoint PENDING ile disk PAUSED drift'i terminal completion degildir.
- Result/checkpoint/status/finalizer authority CAS-fenced, FWW, restart-safe ve typed HOLD olur.
- Read-only status hicbir dosya veya DB olusturmaz.
- User-facing metin yalniz i18n katalogdan gelir.
- Task Test komutlarinda repo-global tsc/build/start/kill/cleanup/auth mutation YOK.
  Wave sonunda Brain root tsc, scoped battery, ratchet, real-binary smoke ve diff-check kosar.

## Task 1: Continuation current-truth inventory

Files: docs/evidence/RECOVERY-TRUTH-001-continuation-inventory-2026-08-22.md
Implement: Sprint-621 ABORTED receipt, archive/snapshot digest, dort unresolved lineage ve canli
recovery seam'lerini current diskten olc. Her biri icin producer, durable authority, consumer,
entrypoint, reproducer ve exact owner yaz. Secret/task payload kopyalama.
Test: `test -s docs/evidence/RECOVERY-TRUTH-001-continuation-inventory-2026-08-22.md && rg -n "621-015|621-016|621-019|621-020|ABORTED|snapshot" docs/evidence/RECOVERY-TRUTH-001-continuation-inventory-2026-08-22.md`
GO: Continuation DAG exact current truth ve file ownership ile kanitli.
NO_GO: Chat anlatimini disk kaniti yerine kullanmak.

## Task 2: Recovery sidecar projection parity pin

Dependencies: Task 1
Files: src/core/task-artifact-classifier.ts, tests/core/task-artifact-classifier.test.ts, tests/orchestra/projection-parity-artifacts.test.ts
Implement: `replan-proposal` dahil task protocol sidecar'lari shared classifier ile task-record'dan
ayir. Foreign/corrupt gercek `task-*.json` fail-closed kalir. Mevcut implementation already-closed
ise yeniden yazma, exact regressioni kosup kaniti raporla.
Test: `npx vitest run tests/core/task-artifact-classifier.test.ts tests/orchestra/projection-parity-artifacts.test.ts`
GO: Resume phantom task uretmez; foreign task projection parity'yi hala durdurur.
NO_GO: Broad suffix ignore veya tum malformed JSON'i yutmak.

## Task 3: Immutable evaluation receipt restart replay pin

Dependencies: Task 1
Files: src/orchestra/sprint-controller.ts, tests/orchestra/acceptance-controller-settlement.test.ts, tests/orchestra/dependency-pipeline.test.ts
Implement: Exact-attempt immutable receipt restartta evaluation authority olarak replay edilir;
receipt missing ise tek evaluation, corrupt/conflict ise typed HOLD. Existing receipt varken rubric
yeniden kosmaz ve dependent ayni verdict ile release olur. Already-closed ise yalniz proof pinle.
Test: `npx vitest run tests/orchestra/acceptance-controller-settlement.test.ts tests/orchestra/dependency-pipeline.test.ts`
GO: Receipt replay idempotent; verdict conflict overwrite edilmez.
NO_GO: Conflict ignore, result prose authority veya receipt rewrite.

## Task 4: Checkpoint PENDING to disk PAUSED resume parity

Dependencies: Task 1
Files: src/orchestra/sprint-checkpoint.ts, tests/orchestra/sprint-checkpoint.test.ts, tests/orchestra/completed-checkpoint-terminalizer-events.test.ts
Implement: Durable checkpoint PENDING/stale-active authority, onceki failed run disk projectionini
PAUSED biraksa da resumable kalir; absent result completion sayilmaz. Fully terminal checkpoint
terminalizer semantigi korunur. Already-closed ise exact regressioni pinle.
Test: `npx vitest run tests/orchestra/sprint-checkpoint.test.ts tests/orchestra/completed-checkpoint-terminalizer-events.test.ts`
GO: Absent PENDING task terminalizer'a false-complete olarak gitmez.
NO_GO: Tum PAUSED tasklari kosmak veya absent result icin sentetik DONE/NO_GO yazmak.

## Task 5: Recover force checkpoint-policy production wiring

Dependencies: Task 1, Task 4
Files: src/orchestra/sprint-recovery-operation.ts, src/cli/commands/recover.ts, src/cli/helpers/messages.ts, tests/orchestra/sprint-recovery-checkpoint-preservation.test.ts, tests/cli/recover-force-checkpoint-preservation.test.ts
Reads: src/core/recovery-artifact-policy.ts, tests/core/recovery-artifact-policy.test.ts
Implement: Canonical recovery mutation authority Task-14 policy decisionini ve digest-bound manifesti
kullanir. Resume checkpoint explicit distinct successor veya terminal receipt olmadan clear/move
edilmez. Dry-run ve apply ayni manifest/preservation dispositionini raporlar. PAUSED remediation
EN/TR i18n ile canonical resume/finalize commandini verir. Task residue archive davranisi korunur.
Test: `npx vitest run tests/orchestra/sprint-recovery-checkpoint-preservation.test.ts tests/cli/recover-force-checkpoint-preservation.test.ts`
GO: Sprint-595 reproducer recover-force sonrasinda checkpoint byte/digest ve resumability korunur.
NO_GO: Archive-then-recreate, suffix authority, silent checkpoint clear veya hardcoded string.

## Task 6: Status projection recovery reconciliation

Dependencies: Task 5
Files: src/core/sprint-status-authority.ts, tests/core/sprint-status-recovery-reconciliation.test.ts
Implement: PAUSED projection ile checkpoint/terminal receipt uyusmazligini side-effect-free read
modelde typed `projection-stale`, `checkpoint-missing`, `successor-available` olarak ayir.
Remediation canonical recover/resume/finalize commandini verir; read path byte-identical kalir.
Test: `npx vitest run tests/core/sprint-status-recovery-reconciliation.test.ts`
GO: Sprint-595 artigi ACTIVE/resumable diye yanlis gosterilmez.
NO_GO: Read-time repair/write veya generic ORPHANED etiketi.

## Task 7: Recovery truth nine-case end-to-end matrix

Dependencies: Task 2, Task 3, Task 5, Task 6
Files: tests/orchestra/recovery-truth-nine-case.integration.test.ts, tests/cli/recovery-truth-real-binary.integration.test.ts
Implement: Production imports ve hermetic async child process ile dokuz vakanin producer→authority→
consumer→entrypoint→terminal zincirini kanitla. Restart, duplicate process, corrupt bytes, foreign
generation, Windows path adapteri, checkpoint preservation, stale gate ve 10k bounded projection/
replay olcumu dahil. Mock-only canonicalization veya fixture-local reimplementation yok.
Test: `npx vitest run tests/orchestra/recovery-truth-nine-case.integration.test.ts tests/cli/recovery-truth-real-binary.integration.test.ts`
GO: Dokuz vaka exact terminal/typed-HOLD verir; replay/no-delete ve real binary kanitli.
NO_GO: Fake CLI, relaxed threshold, sync child process veya fixed-clock flake.

## Task 8: Recovery authority ratchet and result evidence

Dependencies: Task 7
Files: scripts/lint-recovery-truth-authority.mjs, tests/scripts/lint-recovery-truth-authority.test.ts, docs/evidence/RECOVERY-TRUTH-001-result-2026-08-22.md
Implement: Direct task-result writer, exit-code success authority, checkpoint glob-clear/archive,
stale gate reuse, unconsumed proposal, receipt re-evaluation ve unbounded recovery scan siniflarini
syntax-aware fail-closed ratchetle engelle. Result evidence dokuz vaka, scale, binary, snapshot,
ABORTED→continuation lineage ve honest residual dispositionunu kaydetsin.
Test: `npx vitest run tests/scripts/lint-recovery-truth-authority.test.ts && node scripts/lint-recovery-truth-authority.mjs`
GO: Current tree clean; seeded ihlaller deterministic fail ve evidence tam.
NO_GO: Comment-only lint, baseline suppression, false DONE veya MASTER mutation.

## Wave closure

Brain Task 8 sonrasinda `npx tsc --noEmit`, tum 7092 scoped battery, authority ratchet,
`git diff --check`, targeted writer/gate/checkpoint grep ve real-binary recovery smoke kosar.
Formal XVerify same-provider kullanmaz; equal-or-higher different-provider yoksa typed
`unavailable/HOLD` kaydeder. Sprint terminal olmadan build yok. MASTER/current-flow/evidence,
landing gates, commit ve bot restart root landing tarafinda yapilir.
