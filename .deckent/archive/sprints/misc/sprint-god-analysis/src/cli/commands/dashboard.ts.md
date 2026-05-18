# Analysis: src/cli/commands/dashboard.ts
**Task ID:** 142-019 | **Model:** opus | **LoC:** 213 | **Effort:** max

## 1. Amaci
Terminal tabanli canli dashboard CLI komutunu saglar. `deckent dashboard` ile .dashboard JSON dosyasini okuyarak terminalde unicode box-drawing karakterleri ile sprint durumunu, worker tablosunu, ilerleme cubugunu ve alert listesini gosterir. fs.watch ile anlik guncelleme, fallback olarak setInterval polling destegi. `--json` ile ham JSON ciktisi, `--no-color` ile ANSI renk devre disi birakma. Auditor'un yazidigi `.dashboard` dosyasini tuketir.

## 2. Public API
- `isNoColor(flagValue?: boolean): boolean` — NO_COLOR env var veya flag kontrolu
- `renderDashboard(state: DashboardState, noColor?: boolean): string` — Dashboard string render
- `readDashboardFile(dashPath: string): DashboardState | null` — Dashboard JSON okuma
- `registerDashboard(program: Command): void` — Commander'a dashboard komutunu kayit et
- JSDoc: KISMI. `getTerminalWidth`, `isNoColor`, `formatElapsed` icin inline JSDoc var. `renderDashboard` icin JSDoc EKSIK.

## 3. Ic Bagimliliklar
- `../../core/types.js` — DashboardState type
- `../../core/constants.js` — DASHBOARD_FILE
- `../helpers/process.js` — resolveProjectRoot
- Dongusel bagimllik riski: YOK.

## 4. Dis Bagimliliklar
- `node:fs` — readFileSync, existsSync, watch (fsWatch)
- `node:path` — join
- `commander` — type import
- ADR-010 uyumu: UYUMLU.

## 5. Complexity
- Fonksiyon sayisi: 7 (4 exported, 3 private)
- En karmasik fonksiyon: `renderDashboard` (satir 39-133) — 95 satir, sprint header + worker table + progress bar + alerts + no-color stripping. Karmasik string building.
- Max cyclomatic complexity (rough): ~6 (renderDashboard icindeki kosullu render + worker map + alert map)
- Genel karmasiklik: ORTA. renderDashboard uzun ama lineer logic.

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: `JSON.parse(...) as DashboardState` (satir 138) — catch icinde, null doner. UYGUN.
- `process.stdout.columns ?? 80` (satir 30): Nullable property, nullish coalescing ile handle. UYGUN.
- Genel: IYI.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — spawnSync kullanilmiyor.
- **ADR-008 (brain import):** Uyumlu.
- **ADR-010 (deps):** Uyumlu.
- **ADR-022 (CLI/MCP parity):** UYUMLU — `deckent_status` MCP tool ve `deckent://dashboard` resource mevcut.
- **ADR-021 (Kraken ASCII):** N/A — dashboard render, ASCII brand degil.
- **ADR-033 (product vision):** Uyumlu — kullanici odakli terminal UX.

## 8. Test Coverage
- `tests/cli/commands/dashboard-overhaul.test.ts` — MEVCUT
- Dogrudan `dashboard.test.ts` YOK ama overhaul versiyonu mevcut.
- Test eslesmesi: KISMI — overhaul test mevcut. `renderDashboard`, `isNoColor`, `readDashboardFile` muhtemelen test edilmis.

## 9. TODO/FIXME/HACK inventory
Hicbir TODO, FIXME, HACK veya XXX isareti yok.

## 10. Dead Code
- `padRight` (satir 14): Kullaniliyor (renderDashboard icinde). AKTIF.
- `formatElapsed` (satir 18): Kullaniliyor (worker rows). AKTIF.
- `getTerminalWidth` (satir 29): Kullaniliyor. AKTIF.
- Dead code: YOK.

## 11. Security
- JSON.parse: try/catch icinde, null doner. GUVENLI.
- `fs.watch`: Event-based, guvenlik riski yok. `_eventType` ve `filename` callback'leri yalnizca dosya karsilastirma icin.
- `process.stdout.write('\x1Bc')` (satir 170): Terminal clear escape sequence — potansiyel terminal injection degil cunku kaynak JSON dosyasi Auditor tarafindan yaziliyor.
- Alert mesajlari: `state.alerts` icerigini dogrudan render ediyor (satir 91-93). Eger `.dashboard` dosyasi manipule edilirse terminal injection mumkun ama yerel dosya — risk cok dusuk.

## 12. Memory V2 Uyumu
- N/A — Dashboard `.dashboard` JSON dosyasini tuketiyor, Memory V2 ile etkilesmiyor.

## 13. i18n
- "No active sprint. Run deckent start first." (satir 159, 172) — HARDCODED INGILIZCE.
- Dashboard icerigi (header, label'lar): "DECKENT DASHBOARD", "Sprint:", "Phase:", "Status:", "Alerts:", "No alerts." — HARDCODED.
- Worker tablo basliklari: "ID", "Task", "Status", "Elapsed", "Agent", "Skill" — HARDCODED.
- `getMessage()` KULLANILMIYOR.
- i18n gap: BUYUK — tum dashboard label'lari ve mesajlari lokalize edilmemis.

## 14. Dokumantasyon Tutarliligi
- A/B/C/D prefix etiketleri (satirlar 157, 180, 119, 53) — sprint task referanslari.
- `DashboardState` type ↔ renderDashboard field kullanimi: sprint.id, sprint.number, sprint.phase, sprint.status, agents[], progress.done/total/active/blocked, alerts[], updatedAt — UYUMLU.
- Progress bar: `#` done, `+` active, `.` pending — okunabilir ASCII pattern.

## 15. Performance
- Sync I/O sayisi: readFileSync x1, existsSync x1 = **2 sync I/O** (render cycle'da)
- `fs.watch` event-driven, polling fallback 2s. UYGUN.
- `renderDashboard`: String concatenation O(workers + alerts). Tipik boyutta (5-10 worker, 3-5 alert) hizli.
- Terminal clear + full re-render her cycle'da — flicker olabilir ama terminal dashboard icin standart pattern.
- Hot path mi? EVET (render loop) — ama I/O minimal oldugu icin performans sorunu yok.

## 16. Oneriler
- **P2:** fs.watch directory watch'u `join(root, '.')` olarak yapiyor (satir 187) — bu tum root dizini izliyor. Sadece `.dashboard` dosyasini izlemek daha verimli olur: `fsWatch(dashPath, ...)`.
- **P2:** Dashboard label'larini i18n icin getMessage'a tasi.
- **P2:** `renderDashboard` 95 satirlik fonksiyon — `renderHeader`, `renderWorkerTable`, `renderProgress`, `renderAlerts` olarak extract et.
- **P3:** A/B/C/D prefix yorumlarini kaldir veya standart JSDoc'a donustur.
- **P3:** `--interval` flag NaN kontrolu ekle.

## Verdict: ANALYZED
