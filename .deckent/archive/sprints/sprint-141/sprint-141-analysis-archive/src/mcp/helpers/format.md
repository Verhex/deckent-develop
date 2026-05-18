# Analysis: src/mcp/helpers/format.ts
**Task ID:** 141-004 | **LoC:** 324

## 1. Amaci (1-2 cumle)
Ham veri yapılarını insan tarafından okunabilir özet string'lerine dönüştüren saf formatlama fonksiyonları kütüphanesi. MCP araç yanıtlarının son kullanıcıya sunulmadan önce geçtiği sunum katmanıdır.

## 2. Public API (export listesi)
**Interface'ler (9):**
- `StatusData` — sprint durumu: phase, activeTasks, completedTasks, alerts vb.
- `PlanData` — planlama sonucu: tasks dizisi, model/effort dağılımı
- `StartData` — sprint başlatma sonucu: sprintId, workerCount, backend
- `DoctorData` — sağlık kontrol sonucu: checks dizisi, errorCount, warningCount
- `RetroData` — retrospektif verisi: sprintId, learnings, metrics
- `HistoryData` — sprint geçmişi: sprints dizisi
- `ErrorData` — hata yapısı: code, message, hint
- `FormattedResponse` — genel sarmalayıcı: `{ content: Array<{ type: 'text'; text: string }> }`
- `ExplainData` — açıklama verisi: sprintId, phases, taskSummary (yalnızca format.ts'den export, helpers/index.ts'den **değil**)

**Fonksiyonlar (8 + 1 yardımcı):**
- `formatStatusResponse(data: StatusData): FormattedResponse`
- `formatPlanResponse(data: PlanData): FormattedResponse`
- `formatStartResponse(data: StartData): FormattedResponse`
- `formatDoctorResponse(data: DoctorData): FormattedResponse`
- `formatRetroResponse(data: RetroData): FormattedResponse`
- `formatHistoryResponse(data: HistoryData): FormattedResponse`
- `formatErrorResponse(data: ErrorData): FormattedResponse`
- `formatExplainResponse(data: ExplainData): FormattedResponse` (**index.ts'den re-export edilmemiş**)
- `wrapResponse(text: string): FormattedResponse` — string'i MCP content format'ına sarar
- `pluralize(count: number, singular: string, plural: string): string` — sayı/çoğul yardımcısı (iç kullanım)

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:** Yok — modül tamamen bağımsız.

**Dış bağımlılıklar:** Sıfır. Node.js built-in veya npm paketi kullanılmaz. Tüm formatlama mantığı template literal'lar ve lookup `Record<string, string>` nesneleriyle çözülmüştür.

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Toplam 8 format fonksiyonu + 1 `wrapResponse` + 1 `pluralize` = **10 fonksiyon**
- Her format fonksiyonu ortalama cyclomatic complexity ~2-5 (conditional text append, array iteration)
- `formatDoctorResponse` en karmaşık: check durumu renklenirmesi, hata/uyarı ayrımı → ~5
- `formatStatusResponse` ikinci en karmaşık: faz gösterimi, aktif/tamamlanan task listesi → ~4
- Toplam tahmini cyclomatic: ~30-35, dosya boyutuyla orantılı, kabul edilebilir

## 5. Type Safety (any, @ts-ignore, non-null assertion)
Modül tip güvenliği açısından temizdir:
- `any` kullanımı: **0**
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion (`!`): **0**
- `Record<string, string>` lookup tabloları için uygun tip seçimi
- Tüm interface alanları açıkça tiplenmiş, opsiyonel alanlar `?` ile işaretlenmiş

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-006 (spawnSync Security Pattern):** İlgili değil.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — brain/orchestra modüllerine hiç import yok, saf formatlama katmanı.
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — sıfır dış bağımlılık.
- **ADR-037 (RBAC):** İlgili değil — formatlama katmanında yetki kontrolü olmaz.
- **ADR-039 (Self-Modifying):** İlgili değil.
- **ADR-040 (Memory V2 DB-first):** İlgili değil — DB erişimi yok.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/helpers/format.test.ts`

8 format fonksiyonu için birim testleri beklenmelidir:
- Her format fonksiyonu için temel dönüşüm testi (geçerli input → beklenen string çıktısı)
- `wrapResponse` için MCP content format uyumu (`content[0].type === 'text'`)
- `pluralize` için 0, 1, 2+ sayı durumları
- Boş dizi/null güvenli alan durumları

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
**Önemli tutarsızlık:** `ExplainData` interface'i ve `formatExplainResponse()` fonksiyonu `format.ts`'den dışa aktarılmaktadır, ancak `helpers/index.ts` barrel export'unda **re-export edilmemiştir**. Bu durum, `explain` MCP tool'unu kullanan kodu doğrudan `format.js` modülünden import yapmaya zorlamaktadır. Barrel export amacının dışına çıkılmakta, API yüzeyi tutarsızlaşmaktadır.

`FormattedResponse` interface'i `wrapResponse` dönüş tipi olarak kullanılır, ancak arayanlar genellikle bu tipi açıkça belirtmez; yine de export edilmesi doğrudur.

## 10. Security Findings
Güvenlik riski minimumdur:
- Tüm fonksiyonlar yalnızca iç veri yapıları alır; kullanıcıdan gelen ham string'ler doğrudan template literal'a yerleştirilmez (XSS/injection riski yok, zira MCP text formatında HTML render edilmez).
- `Record<string, string>` lookup tabloları const olarak tanımlıdır; runtime'da değiştirilemez.

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
Bu modül Memory V2 mimarisiyle doğrudan ilgili değildir. Herhangi bir `.brain/` dosyası veya SQLite DB'ye erişim bulunmamaktadır. Formatlama katmanı tamamen saf veri dönüşümü yapar. Uyum durumu: **N/A**.

## 12. Oneriler (Sprint 142+ input)
1. **Acil (P1):** `helpers/index.ts`'e `ExplainData` ve `formatExplainResponse` re-export'unu ekle — mevcut durum API tutarsızlığına neden olmaktadır.
2. **Normal (P2):** `FormattedResponse` tip import'unu yaygınlaştır — bazı araçlar `wrapResponse` dönüş tipini `any` olarak kullanıyor olabilir.
3. **Normal (P2):** Format fonksiyonları için i18n desteği eklenebilir (şu an TR/EN mix string içeriği var; `enrich.ts` gibi lang parametresi alabilir).
4. **Düşük (P3):** `pluralize` yardımcısını ayrı bir `utils/string.ts` modülüne taşımayı değerlendir — kodun yeniden kullanılabilirliğini artırır.

## 13. Verdict: ANALYZED
