# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez —
> landed-kanıt MASTER satır-evidence'ına gider, bu dosya imleç + sıradaki-işi taşır.
> Yürütme yetkisi: **epoch 4, CLAUDE** — `ah-2026-08-25-zfv8yl` COMMITTED
> (`sha256:9cb638e4a58904a0514b341dac3509e6afa6bea763791602734d821012b4c5b7`).
> **Gece-yetkisi (Alperen, 2026-08-26 ~00:15):** "approve için tam onay verildi — süreçleri
> takip et, doğrula, gerekirse elle çözümle, işleri tamamlayarak devam et"; xverify gerektikçe
> ikinci-göz; sabaha-kadar otonom devam TEYİTLİ. Sınırlar aynen: destructive/publish/memory.db/
> onaysız kill-cleanup/admission'sız MASTER-satırı YOK.

## 📍 İMLEÇ — 2026-08-27 sabah-sonrası durum

**Sabah karar-turu ALINDI ve UYGULANDI** (owner Q&A, 2026-08-27 ~08:00):
mini-full-suite kuralı ONAYLI (Ders-32 yazıldı) · audit-kapanış = önce el-fix sonra
mekanizma-sprint · memory budget kararı: decay DEĞİL, 600 hardcode'u düzelt (bütçe 5000) ·
flow-envelope elle temizle ONAYLI · clean-guard typed-disposal sprint'e ONAYLI ·
preflight-pini + directive-dersleri ONAYLI · sıralama: audit-kapanış → ladder + yayın-planı paralel.

**Codex 84-DONE denetimi teslim alındı:** 84/84 yapısal-geçerli; 27 CONFIRMED / 57 PARTIAL /
0 CONTRADICTED; 2 canlı BLOCKS_CURRENT_DONE bulgusu disk-doğrulandı ve el-fix'le kapatıldı
(aşağıda). Raporlar: /tmp/deckent-done-audit-20260827/.analysis-independent/.

**SABAH EL-FIX PAKETİ (bu landing):**
1. **Audit-kapanış el-fix (LSR-01/02):** SKILL.md ×5 materialize (4 deckent-* + observability),
   authored V3 profiller `manifest-profile` provenance ile restore, test-guardian project
   gölgesi canonical (code-test/config + build/release); effective-path probe 5/5 body-OK +
   profiller etkin + capabilities sağlam; drift-baseline 78→38; sync-dayanıklılık dry-run
   35/35 unchanged. Kalıcı üç-yönlü senkron = mekanizma-sprint (7013).
2. **Budget-otoritesi onarımı (owner bulgusu):** üç yüzeyde bayat literal — output.ts
   hardcoded 600, doctor-checks default 900, pre-flight script default 900 → hepsi
   config-resolved `memory_budget` (5000). Gerçek-binary kanıt: doctor
   `OK Memory: 3064/5000 (61%)` — "Budget OVER" tamamen kalktı, decay gereksizdi.
