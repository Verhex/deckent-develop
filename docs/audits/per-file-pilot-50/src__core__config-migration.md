# Audit — `src/core/config-migration.ts`

**Sprint:** 187 (per-file pilot 50 — task 186-035, recovery after Docker OOM partial-result)
**Auditor:** doc-writer (Claude/opus, subprocess)
**Audit date:** 2026-05-21
**File scope:** `src/core/config-migration.ts`
**ADR focus per directive:** ADR-004 (3-Layer Config Merge), ADR-022/023 (Provider-Agnostic Tier), ADR-029/032 (Managed-Docs i18n — non-applicable), ADR-008 (Tek Yönlü Bağımlılık), ADR-009 (Markdown formatı — N/A).

---

## 1. Inventory

- **LoC:** 636 satır (`wc -l` = 636; dosya `'\n'`-terminated, son satır boş; gövde 1–636).
- **Kaynak başlığı (l.1-6):** *“Config Migration Helper — Migrates old (minimal) config.json files to the new (full) format. Preserves existing values — only adds missing fields with their defaults.”*
- **Imports (7 modül):**
  - `node:fs` — `readFileSync`, `writeFileSync`, `existsSync`, `copyFileSync`, `readdirSync`, `unlinkSync` (sync I/O, ADR-005 deprecated ama legacy migration için kasıtlı).
  - `node:path` — `dirname`, `basename`.
  - `./config.js` — `createDefaultConfig` (defaults source).
  - `./observability.js` — `structuredLog` (warn/info kanalları için).
  - `./types.js` — `DeckentConfig` (type-only).
  - `./model-equivalence.js` — `ModelTier` (`'economy' | 'standard' | 'premium' | 'premium_plus'`).
  - `./task-types.js` — `ProviderName` (type-only).
- **Public exports — fonksiyonlar (9):**
  - `getMissingFields` (l.90) — defaults vs existing diff, dot-path leaf listesi.
  - `needsMigration` (l.144) — boolean kapı (missing fields OR legacy mode OR duplicate keys).
  - `hasDuplicateKeys` (l.160) — non-destructive duplicate detector (Sprint 150 Decision 3+4).
  - `migrateConfig` (l.183) — file-based migration (read → backup → merge → write → prune).
  - `pruneConfigBackups` (l.317) — backup rotation, default `keepCount=3`.
  - `migrateConfigInMemory` (l.369) — saf in-memory field-fill (test/programmatic).
  - `migrateConfigFull` (l.397) — `migrateConfigInMemory` + `migrateConfigV1ToV2` kombinasyonu.
  - `modelToTier` (l.430) — v1 model adı → v2 `ModelTier` mapping.
  - `migrateConfigV1ToV2` (l.489) — `model_strategy` + `providers` v2 alanlarını türetir.
  - `needsV2Migration` (l.579) — v1→v2 dry-run kapısı.
  - `removeDuplicateKeys` (l.602) — destruktif duplicate purge (Sprint 150).
- **Public exports — interfaces (3):**
  - `MigrationResult` (l.23) — `{ migrated, addedFields, backupPath, error? }`.
  - `ConfigModelStrategy` (l.457) — `{ brain_tier?, worker_tier?, min_tier?, max_tier?, auto_upgrade?, auto_downgrade? }`.
  - `ConfigProviders` (l.469) — `{ brain?, worker?, fallback?, overrides? }`.
- **Re-exports (l.636):** `collectKeys`, `getNestedValue`, `setNestedValue` (internal helpers exposed for testing).
- **Internal (named, not export-default):**
  - `collectKeys(obj, prefix='')` (l.38) — recursive leaf-key collector; dosya içinde **kullanılmıyor**, yalnız re-export.
  - `getNestedValue(obj, path)` (l.55) — dot-path getter; `migrateConfig` + `migrateConfigInMemory` + `migrateConfigFull` içinde aktif.
  - `setNestedValue(obj, path, value)` (l.68) — dot-path setter (array-aware override); aynı şekilde 3 yerde aktif.
