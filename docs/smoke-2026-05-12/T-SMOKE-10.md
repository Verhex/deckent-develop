# T-SMOKE-10 — Beta GA 20-Gate Listesi

**Sprint:** Smoke 2026-05-12 (Restore Verification)
**Kapsam:** Beta GA Exit Criteria — 20 Kapılı Çıkış Protokolü
**Referans Sprint:** Sprint 152 sonu durumu (17–19/20 geçti)

---

## Giriş

Deckent'in Beta GA (General Availability) sürümüne geçişi, 20 ayrı kalite kapısından oluşan bir **exit criteria** protokolüne bağlıdır. Bu protokol; kod kalitesi, test güvenilirliği, paket bütünlüğü, çok-platform desteği, çok-provider desteği ve operasyonel olgunluk gibi farklı boyutları kapsar. Hiçbir kapı atlanamaz — tüm kapıların geçilmesi zorunludur. Sprint 152 sonu itibarıyla **17–19/20** kapı "PASS" durumundaydı; 1–3 kapı hâlâ tamamlanma aşamasındaydı.

---

## 20-Gate Listesi — Detaylı Açıklama

### Gate 1 — `tsc 0 error`

TypeScript derleyicisi `tsc --noEmit` komutu sıfır hata ile çıkmalıdır. Node16 ESM modül çözünürlüğü ile birlikte tüm `.js` uzantı gereksinimleri karşılanmalı, generic tip çıkarımları doğru olmalı ve tüm `strict` bayrakları aktif olmalıdır.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 2 — `vitest ≥99.5%`

`npx vitest run` komutu çalıştırıldığında toplam test geçiş oranı %99.5 veya üzerinde olmalıdır. Skipped testler dahil edilmez; yalnızca aktif testler sayılır. Sprint 152 itibarıyla proje **12.485 pass + 16 skipped (505 dosya)** seviyesindeydi.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 3 — `coverage ≥85%`

`npx vitest run --coverage` sonucu tüm metrikler (statements, branches, functions, lines) için %85 barajını aşmalıdır. Sprint 152 itibarıyla genel coverage **%89.33** olarak ölçülmüştür.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 4 — `27+ MCP tool`

MCP sunucu manifest'inde en az 27 kayıtlı tool olmalıdır. Her tool'un çalışan handler'ı, giriş/çıkış şeması ve hata yönetimi bulunmalıdır. Sprint 152 IDENTITY.md'ye göre **23 tool** kayıtlıydı; bu gate için büyüme gerekiyordu.

**Sprint 152 Durumu:** ⚠️ IN_PROGRESS (23/27)

---

### Gate 5 — `45+ CLI komut`

`deckent --help` çıktısında en az 45 komut görünmelidir. Her komutun `--help` dokümantasyonu, `register<Name>(program)` pattern'ine (ADR-012) uygun şekilde kaydedilmiş olması gerekir.

**Sprint 152 Durumu:** ✅ PASS (49+ komut)

---

### Gate 6 — `npm pack temiz`

`npm pack --dry-run` komutu hiçbir hassas dosya (`.env`, `.brain/memory.db`, `.tasks/`, `.locks/`) içermemelidir. `.npmignore` veya `package.json` `files` alanı ile filtreleme uygulanmış olmalıdır.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 7 — `cross-platform 3/3`

Paket macOS, Linux ve WSL2 ortamlarında hatasız çalışmalıdır. PATH bağımlılıkları, satır sonu karakterleri, dosya izinleri ve `#!` shebang satırları platform-nötr olmalıdır. CI ortamında her üç platform test edilmiş olmalıdır.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 8 — `multi-provider 3/3`

Claude (primary), Codex (OpenAI) ve Gemini (Google) provider'larının her biri en az bir worker task'ını başarıyla tamamlayabilmelidir. Fallback chain (429 / capacity exhausted → respawn) test edilmiş olmalıdır.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 9 — `deckent_style toggle`

`deckent config set style <dark|light|minimal>` komutu ve `deckent_config` MCP tool'u üzerinden CLI çıktı stilleri değiştirilebilmelidir. Dashboard ve terminal çıktıları tema ayarına uyumlu olmalıdır.

**Sprint 152 Durumu:** ⚠️ IN_PROGRESS

---

### Gate 10 — `Memory V2 stress`

`.brain/memory.db` üzerinde 1.000+ entry ekleme/güncelleme/silme döngüsü çalıştırıldığında FTS5 sorgu süresi 100ms altında kalmalı, DB bütünlüğü korunmalıdır. Turkish normalize dual-layer arama (TR/EN/DE) doğrulanmış olmalıdır.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 11 — `doc sync`

`deckent memory export` çalıştırıldığında `.brain/exports/summary.md`, `decisions.md`, `memory.md` ve `debt.md` dosyaları güncel DB ile senkron olmalıdır. Managed-Docs pipeline (ADR-029, ADR-030) sprint finalizasyonunda otomatik tetiklenmelidir.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 12 — `bundle`

`npm run build:all` komutu hatasız tamamlanmalı; hem `dist/` TypeScript çıktısı hem de `dashboard/dist/` Vite bundle'ı üretilmelidir. Bundle boyutu önceki sürüme kıyasla %20'den fazla artmamalıdır.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 13 — `messaging trio smoke`

Discord, Telegram ve WhatsApp connector'larının her biri bir mesaj gönderip alabilmelidir (test token ile). `connectors/` modülündeki `incoming-router` tüm üç kaynaktan gelen event'leri doğru yönlendirmelidir.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 14 — `Dockerfile non-root`

