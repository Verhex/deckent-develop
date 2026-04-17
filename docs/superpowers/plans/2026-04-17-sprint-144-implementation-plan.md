# Sprint 144 Implementation Plan — God Split + ADR-008 Cycle 2 + Performance + Operasyonel HIGH

> **For agentic workers:** Deckent Native mode. Brain reads plan → DIRECTIVES → task JSON → workers with agent+skill+ADR injection. Sprint 143 chain safety gate PASS ise otomatik başlar.

**Spec referansı:** `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md` § 3

**Goal:** Mimari temizlik — 4 god object (init/doctor/retro/worker) bölünür, ADR-008 Cycle 2 çözülür (core/session-interface.ts çıkarılır), Auditor async scan (52 sync I/O elimine), 29 ölü dosya silinir (audit ile doğrulama), i18n temel 5 CLI komutu, operasyonel HIGH 6 task canlı.

**Architecture:** 5 wave — Wave 1 god split + cycle 2 (mimari), Wave 2 perf + ölü kod (temizlik), Wave 3 i18n temel (kullanıcı), Wave 4 operasyonel HIGH (feature canlı), Wave 5 test A baseline. Wave'ler sırayla, wave içi paralel.

**Tech Stack:** TypeScript (ESM), vitest, madge (circular dep detect), better-sqlite3, MCP.

**Süre:** ~5 saat hard cap | **Cost budget:** $18 | **Opus task:** 16/21 (P0/P1). **Sonnet task:** 5/21 (P2: i18n temel, Türkçe locale, redact taşı, rich output, docker hardening).

---

## File Structure — Yaratılacak / Değişecek Dosyalar

### Yeni dosyalar
- `src/cli/commands/init-steps.ts`, `init-templates.ts`, `init-wizard.ts` — init.ts split
- `src/cli/commands/doctor-checks.ts`, `doctor-format.ts` — doctor.ts split
- `src/cli/commands/retro-parser.ts`, `retro-formatter.ts` — retro.ts split
- `src/agents/worker-verify.ts`, `worker-lifecycle.ts`, `worker-log.ts` — worker.ts split
- `src/core/session-interface.ts` — ADR-008 Cycle 2 fix
- `src/core/redact-sensitive.ts` — CLI→core taşıma

### Değişecek dosyalar
- `src/cli/commands/init.ts` (1552→<400 LoC)
- `src/cli/commands/doctor.ts` (1069→<500 LoC)
- `src/cli/commands/retro.ts` (453→<200 LoC)
- `src/agents/worker.ts` (1669→<500 LoC, @deprecated 5 func silinir)
- `src/providers/claude.ts`, `codex.ts`, `gemini.ts` — SessionInterface binding
- `src/orchestra/connector.ts`, `tmux.ts` — interface impl
- `src/agents/auditor.ts`, `src/orchestra/heartbeat-daemon.ts` — async I/O
- `src/core/file-lock.ts`, `deck-file.ts`, `credentials.ts` — security+perf
- `Dockerfile`, `.dockerignore` — hardening
- `src/cli/helpers/messages.ts` — i18n genişlet
- 3 Türkçe locale fix dosyası
- 6 operasyonel HIGH dosyası
- 29 ölü dosya (silinecek)
- Tests: restoration + yeni

---

## Wave 1 — God Split + ADR-008 Cycle 2 (4 task, paralel)

### Task T-144-001: init.ts split (1552 → 4 dosya, <400 LoC her biri)

**Agent:** `refactorer` | **Skills:** `typescript-expert`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/cli/commands/init.ts` → thin router (<200 LoC)
- Create: `src/cli/commands/init-steps.ts` — step-by-step orchestration (~400 LoC)
- Create: `src/cli/commands/init-templates.ts` — CLAUDE.md/DECKENT.md/etc. templates (~400 LoC)
- Create: `src/cli/commands/init-wizard.ts` — interactive prompts (~350 LoC)
- Split: `tests/cli/init.test.ts` (2270 LoC) → `tests/cli/init.test.ts` (router) + `init-steps.test.ts` + `init-templates.test.ts` + `init-wizard.test.ts`

**Scope:** `src/cli/commands/`, `tests/cli/`

**Implementation Strategy:**
1. init.ts içeriğini sorumluluk analizi:
   - **Router (<200 LoC):** argument parsing, flow control, result reporting
   - **Steps:** directory creation, git init, DB preload, rule generator call, config write
   - **Templates:** CLAUDE.md, DECKENT.md, AGENTS.md, DIRECTIVES.md, BOOT.md string builders
   - **Wizard:** interactive readline prompts (multi-IDE detect, provider pick, confirm destructive)
2. T-143-009'da eklenen DB preload logic `init-steps.ts`'e yerleşir.
3. T-143-011'deki rule generator call da `init-steps.ts` içinden.
4. Module API: `initSteps.run(ctx: InitContext): Promise<InitResult>`, `initTemplates.build(ctx): TemplateSet`, `initWizard.prompt(partial): Promise<FullOptions>`
5. Her modül `export`'ları test edilebilir saf fonksiyon.
6. Test restoration: mevcut 2270 LoC test 4 dosyaya dağıtılır, her modülün own unit test suite'i.

**Critical API Definitions:**

```typescript
// src/cli/commands/init-steps.ts
export interface InitContext {
  root: string;
  name: string;
  provider: 'claude' | 'codex' | 'gemini';
  options: InitOptions;
  logger: Logger;
}

