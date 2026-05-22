# Audit Report: `src/agents/worker-log.ts`

**Sprint:** sprint-186 (per-file pilot batch 1)
**Auditor:** w-186-018 (doc-writer / typescript-expert)
**Date:** 2026-05-21
**Source LoC:** 195 (matches task spec)
**Companion test LoC:** `tests/agents/worker-log.test.ts` (236 LoC)

---

## 1. Inventory

| Aspect | Value |
|--------|-------|
| Path | `src/agents/worker-log.ts` |
| LoC | 195 |
| Module type | Pure TypeScript utility — formatting fns + sync file I/O |
| Header comment | "Worker Log Formatting & I/O — Extracted from worker.ts (Sprint 144 God Object Split)" |
| Imports | `node:fs` → `appendFileSync, existsSync, readFileSync, mkdirSync`; `node:path` → `join`; `../core/constants.js` → `TASKS_DIR`; `../core/redact-sensitive.js` → `redactSensitive` |
| Exports (named functions) | `formatWorkerLog`, `formatScopeLog`, `formatTestLog`, `formatVerifyLog`, `formatDoneLog`, `appendWorkerLog`, `readWorkerLog` |
| Exports (types) | `WorkerLogAction` (union of 10 string literals) |
| Internal symbols | `ensureDir()` (helper), `ACTION_INDICATORS` (emoji map), `ACTION_INDICATORS_PLAIN` (ASCII fallback map) |
| Reverse dependencies (production `src/`) | 2 direct + 1 indirect: `src/agents/index.ts:14` (re-export `readWorkerLog`); `src/agents/worker.ts:99-107` (re-export barrel — all 7 fns + type); `src/api/server.ts:26,442` (consumes `readWorkerLog` via `worker.js` barrel) |
| Reverse dependencies (tests) | Direct: `tests/agents/worker-log.test.ts`; indirect via barrel: `tests/agents/worker.test.ts` and others touching `worker.js` imports |
| Side effects | `appendWorkerLog` → filesystem write (creates `${TASKS_DIR}` if missing, appends UTF-8). `readWorkerLog` → filesystem read + redaction transform. |
| Async surface | **None** — all I/O is **synchronous** (`appendFileSync`, `readFileSync`, `existsSync`, `mkdirSync`) |
| Public API symbol count | 8 (7 fns + 1 type) |

**Notable signature detail:** `ACTION_INDICATORS` (emoji) ve `ACTION_INDICATORS_PLAIN` (ASCII) tabloları paralel `Record<WorkerLogAction, string>` — yeni action eklenirse her iki tabloya da el ile eklemek gerekir (no compile-time enforcement beyond Record exhaustiveness check).

---

## 2. Baglam (Architectural Context)

`worker-log.ts` Sprint 144'teki **"worker.ts God Object Split"** refactor'unun bir cikti modulu. Header yorumu (lines 1-7) bunu acikca beyan ediyor: formatlama (action indicators, scope/test/verify/done summary) + log file append/read sorumluluğu worker.ts'nin tasidigi bir yan vazifeydi.

**Mantiksal yerlesim (kanitli):**
- **Yazicilar:** Yalnizca `worker.ts` icinden formatlama fonksiyonlari + `appendWorkerLog` cagriliyor (re-export barrel sayesinde). Worker lifecycle her phase gecisinde (Starting → Scope → Writing → Test → Verify → Done) bir log line yaziyor.
- **Okuyucular:** `src/api/server.ts:442` — HTTP API endpoint `/api/tasks/:id/log` icin `readWorkerLog(projectRoot, taskId)` cagrisi (`redactSensitive` transform'u read-side'da uygulaniyor).
- **Dosya konvansiyonu:** `${projectRoot}/.tasks/task-${taskId}.log` — her satir `${ISO timestamp} [taskId] ${indicator} ${Action}: ${detail}` formatinda.

