# `docs/design/multi-project-isolation.md` Audit — 2026-05-22

**Kapsam:** `docs/design/multi-project-isolation.md` — ADR-034 uygulama durumu, 10 bölüm doğrulama, implementasyon/belge uyuşmazlıkları  
**Metodoloji:** Sistematik debugging — her bölüm iddiası gerçek kod/test ile grep+okuma yöntemiyle doğrulandı  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı

---

## Bu Dosya Nedir

`docs/design/multi-project-isolation.md` — Sprint 134 Task 12'de architect agent tarafından üretilen tasarım belgesi. ADR-034 (Multi-Project Isolation) referanslı; tek kullanıcı, çoklu proje izolasyon sınırlarını, tehdit modelini, hafifletme örüntülerini ve test stratejisini tanımlar. 2026-04-11 tarihli, Sprint 134'ün "mevcut sprint" olarak gösterildiği — şu an Sprint 186'dayız.

---

## Doğrulama Sonuçları — Bölüm Bölüm

### Bölüm 4.1 — Symlink-Aware `isWithinScope()` ✅ DOĞRU

`src/agents/worker.ts:492` — tam olarak tasarım belgesiyle eşleşiyor:
- `realpathSync()` ile symlink çözümleme ✅
- Proje kökü dışı → `return false` ✅
- `ELOOP` → `return false` ✅
- `ENOENT` → normal path kontrol'e düşüş ✅
- `projectRoot` verilmezse eski davranış (geri uyumlu) ✅

### Bölüm 5.1 — Symlink Unit Testleri ✅ DOĞRU

`tests/agents/worker.test.ts:559` — tasarım belgesindeki tüm test senaryoları mevcut:
- symlink-in-scope ✅, symlink-out-of-scope ✅, ELOOP ✅, ENOENT ✅, no-projectRoot ✅

### Bölüm 2.1 — `.brain/` Dizin Yapısı ⚠️ GÜNCEL DEĞİL

Belge şunları listeler: `DECISIONS.md`, `MEMORY.md`, `RETRO.md`, `PATTERNS.md`, `DEBT.md`

**Gerçek durum (Memory V2 DB-first, Sprint 167+):**
- Birincil depo: `.brain/memory.db` (SQLite) — belgelenmiyor
- `.md` dosyaları → `.brain/exports/` altında üretilen görünümler (`decisions.md`, `memory.md`, `debt.md`)
- `DEBT.md` (kök düzeyde) — Sprint 186 Task #4 ile **kaldırıldı**; artık DB'de `type=debt` kayıtları

### Bölüm 4.2 — Credential Per-Project İzolasyonu ❌ UYGULANMADI

Belge iddiası: `HKDF(machine_key, project_root_path_hash)` ile proje başına ayrı şifreleme anahtarı; `.deckent/credentials.enc` depolama.

**Gerçek implementasyon (`src/core/credentials.ts`):**
- Tek global master key: `~/.deckent/.keyring` (proje başına değil)
- Kimlik bilgileri: `~/.deckent/credentials/<provider>.json` (global, proje-yerel değil)
- `getMasterKey()` proje yolunu parametre almıyor; HKDF türetimi yok
- `.deckent/credentials.enc` dosyası projede hiç oluşturulmuyor

Tasarım belgesindeki per-project HKDF türetimi planlandı ama uygulanmadı. Şu anki model: tüm projeler aynı global master key'i paylaşıyor.

**Güvenlik etkisi:** Credential şifrelemesi teknik olarak çalışıyor (AES-256-GCM), ama farklı projeler arasında izolasyon yok — Project A'nın şifreli dosyası kopyalanırsa Project B bağlamında çözülebilir (aynı key). Tasarım belgesinin vaat ettiği per-project izolasyon sağlanmıyor.

### Bölüm 4.3 — Config Boundary Enforcement ❌ UYGULANMADI

Belge: `writeProjectConfig()` fonksiyonu `realpathSync()` ile config yazma doğrulaması yapıyor.

**Gerçek durum:** Bu fonksiyon hiçbir dosyada yok. `src/core/config.ts` doğrudan `writeFileSync()` kullanıyor, symlink-aware path doğrulama yok. `validateDocPath()` (`src/orchestra/managed-docs/docs-config.ts:62`) var ama bu config yazma için değil, docs path güvenliği için.

**Etki:** Teori T3 (global config pollution) için tasarlanan koruma uygulanmamış. Ancak pratik risk düşük: sprint operasyonları global config'e yazmıyor (kod akışı doğrulandı).

