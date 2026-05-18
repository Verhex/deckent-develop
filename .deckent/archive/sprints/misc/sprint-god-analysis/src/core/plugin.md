# Analysis: src/core/plugin.ts
**Task ID:** 142-006 | **Model:** opus | **LoC:** 489 | **Effort:** max

## 1. Amaç (detaylı)
Deckent plugin sistemi çekirdek modülü. Plugin manifest doğrulama, yükleme, listeleme, etkinleştirme/devre dışı bırakma, kurulum (npm/git/local) ve kaldırma işlemlerini sağlar. `.deckent/plugins/` dizininde plugin'leri yönetir. PluginManifest V2 formatını destekler (triggers, permissions, hooks, model, dependencies, SHA-256 signature). npm install'da `--ignore-scripts` ile güvenlik sağlar.

## 2. Public API
- `PluginSignature` interface — SHA-256 imza yapısı
- `PluginManifest` interface — Plugin manifest şeması (V2)
- `Plugin` interface — manifest + dir
- `PluginError` class — Genel plugin hatası
- `PluginSecurityError` class — Güvenlik ihlali hatası
- `validateManifest(raw, pluginDir): PluginManifest` — Kapsamlı manifest doğrulama. JSDoc yok ⚠️
- `loadPlugin(pluginDir): Plugin` — Tekil plugin yükleme. JSDoc ✅
- `listPlugins(pluginsDir): Plugin[]` — Dizindeki etkin plugin'leri listele. JSDoc ✅
- `scanPlugins(projectRoot): Plugin[]` — Proje plugin'lerini tara. JSDoc ✅
- `enablePlugin(pluginName, pluginsDir): boolean` — Plugin etkinleştir. JSDoc ✅
- `disablePlugin(pluginName, pluginsDir): boolean` — Plugin devre dışı. JSDoc ✅
- `isGitUrl(source): boolean` — @internal JSDoc ✅
- `isLocalPath(source): boolean` — @internal JSDoc ✅
- `detectSourceType(source): 'npm' | 'git' | 'local'` — Kaynak türü tespiti. JSDoc ✅
- `installPlugin(source, pluginsDir): Promise<Plugin>` — Plugin kurulumu. JSDoc ✅
- `removePlugin(pluginName, pluginsDir): boolean` — Plugin kaldırma. JSDoc ✅
- `createPlugin(name, pluginsDir): Promise<Plugin>` — Yeni plugin scaffold. JSDoc ✅

## 3. İç Bağımlılıklar
- `./types.js` → `ModelType`, `ALL_MODELS`
- `./utils.js` → `readJsonSafe`
- **Döngüsel bağımlılık riski:** Yok.

## 4. Dış Bağımlılıklar
- `node:fs` — sync + async (fs, fsp)
- `node:path`
- `node:child_process` → spawnSync (npm install, git clone)
- ADR-010: ✅ — Yalnızca Node.js built-in

## 5. Complexity
- Fonksiyon sayısı: 14 public + 3 private = 17
- Max cyclomatic complexity: ~12 (`validateManifest` — 10+ field validation branches)
- En karmaşık fonksiyon: `validateManifest` (satır 55-148) — 93 satır, çok sayıda validation branch

## 6. Type Safety
- `any` sayısı: **0** ✅
- `@ts-ignore`: **0** ✅
- `as Record<string, unknown>` cast: Birden fazla (satır 60, 76, 87, 90, 113, vb.) — `validateManifest` içinde unknown raw → typed field extraction. Her cast'ten önce typeof check yapılıyor. **Güvenli ancak verbose.**
- `as string`, `as string[]`, `as ModelType`: Post-validation cast'ler — güvenli.
- **Not:** `obj['enabled'] === false ? false : true` (satır 128) → `obj['enabled'] !== false` daha idiomatic olabilir. Minor.

## 7. ADR Compliance
- ADR-006 (spawnSync): ✅ — npm install 60s timeout, git clone timeout yok ⚠️ (P2)
- ADR-008: ✅
- ADR-010: ✅
- ADR-033: Plugin sistemi product vision'a uygun — extensibility
- ADR-034: ✅ — pluginsDir project-scoped
- Memory V2: N/A

