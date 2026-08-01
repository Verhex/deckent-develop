# Sprint 160 Security Review — 3/3 Madde

**Sprint:** 163  
**Tarih:** 2026-05-12  
**Reviewer:** Worker 163-005 (security-auditor agent)  
**Kapsam:** SR-1 · SR-2 · SR-3  
**Referans sprint:** Sprint 160 plan (Brain stability hattı)

---

## Özet

| # | Madde | Verdict |
|---|-------|---------|
| SR-1 | `redactSensitive` — exception handler data leak risk | **YELLOW** |
| SR-2 | `acquireSingletonLock` — double-MCP O_EXCL race condition | **GREEN** |
| SR-3 | `restoreSprintFromCheckpoint` — checkpoint trust boundary | **YELLOW** |

---

## SR-1: Exception Handler Data Leak Risk — `redactSensitive`

### Code path

İki bağımsız `redactSensitive` implementasyonu var; **sprint runner crash handler** `sensitive-redactor.ts`'yi kullanır, **worker log sistemi** `core/redact-sensitive.ts`'yi kullanır:

```
src/orchestra/sensitive-redactor.ts          → sprint-runner-entry.ts:12 (crash handler)
src/core/redact-sensitive.ts                 → agents/worker-log.ts:11  (worker logger)
src/cli/helpers/output.ts                    → CLI print helpers (ayrı string tabanlı)
```

Kanıt:

```bash
# Crash handler — sensitive-redactor.ts kullanıyor
grep -n "import.*redactSensitive" src/orchestra/sprint-runner-entry.ts
# → 12: import { redactSensitive } from './sensitive-redactor.js';

# Worker log — core/redact-sensitive.ts kullanıyor
grep -n "import.*redactSensitive" src/agents/worker-log.ts
# → 11: import { redactSensitive } from '../core/redact-sensitive.js';
```

### Saldırı yüzeyi

