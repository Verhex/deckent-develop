# DIRECTIVES — SPRINT-414: RC-4 RELEASE-INTEGRITY + SCHED-4 SHADOW-REDUCER

## Goal
RC-treni dilim-4 (543: REL-01/02/03/04 + SEC-06 — tag-bütünlüğü, CI-attestation, SHA-pin,
trusted-publishing, changelog-kanonikliği) + SCHED-treni dilim-4 (527: full reducer SHADOW-only).
Tasarım-SSOT: `docs/analysis/beta-blocker-sweep-2026-07-11.md` + `docs/analysis/scheduler-unify-design-2026-07-11.md`.
DURUM: validate:publish 8/8 tam-yeşil (sprint-413) — release-yolunun kendisi bu sprint'in konusu.
⚠️ Workflow-pin kör-noktaları: tests/github/ + tests/docs/ + tests/workflows/ ÜÇ ayrı dizin
workflow-şekillerini pinler — workflow değiştiren task bu üçünü de senkronlar.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST: fix'ten önce hatalı davranışı RED testle kanıtla.
- i18n-FIRST (user-facing CLI metni); workflow/script iç-log'ları EN serbest.
- Test hermetik: tmpdir, async spawn, ≤16GB.

## Task 1: RC4A — release.yml bütünlük-zinciri: tag-eşitliği + required-CI attestation + SHA-pin + trusted-publishing (REL-01/02 + SEC-06)
- Model: sonnet | Effort: high | Provider: claude
- Files: .github/workflows/release.yml, .github/workflows/publish.yml, tests/github/release.test.ts, tests/workflows/publish.test.ts, tests/docs/release-docs.test.ts
- Scope: .github/workflows/, tests/github/, tests/workflows/, tests/docs/
- Dependencies: none
### Description
KANIT (sol-sweep + CC spot): (a) REL-01: workflow HER v*-tag'ini package/lock equality kontrolsüz
publish eder (release.yml:~49 tag-trigger; version-check adımı YOK); (b) REL-02: yalnız
governance+core smoke koşar (:~91) — tag-commit'in FULL required-CI'dan geçtiği kanıtlanmaz
(yorumdaki 'main zaten gated' varsayımı yürütülebilir-contract değil — tag herhangi bir commit'e
atılabilir); (c) SEC-06: floating action-tag'ler (@v4/@v2/@v3) + OIDC id-token:write YANINDA
uzun-ömürlü NPM_TOKEN (:117). GÖREV: (1) publish-job'ın BAŞINA 'verify-release-integrity' adımı:
tag == package.json version == package-lock.json version (üçlü exact-equality; uyuşmazlık →
adlı-hata + fail) + registry-occupancy preflight (`npm view deckent@$VERSION version` → varsa
DUR: immutable-registry çifte-publish koruması; network-hatası dürüst-warn+devam); (2)
'verify-ci-attestation' adımı: `gh run list --commit $GITHUB_SHA --workflow CI` → conclusion
success ŞART (yoksa/failure → fail; gh token permission'ını kontrol et — GITHUB_TOKEN yeterli);
(3) TÜM uses: action'ları immutable commit-SHA'ya pinle (`uses: owner/repo@<40-hex> # vX.Y.Z`
yorumuyla — mevcut major-tag'lerin bugünkü SHA'larını çöz); (4) NPM_TOKEN kaldırılır → npm
trusted-publishing/OIDC (id-token:write mevcut; `npm publish --provenance` OIDC ile token'sız —
registry-side trusted-publisher ayarının Alperen'in npmjs.com'da yapması gereken adım olduğunu
notes'a ve workflow-yorumuna AÇIKÇA yaz; ayar yoksa publish'in nasıl hata vereceğini belirt —
sessiz değil); (5) release-notes adımı ROOT CHANGELOG.md'den okur + EXACT-ANCHORED eşleşme (escape'li tam-başlık;
'1.0.0-beta.1' regex'inin '1.0.0-beta.1-sprint410' başlıklarını da yakalayan prefix-tuzağı ÖLÜR;
bölüm-boş VEYA duplicate-başlık → FAIL, sessiz-boş-notes YASAK) — Task-2 kanonik-dosyaları
hazırlar, workflow-tarafı SENİN tek-sahipliğinde; (6) üç pin-dizinini yeni şekle senkronla
(adım-adları/sırası/koşulları). RED-first: mevcut şeklin 'version-check'siz + NPM_TOKEN'lı +
prefix-parser'lı' olduğunu pinleyen testler önce güncellenir (envanter notes'a).
### goNogo
- goCriteria: üçlü-equality + occupancy-preflight + CI-attestation adımları YAML'da ve üç pin-dizini senkron-testli; sıfır floating action-tag (SHA+yorum); NPM_TOKEN referansı sıfır; trusted-publisher registry-side gereksinimi dürüstçe belgelenmiş; tests/github+workflows+docs yeşil.
- nogo: publish-adımı attestation'sız ulaşılabilir kalırsa NO_GO; herhangi bir action floating kalırsa NO_GO; yerel npm publish denemesi yapılırsa NO_GO.

## Task 2: RC4B — changelog-kanonikliği + release-prepare (REL-03/04): tek-kaynak notes + bump-version retire
- Model: sonnet | Effort: medium | Provider: claude
- Files: CHANGELOG.md, docs/CHANGELOG.md, scripts/release-prepare.mjs, scripts/bump-version.sh, tests/release/release-prepare.test.ts
- Scope: CHANGELOG.md, docs/, scripts/, tests/release/
- Dependencies: Task 1
### Description
KANIT (sol-sweep REL-03/04 + CC spot): (a) çelişen kanoniklik — root CHANGELOG.md 'tam liste
docs/'ta' der (satır 3), docs/CHANGELOG.md kendini root'a yönlendirir AMA en-güncel sprint-girişleri
docs'ta yaşar; (b) release.yml notes-parser'ı awk PREFIX-match (:~105): '1.0.0-beta.1' regex'i
'1.0.0-beta.1-sprint410' başlıklarını da yakalayıp ilk-100-satırı birleştirir; (c) bump-version.sh
prerelease-metadata'yı atar, yalnız package.json değiştirir, elle 'npm publish' önerir —
sole-authority modeline aykırı; (d) root-CHANGELOG MRR'yi dependency-satisfying diye anlatır —
scheduler-truth.ts:10 ile ÇELİŞİR (born-610 sonrası bayat). GÖREV: (1) kanoniklik-kararı uygula:
root CHANGELOG.md = RELEASE-notes kanoniği (versiyon-başlıklı bölümler), docs/CHANGELOG.md =
otomatik sprint-günlüğü (başına net rol-bandosu; sprint-finalizer'ın docs'a yazmaya devam ettiğini
BOZMA — yalnız açıklama-başlığı); (2) workflow'un notes-adımı SENİN kapsamın DEĞİL (Task-1 yapar) —
sen root-CHANGELOG'un exact-anchor'lanabilir bölüm-formatını garanti et (tekil, tam-başlıklı,
boş-olmayan versiyon-bölümü); (3) scripts/release-prepare.mjs (node): --version vX.Y.Z[-pre] alır → package.json + package-lock
(her iki version-alanı) + root-CHANGELOG yeni-bölüm-iskeleti ATOMIC günceller (tag ATMAZ, publish
ETMEZ — bunlar workflow-authority); prerelease-metadata'yı doğru taşır; bump-version.sh İÇİ
retire-stub'a döner (çağrılırsa: 'retired — use release-prepare.mjs' + exit 1; dosya-silme YOK,
tarih-notu); (4) root-CHANGELOG MRR-açıklaması scheduler-truth gerçeğine düzeltilir (MRR
terminal-non-satisfying, born-610); (5) test: release-prepare round-trip (tmpdir kopya-fixture;
üç dosya senkron + prerelease korunur) + root-CHANGELOG bölüm-formatı doğrulaması (tekil-başlık,
boş-değil — Task-1'in exact-anchor parser'ının tüketeceği kontrat).
### goNogo
- goCriteria: kanoniklik-bandoları iki dosyada; release-prepare atomic+testli (tag ve publish yapmaz); bump-version retire-stub; MRR-metni düzeltilmiş; bölüm-format kontratı testli; tests/release yeşil.
- nogo: sprint-finalizer'ın docs-changelog yazımı kırılırsa NO_GO; script tag veya publish mutasyonu yaparsa NO_GO.

