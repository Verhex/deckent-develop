# Analysis: src/cli/commands/review.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 312 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Sprint task'larının değerlendirmesini (review) yönetir. Task result dosyalarını okur, otomatik veya interaktif olarak approved/rejected/retry/pending kararları verir. Review state'i hem `.tasks/` hem `.brain/reviews/` altında kalıcı olarak saklar. Retry kararı verilen task'ları PENDING'e sıfırlayıp respawn eder. Brain'in sprint değerlendirme akışında ve kullanıcının manuel review sürecinde kullanılır.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `type ReviewDecision = 'approved' | 'rejected' | 'retry' | 'pending'` — JSDoc YOK ✗
- `interface TaskReview` — JSDoc YOK ✗
- `interface ReviewState` — JSDoc YOK ✗
- `loadReviewState(root: string, sprintId: string): ReviewState | null` — JSDoc YOK ✗
- `saveReviewState(root: string, state: ReviewState): void` — JSDoc YOK ✗
- `detectMixedSprints(tasks: Task[]): string[]` — JSDoc VAR (inline) ✓
- `registerReview(program: Command): void` — JSDoc YOK ✗

## 3. İç Bağımlılıklar
- `../../core/types.js` → Task, TaskResult
- `../../core/constants.js` → TASKS_DIR, BRAIN_DIR
- `../helpers/output.js` → print, printError, formatTable
- `../helpers/process.js` → resolveProjectRoot
- Dynamic import: `../helpers/prompt.js` → promptSelect (interactive mode)
- Dynamic import: `../../orchestra/tmux.js` → killWorker (retry respawn)
- **ADR-008 notu:** tmux.js'yi dynamic import ile kullanıyor — review.ts bir CLI komutu, brain değil. Teknik olarak ADR-008'in kapsamı brain modülü üzerine. CLI komutunun tmux erişimi kabul edilebilir.

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 ✓
- `node:fs` — native ✓
- `node:path` — native ✓
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity
- 11 fonksiyon
- En karmaşık: `registerReview` action handler (satır 197-310) — auto/approveAll/rejectAll/interactive branching — cyclomatic ~8
- `handleRetryRespawn` (satır 155-185) — task reset + worker kill + result delete — cyclomatic ~4

## 6. Type Safety
- `as Task['status']` — satır 173 — string literal override. Task.status type'ına 'PENDING' atamak için. **Güvenli ama fragile** — TaskStatus enum kullanılmalı.
- `as Task` — satır 77, 163 — JSON.parse sonrası. Standart pattern.
- `as TaskResult` — satır 89 — JSON.parse sonrası.
- `as ReviewState` — satır 42
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **as unknown: 0** ✓

## 7. ADR Compliance
- **ADR-022 CLI/MCP parity:** MCP karşılığı `src/mcp/tools/review.ts` MEVCUT ✓. MCP tool: JSON output, auto-review. CLI: interactive, auto, approve-all, reject-all, json. **GAP: MCP'de approve-all/reject-all/interactive yok** — kısmi parity.
- **ADR-008:** Dynamic import tmux.js — CLI context, kabul edilebilir ✓
- **ADR-010:** Sadece commander + native ✓
- **Memory V2 DB-first:** Review state dosya tabanlı (JSON), DB'de değil — tasarım kararı, review state sprint-specific ve geçici.

## 8. Test Coverage
- `tests/cli/commands/review.test.ts` — MEVCUT ✓
- `tests/cli/commands/review-finalize-overhaul.test.ts` — MEVCUT ✓
- `tests/cli/commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts` — MEVCUT ✓
- **Kapsam: İYİ** — 3 test dosyası

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓

## 10. Dead Code
- Tüm export'lar kullanımda (loadReviewState finalize.ts'de import ediliyor)
- **Dead code: YOK** ✓

## 11. Security
- `unlinkSync(resultPath)` — satır 179: retry sırasında eski result dosyasını siliyor. `node:fs` dynamic import ile. Güvenli — sadece TASKS_DIR içinde.
- `killWorker(review.taskId)` — satır 167: tmux process kill. taskId validasyonu yok ama tmux session name formatı sınırlı.
- JSON.parse çağrıları try/catch ile ✓
- **Güvenlik: İYİ** — ciddi risk yok

## 12. Memory V2 Uyumu
- Review state dosya tabanlı — DB'de saklanmıyor
- Bu tasarım kararı kabul edilebilir: review state sprint lifecycle'a bağlı, geçici veri
- **Uyum: KABUL EDİLEBİLİR** ✓

## 13. i18n
- Kullanıcı mesajları İngilizce hardcoded: "No tasks found", "Auto-review complete", "Summary: X approved..."
- `messages.ts` kullanılmıyor — **GAP: i18n desteği yok**
- Interactive prompt label'ları İngilizce: "Approve", "Reject", "Retry", "Skip (pending)"

## 14. Dokümantasyon Tutarlılığı
- JSDoc eksik birçok export'ta (loadReviewState, saveReviewState, ReviewState, TaskReview)
- DECKENT.md'de `deckent_review` MCP tool: "Sprint sonucunu değerlendir: GO / NO_GO / GO_WITH_TECH_DEBT" — CLI review komutu approved/rejected/retry/pending kullanıyor. **Terminoloji farkı** — MCP GO/NO_GO, CLI approved/rejected.

## 15. Performance
- `loadTasks` her çağrıda tüm task JSON'larını okuyor — O(n) disk I/O
- `loadResult` her task için ayrı ayrı çağrılıyor (satır 258, 290) — N+1 pattern
- **Hot path değil** — kullanıcı CLI komutu, kabul edilebilir

## 16. Öneriler
1. **P2:** `task.status = 'PENDING' as Task['status']` yerine `TaskStatus.PENDING` enum kullan (satır 173) — type safety
2. **P3:** ADR-022 gap — MCP review tool'a approve-all/reject-all action ekle
3. **P3:** Terminoloji uyumu — CLI approved/rejected ↔ MCP GO/NO_GO arasında köprü dokümante et
4. **P3:** i18n desteği — messages.ts entegrasyonu
5. **P3:** JSDoc ekle — loadReviewState, saveReviewState, ReviewState, TaskReview

## Verdict: ANALYZED