export interface InitResult {
  success: boolean;
  createdFiles: string[];
  dbPath: string;
  errors?: string[];
}

export const initSteps = {
  async run(ctx: InitContext): Promise<InitResult> {
    await this.createDirectories(ctx);
    await this.initGit(ctx);
    await this.preloadMemoryDb(ctx);    // T-143-009'dan
    await this.writeConfigFiles(ctx);
    await this.writeTemplates(ctx);
    await this.runRuleGenerator(ctx);   // T-143-011'den
    return { success: true, createdFiles: ctx.logger.getCreatedFiles(), dbPath: path.join(ctx.root, '.brain/memory.db') };
  },
  // ... individual steps
};
```

**GO Criteria:**
- `wc -l src/cli/commands/init.ts` → <200
- Toplam init+init-steps+init-templates+init-wizard toplam ≈ 1552 (sadece parçalanmış, eklememe 0)
- `deckent init /tmp/test-144` happy path PASS (T-143-009'daki DB preload dahil)
- Tests 4 dosyaya dağılmış, `npx vitest run tests/cli/init*.test.ts` PASS

**NO-GO:** init.ts ≥400 LoC kalırsa, veya herhangi bir test regresyon.

**Kanıt:** `wc -l src/cli/commands/init*.ts` her biri <400.

**Test:** Mevcut 2270 LoC test split + 10+ yeni unit test (her modül için).

---

### Task T-144-002: doctor.ts split (1069 → 3 dosya, <500 LoC)

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/cli/commands/doctor.ts` → thin router
- Create: `src/cli/commands/doctor-checks.ts` — health check functions
- Create: `src/cli/commands/doctor-format.ts` — output formatter
- Split: `tests/cli/doctor.test.ts` → 3 dosya

**Scope:** `src/cli/commands/`, `tests/cli/`

**Implementation Strategy:**
1. doctor.ts sorumluluk ayrımı:
   - **Router (<300 LoC):** argument parse, checks run, format output
   - **doctor-checks.ts:** tüm health check fonksiyonları (checkMemoryDb, checkAdrs, checkGitignore (T-143-003), checkWorkers, checkDocker, checkTsc, checkVitest, checkCost vb.)
   - **doctor-format.ts:** output rendering (table, JSON, plain text modes)
2. DEBT.md V1 parse kaldırılır → `store.getByType('debt')` (Memory V2 migration T-143-008 gereksinimlerine ek)
3. Every check returns typed `CheckResult { name, status: 'pass'|'warn'|'fail', details, recommendation? }`
4. Tests restoration.

**Critical API:**

```typescript
// src/cli/commands/doctor-checks.ts
export interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  details: string;
  recommendation?: string;
}

export const checks = {
  async memoryDb(ctx): Promise<CheckResult> { /* ... */ },
  async adrs(ctx, store: MemoryStore): Promise<CheckResult> { /* ... */ },
  async gitignore(ctx): Promise<CheckResult> { /* run T-143-003 script */ },
  async fts5Integrity(ctx, store): Promise<CheckResult> { /* T-143-006 query test */ },
  async brainHealth(ctx, store): Promise<CheckResult> { /* score 0-100 */ },
  // ... 15+ checks total
};
```

**GO Criteria:**
- `wc -l src/cli/commands/doctor.ts` → <300
- `deckent doctor` tüm çıktılar eskiyle eşdeğer
- DEBT.md V1 parse kaldırıldı

**Kanıt:** `grep -n "readFileSync.*DEBT.md" src/cli/commands/doctor*.ts` → 0.

**Test:** Split + 20+ yeni (her check için ayrı).

---

### Task T-144-003: retro.ts split (453 → 3 dosya)

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/cli/commands/retro.ts` (thin, <200 LoC)
- Create: `src/cli/commands/retro-parser.ts` — DB query + entry parse
- Create: `src/cli/commands/retro-formatter.ts` — text/JSON output
- Split: `tests/cli/retro.test.ts`

**Scope:** `src/cli/commands/`, `tests/cli/`

**Implementation Strategy:**
1. retro.ts RETRO.md parse (V1) kaldırılır → `store.getByType('retro')` DB-first (T-143-008 migration sonrası).
2. Parser sorumluluk: sprint range query, retro entry fetch, memory/debt cross-reference via relations (T-143-007 sonrası).
3. Formatter: plain text (default), JSON (`--json`), markdown (for --markdown report).

**GO Criteria:**
- `wc -l src/cli/commands/retro*.ts` her biri <200
- V1 RETRO.md parse kaldırıldı
- `deckent retro --sprint=143` DB'den çekiyor

**Test:** Split + 8 yeni.

---

### Task T-144-003b: worker.ts split (1669 → 4 dosya, <500 LoC)

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/agents/worker.ts` → thin (<500 LoC, task lifecycle orchestration)
- Create: `src/agents/worker-verify.ts` — tsc+vitest verify loop (~400 LoC)
- Create: `src/agents/worker-lifecycle.ts` — claim/heartbeat/lock/result (~500 LoC)
- Create: `src/agents/worker-log.ts` — structured logging (~200 LoC)
- Delete (inside worker.ts): 5 @deprecated delege fonksiyonu (acquireLock, releaseLock, checkLock, releaseAllLocks, writeFinishedHeartbeat)
- Split: `tests/agents/worker.test.ts` (8 dosya) → 4 modül × 2-3 test dosyası

