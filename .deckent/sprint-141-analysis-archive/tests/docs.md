# Test Category Analysis: docs
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 25

## 1. Test Dosya Envanteri

### Dosya Listesi (tam)
```
tests/docs/CHANGELOG.test.ts
tests/docs/agent-guide.test.ts
tests/docs/agents.test.ts
tests/docs/api.test.ts
tests/docs/cli-reference.test.ts
tests/docs/config-reference.test.ts
tests/docs/contributing.test.ts
tests/docs/docs-structure.test.ts
tests/docs/github-pages-deploy.test.ts
tests/docs/guide-getting-started.test.ts
tests/docs/issue-templates.test.ts
tests/docs/jsdoc.test.ts
tests/docs/landing-page-content.test.ts
tests/docs/license.test.ts
tests/docs/marketplace-guide.test.ts
tests/docs/pr-template.test.ts
tests/docs/quickstart.test.ts
tests/docs/readme.test.ts
tests/docs/release-checklist.test.ts
tests/docs/release-notes-beta.test.ts
tests/docs/release-prep.test.ts
tests/docs/security.test.ts
tests/docs/skills.test.ts
tests/docs/validate-publish.test.ts
tests/docs/vitepress.test.ts
```

### Describe / It Blok Sayıları
- **describe:** 79
- **it:** 346
- **test:** 0

### Her Dosyanın Kısa Açıklaması
| Dosya | Test Konusu |
|-------|------------|
| `CHANGELOG.test.ts` | CHANGELOG.md format ve içerik kontrolü |
| `agent-guide.test.ts` | docs/ agent guide varlık ve içerik |
| `agents.test.ts` | AGENTS.md içerik doğrulaması |
| `api.test.ts` | docs/reference/api.md — endpoint ve resource dokümantasyonu |
| `cli-reference.test.ts` | CLI komut referans dokümantasyonu |
| `config-reference.test.ts` | Config parametreleri dokümantasyonu |
| `contributing.test.ts` | CONTRIBUTING.md varlık ve içerik |
| `docs-structure.test.ts` | docs/ dizin yapısı (6+ subdirectory) |
| `github-pages-deploy.test.ts` | GitHub Pages deploy konfigürasyonu |
| `guide-getting-started.test.ts` | Getting started guide içeriği |
| `issue-templates.test.ts` | .github/ISSUE_TEMPLATE varlığı |
| `jsdoc.test.ts` | 8 kritik src dosyasında JSDoc varlığı |
| `landing-page-content.test.ts` | Landing page içerik string kontrolü |
| `license.test.ts` | LICENSE dosya kontrolü |
| `marketplace-guide.test.ts` | Marketplace guide dokümantasyonu |
| `pr-template.test.ts` | .github/PULL_REQUEST_TEMPLATE.md |
| `quickstart.test.ts` | Quickstart guide içeriği |
| `readme.test.ts` | README.md başlık, badge, bölüm kontrolü |
| `release-checklist.test.ts` | Release checklist varlığı |
| `release-notes-beta.test.ts` | Beta release notes |
| `release-prep.test.ts` | Release prep script |
| `security.test.ts` | SECURITY.md içerik |
| `skills.test.ts` | Skills dokümantasyonu |
| `validate-publish.test.ts` | scripts/validate-publish.js unit testleri |
| `vitepress.test.ts` | VitePress konfigürasyon kontrolü |

---

## 2. Mock Pattern Audit

### vi.mock / vi.spyOn Kullanımı
**Hiç `vi.mock` veya `vi.spyOn` kullanımı yok.**

`docs` kategorisi tamamen read-only static file testi — gerçek dosyaları `readFileSync` ile okuyor ve içerik doğrulaması yapıyor. Mock gerektirmeyen deterministik testler.

**İstisna:** `validate-publish.test.ts` — `scripts/validate-publish.js`'den fonksiyonları import ediyor ve unit test tarzında çağırıyor (saf fonksiyon testleri, dosya sistemi erişimi yok).

### Test Yaklaşımı Dağılımı
- **Static file content tests:** 22 dosya (readFileSync + string assertions)
- **Directory/file existence tests:** 4 dosya (existsSync + readdirSync)
- **Pure logic unit tests:** 1 dosya (validate-publish.test.ts)
- **Source code analysis tests:** 1 dosya (jsdoc.test.ts — readFileSync src dosyaları)

