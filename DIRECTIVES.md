# DIRECTIVES — SPRINT-14: CI-YEŞİLİ (GOAL-v3 Faz-0, 12 task)

## Goal
5 CI-workflow'unu yeşile çek. **KANIT-TABANI (her task ÖNCE kendi ailesini okusun): `.analysis/ci-red-rca-2026-07-10.md`**
— her ailenin kök-nedeni/kırıcı-commit'i/fix-yönü orada; K-kararlar (Alperen): K2 fail-closed onay · K3 autoApprove=false
onay · **K4 README sprint-badge GERİ-GELECEK (test AYNEN kalır)** · K1 sidecar=born-605 (bu sprintte T8 cerrahi re-zero).
TEST-FIX ilkesi: intent'i koru, ürünün YENİ kontratını pinle, gevşetme yok. SSOT: marathon GOAL-v3. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- Tüm task'lar DISTINCT-FILE (RCA-partisyonu çakışmasız tasarlandı); kapalı hot-dosyalar aynen (kimse src/orchestra-core'a dokunmaz; tek src-değişikliği T7'nin chat-tool-exec.ts'i + T8'in 2 manifest-datası).
- git stash/reset/checkout/clean YASAK · hermetik test · spawnSync yasak · `notes` TEK STRING · Self DÜRÜST · surgical.
- Her task kanıt-komutunda TAM test-dosyası koşar (tek-test değil).

## Task 1: T1-ARITY — born-585 4.arg assert'leri (2 dosya)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/orchestra/task-mode-agent-inject.test.ts, tests/cli/commands/spawn-enhanced.test.ts
- Scope: tests/
- Dependencies: none
### Description
RCA F6b: buildWorkerPrompt artık 4-arg (projectRoot); exact-arity assert'lere 4. arg ekle (inject ×3: '/tmp/proj'; spawn-enhanced ×2: '/mock/root').
### goNogo
- goCriteria: 2 dosya tam yeşil; assert'ler 4-arg'ı PİNLER (gevşek matcher değil).
- Kanıt: `npx vitest run tests/orchestra/task-mode-agent-inject.test.ts tests/cli/commands/spawn-enhanced.test.ts` → 0 fail.

## Task 2: T2-STATUS — f0a03b6f orphan-gate mock+fixture (4 dosya)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/cli/commands/status.test.ts, tests/cli/commands/status-mode.test.ts, tests/cli/commands/status-agents.test.ts, tests/cli/commands.test.ts
- Scope: tests/
- Dependencies: none
### Description
RCA F1 (+commands.test'teki F4 satırı — dosya YALNIZ bu task'ta): output.js mock'larına `isDashboardOrphaned: vi.fn(()=>false)` (RCA deneyle kanıtladı) + sabit-2026-03 fixture'ları `new Date()`; commands.test'in autoApprove-satırı K3-yeni-default'u (false) pinler.
### goNogo
- goCriteria: 4 dosya tam yeşil; orphan-gate'in KENDİSİ ayrıca pinli (orphaned=true fixture'ında gate-davranışı assert'i — yeni davranışı gerçekten test et, sadece susturma).
- Kanıt: `npx vitest run tests/cli/commands/status.test.ts tests/cli/commands/status-mode.test.ts tests/cli/commands/status-agents.test.ts tests/cli/commands.test.ts` → 0 fail.