**Scope:** `src/agents/`, `tests/agents/`

**Implementation Strategy:**
1. worker.ts sorumluluk ayrımı:
   - **Worker router (<500 LoC):** main entry, task read, orchestration flow
   - **worker-verify.ts:** tsc --noEmit + vitest run verify loop (max 3 retry, NO_GO on fail)
   - **worker-lifecycle.ts:** claim task, heartbeat write (5s interval), lock acquire/release, result write
   - **worker-log.ts:** structured stderr via `debugLog` (T-143-006) + audit trail
2. 5 @deprecated fonksiyon **tamamen silinir** (core bozulamaz direktif — ama bunlar zaten kullanılmıyor, aktif kod kaybı yok)
3. ADR-008 `redactSensitive` CLI→core taşıma T-144-012'de yapılıyor — worker.ts import path değişecek.
4. Test split: 8 mevcut test dosyası 4 modüle dağıtılır (her modül için 2+ test dosyası).

**Critical API:**

```typescript
// src/agents/worker-verify.ts
export interface VerifyResult {
  tscPass: boolean;
  vitestPass: boolean;
  tscErrors?: string[];
  vitestFailures?: string[];
  attempts: number;
}

export async function runVerifyLoop(ctx: WorkerContext, maxAttempts: number = 3): Promise<VerifyResult> { /* ... */ }

// src/agents/worker-lifecycle.ts
export const lifecycle = {
  async claim(taskId: string, workerId: string): Promise<ClaimResult> { /* ... */ },
  async heartbeat(taskId: string, data: HbData): Promise<void> { /* ... */ },
  async acquireLock(filePath: string, workerId: string): Promise<Lock> { /* ... */ },
  async releaseLock(lock: Lock): Promise<void> { /* ... */ },
  async writeResult(taskId: string, result: TaskResult): Promise<void> { /* ... */ },
};
```

**GO Criteria:**
- `wc -l src/agents/worker.ts` → <500
- 5 @deprecated fonksiyon 0
- `grep -n "from.*cli.*helpers" src/agents/worker*.ts` → 0 (ADR-008 uyumu, T-144-012 sonrası)
- Tests PASS

**Kanıt:** worker.ts 1669→<500 LoC, 4 modül total ~1600 LoC.

**Test:** Split + 15+ yeni modül-specific.

---

### Task T-144-004: ADR-008 Cycle 2 Fix — core/session-interface.ts çıkar

**Agent:** `architect` | **Skills:** `typescript-expert`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Create: `src/core/session-interface.ts`
- Modify: `src/providers/claude.ts`, `codex.ts`, `gemini.ts` — interface binding
- Modify: `src/orchestra/connector.ts` — interface impl
- Modify: `src/orchestra/tmux.ts` — connector uses interface
- Modify: tests

**Scope:** `src/core/`, `src/providers/`, `src/orchestra/`, `tests/`

**Implementation Strategy:**

**Problem:** Provider↔Connector↔tmux 7-node döngüsel bağımlılık. ADR-008 core→orchestra import yasak.

**Solution:** SessionInterface core/'a çıkarılır, provider'lar sadece interface'e bağımlı.

```typescript
// src/core/session-interface.ts
export interface SessionInterface {
  create(sessionId: string, options: SessionOptions): Promise<void>;
  send(sessionId: string, data: string): Promise<void>;
  kill(sessionId: string): Promise<void>;
  capture(sessionId: string, lines: number): Promise<string>;
  list(): Promise<SessionInfo[]>;
  isAlive(sessionId: string): Promise<boolean>;
}

export interface SessionOptions {
  command: string;
  env?: Record<string, string>;
  cwd?: string;
}

export interface SessionInfo {
  id: string;
  pid: number;
  createdAt: string;
}
```

**Provider binding:**

```typescript
// src/providers/claude.ts
// Eski: import { createTmuxSession, killTmuxSession } from '../orchestra/tmux.js'; ← ADR-008 ihlal
// Yeni: SessionInterface inject
export class ClaudeProvider {
  constructor(private session: SessionInterface) {}

  async spawnWorker(taskId: string): Promise<void> {
    await this.session.create(`claude-${taskId}`, { command: 'claude ...', env: {...} });
  }
}
```

**Connector binding (connector.ts):**

