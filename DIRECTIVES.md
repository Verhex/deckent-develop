# PROMPT-CANARY BENCH RUN (7094 A/B TWIN — BAYT-AYNI TANIM)

## Goal

7094 prompt-cost canary A/B olcumu icin karsilastirilabilir gercek-workload run'i:
`src/core/prompt-canary-bench.ts` icindeki BENCH_CASES listesine mevcut sekli birebir
yansitan TAM BIR sonraki sirali case eklenir ve suite yesil tutulur. Bu tanim iki kez
(baseline ve candidate cohort'lari icin) bayt-ayni kosulur; workload-kimligi degismez.

## Execution contract

- DOGFOOD_MODE=ON; tek active outcome bu olcum-workload'udur. Yeni MASTER root/outcome acilmaz.
- Files listeleri exact path tasir; glob yoktur. Tek gorevlik run'dir.
- Direct manual source edit yoktur. `.deckent/runtime/*`, `follow-up-works/*`,
  `docs/MASTER-PLAN.md` kapsam disidir.
- Aktif run sirasinda build, full suite, provider auth/config/bot mutation yoktur.
  Testler hermetik; local forks en cok 2.
- i18n ve 0-hardcode kurallari aynen gecerli; bench modulu production-inert kalir.

## Task 1: Append the next sequential bench case
- Files: src/core/prompt-canary-bench.ts, tests/core/prompt-canary-bench.test.ts
- Reads: src/core/prompt-canary-bench.ts
- Dependencies: none
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/prompt-canary-bench.test.ts
### Description
BENCH_CASES listesine TAM BIR yeni case ekle: id mevcut en-buyuk id'nin bir fazlasi;
input kucuk-harf tek-kelime yeni bir deger; expected alani benchTransform semantigiyle
(ters-cevir + buyuk-harf) birebir dogru. Mevcut case'ler ve fonksiyon BAYT-AYNI korunur.
Test dosyasindaki iki mevcut beklenti yeni case'i otomatik kapsar; ek olarak yeni case'in
id'sini acikca pinleyen TEK kucuk assertion ekle. Declared test komutu 0 fail vermelidir.
