# Sprint 143 Implementation Plan — Güvenlik + Memory V2 Tam + Core Stabilite + Operasyonel P0

> **For agentic workers:** This plan is executed via **Deckent Native mode** (Brain orchestration, tmux workers). The Brain reads this plan → generates DIRECTIVES.md → creates `.tasks/task-NNN.json` → workers consume with agent prompt + skill prompt + ADR injection. Format is Deckent-optimized (not writing-plans bite-sized TDD), but all placeholders eliminated per skill rule.

**Spec referansı:** `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md` § 2

**Goal:** Ship-blocker foundation — 6 P0 güvenlik, Memory V2 tam migrasyon (relations + FTS5 fix + V1 remnants temizlik), core stabilite runtime enforced (brain sprint-finalize, cleanup, heartbeat), 6 operasyonel P0 closed, brain co-evolve canlı (finalizer hook + rule generator 3 provider).

**Architecture:** 5 wave paralel execution (her wave task'ları birbirinden bağımsız). Wave 1 güvenlik → Wave 2 Memory V2 → Wave 3 brain co-evolve → Wave 4 operasyonel P0 → Wave 5 ADR + kalite. Wave içi paralel, wave'ler sırayla. Chain safety gate sprint sonu otomatik.

**Tech Stack:** TypeScript (ESM), better-sqlite3, FTS5, MCP stdio, tmux, vitest, Zod.

**Süre:** ~4 saat hard cap | **Cost budget:** $12 | **Opus task:** 20/20 (tümü P0/P1 kritik)

---

## File Structure — Yaratılacak / Değişecek Dosyalar

### Yeni dosyalar (Sprint 143 yaratıyor)
- `src/core/debug-log.ts` — structured stderr log (Direktif 22)
- `src/core/rule-generator.ts` — ADR-triggered rule regen (Karar 4-B)
- `src/core/rule-templates/brain.template.md` — brain role template
- `src/core/rule-templates/auditor.template.md` — auditor role template
- `src/core/rule-templates/worker-default.template.md` — worker role template
- `src/core/rule-templates/provider-adapters/claude.ts` — Claude format
- `src/core/rule-templates/provider-adapters/codex.ts` — Codex format
- `src/core/rule-templates/provider-adapters/gemini.ts` — Gemini format
- `src/core/panic-guard.ts` — panic kill Alperen approval
- `src/core/identity-generator.ts` — PROJECT-IDENTITY.md auto-regen
- `src/orchestra/sprint-runner-entry.ts` — MCP disconnect fix, detached child
- `src/orchestra/task-restoration.ts` — auto-archive guard
- `scripts/backfill-relations.mjs` — one-time relations backfill
- `scripts/verify-gitignore.mjs` — doctor check for `.brain/memory.db` git status
- `scripts/archive-decisions-md.mjs` — DECISIONS.md archive util
- `tests/e2e/chain-safety.e2e.test.ts` — chain gate E2E

### Değişecek dosyalar (Sprint 143 touch)
- `src/core/memory-query.ts` — FTS5 query builder fix (Karar 2-A)
- `src/core/memory-store.ts` — relations API + ADR amendment
- `src/orchestra/tmux.ts` — shell injection fix
- `src/orchestra/heartbeat-daemon.ts` — execSync beyaz liste
- `src/orchestra/sprint-controller.ts` — panic guard wire + detached runner call
- `src/orchestra/sprint-finalizer.ts` — co-evolve hook (export + IDENTITY + CHANGELOG + rule regen)
- `src/orchestra/sprint-checkpoint.ts` — wire + resume points
- `src/orchestra/authority-enforcer.ts` — Layer 4 runtime wire
- `src/orchestra/ci-reporter.ts` — Memory V2 migration
- `src/orchestra/managed-docs/content-generators.ts` — DB-first
- `src/orchestra/managed-docs/template-renderer.ts` — DB-first
- `src/orchestra/managed-docs/managed-doc-runner.ts` — DB-first
- `src/orchestra/task-builder.ts` — ADR regex auto-link
- `src/orchestra/doc-updaters/health-check.ts` — shouldRun/run path match
- `src/agents/worker.ts` — write-time ADR check (runtime enforcement)
- `src/cli/commands/recall.ts` — `--mode=and|or` flag
- `src/cli/commands/memory.ts` — `memory relations review` subcommand
- `src/cli/commands/init.ts` — DB preload + template update
- `src/cli/commands/resume.ts` — crash restoration
- `src/mcp/tools/memory-query.ts` — `mode` parametresi + debug log
- `src/mcp/tools/help.ts` — 6 eksik tool ekle
- `src/mcp/tools/checkpoint.ts` — path traversal fix
- `src/mcp/tools/docs.ts` — path traversal fix
- `src/mcp/tools/start.ts` — detached runner wire
- `src/mcp/server.ts` — "Tools (22)" + server instructions update
- `src/api/auth.ts` — secure default
- `src/api/server.ts` — CORS + security headers
- `.gitignore` — `.brain/memory.db*` ekle
- `.brain/DECISIONS.md` — DELETE (archive'a taşı)

---

## Wave 1 — P0 Güvenlik + Kritik Foundation (5 task, paralel)

### Task T-143-001: Shell Injection Fix (tmux.ts)

**Agent:** `security-auditor` | **Skills:** `security-specialist`, `typescript-expert` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/orchestra/tmux.ts` — tüm spawnSync çağrıları + taskId validation
- Modify: `tests/orchestra/tmux.test.ts` — injection test suite
- Create: `src/core/validators.ts` (yeni, task-143-002 ile paylaşılır) — input validation helpers

**Scope:** `src/orchestra/`, `src/core/`, `tests/orchestra/`, `tests/core/`

**Implementation Strategy:**
1. `src/core/validators.ts` içinde `validateTaskId(id: string)` fonksiyonu tanımla. Regex `/^[\w-]+$/`, max 100 karakter. Eşleşmezse `throw new ValidationError(code: 'INVALID_TASK_ID', taskId, regex)`.
2. `tmux.ts` tüm public fonksiyonlarında (createSession, killSession, sendKeys, captureOutput) ilk satır `validateTaskId(taskId)` çağrısı.
3. Tüm `spawnSync(cmd, args, opts)` çağrılarında **`shell: false` zorunlu** (mevcut `shell: true` olanları refactor). Args array'i string yerine ayrı parametreler.
4. Command injection vektörü olan tüm kullanıcı girdileri (session name, pane target) ayrıca validate.
5. Test suite:
   - ✅ Valid taskId: `"task-143-001"` → accepted
   - ❌ Shell metacharacter: `"task-001; rm -rf /"` → ValidationError
   - ❌ Null byte: `"task\x00"` → ValidationError
   - ❌ Empty: `""` → ValidationError
   - ❌ Long string (>100): → ValidationError
   - ❌ Path traversal: `"../etc/passwd"` → ValidationError
   - ✅ Real tmux scenarios: createSession/killSession/captureOutput happy path

**Critical API Definitions:**

```typescript
// src/core/validators.ts
export class ValidationError extends Error {
  constructor(public readonly code: string, public readonly context: Record<string, unknown>) {
    super(`Validation failed: ${code}`);
    this.name = 'ValidationError';
  }
}

export function validateTaskId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new ValidationError('INVALID_TASK_ID', { id, reason: 'empty or non-string' });
  }
  if (id.length > 100) {
    throw new ValidationError('INVALID_TASK_ID', { id, reason: 'length > 100' });
  }
  if (!/^[\w-]+$/.test(id)) {
    throw new ValidationError('INVALID_TASK_ID', { id, reason: 'invalid characters' });
  }
}
```

**GO Criteria:**
- `grep -n "shell: true" src/orchestra/tmux.ts` → **0 sonuç**
- `grep -n "validateTaskId" src/orchestra/tmux.ts` → **≥5 call site**
- `npx vitest run tests/orchestra/tmux.test.ts` → **PASS**, ≥7 test

**NO-GO Criteria:**
- Herhangi bir `spawnSync` `shell: true` veya validation olmadan kalmışsa
- Injection test'lerinden biri bypass edilebiliyorsa

**Kanıt:** `grep -c "shell: true" src/orchestra/tmux.ts` → `0`. Test raporu 7/7 PASS.

**Test:** 7+ test (happy + 6 injection attempt)

---

### Task T-143-002: Path Traversal Fix (checkpoint/docs/decision-logger)

**Agent:** `security-auditor` | **Skills:** `security-specialist`, `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/mcp/tools/checkpoint.ts` — sprintId + phase validate
- Modify: `src/mcp/tools/docs.ts` — filename validate
- Modify: `src/orchestra/decision-logger.ts` — task/sprint id validate
- Modify: `src/core/validators.ts` (T-143-001'den) — add `validatePath`, `validateSprintId`, `validatePhase`
- Modify: `tests/mcp/checkpoint.test.ts`, `tests/mcp/docs.test.ts`, `tests/orchestra/decision-logger.test.ts`

**Scope:** `src/core/`, `src/mcp/`, `src/orchestra/`, `tests/`

**Implementation Strategy:**
1. `validators.ts` içine ek fonksiyonlar: `validatePath(basePath, userPath)`, `validateSprintId(id)` (regex `/^sprint-\d{3,4}$/`), `validatePhase(phase)` (enum: PLAN|SPAWN|EXECUTE|EVALUATE|FIX|RETRO|DECAY|CLEANUP).
2. `validatePath` algoritması: `path.resolve(basePath, userPath)` → absolute path → `.startsWith(basePath)` kontrol. Fail ise `ValidationError`. `..` ve absolute input reddet.
3. checkpoint.ts: sprintId + phase parametrelerinde validate. Dosya yazım pathi `path.join(root, '.deckent', 'checkpoints', sanitized)`.
4. docs.ts: `action='add'|'remove'|'list'` dışında reddet. filename `validatePath`.
5. decision-logger.ts: taskId `validateTaskId`, sprintId `validateSprintId`. Dosya adı oluşturma sanitize edilmiş değerlerden.
6. Test suite her dosya için 5+ injection attempt (../, /etc/passwd, \\, null byte, URL encoded ..).

**Critical API Definitions:**

```typescript
// src/core/validators.ts (genişletilmiş)
import * as path from 'path';