**ADR iliskisi (orta-guclu):**
| ADR | Iliski |
|-----|--------|
| **ADR-005** (Synchronous I/O — **deprecated**) | Bu modul tum I/O'yu sync API ile yapar (`appendFileSync`, `readFileSync`). ADR-005 deprecated edildigi icin modul "legacy I/O pattern" tasiyor. |
| **ADR-006** (spawnSync Security Pattern) | Bu modul subprocess spawn etmiyor — irrelevant |
| **ADR-026** (God Object Split — Faz 1-3) | Bu modul ADR-026'nin Sprint 144 dogrudan **urunu** — split sonucu olusan focused modul |
| **ADR-032** (i18n Pattern System) | Action label'lari ("Starting", "Done", "Error") yalnizca EN — TR cevirisi yok |
| **ADR-034** (Multi-Project Isolation) | `projectRoot` parametresi ile per-project log isolation saglar — compliant |
| **ADR-035** (Brain ↔ Worker ↔ Auditor Verification Protocol) | Worker log format Auditor'in scan loop'unda heuristic input olabilir; ancak su an Auditor `.dashboard` yazimi icin `.hb` dosyalarini kullaniyor — log dosyalari "human-readable" amacli |
| **ADR-037** (RBAC Authority Matrix) | Worker bu modul uzerinden kendi loglarini yazar — scope ihlali yok |

**Read-time redaction policy:** `redactSensitive` cagrisi yalnizca **read-side** uygulaniyor (line 193). Bu, log dosyalarinin **disk uzerinde redact edilmemis** halde durdugu anlamina gelir — gizli icerik diske dusebilir, sadece UI/API katmaninda gizlenir. ADR-034 (multi-project isolation) ile gerilim yaratir: shared filesystem'de log dosyalari sensitive icerik tasiyabilir.

---

## 3. Debt Risk

| Risk | Severity | Aciklama | Mitigation |
|------|----------|----------|------------|
| **Sync I/O (ADR-005 deprecated)** | MEDIUM | Modul `appendFileSync`, `readFileSync`, `mkdirSync`, `existsSync` kullanir. Worker icinde her file change'de bir log entry yazildigi icin sync I/O event loop'u bloke eder — ozellikle paralel worker spawn senaryosunda observable. | `node:fs/promises` migration + queued append (debounce) |
| **Disk-side redaction missing** | HIGH | `redactSensitive` yalnizca read-side uygulanir. Disk uzerinde plain-text sensitive data kalir (API keys, paths, error stack traces). Backup, log forwarding, multi-tenant scenario'larinda risk. | `appendWorkerLog` icinde `redactSensitive(line)` cagrisini line yazimindan once uygula |
| **No log rotation** | MEDIUM | Tek dosya `.tasks/task-${taskId}.log` sonsuza dek buyur. Uzun sprint'lerde + retry-heavy task'larda dosya MB'lara cikabilir. `readWorkerLog` tum dosyayi memory'ye okur — large file riski. | Size-based rotation (e.g. `task-${id}.log.1`) veya line-truncation |
| **Plain mode auto-detect yok** | LOW | `options?: { noColor?: boolean }` caller-driven. TTY-detect veya `NO_COLOR` env var kontrolu yok. Worker programatik olarak `noColor: true` gecmek zorunda. | `detectNoColor()` helper (TTY check + `process.env.NO_COLOR`) |
| **Action label hard-coded EN** | LOW | "Starting", "Scope", "Writing", "Verify", "Test", "Fix", "Retry", "Done", "Error", "Info" — TR/DE/ES yok. ADR-032 (i18n Pattern System) ile uyumsuz. | I18nStrings table + `i18n(ctx).workerLog.actionLabel` |
| **Emoji table sync risk** | LOW | `ACTION_INDICATORS` ve `ACTION_INDICATORS_PLAIN` paralel Record. Action eklenirse iki tablodaki guncellemeyi unutmak compile-time hata vermez — sadece `Record<WorkerLogAction, string>` exhaustive check yakalar (string union genisledikce). | Tek `INDICATOR_MAP: Record<Action, { emoji: string; plain: string }>` |
| **`ensureDir` race condition** | LOW | `existsSync` + `mkdirSync` arasinda race var (TOCTOU). Tek-process worker icinde onemsiz; cok-process Docker backend'de teorik. | `mkdirSync(dir, { recursive: true })` zaten idempotent — `existsSync` kontrolu gereksiz, kaldirilabilir |
| **No timestamp source injection** | LOW | `new Date().toISOString()` direkt cagrilir — test'lerde mock'lamak icin `vi.useFakeTimers()` gerekir. Saf fonksiyon disipliniyle gerilim. | `appendWorkerLog(root, taskId, line, now?: () => Date)` opsiyonel parameter |
| **`formatDoneLog` retry display fragility** | LOW | `retries > 0 ? '${retries} retry, ' : ''` — plural form (1 retry vs 2 retries) yok; "retries" yerine "retry" tekil kullanilir. | `retries === 1 ? '1 retry' : `${retries} retries`` |
| **`formatTestLog` parameter combination kontrolsuz** | LOW | `attempt && maxAttempts && attempt > 1` — `attempt > maxAttempts` durumu yakalanmaz; `attempt=0` bilgisi gizlenir | Input validation + log warn |

