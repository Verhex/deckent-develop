# XVERIFY-ONARIM DALGASI — evidence-scope CLI koku · producer-fence tabani · hold-detail gorunurlugu

## Goal

XVerify adjudicator'inin uc AYRI koku kapanir ve formal muhur yolu yeniden acilir:
(A) CLI `--diff` kaniti evidence-scope'a path-listesi olarak girer ve remedy bastirilmaz
(`xverify_v2_evidence_scope_missing` CLI-koku); (B) producer-fence karsilastirma TABANI
duzeltilir — settled taraf da ayni normalizer'dan gecer ve brain-authored downstream
alanlarin `null -> deger` gecisi yasal sayilir; 7-elemanli allowlist'e DOKUNULMAZ
(`xverify_producer_result_mismatch` kronik koku — 5 sprint ust-uste, 17 ledger-vakasi);
(C) ingress `hold()` detail'i dondurur — `divergingFields` ledger/rapora ulasir (bugune
kadar A ile B ayni gorunuyordu). RCA: .analysis/xverify/hold-details.jsonl + settled.json
vs arsiv-result ampirik diff (674/676-001 ayni 4 alan).

## Execution contract

- Otorite: main'deki kontratlar; assertion zayiflatilmaz. Kesif-referanslari task
  Description'larinda exact dosya:satir olarak verilmistir — once oku, sonra degistir.
- Yalniz kendi Files listendeki dosyalara yaz; Reads listendekileri OKU. Scope disina cikma.
- XVERIFY doktrini AYNEN korunur: XVERIFY_PRODUCER_ENRICHMENT_FIELDS 7 elemani
  BUYUTULMEZ (tam-esitlik pini fencing-test :267-295); `testsPassed` worker-authorable
  siniftadir ve allowlist'e ASLA girmez — onun cozumu taban-normalizasyonudur, muafiyet degil.
- 0-hardcode; user-facing yeni satirlar getMessage (en+tr); typed hata/uyari factory'lerle.
- Testler hermetik (tmpdir); VITEST_MAX_FORKS=2. Degistirdigin dosyalar icin
  `npx tsc --noEmit` SIFIR hata; tsc ciktisini result notes'a yaz.
- Aktif run sirasinda build/provider-auth/bot mutation YASAK.

## Task 1: CLI evidence-scope koku — diff path-listesi + remedy bastirmama
- Files: src/cli/commands/xverify.ts, tests/cli/xverify-evidence-scope.test.ts
- Reads: src/orchestra/cross-verify-runtime-bootstrap.ts, src/orchestra/cross-verify-runner.ts, tests/orchestra/cross-verify-evidence-preparation.test.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/xverify-evidence-scope.test.ts
### Description
Kok: xverify.ts:583 `filesChanged` yalniz `--files`+`--target`'tan turetiliyor; `--diff`
(:588-602) yalniz prose `evidenceContext`'e donusuyor ve v2 broker prose tuketemiyor —
`--files`siz cagrida bootstrap :199-201 `relativePaths.length===0` ile deterministik
`xverify_v2_evidence_scope_missing`. Ayrica :603 `hasEvidence` `Boolean(opts.diff)` ile
true olup :892'deki remedy'yi bastiriyor — operator hem sonucsuz hem yonlendirmesiz kaliyor.
Onarim: (a) `--diff` verildiginde `defaultCaptureDiff`'in zaten cagirdigi git'e (:217) ek
tek `git diff --name-only HEAD` cagrisiyla path-listesi turet ve `filesChanged` kumesine
KAT (mevcut `--files`/`--target` davranisi aynen; birlesim dedupe); boylece
`scope.filesRead` (:636) ve `result.filesChanged` (:654) dolu gider. (b) :603'ten
`Boolean(opts.diff)` terimini KALDIR — diff tek basina evidence sayilmaz, remedy gorunur
kalir (diff artik (a) uzerinden path'lere donustugu icin bilgi kaybi yok). YENI hermetik
test 3 it: (1) tmpdir git-repo'da degisiklikli dosyayla `--diff` cagri-kompozisyonu
`filesRead` NON-EMPTY uretir (bootstrap'a giden input pinlenir); (2) `--files` verilen yol
aynen korunur ve diff-path'lerle birlesir; (3) ne `--files` ne `--diff` varken remedy
metni BASTIRILMAZ.

## Task 2: producer-fence tabani + hold-detail gorunurlugu
- Files: src/orchestra/cross-verify-production-ingress-authority.ts, tests/orchestra/xverify-producer-fencing.test.ts, tests/orchestra/cross-verify-production-ingress-authority.test.ts
- Reads: src/core/task-result-schema.ts, src/orchestra/result-ingress.ts, src/orchestra/sprint-phases.ts, src/orchestra/cross-verify-runner.ts, src/core/task-result-settlement.ts, src/core/config-types.ts, src/core/provider-authority-composition.ts, src/core/task-types.ts
- Priority: HIGH
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/xverify-producer-fencing.test.ts tests/orchestra/cross-verify-production-ingress-authority.test.ts
### Description
Kok (ampirik, 674/676-001 ozdes): compareProducerFencedResult (:243, mekanik :167-204)
settled-byte'lari EVALUATE-kopyasiyla anahtar-BIRLESIMI uzerinde karsilastiriyor; dort alan
yapisal iraksiyor — `testCommands`/`testsPassed` disk-read normalizer'inin
(`normalizeTaskResultShape`, task-result-schema.ts:567-568/:585-586) projeksiyonu (settled
taraf normalizer'dan GECMEDEN yazilmis: result-ingress.ts:81-149) ve
`brainEvaluation`/`brainEvaluationReason` brain'in EVALUATE'te doldurdugu downstream
alanlar (sprint-phases.ts:1173; cross-verify cagrisi :2378'de SONRA geliyor). Onarim: (a)
fence'ten once settled tarafi da `normalizeTaskResultShape`'ten gecir (normalizer
asimetrisi biter — testCommands/testsPassed sahte-iraksamasi kapanir). (b) YENI
`XVERIFY_DOWNSTREAM_AUTHORED_FIELDS` sabiti (yalniz `brainEvaluation`,
`brainEvaluationReason`): karsilastirmada settled-taraf null iken evaluate-taraf dolu ise
gecis YASAL sayilir; settled'da DEGER varken farkli-deger HALA mismatch (dokrin:
task-result-schema.ts:11 brain-authored yorumu). 7-elemanli
XVERIFY_PRODUCER_ENRICHMENT_FIELDS sabitine DOKUNMA (:267-295 tam-esitlik pini). (c)
hold() (:262-278) donen objeye `detail` alanini da yazar (tip zaten destekliyor,
runner:316); runner:1407 boylece gercek `divergingFields` listesini ledger/rapora tasir —
davranis-notrluk: karar/reasonCode DEGISMEZ, yalniz detail zenginlesir. Test
yeniden-ifadesi: fencing-testindeki `enrichedResult()` fixture'i (:64-93) GERCEK
EVALUATE-kopyasini modelleyecek sekilde brain/normalizer alanlarini da icerir (bu fixture
bugune kadar arizanin kendisiydi); YENI pinler: normalizer-simetrisi sahte-mismatch
uretmez; downstream null-to-deger gecer; downstream deger-to-farkli-deger MISMATCH; gercek
worker-alani farki (orn. filesChanged) HALA mismatch; hold-detail divergingFields tasir.