- **Internal sabitler:** `LEGACY_MODE_MAP` (l.212-216, function-scoped) — `{ max_plan→performance, max5x_plan→balanced, pro_plan→economic }`.
- **Reverse-dep grafiği (src/):**
  - `src/core/config.ts` — `migrateConfig`, `needsMigration`, `migrateConfigInMemory`, `migrateConfigFull` çağrılır (config loader pipeline).
  - `src/mcp/tools/config.ts` — migration trigger (MCP `deckent_config` tool).
  - `src/cli/commands/config.ts` — CLI `deckent config migrate` komutu.
  - `model-equivalence.ts` *tek yönlü* — type bağımlılığı (✓ ADR-008).
- **Reverse-dep grafiği (tests/):**
  - `tests/core/config-migration.test.ts` — ana suite (field-fill, legacy mode, duplicate keys).
  - `tests/core/config-sprint063.test.ts` — Sprint 063 mode rename regression.
  - `tests/core/config-sprint064.test.ts` — Sprint 064 default backfill regression.
  - `tests/core/config-backup-rotation.test.ts` — `pruneConfigBackups` coverage.
  - `tests/core/config-corrupted-recovery.test.ts` — JSON.parse error path.
  - `tests/cli/commands/config-overhaul.test.ts` — CLI migration entry point.

---

## 2. Bağlam

- **Mimari rol:** Config dosyalarının **şema evrim adapter'ı**. Üç farklı evrim kanalını tek dosyada birleştirir:
  1. **Field-fill migration** — `getMissingFields` + `migrateConfigInMemory`; `createDefaultConfig()` defaults'ı eksik alanlara yazar (existing değerlere dokunmaz).
  2. **Legacy mode rename** — `max_plan/max5x_plan/pro_plan → performance/balanced/economic` (Sprint 063 öncesi → Sprint 063+).
  3. **V1→V2 tier migration** — `brain_model/default_model/haiku_allowed` flat alanlarından `model_strategy` + `providers` nested şemasını türetir (Sprint 086 ekseninde ADR-023 doğrultusunda).
  4. **Duplicate key purge** — `spawn_backend` ↔ `claude_backend`, `providers.brain` ↔ `brain_provider` çakışmalarını Decision 3+4 matrisine göre temizler (Sprint 150).
  5. **Backup hygiene** — ISO-timestamp'li `.bak.YYYY-MM-DDT…` snapshot'ları; varsayılan 3'ünü saklar, geri kalanı `pruneConfigBackups` ile siler.
- **ADR bağlamı:**
  - **ADR-004 (3-Layer Config Merge — defaults → global → project):** Bu modül `defaults` (createDefaultConfig) ↔ `existing` (project) merge'inin migration kanalı. `migrateConfigInMemory` *“existing values preserved, only missing fields added”* semantiğini koruyor → ADR-004 ile uyumlu (✓).
  - **ADR-005 (Synchronous I/O — deprecated):** Modül `readFileSync`/`writeFileSync`/`copyFileSync`/`readdirSync`/`unlinkSync` kullanıyor. CLI başlangıç akışındaki tek-shot çağrı olduğundan kasıtlı, ama ADR-005 *deprecated* etiketli olduğu için ileride async'e geçiş yol haritasında olmalı.
  - **ADR-008 (Tek Yönlü Bağımlılık):** Yalnızca `core/` paketine bağımlı (`config.ts`, `observability.ts`, `types.ts`, `model-equivalence.ts`, `task-types.ts`). Brain/auditor/worker import edilmiyor (✓).
  - **ADR-022 / ADR-023 (Provider-Agnostic Tier — Sprint 072):** `modelToTier` (l.430-450) v1 model → tier mapping yapıyor; ama mapping **`o3` → `'standard'`** (l.438) — DECKENT.md *“`o3`/`gemini-3.1-pro-preview` = premium_plus”* hükmüyle çelişiyor (`model-equivalence.ts:11` `ModelTier = 'economy' | 'standard' | 'premium' | 'premium_plus'`). Bu **ADR-023 ihlali**; mapping tablosu eksik. Detay §3 risk #1.
  - **ADR-009 (DEBT.md Markdown Tablo Formatı):** N/A — markdown üretmiyor.
  - **ADR-029 / ADR-032 (Managed-Docs i18n):** N/A — bu dosya doküman üretmiyor; yalnızca config JSON yazıyor.
  - **ADR-046 (Brain Self-Update Hook Architecture):** Step Ordering Contract burada da yansıyor — `migrateConfig` (l.183-310) **sırası kritik**: `LEGACY_MODE_MAP` → `removeDuplicateKeys` → `getMissingFields` → `setNestedValue`. Yorumda *“removeDuplicateKeys is destructive — must run before getMissingFields”* (l.246-247) açıkça belirtilmiş (✓).