- **process.env**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` — provider bootstrap sırasında environment'tan okunur
- **exception message / stack trace**: Provider API çağrılarında 4xx/5xx yanıtları içinde token sızabilir
- **IPC error.json**: `installCrashHandlers` ile yakalanan `uncaughtException`/`unhandledRejection` mesajları `error.json`'a yazılır

### Mevcut savunma

**`sensitive-redactor.ts`** (crash handler yolu) — kapsamlı:

```typescript
{ regex: /(GITHUB|OPENAI|ANTHROPIC|GOOGLE)_(TOKEN|API_KEY|KEY)\s*[=:]\s*\S+/g, ... }
{ regex: /api[_-]?key\s*[=:]\s*[^\s,;)'"]+/gi, ... }
{ regex: /Authorization:\s*Bearer\s+[A-Za-z0-9._\-]+/g, ... }
{ regex: /Bearer\s+[A-Za-z0-9._\-]{10,}/g, ... }
{ regex: /(token|secret|password|passwd)\s*[=:]\s*[^\s,;)'"]+/gi, ... }
{ regex: /(sk|pk)-[A-Za-z0-9]{16,}/g, ... }
// Ayrıca: redactLongContent (>100 char değerler)
```

**`core/redact-sensitive.ts`** (worker log yolu) — daha sınırlı:

```typescript
/\b(sk-[a-zA-Z0-9_-]{20,})\b/g              // sk- prefix, 20+ char
/\b(key-[a-zA-Z0-9_-]{20,})\b/g             // key- prefix
/(Bearer\s+)[^\s"',;]+/gi                    // Bearer tokens
/(:\/\/[^:/?#\s]+:)[^@\s]+(@)/g             // URL passwords
/(OPENAI_API_KEY|ANTHROPIC_API_KEY|...)=.../gi  // Bilinen env var'lar
```

### Gap Analizi

| Pattern | sensitive-redactor.ts | core/redact-sensitive.ts |
|---------|----------------------|--------------------------|
| GITHUB_TOKEN | ✅ | ❌ |
| GOOGLE_API_KEY | ✅ | ❌ |
| GEMINI_API_KEY | ❌ | ❌ |
| token=..., secret=... | ✅ | ❌ |
| JWT (eyJ...) | ❌ | ❌ |
| sk-/pk- (16+ char) | ✅ | ✅ (20+ char threshold) |

**Kritik gap — GEMINI_API_KEY:** Deckent üçüncü provider olarak Gemini'yi destekliyor (`src/providers/gemini.ts`). `GEMINI_API_KEY` ne `sensitive-redactor.ts`'in `(GITHUB|OPENAI|ANTHROPIC|GOOGLE)_` regex'ine ne de `core/redact-sensitive.ts`'in env var listesine giriyor. `GEMINI` grubunun `GOOGLE_` prefix'i altında listelenmesi bu provider key'ini açıkta bırakıyor.

**İkincil gap — Divergent implementations:** Worker logger (`core/redact-sensitive.ts`) crash handler'dan farklı ve daha zayıf. Crash log'ları korunurken worker debug log'ları (`debugLog` çıktıları) key'leri açıkta bırakabilir.

### Verdict: **YELLOW** (minor concerns)

Crash handler yolu (en kritik path) `sensitive-redactor.ts` ile korumalı. Worker log yolu daha zayıf ama debug-only. Yine de `GEMINI_API_KEY` her iki implementasyonda eksik.

### Öneri (Sprint 164 task)

```
Task: SR-1 Remediation — redactSensitive Coverage
Files: src/orchestra/sensitive-redactor.ts, src/core/redact-sensitive.ts
1. sensitive-redactor.ts: GEMINI ve GEMINI_API_KEY grubunu GOOGLE regex'e ekle
   { regex: /(GITHUB|OPENAI|ANTHROPIC|GOOGLE|GEMINI)_(TOKEN|API_KEY|KEY)/, ... }
2. core/redact-sensitive.ts: GOOGLE_API_KEY, GITHUB_TOKEN, GEMINI_API_KEY'i env var listesine ekle
3. İkisini de JWT pattern ile güçlendir: /eyJ[A-Za-z0-9._-]{20,}\.[A-Za-z0-9._-]+/g
4. Test: her provider key tipi için redaction coverage testi
```

---

## SR-2: Double-MCP O_EXCL Race Condition — `acquireSingletonLock`

### Code path

```
src/mcp/server-singleton-lock.ts   → acquireSingletonLock(), releaseSingletonLock()
src/mcp/server.ts:164              → bootSingletonGuard() içinde acquireSingletonLock çağrısı
```

Kanıt:

```bash
grep -n "acquireSingletonLock" src/mcp/server.ts
# → 16: acquireSingletonLock,
# → 164:     const handle = acquireSingletonLock(lockPath);

grep -n "openSync.*wx\|O_EXCL" src/mcp/server-singleton-lock.ts
# → 58:   const fd = openSync(path, 'wx');
```

### Saldırı yüzeyi

- **lock file path** (`lockPath`): `join(projectRoot, DECKENT_DIR, MCP_SERVER_PID_FILE)` — `projectRoot` kullanıcı kontrolünde
- **PID file content**: `readFileSync(path, 'utf-8').trim()` ile okunur, `parseInt` ile parse edilir
- **EEXIST steal window**: Dead process lock'u steal eden race

### Mevcut savunma

```typescript
// 1. Atomic create — O_EXCL kernel primitive
const fd = openSync(path, 'wx');  // EEXIST → zaten var

// 2. PID validation
const pid = Number.parseInt(raw, 10);
if (!Number.isFinite(pid) || pid <= 0) return null;

// 3. Liveness check
process.kill(pid, 0);  // EPERM → process alive (cross-user)

// 4. Steal race handler — ikinci O_EXCL denemesi
try {
  writePidFile(path);  // Atomic yeniden oluşturma
} catch (err) {
  if (code === 'EEXIST') {
    const racer = readOwnerPid(path);
    throw new SingletonLockError('lock race lost during steal retry', racer);
  }
}
```

### Race Senaryosu Analizi

**Senaryo 1 — Normal case:** İki process aynı anda `writePidFile()` dener; OS kernel O_EXCL ile sadece birini başarılı kılar. Kaybeden EEXIST alır → owner PID kontrolü → SingletonLockError. ✅

**Senaryo 2 — Stale lock steal:** A prosesi ölmüş, B ve C aynı anda steal dener:
1. B ve C: `unlinkSync()` → biri ENOENT alır (handled), biri başarılı
2. B ve C: `writePidFile()` (O_EXCL) → biri kazanır, biri EEXIST → steal retry SingletonLockError ✅

**Senaryo 3 — Self-lock:** `ownerPid === process.pid` → lock zaten bizim, quietly return ✅

**Senaryo 4 — EPERM liveness:** `process.kill(pid, 0)` EPERM → process başka kullanıcıya ait ama alive → doğru şekilde alive döndürür ✅

**Senaryo 5 — PID reuse (teorik):** A ölür (PID X), OS aynı PID X'i B'ye atar, C steal dener → C, B'yi "dead lock owner" sayabilir. Bu OS-level PID reuse saldırısı; pratik exploit çok güç çünkü PID reuse penceresi çok kısa ve saldırganın lock file oluşturma zamanını kontrol etmesi gerekir. Kabul edilebilir risk. ℹ️

### Verdict: **GREEN** (sound)

O_EXCL atomic primitive doğru kullanılmış. TOCTOU penceresi (unlink→write) ikinci O_EXCL ile kapatılmış. PID validation crafted content saldırısını engeller. `releaseSingletonLock` PID sahipliğini doğrulayarak stolen lock'ı silmiyor.

**Minor observation:** `.deckent/` dizini `mkdirSync({recursive: true})` ile oluşturuluyor — explicit permission yok, process umask'ı kullanıyor. Multi-user ortamda `.deckent/mcp-server.pid` world-writable olabilir.

### Öneri

Sprint'e taşıma gerekmez. Opsiyonel iyileştirme:

```
Task: İsteğe bağlı — .deckent/ dizin izinlerini 0750 olarak set et
mkdirSync(dirname(path), { recursive: true, mode: 0o750 })
```

---

## SR-3: State Recovery Integrity — `restoreSprintFromCheckpoint`

### Code path

```
src/orchestra/sprint-checkpoint.ts:554   → restoreSprintFromCheckpoint()
src/orchestra/sprint-checkpoint.ts:235   → readCheckpoint() — JSON parse + minimal validation
src/core/utils.ts:78                     → readJsonSafe() — generic JSON.parse, no schema check
```

Kanıt:

```bash
grep -n "restoreSprintFromCheckpoint\|readCheckpoint\|readJsonSafe" \
  src/orchestra/sprint-checkpoint.ts | head -20
# → 235: export function readCheckpoint(...)
# → 243:   const parsed = JSON.parse(raw) as SprintCheckpoint;
# → 244:   if (!parsed.sprintId || !parsed.checkpointNumber || !parsed.brainPhase) {
# → 554: export function restoreSprintFromCheckpoint(...)
# → 577:   const t = readJsonSafe<Task>(taskPath);
```

### Saldırı yüzeyi

- **checkpoint.json dosyası**: `.deckent/<sprintId>-checkpoint.json` — disk'teki dosya
- **`completedTasks`, `pendingTasks`, `activeWorkers[].taskId`**: Checkpoint içindeki task ID'leri
- **task JSON dosyaları**: `task-${id}.json` — task ID'leri dosya path'ine doğrudan ekleniyor

### Mevcut savunma

**JSON parse düzeyinde:**
```typescript
const parsed = JSON.parse(raw) as SprintCheckpoint;
if (!parsed.sprintId || !parsed.checkpointNumber || !parsed.brainPhase) {
  return null;
}
```
— Sadece 3 alan varlığı kontrol ediliyor; `completedTasks`/`activeWorkers` array tipi, içerik formatı doğrulanmıyor.

**Path construction:**
```typescript
const taskPath = join(projectRoot, TASKS_DIR, `task-${id}.json`);
const t = readJsonSafe<Task>(taskPath);
```
— `id` doğrudan path'e ekleniyor. `TASKS_DIR = '.tasks'` sabiti.

**Type cast:**
```typescript
return JSON.parse(raw) as SprintCheckpoint;  // readJsonSafe
return JSON.parse(raw) as Task;
```
— TypeScript `as` cast runtime'da güvensiz; `undefined`/`null` field'ları crash yerine sessiz davranış üretir.

### Güvenlik Açığı Analizi

**Finding 1 — Path traversal via task ID (MEDIUM):**

Eğer `checkpoint.json` dosyası dışarıdan manipüle edilebilirse, `activeWorkers[].taskId` alanına `../../etc/passwd` gibi path traversal payload'ı yerleştirilebilir:

```json
{
  "sprintId": "sprint-163",
  "checkpointNumber": 1,
  "brainPhase": "EVALUATE",
  "activeWorkers": [{"workerId": "w-1", "taskId": "../../etc/shadow", "status": "EXECUTING", "spawnedAt": "..."}],
  "completedTasks": [],
  "pendingTasks": [],
  "eventStreamOffset": 0
}
```

Bu durumda:
```typescript
// READ: join(projectRoot, '.tasks', 'task-../../etc/shadow.json')
//     = <root>/.tasks/task-../../etc/shadow.json
//     = /etc/shadow.json  (path resolved)
const t = readJsonSafe<Task>(taskPath);  // /etc/shadow.json okunur

// WRITE (NO_GO path):
writeFileSync(taskPath, JSON.stringify(t, null, 2), 'utf-8');  // /etc/shadow.json yazılır!
```

**Risk değerlendirmesi:** `.deckent/` dizini proje dizini içinde; normal single-user geliştirici ortamında attacker'ın bu dosyayı yazması zor. Multi-user ortam veya shared CI makinesinde risk artar (MEDIUM). Dosya **yazma** primitifi özellikle tehlikeli.

**Finding 2 — Weak structural validation (LOW):**

`readCheckpoint` yalnızca 3 field'ın truthy olduğunu kontrol ediyor. `completedTasks` array yerine string olursa `for...of` string karakterlerini iterate eder → beklenmedik davranış. `activeWorkers` null olursa `cp.activeWorkers ?? []` guard'ı korur (bu iyi), ama `activeWorkers[i].taskId` undefined olursa `task-undefined.json` path'i üretilir.

**Finding 3 — readJsonSafe no-validation cast (INFO):**

```typescript
const t = readJsonSafe<Task>(taskPath);
```
TypeScript generic cast runtime'da hiçbir şey yapmaz. Dönülen obje Task arayüzüne uymayabilir; downstream `t.status = TaskStatus.NO_GO` satırı crash olmaz ama `writeFileSync` bozuk JSON yazabilir.

### Verdict: **YELLOW** (minor concerns)

Tek kullanıcılı yerel geliştirici ortamında (standart Deckent kullanımı) risk düşük — checkpoint.json yazma yetkisi sadece sprint sahibine ait. Paylaşımlı CI ortamı veya multi-user Docker container'ında Finding 1 path traversal **MEDIUM** risk taşır. Çünkü task ID hiçbir sanitization olmadan dosya path'ine ekleniyor.

### Öneri (Sprint 164 task)

```
Task: SR-3 Remediation — Checkpoint Task ID Sanitization
Files: src/orchestra/sprint-checkpoint.ts
1. Task ID format validation — sadece [a-zA-Z0-9_-] karakterlerine izin ver:
   function isValidTaskId(id: string): boolean {
     return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
   }
   Checkpoint parse'dan sonra tüm task ID'leri bu fonksiyonla filtrele.

2. readCheckpoint'e daha kapsamlı array validasyonu ekle:
   if (!Array.isArray(parsed.completedTasks)) return null;
   if (!Array.isArray(parsed.activeWorkers)) return null;

3. writeFileSync öncesi taskId whitelist kontrolü:
   if (!isValidTaskId(worker.taskId)) {
     debugLog('restoreSprintFromCheckpoint', `Skipping invalid taskId: ${worker.taskId}`);
     continue;
   }
```

---

## Sonuç

| Madde | Verdict | Sprint 164 Aksiyon |
|-------|---------|-------------------|
| SR-1 `redactSensitive` | **YELLOW** | GEMINI_API_KEY ekle, JWT pattern, divergent impl düzelt |
| SR-2 `acquireSingletonLock` | **GREEN** | İsteğe bağlı: .deckent/ izin 0750 |
| SR-3 `restoreSprintFromCheckpoint` | **YELLOW** | Task ID whitelist, array validation |

**P0 fix yok** — Hiçbir madde RED değil. Her iki YELLOW item normal geliştirici ortamında düşük risk taşıyor; fix önerileri Sprint 164 backlog'una alınabilir.
