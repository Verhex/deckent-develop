# DIRECTIVES — SPRINT-413: RC2-C INIT-NONINTERACTIVE + RC-3 PACKAGE-CONTRACT + SCHED-3 SPAWN-EXECUTOR

## Goal
RC-treni: born-652 (P0, RC-2 kapanış-kilidi) + RC-3 dilimi (PUB-01 JSON-parser · PUB-02
kategorili-baseline · PKG-01 packed-install-contract · PKG-05 drift-gate) + SCHED-treni dilim-3
(canonical spawn executor). Tasarım-SSOT: `docs/analysis/beta-blocker-sweep-2026-07-11.md` +
`docs/analysis/scheduler-unify-design-2026-07-11.md`. CC ön-işi (bilgi): favicon/mascot 779KB→6/68KB
küçültüldü — size-gate ARTIK GEÇİYOR; kalan tek paket-engeli file-count WARN'ı (gerçek: 1853 dosya
= 876 .js + 863 .d.ts + 57 .md + 50 .json; mutlak-pin 920±800 gerçeğe uymuyor).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST (mock-only = GO_WITH_TECH_DEBT).
- REPRODUCE-FIRST: fix'ten önce mevcut hatalı davranışı RED testle kanıtla.
- i18n-FIRST: user-facing HER yeni string getMessage(key, lang) en+tr; log-prefix'li satırda getMessage AYNI satırda olsun (lint-i18n-hardcode satır-heuristiği).
- Test hermetik: tmpdir, async spawn (spawnSync YASAK), ≤16GB.

