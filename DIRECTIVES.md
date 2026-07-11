# DIRECTIVES — SPRINT-412: RC-1 SECRET-LIFECYCLE + SCHED-1 SEMANTICS-KERNEL (karar-turu-3 Faz-A açılışı)

## Goal
Karar-turu-3 (Alperen, 2026-07-11) üç-tren kararının ilk sprint'i: **RC-1** (543 RC-TRAIN dilim-1:
.deck secret-lifecycle — SEC-01 overwrite/mode + SEC-02 dürüstlük-dilimi) + **SCHED-1** (527
strangler dilim-1: semantics-kernel — davranış-koruyucu predicate/fix-aggregation tekleme).
Tasarım-SSOT: `docs/analysis/beta-blocker-sweep-2026-07-11.md` (RC) +
`docs/analysis/scheduler-unify-design-2026-07-11.md` (SCHED). Publish-zinciri bu trene bağlı.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash/reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST (mock-only = GO_WITH_TECH_DEBT, asla DONE).
- REPRODUCE-FIRST: her fix'ten ÖNCE mevcut hatalı davranışı RED testle kanıtla (test adına `red`/`reproduce` etiketi), sonra GREEN'e çevir.
- i18n-FIRST: kullanıcıya görünen HER yeni string `getMessage(key, lang)` üzerinden (src/cli/helpers/messages.ts, en+tr çifti) — hardcode TR/EN kabul edilmez.
- Test hermetik: tmpdir, async spawn (spawnSync YASAK), ≤16GB; kendi test dosyanı VE dokunduğun modülü import eden mevcut testleri koş.
- Cross-platform (Yasa #2): POSIX + Windows dalları; desteklenmeyen yol SESSİZCE değil DÜRÜSTÇE degrade olur (loud-warn).

## Task 1: RC1-A — .deck secret-lifecycle çekirdeği (SEC-01: overwrite-guard + 0600 + Windows-ACL)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/core/deck-file.ts, src/cli/commands/init-steps.ts, scripts/smoke-deck-lifecycle.mjs, tests/core/deck-file-secret-lifecycle.test.ts
- Scope: src/core/deck-file.ts, src/cli/commands/init-steps.ts, scripts/, tests/core/
- Dependencies: none
### Description
KANIT (sol-sweep SEC-01 + CC disk-verify): `createDeckTemplate` (src/core/deck-file.ts:128-156)
KOŞULSUZ `writeFileSync` — mevcut .deck'teki kullanıcı API-key'leri re-init'te boş template ile
SİLİNİR (canlı-reproduce edildi); mode verilmiyor → 0644 (dünyaya-okunur secret). Çağıran
`writeDeckSecurityFiles` (src/cli/commands/init-steps.ts:380-385) koşulsuz + `catch {}` sessiz-yutar.
GÖREV: (1) `createDeckTemplate` → **no-op-if-exists**: dosya varsa İÇERİĞE DOKUNMA (byte-aynı kalır);
(2) ilk yazım **atomic** (aynı-dizin tmp + rename) ve **owner-only**: POSIX'te `{ mode: 0o600 }` +
yazım-sonrası `chmodSync(0o600)` teyidi (umask'a karşı); (3) **Windows dalı**: chmod anlamsız →
`icacls <file> /inheritance:r /grant:r "%USERNAME%":F` dene (async spawn), başarısızsa işlemi
KIRMADAN stderr loud-warn (dürüst-degrade; mesaj i18n'e gerek yok — mekanizma-katmanı EN log
kabul, ama init-yüzeyine sızan metin varsa getMessage); platform dalı test-edilebilir olsun
(fonksiyon parametresiyle platform enjekte edilebilir); (4) `writeDeckSecurityFiles` sessiz `catch {}`
→ non-fatal kalır AMA stderr'e warn yazar; (5) `ensureDeckGitignore` davranışı DEĞİŞMEZ.
RED-first: mevcut-.deck'li tmpdir fixture'da sentinel key yaz → bugünkü kod onu EZER (RED kanıtı) →
fix sonrası korunur + yeni-dosya mode 0600 assert (POSIX). scripts/smoke-deck-lifecycle.mjs:
tmpdir → template → sentinel yaz → template tekrar → sentinel korunmuş + (POSIX) stat mode 600 →
'SMOKE OK' basar, aksi exit 1.
Smoke: node scripts/smoke-deck-lifecycle.mjs → SMOKE OK
### goNogo
- goCriteria: RED-reproduce testi var (eski davranış: ezme + 0644); no-op-if-exists + atomic + 0600 + chmod-teyit GREEN; Windows-dalı testli (mock/enjekte) + dürüst-warn; writeDeckSecurityFiles warn'lı non-fatal; smoke-script teslim + lokal koşusu OK; dokunulan modülleri import eden mevcut testler yeşil.
- nogo: mevcut .deck içeriğine dokunan herhangi bir yol kalırsa NO_GO; mode-teyitsiz (yalnız writeFileSync-mode) bırakılırsa NO_GO; Windows sessiz-no-op kalırsa NO_GO.

## Task 2: RC1-B — subprocess-backend .deck görünürlüğü dürüstlük-dilimi (SEC-02)
- Model: sonnet | Effort: medium | Provider: claude
- Files: src/cli/commands/doctor-checks.ts, src/cli/helpers/messages.ts, docs/adr/adr-g-005-secret-file-system.md, tests/cli/doctor-subprocess-secret-warn.test.ts
- Scope: src/cli/commands/, src/cli/helpers/messages.ts, docs/adr/, tests/cli/
- Dependencies: Task 1
### Description
KANIT (sol-sweep SEC-02): subprocess worker host proje-kökündeki .deck'i OKUYABİLİR — Docker
shadow (src/orchestra/spawn-backend-docker.ts:729-752) yalnız container-yolunu kapatır;
ADR-G-005 (docs/adr/adr-g-005-secret-file-system.md:25) açığı kabul eder. TAM fix (host
credential-broker, worker-FS'ten tam ayrım) RC-1 kapsamını aşar — AYRI born olacak; bu task
DÜRÜSTLÜK dilimi (sessiz-açık YASAK, Yasa #2 dürüst-fail ilkesi): (1) doctor'a yeni check:
`spawn_backend === 'subprocess'` VE .deck mevcut VE en az bir non-empty secret satırı varsa →
WARN-seviye bulgu: "subprocess worker'lar .deck'i okuyabilir; hassas ortamda docker backend
(shadow'lu) kullanın" (getMessage ile en+tr; doctor çıktı-desenine uy — mevcut check'lerin
yapısını kopyala); .deck yoksa/boşsa check PASS-sessiz; (2) ADR-G-005 dosyasına tarihli
durum-notu bölümü: RC-1'de eklenen guard'lar (overwrite/0600 — Task-1) + subprocess-görünürlük
AÇIK + credential-broker follow-up işaretçisi; (3) RED-first: subprocess-config'li tmpdir
fixture'da bugünkü doctor'ın UYARI VERMEDİĞİNİ kanıtla, sonra GREEN.
Smoke: node dist/cli/entry.js doctor (subprocess-config + dolu-.deck tmp-projede) → çıktıda subprocess-secret uyarı satırı
### goNogo
- goCriteria: doctor-check RED→GREEN testli; i18n en+tr çifti; .deck-yok/boş yolunda uyarı YOK (false-positive testi); ADR-G-005 durum-notu eklendi; mevcut doctor testleri yeşil.
- nogo: hardcoded user-facing string varsa NO_GO; uyarı .deck'in İÇERİĞİNİ (key adı/değeri) sızdırırsa NO_GO.

## Task 3: SCHED1 — semantics-kernel: effective-dependency-state tekleme (strangler dilim-1, davranış-koruyucu)
- Model: sonnet | Effort: high | Provider: claude
- Files: src/orchestra/scheduler-state.ts, src/orchestra/scheduler-truth.ts, src/orchestra/sprint-spawner.ts, src/orchestra/result-collector.ts, tests/orchestra/scheduler-effective-dependencies.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): `docs/analysis/scheduler-unify-design-2026-07-11.md` — Sprint-1 dilimi +
örtüşme-matrisi + riskler. BAĞLAM: born-610 predicate SÖZLÜĞÜ tekledi (scheduler-truth.ts) ama
fix-aggregation "caller's responsibility" kaldı (scheduler-truth.ts:26-27) ve site'lar ayrışık:
`selectEligibleForSpawn` (sprint-spawner.ts:1189-1190) hardcoded `status === TaskStatus.DONE` +
fix-aggregation YOK; `dispatchReadyTasks` (result-collector.ts:~482) aggregate-aware DONE-seti
KENDİ kurar. GÖREV (SCHED-treni dilim-1; Alperen-onaylı kademeli-strangler): (1) YENİ
`src/orchestra/scheduler-state.ts`: `computeEffectiveDependencyState(tasks, nowMs)` → PURE
(disk, env ve Date.now OKUMAZ — now dışarıdan): satisfyingIds (isDependencySatisfying + BİR-SEVİYE
fix-aggregation: DONE `<id>-fix`/fixForTaskId original'ı satisfy eder — mevcut dispatchReadyTasks
semantiğini AYNEN taşı, yeniden icat etme), terminalFailureIds (isSchedulingTerminalFailure,
aynı fix-aggregation merceğiyle), retry-eligibility helper'ı (retryAfter <= nowMs). (2)
`selectEligibleForSpawn` hardcoded DONE-set yerine bu helper'ı kullanır — DAVRANIŞ-DEĞİŞİMİ
BİLİNÇLİ ve TEK: DONE fix-task'ı artık idle-rescan/respawn-eligibility'de de original'ı satisfy
eder (tasarım-doc composition-kanıtı; ayrı test-case ile pinle); `Date.now()` çağrısı imzaya
`nowMs = Date.now()` default-parametre olarak taşınır (geriye-uyumlu). (3) `dispatchReadyTasks`
kendi aggregate-set kurulumunu helper'a delege eder — DAVRANIŞ AYNI (mevcut testler yeşil).
(4) respawnEligibleTasks predicate kullanımı helper'la hizalanır (sprint-spawner.ts:~884).
(5) YENİ exhaustive test: status ∈ {DONE, NO_GO, MRR, PENDING, EXECUTING} × fix {yok, PENDING-fix,
DONE-fix, NO_GO-fix} × pipeline {on, off} tablosu — her hücrenin beklenen eligible/blocked/skip
sonucu; + mevcut scheduler/dispatch testlerinin TAMAMI yeşil (tests/orchestra/ blast-radius'u koş).
SINIF-RİSKİ: scheduler = sprint'lerin kalbi — kapsam-dışı refactor YASAK (closure'lara, checkpoint'e,
FIFO-moduna DOKUNMA; onlar dilim 2-7). planDispatch'e DOKUNMA (dilim-4 shadow).
### goNogo
- goCriteria: scheduler-state.ts pure (Date.now, process.env ve fs importu YOK — lint-kanıt notes'ta); exhaustive tablo-testi TAM; tek-davranış-değişimi (fix-agg idle+respawn'a) ayrı test-case'le pinli; selectEligibleForSpawn + dispatchReadyTasks + respawnEligibleTasks helper'a bağlı; tests/orchestra/ tamamı yeşil.
- nogo: closure, checkpoint, FIFO-modu veya planDispatch'e dokunulursa NO_GO; helper'da fs, env veya Date.now okuma varsa NO_GO; mevcut test kırığı kalırsa NO_GO.
