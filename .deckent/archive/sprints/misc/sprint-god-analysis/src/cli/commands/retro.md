# Analysis: src/cli/commands/retro.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 453 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Sprint retrospektifini (RETRO.md) okur, parse eder ve zengin formatlı çıktı üretir. Rich summary, önceki sprint ile delta karşılaştırma, agent/skill performans tabloları ve sprint trend analizi sunar. i18n desteği var (TR/EN). Kullanıcının sprint sonuçlarını hızlıca değerlendirmesi için tasarlanmış — hem terminal hem JSON çıktı destekler. Sprint arşivleme (archiveCurrentRetro) işlevi de barındırır.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `interface RichSprintSummary` — JSDoc YOK ✗
- `interface AgentPerfRow` — JSDoc YOK ✗
- `interface SkillPerfRow` — JSDoc YOK ✗
- `interface SprintTrendEntry` — JSDoc YOK ✗
- `parseRetroToRichSummary(content: string): RichSprintSummary` — JSDoc YOK ✗
- `formatRichSummary(summary: RichSprintSummary, lang?: string): string` — JSDoc YOK ✗
- `computeRetroDelta(current: RichSprintSummary, previous: RichSprintSummary, lang?: string): string` — JSDoc YOK ✗
- `parseAgentPerformanceFromRetro(content: string): AgentPerfRow[]` — JSDoc VAR ✓
- `parseSkillPerformanceFromRetro(content: string): SkillPerfRow[]` — JSDoc VAR ✓
- `formatAgentPerfTable(rows: AgentPerfRow[], lang?: string): string` — JSDoc YOK ✗
- `formatSkillPerfTable(rows: SkillPerfRow[], lang?: string): string` — JSDoc YOK ✗
- `loadSprintTrend(root: string, n?: number): SprintTrendEntry[]` — JSDoc VAR ✓
- `formatTrend(entries: SprintTrendEntry[], lang?: string): string` — JSDoc YOK ✗
- `archiveCurrentRetro(root: string, sprintId: string): string | null` — JSDoc VAR ✓
- `registerRetro(program: Command): void` — JSDoc YOK ✗
- **Çok sayıda export:** Bu dosya hem parser hem formatter hem archiver — SRP ihlali riski

## 3. İç Bağımlılıklar
- `../../core/constants.js` → BRAIN_DIR, RETRO_FILE, SPRINTS_DIR
- `../helpers/output.js` → print
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/config-reader.js` → getLangFromConfig
- **Döngüsel bağımlılık: YOK** ✓

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 ✓
- `node:fs` — native ✓
- `node:path` — native ✓
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity
- 17 fonksiyon — en yüksek fonksiyon sayısı bu batch'te
- En karmaşık: `parseRetroToRichSummary` (satır 54-106) — çoklu regex ile tablo parse — cyclomatic ~10
- `registerRetro` action (satır 369-452) — 5 flag branching — cyclomatic ~7
- **Yüksek karmaşıklık** — dosya çok fazla sorumluluk barındırıyor

## 6. Type Safety
- `as RichSprintSummary` yok — doğrudan obje literal dönüyor ✓
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **@ts-expect-error: 0** ✓
- **non-null !: 2** — satır 347 (`files.at(-1)!`), 351 (`files.at(-2)!`) — guard clause mevcut (length check) ✓
- **Genel: İYİ** — sağlam tip güvenliği

## 7. ADR Compliance
- **ADR-022 CLI/MCP parity:** MCP karşılığı `src/mcp/tools/retro.ts` MEVCUT ✓. CLI: --raw, --compare, --json, --perf, --trend. MCP muhtemelen temel retro çıktısı. **GAP: MCP'de --compare, --perf, --trend flag karşılıkları muhtemelen yok**
- **ADR-008:** Brain import yok ✓
- **ADR-010:** Sadece commander ✓
- **Memory V2 DB-first:** RETRO.md dosya tabanlı okuma — ama retro verisi dosyada saklanıyor (file-based retro, DB'de retro type entry'ler ayrı). **GAP: retro verisi DB'den sorgulanmıyor, hala RETRO.md dosyasından okunuyor** — Memory V2 migration gap.

## 8. Test Coverage
- `tests/cli/commands/retro.test.ts` — MEVCUT ✓
- `tests/cli/commands/retro-rich.test.ts` — MEVCUT ✓
- `tests/cli/commands/retro-json.test.ts` — MEVCUT ✓
- `tests/cli/commands/retro-parse-fix.test.ts` — MEVCUT ✓
- **Kapsam: ÇOK İYİ** — 4 test dosyası, rich/json/parse edge case'ler

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓

## 10. Dead Code
- `archiveCurrentRetro` — finalize.ts veya sprint-controller tarafından kullanılıyor mu? Grep gerekli. Eğer sadece export olarak duruyor ve import edilmiyorsa dead code.
- Diğer tüm export'lar aktif kullanımda
- **Potansiyel dead code: archiveCurrentRetro** — doğrulama gerekli

## 11. Security
- Regex kullanımı yoğun (15+ regex) — ReDoS riski düşük ama mevcut
- Dosya okuma sadece BRAIN_DIR/sprints/ içinde — path traversal riski yok
- **Güvenlik: İYİ** ✓

## 12. Memory V2 Uyumu
- **RETRO.md dosya tabanlı okuma** — `readFileSync(retroPath)` satır 386
- Sprint trend: `.brain/sprints/sprint-NNN.md` dosyalarından — dosya tabanlı
- **GAP: DB-first değil** — Retro verisi Memory V2 DB'de `type: 'retro'` olarak saklanıyor olmalı ama CLI bu modül hala dosyadan okuyor
- **P2: Memory V2 geçişi eksik**

## 13. i18n
- **İYİ i18n implementasyonu** ✓ — `RETRO_LABELS` objesi ile TR/EN desteği
- `lbl()` helper fonksiyonu ile dil switch
- `getLangFromConfig(root)` ile config'den dil okuma
- Bazı hardcoded EN string'ler: "No retrospective found", "Retrospective file is empty" (satır 384, 389) — **P3: i18n gap**

## 14. Dokümantasyon Tutarlılığı
- JSDoc çoğu fonksiyonda eksik — sadece parseAgentPerformanceFromRetro, parseSkillPerformanceFromRetro, loadSprintTrend, archiveCurrentRetro'da var
- `(B)`, `(C)` comment tag'leri mevcut — internal tracking reference'ları

## 15. Performance
- `loadSprintTrend` her çağrıda N sprint dosyası okuyor — O(N) disk I/O
- `loadPreviousRetro` — readFileSync × 2 (current retro + previous sprint file)
- **Hot path değil** — kabul edilebilir

## 16. Öneriler
1. **P2:** Memory V2 DB-first geçişi — retro verisi `MemoryStore.getByType('retro')` ile okunmalı, RETRO.md fallback olarak kalmalı
2. **P2:** SRP ihlali — parseRetroToRichSummary, formatters, archiver farklı modüllere ayrılabilir (453 LoC tek dosyada çok)
3. **P3:** Kalan hardcoded EN string'leri RETRO_LABELS'a taşı
4. **P3:** Eksik JSDoc'ları ekle (özellikle parseRetroToRichSummary, formatRichSummary)
5. **P3:** archiveCurrentRetro kullanım doğrulaması — eğer dead code ise kaldır

## Verdict: ANALYZED