---

## 3. Coverage Mapping

### docs/ Kategorileri vs Test Dosyaları

| docs/ Dizin/Dosya | Test Dosyası | Durum |
|------------------|-------------|-------|
| `README.md` | `readme.test.ts` | COVERED |
| `CHANGELOG.md` | `CHANGELOG.test.ts` | COVERED |
| `docs/guide/` | `guide-getting-started.test.ts`, `quickstart.test.ts` | COVERED (partial) |
| `docs/reference/api.md` | `api.test.ts` | COVERED |
| `docs/reference/config-reference.md` | `config-reference.test.ts` | COVERED |
| `docs/reference/cli-reference.md` | `cli-reference.test.ts` | COVERED |
| `docs/architecture/` | — | **MISSING** |
| `docs/audits/` | — | **MISSING** |
| `docs/development/` | — | **MISSING** |
| `docs/vision/` | — | **MISSING** |
| `docs/superpowers/` | — | **MISSING** |
| `docs/design/` | — | **MISSING** |
| `AGENTS.md` | `agents.test.ts` | COVERED |
| `CONTRIBUTING.md` | `contributing.test.ts` | COVERED |
| `SECURITY.md` | `security.test.ts` | COVERED |
| `LICENSE` | `license.test.ts` | COVERED |
| `.github/ISSUE_TEMPLATE/` | `issue-templates.test.ts` | COVERED |
| `.github/PULL_REQUEST_TEMPLATE.md` | `pr-template.test.ts` | COVERED |
| `docs/agent-guide.md` veya benzeri | `agent-guide.test.ts` | COVERED |
| `docs/skills.md` | `skills.test.ts` | COVERED |
| Marketplace guide | `marketplace-guide.test.ts` | COVERED |
| `scripts/validate-publish.js` | `validate-publish.test.ts` | COVERED |
| VitePress config | `vitepress.test.ts` | COVERED |
| Landing page | `landing-page-content.test.ts` | COVERED |
| Release docs | `release-checklist.test.ts`, `release-notes-beta.test.ts`, `release-prep.test.ts` | COVERED |
| GitHub Pages | `github-pages-deploy.test.ts` | COVERED |

### Coverage Özeti
Erişilebilir docs kategorileri büyük ölçüde kapsanmış. Eksikler:
- `docs/architecture/` — ADR içeriği, mimari kararlar
- `docs/audits/` — sprint audit raporları
- `docs/superpowers/` — spec dosyaları
- `docs/vision/` — product vision

---

## 4. Orphan Test Tespiti

### Olası Orphan Durumlar

| Test Dosyası | Risk | Açıklama |
|-------------|------|---------|
| `landing-page-content.test.ts` | DÜŞÜK | Landing page dosyası var mı? `docs/index.md` veya `README.md` kapsıyor olabilir |
| `release-notes-beta.test.ts` | ORTA | Beta release notes dosyası hala aktif mi? `CHANGELOG.md`'ye geçildi mi? |
| `release-checklist.test.ts` | DÜŞÜK | `docs/release/` dizininde mevcut — normal |
| `agent-guide.test.ts` | DÜŞÜK | `docs/agent-guide.md` varlığına bağımlı — dosya var mı? |

**Gerçek Orphan Riski Düşük** — çoğu dosya gerçek belgelere karşılık geliyor.

---

## 5. Flaky Candidate İşaretleri

**Hiç gerçek flaky candidate yok.**

- `setTimeout` kullanımı: 0
- `Date.now()` kullanımı: 0
- `Math.random()` kullanımı: 0
- Ağ bağlantısı: 0
- Gerçek process çalıştırma: 0

Tüm testler deterministik. `validate-publish.test.ts` saf fonksiyon testleri — tamamen stabil.

