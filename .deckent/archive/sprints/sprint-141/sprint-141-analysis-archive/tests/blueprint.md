# Test Category Analysis: blueprint
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 4

---

## 1. Test Dosya Envanteri

| Dosya | describe | it | Test Hedefi |
|-------|----------|----|------------|
| files.test.ts | 1 | 5 | AGENTS.md, .contracts/api-surface.md, IDENTITY.md varlık ve içerik |
| pull-request-template.test.ts | 1 | 9 | .github/pull_request_template.md varlık ve içerik |
| security-md.test.ts | 1 | 6 | SECURITY.md (root + docs/reference) |
| sprint-history.test.ts | 1 | 8 | DECKENT-MASTER-BLUEPRINT.md sprint geçmişi ve sayılar |
| **TOPLAM** | **4** | **28** | — |

Blueprint kategorisi "project skeleton" testleri — kaynak kodu değil, proje konfigürasyon ve dokümantasyon dosyalarının varlığını ve içerik bütünlüğünü doğrular.

### Dosya detayları:

**files.test.ts (5 it):**
- AGENTS.md varlığı ve doluluk
- .contracts/api-surface.md varlığı ve doluluk
- .deckent/workspace/IDENTITY.md varlığı (skip in CI — gitignored)
- AGENTS.md içinde `## Architecture` ve `orchestra/` referansı

**pull-request-template.test.ts (9 it):**
- .github/pull_request_template.md varlığı
- Non-empty içerik
- Summary, Changes, Test Plan, Checklist, Sprint ID, ADR Reference, Automated Checks, Worker Result, DIRECTIVES sections

**security-md.test.ts (6 it):**
- SECURITY.md (root) varlığı ve doluluk
- docs/reference/security.md varlığı
- Her ikisinin doluluk doğrulaması
- Root SECURITY.md'nin Supported Versions ve Reporting içermesi
- docs/reference/security.md'nin Overview ve Authentication içermesi

**sprint-history.test.ts (8 it):**
- DECKENT-MASTER-BLUEPRINT.md üzerinden MCP tool/resource sayıları (21 Tools, 8 Resources)
- Sprint 046 tablosunda 10K+ test referansı
- Architecture diagram bölümü
- Çeşitli section başlıkları ve içerik bütünlüğü

---

## 2. Mock Pattern Audit

**vi.mock / vi.spyOn kullanımı: 0**

Hiçbir mock yok. Tüm testler:
- `readFileSync` ile gerçek dosya sistemi okuma
- `existsSync` ile varlık kontrolü
- `beforeAll` ile tek seferlik dosya yükleme (sprint-history.test.ts)

Mock gerektirmeyen "file fixture" test pattern'i. Bu kategori için doğru yaklaşım.

---

## 3. Coverage Mapping

**Özel kategori:** Kaynak kod değil, proje iskelet dosyalarını test eder.

| Test Dosyası | Hedef Dosya(lar) | Durum |
|-------------|-----------------|-------|
| files.test.ts | AGENTS.md, .contracts/api-surface.md, .deckent/workspace/IDENTITY.md | MATCH |
| pull-request-template.test.ts | .github/pull_request_template.md | MATCH |
| security-md.test.ts | SECURITY.md, docs/reference/security.md | MATCH |
| sprint-history.test.ts | DECKENT-MASTER-BLUEPRINT.md | MATCH |

### "Kaynak kod" coverage perspektifinden:

Bu testlerin karşılık geldiği herhangi bir `src/` dosyası yok. Blueprint testleri şu kategoride değerlendirilmeli:
- **Konfigürasyon compliance testleri** — proje standartlarının korunması
- **Documentation drift protection** — kritik dokümanların yanlışlıkla silinmesini önler
- **CI sanity checks** — her push'ta temel proje yapısı kontrol edilir

---

## 4. Orphan Test Tespiti

**Kategori perspektifinden orphan yok** — tüm test hedefleri gerçek dosyalara karşılık geliyor.

**Ters orphan (test var, kaynak dosya yok):**
- Tüm hedef dosyalar (`AGENTS.md`, `SECURITY.md`, `.github/pull_request_template.md`, `DECKENT-MASTER-BLUEPRINT.md`, `.contracts/api-surface.md`) mevcut olmalı; aksi halde testler fail olur.
- `files.test.ts` içinde `.deckent/workspace/IDENTITY.md` için: `if (!existsSync(path)) return;` — CI'da skip edilir, local'de çalışır. Bu CI/local asimetrisi küçük bir maintainability risk taşıyor.

