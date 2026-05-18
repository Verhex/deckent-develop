# Test Category Analysis: audits
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 1

---

## 1. Test Dosya Envanteri

| Dosya | describe | it | Notlar |
|-------|----------|----|--------|
| dead-code-decisions.test.ts | 3 | 18 | Sprint 139 dead code audit dokümanı + ADR-038 doğrulama |
| **TOPLAM** | **3** | **18** | — |

Tek dosyalı, çok spesifik bir kategori. Sprint 139 dead code audit sürecinin çıktılarını (doküman varlığı ve içerik bütünlüğünü) doğrular.

---

## 2. Mock Pattern Audit

**vi.mock / vi.spyOn kullanımı: 0**

Hiçbir mock yok. Test dosyası tamamen dosya sistemi okuma (`readFileSync`, `existsSync`) tabanlı.

### Strateji:
- `node:fs` üzerinden gerçek dosya sistemi okuma
- `docs/audits/sprint-139/dead-code-decisions.md` ve `.brain/DECISIONS.md` gerçek içerikleri doğrulama
- Saf "documentation as code" yaklaşımı — doküman içeriğinin beklenen değerleri karşıladığını kontrol eder

Bu tür "snapshot-benzeri" testler mock gerektirmez, ancak doküman değişikliklerine karşı kırılgandır (brittle by design).

---

## 3. Coverage Mapping

**Özel kategori:** Bu testler kaynak kodu değil, doküman dosyalarını test eder.

| Test | Hedef | Tür |
|------|-------|-----|
| `dead-code-decisions.md schema` | `docs/audits/sprint-139/dead-code-decisions.md` | Doküman bütünlüğü |
| `ADR-038 in DECISIONS.md` | `.brain/DECISIONS.md` | ADR kayıt doğrulama |
| `decision rationale completeness` | `docs/audits/sprint-139/dead-code-decisions.md` | İçerik derinlik doğrulama |

### Test edilen spesifik içerikler:

**`dead-code-decisions.md schema` describe bloğu (6 it):**
- Dokümanın varlığı
- Gerekli section başlıkları (Decision Categories, Summary Matrix, Detailed Decisions, Execute Checklist, Risk Summary)
- 11 modülün tamamının kapsanması (6 dead + 4 dormant + 1 false positive)
- Her kararın Decision Rationale, Risk Assessment, Rollback Plan içermesi
- 3 Remove + 3 Defer + 4 Deprecate + 1 False Positive dağılımı
- Remove modüllerin doğru atanması

**`ADR-038 in DECISIONS.md` describe bloğu (6 it):**
- ADR-038'in varlığı
- `accepted` status
- MADR v3 zorunlu alanları (Status, Date, Context, Decision, Consequences +/-)
- `dead-code-decisions.md` referansı
- 4 disposition kademesinin (Remove/Defer/Deprecate/False Positive) tanımı
- `**Alternatives Considered:**` alanı

**`decision rationale completeness` describe bloğu (6 it):**
- Remove kararlarının LoC sayısı içermesi
- Defer kararlarının future sprint referansı
- False positive açıklaması
- Execute checklist'in tüm Remove hedeflerini içermesi
- ADR-028 referansı (dormant modüller için)

---

## 4. Orphan Test Tespiti

**Bu kategori için "orphan" kavramı farklı işler:** Test, source code'u değil dokümanları test eder.

**Potansiyel orphan durumlar:**
- `dead-code-decisions.test.ts` → `docs/audits/sprint-139/dead-code-decisions.md` ve `.brain/DECISIONS.md` dosyaları silinirse veya formatları değişirse bu testler anında kırılır.
- Sprint 139'a özgü bir test; ileriki sprintlerde (140+) bu doküman güncellenirse testler fail olabilir.
- `learning-decay.ts`, `learning-migration.ts` gibi modüllerin gerçekten kaldırılıp kaldırılmadığını doğrulamıyor — sadece doküman içeriğini doğruluyor.

**Öneri:** Bu tür "ADR doküman bütünlüğü" testleri `tests/brain/` veya `tests/docs/` kategorisine daha uygun görünüyor.

---

## 5. Flaky Candidate İşaretleri

