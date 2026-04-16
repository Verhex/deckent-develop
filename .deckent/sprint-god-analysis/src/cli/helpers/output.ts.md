# Analysis: src/cli/helpers/output.ts
**Task ID:** 142-021 | **Model:** opus | **LoC:** 648 | **Effort:** max

## 1. Amaci
CLI status komutlarinin cikti formatlama merkezi. Dashboard goruntuleme, doctor sonuc formatlama, sprint ozeti, insan-dostu durum raporu, CI sagligi, progress bar, tablo formatlama gibi tum CLI gorsel ciktilarini uretir. Brain/orchestra katmanindan gelen veriyi terminal-friendly stringlere donusturur. Hem makine (JSON) hem insan (human-status) modunu destekler.

## 2. Public API
- `isNoColor(): boolean` — NO_COLOR cevresel degisken kontrolu
- `stripAnsi(text: string): string` — ANSI kodlarini soyar
- `color(code: string, text: string): string` — NO_COLOR-aware renklendirme
- `redactSensitive(text: string): string` — Secret/credential redaction
- `print(message: string): void` — stdout yazar
- `printError(error: unknown): void` — stderr yazar
- `formatProgressBar(percent: number, width?: number): string` — ASCII progress bar
- `formatTable(headers: string[], rows: string[][]): string` — Basit tablo formatlama
- `formatDashboard(state: DashboardState): string` — Unicode box-drawing dashboard
- `formatDoctorResult(result: DoctorResult): string` — Doctor check ciktisi
- `formatSprintSummary(sprint: Sprint, results?: TaskResult[]): string` — Sprint ozeti
- `formatCIStatusLine(baseline?, report?): string | null` — Tek satirlik CI durumu
- `formatCIHealthSection(reports: CIReport[], baseline?): string[]` — CI sagligi bolumu
- `formatElapsed(ms: number): string` — Insan-okunur sure formatlama
- `estimateRemaining(done, total, elapsedMs, taskCompletionTimesMs?): string | null` — ETA tahmini
- `findIssues(tasks: Task[], agents: AgentInfo[]): string[]` — Sorunlu task/agent tespiti
- `formatStandaloneStatus(tasks: Task[], sprintId?): string` — Dashboard-siz durum
- `formatHumanStatus(input: HumanStatusInput): string` — Tam insan-dostu durum
- `formatAgentLabel(assignedAgent?: string): string` — Agent etiketi renklendirme
- `formatSkillsLabel(assignedSkills?: string[]): string` — Skills etiketi renklendirme
- Interface: `CIBaseline`, `CIReport`, `HumanStatusInput`
- JSDoc: Kritik fonksiyonlarda mevcut. `formatTable`, `padRight`, `padRightAnsi` gibi yardimci fonksiyonlarda EKSIK.

## 3. Ic Bagimliliklar
- `../../core/types.js` → `DashboardState`, `DoctorResult`, `Sprint`, `AgentInfo`, `Task`, `TaskResult`, `AgentStatus`, `SprintPhase`
- `../../orchestra/sprint-reporter.js` → `formatHumanSprintComplete`
- `../../core/memory-store.js` → `MemoryStore`
- `../../core/constants.js` → `BRAIN_DIR`, `MEMORY_DB_FILE`
- **ADR-008 Uyumu:** output.ts orchestra/sprint-reporter'dan import ediyor. Bu CLI helper → orchestra import'u kabul edilebilir (brain import degil) fakat orchestration katmanina bagimlilik yaratir.
- Dongusel bagimlilik riski: YOK. output.ts leaf module.

## 4. Dis Bagimliliklar
- `node:fs` (existsSync) — ADR-010 uyumlu (native module)
- `node:path` (join) — ADR-010 uyumlu
- Runtime dep: `better-sqlite3` (MemoryStore uzerinden dolayli) — ADR-010 uyumlu (tek runtime dep)

## 5. Complexity
- 24 export + 6 private fonksiyon = 30 fonksiyon
- En karmasik: `formatHumanStatus` (satir 479-647, ~168 satir, cyclomatic ~15) — cok fazla dallanma, >15 if blogu
- `redactSensitive` (satir 73-97) — 5 regex pattern, linear complexity

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: satir 206 `(a as AgentInfo & { assignedSkills?: string[] })` — tip genisletme, guvenli ama tip taniminda eksiklik isareti
- **IHLAL YOK** — tip guvenligi MÜKEMMEL

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Kullanmiyor — UYUMLU
- **ADR-008 (brain import):** orchestra/sprint-reporter import — CLI'dan orchestra import kabul edilir, brain degil
- **ADR-010 (tek runtime dep):** commander.js degil, ama better-sqlite3 dolayli — UYUMLU
- **ADR-022 (CLI/MCP parity):** Bu dosya CLI-only formatter — MCP karsılıgı gereksiz (cikti formatlama)
- **ADR-033 (product vision):** Telemetry yok — UYUMLU
- **ADR-037 (RBAC):** N/A (cikti formatlama)
- **Memory V2 DB-first:** `getMemoryEntryCount` satir 10-18 tamamen DB-first. `MemoryStore.totalCount()` kullanıyor. Legacy `countBrainLines` YOK. **MÜKEMMEL**

