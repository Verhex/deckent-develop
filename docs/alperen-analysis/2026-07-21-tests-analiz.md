# 2026-07-21 — `tests/` Kapsamlı Analiz (yapı · wiring · hermeticity · bayatlık)

> **Amaç:** Temizlik-programının tests-ayağı (en sona bırakılan parça). **Yalnız analiz — aksiyon yok.**
> **Yöntem:** 3 bağımsız keşif (yapı+wiring · gerçek-repo-bağı+hermeticity · bayat/artık) + el-teyitleri.
> Kardeş-defter: `2026-07-21-dokuman-temizlik-karar-tablosu.md` (#28).
> **✅ Karar (Alperen 2026-07-22): TS1-TS8 HEPSİ ONAY** — yalnız-dokümantasyon; iş sonra yapılacak.
> (TS8 sonucu: docs1-K2 = **a** olarak kesinleşti — sözleşmeye işlendi.)

## 0. Genel resim

**2.304 test-dosyası · ~530K satır · 26MB · 42 üst-dizin.** En büyükler: `orchestra/` 567 dosya/6.8M ·
`cli/` 504/5.3M · `core/` 447/4.9M · `api/` 105 · `dashboard/` 84. En büyük tekil dosyalar:
`orchestra/brain.test.ts` 2730 satır · `monitor/auditor.test.ts` 2970 satır.

**Wiring temiz:** main `vitest.config.ts` = `tests/**` eksi `tests/dashboard/**` → dashboard yalnız
`test:dashboard` ile; desktop-config `tests/`i hiç kapsamaz (yalnız `src/desktop/tests/`).
**Koşulmayan gerçek test-dosyası YOK** — tek orphan: **`tests/load/hot-paths.bench.ts`** (`.bench.ts`
hiçbir include'a girmiyor + `bench` script'i yok; mtime 05-12) → ya wire et ya sil.

## 1. 🔴 ANA BULGU — 25 test proje-köküne YAZIYOR ve hiçbir gate yakalamıyor

Bilinen 3 sızıntı (`chain-safety.e2e:93` · `sprint-lifecycle:17` · `zero-hardcode-audit:14`) buzdağının
ucuymuş — el-doğrulamalı **22 yeni** projectRoot-yazarı bulundu (tmpdir yerine `join(process.cwd(),'.test-*')`
/ `.tmp-test` desenleri): `core/observability(+rotation)` · `core/rule-generator` ·
`orchestra/baseline-tracker` (⚠️ PID'siz → collision) · `orchestra/ci-reporter` · `orchestra/debt-db-accessor` ·
`orchestra/managed-docs/` ×6 · `agents/worker-{authority,log,rbac}` · `cli/commands/{docs-add-interactive,
retro-parse-fix(⚠️ PID'siz),init-gitignore,archive-debt}` · `scripts/ci-baseline-detect` ·
`docs/series-metrics` · `e2e/docker-backend:535`. (Read-only projectRoot kullanan 2 dosya elendi — sızıntı değil.)

**Neden hiçbir kapı yakalamıyor (3-katmanlı boşluk):**
1. `test:ci-sim` worktree'de koşuyor (`ci-sim-workspace.mjs:188` cwd=worktree) → yazımlar tek-kullanımlık
   worktree'ye düşüyor, **sızıntı maskeleniyor**;
2. `lint-test-hermeticity.mjs` yalnız **OKUMA** desenlerini tarıyor (4 dar regex) — yazma-taraması yok;
3. `.gitignore` yara-bandı yalnız 4 deseni gizliyor (`.test-e2e*`, `.tmp-test/`, `.test-archive-debt-*`) —
   kalan ~18 test `.test-observability-*`, `.test-managed-*`, `.test-worker-*` gibi dizinleri kökte bırakıyor
   (kökteki `.test-e2e-*`/`.tmp-test` artıkları bu sızıntının canlı kanıtı).

→ **BORN-ADAYI (büyük):** hermeticity-lint'e yazma-taraması eklenmesi + 25 testin tmpdir'e taşınması
(#9a/#19 kararlarının kök-nedeni bu; silmek semptom-tedavisi).

## 2. K2-girdisi (docs1) — docs/-tree okuyan testler

**26 dosya** docs/-ağacını gerçekten okuyor: 21'i `tests/docs/` içinde + **5 dışarıda**
(`build/readme-package-links` · `orchestra/brain` · `release/release-prepare` (docs/CHANGELOG) ·
`scripts/clean-clone-smoke` · `scripts/sync-to-product`). Okunan yollar **tamamı tracked** →
çekirdek-değişimi kurgusunda (K1=c+K3=a, çekirdek gün-1 kurulur) **hepsi yeşil kalır; K2 fiilen (a)**.
`tests/docs/`in kalan ~27 dosyası kök-doküman okur (README/CHANGELOG/LICENSE/.claude/rules) — docs/-bağımsız.

## 3. Hermeticity okuma-tarafı: SAĞLAM

Gitignored-state okuyan tek test (`config/nervous-faz1-smoke:14` → `.deckent/config.json`) kendini
`skipIf(!hasConfig)` ile koruyor; kalan tüm canlı-okumalar **tracked** dosyalara (`.deckent/skills` 112-tracked ·
`.brain/exports` · `i18n/`). ci-sim PROTECTED_PATHS + worktree-mimarisi okuma-tarafını kapatıyor —
**okuma-boşluğu YOK.** İkincil kör-nokta: lint regex'i yalnız literal-string yakalıyor (bölünmüş-argüman
okuma kaçar; şu an zararsız).

## 4. spawnSync: kural var, enforcement yok (testlerde)

Kanun-5/hermeticity "testte spawnSync yasak" der; ama `lint-no-spawnsync.mjs:31` **yalnız src/ tarar**
(baseline 92+37, hepsi src). **23 test-dosyası gerçek spawnSync kullanıyor** (çoğu guard'lı e2e/integration:
docker/tmux/provider-matrix + lint-harness'ları) ve ratchet bunları ne sayıyor ne blokluyor →
kural-vs-enforcement kapsam-boşluğu (born-adayı: ratchet'a tests/ kapsamı ya da bilinçli-istisna ilanı).

## 5. Skip-envanteri

`.todo`/`xit` SIFIR · 95 **koşullu** skipIf/runIf (platform-gate, sağlıklı) · **46 koşulsuz kalıcı-skip**:
- **18'i terk edilmiş doküman-coupling:** `cli/rich-output` (8) + `docs/readme.test` (5) + `docs/CHANGELOG.test` (5)
  — README/CHANGELOG assertion'ları uzun süredir kapalı → ya canlandır ya sil (docs1-kararıyla birlikte düşün).
- **4 boş-gövde placeholder** (`review-finalize-…-improvements.test.ts:644-662` "covered by archive-debt") → sil-aday.
- Kalanı: "not yet implemented" (sprint-retro-writer ×2, turkish-locale ×2 vb.) + env-gated ağır-smoke'lar (kasıtlı).

## 6. İkizler ve adlandırma

- `agent/` vs `agents/` — **ikiz DEĞİL**: `src/agent` (runtime) ve `src/agents` (worker'lar) aynası; karışıklık-riski notu.
- `audit/` vs `audits/` — **ikiz değil ama naming-drift**: iki singleton (`worker-brain-audit-parity` 05-13 ·
  `dead-code-decisions` doc-şema-testi) → birleştirme/taşıma adayı (dead-code-decisions aslında `tests/docs` sınıfı).

## 7. Bayatlık: korkulandan ÇOK temiz

- **V2-routing artığı SIFIR** — `2c63b777` V2'yi 61 test-dosyasıyla birlikte silmiş; `config.test.ts` V2-default
  bloğu canlı config'i test ediyor (bayat değil). `routeTaskV2` grep tests/ = 0.
- **Fixture-şişkinlik YOK** — `tests/fixtures` 24K, 3 JSON'un üçü de aktif kullanımda; kullanılmayan fixture yok.
- **Tek gerçek orphan-dosya:** `tests/governance/latent-set-closure.note.md` (11K, sıfır referans) → SİL-aday.
- `threat-model.md` silinmesi test kırmamış (yalnız NOTE-yorum + 1 kozmetik sentetik-path `effect-class:58`).
- Scripts↔test eşleme-listesi (temizlik-günü için) çıkarıldı: backfill-sprint-log ·
  memory-stub-backfill · bump-version (retirement-GUARD — **silinmemeli**) · verify-publish (script canlı).
- En durgun köşeler (~4 ay): `skills/` · `core/notification-providers` · `mcp/helpers` — doku-sinyali, kanıt değil.

## 8. `tests/PLATFORM.md` — STALE

`last_updated: 2026-03-22`; Unix-only tablosu 3 dosya sayıyor, gerçekte **+5 eksik**
(`tmux-provider-cli` · `tmux-timeout-parity` · `turn-economy-2` · `ci-sim-signal-restore` · `test-ci-sim`).
Enforcement-testi `platform-tags.test.ts:15-19` AYNI 3'lük listeyi kullanıyor → aynı kör-nokta, drift
yakalanmıyor. Düzeltme = md + UNIX_ONLY_FILES eş-zamanlı.

## 9. Aday-özeti (kararlar Alperen'den — aksiyon yok)

| # | Aday | Sınıf |
|---|---|---|
| TS1 | 25 projectRoot-yazan testi tmpdir'e taşı + hermeticity-lint'e yazma-taraması | **BORN (büyük; #19 kök-nedeni)** |
| TS2 | `hot-paths.bench.ts` — wire et ya da sil | orphan |
| TS3 | 4 boş-gövde skip-placeholder sil + 18 doc-coupling skip kararı (docs1 ile) | skip-hijyeni |
| TS4 | `latent-set-closure.note.md` sil | orphan-note |
| TS5 | `audit/`+`audits/` birleştir; dead-code-decisions'ı doğru eve taşı | naming |
| TS6 | PLATFORM.md + platform-tags UNIX_ONLY_FILES senkronu | doc-drift |
| TS7 | spawnSync ratchet'ına tests/ kapsamı (ya da bilinçli-istisna ilanı) | born-aday |
| TS8 | K2 kaydı: 26 docs-okuyan test tracked-çekirdekle yeşil kalır → K2=a kesinleştirilebilir | docs1-girdisi |