```typescript
// src/orchestra/connector.ts
import { SessionInterface } from '../core/session-interface.js';
import * as tmux from './tmux.js';  // tmux hala concrete impl

export const tmuxSessionAdapter: SessionInterface = {
  create: (id, opts) => tmux.createSession(id, opts),
  send: (id, data) => tmux.sendKeys(id, data),
  kill: (id) => tmux.killSession(id),
  capture: (id, lines) => tmux.capture(id, lines),
  list: () => tmux.list(),
  isAlive: (id) => tmux.isAlive(id),
};

// Provider instantiate
export function createProvider(type: 'claude'|'codex'|'gemini'): Provider {
  switch (type) {
    case 'claude': return new ClaudeProvider(tmuxSessionAdapter);
    case 'codex': return new CodexProvider(tmuxSessionAdapter);
    case 'gemini': return new GeminiProvider(tmuxSessionAdapter);
  }
}
```

**Result:** Providers only import `core/session-interface.ts`. Connector imports both interface (core) and tmux (orchestra) — connector = orchestra layer, this is OK. Cycle 2 broken.

**Cycle verification:**

```bash
# Before fix:
madge --circular src/
# Shows: Cycle 2 (Provider ↔ Connector ↔ tmux ↔ claude/codex/gemini)

# After fix:
madge --circular src/
# Shows: Only Cycle 1 (config ↔ config-migration, LOW severity) — Cycle 2 GONE
```

**GO Criteria:**
- `madge --circular src/` → Cycle 2 yok
- 3 provider dosyası sadece `core/session-interface.ts` import ediyor
- Test: 3 provider × session interface contract test

**Kanıt:** `grep -l "from.*orchestra/tmux" src/providers/*.ts` → 0 sonuç.

**Test:** 12+ test (interface contract, 3 provider × happy path + edge case, connector impl).

---

## Wave 2 — Performans + Ölü Kod (5 task, paralel)

### Task T-144-005: Auditor Async Scan Loop

**Agent:** `performance-analyzer` | **Skills:** `performance-optimizer`, `typescript-expert` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/agents/auditor.ts` — async I/O throughout
- Modify: `src/orchestra/heartbeat-daemon.ts` — async spawn
- Modify: tests

**Scope:** `src/agents/`, `src/orchestra/`, `tests/`

**Implementation Strategy:**

Auditor 30s scan döngüsünde 52 senkron I/O + 9 spawnSync. Target: scan latency 30s→<5s.

**Refactor:**
- `fs.readFileSync` → `fs.promises.readFile`
- `fs.readdirSync` → `fs.promises.readdir`
- `fs.statSync` → `fs.promises.stat`
- `spawnSync` → `spawn` + Promise wrapper
- Parallel: `Promise.all([readHeartbeats, readLocks, readDashboard, readTasks, ...])` yerine sequential

**Benchmark suite:**
- 100 worker simülasyon
- Baseline (Sprint 143): 30s sync
- Target (Sprint 144): <5s async

**GO Criteria:**
- `npm run bench:auditor` → <5s (100 worker scenario)
- Tests PASS (mevcut auditor test suite + yeni async-specific)

**Test:** 15+ test (async path, benchmark, concurrent scan).

---

### Task T-144-006: Ölü Kod Silme Wave A (Agent + V1 Routing, 17 dosya, 2780 LoC)

**Agent:** `refactorer` | **Skills:** `code-simplifier` | **Model:** opus | **Effort:** high

**Files Silinecek:**
- 13 agent dosyası (God Analysis onaylanmış)
- 4 V1 routing dosyası: `decision-engine.ts`, `decision-replay.ts`, `agent-step.ts`, `scope-step.ts`

**Scope:** `src/agents/`, `src/orchestra/`, tests

**Implementation Strategy:**

**Pre-silme audit (her dosya için):**
1. `grep -rn "<filename>" src/ tests/ scripts/` → 0 reference doğrulama
2. `grep -rn "<exported-function>" src/ tests/ scripts/` → 0 import
3. Barrel export (index.ts) içinde ise remove
4. Tests silinir veya move

**Audit trail (retro'ya yazılır):**
- Her silinen dosya: purpose, replacement (varsa v2 successor), why died (adr reference, superseded feature)
- Örnekler: `decision-engine.ts` → V2 routing (ADR-028) tarafından superseded. `agent-step.ts` → activation-engine.ts replace.

**Silme komutu batch:**

```bash
git rm src/orchestra/decision-engine.ts src/orchestra/decision-replay.ts src/orchestra/decision-steps/agent-step.ts src/orchestra/decision-steps/scope-step.ts
# ... 13 agent dosyası
git rm tests/orchestra/decision-engine.test.ts # vb.
```

**GO Criteria:**
- `git diff --stat` 17+ dosya delete
- Build pass (`tsc --noEmit`)
- Tests PASS (regresyon 0)
- Sprint 144 retro'da dead-code-audit section

**Kanıt:** `git log --diff-filter=D --name-only HEAD~1..HEAD | grep -c "\.ts"` → ≥17.

**Test:** Build + mevcut test suite (regresyon koruması).

---

### Task T-144-007: Ölü Kod Silme Wave B (Orchestra Sahipsiz + Feature Flag, 12 dosya, 2139 LoC)

**Agent:** `refactorer` | **Skills:** `code-simplifier` | **Model:** opus | **Effort:** high

**Files Silinecek:**
- `src/orchestra/multi-agent.ts` (120 LoC, index.ts'den export edilmiyor)
- `src/orchestra/handoff-protocol.ts` (152 LoC, 0 üretim import'u)
- `src/orchestra/batch-stats.ts` (kullanımı belirsiz → audit sonrası karar)
- `src/orchestra/metrics-updater.ts` (readme-metrics.ts kopyası)
- `src/orchestra/learning-decay.ts`, `learning-migration.ts` (doğrulanmış ölü)
- `src/orchestra/combination-scorer.ts` (superseded)
- `src/orchestra/brain-context.ts` (ADR-038 deferred)
- Feature flag dead: `adaptiveAgentEnabled`, `sharedMemoryEnabled`, `PreloadConfig` interface (lazy-loader.ts)

**Scope:** `src/orchestra/`, `src/core/`, tests

**Implementation Strategy:**

**Her dosya için audit protokolü (Karar 1-B+A hibrit, Direktif 15):**

```
Dosya: src/orchestra/multi-agent.ts