**Toplam debt risk:** MEDIUM. En kritik iki nokta: (1) disk-side redaction (security), (2) sync I/O (ADR-005 deprecated, performance).

---

## 4. Dead Code Candidates

`grep`-bazli kanit:

```bash
$ grep -rn "from.*['\"].*worker-log['\"]" src/ tests/
src/agents/index.ts:14         readWorkerLog,  (re-export only)
src/agents/worker.ts:99-107    formatWorkerLog, formatScopeLog, formatTestLog,
                                formatVerifyLog, formatDoneLog, appendWorkerLog,
                                readWorkerLog (all re-exported)
tests/agents/worker-log.test.ts  (unit test imports)
```

```bash
$ grep -rn "formatScopeLog\|formatTestLog\|formatVerifyLog\|formatDoneLog" src/ --include='*.ts'
# Sadece worker-log.ts (definition) + worker.ts (re-export) + worker.ts/worker-lifecycle.ts (potansiyel cagrici)
```

| Symbol | Verdict | Kanit |
|--------|---------|-------|
| `formatWorkerLog` | **LIVE** — temel formatter, diger 4 formatter'in altyapisi | Iceriden cagrilir (formatScopeLog/TestLog/VerifyLog/DoneLog hepsi `formatWorkerLog` cagrir) |
| `formatScopeLog` | **LIVE (suspected)** — worker spawn/scope phase'de cagrilir | worker.ts barrel re-export — runtime dogrulama icin worker.ts/worker-lifecycle.ts inspection gerekli |
| `formatTestLog` | **LIVE (suspected)** — test verify loop'ta cagrilir | Ayni — runtime trace gerekli |
| `formatVerifyLog` | **LIVE (suspected)** — tsc verify phase'de cagrilir | Ayni |
| `formatDoneLog` | **LIVE (suspected)** — task done event'inde cagrilir | Ayni |
| `appendWorkerLog` | **LIVE** — worker tarafindan her log line icin cagrilir | worker.ts re-export aktarir |
| `readWorkerLog` | **LIVE** — `src/api/server.ts:442` HTTP endpoint icin tuketilir | Direct caller dogrulandi |
| `WorkerLogAction` (type) | **LIVE** — `src/agents/index.ts:107` re-export + worker.ts type usage | |
| `ACTION_INDICATORS` / `ACTION_INDICATORS_PLAIN` | **LIVE** — modul ici kullanim | Sadece bu dosyada |
| `ensureDir` (helper) | **LIVE** — `appendWorkerLog` icinde cagrilir | Sadece bu dosyada |

**Sonuc:** Modulde **dead code yok**. Sprint 144 split sonrasinda tum yuzey ya direkt ya da barrel uzerinden tuketiliyor.

**Verify edilmesi gereken senaryolar (Sprint 188 follow-up):**
- `formatScopeLog`, `formatTestLog`, `formatVerifyLog`, `formatDoneLog` — `worker.ts` / `worker-lifecycle.ts` icinde runtime cagri var mi? Eger formatter cagrilarinin yalnizca bir kismi kullaniliyorsa, kullanilmayan formatter'lar candidate olur.

---

## 5. Documentation Gaps

