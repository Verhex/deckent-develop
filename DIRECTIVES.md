# DIRECTIVES — FINALIZER-ACCEPTANCE-CANARY MULTI-TASK WAVE

## Outcome

Normal dogfood finalizer zincirini üç bağımsız acceptance faceti ve planner admissionını bloke eden iki fresh-stale critical debt revalidation taskı ile paralel çalıştır. Bu wave tek product outcome taşır: canonical archive finalizer acceptance. Worker faceti yalnız bounded evidence document üretir. Terminal settlement sonrasında host gerçek run arşivini, manifest ve hash integrity durumunu, Brain archive index ve summary refresh durumunu, idempotent reconcile sonucunu ve legacy raw-write negative space durumunu bağımsız doğrular.

Runtime hygiene formal different-provider XVerify 2026-08-24 20:00 Europe/Istanbul sonrasına ertelenmiştir. Bu run formal runtime-hygiene DONE, Closure veya release iddiası üretmez.

## Invariants

- Üç canary task bağımsızdır, dependency taşımaz ve exact ayrı evidence file yazar.
- Product source, tests, config, auth ve provider state canary taskları tarafından değiştirilmez.
- Planner tarafından canonical biçimde injected stale-debt revalidation taskları yalnız kendi inherited exact scope sınırında fresh disk truth ölçer. Green truth varsa no-op settlement üretir; yeni unrelated implementation yapmaz.
- Aktif run sırasında build, provider auth mutation ve XVerify çağrısı yapılmaz.
- .brain/memory.db silinmez veya taşınmaz. .tasks içeriği rm ile temizlenmez.
- Finding başka outcome kapsamındaysa result notes içinde RELATED_BUT_NONBLOCKING olarak raporlanır.

## Task 1: FAC01-ARCHIVE Canonical archive wiring and integrity contract

Files: docs/evidence/finalizer-acceptance-canary-2026-08-23/01-archive-wiring.md
Reads: docs/evidence/STATE-ARCHIVE-RESTORE-001-canonical-sprint-archive-2026-08-22.md, src/core/sprint-archive.ts, src/orchestra/sprint-finalizer.ts, src/cli/commands/archive.ts
Implement: Fresh source truth ile canonical raw archive producer to consumer to finalizer to CLI verification zincirini incele. Exact source references, manifest family and digest invariants, targeted archive verify acceptance, terminal-outcome honesty and archive failure false-COMPLETE guardını bounded evidence document olarak kaydet. Kod veya başka doküman değiştirme.
Test: git diff --check -- docs/evidence/finalizer-acceptance-canary-2026-08-23/01-archive-wiring.md
GO: Evidence document exact production wiring zincirini ve post-terminal live checks listesini source-backed taşır; yalnız exact file değişir; build, XVerify ve auth mutation yok.
NO_GO: Wiring uydurulur, başka file değişir, legacy path yazılır veya formal DONE ya da Closure iddia edilir.

## Task 2: FAC02-BRAIN Brain archive index, summary and idempotency contract

Files: docs/evidence/finalizer-acceptance-canary-2026-08-23/02-brain-index-summary.md
Reads: docs/evidence/STATE-ARCHIVE-RESTORE-001-canonical-sprint-archive-2026-08-22.md, src/core/sprint-archive.ts, src/orchestra/sprint-finalizer.ts, src/core/memory-store.ts
Implement: Fresh source truth ile compact archive index producer, Memory DB upsert identity, guarded summary export ordering ve second reconcile idempotency contractını incele. Post-terminal host proof için searchable archive row, raw-payload exclusion, summary refresh ve zero-publish plus unchanged Memory DB digest acceptanceını bounded evidence document olarak kaydet. Kod veya başka doküman değiştirme.
Test: git diff --check -- docs/evidence/finalizer-acceptance-canary-2026-08-23/02-brain-index-summary.md
GO: Evidence document Brain index and summary chain ile idempotency acceptanceını exact source references ile taşır; yalnız exact file değişir; build, XVerify ve auth mutation yok.
NO_GO: Raw task payloadın Brain rowunda olması kabul edilir, ordering uydurulur, başka file değişir veya formal DONE ya da Closure iddia edilir.

## Task 3: FAC03-NEGATIVE-SPACE Legacy raw-write and residue negative-space contract

Files: docs/evidence/finalizer-acceptance-canary-2026-08-23/03-legacy-negative-space.md
Reads: docs/evidence/STATE-ARCHIVE-RESTORE-001-canonical-sprint-archive-2026-08-22.md, src/core/sprint-archive.ts, src/core/sprint-file-retention.ts, src/orchestra/sprint-finalizer.ts
Implement: Fresh source truth ile live task retirement, conflict preservation, canonical-only publication ve legacy archive negative-space contractını incele. Host baseline comparisonı için live .tasks residue, .brain/archive task pathleri, .tasks/archive, recently-works ve canonical archive root acceptanceını bounded evidence document olarak kaydet. Kod veya başka doküman değiştirme.
Test: git diff --check -- docs/evidence/finalizer-acceptance-canary-2026-08-23/03-legacy-negative-space.md
GO: Evidence document cleanup safety, conflict preservation ve legacy no-new-raw-write acceptanceını source-backed taşır; yalnız exact file değişir; build, XVerify ve auth mutation yok.
NO_GO: rm cleanup önerilir, conflict kaybı kabul edilir, başka file değişir, legacy path yazılır veya formal DONE ya da Closure iddia edilir.

## Host post-terminal acceptance

- Live .tasks rootunda settled sprint-owned task, result, log, prompt veya worker residue kalmaz.
- Canonical .deckent/archive/sprints allocated-id manifest gerçek terminal outcome ve family counts taşır.
- Targeted deckent archive verify sonucu ok true, missing, mismatched ve untracked boş, manifestDigestValid true olur.
- Compact archive allocated-id Brain rowu ve refreshed summary or index searchable olur; raw payload Brain rowuna kopyalanmaz.
- İkinci reconcile zero-publish olur ve Memory DB digestini değiştirmez.
- Legacy .brain/archive task pathleri, .tasks/archive ve recently-works baseline count and digest değerleri değişmez.
- Archive or finalizer failure false COMPLETE yerine typed terminal-evidence failure üretir.