1. Neden eklendi? (git log --follow ile tarih + commit msg)
   → Sprint 88 Task 4, multi-agent collaboration draft

2. V2 successor var mı?
   → mid-sprint-adapter.ts + result-collector.ts ile replace edildi

3. Hâlâ kullanılıyor mu?
   → grep -rn "multi-agent" src/ → 0 import

4. Karar: SIL ✅

5. Retro note: "multi-agent.ts (Sprint 88) mid-sprint-adapter.ts tarafından
   superseded (Sprint 135). Son kullanımı Sprint 94'te."
```

Feature flag dead:
```typescript
// config-types.ts'de kaldırılacak
// adaptiveAgentEnabled?: boolean;  ← SIL
// sharedMemoryEnabled?: boolean;   ← SIL
// lazy-loader.ts PreloadConfig interface tamamen silinir
```

**GO Criteria:**
- `git diff --stat` 12+ dosya delete
- `grep -rn "adaptiveAgentEnabled\|sharedMemoryEnabled\|PreloadConfig" src/` → 0
- Retro'da 12 dosya için audit trail
- Build + tests PASS

**Test:** Build + mevcut suite.

---

### Task T-144-008: file-lock Path Traversal + deck-file 0o600 + Credential Cache

**Agent:** `security-auditor` | **Skills:** `security-specialist`, `performance-optimizer` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/core/file-lock.ts` — path traversal sanitize
- Modify: `src/core/deck-file.ts` — permission fix
- Modify: `src/core/credentials.ts` — getMasterKey cache
- Modify: tests

**Scope:** `src/core/`, `tests/core/`

**Implementation Strategy:**

**file-lock.ts:**

```typescript
import { validatePath } from './validators.js';  // T-143-001'den

function lockFilePathFor(filePath: string): string {
  // Eski: .replace(/\//g, '__') — but `..` bypass possible
  // Yeni: validatePath + sanitize
  const sanitized = filePath
    .replace(/\.\./g, '_')     // remove ..
    .replace(/\//g, '__')      // flatten path
    .replace(/[^\w.-]/g, '_'); // non-alphanumeric → _
  return path.join(LOCKS_DIR, `${sanitized}.lock`);
}
```

**deck-file.ts:**

```typescript
// Eski: fs.writeFileSync(path, content) — default 0o644 (world-readable)
// Yeni: fs.writeFileSync(path, content, { mode: 0o600 })
// Tüm .deck dosyaları için
```

**credentials.ts:**

```typescript
let cachedMasterKey: Buffer | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 min

export async function getMasterKey(): Promise<Buffer> {
  if (cachedMasterKey && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedMasterKey;
  }
  cachedMasterKey = await loadMasterKeyFromDisk();
  cacheTimestamp = Date.now();
  return cachedMasterKey;
}

// Invalidate on rotation
export function invalidateMasterKeyCache(): void {
  cachedMasterKey = null;
  cacheTimestamp = 0;
}
```

**GO Criteria:**
- file-lock.ts path traversal test PASS
- `ls -la .deck/*` → `-rw-------` (600)
- credentials.ts cache hit rate ≥99% (benchmark)

**Test:** 10+ test.

---

### Task T-144-009: Dockerfile Hardening

**Agent:** `devops-engineer` | **Skills:** `docker-expert`, `devops-engineer` | **Model:** sonnet | **Effort:** normal

**Files:**
- Modify: `Dockerfile` — multi-stage + USER
- Modify: `.dockerignore`
- Modify: `tests/docker/dockerfile.test.ts`

**Scope:** root, `tests/docker/`

**Implementation Strategy:**

**Multi-stage Dockerfile:**