## Task 3: SCHED4 — full reducer SHADOW-only + differential journal (strangler dilim-4)
- Model: sonnet | Effort: high | Provider: claude
- Files: src/orchestra/scheduler-reducer.ts, src/orchestra/scheduler-driver.ts, src/orchestra/scheduler-journal.ts, src/orchestra/result-collector.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/scheduler-shadow-equivalence.test.ts
- Scope: src/orchestra/, src/core/config-types.ts, src/core/config.ts, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): `docs/analysis/scheduler-unify-design-2026-07-11.md` — Net-Öneri şeması +
Sprint-4 dilimi + Riskler. GÖREV (EXECUTION-ETKİSİ SIFIR — yalnız gözlem): (1) YENİ
scheduler-reducer.ts: `reduceSchedulerTick(snapshot)` PURE (fs, env ve Date.now importu YOK) —
SchedulerSnapshot (trigger kind+sequence, strategy, nowMs, costStop, slotBudget, ordered-queue
KOPYASI, statuses, collected/assigned setleri, effective-dependency-state [sprint-411 helper'ı
KULLAN], collision-blockers, retry-deadlines) → SchedulerDecision { nextQueue, dispositions,
orderedEffects[SpawnTask·KillWorker·CascadeSkip·Blocked·ClearBlocked·EmitMetric·WriteCheckpoint] };
davranış-modeli MEVCUT canlı closure'ların semantiği (planDispatch modelinden yararlan ama
tasarım-doc'un boşluk-matrisindeki eksiklerini [collision/retry/cascade] snapshot-girdileriyle
kapat); (2) scheduler-driver.ts: shadow-koşucu — canlı tick'lerin yanında AYNI verinin immutable
klonundan (queue MUTLAKA klon — canlı planDispatch remainingQueue'yu mutate eder, tasarım-doc
riski) reducer'ı koşar; (3) scheduler-journal.ts: `.deckent/runtime/scheduler-shadow/<sprintId>.jsonl`
append — her tick: {seq, trigger, legacyDecision-özeti, reducerDecision-özeti, divergence:[]}
(fail-soft: journal-hatası canlıyı ASLA etkilemez); (4) result-collector'ın watcher-tick'ine
flag'li kanca: config `scheduler.shadow_reducer` (default FALSE — config-types+config üçlü-desen;
dogfood'ta elle açılacak); flag-kapalıyken sıfır-yeni-davranış (testle pinle); (5)
shadow-equivalence testi: sentetik sprint-fixture'larında (DONE/NO_GO/MRR/fix/retry/cost-stop
kombinasyonları) legacy-closure kararları vs reducer kararları — bilinen-eşdeğer vakalarda
divergence boş; KASITLI-fark vakaları (ör. FIFO dep-deliği: legacy spawn-eder/reducer Blocked der)
'expected-divergence' olarak İŞARETLİ-pinli (bunlar dilim-7'nin kanıt-envanteri). KAPSAM-DIŞI:
canlı yürütmeye müdahale, closure-silme, planDispatch-değişikliği — dilim-5+.
### goNogo
- goCriteria: reducer pure (import-kanıtı notes'ta); snapshot queue-klonu testle pinli; flag default-off + kapalıyken sıfır-davranış-değişimi testi; journal fail-soft; equivalence-testi eşdeğer+expected-divergence iki-sınıflı; tests/orchestra tamamı yeşil.
- nogo: canlı spawn/kill yoluna herhangi bir müdahale varsa NO_GO; reducer'da Date.now/env/fs varsa NO_GO; canlı queue referansı shadow'a klonsuz geçerse NO_GO.