## Task 3: T3-START-NERVOUS-CLEANUP — F2+F3+F4 (4 dosya)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/cli/commands/start.test.ts, tests/cli/start-sandbox.test.ts, tests/cli/nervous-ipc-route.test.ts, tests/cli/cleanup-log-archive.test.ts
- Scope: tests/
- Dependencies: none
### Description
RCA F2 (handleAccept pending-drop → length 0) + F3 (arşiv 'sprints' segmenti ×4) + F4 (K3: autoApprove default=false pinle — start.test'in bilinen-42-red üyesi autoApprove-testi dahil).
### goNogo
- goCriteria: 4 dosya tam yeşil; K3-default + pending-drop + yeni-arşiv-yolu İÇERİK-düzeyinde pinli.
- Kanıt: `npx vitest run tests/cli/commands/start.test.ts tests/cli/start-sandbox.test.ts tests/cli/nervous-ipc-route.test.ts tests/cli/cleanup-log-archive.test.ts` → 0 fail.

## Task 4: T4-DISPATCH — born-514 evidence→regression-guard (2 dosya)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/cli/nl-dispatch-evidence.test.ts, tests/cli/nl-dispatch-class-gate.test.ts
- Scope: tests/
- Dependencies: none
### Description
RCA F5: 16 evidence-testi eski false-positive'leri BELGELİYORDU (kodun yorumu misroute-ölçümü diyor) → `toBe(null)` regression-guard'a çevir (başlık/yorumlar yeni-amacı anlatsın); class-gate'e born-514-sonrası hâlâ meşru-eşleşen utterance.
### goNogo
- goCriteria: 2 dosya tam yeşil; en az 2 pozitif-eşleşme testi kalır (gate hâlâ bir şey yakalıyor — hepsi-null'a çökertme YASAK).
- Kanıt: `npx vitest run tests/cli/nl-dispatch-evidence.test.ts tests/cli/nl-dispatch-class-gate.test.ts` → 0 fail.

## Task 5: T5-SIGNAL-SENTINEL — F6a registry-deseni + F7 sentinel (3 dosya)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/cli/chat.test.ts, tests/cli/dashboard.test.ts, tests/cli/tool-repl-wire.test.ts
- Scope: tests/
- Dependencies: none
### Description
RCA F6a: chat/dashboard sinyal-testlerini shutdown-hook-registry desenine yeniden yaz (model: tests/cli/sigterm-cleanup.test.ts; born-587 cleanup'ı İLK KEZ gerçekten koşuyor — child.kill() SIGTERM nüansını pinle). F7: arama-sentineli 'zzz_no_such_tool_zzz' → tek-token 'zzzqxjv' (review-description 'NO_GO' token-çakışması).
### goNogo
- goCriteria: 3 dosya tam yeşil; hook kayıt/çağrı/unregister pinli; sentinel-testi anlamını korur.
- Kanıt: `npx vitest run tests/cli/chat.test.ts tests/cli/dashboard.test.ts tests/cli/tool-repl-wire.test.ts` → 0 fail.

## Task 6: T6-CORE-STALE — C2+C3+C6+M1 (4 dosya)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/core/memory-store.test.ts, tests/core/readjson-migration.test.ts, tests/core/marketplace/skill-sandbox.test.ts, tests/mcp/writer-lease-gate.test.ts
- Scope: tests/
- Dependencies: none
### Description
RCA C2 (strict-tenant default=true born-563 → strict-default pinle + permissive'i açık-opt-in testiyle) · C3 (import-satırı regex'e) · C6 (BUILTIN_TRUSTED_SKILLS gerçek-id + 4) · M1 (K2-onaylı fail-CLOSED → isError:true; testin 'spec compliance' yorumu yeni-spec'e güncellensin).
### goNogo
- goCriteria: 4 dosya tam yeşil; C2'de cross-tenant-SIZMAZ yönü ayrıca assert'li.
- Kanıt: `npx vitest run tests/core/memory-store.test.ts tests/core/readjson-migration.test.ts tests/core/marketplace/skill-sandbox.test.ts tests/mcp/writer-lease-gate.test.ts` → 0 fail.

## Task 7: T7-ELOOP — chat-tool-exec raw-throw → DeckentError (CODE-FIX)
- Model: sonnet | Agent: bug-fixer | Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-tool-exec.ts, tests/cli/error-handling-unification.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
RCA C1 (tek gerçek CODE-BUG): :206 `throw new Error('ELOOP…')` konvansiyon-ihlali → DeckentError'a çevir (mevcut error-code taksonomisine uygun; mesaj-içeriği korunur). error-handling-unification'daki allowlist'e DOKUNMA (kod düzelince gerek kalmaz).
### goNogo
- goCriteria: error-handling-unification tam yeşil; ELOOP-yolu davranış-testi (symlink-loop fixture veya mevcut test) DeckentError-tipini pinler.
- Kanıt: `npx vitest run tests/cli/error-handling-unification.test.ts tests/cli/chat-tool-exec*.test.ts` → 0 fail (varsa).

## Task 8: T8-KATALOG-REZERO+RULESHAPE — stats-sıfırlama + 396-$or uyum (DATA+TEST-FIX, 5 dosya)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: .deckent/agents/terminal-ux-engineer/agent.json, .deckent/skills/provider-cli-matrix/manifest.json, tests/core/builtins/agent-catalog-agsk2.test.ts, tests/core/builtins/skill-catalog-agsk4.test.ts, src/core/builtins/skills/provider-cli-matrix/manifest.json
- Scope: .deckent/, tests/, src/core/builtins/
- Dependencies: none
### Description
Advisor ground-truth: bu ailede 6 kırmızı — 2 stats + 4 kural-shape (sprint-396 $or-rewrite'ları). (a) STATS
(TAM-shape — agsk2 toEqual exact-match; advisor-doğrulanmış): agent → `{"totalUses":0,"successRate":0,
"avgCoverage":0,"lastUsedInSprint":""}` (successCount YOK, lastUsedInSprint="" — kaldırma/null DEĞİL); skill →
aynı + `"successCount":0`. $or-kural blokları BYTE-AYNI kalır (stats kardeş-anahtar). (b) agsk2 testinin
`collectDomainRuleValues` (:64-72) yalnız top-level $contains okuyor → $or-aware collector'a genişlet
(TEST-FIX ilkesi: ürünün yeni kontratını pinle). (c) agsk4 byte-identical: builtin provider-cli-matrix
manifest'ine 396'nın AYNI kural-rewrite'ını cerrahi elle-kopyala (bundle-builtins.mjs KOŞMA — yasak toplu-sync'e;
tek-dosya parite-fix'i serbest). Kalıcı çözüm born-605; notes'a bant-yardımı yaz.
### goNogo
- goCriteria: agsk2+agsk4 TAM yeşil (6/6 eski-kırmızı kapanır); manifest-diff'leri yalnız stats + builtin-kural-parite; $or-blokları canlıda byte-aynı.
- Kanıt: `npx vitest run tests/core/builtins/agent-catalog-agsk2.test.ts tests/core/builtins/skill-catalog-agsk4.test.ts` → 0 fail.

## Task 9: T9-MATERIALIZE — C5 hermetik tmp-kopya (2 dosya)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/core/builtins/catalog-materialize.test.ts, tests/core/builtins/catalog-sync-parity.test.ts
- Scope: tests/
- Dependencies: none
### Description
RCA C5: `_loadBuiltinFallback` `.deckent/config.json`-gate'li; config d3148926'da untrack → taze-checkout'ta (CI) 11 test kırmızı, dev-makinede yeşil (works-locally). FIX: "live pool" blokları minimal-config.json'lu tmpdir-kopyada koşsun (RCA worktree'de 31/31 kanıtladı). Gate-davranışının KENDİSİ de pinli kalsın (configsüz→fallback-yok testi).
### goNogo
- goCriteria: 2 dosya, gitignored-state'siz temiz-ortamda yeşil (kanıt: testin kendisi hermetik-fixture kullanır); gate-pinli.
- Kanıt: `npx vitest run tests/core/builtins/catalog-materialize.test.ts tests/core/builtins/catalog-sync-parity.test.ts` → 0 fail.

## Task 10: T10-DOCS-SITE — vitepress 2-blocker (4 dosya, DOC-FIX)
- Model: sonnet | Agent: doc-writer | Skills: documentation-writer
- Files: docs/MASTER-PLAN.md, docs/reference/terminal-compat.md, docs/reference/worker-wrapper-contract.md, docs/features/provider-cli-routing.md
- Scope: docs/
- Dependencies: none
### Description
RCA DOC (2 Temmuz'dan beri kırmızı; fix worktree'de build-yeşil kanıtlı): (a) MASTER-PLAN.md:155 (satır kaymış olabilir — item-469 metni) ham `<dosya>` → backtick'e al (BAŞKA içerik değiştirme — canlı defter!); (b) 8 dead-link: terminal-compat 5 src/tests-linki + worker-wrapper-contract/provider-cli-routing `../analysis/*` linkleri → GitHub-blob-URL'ye çevir ya da metin-referansına indir (hedef-dosyalar publish-edilmiyor).
### goNogo
- goCriteria: `cd docs && npx vitepress build` → "build complete"; MASTER-PLAN diff'i YALNIZ o tag-satırı.
- Kanıt: `cd docs && npx vitepress build` EXIT 0.

## Task 11: T11-DOCS-SAYILAR — README/refdocs gerçeğe + K4 badge-RESTORE (5 dosya)
- Model: sonnet | Agent: doc-writer | Skills: documentation-writer, typescript-expert
- Files: README.md, README-TR.md, docs/reference/agents.md, docs/reference/cli.md, scripts/update-readme-stats.mjs, tests/docs/refdocs-adr-regen.test.ts, tests/scripts/ci-baseline-detect.test.ts, tests/docs/validate-publish.test.ts
- Scope: ./, docs/, tests/
- Dependencies: none
### Description
RCA D1-D4: (a) README-TR:367 '17 built-in agents'→20 + `npm run docs:ref` regen'inin ürettiği dosyaları KOŞTURARAK tazele (docs/reference/agents.md/cli.md — script üretir, elle yazma); (b) refdocs-adr-regen 41-hardcode → docs/adr dosya-sayısından dinamik; (c) **K4-KARARI: README.md'ye sprint-badge GERİ** — advisor'ın bulduğu tam-satır (AUTOGEN badges-bloğu İÇİNE, aynı şekilde):
`[![sprints](https://img.shields.io/badge/sprints-397%2B-teal)](https://github.com/VerhexIO/deckent)` —
ci-baseline-detect.test AYNEN kalır. **KALICILIK (advisor):** `scripts/update-readme-stats.mjs` badge'i bir sonraki
regen'de DÜŞÜRÜR çünkü `detectActiveSprint` (:137-146) "SPRINT-14" tireli-formu yakalamıyor + arşiv-fallback
`.brain/archive` kökünü okuyor (artık alt-dizinli) → fallback'i `.brain/archive/sprints/`e çevir + tireli-form
regex'i (tek-satırlık ikili-fix, dosya Files'ta); (d) validate-publish.test ORPHAN → mevcut `scripts/validate-publish.mjs` GATES-API'sine yeniden yaz.
### goNogo
- goCriteria: Docs+Scripts job'unun 5 dosyası yeşil; badge README'de görünür + test değişmeden geçer; readme-number-truth yeşil.
- Kanıt: `npx vitest run tests/docs/ tests/scripts/ci-baseline-detect.test.ts` → 0 fail.

## Task 12: T12-BASELINES — spawnsync + secrets ratchet-refresh (2 data-dosyası)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, secure-coding
- Files: scripts/spawnsync-baseline.json, .secrets-baseline
- Scope: ./, scripts/
- Dependencies: none
### Description
RCA D5+SEC (manual-review = RCA-raporu, kayıtlı): (a) spawnsync-baseline'ı RCA'nın 7-yeni+2-drift dökümüne göre site-başına tazele (hepsi git/docker-probe ailesi, ADR-D-002-uyumlu; her girişe kısa-neden); (b) ⚠️ TUZAK (advisor): build-mode allowlist'li hit'leri ÖNCE filtreler sonra dosyayı YALNIZ-yenilerle DEĞİŞTİRİR —
doğrudan koşarsan mevcut 9 girişi düşürür ve kendi Kanıt'ın kırmızıya döner. DOĞRU REÇETE: `.secrets-baseline`ı
kenara taşı (boş-allowlist) → `--build-baseline` (TÜM hit'ler: eski-9-site + yeni-9-unique) → SONRA HER girişin
note-alanını zenginleştir ("AWS docs example key — redaction fixture" vb.). Kod/test DOSYASINA DOKUNMA. Not:
bu haftanın yeni test-token'ları (api-token-abc vb.) detector-desenlerine girmiyor — advisor doğruladı, sorun değil.
### goNogo
- goCriteria: `node scripts/security/secret-baseline.mjs` EXIT 0 + `node scripts/lint-no-spawnsync.mjs` EXIT 0 (script-adını grep'le doğrula); baseline-diff'leri girişlere-neden'li.
- Kanıt: iki lint-komutu EXIT 0 + `npm run lint` yeşil.