- **Sprint geçmişi (kaynak yorum + git arkeoloji):**
  - **Sprint 063** — `LEGACY_MODE_MAP` eklendi (`max_plan→performance` rename) + `mode` üst-düzey alanı.
  - **Sprint 064** — `migrateConfigInMemory` test-friendly entry point.
  - **Sprint 066** — `routing_engine: 'v1'` field eklendi (l.87 yorumu).
  - **Sprint 072** — `modelToTier` + ADR-023 tier generalizasyonu (Codex ekseni).
  - **Sprint 086** — V1→V2 migration kanalı (`migrateConfigV1ToV2`, `ConfigModelStrategy`, `ConfigProviders`).
  - **Sprint 089** — `usage_thresholds` removal (l.238-243 *“Remove usage_thresholds from all modes”*).
  - **Sprint 150** — Decision 3+4: `removeDuplicateKeys` + `hasDuplicateKeys` (`claude_backend` vs `spawn_backend`, flat provider fields vs `providers.*`).
  - **Sprint 164+** — ISO-timestamp backup naming + `pruneConfigBackups` `keepCount=3` rotation.

---

## 3. Debt Risk

| # | Risk | Şiddet | Tetikleyici | Etki |
|---|------|--------|-------------|------|
| 1 | `modelToTier` `o3` → `'standard'` (ADR-023 ihlali) | 🟥 Kritik | l.438 `case 'o3':` `'standard'` döner; DECKENT.md ve `model-equivalence.ts:11` `o3 = premium_plus`. `gemini-3.1-pro-preview` listede yok. | V1→V2 migration `o3` kullanan kullanıcıyı sessizce *standard* tier'a düşürür → maliyet/kalite anomalisi. ADR-023 amendment veya kod fix gerekir. |
| 2 | `collectKeys` re-export edilmiş ama dosyada **kullanılmıyor** + src/ içinde 0-caller | 🟧 Yüksek | l.38 tanım + l.44 recursive self-call + l.636 re-export. `grep -rn "collectKeys" src/` yalnız aynı dosya. Yorum *“is exported for testing purposes”* der (l.635). | Public yüzeyde ölü symbol; refactor saçaklanması. ADR-008 niyetiyle çelişmez ama API hijack riski. |
| 3 | `setNestedValue` array-üzerine yazıyor (sessiz veri kaybı) | 🟧 Yüksek | l.73-74 `if (typeof current[part] !== 'object' || current[part] === null || Array.isArray(current[part])) { current[part] = {}; }`. Mevcut alan dizi ise siliniyor. | `modes.xyz.foo = ['a','b']` gibi kullanıcı override'ı migration sırasında **sessizce siliniyor** ve `{}` ile değiştiriliyor. Backup var ama uyarı yok. |
| 4 | `migrateConfig` legacy mode rename'de canonical varlığını kontrol etmiyor | 🟧 Yüksek | l.229-236: `if (!(newName in existingModes)) { existingModes[newName] = existingModes[oldName]; } delete existingModes[oldName];`. Canonical zaten varsa **legacy mode silinir ama tercih edilmez**; iki konfigürasyon birleştirilmez. | Kullanıcı hem `max_plan` (eski) hem `performance` (yeni) tanımlamışsa, legacy değerler kayıp. Sessiz silinme. |
| 5 | `migrateConfig` shallow-clone (`merged = { ...existing }`) | 🟨 Orta | l.275, l.374, l.401. Nested `modes`/`providers` reference paylaşıyor. `setNestedValue` `merged` üzerinden yazınca `existing` da mutasyona uğrar. | Test isolation sızıntısı; `migrateConfigInMemory(cfg)` çağrısı `cfg`'yi de değiştirebilir → çağıran beklenmedik state alır. |
| 6 | `removeDuplicateKeys` ile `migrateConfigV1ToV2` arası sıra inkonsistensisi | 🟨 Orta | `migrateConfig` (file path): `legacyRename → removeDuplicates → getMissingFields → setNested`. `migrateConfigFull` (in-memory): `migrateConfigV1ToV2 → getMissingFields → setNested`. **`removeDuplicateKeys` `migrateConfigFull`'da çağrılmıyor.** | In-memory full path duplicate keys'i temizlemez → kullanıcı `migrateConfigFull` çağırırsa kirli config döner. API tutarsızlığı. |
| 7 | `pruneConfigBackups` POSIX path-only (`${dir}/${name}`) | 🟨 Orta | l.347 `const fullPath = \`${dir}/${name}\`` — Windows separator `\` yerine `/`. `unlinkSync` POSIX-style path kabul eder ama log/error string'leri yanıltıcı. | Cross-platform tutarsız kullanıcı deneyimi; Windows'ta backup pruning çalışır ama log'lar karışık. |
| 8 | `pruneConfigBackups` regex eski legacy `.bak` snapshot'ı **korumuyor** ama mesaj `“is preserved”` diyor | 🟨 Orta | l.314-315 JSDoc: *“The legacy timestamp-less `{basename}.bak` snapshot is preserved.”* Regex `\\.bak\\.\\d{4}-…` — `.bak` (timestamp'siz) **bu pattern'e uymadığı için silinmez** — yorum doğru ama davranış dolaylı (regex eşleşmediği için silinmez, *kasıtlı* görünmüyor). | Tasarım niyeti açık değil; gelecek bir refactor regex'i genişletirse legacy backup kazara silinir. |
| 9 | `migrateConfig` JSON parse hatası backup yapmadan dönüyor | 🟨 Orta | l.202-209: parse fail → error string, hiç backup yok. Mevcut bozuk dosya korunuyor ama kullanıcı **yan kopya almıyor** — manuel müdahale risklı. | Kullanıcı bozuk config'i manuel düzeltirse, otomatik recovery için snapshot olmadığı için "önce nasıldı" görülmüyor. |
| 10 | `getMissingFields` nested kontrolü **yalnızca `modes.<mode>.<sub>` 2 seviye derinliğe** kadar gidiyor | 🟨 Orta | l.114-126: yalnız tek seviye nested kontrolü (`modes.X.Y.Z` 3. seviye eksik). Diğer top-level nested object'ler (`providers.overrides`, `model_strategy.*`) kontrol edilmiyor. | Kullanıcı kısmen tanımlanmış `providers: {}` koysa, default değerler eksik kalır → `migrateConfig` bunu fark etmez. |
| 11 | `structuredLog` warn/info çağrıları silent fail kategorisinde | 🟩 Düşük | `prune_backups_unlink_failed`, `config_backups_prune_failed` warn'ları kullanıcıya doğrudan gözükmez (CLI quiet by default). | Pruning hatalarını test/audit dışında kimse görmez. |
| 12 | `removeDuplicateKeys` `providers.overrides` çakışmasını kontrol etmiyor | 🟩 Düşük | l.612-625: `providers.brain/worker/fallback` için duplicate purge var ama `providers.overrides` (Sprint 086) yok. | Kullanıcı `overrides` koyarsa flat eşdeğeri ile yan yana yaşar (tasarım niyeti açık değil). |
| 13 | `getMissingFields` `Array.isArray` kontrolü yok (l.43 `collectKeys`'te var) | 🟩 Düşük | l.115 `typeof defaultVal === 'object' && defaultVal !== null && !Array.isArray(defaultVal)` — `defaultVal` array ise nested kontrol atlanır (doğru). Ama `existingVal` *array* iken *defaultVal object* ise, nested arama `for(... in existingVal)` ile çalışır → array index'leri key olarak yorumlar. | Edge case; pratikte tetiklemek zor. Defensive niyet yorumda yok. |
| 14 | `hasDuplicateKeys` src/ 0-caller dışında (yalnız `needsMigration` içinde) | 🟩 Düşük | `grep -rn "hasDuplicateKeys" src/` = `config-migration.ts:152, 160`. Public export ama dış kullanıcı yok. | API yüzey şişkinliği; private yapılabilir. |

---

## 4. Dead Code Candidates

| Sembol | Konum | Grep kanıtı | Sonuç |
|--------|-------|-------------|-------|
| `collectKeys` | l.38-50 (tanım), l.44 (recursive), l.636 (re-export) | `grep -rn "collectKeys" src/` → yalnız `config-migration.ts`. `grep -rn "collectKeys" tests/` → muhtemel test (içerik incelenmedi). | Production'da fiilen ölü helper; yorum *“exported for testing purposes”* — testler dışında kullanılmıyor. Konsolidasyon adayı. |
| `hasDuplicateKeys` | l.160-169 (tanım), l.152 (needsMigration kullanımı) | `grep -rn "hasDuplicateKeys" src/` → 2 hit aynı dosyada. Dış kullanıcı yok. | Internal helper-as-public-export; private yapılabilir veya `needsMigration` içine inline edilebilir. |
| `modelToTier` | l.430-450 (tanım), l.513/520 (kullanım) | `grep -rn "modelToTier" src/` → yalnız `config-migration.ts` (4 hit). Dış kullanıcı yok. | Public export ama kullanım iç; signature stable kalsa da `ModelRegistry` üzerinden delegasyon daha sağlıklı (mapping tablosu zaten orada). |
| `ConfigModelStrategy`, `ConfigProviders` (interface) | l.457, l.469 | `grep -rn "ConfigModelStrategy\\|ConfigProviders" src/` → yalnız tanım dosyası. | Tip dış kullanımı yok; muhtemel test re-import. **Yorum (l.456) ‘kept as plain object type here to avoid circular dependency’** der; bu kasıtlı duplikasyon — ama uzun vadede `mode-presets.ts` ile drift kaynağı. |
| `needsV2Migration` | l.579-587 | `grep -rn "needsV2Migration" src/` → yalnız tanım. | Public export ama 0-caller src/'da; testler dışında dead. |
| `pruneConfigBackups` (keepCount param 2. arg) | l.317 | İç çağrı `migrateConfig`'te `pruneConfigBackups(configPath, 3)` (l.291) — daima 3. Param config'lenebilir görünüyor ama runtime sabit. | API daha esnek görünüyor; pratikte sabit → docs gap (kullanıcı `keepCount`'u nasıl override eder, yol yok). |

> **Not — “0-caller” ölçütü:** Yalnızca `src/` ağacı tarandı. Test ağacı (`tests/core/config-migration*.test.ts` vb.) bu sembolleri kullanır — fakat *production code path*'i değil, *contract test*'i ifade eder. Sembolün “canlı” sayılması için `src/` veya `dist/` çağrısı gerekir.

Grep komutları (tekrarlanabilirlik):
- `grep -rn "from '.*config-migration" src/ tests/`
- `grep -rn "collectKeys\\|hasDuplicateKeys\\|modelToTier\\|needsV2Migration\\|ConfigModelStrategy\\|ConfigProviders" src/`
- `grep -rn "migrateConfig\\|migrateConfigInMemory\\|migrateConfigFull\\|migrateConfigV1ToV2" src/`

---

## 5. Documentation Gaps

| # | Eksik | Mevcut | Beklenen |
|---|-------|--------|----------|
| 1 | `modelToTier` ADR-023 referansı yok | JSDoc *“Used during config migration to convert brain_model / default_model to tier-based config.”* | *“ADR-023 (Provider-Agnostic Tier) gereği `o3` ve `gemini-3.1-pro-preview` → `premium_plus` mapping eksik; default fallback `'standard'`.”* eklenmeli. Bug-doc çakışması açıklanmalı. |
| 2 | `migrateConfig` legacy mode collision davranışı | l.227-237 yorumsuz | Yorum: *“Legacy mode rename: if canonical mode already exists, legacy is **silently dropped** (no merge).”* |
| 3 | `setNestedValue` array override davranışı | JSDoc *“Set a nested value in an object by dot-separated path.”* | Uyarı: *“Eğer mevcut path bir array içeriyorsa, üzerine yazılır (`{}` ile değiştirilir). Migration’da kullanıcı array değerleri *kasıtlı* korumak istiyorsa, `getMissingFields` o path’i missing olarak işaretlemediği sürece güvenli — ama defensive değil.”* |
| 4 | `migrateConfigFull` `removeDuplicateKeys` çağırmıyor | Hiç belirtilmemiş | JSDoc: *“Note: `migrateConfigFull` does **not** invoke `removeDuplicateKeys`. Use `migrateConfig` (file path) for full duplicate purge.”* |
| 5 | `pruneConfigBackups` `keepCount` param | l.313-316 JSDoc'unda `keepCount: number = 3` parametre adı geçer ama *“config'lenebilir mi”* belirtilmez | Eklenmeli: *“`keepCount` runtime'da sabit (`migrateConfig` her seferinde 3 geçer). Config-driven override şu an desteklenmiyor; Sprint 188+ adayı.”* |
| 6 | `migrateConfig` JSON parse hatası fallback davranışı | l.202-209 *“Failed to parse config JSON: …”* error string | JSDoc'ta açıklanmalı: *“Bozuk JSON tespit edildiğinde **backup oluşturulmaz**; kullanıcı manuel müdahale etmelidir. Veri kaybı yok ama disaster recovery için snapshot eksik.”* |
| 7 | Sprint kaynak referansları (l.87, l.151, l.238, l.246) düzensiz | Sprint 066, Sprint 150 Decision 3+4, Sprint 089 yorumda var ama ADR ID yok | Her yorum bloğunda *(Sprint NNN — ADR-XXX)* formatına çekilmeli (ADR-046 Step Ordering gereği). |
| 8 | `ConfigModelStrategy` / `ConfigProviders` `mode-presets.ts` ile duplikasyon | l.452-456 *“Kept as a plain object type here to avoid circular dependency”* | *“⚠ Duplikasyon riski: `mode-presets.ts:ModelStrategy` ile manuel senkronize tutulmalı. Sprint 188+ adayı: ortak tipi `src/core/types.ts`'e taşımak.”* |

---

## 6. ADR Compliance Check

| ADR | Konu | Durum | Kanıt |
|-----|------|-------|-------|
| ADR-001 (TS + ESM) | TypeScript + ESM | ✅ uyumlu | `import` syntax + `.js` uzantıları (l.8-21). |
| ADR-002 (Node16 module resolution) | `.js` uzantısı | ✅ uyumlu | Tüm relative import `.js` ile bitiyor. |
| ADR-004 (3-Layer Config Merge) | defaults preserved → only missing added | ✅ uyumlu | `migrateConfigInMemory` semantiği (l.374-389) *existing preserved*. |
| ADR-005 (Synchronous I/O — *deprecated*) | sync FS | ⚠ kasıtlı borç | `readFileSync`, `writeFileSync`, `copyFileSync`, `readdirSync`, `unlinkSync` (l.8-15). CLI tek-shot migration için tercih edilmiş ama ADR-005 *deprecated*. |
| ADR-006 (spawnSync Security) | N/A | – | Process spawn yok. |
| ADR-008 (Tek Yönlü Bağımlılık) | yalnız core/ | ✅ uyumlu | `./config.js`, `./observability.js`, `./types.js`, `./model-equivalence.js`, `./task-types.js` — hepsi `core/` paketi. |
| ADR-009 (DEBT.md tablo formatı) | N/A | – | Markdown üretmiyor. |
| ADR-022 / ADR-023 (Provider-Agnostic Tier) | `o3` → premium_plus, `gemini-3.1-pro-preview` → premium_plus | ❌ ihlal | `modelToTier` (l.430-450) `o3 → 'standard'`. `gemini-3.1-pro-preview` mapping listede yok. **NO_GO veya ADR amendment gerekiyor.** |
| ADR-029 (Managed-Docs Universalization) | N/A | – | Bu dosya sprint-doc üretmiyor. |
| ADR-030 (Template Engine + Plugin Loader) | N/A | – | Plugin/template kullanmıyor. |
| ADR-032 (i18n Pattern) | N/A | – | Markdown bölümleri yok. |
| ADR-035 (Verification Protocol) | dolaylı | – | Migration kanalı için verify channel yok; `migrateConfig` çıktısı `MigrationResult` ile audit-trail sağlar — ama 15-kanal kontratına bağlı değil. |
| ADR-037 V1.0 (Authority Matrix RBAC) | Brain-only ihlal yok | ✅ uyumlu | Worker/Brain ayrımına dokunmuyor; config persistence ortak. |
| ADR-038 (Dead Code Disposition) | dead-tree-internal | ⚠ uyarı | `collectKeys`, `hasDuplicateKeys`, `needsV2Migration` 0-caller (§4). ADR-038 doctrine'i “kanıt + temizle veya işaretle” diyor. |
| ADR-046 (Step Ordering Contract) | mutation sırası | ✅ uyumlu | `migrateConfig` sırası açıkça yorumda (l.246-247). `migrateConfigFull` benzer disiplin gösteriyor (l.404-414). |

**Net sonuç:** ADR-023 ihlali (modelToTier mapping) **kritik**; geri kalanlar uyumlu veya N/A.

---

## 7. Refactor Recommendations

1. **(P0) `modelToTier` ADR-023 fix** — `case 'o3': return 'premium_plus';` ekle + `case 'gemini-3.1-pro-preview': return 'premium_plus';` ekle. **Daha temizi:** `ModelRegistry.getById(model)?.tier ?? 'standard'` ile delegate et. Tek satır, ADR-023 ihlalini kapatır.

2. **(P1) `setNestedValue` array-override uyarısı** — `if (Array.isArray(current[part]))` durumunda en azından `structuredLog('warn', 'config_migration_array_overwrite', { path, originalLength })` çağır. Veri kaybını gözle görülebilir yap.

3. **(P1) Deep-clone migration entry point'leri** — `migrateConfigInMemory(structuredClone(existing))` veya `JSON.parse(JSON.stringify(existing))` ile çağıran state'i koru. Test isolation sızıntısını ortadan kaldırır.

4. **(P1) `migrateConfigFull` `removeDuplicateKeys` çağırmalı** — Symmetric API: ya `migrateConfigFull` ve `migrateConfig` aynı kanal setini koşar ya da JSDoc'ta fark açıklanır. Şu hâli kafa karıştırıcı.

5. **(P2) `collectKeys` + `hasDuplicateKeys` private yap** — Test-only ihtiyaç varsa `__test_only__` namespace altında `export const __testOnly = { collectKeys, hasDuplicateKeys }` deseni ile yarı-public konfeksiyon. Public API yüzeyini daralt.

6. **(P2) Legacy mode collision merge stratejisi** — Canonical zaten varsa: (a) legacy'yi sessizce sil, (b) hata fırlat, (c) merge et (key-by-key). Şu an (a) — `structuredLog('warn', 'legacy_mode_dropped', { oldName, newName })` eklemek minimum şeffaflık verir.

7. **(P2) Backup `keepCount` config-driven** — `.deckent/config.json` → `config_migration: { backup_keep: 3 }` field'i; `migrateConfig` bu değeri okusun. Şu an `3` hard-code.

8. **(P3) `getMissingFields` recursive nested** — Mevcut implementasyon yalnız `modes.<mode>.<sub>` 2 seviye. Genelleştir: `collectKeys` zaten leaf-path veriyor → `for (const path of collectKeys(defaults))` üzerinden tam recursive kontrol yap. `modes.X.Y.Z` kadar tüm seviyeleri kapsa.

9. **(P3) `pruneConfigBackups` Windows path normalization** — `join(dir, name)` (`node:path`) kullan, manuel `${dir}/${name}` yerine. Cross-platform tutarlılık.

10. **(P3) Async migration entry point** — ADR-005 deprecated; uzun vadede `migrateConfigAsync(configPath, options)` ile `fs/promises` üzerinden async eşdeğer. Mevcut sync API backward-compat olarak kalır.

---

## 8. Sprint 188 Follow-up Items

- **[BLOCKER]** `modelToTier` `o3 → premium_plus` fix (1-line) + `gemini-3.1-pro-preview` ekleme — ADR-023 ihlali kapatılmalı. Test: `tests/core/config-migration.test.ts`'e `modelToTier('o3')` assertion ekle.
- **[HIGH]** `migrateConfigFull` `removeDuplicateKeys` çağrısı ekle veya JSDoc'ta açıkça belirt. API tutarsızlığı.
- **[HIGH]** `setNestedValue` array-override için warn log ekle. Sessiz veri kaybını gözle görülebilir hale getir.
- **[MED]** Deep-clone migration entry'leri (`structuredClone`); test isolation sızıntısı.
- **[MED]** `collectKeys`/`hasDuplicateKeys`/`needsV2Migration` 0-caller bayrağı → ya kullanıcı tarafında çağrı ekle ya private yap (ADR-038 dead-code disposition).
- **[MED]** Sprint 089 `usage_thresholds` purge mantığı — bu blok artık 3+ sprint eski, mode config'i bu alanı içermiyor olmalı. Eğer telemetri yokluğu doğrulanırsa, kod bloğu silinebilir (`l.238-243`).
- **[LOW]** `pruneConfigBackups` `keepCount` config-driven yap.
- **[LOW]** `ConfigModelStrategy` / `ConfigProviders` `mode-presets.ts` ile birleştir — ortak tipi `src/core/types.ts`'e taşı, circular dependency'yi başka şekilde çöz.
- **[LOW]** `migrateConfig` corrupt-JSON path için kasıtlı backup-on-error davranışı.

---

## 9. Summary

`src/core/config-migration.ts` (636 LoC) Deckent'in **config şema evrim adapter'ı**: field-fill, legacy mode rename, v1→v2 tier migration, duplicate purge, backup rotation — 5 kanalı tek dosyada birleştiriyor. **Public yüzey:** 9 function + 3 interface + 3 re-exported helper. **Reverse-dep:** src/ tarafında 3 sıkı tüketici (`config.ts`, `mcp/tools/config.ts`, `cli/commands/config.ts`); test tarafında 6 dosya.

**Sağlık çıkarımı:** Modül *çalışıyor* ama **bir kritik ADR-023 ihlali** (`modelToTier` `o3 → 'standard'` mapping bug) ve **iki yüksek-seviyeli sessiz davranış riski** (`setNestedValue` array override + `migrateConfigFull` ↔ `migrateConfig` asimetrik `removeDuplicateKeys` çağrısı) taşıyor. Dead-code yüzeyi orta (3 export 0-caller). Step-ordering disiplini iyi (yorumlar açık), ADR-008/ADR-004/ADR-046 ile uyumlu.

**Öncelik sırası (Sprint 188 için):**
1. ADR-023 `modelToTier` fix (1-line, kritik) — silent cost/quality regression riskini kapatır.
2. `migrateConfigFull` ↔ `migrateConfig` simetri (`removeDuplicateKeys` çağrısı veya doc).
3. `setNestedValue` array override warn log.
4. 0-caller dead-tree (`collectKeys`, `hasDuplicateKeys`, `needsV2Migration`) konsolidasyonu (ADR-038).

**Risk profili:** 1 kritik, 2 yüksek, 4 orta, 4 düşük. Şu anki haliyle production-safe (mevcut testler regression'ı yakalıyor), ama tier mapping ihlali user-facing davranış değişikliği ürettiği için P0 olarak takip edilmeli.
