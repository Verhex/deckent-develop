# Analysis: src/cli/helpers/agent-performance.ts
**Task ID:** 142-022 | **Model:** opus | **LoC:** 77 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Agent performans istatistiklerini formatlayan yardımcı sınıf. Sprint sonuçlarındaki TaskEvaluation verilerini agent bazında gruplar, başarı oranı, tech debt sayısı, NO_GO sayısı hesaplar. Retro ve review komutlarında agent performans tablosu üretmek için kullanılır. Underperformer tespiti (%60 eşik) ile zayıf agent'ları işaretler. CLI output formatında string döndürür.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `interface AgentStats` — 6 alan: agentId, totalTasks, doneTasks, techDebtTasks, noGoTasks, successRate. JSDoc: YOK.
- `class AgentPerformanceFormatter` — 3 public metot:
  - `format(evaluations: Map<string, TaskEvaluation | string>, taskAgentMap: Map<string, string>): string` — JSDoc: YOK
  - `groupByAgent(evaluations, taskAgentMap): Map<string, Array<...>>` — JSDoc: YOK
  - `calculateStats(groups): AgentStats[]` — JSDoc: YOK
- **EKSIK:** Hiçbir public metotta JSDoc bulunmuyor.

## 3. İç Bağımlılıklar (import chain listesi, döngüsel bağımlılık riski var mı?)
- `import type { TaskEvaluation } from '../../core/types.js'` — type-only import, çalışma zamanı bağımlılığı yok.
- Döngüsel bağımlılık riski: YOK (tek yönlü, core → cli yönünde değil).

## 4. Dış Bağımlılıklar (node_modules, native modül — ADR-010 uyumu)
- Dış bağımlılık: YOK. Sadece proje iç tipi kullanılıyor.
- ADR-010 uyumu: TAM (sıfır runtime dependency).

## 5. Complexity (fonksiyon sayısı, max cyclomatic rough, en karmaşık fonksiyon adı + satır no)
- Fonksiyon sayısı: 3 (format, groupByAgent, calculateStats)
- Max cyclomatic: ~4 (format metodu, satır 14-41 — nested for + if)
- En karmaşık: `format()` (satır 14-41) — döngü içi koşullu dallanma

## 6. Type Safety (any sayısı, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast)
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 0
- **MÜKEMMEL** type safety — hiçbir tehlikeli kullanım yok.

## 7. ADR Compliance
- ADR-006 (spawnSync): N/A — spawn kullanmıyor.
- ADR-008 (brain import): UYUMLU — brain'den import etmiyor.
- ADR-010 (deps): UYUMLU — sıfır dış bağımlılık.
- ADR-022 (CLI/MCP parity): N/A — helper sınıfı, komut değil.
- ADR-033 (product vision): N/A.
- ADR-037 (RBAC): N/A.
- ADR-039 (self-modifying): N/A.
- Memory V2 DB-first: N/A — memory erişimi yok.

## 8. Test Coverage
- Test dosyası: `tests/cli/helpers/agent-performance.test.ts` — MEVCUT ✓
- Eşleşme: src/cli/helpers/agent-performance.ts → tests/cli/helpers/agent-performance.test.ts ✓
- Mock kalitesi: Bilinmiyor (test dosyası okunmadı ama var).
- Edge case coverage: Bilinmiyor.

## 9. TODO/FIXME/HACK inventory
- Hiçbiri bulunamadı. ✓ Temiz.

## 10. Dead Code (unused export, unreachable branch, @deprecated hâlâ var mı?)
- `groupByAgent` ve `calculateStats` public ama sadece `format` içinden çağrılıyor. Bu metotlar test kolaylığı için public olabilir ama dışarıdan kullanılıp kullanılmadığı araştırılmalı.
- `AgentStats` interface dışarıdan kullanılıyor mu belirsiz — potansiyel dead export.
- Severity: P3 (düşük öncelik).

## 11. Security (input validation, injection riski, secret exposure)
- Güvenlik riski: DÜŞÜK. Sadece string formatlama yapıyor.
- Input validation: Gelen Map boş olabilir → satır 21'de kontrol var ✓
- Injection riski: YOK — kullanıcı girdisi doğrudan kabul etmiyor.
- Secret exposure: YOK.

## 12. Memory V2 Uyumu
- Memory erişimi yok. N/A.
- Eski .md parse: YOK ✓

## 13. i18n (TR/EN hardcoded string, locale-aware mi?)
- Hardcoded EN string'ler: "No agent performance data" (satır 22), "Agent Performance:" (satır 25), "[UNDERPERFORMER]" (satır 30), "Tech Debt:" (satır 33), "NO_GO:" (satır 36).
- Locale-aware: HAYIR — i18n kullanmıyor.
- **P2 SORUN:** 5 hardcoded İngilizce string. Dashboard TR/EN destekli ama bu helper sadece EN.

## 14. Dokümanstayon Tutarlılığı
- JSDoc: HİÇ YOK — 3 public metot ve 1 interface belgelenmemiş.
- .md referans doğruluğu: N/A.
- Sayı tutarlılığı: N/A.

## 15. Performance
- Sync I/O: 0 ✓
- Hot path: HAYIR — sprint sonunda bir kere çağrılır.
- Gereksiz disk okuma/yazma: YOK.
- `tasks.filter()` üç kez çağrılıyor (satır 66-68) — aynı listeyi 3 kez taraması küçük verimsizlik ama task sayısı küçük olduğundan sorun değil.

## 16. Öneriler (severity P0-P3)
- **P3:** JSDoc ekle — public API'lar belgelenmeli.
- **P2:** i18n desteği ekle — hardcoded EN string'leri `getMessage()` ile değiştir.
- **P3:** `groupByAgent` ve `calculateStats`'ı private yapma düşünülebilir veya dış kullanımı doğrula.
- **P3:** `TaskEvaluation | string` union'ı — `String(evaluation)` cast'i (satır 52) neden gerekli? TaskEvaluation zaten string olabilir mi?

## Verdict: ANALYZED