`docker build` ve `docker run` süreçlerinde container root olmayan bir kullanıcı ile çalışmalıdır. `USER deckent` direktifi veya eşdeğeri Dockerfile'da bulunmalı; workspace mount izinleri doğru yapılandırılmış olmalıdır.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 15 — `20 seed skill signed`

DeckentHub için 20 temel skill (seed skills), Ed25519 anahtar çifti ile imzalanmış olmalıdır. `scripts/sign-seed-skills.mjs` çalıştırıldığında tüm skill manifest'lerinde `signature` alanı bulunmalı; `verifySkillSignature()` tüm imzaları doğrulamalıdır.

**Sprint 152 Durumu:** ⚠️ IN_PROGRESS (21 built-in skill var; imzalama pipeline'ı tamamlanmamış)

---

### Gate 16 — `config dedup`

`.deckent/config.json` içinde aynı anahtarın birden fazla layer'da (defaults → global → project) tekrarlananları olmaksızın 3-layer merge yapıldığı doğrulanmalıdır. `deckent config read` çıktısı kaynak layer bilgisini göstermelidir (ADR-004).

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 17 — `docs cache untrack`

`.gitignore`'da `docs/` cache dosyaları (`.docscache`, `content-hash.json`) listelenmiş olmalı; `git status` bu dosyaları untracked olarak göstermemelidir. ADR-031 content hash cache sistemi devrededir.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 18 — `docs.json split`

Managed-Docs yapılandırması tek bir monolitik `docs.json` yerine template başına ayrı dosyalara bölünmüş olmalıdır. Her template dosyası bağımsız olarak yüklenip işlenebilmelidir (ADR-030 Plugin Loader).

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 19 — `metrics rotation`

`.deckent/sprint-NNN-metrics.jsonl` dosyaları belirli bir retention policy (varsayılan: son 10 sprint) sonrasında otomatik arşivlenmeli veya silinmelidir. `deckent cleanup` komutu metrics rotation'ı tetiklemelidir.

**Sprint 152 Durumu:** ✅ PASS

---

### Gate 20 — `sprint file count`

Sprint başına `.tasks/` dizininde oluşturulan dosya sayısı (`.json`, `.hb`, `.result`, `.plan`) yapılandırılabilir bir üst sınır (`max_task_files` config) altında kalmalı; bu sınır aşıldığında Auditor alert üretmelidir.

**Sprint 152 Durumu:** ✅ PASS

---

## Özet Tablo

| # | Gate | Kategori | Sprint 152 Durumu |
|---|------|----------|-------------------|
| 1 | tsc 0 error | Kod Kalitesi | ✅ PASS |
| 2 | vitest ≥99.5% | Test Güvenilirliği | ✅ PASS |
| 3 | coverage ≥85% | Test Kapsamı | ✅ PASS |
| 4 | 27+ MCP tool | API Yüzeyi | ⚠️ IN_PROGRESS |
| 5 | 45+ CLI komut | CLI Olgunluğu | ✅ PASS |
| 6 | npm pack temiz | Paket Bütünlüğü | ✅ PASS |
| 7 | cross-platform 3/3 | Platform Desteği | ✅ PASS |
| 8 | multi-provider 3/3 | Provider Desteği | ✅ PASS |
| 9 | deckent_style toggle | UX | ⚠️ IN_PROGRESS |
| 10 | Memory V2 stress | Dayanıklılık | ✅ PASS |
| 11 | doc sync | Dokümantasyon | ✅ PASS |
| 12 | bundle | Build Bütünlüğü | ✅ PASS |
| 13 | messaging trio smoke | Entegrasyon | ✅ PASS |
| 14 | Dockerfile non-root | Güvenlik | ✅ PASS |
| 15 | 20 seed skill signed | Güvenlik | ⚠️ IN_PROGRESS |
| 16 | config dedup | Config Yönetimi | ✅ PASS |
| 17 | docs cache untrack | Git Hijyeni | ✅ PASS |
| 18 | docs.json split | Mimari | ✅ PASS |
| 19 | metrics rotation | Operasyonel | ✅ PASS |
| 20 | sprint file count | Operasyonel | ✅ PASS |

**Toplam: 17–19/20 PASS** (Gate 4, 9 ve 15 tamamlanma aşamasında)

---

## Sonuç ve Sonraki Adımlar

Beta GA geçişi için 3 kalan gate kritik öneme sahiptir:

1. **Gate 4 (27+ MCP tool):** Mevcut 23 tool'dan 27'ye çıkmak için 4 yeni tool eklenmesi gerekiyor — öncelikli olarak `deckent_mode`, `deckent_upgrade`, `deckent_plugin` ve `deckent_benchmark` tool'ları hedeflenmektedir.

2. **Gate 9 (deckent_style toggle):** Dashboard tema sistemi CLI ile entegre edilmelidir; `mode-presets.ts` içindeki `MODE_PRESETS` yapısına stil seçeneği eklenmesi planlanmaktadır.

3. **Gate 15 (20 seed skill signed):** `scripts/sign-seed-skills.mjs` scripti tüm 21 built-in skill üzerinde çalıştırılmalı ve CI pipeline'a entegre edilmelidir.

Bu 3 gate geçildiğinde Deckent 20/20 ile tam Beta GA kriterlerini karşılamış olacak ve `npm publish` için Alperen'in onayı istenecektir.