## 8. Test Coverage
- **Ana test:** `tests/cli/helpers/output.test.ts` — MEVCUT
- **Ek testler:** `output-status-overhaul.test.ts`, `output-skills.test.ts`, `output-mode.test.ts` — kapsamli
- Mock kalitesi: MemoryStore mock dogru olarak DB-first yapiyi mockluyor mu kontrol gerekli
- `getMemoryEntryCount` private fonksiyon — dogrudan test edilemiyor, `formatHumanStatus` uzerinden dolayı test
- `redactSensitive` coverage: buyuk ihtimalle test var (output.test.ts icinde)
- Edge case: `formatElapsed(-1)` → "0 sec" — iyi handle

## 9. TODO/FIXME/HACK Inventory
- **HIC YOK** — temiz kod

## 10. Dead Code
- `padRight` (satir 135) — sadece `formatDashboard` ve `formatDoctorResult` tarafindan kullaniliyor, aktif
- `visibleLength` (satir 140) — `padRightAnsi` tarafindan kullaniliyor, aktif
- `taskStatusIcon` (satir 384) — `formatHumanStatus` tarafindan kullaniliyor, aktif
- `describeTaskAction` (satir 400) — `formatHumanStatus` tarafindan kullaniliyor, aktif
- `truncate` (satir 445) — birden fazla yerde kullaniliyor, aktif
- **DEAD CODE YOK**

## 11. Security
- `redactSensitive` (satir 73-97) — credential redaction MEVCUT ve kapsamli:
  - sk-... API key pattern ✓
  - Bearer token ✓
  - URL password ✓
  - Env var assignment ✓
- **UYARI:** `GOOGLE_API_KEY` pattern'da `gi` flag var ama `GOOGLE_API_KEY` explicitly listede YOK (satir 92). Sadece genel `API_KEY` pattern ile yakalaniyor — kabul edilebilir.
- **MemoryStore** `getMemoryEntryCount`'ta aciliyor ve finally ile kapatiliyor — kaynak sizintisi YOK
- Process.env dogrudan okunuyor — injection riski YOK (okuma)
- SQL injection: N/A (MemoryStore.totalCount parametresiz)

## 12. Memory V2 Uyumu
- `getMemoryEntryCount` (satir 10-18): **TAMAMEN DB-FIRST**
  - `MemoryStore(dbPath)` ile acilir
  - `store.totalCount()` cagirilir
  - `finally { store.close(); }` ile kapatilir
  - Eski `.md` parse SIFIR
- Eski `countBrainLines` referansi: Sadece JSDoc yorumunda "replaces legacy countBrainLines" — **UYUMLU**
- readFileSync + DECISIONS/MEMORY/DEBT parse: **SIFIR** — tamamen temiz

## 13. i18n
- `formatHumanStatus` icindeki tum stringler INGILIZCE hardcoded: "What's happening:", "Progress:", "Active:", "Time:", "Issues:", "Alerts", "Budget:", "Warning:", "Blocked:", "Next:", "Agent/Skill Assignments:"
- `formatDashboard` icindeki "DECKENT ORCHESTRA" hardcoded
- `formatDoctorResult` icindeki "Result:" hardcoded
- `formatElapsed` ciktilari ("sec", "min", "hr") hardcoded Ingilizce
- **i18n DURUMU:** Bu modül tamamen Ingilizce — messages.ts i18n sistemi KULLANILMIYOR
- **P2 SORUN:** CLI ciktilari i18n desteksiz. Dashboard TR kullanicilari icin sorun olmaz ama CLI TR deneyimi eksik.

## 14. Dokumantasyon Tutarliligi
- JSDoc: Kritik fonksiyonlarda (`formatElapsed`, `estimateRemaining`, `formatHumanStatus`, `redactSensitive`, `isNoColor`) mevcut
- `getMemoryEntryCount` JSDoc: "DB-first memory entry count — replaces legacy countBrainLines" — dogru
- `CIBaseline` ve `CIReport` interfaceleri JSDoc EKSIK
- `HumanStatusInput` fieldalrinda JSDoc EKSIK
- Dosya-level JSDoc/modul aciklamasi: EKSIK

## 15. Performance
- Sync I/O: `existsSync` (1 cagri, satir 12) — `getMemoryEntryCount` icinde, yalnizca `formatHumanStatus`'tan cagirilir
- `new MemoryStore(dbPath)` + `store.totalCount()` + `store.close()` — her status cagrisi icin DB acilip kapatiliyor
  - **P2 PERFORMANS:** Status --watch modunda her 30 saniyede bir DB aç/kapat dongüsü. Connection pooling veya cache dusunulebilir.
- `isNoColor()` her `color()` cagrisinda process.env okuyor — minimal maliyet ama hot path'te sik cagirilir
- String concatenation ile satir olusturma — `lines.push()` + `join('\n')` pattern'i verimli

## 16. Oneriler
- **P2:** `formatHumanStatus` 168 satirlik god function — alt fonksiyonlara parcalanabilir (header/progress/time/tasks/issues/alerts/budget/stale/blocked/next/verbose)
- **P2:** `getMemoryEntryCount` her cagrisinde yeni MemoryStore aciyor — status --watch icin connection reuse dusunulebilir
- **P2:** i18n: Tum hardcoded Ingilizce stringler messages.ts'e tasinabilir
- **P3:** `CIBaseline` ve `CIReport` icin JSDoc eklenmesi
- **P3:** `(a as AgentInfo & { assignedSkills?: string[] })` cast'i → AgentInfo type'ina `assignedSkills` eklenmeli

## Verdict: ANALYZED