## 8. Test Coverage
- Test dosyaları: **8 adet** — Mükemmel kapsam
  - `tests/core/plugin.test.ts`
  - `tests/core/plugin-manifest.test.ts`
  - `tests/core/plugin-system.test.ts`
  - `tests/core/plugin-install.test.ts`
  - `tests/core/plugin-remove.test.ts`
  - `tests/core/plugin-toggle.test.ts`
  - `tests/core/plugin-hooks.test.ts`
  - `tests/core/plugin-security.test.ts`
- Mock kalitesi: fs, child_process mock'lanması beklenir

## 9. TODO/FIXME/HACK Inventory
- **Hiç yok.** ✅

## 10. Dead Code
- `isGitUrl`, `isLocalPath`: @internal olarak işaretli, `detectSourceType` tarafından kullanılıyor. Export edilmiş — test erişimi için kabul edilebilir.
- Tüm public API'ler kullanımda.

## 11. Security
- **P1 — git clone timeout yok (satır 368):** `installFromGit` spawnSync timeout parametresi yok. Malicious git URL yavaş clone ile process'i bloke edebilir. `installFromNpm` 60s timeout var ama git clone'da yok.
- **P2 — npm --ignore-scripts:** ✅ — Doğru güvenlik önlemi. Malicious postinstall script'ler engelleniyor.
- **P2 — Path traversal:** `installFromLocal` `path.resolve(source)` kullanıyor ama hedef dizin dışına okuma yapabilir. Ancak internal API, kullanıcı CLI'dan çağırıyor.
- **P2 — TOCTOU in installPlugin:** `fs.existsSync(destDir)` check + `fsp.cp/rename` arasında race condition. İki eşzamanlı install aynı plugin adıyla çakışabilir.
- **P3 — system plugin koruması:** `removePlugin` sadece `raw['system'] === true` kontrolü yapıyor — manifest corrupt ise korumasız.
- `validateManifest`: Kapsamlı input validation ✅ — tüm alanlar tip ve varlık kontrolünden geçiyor.

## 12. Memory V2 Uyumu
- N/A. Plugin sistemi hafıza ile doğrudan etkileşmiyor. ✅

## 13. i18n
- Hata mesajları İngilizce: "Invalid manifest in ...", "No manifest.json found", vb.
- Plugin scaffold template (satır 453-485): İngilizce şablon — kabul edilebilir (developer-facing).

## 14. Dokümantasyon Tutarlılığı
- JSDoc: Çoğu fonksiyonda mevcut. `validateManifest` eksik ⚠️.
- Manifest V2 alanları (triggers, permissions, hooks, signature) JSDoc'suz ama interface alanları self-documenting.

## 15. Performance
- Sync I/O: existsSync ×5, readFileSync (readJsonSafe üzerinden) ×1, writeFileSync ×2, readdirSync ×1, rmSync ×1
- spawnSync: npm install (60s), git clone (timeout yok!), total 2 subprocess call
- Hot path: Hayır — plugin yönetimi nadir çağrılır.

## 16. Öneriler
- **P1 — git clone timeout:** `installFromGit` spawnSync'e `timeout: 60_000` eklemeli. Malicious/slow repo sonsuz blokajı engellemeli.
- **P2 — validateManifest JSDoc:** 93 satırlık kritik fonksiyon JSDoc'suz. En azından parametre ve return type açıklaması eklenmeli.
- **P2 — hooks validation genişletme:** `validateManifest` sadece `beforeSprint`/`afterSprint` hook'larını doğruluyor ama `beforeTask`/`afterTask` da PluginHook'ta tanımlı. Satır 91: `['beforeSprint', 'afterSprint']` → `['beforeSprint', 'afterSprint', 'beforeTask', 'afterTask']` olmalı.
- **P3 — createPlugin model default:** Scaffold'da `model: opus` hardcoded (satır 459). Configurable olabilir.

## Verdict: ANALYZED
