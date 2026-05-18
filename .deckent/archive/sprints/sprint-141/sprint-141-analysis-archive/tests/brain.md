# Test Category Analysis: brain
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 1

---

## 1. Test Dosya Envanteri

| Dosya | describe | it | Notlar |
|-------|----------|----|--------|
| decisions.test.ts | 1 | 12 | .brain/DECISIONS.md ADR format ve içerik doğrulama |
| **TOPLAM** | **1** | **12** | — |

Tek dosyalı, minimal bir kategori. `.brain/DECISIONS.md` dosyasının varlığını, ADR sıralamasını ve belirli ADR içeriklerini doğrular.

### Test içeriği özeti:

**`DECISIONS.md — ADR format and content` describe bloğu (12 it):**
1. `DECISIONS.md exists` — dosya varlık kontrolü
2. `contains at least 21 ADRs` — minimum 21 ADR match (`/^## ADR-\d+:/gm`)
3. `ADR headers are sequentially numbered from 001 to 021` — ADR-001 ile ADR-021 arasındaki tüm ADR'lerin varlığı
4. `each ADR has Context, Decision and Consequence sections` — tüm ADR bloklarında zorunlu field'lar
5. `ADR-014 covers .deck secret file system` — spesifik içerik doğrulama
6. `ADR-015 covers TaskRouter with 6-level routing` — spesifik içerik
7. `ADR-016 covers Connector module provider lifecycle` — spesifik içerik
8. `ADR-017 covers MCP-native provider adapters` — spesifik içerik
9. `ADR-018 covers multi-environment config generation` — spesifik içerik
10. `ADR-019 covers language-agnostic worker verify` — spesifik içerik
11. `ADR-020 covers rich sprint output with 7 sections` — spesifik içerik
12. `ADR-021 covers Kraken ASCII brand identity` — spesifik içerik

---

## 2. Mock Pattern Audit

**vi.mock / vi.spyOn kullanımı: 0**

Hiçbir mock yok. Test tamamen:
- `existsSync` — dosya varlık kontrolü
- `readFileSync` — dosya içerik okuma
- String matching ve regex ile içerik doğrulama

Mock gerektirmeyen saf dosya sistemi testi. Bu bağlam için doğru yaklaşım.

---

## 3. Coverage Mapping

**Özel kategori:** Kaynak kodu değil, `.brain/DECISIONS.md` doküman dosyasını test eder.

| Test | Hedef | Tür |
|------|-------|-----|
| decisions.test.ts | `.brain/DECISIONS.md` | Doküman bütünlüğü |

### Memory V2 perspektifinden coverage analizi:

`.brain/DECISIONS.md` mevcut durumda (2026-04-16):
- **Dosya boyutu:** 96.389 bytes, 1505 satır
- **ADR sayısı:** 40 ADR header (`## ADR-XXX:`)
- **Dikkat:** ADR-022 iki kez geçiyor (orijinal + güncelleme versiyonu)
- `.brain/exports/decisions.md` ayrıca mevcut (96.607 bytes, DB'den export)

**Kapsanmayan ADR'ler:** Test yalnızca ADR-001 ile ADR-021 arasındaki sıralı numaralamayı ve ADR-014 ile ADR-021 arasındaki spesifik içerikleri doğrular. ADR-022 ile ADR-039 arası testlerde kapsanmıyor — bu önemli bir gap.

---

## 4. Orphan Test Tespiti

**Orphan test yok** — tek test dosyası gerçek bir hedef dosyayı test ediyor.

**Ters boyut:** Kapsanmayan ADR'ler:
- ADR-022 (v1 + v2) — CLI/MCP parity testi yok
- ADR-023 ile ADR-039 — 17 ADR için içerik doğrulaması yok
- ADR-022 duplicasyon sorunu test tarafından tespit edilmiyor

**`src/core/memory-store.ts` ve diğer Memory V2 modülleri için brain test yok:** Brain kategorisi yalnızca 1 test dosyasına sahip ve bu dosya Memory V2 SQLite davranışını test etmiyor. Memory V2 logic testleri muhtemelen `tests/core/` kategorisinde.

---

## 5. Flaky Candidate İşaretleri

**Flaky risk: SIFIR**

| Kontrol | Sonuç |
|---------|-------|
| `setTimeout` kullanımı | YOK |
| `Date.now()` kullanımı | YOK |
| `Math.random()` kullanımı | YOK |
| Async işlem | YOK |
| Network bağımlılığı | YOK |

Tamamen senkron, deterministik. Her çalıştırmada aynı dosyayı okur, aynı sonuçları verir.

**Çevre bağımlılığı:** Test, `.brain/DECISIONS.md`'nin gerçekte var olmasına bağlı. CI ortamında bu dosya git-tracked olduğundan güvenli. `memory.db` ise gitignored — ancak bu test onu kullanmıyor.

---

## 6. Memory V2 Mock Uyumu

### Sonuç: V1 PARADİGMASINDA — KRİTİK UYUMSUZLUK

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` referansı | YOK |
| `parseDebtTable` referansı | YOK |
| `MemoryStore` referansı | YOK |
| `.brain/DECISIONS.md` doğrudan okuma | **VAR — TÜM TEST** |
| `memory.db` / SQLite referansı | YOK |

**Detay — V1 pattern analizi:**

```typescript
const DECISIONS_PATH = join(ROOT, '.brain', 'DECISIONS.md');
// ...
const content = readFileSync(DECISIONS_PATH, 'utf-8');
expect(content).toContain('ADR-014');
```

Bu kod Memory V1 paradigmasında yazılmış. Memory V2 mimarisinde:
- ADR'ler SQLite DB'de saklanır (`memory.db` — 5 tablo, FTS5)
- `.brain/DECISIONS.md` artık yalnızca bir **export** dosyasıdır
- Gerçek kaynak `.brain/exports/decisions.md` (DB'den üretilir)
- Brain modülleri `store.getByType('adr')` ile ADR'lere erişir

**Durum doğrulaması:**
- `.brain/DECISIONS.md`: 96.389 bytes, 1505 satır — **mevcut, git-tracked**
- `.brain/exports/decisions.md`: 96.607 bytes — **mevcut, DB export**
- İki dosya neredeyse aynı boyutta — kopyalama/senkronizasyon

Test `.brain/DECISIONS.md`'ye bağımlı. Bu dosya silinirse (V2'de önerilen: sadece exports kullanmak) test kırılır. Eğer DECKENT.md ve api-surface.md'deki Memory V2 migration tamamlanırsa bu test güncellenmeli.

**ADR-022 duplicasyon tespit edilmiyor:** `.brain/DECISIONS.md`'de iki `## ADR-022:` header mevcut. Test `grep /^## ADR-\d+:/gm` ile sayım yapıyor — bu duplicasyon count'u 41'e çıkarır (minimum 21 ≥ 41: PASS). Ancak duplicasyon bir data integrity sorunudur ve tespit edilmiyor.

---

## 7. Genel Değerlendirme

**Sağlık Skoru: 50/100 (D+)**

### Güçlü Yönler:
- ADR sequential numaralama (001-021) doğrulaması
- ADR mandatory field kontrolleri (Context, Decision, Consequence)
- Spesifik ADR içerik doğrulaması (ADR-014 ile ADR-021)
- Sıfır flaky risk

### Kritik Eksikler / Bulgular:

1. **KRİTİK (P0): Memory V2 Uyumsuzluğu** — Tüm test V1 paradigmasında yazılmış, `.brain/DECISIONS.md`'yi doğrudan okuyor. V2 mimarisinde bu test MemoryStore API kullanmalı:
   ```typescript
   // V2 yaklaşımı (önerilen)
   const store = new MemoryStore(dbPath);
   const adrs = store.getByType('adr');
   expect(adrs.length).toBeGreaterThanOrEqual(39); // 39 unique ADR
   ```

2. **KRİTİK (P0): ADR-022 Duplicasyon Tespit Edilmiyor** — `.brain/DECISIONS.md` iki `## ADR-022:` header içeriyor (orijinal Sprint 067 versiyonu + güncellenmiş Sprint 085 versiyonu). DB'de ise `adr-022` (superseded) ve `adr-022-v2` (accepted) olarak iki ayrı kayıt var. Bu tutarsızlık test tarafından görülmüyor.

3. **P1: ADR-022 ile ADR-039 arası test yok** — 17 ADR'nin içerik doğrulaması eksik. Özellikle ADR-036 (ADR Governance) ve ADR-037 (RBAC) gibi kritik ADR'ler test edilmiyor.

4. **P1: Kategori sınırları dar** — `tests/brain/` kategorisinde sadece 1 test dosyası var. Brain'in asıl sorumluluğu (sprint lifecycle, MemoryStore, planner, result-evaluator) bu kategoride test edilmiyor; bu testler `tests/orchestra/` ve `tests/core/` altında.

5. **P2: Min ADR count stale** — Test "en az 21 ADR" doğruluyor. Proje şu an 39 unique ADR'ye sahip (ADR-001 ile ADR-039, ADR-022 v2 dahil). Minimum eşik güncellenmeli (örn. 39+).

6. **P3: `DECISIONS.md` vs `exports/decisions.md` farkı kontrol edilmiyor** — İki dosyanın tutarlı olup olmadığı test edilmiyor. DB export ile git-tracked dosya arasında drift oluşabilir.

### Sprint 142 Borç Adayları:
- `decisions.test.ts` → MemoryStore API ile V2 uyumlu yeniden yazım
- ADR-022 duplicasyon fix (`.brain/DECISIONS.md`)
- ADR-022 ile ADR-039 için içerik testleri eklenmesi
- Minimum ADR count → 39+ olarak güncelleme