**Tespit edilen gap:** Sprint history testi 21 Tools sayısını doğruluyor (`expect(content).toContain('21 Tools')`). Ancak proje şu an 22 MCP tool'a sahip (DECKENT.md: "22 tools"). Bu **stale assertion** — sprint-history.test.ts güncellenmesi gerekiyor.

---

## 5. Flaky Candidate İşaretleri

**Flaky risk: ÇOK DÜŞÜK**

| Kontrol | Sonuç |
|---------|-------|
| `setTimeout` kullanımı | YOK |
| `Date.now()` kullanımı | YOK |
| `Math.random()` kullanımı | YOK |
| Async işlem | YOK |
| Network bağımlılığı | YOK |
| `beforeAll` kullanımı | `sprint-history.test.ts` — tek seferlik okuma, güvenli |

Tüm testler senkron, deterministik, yalnızca yerel dosya sistemi okuma.

**Tek gerçek risk:** Blueprint dosyaları değiştirilirse testler fail olur. Bu kasıtlı bir özellik — "değişiklik dedektörü" görevi görür.

---

## 6. Memory V2 Mock Uyumu

### Sonuç: NÖTR — İlgili Değil

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` referansı | YOK |
| `parseDebtTable` referansı | YOK |
| `MemoryStore` referansı | YOK |
| `memory.db` referansı | YOK |
| `.brain/` dosyalarına erişim | YOK |

Blueprint testleri tamamen Memory V2 kapsamı dışında. `.brain/` dizinine hiç dokunmuyor.

**İlgili gözlem:** `files.test.ts` şu an `.contracts/api-surface.md` varlığını test ediyor. Bu dosyanın Memory V2 DB schema bölümünü içerip içermediğini doğrulamak faydalı olabilir (Sprint 142 öneri).

---

## 7. Genel Değerlendirme

**Sağlık Skoru: 70/100 (C+)**

### Güçlü Yönler:
- Saf, deterministik testler — sıfır flaky risk
- Mock-free yaklaşım bu bağlam için doğru
- PR template, security policy, agent tanımları gibi kritik dosyaların drift koruması
- `beforeAll` kullanımı `sprint-history.test.ts`'de verimli

### Eksikler / Öneriler:

1. **P1: Stale assertion — 21 Tools (should be 22)** — `sprint-history.test.ts` `'21 Tools'` ve `'21 Tools + 8 Resources'` içeriğini doğruluyor. Ancak proje şu an 22 MCP tool'a sahip (Sprint 139+ sonrası `deckent_memory_query` eklendi). `DECKENT-MASTER-BLUEPRINT.md` veya test güncellenmeli. Bu test şu an **fail olabilir**.

2. **P2: CI/local asimetrisi** — `files.test.ts`'de `.deckent/workspace/IDENTITY.md` kontrolü CI'da skip ediliyor. Bu dosyanın test edilmemesi CI'da silinmesini farkedemez. Alternatif: CI'da bu dosyayı bir fixture olarak sağlamak veya test'i koşulsuz çalıştırmak.

3. **P2: Content depth eksik** — `files.test.ts` AGENTS.md varlığını ve iki satırını kontrol ediyor. Memory V2 özelliklerinin AGENTS.md'de dokümante edilip edilmediğini, `deckent recall` komutunun listelenip listelenmediğini kontrol etmiyor.

4. **P3: api-surface.md Memory V2 doğrulaması yok** — `files.test.ts` `.contracts/api-surface.md`'yi sadece "var mı, dolu mu?" diye kontrol ediyor. İçinde `Memory V2 DB Schema` bölümünün varlığını doğrulamak daha anlamlı olur.

5. **Kategori genişleme fırsatı:** `CLAUDE.md`, `DECKENT.md`, `.brain/exports/summary.md` için de benzer blueprint testleri eklenebilir.

### Kritik Bulgu:
`sprint-history.test.ts` içindeki MCP tool sayısı (21) stale — güncel sayı 22. Sprint 140'ta bu test büyük olasılıkla fail durumda. Acil güncelleme gerekiyor.