**Flaky risk: YOK**

| Kontrol | Sonuç |
|---------|-------|
| `setTimeout` kullanımı | YOK |
| `Date.now()` kullanımı | YOK |
| `Math.random()` kullanımı | YOK |
| Network bağımlılığı | YOK |
| Async işlem | YOK |

Testler tamamen senkron ve deterministik. Sadece dosya sistemi okuma — her çalıştırmada aynı sonucu verir.

**Tek risk:** Test edilen doküman içerikleri (`dead-code-decisions.md`, `DECISIONS.md`) harici değişikliklerle bozulabilir. Bu "environmental brittleness" olarak sınıflandırılır, flakiness değil.

---

## 6. Memory V2 Mock Uyumu

### Sonuç: KISMI UYUMSUZLUK (V1 pattern devam ediyor)

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` mock | YOK |
| `parseDebtTable` mock | YOK |
| `MemoryStore` mock | YOK |
| `.brain/DECISIONS.md` doğrudan okuma | **VAR** |

**Detay:** Test, `.brain/DECISIONS.md` dosyasını doğrudan `readFileSync` ile okuyor:
```typescript
const DECISIONS_PATH = join(ROOT, '.brain', 'DECISIONS.md');
const content = readFileSync(decisionsPath, 'utf-8');
```

Memory V2 mimarisinde ADR'ler SQLite DB'de saklanır; `.brain/DECISIONS.md` yalnızca bir export dosyasıdır (ve artık `.brain/exports/decisions.md`'ye taşınmış olabilir — bkz. `api-surface.md`). Bu test V1 path'ini kullanmaya devam ediyor.

**ADR-036 Uyum Analizi:** ADR-036, ADR Governance Integration'ı tanımlar. Bu test ADR içeriklerini doğruluyor, ADR-036 ile dolaylı uyumlu. Ancak test mekanizması (dosya okuma) V2 yaklaşımıyla çelişiyor.

**Sprint 142 Önerisi:** Bu test `MemoryStore.getByType('adr')` ile ADR-038'i DB'den doğrulayacak şekilde güncellenmeli. Hem Memory V2 uyumunu sağlar hem de doküman vs. DB tutarsızlığını erken tespit eder.

---

## 7. Genel Değerlendirme

**Sağlık Skoru: 65/100 (C)**

### Güçlü Yönler:
- 18 it bloğuyla sprint 139 dead code audit çıktılarının kapsamlı doğrulaması
- ADR-038 MADR v3 format compliance kontrolü
- Brittle-by-design yaklaşımı bu bağlamda kabul edilebilir (doküman spec testleri)
- Flaky risk sıfır

### Eksikler / Öneriler:
1. **P1: Memory V2 uyumsuzluğu** — `.brain/DECISIONS.md` doğrudan okuma V1 pattern. ADR-038 doğrulaması idealde MemoryStore üzerinden yapılmalı.
2. **P2: Kategori yanlış yerde** — `audits/` kategorisi doküman bütünlüğü testleri için değil; kaynak kod audit sonuçları için uygun. Bu test `tests/brain/` veya `tests/docs/` altına taşınabilir.
3. **P2: Sprint-specific hard-coding** — `Sprint 145`, `Sprint 142`, LoC sayıları (`151 LoC`, `229 LoC`) gibi değerlerin hard-coded olması bakım zorluğu yaratır. Dokümanlar güncellenince testler kırılır.
4. **P3: Gerçek kaldırma doğrulaması yok** — Testler "Remove kararı verildi" diye dokümanı doğruluyor ama dosyaların gerçekten kaldırılıp kaldırılmadığını (`src/orchestra/learning-decay.ts` silinmiş mi?) kontrol etmiyor.
5. **Tek dosyalı kategori** — `audits/` için sadece 1 test dosyası, gelecek sprintlerde audit dokümanları eklendikçe büyüyecek; kategori varlığı justified.

### Kritik Bulgu:
Test 18. satırında `expect(content).toContain('learning-decay.ts\` (151 LoC)')` ile LoC sayısını hard-code ediyor. Dead code gerçekten silindiğinde bu assertion anlamını yitirir — sonraki sprintlerde temizlenmeli.