**Brittle Risk:** Birçok test string literal içerik kontrolü yapıyor (örn. README'de `'Your AI development team, orchestrated.'`). Dokümantasyon güncellemelerinde bu testler kırılabilir — bu flaky değil ama bakım yükü oluşturuyor.

---

## 6. Memory V2 Mock Uyumu

### countBrainLines / parseDebtTable
**Hiç `countBrainLines`, `parseDebtTable`, `generateDebtTable` kullanımı yok.**

### MemoryStore Kullanımı
**Hiç `MemoryStore` kullanımı yok.**

### Memory V2 Dokümantasyon Test Kapsamı — KRİTİK EKSİKLİK

Memory V2 (Sprint 139 ana özelliği) ile eklenen CLI komutlarının ve MCP tool'ların dokümantasyonu test edilmiyor:

| Memory V2 Alan | Belgelenmesi Beklenen Yer | Test Var mı? |
|---------------|--------------------------|-------------|
| `deckent recall` CLI komutu | CLI reference | **HAYIR** |
| `deckent remember` CLI komutu | CLI reference | **HAYIR** |
| `deckent memory rebuild/export/stats` | CLI reference | **HAYIR** |
| `deckent_memory_query` MCP tool | docs/reference/api.md | Kısmen — `api.test.ts` `GET /api/memory` kontrolü var |
| Memory V2 config section | config-reference | **HAYIR** (`memory.backend`, `memory.search`, `memory.decay_after_sprints` kontrolü yok) |
| `.brain/memory.db` mimarisi | architecture docs | **HAYIR** |
| `better-sqlite3` dependency | README badges | **HAYIR** |

**`config-reference.test.ts` analizi:** Memory V2 config alanları (`memory.backend`, `memory.search`, `memory.decay_after_sprints`) test edilmiyor. Sadece eski `brain_model`, `max_workers` gibi alanlar kontrol ediliyor.

**`api.test.ts`** içinde:
- `expect(content).toContain('GET /api/memory')` — var ✓
- `expect(content).toContain('deckent://memory')` — var ✓
- `deckent_memory_query` MCP tool dokümantasyonu — **kontrol edilmiyor**

### jsdoc.test.ts ve Memory V2
`jsdoc.test.ts` şu 8 dosyada JSDoc varlığını kontrol ediyor:
```
src/core/utils.ts
src/core/config.ts
src/orchestra/model-selector.ts
src/orchestra/task-builder.ts
src/orchestra/debt-manager.ts
src/orchestra/sprint-reporter.ts
src/orchestra/sprint-controller.ts
src/orchestra/result-evaluator.ts
```

**Eksik:** `src/core/memory-store.ts`, `src/core/memory-query.ts`, `src/core/memory-normalize.ts` Memory V2 modülleri JSDoc kontrolüne dahil edilmemiş.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 73/100 (**B-**)

### Güçlü Yönler
- 25 dosya, 346 `it()` — docs kategorisi için iyi kapsam
- `readme.test.ts` — badge, section, tagline kontrolü sistematik
- `validate-publish.test.ts` — publish script unit testleri, CI öncesi güvenlik ağı
- `jsdoc.test.ts` — kaynak kod JSDoc kontrolü yaratıcı yaklaşım
- `docs-structure.test.ts` — dizin yapısı kontrolü
- `config-reference.test.ts` — config parametreleri dokümantasyonu
- Hiç mock yok, hiç flaky risk yok

### Zayıf Yönler / Sprint 142+ Öneriler

1. **P0 — Memory V2 CLI Docs Test:** `cli-reference.test.ts`'e `recall`, `remember`, `memory rebuild/export/stats` komutlarının dokümante edildiğini doğrulayan `it()` blokları eklenmeli.

2. **P1 — Memory V2 Config Docs Test:** `config-reference.test.ts`'e `memory.backend`, `memory.search`, `memory.decay_after_sprints` kontrolü eklenmeli.

3. **P1 — jsdoc.test.ts Memory V2 Modülleri:** `memory-store.ts`, `memory-query.ts`, `memory-normalize.ts` JSDoc kontrolüne dahil edilmeli.

4. **P1 — docs/architecture/ Testleri:** ADR dokümantasyonu (`docs/architecture/` altında) test edilmiyor. 40 ADR'in doğru formatta listelendiğini doğrulayan basit bir test eklenebilir.

5. **P2 — docs/audits/ Güncellik Kontrolü:** Sprint audit raporlarının var olduğunu ve güncel sprint sayısını yansıttığını kontrol eden test.

6. **P2 — api.test.ts deckent_memory_query:** MCP tool 22 araçtan biri — `deckent_memory_query`'nin API docs'ta tanımlı olduğunu doğrulayan it() eklenmeli.

7. **P3 — Brittle String Tests:** Bazı testler tam string literal bekliyor (README tagline vb.). Refactoring sırasında kırılabilir — daha esnek regex/substring pattern kullanmak daha iyi.