### Bölüm 5.2 — Multi-Project Integration Testleri ❌ UYGULANMADI

Belge planlıyor: `cross-project-symlink`, `concurrent-sprints`, `credential-isolation`, `config-isolation`, `lock-isolation` testleri.

`tests/integration/` dizininde bu testlerin hiçbiri yok. `mcp-sprint-isolation.test.ts` var ama içeriği MCP tool izolasyonu, multi-project filesystem izolasyonu değil.

### Bölüm 5.3 — Sprint 132 Regression Testleri ⚠️ KISMEN

Belge: "Sprint 132 MEDIUM #10", "Sprint 132 LOW #4" etiketleriyle regression testleri öngörüyor. `worker.test.ts`'de bu etiketlere yapılan hiçbir referans yok. Symlink scope testleri var ama Sprint 132 regression bağlantısı kurulmuyor.

### Bölüm 8 — Uygulama Planı ⚠️ TARİHSEL

"Sprint 134 (Mevcut)" ifadesi stale — Sprint 186'dayız. Planlanan ama yapılmayan çalışmalar:

| Planlanan (135-150) | Durum |
|--------------------|-------|
| Integration tests — multi-project filesystem | ❌ Yapılmadı |
| Config write validation | ❌ Yapılmadı |
| Optional inode comparison (hardlink detection) | ❌ Yapılmadı |
| `isWithinScope()` path cache | ❌ Yapılmadı |
| Security regression test suite automation | ❌ Yapılmadı |

Symlink scope enforcement ve unit testler Sprint 134'te tamamlandı; gelecek sprint yol haritası uygulanmadı.

---

## Uygulanan Değişiklikler

| Dosya | Değişiklik | Sorun |
|-------|-----------|-------|
| `docs/design/multi-project-isolation.md` | Bölüm 2.1 `.brain/` yapısı → Memory V2 DB-first gerçeği | Stale |
| `docs/design/multi-project-isolation.md` | Bölüm 4.2 Credential izolasyonu → "NOT YET IMPLEMENTED" etiketi + gerçek implementasyon notu | ❌ |
| `docs/design/multi-project-isolation.md` | Bölüm 4.3 Config boundary → "NOT YET IMPLEMENTED" etiketi | ❌ |
| `docs/design/multi-project-isolation.md` | Bölüm 5.2 Integration tests → "NOT YET IMPLEMENTED" etiketi | ❌ |
| `docs/design/multi-project-isolation.md` | Bölüm 8 → "Historical note" + post-Sprint-134 gerçeği | Stale |
| `docs/design/multi-project-isolation.md` | Footer "Last updated" → 2026-05-22 | Stale |

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- `isWithinScope()` implementasyonu sağlam ve test kapsamlı.
- Ama credential per-project izolasyonu (Bölüm 4.2) vaat edilip uygulanmadı — OSS kullanıcısı güvenlik iddialarına güvenirse yanılır.

**Kullanıcı perspektifi:**
- Tek kullanıcı, çoklu proje senaryosu için temel izolasyon (scope enforcement) çalışıyor.
- Credential isolation (farklı proyeler farklı anahtar) gerçekleşmedi — şu an tüm projeler aynı global master key kullanıyor.
- Integration test kapsamı (concurrent sprints, credential isolation) eksik.

---

## Gelecek Öneriler

1. **Credential per-project izolasyonu (Sorun 4.2):** Gerçek HKDF türetimi veya belgeyi güncelleyerek mevcut modeli (global master key) açıkça belgele. OSS kullanıcısı için şeffaflık gerekli.
2. **Integration test kapsamı (Sorun 5.2):** En az `cross-project-symlink` ve `concurrent-sprints` testleri eklenebilir — temel izolasyon güvencesi için.
3. **Config write guard (Sorun 4.3):** Düşük risk ama tasarım belgesinde vaat edilen koruma eksik. Basit path kontrol eklenebilir.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `docs/design/multi-project-isolation.md` — Sprint 134 ADR-034 tasarım belgesi; temel `isWithinScope()` implementasyonu + unit testleri doğru ve çalışıyor. **Dört bölüm uygulanmadı:** credential per-project key derivation (4.2), config write boundary enforcement (4.3), integration testler (5.2), future sprint roadmap (8). Belge güncellendi: stale kısımlar "NOT YET IMPLEMENTED" etiketiyle işaretlendi, `.brain/` yapısı Memory V2 gerçeğine çekildi.
