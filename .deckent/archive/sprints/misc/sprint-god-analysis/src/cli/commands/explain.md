# Analysis: src/cli/commands/explain.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 349 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Son sprint'in ne yaptığını insan-dostu dilde açıklar. Sprint log dosyasını parse eder, RETRO.md'den öğrenmeleri çıkarır ve formatlanmış özet üretir. i18n desteği (TR/EN), JSON çıktı modu ve verbose mod (tüm öğrenmeler + task detayları) sunar. DIRECTIVES.md'den sprint hedefini çıkarır. Kullanıcının sprint sonuçlarını hızlıca anlaması için tasarlanmış — retro'dan daha basit ve odaklı.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `interface SprintSummary` — JSDoc VAR ✓ (inline)
- `interface RetroLearnings` — JSDoc VAR ✓ (inline)
- `findLatestSprintLog(root: string): string | null` — JSDoc VAR ✓
- `parseSprintNumber(filename: string): number` — JSDoc VAR ✓
- `parseSprintLog(content: string): SprintSummary` — JSDoc VAR ✓
- `parseRetroLearnings(content: string, maxItems?: number): RetroLearnings` — JSDoc VAR ✓
- `formatDuration(ms: number): string` — JSDoc VAR ✓
- `extractGoalFromDirectives(root: string): string | null` — JSDoc VAR ✓
- `extractGoalFromSprintLog(content: string): string | null` — JSDoc VAR ✓
- `buildExplainOutput(summary, learnings, lang?, verbose?): string` — JSDoc VAR ✓
- `registerExplain(program: Command): void` — JSDoc VAR ✓
- **Mükemmel JSDoc coverage** ✓ — tüm export'larda mevcut

## 3. İç Bağımlılıklar
- `../helpers/output.js` → print
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/config-reader.js` → getLangFromConfig
- `node:fs`, `node:path` — native
- **Minimal bağımlılık** — sadece helpers ✓
- **Döngüsel bağımlılık: YOK** ✓

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 ✓
- `node:fs` — native ✓
- `node:path` — native ✓
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity
- 11 fonksiyon
- En karmaşık: `parseSprintLog` (satır 54-121) — çoklu regex ile tablo parse — cyclomatic ~10
- `buildExplainOutput` (satır 214-255) — string formatting — cyclomatic ~5
- `registerExplain` action (satır 261-349) — file read + parse + format — cyclomatic ~6
- **Orta karmaşıklık** — regex-heavy ama iyi yapılandırılmış

## 6. Type Safety
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **@ts-expect-error: 0** ✓
- **as unknown: 0** ✓
- **non-null !: 1** — satır 207 (`parseFloat(m[1]!)`) — regex match guard ile korumalı ✓
- **Mükemmel type safety** ✓

## 7. ADR Compliance
- **ADR-022 CLI/MCP parity:** MCP karşılığı `src/mcp/tools/explain.ts` MEVCUT ✓. CLI: --sprint, --json, --verbose. **Parity: İYİ**
- **ADR-008:** Brain import yok ✓
- **ADR-010:** Sadece commander ✓
- **Memory V2 DB-first:** Sprint log ve RETRO.md dosya tabanlı okuma — **GAP: DB-first değil**. Sprint verisi DB'de `type: 'sprint'` olarak saklanıyor olmalı.

## 8. Test Coverage
- `tests/cli/commands/explain.test.ts` — MEVCUT ✓
- `tests/cli/commands/explain-enhanced.test.ts` — MEVCUT ✓
- **Kapsam: İYİ** — 2 test dosyası, enhanced test verbose/json senaryoları

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓

## 10. Dead Code
- Tüm export'lar kullanımda veya test edilmiş
- **Dead code: YOK** ✓

## 11. Security
- Dosya okuma sadece .brain/sprints/ ve DIRECTIVES.md — sınırlı erişim ✓
- Regex kullanımı — ReDoS riski düşük
- **Güvenlik: İYİ** ✓

## 12. Memory V2 Uyumu
- Sprint log: `.brain/sprints/sprint-NNN.md` dosyasından okuyor
- RETRO.md: `.brain/RETRO.md` dosyasından okuyor
- DIRECTIVES.md: kök dizinden okuyor
- **P2: DB-first geçişi eksik** — sprint ve retro verisi DB'den sorgulanmalı

## 13. i18n
- **İYİ i18n implementasyonu** ✓ — `EXPLAIN_LABELS` objesi ile TR/EN desteği
- `label()` helper fonksiyonu ile dil switch
- `getLangFromConfig(root)` ile config'den dil okuma
- Bazı hardcoded EN string'ler: "No sprints found", "Sprint X not found" (satır 279, 288) — **P3: EXPLAIN_LABELS'a taşı**

## 14. Dokümantasyon Tutarlılığı
- **Mükemmel JSDoc coverage** ✓
- `(F)`, `(G)`, `(J)` comment tag'leri — feature tracking reference
- DECKENT.md'de `deckent_explain`: "Sprint geçmişini ve sonuçlarını açıkla" — doğru ✓

## 15. Performance
- `readFileSync` × 3 (sprint log, RETRO.md, DIRECTIVES.md)
- `readdirSync` × 1 (sprints/ dizini)
- **Hot path değil** — kabul edilebilir

## 16. Öneriler
1. **P2:** Memory V2 DB-first — sprint ve retro verisi DB'den sorgulanmalı
2. **P3:** Kalan hardcoded EN string'leri EXPLAIN_LABELS'a taşı
3. **P3:** `parseSprintLog` ve retro.ts'deki `parseRetroToRichSummary` arasında regex pattern tekrarı — shared parser modülü oluştur
4. **Info:** Bu dosya batch'teki en temiz ve en iyi dokümante edilmiş dosya — referans kalitesi

## Verdict: ANALYZED
