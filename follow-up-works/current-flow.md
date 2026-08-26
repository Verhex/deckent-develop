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

- ▶ **Sprint-696 CANLI (Dalga-2 dogfood-süiti):** 004 test-guardian agent DONE ✓;
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