```dockerfile
# Stage 1: Builder
FROM node:22-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc

# Stage 2: Runtime
FROM node:22-alpine AS runtime
RUN addgroup -g 10001 deckent && adduser -u 10001 -G deckent -D -h /home/deckent deckent
WORKDIR /app
COPY --from=builder --chown=deckent:deckent /build/dist ./dist
COPY --from=builder --chown=deckent:deckent /build/node_modules ./node_modules
COPY --chown=deckent:deckent package.json .
USER deckent
HEALTHCHECK --interval=30s --timeout=3s CMD node dist/cli/entry.js doctor --quick || exit 1
ENTRYPOINT ["node", "dist/cli/entry.js"]
CMD ["--help"]
```

**.dockerignore:** `.git`, `.brain/memory.db*`, `node_modules/.cache`, `tests/`, `docs/`, `*.md`, `.vscode`, `.idea`.

**GO Criteria:**
- `docker build -t deckent:144 .` PASS
- `docker run deckent:144 whoami` → `deckent` (not root)
- Image size <400MB
- Health check PASS

**Test:** 5+ Dockerfile integration test (build + run + user check + size + healthcheck).

---

## Wave 3 — i18n Temel (3 task, paralel)

### Task T-144-010: i18n Temel CLI (5 komut TR/EN)

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** sonnet | **Effort:** normal

**Files:**
- Modify: `src/cli/helpers/messages.ts` — genişletilmiş locale yapısı
- Modify: `src/cli/commands/init.ts`, `start.ts`, `status.ts`, `help.ts`, `doctor.ts` — messages.ts kullan
- Create: `src/cli/helpers/i18n.ts` — locale resolver (env LANG + fallback)
- Tests

**Scope:** `src/cli/`, `tests/cli/`

**Implementation Strategy:**

Dashboard i18n pattern (`en.ts`, `tr.ts` + LanguageProvider) CLI'ya port. `LANG=tr_TR.UTF-8` env var → TR. `LANG=en_US` → EN. Fallback EN.

```typescript
// src/cli/helpers/i18n.ts
export function resolveLocale(): 'tr' | 'en' {
  const lang = (process.env['LANG'] ?? 'en').toLowerCase();
  if (lang.startsWith('tr')) return 'tr';
  return 'en';
}

// src/cli/helpers/messages.ts (yeniden yapılandırılmış)
const messages = {
  init: {
    en: { starting: 'Initializing deckent...', success: 'Project initialized.' },
    tr: { starting: 'Deckent başlatılıyor...', success: 'Proje başlatıldı.' },
  },
  start: { en: {...}, tr: {...} },
  status: { en: {...}, tr: {...} },
  help: { en: {...}, tr: {...} },
  doctor: { en: {...}, tr: {...} },
};

export function msg(key: string): string {
  const locale = resolveLocale();
  // Resolve nested key like 'init.starting'
  return get(messages, key)[locale];
}
```

**GO Criteria:**
- `LANG=tr deckent init` → TR çıktı
- `LANG=en deckent init` → EN çıktı
- 5 komut × her mesaj TR/EN parity

**Test:** 12+ test.

---

### Task T-144-011: Türkçe Locale Fix (.toLowerCase → .toLocaleLowerCase('tr-TR'))

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** sonnet | **Effort:** low

**Files:**
- Modify: `src/orchestra/managed-docs/content-generators.ts`, `section-updater.ts`, `src/orchestra/baseline-tracker.ts`
- Modify: tests

**Scope:** `src/orchestra/`, `tests/orchestra/`

**Implementation Strategy:**

3 dosyada `.toLowerCase()` → `.toLocaleLowerCase('tr-TR')`. Türkçe İ/ı doğru dönüşüm.

Test: `"İSTANBUL".toLocaleLowerCase('tr-TR')` → `"istanbul"` (correct), mevcut `.toLowerCase()` → `"i̇stanbul"` (bozuk).

**GO Criteria:** 3 dosyada `.toLowerCase()` 0 sonuç. Türkçe karakter dönüşümü test PASS.

**Test:** 6 test (İ/ı/I/i karakter kombinasyonları).

---

### Task T-144-012: redactSensitive CLI → core taşı (ADR-008)

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** sonnet | **Effort:** low

**Files:**
- Create: `src/core/redact-sensitive.ts`
- Modify: `src/cli/helpers/output.ts` — import from core
- Modify: `src/agents/worker.ts` (T-144-003b sonrası) — import from core
- Modify: tests

**Scope:** `src/core/`, `src/cli/helpers/`, `src/agents/`, tests

**Implementation Strategy:**

Mevcut: `src/cli/helpers/output.ts:redactSensitive`. `worker.ts` CLI'dan import ediyor → ADR-008 ihlal.

Fix: fonksiyonu `src/core/redact-sensitive.ts`'e taşı. CLI helpers + worker her ikisi de core'dan import.

```typescript
// src/core/redact-sensitive.ts
const SECRET_PATTERNS = [
  /api[_-]?key['":\s=]+['"]?([a-zA-Z0-9-_]+)/gi,
  /token['":\s=]+['"]?([a-zA-Z0-9-_]+)/gi,
  /password['":\s=]+['"]?([^\s"']+)/gi,
  // ... additional patterns
];

export function redactSensitive(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (m, secret) => m.replace(secret, '***'));
  }
  return result;
}
```