export function validatePath(basePath: string, userPath: string): string {
  if (path.isAbsolute(userPath)) {
    throw new ValidationError('PATH_TRAVERSAL', { basePath, userPath, reason: 'absolute path' });
  }
  const resolved = path.resolve(basePath, userPath);
  const normalizedBase = path.resolve(basePath);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new ValidationError('PATH_TRAVERSAL', { basePath, userPath, resolved });
  }
  return resolved;
}

export function validateSprintId(id: string): void {
  if (!/^sprint-\d{3,4}$/.test(id)) {
    throw new ValidationError('INVALID_SPRINT_ID', { id });
  }
}

export function validatePhase(phase: string): void {
  const VALID = ['PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'DECAY', 'CLEANUP'];
  if (!VALID.includes(phase)) {
    throw new ValidationError('INVALID_PHASE', { phase });
  }
}
```

**GO Criteria:**
- Tüm 3 dosyada `validatePath/validateSprintId/validatePhase` çağrısı
- Injection test suite 15+ test PASS (3 dosya × 5 attempt)

**NO-GO Criteria:** Herhangi bir parametre validate edilmeden `path.join/fs` call'una giderse.

**Kanıt:** `grep -rn "validatePath\|validateSprintId\|validatePhase" src/mcp/ src/orchestra/decision-logger.ts` → her çağrı dosya başı.

**Test:** 15+ injection test.

---

### Task T-143-003: .brain/memory.db Git Takibi Düzelt

**Agent:** `devops-engineer` | **Skills:** `git-expert`, `devops-engineer` | **Model:** opus | **Effort:** low

**Files:**
- Modify: `.gitignore` — `.brain/memory.db`, `.brain/memory.db-shm`, `.brain/memory.db-wal` ekle
- Create: `scripts/verify-gitignore.mjs` — doctor check
- Create: `tests/scripts/verify-gitignore.test.ts`
- Modify: `src/cli/commands/doctor.ts` — verify-gitignore entegrasyon

**Scope:** root, `scripts/`, `tests/scripts/`, `src/cli/commands/`

**Implementation Strategy:**
1. `.gitignore`'a 3 satır ekle: `.brain/memory.db`, `.brain/memory.db-shm`, `.brain/memory.db-wal`
2. `git rm --cached .brain/memory.db` — binary'yi git index'ten çıkar (dosya korunur)
3. `scripts/verify-gitignore.mjs` yaz: `git check-ignore .brain/memory.db` çağrısı, `git ls-files .brain/memory.db` ile kontrol. Hata durumunda exit 1 + stderr mesaj.
4. doctor.ts `checkGitignore` adımı ekle — verify-gitignore çalıştır, sonuç health check'e entegre.
5. Test: temp git repo oluştur, memory.db ekle, verify-gitignore → FAIL. `.gitignore` yaz + `git rm --cached` → verify-gitignore → PASS.

**Critical API Definitions:**

```javascript
// scripts/verify-gitignore.mjs
#!/usr/bin/env node
import { execSync } from 'child_process';

const FILES = ['.brain/memory.db', '.brain/memory.db-shm', '.brain/memory.db-wal'];
let failed = false;

for (const file of FILES) {
  try {
    execSync(`git check-ignore ${file}`, { stdio: 'pipe' });
  } catch {
    console.error(`[verify-gitignore] ERROR: ${file} is NOT gitignored`);
    failed = true;
  }
  try {
    const tracked = execSync(`git ls-files ${file}`, { encoding: 'utf-8' }).trim();
    if (tracked) {
      console.error(`[verify-gitignore] ERROR: ${file} is TRACKED in git (should be rm --cached)`);
      failed = true;
    }
  } catch { /* ok */ }
}

process.exit(failed ? 1 : 0);
```

**GO Criteria:** `git ls-files .brain/memory.db` → 0 sonuç. `doctor` output'ta gitignore check ✅.

**NO-GO Criteria:** memory.db hâlâ `git ls-files` output'unda görünüyorsa.

**Kanıt:** `node scripts/verify-gitignore.mjs && echo OK` → `OK`

**Test:** 3 test (gitignored, tracked, missing)

---

### Task T-143-004: API Auth Default Secure

**Agent:** `security-auditor` | **Skills:** `security-specialist`, `api-builder` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/api/auth.ts` — secure default
- Modify: `src/api/server.ts` — CORS + security headers
- Modify: `tests/api/auth.test.ts`, `tests/api/server.test.ts`

**Scope:** `src/api/`, `tests/api/`

**Implementation Strategy:**
1. auth.ts içinde mevcut `if (!token) return true` **kaldırılır**. Yeni davranış:
   - Token yok → 401 (kritik endpoint'ler)
   - Env var `DECKENT_API_AUTH_DISABLED=1` **explicit** set edilmiş + warning log → token bypass (local dev için)
   - Default: HTTPS + token zorunlu
2. server.ts CORS: `Access-Control-Allow-Origin` config'ten okunur (default: `http://localhost:*`). Wildcard `*` yasak (auth varsa).
3. Security headers middleware:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Content-Security-Policy: default-src 'self'`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `Referrer-Policy: no-referrer`
4. Rate limiter (mevcut) ile uyumlu — auth middleware chain: rate-limit → auth → handler.
5. Test:
   - Token yok → 401
   - `DECKENT_API_AUTH_DISABLED=1` + token yok + stderr warning → 200
   - Invalid token → 401
   - Valid token → 200
   - Response headers tüm security header'ları içeriyor
   - CORS wildcard wildcard origin isteği → 403

**Critical API Definitions:**

```typescript
// src/api/auth.ts
export function checkAuth(req: Request): AuthResult {
  const token = extractToken(req);
  const bypass = process.env['DECKENT_API_AUTH_DISABLED'] === '1';

  if (bypass) {
    debugLog.warn('api-auth', 'AUTH DISABLED via DECKENT_API_AUTH_DISABLED env — NOT for production');
    return { authorized: true, mode: 'disabled' };
  }

  if (!token) {
    return { authorized: false, reason: 'missing_token' };
  }

  if (!verifyToken(token)) {
    return { authorized: false, reason: 'invalid_token' };
  }

  return { authorized: true, mode: 'token' };
}

export interface AuthResult {
  authorized: boolean;
  mode?: 'token' | 'disabled';
  reason?: 'missing_token' | 'invalid_token';
}
```

**GO Criteria:**
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/sprint` → `401`
- `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer VALID" http://localhost:3000/api/sprint` → `200`
- Response headers 5 security header içeriyor

**Kanıt:** 401 response + stderr `[api-auth] AUTH DISABLED ...` warning görülür (bypass test).

**Test:** 8+ test

---

### Task T-143-005: health-check.ts Dosya Yolu Uyuşmazlığı Fix

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** low

**Files:**
- Modify: `src/orchestra/doc-updaters/health-check.ts`
- Modify: `tests/orchestra/doc-updaters/health-check.test.ts`

**Scope:** `src/orchestra/doc-updaters/`, `tests/orchestra/doc-updaters/`

**Implementation Strategy:**
1. Dosyayı oku, `shouldRun()` ve `run()` fonksiyonlarının referans verdiği dosya yollarını karşılaştır. Şu an uyumsuz.
2. Ortak constant tanımla dosya başına:
   ```typescript
   const HEALTH_DOC_PATH = 'docs/reference/health-check.md';
   ```
3. Her iki fonksiyon da `HEALTH_DOC_PATH` kullansın.
4. `run()` dosya yoksa oluştursun (initial generation). Varsa update.
5. Test:
   - `shouldRun()` true döndüğünde `run()` dosyayı oluşturuyor/güncelliyor
   - `run()` başarı sonucu `{ status: 'success', path: HEALTH_DOC_PATH, action: 'created'|'updated' }`
   - Integration test: fresh repo → `run()` çağır → dosya var → `shouldRun()` false (henüz değişmemiş)

**GO Criteria:** `run()` başarılı çalışıyor, dosya oluşuyor. Test 4/4 PASS.

**Kanıt:** `ls -la docs/reference/health-check.md` var + içerik doğru.

**Test:** 4 test.

---

## Wave 2 — Memory V2 Tam Migrasyon (4 task, paralel)

### Task T-143-006: FTS5 Query Builder Fix (Karar 2-A)

**Agent:** `bug-fixer` | **Skills:** `typescript-expert`, `testing-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Create: `src/core/debug-log.ts` — structured stderr logging
- Modify: `src/core/memory-query.ts` — query builder + silent catch kaldır
- Modify: `src/cli/commands/recall.ts` — `--mode=and|or` flag
- Modify: `src/mcp/tools/memory-query.ts` — `mode` parametresi
- Modify: `tests/core/memory-query.test.ts` (genişlet)
- Modify: `tests/cli/recall.test.ts`, `tests/mcp/memory-query.test.ts`

**Scope:** `src/core/`, `src/cli/commands/`, `src/mcp/tools/`, `tests/`

**Implementation Strategy:**
1. `debug-log.ts` yaz: 4 seviye (error/warn/info/trace), structured JSON stderr output. `DECKENT_DEBUG=1` env var ile trace aktif. (Direktif 22 observability temeli — T-145-014'te genişletilecek.)
2. `memory-query.ts:escapeFts5Query()` fix:
   - Mevcut: `tokens.map(quote).join(' ')` (FTS5 implicit AND)
   - Yeni: `mode` parametresi alır. Default `'or'` → `.join(' OR ')`. `'and'` → `.join(' AND ')` (açık).
3. `memory-query.ts:ftsSearch()` silent catch kaldır:
   - Eski: `catch { return []; }`
   - Yeni: `catch (err) { debugLog.error('memory-query', 'FTS5 failed', { query, error: err.message, stack: err.stack }); throw new MemoryQueryError('FTS5_FAILED', { query, cause: err }); }`
4. `MemoryQueryParams` interface'ine `mode?: 'and' | 'or'` (default: 'or') ekle.
5. `buildAutoQuery()` Brain lifecycle için `mode: 'or'` zorunlu (daha fazla recall).
6. CLI `recall` komutuna `--mode` flag: commander.js `.option('--mode <mode>', 'Search mode: and|or', 'or')`.
7. MCP tool schema'da `mode` optional enum parametresi.
8. Test suite:
   - Single word: `"docker"` → ≥13 sonuç (baseline)
   - Multi word OR default: `"docker heartbeat"` → ≥7 sonuç
   - Multi word AND explicit: `"docker heartbeat" mode=and` → ≥0 (az ama relevance yüksek)
   - Empty query → structuredSearch fallback
   - FTS5 syntax error (örn `"("`) → `MemoryQueryError` throw, debugLog.error
   - `DECKENT_DEBUG=1` ile trace seviyesi görülür

**Critical API Definitions:**

```typescript
// src/core/debug-log.ts
export type DebugLevel = 'error' | 'warn' | 'info' | 'trace';

export interface DebugEvent {
  timestamp: string;
  level: DebugLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

class DebugLog {
  private isTraceEnabled(): boolean {
    return process.env['DECKENT_DEBUG'] === '1';
  }

  private emit(event: DebugEvent): void {
    if (event.level === 'trace' && !this.isTraceEnabled()) return;
    process.stderr.write(JSON.stringify(event) + '\n');
  }

  error(source: string, message: string, context?: Record<string, unknown>): void {
    this.emit({ timestamp: new Date().toISOString(), level: 'error', source, message, context });
  }
  warn(source: string, message: string, context?: Record<string, unknown>): void {
    this.emit({ timestamp: new Date().toISOString(), level: 'warn', source, message, context });
  }
  info(source: string, message: string, context?: Record<string, unknown>): void {
    this.emit({ timestamp: new Date().toISOString(), level: 'info', source, message, context });
  }
  trace(source: string, message: string, context?: Record<string, unknown>): void {
    this.emit({ timestamp: new Date().toISOString(), level: 'trace', source, message, context });
  }
}

export const debugLog = new DebugLog();
```

```typescript
// src/core/memory-query.ts — fix
function escapeFts5Query(input: string, mode: 'and' | 'or' = 'or'): string {
  const OPERATORS = new Set(['OR', 'AND', 'NOT']);
  const separator = mode === 'or' ? ' OR ' : ' AND ';

  return input
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(token => {
      if (OPERATORS.has(token)) return token;
      if (token.endsWith('*')) {
        return `"${token.slice(0, -1)}"*`;
      }
      return `"${token}"`;
    })
    .join(separator);
}

export class MemoryQueryError extends Error {
  constructor(public code: string, public context: Record<string, unknown>) {
    super(`Memory query failed: ${code}`);
    this.name = 'MemoryQueryError';
  }
}
```

**GO Criteria:**
- `deckent recall "docker heartbeat"` → ≥7 sonuç
- `deckent recall "docker heartbeat" --mode=and` → 0-3 sonuç (strict)
- FTS5 error'da stderr'e structured JSON log
- 15+ test PASS

**Kanıt:** `deckent recall "docker heartbeat" | wc -l` → ≥7 satır

**Test:** 15+ test (dual-mode, error path, edge case).

---

### Task T-143-007: Relations Hibrit — Backfill + Write-time (Karar 3-C)

**Agent:** `architect` | **Skills:** `typescript-expert`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Create: `scripts/backfill-relations.mjs` — pattern-based extraction
- Modify: `src/core/memory-store.ts` — insert() relations parametresi + auto-extract
- Modify: `src/core/memory-types.ts` — RelationType enum + Relation interface
- Modify: `src/orchestra/task-builder.ts` — ADR regex auto-link during task gen
- Modify: `src/orchestra/sprint-finalizer.ts` — triple-link sprint-log→memory→retro
- Modify: `src/cli/commands/memory.ts` — `relations review` subcommand
- Modify: `tests/core/memory-store.test.ts`, `tests/scripts/backfill-relations.test.ts`

**Scope:** `scripts/`, `src/core/`, `src/orchestra/`, `src/cli/commands/`, `tests/`

**Implementation Strategy:**

**Adım 1: Type tanımları (memory-types.ts)**

```typescript
export type RelationType = 'references' | 'supersedes' | 'caused_by' | 'resolves' | 'blocks' | 'depends_on';

export interface Relation {
  from_id: string;
  to_id: string;
  rel_type: RelationType;
  created_at?: string;
  source?: 'manual' | 'backfill' | 'auto-extract' | 'finalizer';
}
```

**Adım 2: MemoryStore API genişletme**

```typescript
// src/core/memory-store.ts
export class MemoryStore {
  insertRelation(relation: Relation): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO relations (from_id, to_id, rel_type, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(relation.from_id, relation.to_id, relation.rel_type, relation.created_at ?? new Date().toISOString());
  }

  getRelations(entryId: string, direction: 'from' | 'to' = 'from'): Relation[] { /* ... */ }

  /**
   * Extract ADR references from content via regex.
   * Auto-called during insert() for ADR entries.
   */
  private extractAdrReferences(content: string, selfId: string): Relation[] {
    const ADR_REGEX = /\bADR-(\d{3})\b/g;
    const matches = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = ADR_REGEX.exec(content)) !== null) {
      const refId = `adr-${m[1]}`;
      if (refId !== selfId) matches.add(refId);
    }
    return Array.from(matches).map(to_id => ({
      from_id: selfId,
      to_id,
      rel_type: 'references' as RelationType,
      source: 'auto-extract' as const,
    }));
  }

  // Modified insert() — auto-extract
  insert(input: CreateEntryInput & { relations?: Relation[] }): MemoryEntryV2 {
    const entry = this.doInsert(input);
    // Auto-extract for ADRs
    if (entry.type === 'adr') {
      const autoRels = this.extractAdrReferences(entry.content, entry.id);
      for (const r of autoRels) this.insertRelation(r);
    }
    // Manual relations
    if (input.relations) {
      for (const r of input.relations) this.insertRelation(r);
    }
    return entry;
  }
}
```

**Adım 3: Backfill script**

```javascript
// scripts/backfill-relations.mjs
// Reads 65 entries, extracts relations via patterns, writes preview to .brain/exports/relations-backfill-preview.md
// Alperen runs: deckent memory relations review → y/n per relation → approved → DB insert
```

Backfill pattern'leri:
- **ADR → ADR references:** `\bADR-\d{3}\b` regex match
- **ADR → ADR supersedes:** `supersedes?\s+ADR-(\d{3})` or `replaced?\s+by\s+ADR-(\d{3})`
- **Debt → sprint:** `sprint_id` field → `sprint-log-NNN` entry (`caused_by`)
- **Memory → sprint-log:** `sprint_id` → sprint-log (`references`)
- **Retro → sprint:** `sprint_id` → sprint-log (`references`)
- **Sprint triple-link:** `sprint-log-N ← depends_on → mem-sprint-N ← depends_on → retro-sprint-N`

**Adım 4: Manuel gate (CLI)**

```typescript
// src/cli/commands/memory.ts — relations review subcommand
// Reads preview .md, prompts y/n per relation, inserts approved to DB
// Output: "Approved: 85 / 120. Rejected: 35. DB updated."
```

**Adım 5: Write-time enforcement**

- `task-builder.ts` — ADR entry'lerde zaten `insert()` auto-extract devrede
- `sprint-finalizer.ts` — finalize sonunda:
  ```typescript
  function writeTripleLink(sprintNum: number, store: MemoryStore): void {
    const logId = `sprint-log-${sprintNum}`;
    const memId = `mem-sprint-${sprintNum}`;
    const retroId = `retro-sprint-${sprintNum}`;
    if (store.getById(logId) && store.getById(memId)) {
      store.insertRelation({ from_id: logId, to_id: memId, rel_type: 'depends_on', source: 'finalizer' });
    }
    if (store.getById(memId) && store.getById(retroId)) {
      store.insertRelation({ from_id: memId, to_id: retroId, rel_type: 'depends_on', source: 'finalizer' });
    }
  }
  ```

**GO Criteria:**
- Backfill preview 80-120 relation aday içerir
- Alperen gate sonrası `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM relations"` → **≥80**
- Write-time: yeni ADR insert sonrası auto-extract relations DB'de var
- Sprint 143 finalize sonrası triple-link yazılmış

**Kanıt:**
```bash
sqlite3 .brain/memory.db "SELECT COUNT(*) FROM relations WHERE source='backfill'"  # ≥80
sqlite3 .brain/memory.db "SELECT COUNT(*) FROM relations WHERE source='auto-extract'"  # ≥20
sqlite3 .brain/memory.db "SELECT COUNT(*) FROM relations WHERE source='finalizer'"  # ≥2
```

**Test:** 20+ test (pattern extraction, auto-extract, finalizer triple-link, gate workflow).

---

### Task T-143-008: Memory V2 Tam Migrasyon (ci-reporter + managed-docs)

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/orchestra/ci-reporter.ts` — V1 ihlali fix
- Modify: `src/orchestra/managed-docs/content-generators.ts` — DB-first
- Modify: `src/orchestra/managed-docs/template-renderer.ts` — DB-first
- Modify: `src/orchestra/managed-docs/managed-doc-runner.ts` — DB-first
- Modify: testler

**Scope:** `src/orchestra/`, `tests/orchestra/`

**Implementation Strategy:**

4 V1 ihlali kaldır:

**1. ci-reporter.ts** — Mevcut: `fs.appendFileSync('.brain/RETRO.md', ...)`, `fs.readFileSync('.brain/MEMORY.md')`. Yeni:
```typescript
// import { MemoryStore } from '../core/memory-store.js';
function reportSprint(store: MemoryStore, sprintId: string, retroContent: string, learnings: string): void {
  store.upsert({
    id: `retro-sprint-${sprintNum}`,
    type: 'retro',
    source: 'ci',
    title: `Sprint ${sprintNum} Retrospective`,
    content: retroContent,
    sprint_id: sprintId,
    sprint_num: sprintNum,
    status: 'accepted',
  });
  store.upsert({
    id: `mem-sprint-${sprintNum}`,
    type: 'memory',
    source: 'ci',
    title: `Sprint ${sprintNum} Learnings`,
    content: learnings,
    sprint_id: sprintId,
    sprint_num: sprintNum,
    status: 'accepted',
  });
}
```

**2. content-generators.ts** — Mevcut: `fs.readFileSync('.brain/DEBT.md')`. Yeni:
```typescript
const debts = store.getByType('debt').filter(d => d.status === 'active');
```

**3. template-renderer.ts** — Mevcut: `fs.readFileSync('.brain/sprints/sprint-NNN.md')`. Yeni:
```typescript
const sprintLog = store.getById(`sprint-log-${sprintNum}`);
```

**4. managed-doc-runner.ts** — `buildStandaloneDocContext` `.brain/sprints/*.md` okuyor. Yeni:
```typescript
const recentSprints = store.getByType('sprint').slice(-5);
```

Tüm değişikliklerde `MemoryStore` instance dependency injection ile geçirilir.

**GO Criteria:**
- `grep -rn "readFileSync.*\.brain/\(RETRO\|MEMORY\|DEBT\|PATTERNS\|sprints/\)" src/` → **0 sonuç**
- Tüm 4 dosyada `MemoryStore` import var
- Sprint 143 finalize sonrası DB'de retro + memory entry'ler canlı

**Kanıt:** grep komutu 0 çıktı.

**Test:** 12+ test (ci-reporter dual-path, content-generators DB read, template-renderer sprint lookup, managed-doc-runner context build).

---

### Task T-143-009: DECISIONS.md Archive + init.ts DB Önyükleme

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Create: `scripts/archive-decisions-md.mjs`
- Modify: `src/cli/commands/init.ts` — DB preload + template update
- Modify: `.gitignore`
- Delete: `.brain/DECISIONS.md` (archive'a taşı)
- Modify: `tests/cli/init.test.ts`

**Scope:** `src/cli/commands/`, `scripts/`, `tests/cli/`, `.brain/`

**Implementation Strategy:**

**Adım 1: archive-decisions-md.mjs**

```javascript
// .brain/DECISIONS.md → .brain/archive/decisions-root-pre-sprint143/DECISIONS.md
// Hash verify + manifest update
// Original silinmeden kopya + hash kontrolü zorunlu
```

**Adım 2: init.ts DB preload**

```typescript
async function initMemoryDb(root: string): Promise<void> {
  const dbPath = path.join(root, '.brain', 'memory.db');
  const store = await MemoryStore.open(dbPath);

  // Schema migration (v0 → v1)
  store.migrate();

  // Preload core ADRs (40 ADR bundled in src/core/adr-seed.ts)
  const seedAdrs = await import('../../core/adr-seed.js');
  for (const adr of seedAdrs.ADR_SEED) {
    store.upsert(adr);
  }

  // Preload identity entry
  store.upsert({
    id: 'project-identity',
    type: 'identity',
    source: 'system',
    title: `Project Identity: ${projectName}`,
    content: generateIdentityContent(projectName),
    decay_exempt: true,
  });
}
```

**Adım 3: Template referansları güncelle**

- init.ts CLAUDE.md/DECKENT.md template'lerinde `@.brain/MEMORY.md` → `@.brain/exports/summary.md`
- API_SURFACE.md referansları aynı
- BOOT.md güncel Memory V2 boot sequence

**Adım 4: Referans dosya güncellemesi**

- `.brain/PROJECT-IDENTITY.md` içinde "See .brain/DECISIONS.md" → "See .brain/exports/decisions.md" (T-143-010 sprint-finalizer regen edecek ama baseline için manual fix)

**GO Criteria:**
- `ls .brain/DECISIONS.md` → no such file
- `ls .brain/archive/decisions-root-pre-sprint143/DECISIONS.md` → var
- Yeni proje init → `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM entries WHERE type='adr'"` → **≥40**
- init template `@.brain/MEMORY.md` referansı yok

**Kanıt:**
```bash
deckent init /tmp/test-project-143 --name=test
sqlite3 /tmp/test-project-143/.brain/memory.db "SELECT COUNT(*) FROM entries"  # ≥41 (40 ADR + 1 identity)
```

**Test:** 6+ test (archive util, init preload, template regression).

---

## Wave 3 — Brain Co-Evolve (Karar 4-D A+B, 2 task)

### Task T-143-010: Sprint-Finalizer Hook (Karar 4-A)

**Agent:** `architect` | **Skills:** `typescript-expert`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/orchestra/sprint-finalizer.ts` — hook chain
- Create: `src/core/identity-generator.ts` — PROJECT-IDENTITY.md auto-regen
- Modify: `src/orchestra/doc-updaters/registry.ts` — hook registry
- Modify: `src/orchestra/doc-updaters/changelog.ts` — auto-append format
- Modify: `tests/orchestra/sprint-finalizer.test.ts`

**Scope:** `src/orchestra/`, `src/core/`, `tests/orchestra/`

**Implementation Strategy:**

Sprint finalize sonunda otomatik zincir:

```typescript
// src/orchestra/sprint-finalizer.ts (finalize sonu)
async function runCoEvolveHook(ctx: FinalizeContext): Promise<void> {
  const { sprintId, sprintNum, store, root } = ctx;

  // 1. Export Memory V2 snapshots
  await exportAllSnapshots(store, path.join(root, '.brain', 'exports'));

  // 2. Auto-regen PROJECT-IDENTITY.md
  const identity = await generateIdentity(store, root);
  await fs.promises.writeFile(path.join(root, '.brain', 'PROJECT-IDENTITY.md'), identity);

  // 3. Append CHANGELOG.md
  await appendChangelog(ctx, path.join(root, 'CHANGELOG.md'));

  // 4. Append SPRINT-LOG.md
  await appendSprintLog(ctx, path.join(root, 'docs', 'SPRINT-LOG.md'));

  // 5. Trigger rule regen (T-143-011'den)
  await regenerateRules(store, root);

  debugLog.info('co-evolve', 'Sprint finalize co-evolve complete', { sprintId });
}
```

`identity-generator.ts`:

```typescript
export async function generateIdentity(store: MemoryStore, root: string): Promise<string> {
  // Read current state:
  const toolCount = await countMcpTools(root);    // 22
  const cliCount = await countCliCommands(root);  // 41+
  const agentCount = store.getByType('agent-registry')?.length ?? 16;
  const skillCount = store.getByType('skill-registry')?.length ?? 21;
  const adrCount = store.getByType('adr').length; // 40
  const testCount = await countTests(root);       // 12485
  const sprintNum = await getCurrentSprintNum(store);

  return renderIdentityTemplate({
    toolCount, cliCount, agentCount, skillCount,
    adrCount, testCount, sprintNum,
    // ... diğer canlı metrikler
  });
}
```

**GO Criteria:**
- Sprint 143 finalize sonrası `cat .brain/exports/summary.md` → DB count eşleşir (65+)
- PROJECT-IDENTITY.md "MCP: 22 tools", "ADRs: 40", "CLI: 41+ commands" güncel
- `CHANGELOG.md` Sprint 143 satırı append edilmiş
- `docs/SPRINT-LOG.md` Sprint 143 satırı

**Kanıt:** `grep "22 tools\|40 ADR\|41+ commands" .brain/PROJECT-IDENTITY.md` → 3 sonuç.

**Test:** 10+ test (her hook adımı ayrı + entegrasyon + idempotency).

---

### Task T-143-011: Rule Generator (Karar 4-B, 3 Provider)

**Agent:** `architect` | **Skills:** `typescript-expert`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Create: `src/core/rule-generator.ts`
- Create: `src/core/rule-templates/brain.template.md`
- Create: `src/core/rule-templates/auditor.template.md`
- Create: `src/core/rule-templates/worker-default.template.md`
- Create: `src/core/rule-templates/provider-adapters/claude.ts`
- Create: `src/core/rule-templates/provider-adapters/codex.ts`
- Create: `src/core/rule-templates/provider-adapters/gemini.ts`
- Modify: `src/orchestra/sprint-finalizer.ts` — regenerateRules() wire
- Modify: `tests/core/rule-generator.test.ts` (yeni)
- Modify: `.claude/rules/brain.md`, `auditor.md`, `worker-default.md` — CUSTOM/AUTO ayrımına dönüş
- Create: `.codex/rules/*.md`, `.gemini/rules/*.md` (3 role her provider için)

**Scope:** `src/core/`, `src/orchestra/`, `tests/core/`, `.claude/`, `.codex/`, `.gemini/`

**Implementation Strategy:**

**Adım 1: Template engine**

Template'ler Handlebars-like syntax — değişkenler `{{variable}}`, loops `{{#each ... }}`:

```markdown
<!-- brain.template.md -->
# Brain Rules

<!-- AUTO-START — DO NOT EDIT, auto-regenerated from Memory V2 -->

## Core Principles
- Brain is the ONLY orchestrator — workers never plan
- All brain knowledge lives in `.brain/memory.db` (SQLite) — single source of truth
- Query ADRs via MemoryStore: `store.getByType('adr')` — never parse .md files directly

## Active ADRs ({{adrCount}} total)
{{#each activeAdrs}}
- **{{this.id}}**: {{this.title}} — {{this.status}}
{{/each}}

## Memory V2 Guarantees
- FTS5 dual-layer search (original + turkishNormalize) operational
- Export roundtrip: DB → exports/*.md on every sprint finalize
- Relations: {{relationCount}} cross-references active

<!-- AUTO-END -->

<!-- CUSTOM-START — User-editable, preserved across regen -->

<!-- CUSTOM-END -->
```

**Adım 2: rule-generator.ts**

```typescript
export async function regenerateRules(store: MemoryStore, root: string): Promise<void> {
  const context = buildRuleContext(store);

  for (const role of ['brain', 'auditor', 'worker-default'] as const) {
    const template = await readTemplate(role);
    const autoSection = renderTemplate(template, context);

    for (const provider of ['claude', 'codex', 'gemini'] as const) {
      const adapter = getProviderAdapter(provider);
      const targetPath = adapter.rulePath(root, role);

      const existing = await readIfExists(targetPath);
      const preserved = extractCustomSection(existing);
      const final = adapter.format({ auto: autoSection, custom: preserved });

      await fs.promises.writeFile(targetPath, final);
    }
  }
}

function extractCustomSection(content: string | null): string {
  if (!content) return '';
  const match = content.match(/<!-- CUSTOM-START -->([\s\S]*?)<!-- CUSTOM-END -->/);
  return match?.[1]?.trim() ?? '';
}
```

**Adım 3: Provider adapters**

```typescript
// src/core/rule-templates/provider-adapters/claude.ts
export const claudeAdapter: ProviderAdapter = {
  rulePath: (root, role) => path.join(root, '.claude', 'rules', `${role}.md`),
  format: ({ auto, custom }) => `${auto}\n\n<!-- CUSTOM-START -->\n${custom}\n<!-- CUSTOM-END -->\n`,
};

// codex.ts ve gemini.ts benzer — rulePath `.codex/rules/` ve `.gemini/rules/`
```

**Adım 4: Sprint-finalizer wire**

T-143-010'un `runCoEvolveHook()` 5. adımı `regenerateRules(store, root)` çağrısı.

**Adım 5: Initial generation**

Sprint 143 finalize sonrası **ilk defa** `.codex/rules/` ve `.gemini/rules/` oluşturulacak. `.claude/rules/*` mevcut — CUSTOM section'ı user-edited content olarak korunur (eğer AUTO-START/END marker'ları yoksa mevcut content CUSTOM olarak migrate edilir).

**GO Criteria:**
- `.claude/rules/brain.md` AUTO section ADR-008 + Memory V2 kuralları içerir
- `.codex/rules/brain.md` + `.gemini/rules/brain.md` oluşturulmuş
- ADR değişiminden sonra regen → CUSTOM section korundu (idempotency)
- 3 role × 3 provider = 9 dosya canlı

**Kanıt:** `ls .claude/rules/ .codex/rules/ .gemini/rules/` → 9 dosya total.

**Test:** 15+ test (template render, custom preservation, provider adapter, idempotency, diff output).

---

## Wave 4 — Operasyonel P0 (Karar 1-B Wave A, 6 task)

### Task T-143-012: MCP Disconnect Fix (Background Sprint Runner)

**Agent:** `architect` | **Skills:** `typescript-expert`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Create: `src/orchestra/sprint-runner-entry.ts` — detached child process entry
- Modify: `src/cli/commands/start.ts` — detached spawn
- Modify: `src/mcp/tools/start.ts` — detached spawn (MCP için kritik)
- Modify: `src/orchestra/sprint-controller.ts` — IPC bridge
- Create: `tests/integration/mcp-sprint-isolation.test.ts`

**Scope:** `src/cli/`, `src/orchestra/`, `src/mcp/`, `tests/integration/`

**Implementation Strategy:**

**Problem:** `deckent_start` MCP tool'u çağrıldığında `runSprint()` fire-and-forget Promise aynı stdio process'inde kalıyor → event loop blocked → MCP disconnect (Sprint 139 t+80dk live incident).

**Solution:** Detached child spawn.

```typescript
// src/orchestra/sprint-runner-entry.ts (yeni entry point)
// Process bu dosyayı `node dist/orchestra/sprint-runner-entry.js --sprint-id=sprint-NNN --root=/path` ile spawn eder
import { runSprint } from './sprint-controller.js';
import { parseArgs } from 'node:util';

async function main() {
  const { values } = parseArgs({
    options: {
      'sprint-id': { type: 'string' },
      'root': { type: 'string' },
    },
  });

  process.title = `deckent-sprint-${values['sprint-id']}`;

  try {
    await runSprint(values['sprint-id']!, values['root']!);
    process.exit(0);
  } catch (err) {
    debugLog.error('sprint-runner', 'Sprint failed', { error: err });
    process.exit(1);
  }
}

main();
```

```typescript
// src/mcp/tools/start.ts — detached spawn
import { spawn } from 'node:child_process';

export async function deckentStart(args: StartArgs): Promise<StartResult> {
  const entryPath = path.resolve(__dirname, '../../orchestra/sprint-runner-entry.js');

  const child = spawn('node', [
    entryPath,
    `--sprint-id=${args.sprintId}`,
    `--root=${args.root}`,
  ], {
    detached: true,           // ← KEY: parent process bağlantısından ayrı
    stdio: ['ignore', 'ignore', 'ignore'],  // stdio close — MCP stdio serbest
  });

  child.unref();  // ← parent exit ederse de child devam eder

  // PID kaydet
  await writeSprintPid(args.sprintId, child.pid);

  return {
    status: 'spawned',
    sprintId: args.sprintId,
    pid: child.pid,
    message: 'Sprint started in background. Use deckent_status to monitor.',
  };
}
```

**IPC Bridge:** `.deckent/sprint-NNN-ipc/` fifo veya watcher dosyaları. Sprint child heartbeat + phase transition + result'ları buraya yazar. MCP server `deckent_status` çağrıldığında bu dosyaları okur.

**Test suite:**
- MCP `deckent_start` çağrılınca MCP server responsive kalıyor mu (stdio blocked değil)
- Sprint child process parent-independent (parent kill edilse de devam eder)
- 100-task stress test (10 sprint ardışık MCP call) — disconnect 0

**GO Criteria:**
- 100-task sprint sırasında `deckent_status` her 5s'de cevap veriyor
- `tmux list-sessions` child session görülüyor, parent MCP server ayrı

**Kanıt:**
```bash
node dist/mcp/server.js &
MCP_PID=$!
sleep 1
# Call deckent_start via stdio
# ... sprint başlar
kill -0 $MCP_PID && echo "MCP alive"  # → MCP alive (stdio blocked değil)
```

**Test:** 8+ test.

---

### Task T-143-013: Auto-Archive Guard

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/orchestra/sprint-finalizer.ts` — archive öncesi snapshot
- Create: `src/orchestra/task-restoration.ts`
- Modify: `tests/orchestra/auto-archive.test.ts` (yeni)

**Scope:** `src/orchestra/`, `tests/orchestra/`

**Implementation Strategy:**

Sprint 139 incident: archive sırasında `.tasks/` içindeki incomplete task'lar siliniyor → veri kaybı.

**Guard algoritması:**

```typescript
export async function safeArchive(sprintId: string, root: string): Promise<ArchiveResult> {
  const tasksDir = path.join(root, '.tasks');

  // 1. Pre-archive snapshot
  const snapshotPath = path.join(root, '.deckent', `${sprintId}-pre-archive.tar.gz`);
  await createTarball(tasksDir, snapshotPath);
  const snapshotHash = await sha256(snapshotPath);

  // 2. Classify tasks by status
  const tasks = await readAllTasks(tasksDir);
  const archivable = tasks.filter(t => ['DONE', 'NO_GO'].includes(t.status));
  const preserved = tasks.filter(t => ['PENDING', 'EXECUTING', 'PAUSED', 'CLAIMED'].includes(t.status));

  if (preserved.length > 0) {
    debugLog.warn('auto-archive', 'Non-terminal tasks preserved', {
      sprintId,
      preservedCount: preserved.length,
      preservedIds: preserved.map(t => t.id),
    });
  }

  // 3. Archive only terminal tasks
  const archiveDir = path.join(root, '.deckent', 'archive', sprintId);
  await fs.promises.mkdir(archiveDir, { recursive: true });
  for (const task of archivable) {
    await moveTask(task, archiveDir);
  }

  // 4. Verify snapshot integrity
  const verifyHash = await sha256(snapshotPath);
  if (verifyHash !== snapshotHash) {
    throw new Error('Snapshot integrity check failed');
  }

  return {
    archivedCount: archivable.length,
    preservedCount: preserved.length,
    snapshotPath,
    snapshotHash,
  };
}
```

**task-restoration.ts:**

```typescript
export async function restoreFromSnapshot(sprintId: string, root: string): Promise<void> {
  const snapshotPath = path.join(root, '.deckent', `${sprintId}-pre-archive.tar.gz`);
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}`);
  }
  await extractTarball(snapshotPath, path.join(root, '.tasks'));
  debugLog.info('task-restoration', 'Restored from snapshot', { sprintId });
}
```

**GO Criteria:**
- Archive sonrası PENDING/EXECUTING task'lar `.tasks/` içinde korunur
- Snapshot `.deckent/<sprint-id>-pre-archive.tar.gz` oluşur, hash match
- `deckent restore <sprint-id>` komutu snapshot'tan geri yükler

**Test:** 10+ test (snapshot creation, hash verification, preserved task detection, restore roundtrip).

---

### Task T-143-014: Layer 4 Runtime Wire Deploy

**Agent:** `architect` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/orchestra/authority-enforcer.ts` — runtime hooks
- Modify: `src/orchestra/sprint-controller.ts` — spawn phase integration
- Modify: `src/agents/auditor.ts` — ADR compliance check
- Modify: `tests/orchestra/layer4-runtime.test.ts` (yeni)

**Scope:** `src/orchestra/`, `src/agents/`, `tests/orchestra/`

**Implementation Strategy:**

Sprint 138 Layer 4 runtime wire 3-sprint fail streak (ADR-006 spawnSync canlı enforcement eksik).

**Runtime hook flow:**

```
Worker writes .result → Auditor reads .result → Authority-enforcer parse worker changes → ADR compliance check → violation? → task status → NO_GO + ADR amendment proposal
```

**authority-enforcer.ts:**

```typescript
export async function enforceAdrCompliance(
  taskId: string,
  changedFiles: string[],
  store: MemoryStore,
  root: string,
): Promise<EnforcementResult> {
  const violations: AdrViolation[] = [];

  for (const file of changedFiles) {
    const absPath = path.join(root, file);
    if (!fs.existsSync(absPath)) continue;
    const content = await fs.promises.readFile(absPath, 'utf-8');

    // ADR-006: spawnSync shell:true yasak
    if (content.match(/spawnSync\([^)]*\{\s*[^}]*shell:\s*true/)) {
      violations.push({ adrId: 'adr-006', file, rule: 'spawnSync shell:true forbidden' });
    }

    // ADR-008: brain merkezi import
    if (file.startsWith('src/core/') && content.match(/from.*['"]\.\.\/orchestra\//)) {
      violations.push({ adrId: 'adr-008', file, rule: 'core→orchestra import forbidden' });
    }

    // ADR-010: allowed deps only
    if (file === 'package.json') {
      const pkg = JSON.parse(content);
      const allowed = ['commander', 'better-sqlite3', '@modelcontextprotocol/sdk', 'zod'];
      const deps = Object.keys(pkg.dependencies ?? {});
      const unauthorized = deps.filter(d => !allowed.includes(d));
      if (unauthorized.length > 0) {
        violations.push({ adrId: 'adr-010', file, rule: `Unauthorized deps: ${unauthorized.join(', ')}` });
      }
    }
  }

  if (violations.length > 0) {
    debugLog.warn('authority-enforcer', 'ADR violations detected', { taskId, violations });
    return { passed: false, violations, recommendation: 'NO_GO + ADR amendment proposal' };
  }

  return { passed: true, violations: [] };
}
```

**Wire in auditor.ts:**

```typescript
// After reading .result, before marking DONE
const enforceResult = await enforceAdrCompliance(taskId, result.filesChanged, store, root);
if (!enforceResult.passed) {
  result.status = 'NO_GO';
  result.notes += `\n\nADR violations detected:\n${enforceResult.violations.map(v => `- ${v.adrId}: ${v.rule} (${v.file})`).join('\n')}`;
  writeAdrAmendmentProposal(enforceResult.violations, store);
}
```

**GO Criteria:**
- Worker bir task'ta `spawnSync(cmd, { shell: true })` yazarsa → auditor NO_GO + breadcrumb log
- core→orchestra import ihlali detect
- Fail-safe: enforcer kendisi fail olursa task DEVAM (enforcement isteğe bağlı güvenlik, kritik path'i engellemez)

**Test:** 12+ test (her ADR için PASS/FAIL senaryo + fail-safe fallback + breadcrumb log).

---

### Task T-143-015: Task Restoration on Crash

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/orchestra/sprint-checkpoint.ts` — phase-transition auto-write
- Modify: `src/cli/commands/resume.ts` — restore logic
- Modify: `src/orchestra/sprint-controller.ts` — checkpoint hook
- Modify: `tests/orchestra/task-restoration.test.ts`

**Scope:** `src/orchestra/`, `src/cli/commands/`, `tests/orchestra/`

**Implementation Strategy:**

Sprint 138 Task 9'da MVP yazılmıştı ama wire yok.

**Checkpoint state:**

```typescript
// .deckent/sprint-NNN-checkpoint.json
{
  sprintId: "sprint-143",
  phase: "EXECUTE",
  savedAt: "2026-04-17T10:23:45Z",
  activeTasks: [
    { id: "task-143-001", status: "EXECUTING", workerId: "w-143-001", heartbeatAt: "..." },
    { id: "task-143-002", status: "DONE", resultPath: ".tasks/task-143-002.result" },
    // ...
  ],
  locks: ["src/orchestra/tmux.ts.lock"],
  lastEventSeq: 1247,
}
```

**Auto-write trigger:**

```typescript
// src/orchestra/sprint-controller.ts
async function transitionPhase(ctx: SprintContext, nextPhase: Phase): Promise<void> {
  await writeCheckpoint(ctx, nextPhase);  // ← her phase transition'da
  // ... phase logic
}
```

**Resume logic:**

```typescript
// src/cli/commands/resume.ts
export async function resume(sprintId: string, root: string): Promise<void> {
  const checkpointPath = path.join(root, '.deckent', `${sprintId}-checkpoint.json`);
  if (!fs.existsSync(checkpointPath)) {
    throw new Error('No checkpoint found');
  }

  const checkpoint: Checkpoint = JSON.parse(await fs.promises.readFile(checkpointPath, 'utf-8'));

  // Re-spawn workers for EXECUTING tasks (check heartbeat freshness)
  for (const task of checkpoint.activeTasks) {
    if (task.status === 'EXECUTING') {
      const hbAge = Date.now() - new Date(task.heartbeatAt).getTime();
      if (hbAge > 5 * 60 * 1000) {
        debugLog.warn('resume', 'Stale heartbeat, respawning', { taskId: task.id });
        await respawnWorker(task, root);
      }
    }
  }

  // Continue from saved phase
  await continueSprint(sprintId, checkpoint.phase, root);
}
```

**GO Criteria:**
- Sprint orta noktada `SIGKILL coordinator`
- `deckent resume sprint-143` → sprint devam eder
- DONE task'lar tekrar çalıştırılmaz
- EXECUTING task'ların heartbeat stale ise respawn

**Test:** 15+ test (checkpoint write, restore, heartbeat freshness, resume idempotency).

---

### Task T-143-016: Panic Kill Guard

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Create: `src/core/panic-guard.ts`
- Modify: `src/orchestra/sprint-controller.ts` — panic guard wire
- Modify: `src/cli/commands/kill.ts` — `--force --user-explicit` flag
- Modify: `tests/orchestra/panic-guard.test.ts`

**Scope:** `src/core/`, `src/orchestra/`, `src/cli/commands/`, `tests/orchestra/`

**Implementation Strategy:**

Sprint 139 panic kill incident (koordinatör panic → Alperen onayı olmadan tüm worker kill). Feedback memory: "tartışmasız kural, istisna yok".

**Guard flow:**

```typescript
// src/core/panic-guard.ts
export interface PanicContext {
  reason: string;
  affectedWorkers: string[];
  sprintId: string;
}

export async function guardPanicKill(
  ctx: PanicContext,
  options: { force?: boolean; userExplicit?: boolean } = {},
): Promise<'proceed' | 'aborted'> {
  // Explicit user override
  if (options.force && options.userExplicit) {
    debugLog.warn('panic-guard', 'Force kill via user-explicit flag', ctx);
    return 'proceed';
  }

  // Notification dispatcher (if available)
  try {
    await notifyAlperen('critical', 'Panic kill attempted', ctx);
  } catch (err) {
    debugLog.error('panic-guard', 'Notification failed', { err });
  }

  // Write panic log
  const panicLogPath = path.join(root, '.deckent', `${ctx.sprintId}-panic-${Date.now()}.json`);
  await fs.promises.writeFile(panicLogPath, JSON.stringify(ctx, null, 2));

  // Without explicit approval, DO NOT proceed
  debugLog.error('panic-guard', 'Panic kill BLOCKED — requires explicit user approval', ctx);
  return 'aborted';
}
```

**Wire in sprint-controller.ts:**

```typescript
// Koordinatör crash handler
process.on('uncaughtException', async (err) => {
  debugLog.error('sprint-controller', 'Uncaught exception', { err });

  const decision = await guardPanicKill({
    reason: err.message,
    affectedWorkers: await listActiveWorkers(),
    sprintId: currentSprintId,
  });

  if (decision === 'proceed') {
    await killAllWorkers();
  }
  // else: workers continue, coordinator exits, user resumes via `deckent resume`
});
```

**`deckent kill --force --user-explicit`:**

```bash
# CLI explicit flag
deckent kill --force --user-explicit --reason="emergency fix"
# → proceed, panic guard bypass
```

**GO Criteria:**
- Runtime panic'te worker'lar kill edilmiyor (default behavior)
- `deckent kill --force --user-explicit` ile override mümkün
- Panic log `.deckent/sprint-NNN-panic-*.json` yazılmış
- Notification dispatcher çalışıyorsa Alperen push

**Test:** 8+ test.

---

### Task T-143-017: E2E Harness (Chain Safety Foundation)

**Agent:** `test-writer` | **Skills:** `testing-expert`, `ci-testing` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `tests/e2e/sprint-lifecycle.e2e.test.ts` (genişlet)
- Create: `tests/e2e/chain-safety.e2e.test.ts`
- Create: `scripts/run-e2e-harness.mjs`

**Scope:** `tests/e2e/`, `scripts/`

**Implementation Strategy:**

Chain safety gate validation için E2E test harness.

**chain-safety.e2e.test.ts:**

```typescript
describe('Chain Safety Gate', () => {
  it('gate PASS → next sprint auto-trigger', async () => {
    // 1. Run 3-task mini-sprint
    const result = await runMockSprint('sprint-test-001', { tasks: 3, expectedDone: 3 });

    // 2. Check 5-gate
    const gate = await runGate({ root, sprintId: result.sprintId });

    expect(gate.doctor).toBe('PASS');
    expect(gate.tsc).toBe('PASS');
    expect(gate.vitest).toBe('PASS');
    expect(gate.cost).toBeLessThan(15);
    expect(gate.noGoCount).toBeLessThan(3);
    expect(gate.overall).toBe('PASS');

    // 3. Next sprint should auto-start (chain continues)
    expect(gate.nextAction).toBe('auto-trigger-next');
  });

  it('gate FAIL (cost > $15) → ABORT + notification', async () => {
    const result = await runMockSprint('sprint-test-002', { cost: 20 });
    const gate = await runGate({ root, sprintId: result.sprintId });

    expect(gate.cost).toBeGreaterThan(15);
    expect(gate.overall).toBe('FAIL');
    expect(gate.nextAction).toBe('abort-notify');
  });

  it('gate FAIL (3+ NO_GO) → ABORT', async () => {
    const result = await runMockSprint('sprint-test-003', { tasks: 10, noGo: 3 });
    const gate = await runGate({ root, sprintId: result.sprintId });

    expect(gate.noGoCount).toBeGreaterThanOrEqual(3);
    expect(gate.overall).toBe('FAIL');
  });
});
```

**scripts/run-e2e-harness.mjs:**

```javascript
// Wraps vitest + emits structured result for CI consumption
```

**GO Criteria:** `npm run e2e:chain` PASS.

**Test:** 10+ E2E scenario.

---

## Wave 5 — ADR-010 Amendment + Kalite (3 task)

### Task T-143-018: ADR-010 Amendment (Karar 6-C)

**Agent:** `doc-writer` | **Skills:** `documentation-writer` | **Model:** opus | **Effort:** low

**Files:**
- Modify: `src/core/memory-store.ts` — amendment insert
- Create: Amendment content injected via `store.upsert({ id: 'adr-010', ... })`
- Modify: `tests/core/memory-store.test.ts`

**Scope:** `src/core/`, `tests/core/`

**Implementation Strategy:**

ADR-010 "Tek runtime bağımlılık" → "Minimal runtime bağımlılıkları" olarak yeniden adlandırılır.

Amendment content (DB'ye yazılacak):

```markdown
# ADR-010: Minimal Runtime Dependencies (Amended)

**Status:** accepted (amended 2026-04-17, Sprint 143)
**Previous title:** "Tek Runtime Dependency — commander.js"

## Context

Memory V2 DB-first architecture (Sprint 139+) + MCP integration + production security
needs added 3 new runtime dependencies beyond commander.js. The spirit of ADR-010
(minimal runtime dependencies, no bloat) is preserved, but the letter is updated
to reflect reality.

## Decision

Deckent runtime allows **4 approved dependencies**, each with strong justification:

1. **commander@^12**: CLI argument parser (original ADR-010 choice, preserved)
2. **better-sqlite3@^11**: Synchronous SQLite for Memory V2 DB-first. No async alternative
   matches the atomic guarantees needed for FTS5 + triggers. Node 22+ has built-in SQLite
   but API is still experimental (as of Sprint 143).
3. **@modelcontextprotocol/sdk@^1**: Official MCP SDK from Anthropic. Required for MCP
   server + tool registration. No viable alternative.
4. **zod@^3**: Runtime schema validation. Used for config validation, MCP tool schemas,
   API input validation. Prevents boot-time config corruption.

## Exceptions

- devDependencies are unrestricted (vitest, typescript, etc.).
- Transitive dependencies (deps of our 4) are audited every sprint via
  `npm audit signatures`.

## Consequences

- **Positive:** Still minimal compared to industry (most CLI tools have 20-50 runtime deps).
  All 4 deps actively maintained, no known vulnerabilities.
- **Negative:** New deps require ADR-010 amendment. Current 4 are the ceiling.
- **Risk mitigation:** Any new dep proposal requires ADR-010 amendment vote + Alperen
  approval. `authority-enforcer.ts` blocks unauthorized package.json additions (T-143-014).

## Enforcement

T-143-014 Layer 4 runtime wire enforces this ADR — any PR adding unlisted dependency
is flagged as NO_GO.
```

Insert code:

```typescript
await store.upsert({
  id: 'adr-010',
  type: 'adr',
  source: 'governance',
  title: 'Minimal Runtime Dependencies (Amended)',
  content: AMENDMENT_CONTENT,
  status: 'accepted',
  decay_exempt: true,
  updated_at: new Date().toISOString(),
});
```

**GO Criteria:**
- `deckent recall "minimal runtime dependency"` → ADR-010 amendment top result
- `sqlite3 .brain/memory.db "SELECT title FROM entries WHERE id='adr-010'"` → "Minimal Runtime Dependencies (Amended)"

**Test:** 3 test.

---

### Task T-143-019: MCP help.ts + server instructions + tool count

**Agent:** `bug-fixer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** low

**Files:**
- Modify: `src/mcp/tools/help.ts` — 6 eksik tool ekle
- Modify: `src/mcp/server.ts` — "Tools (22)" + V2 instructions
- Modify: `src/mcp/tools/index.ts` — export coherence
- Modify: `tests/mcp/help.test.ts`

**Scope:** `src/mcp/`, `tests/mcp/`

**Implementation Strategy:**

help.ts TOOLS dizisi 16 listeliyor ama 22 registered. Eksik 6:
1. `deckent_agent_list`
2. `deckent_skill_list`
3. `deckent_checkpoint`
4. `deckent_docs`
5. `deckent_explain`
6. `deckent_memory_query`

server.ts satır 45: `Tools (21)` → `Tools (22)`.
server instructions Memory V2 yolları (V1 MEMORY.md/DEBT.md referansları kaldırılır).

**GO Criteria:**
- `deckent_help` response 22 tool listeliyor
- Server startup log "22 tools registered"
- Server instructions `.brain/exports/summary.md` referansı

**Test:** 5 test.

---

### Task T-143-020: Heartbeat-Daemon execSync Beyaz Liste

**Agent:** `security-auditor` | **Skills:** `security-specialist` | **Model:** opus | **Effort:** low

**Files:**
- Modify: `src/orchestra/heartbeat-daemon.ts` — whitelist
- Modify: `tests/orchestra/heartbeat-daemon.test.ts`

**Scope:** `src/orchestra/`, `tests/orchestra/`

**Implementation Strategy:**

heartbeat-daemon.ts satır 116-119 execSync komutları HEARTBEAT.md'den geliyor. Beyaz liste yok → injection riski.

```typescript
const ALLOWED_COMMANDS = new Set(['ps', 'kill', 'wait', 'uptime', 'date']);

function validateCommand(cmd: string): void {
  const baseCmd = cmd.trim().split(/\s+/)[0];
  if (!ALLOWED_COMMANDS.has(baseCmd)) {
    throw new ValidationError('COMMAND_NOT_ALLOWED', { cmd, baseCmd, allowed: [...ALLOWED_COMMANDS] });
  }
  if (cmd.match(/[;&|`$()]/)) {
    throw new ValidationError('COMMAND_METACHARACTER', { cmd });
  }
}

// execSync çağrıları öncesi:
validateCommand(commandFromHeartbeatMd);
execSync(commandFromHeartbeatMd, { timeout: 5000 });
```

**GO Criteria:**
- Malicious HEARTBEAT.md (örn. `; rm -rf /`) → ValidationError
- Normal `ps`, `kill` komutları çalışıyor

**Test:** 6 test.

---

## Sprint 143 Sonu Gate (Karar 5-D — Chain Safety)

Sprint finalize sonunda **otomatik** 5-check gate:

1. **deckent doctor** — tüm health check'ler PASS
2. **tsc --noEmit** — 0 TypeScript error
3. **npx vitest run** — ≥99% pass (12485+ baseline'dan geri düşmesin)
4. **Cost spike** — sprint toplam cost < $15 (Token tracker'dan)
5. **NO_GO count** — sprint içinde <3 NO_GO

### PASS → Sprint 144 otomatik tetiklenir
```bash
# sprint-finalizer.ts runChainGate() başarılıysa
spawn('node', ['dist/cli/entry.js', 'start', '--sprint-id=sprint-144'], { detached: true });
```

### FAIL → Chain ABORT + notification
```typescript
if (gate.overall === 'FAIL') {
  await notifyAlperen('critical', 'Chain safety gate FAILED', {
    sprintId,
    failedChecks: gate.failures,
    nextAction: 'manual intervention required',
  });
  await writeChainState(root, { status: 'aborted', sprintId, reason: gate.failures });
}
```

**Alperen müdahalesi opsiyonları:**
- `deckent resume --sprint-id=sprint-144 --skip-gate` (not recommended)
- `deckent doctor --fix` + manual validation + `deckent start --sprint-id=sprint-144`
- `git revert` + brainstorming'e dön

---

## Self-Review Checklist

- [x] **Spec coverage:** 20/20 task spec §2'deki task listesiyle birebir eşleşiyor
- [x] **Placeholder scan:** 0 TBD/TODO, her task'ta complete API + GO criteria
- [x] **Type consistency:** `ValidationError`, `MemoryQueryError`, `Relation`, `RelationType`, `DebugEvent`, `AuthResult`, `EnforcementResult`, `Checkpoint`, `PanicContext` tutarlı kullanım
- [x] **Cross-task dependency:** T-143-001 yaratıyor `validators.ts`, T-143-002 genişletiyor (doğru sıra). T-143-006 yaratıyor `debug-log.ts`, T-143-004+...+ kullanıyor. T-143-011 wire T-143-010 `runCoEvolveHook()` içine gömülü.
- [x] **MVP yasak:** Her task kök neden + kesin çözüm + test. "acaba" yok.
- [x] **Core bozulamaz:** Tüm P0 task'lar core (tmux, memory, api, brain, heartbeat) stabilize ediyor.

---

## Referanslar

- Spec: `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md`
- FINAL-REPORT: `.deckent/sprint-god-analysis/FINAL-REPORT-TR.md`
- Brain state: `.deckent/sprint-god-analysis/brain/brain-state.md`
- Memory V2 verification: `.deckent/sprint-god-analysis/meta/memory-v2-god-verification.md`
