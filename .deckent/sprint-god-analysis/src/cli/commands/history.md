# Analysis: src/cli/commands/history.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 309 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Sprint geçmişini tablo formatında gösterir. Sprint log dosyalarını parse eder, usage data ile zenginleştirir ve agent/skill filtreleme, trend analizi, JSON çıktı destekler. collectSprintFiles helper'ından sprint dosyalarını toplar, her birini parse edip SprintRecord'a dönüştürür. Kullanıcının proje geçmişini izlemesi, trend'leri görmesi ve agent/skill bazlı filtreleme yapması için tasarlanmış.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `formatDurationMs(raw: string): string` — JSDoc YOK ✗
- `parseAgentSkillInfo(content: string): { agents: string[]; skills: string[] }` — JSDoc YOK ✗
- `parseSprintLog(content: string): SprintRecord` — JSDoc YOK ✗
- `buildTrendAnalysis(records: SprintRecord[]): string` — JSDoc VAR ✓
- `registerHistory(program: Command): void` — JSDoc YOK ✗
- Private: `loadUsageData`, `parsePercentValue` — JSDoc VAR ✓
- **JSDoc coverage: ORTA** — sadece 3/7 fonksiyonda mevcut

## 3. İç Bağımlılıklar
- `../../core/constants.js` → BRAIN_DIR, SPRINTS_DIR, DECKENT_DIR
- `../../orchestra/sprint-reporter.js` → collectSprintFiles — **orchestra import**
- `../helpers/output.js` → print, formatTable
- `../helpers/process.js` → resolveProjectRoot
- **ADR-008 notu:** sprint-reporter.js static import — utility fonksiyonu, kabul edilebilir

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 ✓
- `node:fs` — native ✓
- `node:path` — native ✓
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity
- 7 fonksiyon
- En karmaşık: `parseAgentSkillInfo` (satır 37-97) — çoklu regex + tablo parse + column detection — cyclomatic ~10
- `parseSprintLog` (satır 99-151) — regex-heavy metric extraction — cyclomatic ~6
- `registerHistory` action (satır 229-308) — filter + format + trend — cyclomatic ~7
- **Orta-yüksek karmaşıklık** — regex pattern yoğunluğu

## 6. Type Safety
- `SprintRecord` interface — tüm alanlar string — **P3: numeric alanlar (tasks, completed, noGo) number olmalı**
- `as Array<{ tokenEstimate?: number }>` — satır 159 — JSON.parse sonrası
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **non-null !: 2** — satır 69 (`cols[3] ?? ''`), satır 186 (`window[0]!`, `window[count-1]!`) — guard clause'lar mevcut
- **Genel: İYİ**

## 7. ADR Compliance
- **ADR-022 CLI/MCP parity:** MCP karşılığı `src/mcp/tools/history.ts` MEVCUT ✓. CLI: --agent, --skill, --json, --last, --trend. **Parity: İYİ** — muhtemelen temel history çıktısı.
- **ADR-008:** sprint-reporter.js import — utility, kabul edilebilir ✓
- **ADR-010:** Sadece commander ✓
- **Memory V2 DB-first:** Sprint log dosya tabanlı okuma — **GAP: DB-first değil**

## 8. Test Coverage
- `tests/cli/commands/history.test.ts` — MEVCUT ✓
- `tests/cli/commands/history-overhaul.test.ts` — MEVCUT ✓
- `tests/cli/commands/history-agents.test.ts` — MEVCUT ✓
- **Kapsam: ÇOK İYİ** — 3 test dosyası, agent filtreleme ve overhaul testleri

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓

## 10. Dead Code
- `formatDurationMs` — dışarıdan import edilebilir, ama explain.ts'de de `formatDuration` var. **İki farklı duration formatter** — farklı input format'ları (ms string vs number). Kabul edilebilir ama DRY değil.
- Tüm export'lar kullanımda

## 11. Security
- Dosya okuma sadece .brain/sprints/ ve .deckent/usage/ — sınırlı erişim ✓
- JSON.parse try/catch ile ✓
- **Güvenlik: İYİ** ✓

## 12. Memory V2 Uyumu
- Sprint log: `.brain/sprints/sprint-NNN.md` dosyasından — dosya tabanlı
- Usage data: `.deckent/usage/sprint-NNN.json` dosyasından — dosya tabanlı
- **P2: DB-first geçişi eksik** — sprint verisi DB'den sorgulanmalı

## 13. i18n
- **i18n desteği YOK** — tüm mesajlar İngilizce hardcoded
- `messages.ts` veya label objesi kullanılmıyor
- Tablo başlıkları EN: 'Sprint', 'Tasks', 'Done', 'Debt', 'No-Go', etc.
- Trend analysis EN: "Trend (last N sprints)", "Success Rate:", "Coverage:"
- **P3: i18n ekle** — retro.ts ve explain.ts'deki pattern'ı takip et

## 14. Dokümantasyon Tutarlılığı
- JSDoc eksik çoğu public fonksiyonda
- DECKENT.md'de `deckent_history`: "Sprint geçmişini listele" — doğru ✓
- parseSprintLog — retro.ts'deki parseRetroToRichSummary ile benzer ama farklı return type. **Konfüzyon riski** — iki ayrı sprint log parser.

## 15. Performance
- `collectSprintFiles` + `readFileSync` per file — O(N) disk I/O
- `loadUsageData` per sprint — ek O(N) disk I/O
- Toplam: 2N dosya okuma per history çağrısı
- **Hot path değil** — kabul edilebilir

## 16. Öneriler
1. **P2:** Memory V2 DB-first — sprint verisi DB'den sorgulanmalı
2. **P2:** parseSprintLog duplicate — history.ts ve explain.ts'de farklı sprint log parser'lar var. Shared parser modülüne birleştir.
3. **P3:** i18n desteği ekle — retro.ts/explain.ts pattern'ını takip et
4. **P3:** SprintRecord numeric alanlarını number tipinde tut, sadece display'de string'e çevir
5. **P3:** JSDoc ekle — parseAgentSkillInfo, parseSprintLog, formatDurationMs

## Verdict: ANALYZED