**GO Criteria:**
- `grep -rn "from.*cli.*helpers" src/agents/` → 0
- Tests PASS (behavior equivalent)

**Test:** Mevcut + 2 regression.

---

## Wave 4 — Operasyonel HIGH (Karar 1-B Wave B, 6 task)

### Task T-144-013: Docker HB Deploy Wire (Sprint 139 Fix Canlı)

**Agent:** `devops-engineer` | **Skills:** `docker-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/orchestra/spawn-backend-docker.ts` — atomicWrite canlı
- Modify: `src/orchestra/heartbeat-daemon.ts` — SIGTERM + fsync hook
- Modify: tests

**Scope:** `src/orchestra/`, `tests/docker/`

**Implementation Strategy:**

Sprint 139 T-013'te yazıldı ama runtime wire eksik.

Wire check:
- `spawn-backend-docker.ts` HB write `atomicWriteFileSync(path, content, { fsync: true })`
- SIGTERM handler: 15s grace period + fsync + exit
- Container kill: SIGKILL öncesi SIGTERM

**GO Criteria:**
- Docker 10-e2e test suite PASS
- HB gap <5s (baseline)

**Test:** 10 E2E.

---

### Task T-144-014: Event Stream Emit Wire

**Agent:** `architect` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/orchestra/event-stream.ts`, `sprint-controller.ts`, `worker.ts`, `auditor.ts`
- Tests

**Scope:** `src/orchestra/`, `src/agents/`, `tests/`

**Implementation Strategy:**

Sprint 138 event-stream.ts (305 LoC) foundation atıldı. Wire emit call site'ları:
- Brain: PHASE_TRANSITION, SPRINT_START, SPRINT_END, FIX_CYCLE
- Worker: TASK_CLAIM, HEARTBEAT, RESULT_WRITE, VERIFY_FAIL
- Auditor: ADR_VIOLATION, BOUNDARY_VIOLATION, STALE_HEARTBEAT

Her event T-143-016 notification dispatcher tetikleyebilir (DECKENT→USER:NOTIFY kanalı).

**GO Criteria:** `.deckent/sprint-144-events.jsonl` full lifecycle kapsar (≥200 event for 21-task sprint).

**Test:** 10+ test.

---

### Task T-144-015: Sprint-State Lifecycle (pid manager)

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/orchestra/sprint-pid-manager.ts`
- Modify: `src/orchestra/sprint-finalizer.ts` — cleanup call
- Tests

**Scope:** `src/orchestra/`, `tests/orchestra/`

**Implementation Strategy:**

`.deckent/pids/` sadece canlı sprint için tutulsun. Sprint bitiminde önceki sprint pid'leri silinir. Stale pid detection (`kill -0 <pid>` fail ise stale).

**GO Criteria:** Sprint 144 biterken `.deckent/pids/*sprint-143*` → 0 dosya.

**Test:** 6 test.

---

### Task T-144-016: Retro sprint-id normalize

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** low

**Files:**
- Modify: `src/orchestra/sprint-retro-writer.ts`, `src/core/memory-store.ts`
- Migration: backfill eski retro-latest → sprint-specific
- Tests

**Scope:** `src/orchestra/`, `src/core/`, `tests/`

**Implementation Strategy:**

DB'de retro entry'leri `retro-sprint-141` + `retro-latest` iki kayıt. Canonical `retro-sprint-NNN`, alias `retro-latest` view query'den gelir (her zaman en son sprint).

Migration: `retro-latest` entry'si (varsa) sprint-id'den doğru id'ye copy, sonra `retro-latest` silinir.

**GO Criteria:**
- `sqlite3 .brain/memory.db "SELECT id FROM entries WHERE type='retro'"` → sprint-specific IDs, `retro-latest` yok
- `deckent retro --latest` view query ile çalışır

**Test:** 6 test.

---