## Task 1: RC2C — born-652: init gerçek non-interactive akış + EOF-dürüstlüğü (RC-2 kapanış-kilidi)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/cli/commands/init.ts, src/cli/commands/init-wizard.ts, src/cli/helpers/wizard.ts, src/cli/helpers/prompt.ts, src/cli/helpers/messages.ts, tests/cli/init-noninteractive.test.ts, scripts/smoke-init-noninteractive.mjs
- Scope: src/cli/commands/, src/cli/helpers/, tests/cli/, scripts/
- Dependencies: none
### Description
KANIT (CC gerçek-binary smoke, izole-PATH tmp): `printf '1\n1\nproj\n' | deckent init --yes` →
dil-cevabı okundu, PLAN-prompt'unda pipe-stdin OKUNMADI, EOF'ta **hiçbir dosya yazılmadan sessiz
exit 0** (.deckent oluşmadı, outcome-bloğu basılmadı). İKİ ihlal: (a) `--yes` non-interactive
DEĞİL — dil/plan/proje prompt'ları yine açılıyor; (b) stdin-EOF/iptal FAILED üretmiyor (412-001
outcome-sözleşmesinin en kritik deliği — sözleşme yalnız akış SONUNA ulaşılırsa çalışıyor).
GÖREV: (1) `--yes` TAM insansız: dil=en, plan=balanced, proje-adı=basename(cwd) default'ları
(mevcut flag'ler varsa onlara sayg: --lang/--mode benzeri opsiyonları envanterle, yeni flag
İCAT ETME — yalnız default'la); prompt'lar --yes yolunda HİÇ AÇILMAZ; (2) non-TTY tespiti
(process.stdin.isTTY falsy) VE --yes yok → interaktif akışa girmeden dürüst FAILED: "non-interactive
ortam algılandı — deckent init --yes kullanın" + nonzero-exit (i18n); (3) interaktif akışta
prompt-cevabı okunamazsa/EOF → FAILED outcome-bloğu + nonzero (sessiz exit 0 ÖLÜR) — 412-001'in
classifyInitOutcome/formatInitOutcomeBlock'unu KULLAN, paralel mekanizma kurma; (4)
scripts/smoke-init-noninteractive.mjs: izole-PATH tmp'de üç kanıt — [--yes insansız tamamlanır →
SETUP_INCOMPLETE + exit 2 + .deckent/config.json yazılı] · [stdin=/dev/null --yes'siz → FAILED +
nonzero + sessiz-exit-0-yok] · [--yes + tüm-provider'lı normal PATH → çıktıda outcome-bloğu var];
'SMOKE OK'/exit 1. RED-first: bugünkü pipe-EOF sessiz-exit-0 davranışını async-spawn testiyle kanıtla.
Smoke: node scripts/smoke-init-noninteractive.mjs → SMOKE OK
### goNogo
- goCriteria: RED-reproduce (EOF sessiz exit 0 + dosyasız) → GREEN; --yes yolu sıfır-prompt (gerçek-binary smoke-script kanıtı); non-TTY --yes'siz dürüst-FAILED; EOF=FAILED+nonzero; i18n en+tr; 412-001 outcome altyapısı yeniden kullanılmış; mevcut init testleri yeşil.
- nogo: --yes hâlâ herhangi bir prompt açıyorsa NO_GO; EOF yolu exit 0 kalıyorsa NO_GO; ikinci bir outcome-mekanizması kurulursa NO_GO.

## Task 2: RC3A — PUB-01+PUB-02+PKG-05: validate-publish JSON-parser + kategorili-baseline-ratchet + drift-gate
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: scripts/validate-publish.mjs, scripts/pack-baseline.json, tests/release/validate-publish-pack.test.ts
- Scope: scripts/, tests/release/
- Dependencies: none
### Description
KANIT (sol-sweep PUB-01/02 + CC canlı): (a) pack-çıktısı TEXT-parse ediliyor (scripts/
validate-publish.mjs:~83-199 npm-notice satır-deseni) — npm-11/non-TTY ortamlarda boş-çıktı
riski (sol reproduce etti; CC ortamında parser çalıştı ama kırılgan); (b) file-count mutlak-pin
920±800=1720 üst-sınır, gerçek 1853 (CC kategorik-döküm: 876 .js + 863 .d.ts + 57 .md + 50 .json
— hepsi meşru derleme-çıktısı; çöp YOK) → WARN bile readiness'i false yapıyor (:567); tolerance
yükseltmek bloat-saklar (sol-riski). GÖREV: (1) pack-çağrısı `npm pack --dry-run --json
--ignore-scripts` async-spawn + JSON-şema parse (files[].path/size); text-parser ÖLÜR;
tests/cli/f1df-pack.test.ts:37'deki çalışan JSON-deseni referans; (2) mutlak file-count pini
ÖLÜR → yerine scripts/pack-baseline.json: kategori-bazlı (dizin-2-derinlik × uzantı-sınıfı
[.js/.d.ts/.md/.json/asset]) sayım+boyut baseline'ı; gate = baseline-DELTA: yeni-kategori VEYA
kategori-sayımı >%10 artış VEYA toplam-boyut >5MB → FAIL (gerekçeli); baseline'ı bugünkü
gerçek pack'ten üret (üretim komutu script'e `--write-baseline` flag'i olarak girer, CI'da
salt-okunur); (3) PKG-05: `lint:builtins-drift --check` readiness-aggregator'a eklenir (çağrı +
sonuç raporda); (4) test: JSON-parser mock-pack-fixture'la + delta-gate üç yolu (temiz /
yeni-kategori / %10-aşım) + boş-pack-çıktısı dürüst-FAIL (PUB-01 regresyon-kilidi). NOT: bu
gerçek npm-pack'i test'te KOŞMA (yavaş) — parser/gate saf-fonksiyonlara ayrılıp fixture'la
test edilir; gerçek koşu Smoke'ta.
Smoke: npm run validate:publish → 'pack_size_and_count' PASS (WARN'sız) + Summary 0 failed
### goNogo
- goCriteria: text-parser kaldırıldı (JSON-only, async-spawn); boş-çıktı dürüst-FAIL testli; kategorili-baseline + delta-gate üç-yol testli; baseline dosyası gerçek-pack'ten üretilmiş ve commit'li; builtins-drift readiness'te; validate:publish gerçek koşusu Summary 0-failed.
- nogo: mutlak-count pini tolerance-yükseltmeyle 'geçirilirse' NO_GO; parser'da spawnSync kullanılırsa NO_GO; baseline elle-uydurulmuşsa (pack'ten üretilmemişse) NO_GO.

