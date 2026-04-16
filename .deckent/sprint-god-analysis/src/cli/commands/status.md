# Analysis: src/cli/commands/status.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 401 | **Effort:** max

## 1. Amaci
`deckent status` CLI komutunu register eder. Sprint durum izleme: .dashboard JSON dosyasini okur, task dosyalarini parse eder, 4 output modu destekler (human-friendly, raw/legacy, JSON, Mermaid graph). Watch mode (fs.watch + fallback interval), standalone mode (dashboard yokken task dosyalarindan durum), dependency graph goruntuleme. Agent ve skill assignment formatlama. Sprint yasam dongusunun izleme katmani.

## 2. Public API
- `registerStatus(program: Command): void` — ana kayit fonksiyonu, JSDoc YOK
- `loadDepGraphForSprint(root, sprintId): string | null` — JSDoc MEVCUT
- `getLangFromRoot(root): string` — JSDoc MEVCUT
- `loadTaskFiles(root): Task[]` — export, diger modullerden kullanilabilir
- `formatAgentAssignments(tasks, verbose): string` — export
- `formatSkillAssignments(tasks, verbose): string` — export
- Interface: `StatusOpts` (private)

## 3. Ic Bagimliliklar
- `../../core/types.js` → DashboardState, Task
- `../../core/constants.js` → DASHBOARD_FILE, TASKS_DIR, DECKENT_DIR
- `../../core/output-formatter.js` → formatStatus, resolveOutputMode
- `../../monitor/sprint-state.js` → getCurrentSprintId
- `../helpers/output.js` → print, printError, formatDashboard, formatTable, formatHumanStatus, formatStandaloneStatus, isNoColor, stripAnsi, CIBaseline, CIReport
- `../helpers/process.js`, `../helpers/messages.js`
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- `commander` (ADR-010)
- `node:fs` (readFileSync, existsSync, readdirSync, watch)
- `node:path`

## 5. Complexity
- 10 fonksiyon (register + 7 helper + 2 read)
- Max cyclomatic: ~12 (registerStatus action handler — watch/json/raw/verbose/graph/mode/standalone branches)
- En karmasik: action handler satir 237-401 — 7 ana akis (graph, no-dash standalone, watch, json, raw, human+mode, human)
- `readCIData` ve `readSprintMeta` — 2 yardimci okuyucu

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- non-null `!`: 0
- `as DashboardState` cast: JSON parse sonrasi (satir 109, 339) — makul
- `as unknown as Record<string, unknown>` cast: satir 371 — task'tan evaluationDecision okuma — **type safety gap** (Task type'inda evaluationDecision tanimli olmayabilir)
- `as string | undefined` cast: satir 363, 371 — belirsiz tip kaynagi
- Genel: ORTA — bazi cast'lar Task type uyumsuzlugunu gosteriyor

## 7. ADR Compliance
- ADR-006: N/A — spawnSync kullanmiyor
- ADR-008: `monitor/sprint-state.js` import — monitor/ brain/ degil, ADR-008 disinda — UYUMLU
- ADR-010: UYUMLU
- ADR-022 CLI/MCP parity: UYUMLU — `deckent_status` MCP tool mevcut
- Memory V2: status.ts DB'ye erismiyor — .dashboard JSON + task JSON dosyalari — dosya tabanli, bu uygun (real-time dashboard)

## 8. Test Coverage
- `tests/cli/commands/status.test.ts` — MEVCUT
- `tests/cli/commands/status-agents.test.ts` — MEVCUT (agent assignments)
- `tests/cli/commands/status-mode.test.ts` — MEVCUT (output mode)
- Kapsam: IYI — 3 test dosyasi. Watch mode, graph mode, standalone mode coverage'i bilinmiyor.

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- `output` helper (satir 222-224) — `print` wrapper with NO_COLOR strip — aktif
- `readDashboard` (satir 105-112) — kullaniliyor (watch mode + normal)
- Tum fonksiyonlar aktif

## 11. Security
- `readFileSync(dashPath)` — .dashboard dosyasi yerel, risk dusuk
- `JSON.parse` — malformed JSON try/catch ile yakalaniyor
- `watch(dashPath)` — fs.watch, path sabit (DASHBOARD_FILE) — GUVENLI
- `process.stdout.write('\x1Bc')` — terminal clear, risk yok

## 12. Memory V2 Uyumu
- N/A — status.ts Memory DB'ye erismiyor, dosya tabanli dashboard mekanizmasi kullaniliyor
- Bu dogru mimari: real-time durum izleme icin dosya tabanli I/O daha uygun (DB lock yok)

## 13. i18n
- `getMessage()` KULLANIYOR — status.no_active_sprint, status.dashboard_read_failed
- `getLangFromRoot()` — config'den dil okuyor — IYI
- **GAP:** formatAgentAssignments/formatSkillAssignments icindeki mesajlar EN: "Agent Assignments", "No agent assignments found", "Skill Assignments" — getMessage() ile cevrilmeli
- **GAP:** Graph mode mesajlari EN: "No active sprint found", "No dependency graph found"
- **GAP:** Standalone mesajlari EN: formatStandaloneStatus helpers/output.ts'de

## 14. Dokumantasyon Tutarliligi
- JSDoc: loadDepGraphForSprint, getLangFromRoot — MEVCUT
- loadTaskFiles — JSDoc YOK ama isim yeterince aciklayici
- **UYUMSUZLUK:** `--mode` option "explainatory | standart" yazim hatasi — "explanatory | standard" olmali (satir 236)

## 15. Performance
- Sync I/O: readFileSync (5), existsSync (6), readdirSync (1) = 12 sync cagri — ORTA
- Watch mode: fs.watch + setInterval(5000ms) fallback — ikisi birden calisir, cift tetikleme riski var ama idempotent render
- `loadTaskFiles` her render'da cagiriliyor (watch mode) — buyuk sprint'lerde yavas olabilir (50+ task)
- JSON parse her render'da — cache mekanizmasi yok

## 16. Oneriler
- **P1:** `--mode` option yazim hatasi: "explainatory" → "explanatory", "standart" → "standard"
- **P2:** i18n: agent/skill assignment + graph mesajlari getMessage() ile
- **P2:** `as unknown as Record` cast → Task type'ina evaluationDecision ekle veya proper accessor
- **P2:** Watch mode'da loadTaskFiles cache'lenmeli (5sn TTL)
- **P3:** formatAgentAssignments/formatSkillAssignments ayri dosyaya tasinabilir (reuse icin)

## Verdict: ANALYZED