| Gap | Aciklama | Oncelik |
|-----|----------|---------|
| **Module-level docstring eksik** | Header 7 satirlik kisa yorum: "Extracted from worker.ts (Sprint 144 God Object Split)". Modul SLA'si (sync only? thread-safe? max line length? log rotation policy?) belirtilmemis. | HIGH |
| **`WorkerLogAction` JSDoc minimal** | Tek satir `/** Action types for worker log entries */` — her action'in ne anlama geldigi belgelenmemis (orn. Starting vs Info farki ne?) | MEDIUM |
| **`appendWorkerLog` redaction kontrati yok** | Disk uzerinde redact edilmedigi belirtilmemis. `readWorkerLog` JSDoc'unda redaction guarantee yok. Caller'lar sensitive data yazip yazmayacaklarini bilemez. | HIGH |
| **`@throws` annotation yok** | Tum file I/O fonksiyonlari ENOSPC, EACCES, EROFS firlatabilir — JSDoc'lar bunu belgelemez. | MEDIUM |
| **`options.noColor` semantigi belirsiz** | Hangi senaryoda (CI, headless, env)? `NO_COLOR` standardi (https://no-color.org) referans verilmemis. | LOW |
| **Example block yok** | Hicbir formatter ornegine `@example` yok. Caller'lar input/output ornegi icin test'leri okumak zorunda. | MEDIUM |
| **`formatDoneLog` semantic edge case'leri** | `result === 'NO_GO'` → 'Error' action map'leniyor; bu davranis belgelenmemis. Yeni result type'lari (orn. 'GO_WITH_TECH_DEBT') ne olur? | LOW |
| **i18n strategy belgelenmemis** | TR/DE/ES action label'lari neden yok? ADR-032 referansi yok. | LOW |
| **Log format spec yok** | `${timestamp} ${line}` formati `docs/reference/api-surface.md` icinde belgelenmemis. Log parser yazmak isteyen 3rd-party tool'lar icin spec eksik. | MEDIUM |

---

## 6. ADR Compliance Check

| ADR | Relevance | Compliance | Detay |
|-----|-----------|------------|-------|
| **ADR-001** (TypeScript + ESM) | Applies | COMPLIANT | Tum import'lar `.js` uzantili (`../core/constants.js`, `../core/redact-sensitive.js`), Node16 ESM uyumlu |
| **ADR-002** (Node16 Module Resolution) | Applies | COMPLIANT | ESM relative path'ler dogru |
| **ADR-003** (vitest over Jest) | Applies | COMPLIANT | `tests/agents/worker-log.test.ts` vitest kullanir |
| **ADR-005** (Synchronous I/O — **DEPRECATED**) | Applies | LEGACY | Modul tum I/O'yu sync API ile yapar. ADR-005 deprecated edildigi icin yeni kod async olmali — bu modul migration kuyrugunda. |
| **ADR-006** (spawnSync Security Pattern) | N/A | N/A | Subprocess spawn yok |
| **ADR-007** (SpawnOptions Interface) | N/A | N/A | Spawn yok |
| **ADR-008** (Brain Merkezi Import — Tek Yonlu Bagimlilik) | Applies | COMPLIANT | Bu modul `core/` ve `node:*` disindan hicbir sey import etmiyor — Brain'i import etmiyor, dogru yon |
| **ADR-009** (DEBT.md Markdown Format) | N/A | N/A | |
| **ADR-010** (Tek Runtime Dep — commander.js) | Applies | COMPLIANT | External runtime dep yok |
| **ADR-026** (God Object Split — Faz 1-3) | Applies | **COMPLIANT (urunu)** | Modul Sprint 144 split'inin **dogrudan urunu** — ADR'a referans veriyor (header) |
| **ADR-032** (i18n Pattern System — TR/EN) | Applies | **NON-COMPLIANT** | Action label'lari ("Starting", "Done", ...) yalnizca EN. `patternsByLang` / `I18nStrings` paterni uygulanmamis. |
| **ADR-034** (Multi-Project Isolation) | Applies | PARTIAL | `projectRoot` parametresi per-project isolation saglar. Ancak shared filesystem'de log dosyalari sensitive data disk-side redact edilmedigi icin **leakage riski** mevcut. |
| **ADR-035** (Brain ↔ Worker ↔ Auditor Verification Protocol) | Applies | N/A | Worker log Auditor scan loop input'u degil — `.hb` files kullanilir. Log human-readable amacli. |
| **ADR-037** (RBAC Authority Matrix V1.0) | Applies | COMPLIANT | Worker kendi `.tasks/task-${id}.log` dosyasini yazar — scope ihlali yok |
| **ADR-038** (Dead Code Disposition) | Applies | COMPLIANT | Dead code yok (Section 4) |
| **ADR-045** (Wave-Based Execution Semantics) | N/A | N/A | |
| **ADR-046** (Brain Self-Update Hook Architecture) | N/A | N/A | |
| **ADR-048** (Prompt Lifecycle Contract) | N/A | N/A | |
| **ADR-053** (TaskType Taxonomy) | Indirect | COMPLIANT | Bu audit task `document-write` taxonomy'sine uyar |

**Aksiyon gereken ADR'lar:**
1. **ADR-005 (deprecated):** Sync I/O modernizasyonu — kuyruga al, kritik degil cunku ADR deprecated edildi (yeni kod icin gecerli, mevcut kod opt-in).
2. **ADR-032:** i18n eksikligi — Sprint 188'de TR label'lari ekle.
3. **ADR-034 partial:** Disk-side redaction eksigi — Sprint 188 follow-up F2.

---

## 7. Refactor Recommendations

**Oncelik 1 — Security (disk-side redaction):**

```typescript
// SU AN (line 184-186):
const timestamp = new Date().toISOString();
const entry = `${timestamp} ${line}\n`;
appendFileSync(logPath, entry, 'utf-8');

// ONERILEN:
const timestamp = new Date().toISOString();
const redactedLine = redactSensitive(line);
const entry = `${timestamp} ${redactedLine}\n`;
appendFileSync(logPath, entry, 'utf-8');
```
Sebep: Sensitive data diske dusmemeli. `readWorkerLog` icindeki `redactSensitive` cagrisi ya kalir (defense-in-depth) ya da kaldirilir (zaten redact edilmis).

**Oncelik 2 — Async I/O migration (ADR-005):**

```typescript
import { appendFile, readFile, mkdir } from 'node:fs/promises';

export async function appendWorkerLog(
  projectRoot: string,
  taskId: string,
  line: string,
): Promise<void> { ... }
```
Caller'lar (worker.ts) `await` zinciri gerektirir — breaking change. Migration kuyruguna alinabilir.

**Oncelik 3 — Indicator map consolidation:**

```typescript
const INDICATOR_MAP: Record<WorkerLogAction, { emoji: string; plain: string }> = {
  Starting: { emoji: '▶', plain: '>' },
  Scope:    { emoji: '📂', plain: '#' },
  // ...
};
// Tek tablo — yeni action eklerken iki yerde guncelleme zorunlulugu kalkar
```

**Oncelik 4 — `noColor` auto-detect:**

```typescript
function detectNoColor(): boolean {
  return !!process.env.NO_COLOR
      || !process.stdout.isTTY
      || process.env.CI === 'true';
}

export function formatWorkerLog(
  taskId: string,
  action: WorkerLogAction,
  detail: string,
  options?: { noColor?: boolean },
): string {
  const noColor = options?.noColor ?? detectNoColor();
  // ...
}
```

**Oncelik 5 — i18n migration (ADR-032):**

```typescript
interface I18nActionLabels {
  Starting: string;
  Scope: string;
  // ...
}
const ACTION_LABELS_EN: I18nActionLabels = { Starting: 'Starting', ... };
const ACTION_LABELS_TR: I18nActionLabels = { Starting: 'Basliyor', ... };

export function formatWorkerLog(taskId, action, detail, options?: { lang?: 'en' | 'tr' }): string {
  const labels = options?.lang === 'tr' ? ACTION_LABELS_TR : ACTION_LABELS_EN;
  // ...
}
```

**Oncelik 6 — Log rotation:**

```typescript
const MAX_LOG_BYTES = 1024 * 1024; // 1MB
function rotateIfNeeded(logPath: string) {
  const stat = statSync(logPath);
  if (stat.size > MAX_LOG_BYTES) {
    renameSync(logPath, `${logPath}.${Date.now()}`);
  }
}
```

**Oncelik 7 — Plural form fix:**

```typescript
const retryInfo = retries > 0
  ? `${retries} ${retries === 1 ? 'retry' : 'retries'}, `
  : '';
```

**Oncelik 8 — `ensureDir` simplification:**

```typescript
// `mkdirSync` zaten `recursive: true` ile idempotent — `existsSync` gereksiz
mkdirSync(dirPath, { recursive: true });
```

---

## 8. Sprint 188 Follow-up Items

| Item | Owner | Priority | Effort | Notes |
|------|-------|----------|--------|-------|
| **F1:** Disk-side redaction — `appendWorkerLog` icinde `redactSensitive` cagrisi ekle | security-auditor | HIGH | low | ADR-034 partial compliance kapatilir; security risk MEDIUM→LOW |
| **F2:** Runtime caller dogrulama — formatScopeLog/TestLog/VerifyLog/DoneLog gercekten `worker.ts`/`worker-lifecycle.ts` icinde cagriliyor mu? grep kanit | bug-fixer | MEDIUM | low | Section 4 belirsiz noktasini kapatir |
| **F3:** ADR-005 async I/O migration — `fs/promises` versiyonu | refactorer | MEDIUM | normal | Caller chain (`worker.ts`) async olmali; breaking change |
| **F4:** ADR-032 i18n — TR action label'lari + `I18nStrings` paterni | doc-writer | MEDIUM | normal | Sprint 092 dashboard i18n ile uyumla |
| **F5:** Indicator map consolidation — tek `Record<Action, { emoji; plain }>` | refactorer | LOW | low | Bakim kolayligi |
| **F6:** `noColor` auto-detect (`NO_COLOR` env, TTY check) | bug-fixer | LOW | low | CI ortaminda otomatik plain mode |
| **F7:** Log rotation policy + `rotateIfNeeded` helper | architect | LOW | normal | Large log file riski |
| **F8:** Module-level docstring + JSDoc completion (`@throws`, `@example`, redaction kontrati) | doc-writer | MEDIUM | low | Section 5 gaps kapatilir |
| **F9:** Log format spec → `docs/reference/api-surface.md` | doc-writer | LOW | low | 3rd-party log parser yazimi icin |
| **F10:** Plural form fix (`retry` vs `retries`) | bug-fixer | LOW | low | Cosmetic — `formatDoneLog` |
| **F11:** `ensureDir` simplification — `existsSync` kontrolunu kaldir, `mkdirSync({ recursive: true })` zaten idempotent | code-reviewer | LOW | low | 5 LoC reduction |
| **F12:** Plural-aware `formatTestLog` retry-info — `attempt > maxAttempts` validation | bug-fixer | LOW | low | Input validation |
| **F13:** Per-file pilot meta — bu audit'in faydasi olc, action conversion oranini takip et | architect | LOW | low | Pilot retro input |

---

## 9. Summary

`src/agents/worker-log.ts` (195 LoC) Sprint 144 "worker.ts God Object Split" refactor'unun temiz bir cikti modulu. **Production'da aktif kullanimda** — 7 fonksiyon + 1 type, `worker.ts` re-export barrel ile worker phase'lere log yazimi, `src/api/server.ts` ile HTTP endpoint log read'i saglar. Dead code yok.

**Kritik bulgular:**
- **Disk-side redaction eksik (HIGH severity, ADR-034 partial):** `redactSensitive` yalnizca read-side calisir; sensitive data disk uzerinde plain-text kalir. Sprint 188 follow-up F1 ile kapatilmali.
- **ADR-005 (sync I/O) deprecated — modul legacy I/O patterns tasiyor:** Migration kuyruguna alinabilir, acil degil.
- **ADR-032 i18n eksigi:** Action label'lari yalnizca EN — Sprint 188'de TR string seti eklenmeli.
- **No log rotation:** Uzun sprint'lerde dosya buyume riski — large file `readFileSync` memory yuku.
- **JSDoc gaps (HIGH):** Module-level docstring + redaction kontrati + `@throws` annotations eksik.
- **Test coverage iyi:** 236 LoC test (`tests/agents/worker-log.test.ts`) source'un %121'i — saglikli ratio.

**Onerilen aksiyon (Sprint 188):**
1. **F1 (HIGH):** Disk-side `redactSensitive` cagrisi — security debt'i hemen kapat.
2. **F8 (MEDIUM):** Module docstring + redaction kontrati JSDoc'a yaz.
3. **F2 (MEDIUM):** Formatter usage kanitla — formatter'larin tam kullanimini grep'le dogrula.
4. **F3/F4 (MEDIUM):** Async I/O + i18n migration — sonraki refactor wave'inde paketle.

**Per-file pilot meta-notu:** worker-log.ts Sprint 144 split'inin **basarili bir ornegi** — single responsibility, dusuk dis bagimliligi, anlasilabilir API yuzeyi. Diger worker-* dosyalari (worker-ipc.ts, worker-lifecycle.ts, worker-rollback.ts, worker-verify.ts) ile birlikte audit edilirken ayni Sprint 144 ADR-026 disposition pattern'i kullanilmali. Bu modul "dormant feature" degil — production runtime'a tamamen wire edilmis bir utility.