## Task 3: RC3B — PKG-01: packed-install-contract — tarball gerçekten kurulabilir-mi kanıtı
- Model: sonnet | Effort: medium | Provider: claude
- Files: tests/release/packed-install-contract.test.ts
- Scope: tests/release/
- Dependencies: none
### Description
KANIT (sol-sweep PKG-01): tarball critical-check yalnız root main/types + 2 bin + dashboard'a
bakar (scripts/validate-publish.mjs:~501-507); exports["./sdk"], builtins-ağacı ve
assets/Dockerfile.worker sözleşmesi KAPSAM-DIŞI — kırık-SDK/eksik-builtin'li paket gate'den
geçebilir. GÖREV: yeni HERMETIK test (tests/release/ — uzun-koşu kabul; describe.skipIf ile
DECKENT_SKIP_PACK_TESTS=1 kaçış-kapısı): (1) `npm pack --json --ignore-scripts` GERÇEK tarball
(tmpdir'e; async spawn, timeout cömert); (2) tarball tmpdir'e extract (node:zlib+tar yerine
mevcut devDep envanterine bak — tar paketi yoksa `tar -xzf` async-spawn kabul, Windows'ta
describe.skipIf(process.platform==='win32') dürüst-atla + yorum); (3) extract-edilen package/
içinden KANIT-SETİ: package.json exports-haritasındaki HER giriş (root + ./sdk) dosya-varlığı +
`node -e "import(...)"` gerçek-import (dist üzerinden değil, extract-kökünden); 2 bin dosyası
mevcut+executable-bit; dist/dashboard/index.html + assets; dist/core/builtins altında ≥1 agent
PROMPT.md + ≥1 skill SKILL.md; assets/Dockerfile.worker; İÇ-SIZINTI-YOK: .deckent/ .brain/
.tasks/ tests/ src/ yolları tarball'da bulunmaz. Her eksik = adlı-assert (hangi sözleşme kırıldı).
### goNogo
- goCriteria: test gerçek-tarball üstünde (mock değil); exports-haritası programatik okunuyor (hardcode-liste değil); root+SDK gerçek-import kanıtı; iç-sızıntı-yok kontrolü; kaçış-kapısı + Windows dürüst-atla; lokal koşu yeşil.
- nogo: dist/'e (tarball-dışına) assert yazılırsa NO_GO; exports listesi hardcode'lanırsa NO_GO.

## Task 4: SCHED3 — canonical spawn executor: tüm spawn-yolları tek kapıdan (strangler dilim-3)
- Model: sonnet | Effort: high | Provider: claude
- Files: src/orchestra/scheduler-effects.ts, src/orchestra/sprint-spawner.ts, src/orchestra/result-collector.ts, tests/orchestra/scheduler-spawn-executor.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): `docs/analysis/scheduler-unify-design-2026-07-11.md` — Sprint-3 dilimi +
"cascadeSkipped ve fix-task routing koruma garantisi" bölümü. KANIT: spawn İKİ farklı yürütücüde —
heavyweight respawn yolu (sprint-spawner.ts:~931+: provider/backend seçimi + task-persistence +
fix-routing-mirası :~1685-1723) vs collector'ın YEREL spawnIfNotAssigned'ı (result-collector.ts:~1190:
miras UYGULANMAZ, task-JSON persistence YAPMAZ) — task'ın kaderi hangi tetikten spawn olduğuna
göre değişiyor. GÖREV (dilim-3; reducer DEĞİL — o dilim-4): (1) YENİ src/orchestra/
scheduler-effects.ts: `executeSpawnTask(effect, deps)` canonical-executor — fix-task
routing-mirası (forceModel/provider/backend/modelEffort; yalnız-undefined-ise-kopyala, explicit
override korunur — mevcut :~1685 mantığını TAŞI) prompt/provider/backend/effort resolution'dan
ÖNCE uygulanır; original-task bulunamazsa fail-soft-no-op yerine dürüst `routing-lineage-missing`
disposition (dönüş-değeri + stderr-warn; spawn yine bloklanmaz mı? HAYIR — sol: spawn-blocked
disposition, spawn YAPILMAZ); task-persistence tek yerde; (2) processQueue/forceRescanIfIdle/
dispatchReadyTasks'ın yerel spawn-helper çağrıları canonical-executor'a delege olur; heavyweight
respawn yolu da aynı executor'ı kullanır — DAVRANIŞ-DEĞİŞİMİ BİLİNÇLİ ve İKİ: (a) yerel-yol artık
fix-mirası uygular (b) yerel-yol artık persist eder; ikisi ayrı test-case'le pinlenir; (3)
DEPENDENCY_BLOCKED-event/metrics/checkpoint yan-etkileri BU dilimde executor'a TAŞINMAZ (dilim-5/6)
— yalnız spawn+persistence+miras tekleşir; (4) test: aynı fix-task fixture'ı üç tetik-yolundan
(queue-completion / idle-rescan / dep-ready) spawn edildiğinde model/provider/backend/effort
DÖRDÜNDE de aynı + lineage-missing yolu + persistence-varlığı; mevcut tests/orchestra/ TAMAMI yeşil.
KAPSAM-DIŞI: planDispatch, cascade, checkpoint, FIFO — dokunma.
### goNogo
- goCriteria: tek executeSpawnTask; üç-tetik-parity testi; iki-davranış-değişimi ayrı-pinli; lineage-missing dürüst-disposition (spawn-yok + warn) testli; tests/orchestra/ tamamı yeşil.
- nogo: planDispatch·cascade·checkpoint·FIFO'ya dokunulursa NO_GO; miras resolution-SONRASI uygulanırsa NO_GO; dördüncü bir spawn-yolu doğarsa NO_GO.