### Task T-144-017: Orphan Cleanup (.tasks + locks)

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/orchestra/sprint-finalizer.ts`
- Create: `src/core/orphan-cleaner.ts`
- Tests

**Scope:** `src/orchestra/`, `src/core/`, `tests/`

**Implementation Strategy:**

Sprint bitiminde `.tasks/task-*.json` + `.locks/*.lock` orphan dosyalar temizlensin.

**Safety (Sprint 139 incident lesson):** Sadece DONE/NO_GO task'lar. PENDING/EXECUTING korunur. T-143-013 safeArchive ile uyumlu.

```typescript
// src/core/orphan-cleaner.ts
export async function cleanupOrphans(root: string, sprintId: string): Promise<CleanupResult> {
  const tasksDir = path.join(root, '.tasks');
  const locksDir = path.join(root, '.locks');

  // .tasks cleanup (DONE/NO_GO only)
  const terminalTasks = await readTerminalTasks(tasksDir, sprintId);
  // ... move to archive

  // .locks cleanup (age > 5 min = stale)
  const locks = await readLocks(locksDir);
  const stale = locks.filter(l => Date.now() - l.acquiredAt > 5 * 60 * 1000);
  for (const lock of stale) {
    await fs.promises.unlink(lock.path);
    debugLog.warn('orphan-cleaner', 'Stale lock removed', { lock });
  }

  return { tasksRemoved: terminalTasks.length, locksRemoved: stale.length };
}
```

**GO Criteria:** Sprint 144 sonrası `.tasks/` sadece arşiv manifest + `.locks/` boş.

**Test:** 8 test (safety: PENDING korunuyor, DONE siliniyor).

---

### Task T-144-018: Rich Sprint Output (7-section summary)

**Agent:** `doc-writer` | **Skills:** `documentation-writer` | **Model:** sonnet | **Effort:** normal

**Files:**
- Modify: `src/cli/helpers/sprint-summary-rich.ts`, `src/cli/commands/retro.ts`
- Tests

**Scope:** `src/cli/`, `tests/cli/`

**Implementation Strategy:**

ADR-020 7-section rich output:
1. **Overview:** sprint ID, duration, phases
2. **Task results:** DONE/TECH_DEBT/NO_GO breakdown
3. **Agent/Skill performance:** per-agent success rate + task count
4. **Task dependency map:** dependency graph DOT format
5. **Cost breakdown:** token usage per provider, total cost
6. **ADR compliance score:** 0-100 + violations list
7. **Recommendations:** next sprint hints (borç listesi)

**GO Criteria:** `deckent retro --sprint=144 --rich` → 7-section output.

**Test:** 8 test.

---

## Wave 5 — Test A Baseline (2 task, paralel)

### Task T-144-019: Test Yazım — Memory V2 CLI

**Agent:** `test-writer` | **Skills:** `testing-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Create: `tests/cli/recall.test.ts`, `tests/cli/remember.test.ts`, `tests/cli/memory.test.ts`, `tests/mcp/memory-query.test.ts`

**Scope:** `tests/cli/`, `tests/mcp/`

**Implementation Strategy:**

Sprint 142 God Analysis'te 4 kritik dosya 0 test. Her biri ≥10 test.

Test kapsamı:
- **recall.ts:** `--mode=and|or`, empty query, invalid query, snippet render, FTS5 error propagation (T-143-006 sonrası)
- **remember.ts:** insert happy path, invalid type, relations auto-extract (T-143-007 sonrası), metadata schema validation
- **memory.ts:** rebuild, export, stats commands
- **mcp/memory-query.ts:** tool invocation, schema validation, snippet enrichment

**GO Criteria:** vitest +40 test PASS, coverage ≥90% for 4 files.

**Test:** 40+ test.

---

### Task T-144-020: Test Yazım — heartbeat-daemon, mid-sprint-adapter, ci-reporter

**Agent:** `test-writer` | **Skills:** `testing-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Create: `tests/orchestra/heartbeat-daemon.test.ts`, `mid-sprint-adapter.test.ts`, `ci-reporter.test.ts` (veya genişlet)

**Scope:** `tests/orchestra/`

**Implementation Strategy:**

3 kritik orchestra dosyası 0 test. Her biri ≥8 test.
- heartbeat-daemon: execSync whitelist (T-143-020), stale detection, respawn logic
- mid-sprint-adapter: rerouting decision, fallback chain, failure cascade
- ci-reporter: DB upsert (T-143-008 sonrası), retro write, learning extract

**GO Criteria:** vitest +24 test PASS, coverage ≥85%.

**Test:** 24+ test.

---

## Sprint 144 Sonu Gate (Karar 5-D)

Aynı 5-check otomatik gate. PASS → Sprint 145 auto-trigger.

### Özel validation (Sprint 144'e özgü):
- `madge --circular src/` → Cycle 2 (Provider↔Connector↔tmux) **YOK**
- `wc -l src/cli/commands/init.ts src/cli/commands/doctor.ts src/cli/commands/retro.ts src/agents/worker.ts` → her biri <500
- `git diff --stat HEAD~21..HEAD` — ≥29 dosya delete (ölü kod)

---

## Self-Review Checklist

- [x] **Spec coverage:** 21/21 task spec §3 ile birebir
- [x] **Placeholder scan:** 0 TBD/TODO
- [x] **Type consistency:** `SessionInterface`, `CheckResult`, `VerifyResult`, `AdrViolation`, `CleanupResult` tutarlı
- [x] **Cross-task dep:** T-144-001 (init split) uses T-143-009 DB preload + T-143-011 rule gen. T-144-003b (worker split) coordinates T-144-012 (redact taşı). T-144-014 (event emit) uses T-143-016 (panic guard for notifications).
- [x] **MVP yasak + core bozulamaz:** Her task kök neden + kesin çözüm. God split regresyon 0 hedefi.

---

## Referanslar

- Spec: `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md`
- FINAL-REPORT §2.3-2.5: CLI/Agents/MCP findings
- `meta/architecture-graph.md` §4.2: Cycle 2 detayı
- `meta/dead-code-type-safety.md`: 29 ölü dosya envanteri