3. **Bozuk flow-envelope 23d494c8 temizlendi:** kök-neden RUN_FAILED.error 6311 karakter >
   validator sınırı 4096 (producer/validator kontrat uyumsuzluğu — producer-truncation
   mekanizma-sprint'e); dosyalar `.deckent/runtime/archive/run-flow-corrupt-2026-08-27/`
   README'li arşivde. Clean-guard'da yalnız beklenen bot-reason kaldı → **tam clean-build
   (`build:all`) yeniden çalışıyor**, bot restart edildi (pid 1314217).
4. **Preflight typecheck-tercihi regresyon-pini:** yeni
   tests/core/preflight-typecheck-preference.test.ts (4 test — typecheck>build tercihi,
   --noEmit yeniden-yazımı, dürüst-skip).
5. **ai-operator-lessons Ders 31+32** (TR+EN senkron): görev-kapsamlı tek Test +
   otorite-dosyaları-Reads'te; katalog-dokunuşlu dalgada mini-full-suite şartı.
6. **MASTER:** 7010/7013/7094/9034 evidence-append (validator yeşil, 540 satır/210 receipt).

**GÜNCELLEME (kesinti-sonrası, ~11:00):** Elektrik kesintisi atlatıldı. (a) Sabah paketinin
CI kırmızısı kök-sınıf onarıldı ve landed (`22f056974`: budget-fallback leaf-sabite +
2 partial-mock spread + PLATFORM.md regen&fail-closed gate). (b) **Mekanizma-sprint-698
KOŞTU ve 4/4 DONE** (~10dk; test-guardian ilk görev %100): üç-yönlü skill-paket senkronu +
izole-proje e2e proof + clean-guard typed orphan-disposal + RUN_FAILED truncation. Ana-şerit
doğrulama pasosu 1 gerçek regresyon yakaladı (698-003-fix cross-process testi environment-
bağımlı foreign-host pini) → çift-sınıf kabullü hermetik onarım, 62/62. Gerçek-binary
kanıtlar: **tam clean-build (`build:all`) yeniden ÇALIŞIYOR** (bozuk-envelope arşivi +
sprint-settlement sonrası guard temiz), sync idempotent + authored-profil mekanizmadan sağ
çıkıyor + 20 diverged-body dürüst keptLocal (7013 kalan iş: yakınsama-politikası).
MASTER 7013/7010/9034 evidence-append. Bot pid 40722.

**SIRADAKİ (bu sıra ile):**
1. ~~Mekanizma-sprint~~ ✅ sprint-698 4/4 DONE (yukarıdaki güncelleme).
2. **Ladder yeni-dalga:** 3301/3302/3304/3299 (sıralama-onayı alındı).
3. **Paralel:** paket-yayın + repo-taşıma (deckent-develop→Verhex/deckent) + verhex-rename
   BİRLEŞİK GEÇİŞ-PLANI raporu (brief §8 versiyon/changelog + owner repo kararları;
   execution codex rename-analizi sonrası).

**Açık küçük bulgular (admission'sız, kayıt):** `memory_budget` config-types'ta yanlışlıkla
V1-deprecated bölümünde ve V2 `memory` bloğunda budget alanı yok (doc/tip temizliği adayı) ·
runDecay/runBudgetedDecay/cleanup'taki son-çare `?? 900` literalleri getDefaultConfig'e
bağlanabilir (davranışsal etki yok, config her zaman kazanıyor) · doctor.test.ts IDE-düzeyi
tip gevşekliği (tsc-gate tests'i dışlıyor; kozmetik).

## GÜNÜN LANDED ÖZETİ (2026-08-26 → origin/main `091338676`)

1. **CI-tam-kapanış:** codex Faz-B test-slim admission (2.923→2.859 dosya, wire 117→78,
   equality 57/57) + ana-şerit F004/F005/F006 kapanışları → **remote 4/4 workflow SUCCESS**
   (`2ad59bd65`); MASTER 542 `CI-REPAIR-TEST-SLIM-001` DONE (`GR-2026-08-26-CI-REPAIR-SLIM-01`).
2. **Owner karar-turu uygulandı:** DONE-mührü (9 flip ratifiye) · d4-609 → `recovery/d4-609`
   arşiv-branch (`7f963db12`) + worktree silindi · MERGED-16 origin-silme (release + aktif lane hariç).
3. **İsim-geçişi mühürlü:** npm `verhex@0.0.1` + `@verhex/deckent` rezerv; GitHub org=`Verhex`,
   `VerhexIO`=placeholder-user; repo=`Verhex/deckent-develop` (remote güncellendi). Ürün-rename
   ANALİZİ codex-session'da; EXECUTION ileride ana-şeritte (owner ataması) — başlanmadı.
4. **Skill-evrimi Dalga-1 LANDED (sprint-692):** profil-türetimi v2 + `deckent sync` skill kolu
   (31 manifest re-persist, idempotency kanıtlı) + unroutable-gate + stack-detector
   package.json-çözümü; tsc-residual el-kapanışı; MASTER 7010 evidence-append.
5. **Dogfood-avı (BLOCKS_CURRENT, in-package fix):** pre-sprint preflight `runTscCheck`
   T4-sonrası build-komutunu (clean'li) koşup clean-guard'la self-deadlock oluyordu →
   `commands.typecheck` tercihli fix (`plugin-hooks.ts:458`), scoped 151/151. Clean'siz build
   deseniyle (tsc+copy-assets) kilit kırıldı. HENÜZ COMMIT EDİLMEDİ — Dalga-2 landing'iyle gider.

## ŞU AN — çalışma-imleci

- ✅ 3-dalga TAMAM; aktif sprint YOK; bot canlı; süpervizyon/bekleme modundayım.
- (arşiv-imleç) Sprint-696 (Dalga-2 dogfood-süiti):** 004 test-guardian agent DONE ✓;
  001/002/003 fix-fix turunda (attempt 3/4). Kök-teşhis (benim directive-hatam, iki katman):
  (a) 002 worker'ı canonical V3 vocabulary'yi göremiyor (read-allowlist eksiği) → tahmini
  değerler şema-ihlali; (b) her task'ın Test'i GLOBAL `lint-manifests` koştuğundan komşunun
  yarım-manifest'i çapraz-NO_GO tetikliyor. **Vocabulary (elle-kapanış için hazır):**
  workTypes.type ∈ build/fix/refactor/document/review/configure/migrate/analyze;
  proficiency ∈ primary/secondary/able; deliverables ∈ code-src/code-test/doc/config/
  workflow/migration/manifest (kaynak: `scripts/lint-manifests.mjs:69-71`).
- **Karar:** fix-fix NO_GO dönerse iki manifest'in profile-bloğu ADR-D-007 seam'iyle elle
  kapatılır (owner gece-yetkisi kapsamında), sprint finalize edilir.

## SIRADAKİ yürütme sırası

1. Sprint-696 kapanışı → tsc/kalıntı kontrol → scoped testler → bot-cycle+build → 20-gate
   (hermeticity/builtins-drift ledger'ları) → gerçek-binary sync/agent-list proof →
   **commit-öncesi XVerify** (`--files --diff`, farklı-provider; Kanun 14 + claim-disiplini) →
   MASTER 7010 evidence-append + 7094-F1c kapanış-notu → landing.
2. **Dalga-3 (onaylı planın son dalgası):** workspace-artifacts render-güncelleme + canonical
   regen (WORKER-GUIDE/TOOLS/IDENTITY/BOOT digest) — DIRECTIVES → plan → start.
3. Sabah-raporu derle (bu dosyanın başına; gece bulguları + owner-admission listesi).

## OWNER-ADMISSION bekleyen bulgular (finding ≠ iş)

1. **Preflight-verification sınıfı:** `runTscCheck` fix'i landed olacak; kalıcı ders — plan-fazı
   doğrulaması hiçbir zaman clean/mutasyonlu build koşmamalı (typecheck-only invariant);
   regresyon-pini adayı.
2. **Directive-yazım dersleri (AI-operator-lessons adayı):** task Test-komutları global-gate
   içeriyorsa paralel task'lar çapraz-NO_GO üretir → ya scoped-gate ya sequential-dep;
   vocabulary-authority dosyası her içerik-üretim task'ının Reads'ine girer.
3. Kalıtsal 7 madde (25-26 gecesi listesi) MASTER'a taşındı/kapandı: 201-207 satırları DONE-mühürlü.
4. `deckent status` "Budget OVER (3059/600 lines)" cleanup-önerisi — sprint-arası `cleanup --decay`
   owner-onayı bekliyor (canlı sprint'te dokunulmadı).

## Canlı truth (kompakt)

- `DOGFOOD_MODE=ON` · origin/main `091338676` · bot canlı (fix'li dist bekliyor: preflight-fix
  kaynakta, dist'te var [clean'siz build], `build:all` landing'de) · MASTER 540 satır/210 receipt
  validator-yeşil · full-suite sayacı: bu gece 1 tam koşu yapıldı (landing full-suite, Faz-B).
- XVerify kullanım-anları: Dalga-2 landing-öncesi diff-hakemi; Dalga-3 sonrası gerekirse.

## Sabit yürütme contractı

`inventory → measured DAG → multi-task dogfood run → canlı PID/log/heartbeat → scoped tests +
lint/typecheck → real-binary proof → MASTER projection → zamanı geldiyse different-provider
XVerify → landing`

- Finding başka outcome'a aitse otomatik implement edilmez; owner-admission MASTER-kapısıdır.
- `.brain/memory.db` silinmez; `.tasks` `rm` ile temizlenmez; sprint sırasında build/auth-mutation
  yapılmaz; canlı sprint owner onayı olmadan kill/cleanup edilmez.
- Commit/push öncesi `git branch -vv`; publish daima owner-manual.
