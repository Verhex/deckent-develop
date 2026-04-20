# DIRECTIVES — Sprint 149: Hybrid Foundation + God-Level Start + Debt Liquidation + Beta GA Prep

> **Sprint tipi:** Beta-kritik foundation, god-level roadmap başlangıç (Sprint 150 Beta GA'ya 1 gün kaldı)
> **Önceki sprint:** sprint-148 (27/28 DONE, 1 TD, 1 NO_GO T-148-020, 1h 0m, ADR-041 proposed)
> **Tema:** "Hybrid Foundation — `deckent_style` toggle + messaging trio + DeckentHub + P0 security + doc consolidation + Sprint 148 debt tasfiyesi"
> **Toplam task:** 27
> **Hard cap:** 8h (28800000 ms)
> **Cost cap:** $130 soft alert
> **Wave sayısı:** 6 block × 2-4 wave iterasyon
> **Planning mode:** structured (AI mode Sprint 148'de fail, Sprint 149'da tekrar denenmeyecek — stable mode)
> **Fallback:** Katastrofik fail → Sprint 150 numaratör +1, Beta GA Cuma 24 Nis'e kayar (1 gün gecikme kabul)

## Referanslar (Canonical Anchor Documents)
- **Master Roadmap:** `docs/ROADMAP-GOD-LEVEL.md` (334 satır, Sprint 149-200 kanonik)
- **Design Spec:** `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md` (Sprint 148 + yansıma)
- **Beta Tracker:** `BETA-TRACKER.md` (15-gate exit criteria)
- **Competitive:** `docs/analysis/competitive-analysis.md` (OpenClaw 346K star / 5 ay analiz)
- **God-Analysis:** `.deckent/sprint-god-analysis/FINAL-REPORT.md` (233 findings, 15 critical)
- **Sprint 148 retro:** `.brain/archive/retro-sprint-148.md` (27/28 DONE, agent taksonomi reform canlı)
- **Memory anchors:**
  - `project_roadmap_god_level.md` — Sprint 149-200 canlı plan
  - `feedback_openclaw_not_openhands.md` — rakip OpenClaw tartışmasız
  - `feedback_test_agent_removal.md` — test-writer kaldırıldı kalıcı

## Goal

Sprint 149 Deckent'in **Beta GA öncesi son sağlam foundation sprint'i**. 6 block × 27 task:
1. **Block A — Mode Architecture** (4 task): `deckent_style: "sprint" | "task"` config toggle + `deckent mode` CLI + sprint-controller mode-aware routing
2. **Block B — P0 Security + Sprint 148 Debt** (5 task): Dockerfile USER non-root + `.deck` interpolation + Docker worker exit fix + scope sanitizer fix + auditor stale race
3. **Block C — Messaging Trio** (6 task): `src/connectors/` IMessageConnector + Discord + Telegram + WhatsApp scaffold + connector pool + webhook router
4. **Block D — DeckentHub + Ed25519** (5 task): signature.ts + VerhexIO/deckent-hub repo create + 20 seed skill + `deckent skill publish` CLI + CI workflow
5. **Block E — Doc Consolidation** (4 task): 388 .md interaktif review + README overhaul + AGENTS.md refresh + TR/EN parity
6. **Block F — Release Prep** (3 task): ADR-041 accept + ADR-042 draft + npm pack dry-run v1.0.0-beta.1 + public repo hazırlık

**Sprint 150 Beta GA Per 23 Nis TRT** için bu sprint **zorunlu geçiş**.

## Sprint 148'den Taşınan Debt (8 item entegre)

| Debt Kaynak | Öncelik | Sprint 149 Task |
|-------------|---------|-----------------|
| T-148-020 Vitest Docker worker exit NO_GO | P0 | T-149-007 |
| T-148-022 Docker HB fix partial | P0 | T-149-007 (birleşik) |
| Scope sanitizer code snippet false positive | P1 | T-149-008 |
| Auditor stale alert race (assigned not spawned) | P1 | T-149-009 |
| AI planning mode provider error (2 sprint fail) | P2 | Ertelendi Sprint 151 (Sprint 149 structured) |
| Dockerfile runs as root (god-analysis P1) | P0 | T-149-005 |
| `.deck` → config interpolation yok | P1 | T-149-006 |
| test-writer PROMPT.md kalıntıları | P2 | T-149-020 (doc consolidation içinde) |

---

## KRİTİK KURAL — Koordinatör Disiplin

**Sprint canlı iken `src/` müdahale YASAK** (Sprint 144-148 lesson 5 sprint streak). Koordinatör sadece izler, event-stream + status + .tasks/ monitor. Worker scope'u task.json'daki `scope.filesWrite` ile sınırlıdır (ADR-037 RBAC).

**test-writer agent YASAK** (Sprint 148 reform kalıcı) — Sprint 149 worker assignments'ta `grep test-writer` = 0 olmalı.

**Ana PID Constraint** (Sprint 148 T-007) — Worker process'te `nervous.init()` çağrısı YASAK (`NERVOUS_SCOPE_VIOLATION` event emit + throw).

---

# BLOCK A — Mode Architecture (4 task, Wave 1)

## Task 1: `deckent_style` Config Key — 3-Layer Integration

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config-types.ts, src/core/config.ts, src/core/config-defaults.ts, tests/core/deckent-style-config.test.ts
- Scope: src/core/, tests/core/

### Description
`deckent_style: "sprint" | "task"` config key ekle. 3-layer merge (defaults → global → project) zaten var (ADR-004), sadece interface + default + metadata + validation ekleme.

`src/core/config-types.ts` DeckentConfig interface'ine (line ~280):
```typescript
export interface DeckentConfig {
  // ... existing fields ...
  /** Active runtime style — sprint (developer orchestration) or task (one-shot life assistant) */
  deckent_style?: 'sprint' | 'task';
}

export interface ResolvedConfig extends DeckentConfig {
  deckent_style: 'sprint' | 'task';  // always resolved
}
```

`src/core/config-defaults.ts` veya `src/core/config.ts` `createDefaultConfig()` (line ~497):
```typescript
return {
  // ... existing defaults ...
  deckent_style: 'sprint',  // developer-default, user can switch
};
```

`src/core/config.ts` `validateConfig()` (line ~168-436) enum check ekle:
```typescript
if (config.deckent_style !== undefined && !['sprint', 'task'].includes(config.deckent_style)) {
  throw new ConfigValidationError(`deckent_style must be 'sprint' or 'task', got: ${config.deckent_style}`);
}
```

`src/core/config.ts` `CONFIG_METADATA` (line ~896) entry ekle:
```typescript
deckent_style: {
  description: 'Active runtime style: "sprint" for developer orchestration, "task" for one-shot life assistant',
  default: 'sprint',
  enum: ['sprint', 'task'],
  category: 'core',
  userFacing: true,
}
```

Env var override destekle (line ~675): `DECKENT_STYLE` → `config.deckent_style`.

### Test (6 test)
1. Default config → `deckent_style === 'sprint'`
2. Global config `{deckent_style: 'task'}` → loadConfig returns 'task'
3. Project config 'task' override → project kazanır (3-layer merge)
4. Invalid value `'turbo'` → ConfigValidationError
5. `DECKENT_STYLE=task` env var → override
6. `tsc --noEmit` union type check (strict)

**Kanıt:** `npx vitest run tests/core/deckent-style-config.test.ts` 6/6 PASS.

---

## Task 2: `deckent mode` CLI Command

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/mode.ts, src/cli/entry.ts, tests/cli/mode-command.test.ts
- Scope: src/cli/, tests/cli/

### Description
Yeni CLI komut `deckent mode` — mevcut mode göster + switch + auto-detect.

`src/cli/commands/mode.ts` (~150 LoC):
```typescript
import { Command } from 'commander';
import { loadConfig, setConfigValue } from '../../core/config.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function registerMode(program: Command): void {
  const mode = program.command('mode').description('Get/set deckent_style (sprint|task|auto)');

  mode.command('show').description('Show current mode').action(async () => {
    const config = await loadConfig();
    console.log(`Current: ${config.deckent_style ?? 'sprint'} (from ${config._source ?? 'default'})`);
  });

  mode.command('sprint').description('Switch to sprint mode').action(async () => {
    await setConfigValue('deckent_style', 'sprint', 'project');
    console.log('✓ Switched to sprint mode (project override)');
  });

  mode.command('task').description('Switch to task mode').action(async () => {
    await setConfigValue('deckent_style', 'task', 'project');
    console.log('✓ Switched to task mode (project override)');
  });

  mode.command('auto').description('Auto-detect mode from context').action(async () => {
    const hasGitRepo = existsSync(join(process.cwd(), '.git'));
    const hasDirectives = existsSync(join(process.cwd(), 'DIRECTIVES.md'));
    const inferredStyle = (hasGitRepo && hasDirectives) ? 'sprint' : 'task';
    await setConfigValue('deckent_style', inferredStyle, 'project');
    console.log(`✓ Auto-detected: ${inferredStyle} (git=${hasGitRepo}, directives=${hasDirectives})`);
  });

  mode.command('global <style>').description('Set global default (sprint|task)').action(async (style) => {
    if (!['sprint', 'task'].includes(style)) throw new Error(`Invalid: ${style}`);
    await setConfigValue('deckent_style', style as 'sprint' | 'task', 'global');
    console.log(`✓ Global default set: ${style}`);
  });
}
```

`src/cli/entry.ts` register:
```typescript
import { registerMode } from './commands/mode.js';
// ...
registerMode(program);
```

### Test (5 test)
1. `deckent mode show` → current mode printed
2. `deckent mode sprint` → config written to project
3. `deckent mode task` → config written to project
4. `deckent mode auto` + git+DIRECTIVES → 'sprint'
5. `deckent mode auto` + no git → 'task'

**Kanıt:** Manuel test `node dist/cli/entry.js mode show` + `mode sprint` + validation.

---

## Task 3: Sprint Controller Mode-Aware Routing

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-controller.ts, src/orchestra/task-mode-runner.ts (NEW), tests/orchestra/mode-aware-routing.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
`config.deckent_style === 'task'` ise sprint lifecycle bypass. Mevcut `deckent_run` MCP tool / `deckent run` CLI command tek-adım task akışı var — `task-mode-runner.ts` bunu merkezileştir.

`src/orchestra/task-mode-runner.ts` (~250 LoC) yeni dosya:
```typescript
import type { DeckentConfig, Task } from '../core/config-types.js';
import { buildRunTask } from '../cli/commands/run.js';
import { spawnWorkerMultiProvider } from '../agents/worker.js';
import { eventBus } from './event-bus.js';

export interface TaskModeContext {
  description: string;
  scope?: { directories?: string[]; filesWrite?: string[] };
  model?: 'opus' | 'sonnet' | 'haiku';
  timeoutMs?: number;
}

export async function runTaskMode(ctx: TaskModeContext, config: DeckentConfig): Promise<{ jobId: string; result?: TaskResult }> {
  if (config.deckent_style !== 'task') {
    throw new Error('runTaskMode called but config.deckent_style !== "task"');
  }

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const task = buildRunTask({ id: taskId, description: ctx.description, model: ctx.model ?? 'sonnet', scope: ctx.scope });

  eventBus.emit('deckent-event', { type: 'TASK_MODE_START', taskId, style: 'task', timestamp: new Date().toISOString() });

  const jobId = await spawnWorkerMultiProvider(task, { autoApprove: true, timeout: ctx.timeoutMs ?? 300000 });
  return { jobId };
}
```

`src/orchestra/sprint-controller.ts` başlangıç kontrol (line ~100):
```typescript
export async function runSprint(root: string, config: DeckentConfig): Promise<SprintResult> {
  // NEW: Task mode routing
  if (config.deckent_style === 'task') {
    throw new Error('Sprint mode required for runSprint. Use runTaskMode for task style. Set deckent_style=sprint or run `deckent mode sprint`.');
  }
  // ... existing sprint lifecycle ...
}
```

### Test (8 test)
1. config.deckent_style='sprint' → runSprint OK
2. config.deckent_style='task' → runSprint throws
3. runTaskMode → jobId + event emitted
4. runTaskMode with task style → success
5. runTaskMode with sprint style → throws (mismatch guard)
6. Task mode bypasses PLAN/SPAWN/EXECUTE/EVALUATE phases
7. Task mode event stream `TASK_MODE_START` visible
8. Integration: `deckent run "ls files"` in task mode works

**Kanıt:** `npx vitest run tests/orchestra/mode-aware-routing.test.ts` 8/8 PASS.

---

## Task 4: Nervous System Mode-Aware Detectors

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/detectors/task-mode-idle.ts (NEW), src/nervous/detector-registry.ts (patch), tests/nervous/detectors/task-mode-idle.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Task mode için yeni detector: kullanıcı 5 dakikadan uzun idle kalırsa hatırlatma öner (balanced preset → suggest-30m).

`src/nervous/detectors/task-mode-idle.ts` (~100 LoC):
```typescript
import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';

export class TaskModeIdleDetector {
  readonly detectorId = 'task-mode-idle';

  constructor(private readonly idleThresholdMs = 300000) {}  // 5 minutes

  detect(ctx: DetectorContext): DetectorResult | null {
    // Only in task mode
    if ((ctx as any).config?.deckent_style !== 'task') return null;

    // Only cron events
    if (ctx.event.source !== 'cron') return null;

    const lastActivity = (ctx as any).lastUserActivity;
    if (!lastActivity) return null;

    const idleMs = ctx.now.getTime() - new Date(lastActivity).getTime();
    if (idleMs < this.idleThresholdMs) return null;

    return {
      risk: 'low',
      shouldNotify: true,
      severity: 'info',
      groupKey: `task-mode-idle:${Math.floor(idleMs / 60000)}m`,
      suggestedActions: [{
        id: 'METRIC_EMIT',
        label: `User idle ${Math.floor(idleMs / 60000)} min — suggest check-in`,
        risk: 'low' as const,
        payload: { idleMs, mode: 'task' },
      }],
      metadata: { type: 'task-mode-idle', idleMs },
    };
  }
}
```

DetectorRegistry (patch) — registered if config `nervous_system.detectors.task_mode_idle.enabled=true`.

### Test (4 test)
1. Task mode + idle < 5min → null
2. Task mode + idle > 5min → info notification
3. Sprint mode + any idle → null (detector skip)
4. Non-cron event → null

**Kanıt:** `npx vitest run tests/nervous/detectors/task-mode-idle.test.ts` 4/4 PASS.

---

# BLOCK B — P0 Security + Sprint 148 Debt (5 task, Wave 2)

## Task 5: Dockerfile USER Non-Root

- Model: sonnet
- Effort: low
- Skills: docker-expert, devops-engineer
- Files: Dockerfile, tests/backends/docker-non-root.test.ts
- Scope: ./, tests/backends/

### Description
God-analysis P1 finding #7: Dockerfile runs as root. Düzelt.

`Dockerfile` değişiklik (baştan okuma yap, USER directive ekle):
```dockerfile
# ... existing FROM, WORKDIR, COPY, RUN steps ...

# After dependency install, before CMD
RUN groupadd -r deckent && useradd -r -g deckent -m -d /home/deckent deckent \
    && mkdir -p /app /home/deckent/.deckent \
    && chown -R deckent:deckent /app /home/deckent

USER deckent
WORKDIR /home/deckent/app

# ... CMD/ENTRYPOINT ...
```

**NOT:** Worker.sh scripts `mkdir` operations Docker user context'inde çalışmalı. Permission errors'ı test et.

### Test (4 test)
1. Dockerfile USER directive present (`grep USER Dockerfile`)
2. Docker build success
3. `docker run deckent whoami` → `deckent` (non-root)
4. Worker.sh mkdir/write operations succeed under deckent user

**Kanıt:** Dockerfile build + container whoami check + integration test.

---

## Task 6: `.deck` Config Interpolation (`$DECK:KEY` Syntax)

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/deck-interpolation.ts (NEW), src/core/config.ts (patch), tests/core/deck-interpolation.test.ts
- Scope: src/core/, tests/core/

### Description
Config file'larda `.deck` secret'lara referans mümkün olmalı. Örnek kullanım:
```json
// .deckent/config.json
{
  "connectors": {
    "discord": { "enabled": true, "token": "$DECK:DISCORD_TOKEN" },
    "telegram": { "enabled": true, "token": "$DECK:TELEGRAM_TOKEN" }
  }
}
```

`src/core/deck-interpolation.ts` yeni (~100 LoC):
```typescript
import { loadDeckSecrets } from './deck-file.js';

const DECK_PATTERN = /^\$DECK:([A-Z_][A-Z0-9_]*)$/;

export function interpolateConfig<T>(config: T, projectRoot: string): T {
  const secrets = loadDeckSecrets(projectRoot);  // Returns Record<string, string>
  return deepInterpolate(config, secrets);
}

function deepInterpolate(val: any, secrets: Record<string, string>): any {
  if (typeof val === 'string') {
    const match = val.match(DECK_PATTERN);
    if (match) {
      const key = match[1];
      const secret = secrets[key] ?? secrets[`DECKENT_${key}`];
      if (!secret) {
        console.warn(`[deck-interpolation] Missing secret: ${key} (from $DECK:${key})`);
        return val;  // Keep placeholder, don't break
      }
      return secret;
    }
    return val;
  }
  if (Array.isArray(val)) return val.map(v => deepInterpolate(v, secrets));
  if (val && typeof val === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(val)) out[k] = deepInterpolate(v, secrets);
    return out;
  }
  return val;
}
```

`src/core/config.ts` `loadConfig()` içinde (line ~810, after 3-layer merge):
```typescript
config = interpolateConfig(config, projectRoot);
return config as ResolvedConfig;
```

### Test (6 test)
1. Config `"token": "$DECK:DISCORD_TOKEN"` + .deck has DISCORD_TOKEN → token resolved
2. Missing `.deck` key → warning + placeholder unchanged
3. Nested object interpolation
4. Array interpolation
5. Non-matching string → untouched
6. `DECKENT_` prefix fallback (legacy `DECKENT_DISCORD_TOKEN`)

**Kanıt:** `npx vitest run tests/core/deck-interpolation.test.ts` 6/6 PASS.

---

## Task 7: Docker Worker Exit Pattern Final Fix (Sprint 146+148 Debt)

- Model: opus
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: src/backends/docker-spawn-backend.ts, src/agents/worker.sh (if exists), tests/backends/docker-exit-final.test.ts
- Scope: src/backends/, src/agents/, tests/backends/

### Description
Sprint 146 T-146-011 NO_GO + Sprint 148 T-148-022 TD. Root cause: container SIGKILL before .result write. Sprint 139 Docker HB fix + Sprint 148 EXIT trap partial ama OOM path + partial write case hâlâ açık.

Çözüm:
1. Worker.sh EXIT trap genişletilmiş (OOM kill path dahil):
```bash
cleanup_result() {
  local exit_code=$?
  # Always write result even on signal death
  if [ ! -f "$RESULT_PATH" ]; then
    local signal_info=""
    [ $exit_code -gt 128 ] && signal_info="signal=$((exit_code - 128))"
    cat > "$RESULT_PATH" <<EOF
{
  "taskId": "$TASK_ID",
  "selfAssessment": "NO_GO",
  "notes": "Worker exited without writing result (exitCode=$exit_code $signal_info)",
  "exitCode": $exit_code,
  "filesChanged": [],
  "testsPassed": false,
  "tokenUsage": { "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "provider": "claude", "model": "$MODEL" }
}
EOF
    sync  # fsync
  fi
}
trap cleanup_result EXIT
trap cleanup_result SIGTERM
trap cleanup_result SIGKILL  # Not always trappable but try
```

2. `docker-spawn-backend.ts` graceful stop improve (line ~TBD with current code):
```typescript
async stopWorker(workerId: string): Promise<void> {
  // Try docker stop first (SIGTERM + graceful), then fallback
  const stopResult = spawnSync('docker', ['stop', '--time=15', containerName], { encoding: 'utf-8' });
  if (stopResult.status !== 0) {
    // Final fallback: docker kill with SIGTERM (not SIGKILL)
    spawnSync('docker', ['kill', '--signal=SIGTERM', containerName], { encoding: 'utf-8' });
  }
  // Wait for .result write with polling (max 20s)
  // ...
}
```

### Test (6 test)
1. Reproducer: mid-task SIGKILL → result file written with NO_GO + exitCode
2. Normal completion → cleanup_result no-op
3. SIGTERM graceful → result written normally
4. OOM kill (exit 137) → result written with signal_info
5. Partial write scenario → detected and NO_GO result
6. Docker stop --time=15 → grace period honored

**Kanıt:** Sprint 149 Docker E2E test: 0 "worker exited without result" in retro.

---

## Task 8: Scope Sanitizer Code Snippet False Positive Fix (Sprint 148 Debt)

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/scope-sanitizer.ts, src/orchestra/task-builder.ts, tests/orchestra/scope-sanitizer-v2.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 148 canlı kanıt: T-148-002 filesWrite'ta `.directories`, `.some`, `src/foo.ts`, `tests/foo.test.ts` gibi DIRECTIVES code snippet'lerinden parse edilen **örnek yol**lar vardı. Gerçek file değil.

Root cause: `task-builder.ts` DIRECTIVES markdown'ı parse ederken code block içindeki `"src/foo.ts"` gibi string'leri filesWrite olarak alıyor. Scope sanitizer bunları filter etmeli.

Ekle filters:
1. **Code-block context tracking**: `\`\`\`typescript` ... `\`\`\`` arasındaki string'ler filesWrite'a girmez
2. **Example path heuristic**: `foo`, `bar`, `baz`, `example` gibi placeholder filename'ler reject
3. **Dot-start syntactic check**: `.directories`, `.some` (JS property access notasyonu) reject — gerçek dosya değil
4. **Single-word no-extension check**: `.deckent/skills/` OK (dizin), `.directories` reject (extensionless dot-start)

`src/orchestra/scope-sanitizer.ts` filter functions ekle (mevcut 8 rule üzerine):
```typescript
const PLACEHOLDER_NAMES = new Set(['foo', 'bar', 'baz', 'qux', 'example', 'test']);
const JS_ACCESS_PATTERN = /^\.[a-z][a-zA-Z0-9]*$/;  // .directories, .some, .length

export function isPlaceholderPath(path: string): boolean {
  const base = path.split('/').pop()?.split('.')[0] ?? '';
  return PLACEHOLDER_NAMES.has(base.toLowerCase());
}

export function isJsAccessPattern(path: string): boolean {
  return JS_ACCESS_PATTERN.test(path);
}

// Add to existing sanitize chain:
if (isPlaceholderPath(path)) continue;  // reject
if (isJsAccessPattern(path)) continue;  // reject
```

`task-builder.ts` DIRECTIVES parser (find parse function) — code-block aware:
- Regex `/```[\s\S]*?```/g` ile code block'ları mask et
- Sadece mask-dışı text'ten filesWrite çıkar

### Test (8 test)
1. DIRECTIVES `filesWrite: ["src/a.ts", "src/foo.ts"]` → sadece src/a.ts (foo reject)
2. `.directories`, `.some` reject
3. Code block içi path'ler filter edilir
4. Placeholder path (`example.ts`) reject
5. Gerçek scope (`src/core/config.ts`) korunur
6. Sprint 148 T-002 replay: 4 false positive filtrelenir
7. Edge case: `src/foo-bar.ts` KORUNUR (placeholder sadece tam match)
8. Integration: Sprint 149 task JSON filesWrite temiz

**Kanıt:** Sprint 149 canlı task JSON'larda `.directories`, `.some`, `foo.ts` = 0 match.

---

## Task 9: Auditor Stale Alert Race Condition Fix (Sprint 148 Debt)

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/auditor.ts, src/core/heartbeat-types.ts, tests/orchestra/auditor-stale-race.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sprint 148 canlı bug: T-148-004 henüz spawn olmamış (ASSIGNED state) iken auditor "stale worker" alert üretti. False positive.

Root cause: Auditor 30s scan her task.json'ı kontrol ediyor ama lifecycle state ayırt etmiyor (PENDING/CLAIMED/EXECUTING hep aynı muamele). Heartbeat yok → stale.

Çözüm: Auditor sadece EXECUTING state'te stale check yapsın.

`src/orchestra/auditor.ts` scan loop içinde (line ~TBD):
```typescript
for (const taskFile of taskFiles) {
  const task = JSON.parse(readFileSync(taskFile, 'utf-8'));

  // NEW: Only check heartbeat for tasks in EXECUTING state
  if (task.status !== 'EXECUTING') continue;

  // Heartbeat stale check...
  const hbPath = taskFile.replace('.json', '.hb');
  if (!existsSync(hbPath)) {
    // EXECUTING but no heartbeat file = real anomaly
    alerts.push({ level: 'HIGH', message: `Task ${task.id} EXECUTING but no heartbeat file`, source: task.id });
    continue;
  }

  const hb = JSON.parse(readFileSync(hbPath, 'utf-8'));
  const hbAgeMs = Date.now() - new Date(hb.timestamp).getTime();
  if (hbAgeMs > STALE_THRESHOLD_MS) {
    alerts.push({ level: 'CRITICAL', message: `Stale agent: ${task.id}`, source: task.id });
  }
}
```

### Test (5 test)
1. PENDING task → no stale check (no alert)
2. CLAIMED task → no stale check
3. EXECUTING + fresh HB → no alert
4. EXECUTING + stale HB → CRITICAL alert
5. EXECUTING + no HB file → HIGH alert (different from stale)

**Kanıt:** Sprint 149 live auditor: 0 false positive stale alert for non-EXECUTING tasks.

---

# BLOCK C — Messaging Trio (6 task, Wave 3)

## Task 10: `src/connectors/` Base + IMessageConnector Interface

- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/connectors/types.ts (NEW), src/connectors/base-connector.ts (NEW), tests/connectors/base-connector.test.ts
- Scope: src/connectors/, tests/connectors/

### Description
Messaging connector altyapı. Provider adapter pattern'ı (`src/core/provider.ts:32-82`) messaging için uyarla.

`src/connectors/types.ts` (~100 LoC):
```typescript
export type ConnectorId = 'discord' | 'telegram' | 'whatsapp' | 'slack' | 'email';

export interface IncomingMessage {
  readonly id: string;              // provider-specific msg ID
  readonly connector: ConnectorId;
  readonly fromUser: string;         // user ID or handle
  readonly channelId: string;        // DM or group
  readonly text: string;
  readonly timestamp: string;        // ISO 8601
  readonly raw?: unknown;            // provider-specific payload
}

export interface OutgoingMessage {
  readonly connector: ConnectorId;
  readonly channelId: string;
  readonly text: string;
  readonly replyTo?: string;         // original msg ID for reply
}

export interface IMessageConnector {
  readonly id: ConnectorId;
  readonly name: string;
  start(config: ConnectorConfig): Promise<void>;
  stop(): Promise<void>;
  sendMessage(msg: OutgoingMessage): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => void): void;
  isHealthy(): boolean;
}

export interface ConnectorConfig {
  readonly enabled: boolean;
  readonly token: string;            // From .deck interpolation
  readonly webhookUrl?: string;      // Optional
  readonly options?: Record<string, unknown>;
}
```

`src/connectors/base-connector.ts` (~150 LoC) abstract class (event emitter pattern).

### Test (5 test)
1. BaseConnector start/stop lifecycle
2. Handler registration
3. Unhealthy state detection
4. Message type validation (IncomingMessage schema)
5. Error propagation (start fail)

**Kanıt:** `npx vitest run tests/connectors/base-connector.test.ts` 5/5 PASS.

---

## Task 11: Discord Connector

- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/connectors/discord.ts (NEW), tests/connectors/discord.test.ts, package.json
- Scope: src/connectors/, tests/connectors/, ./

### Description
Discord bot connector (discord.js). Local bot — user kendi Discord app + token `.deck` file'a yazar.

`package.json` dep ekle: `"discord.js": "^14.14.0"`.

`src/connectors/discord.ts` (~250 LoC):
```typescript
import { Client, GatewayIntentBits, Message, Events } from 'discord.js';
import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, IncomingMessage, OutgoingMessage } from './types.js';

export class DiscordConnector extends BaseConnector {
  readonly id = 'discord' as const;
  readonly name = 'Discord';

  private client?: Client;

  async start(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) return;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
    });

    this.client.on(Events.MessageCreate, (msg: Message) => {
      if (msg.author.bot) return;
      const incoming: IncomingMessage = {
        id: msg.id,
        connector: 'discord',
        fromUser: msg.author.id,
        channelId: msg.channelId,
        text: msg.content,
        timestamp: new Date(msg.createdTimestamp).toISOString(),
        raw: msg,
      };
      this.emitMessage(incoming);
    });

    await this.client.login(config.token);
  }

  async stop(): Promise<void> {
    if (this.client) await this.client.destroy();
  }

  async sendMessage(msg: OutgoingMessage): Promise<void> {
    if (!this.client) throw new Error('Discord connector not started');
    const channel = await this.client.channels.fetch(msg.channelId);
    if (channel?.isTextBased() && 'send' in channel) {
      await (channel as any).send(msg.text);
    }
  }

  isHealthy(): boolean {
    return this.client?.ws.status === 0;  // WebSocket READY
  }
}
```

### Test (6 test)
1. Start with token → login success (mock Client)
2. Start disabled → no-op
3. Incoming message handler triggered (simulate Events.MessageCreate)
4. Bot messages filtered (msg.author.bot = true)
5. Send message to channel
6. Stop → client destroyed

**Kanıt:** `npx vitest run tests/connectors/discord.test.ts` 6/6 PASS. Live smoke test (if Alperen provides token).

---

## Task 12: Telegram Connector

- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/connectors/telegram.ts (NEW), tests/connectors/telegram.test.ts, package.json
- Scope: src/connectors/, tests/connectors/, ./

### Description
Telegram bot connector (telegraf). Özellikle Türkiye'de popüler.

`package.json` dep ekle: `"telegraf": "^4.15.0"`.

`src/connectors/telegram.ts` (~200 LoC) — `Telegraf` class, `bot.on('text', ...)` handler, `bot.launch()`.

```typescript
import { Telegraf } from 'telegraf';
import { BaseConnector } from './base-connector.js';

export class TelegramConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Telegram';

  private bot?: Telegraf;

  async start(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) return;
    this.bot = new Telegraf(config.token);

    this.bot.on('text', (ctx) => {
      this.emitMessage({
        id: String(ctx.message.message_id),
        connector: 'telegram',
        fromUser: String(ctx.from.id),
        channelId: String(ctx.chat.id),
        text: ctx.message.text,
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        raw: ctx.message,
      });
    });

    await this.bot.launch();
  }

  async stop(): Promise<void> {
    this.bot?.stop();
  }

  async sendMessage(msg: OutgoingMessage): Promise<void> {
    await this.bot?.telegram.sendMessage(msg.channelId, msg.text);
  }

  isHealthy(): boolean {
    return this.bot !== undefined;
  }
}
```

### Test (5 test)
1. Start with token
2. Start disabled → no-op
3. Incoming text handler
4. Send message
5. Stop

**Kanıt:** `npx vitest run tests/connectors/telegram.test.ts` 5/5 PASS.

---

## Task 13: WhatsApp Scaffold (Post-Launch Activation Ready)

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/connectors/whatsapp.ts (NEW — scaffold), src/connectors/whatsapp-README.md, tests/connectors/whatsapp-scaffold.test.ts
- Scope: src/connectors/, tests/connectors/

### Description
WhatsApp Business API hazırlık. Official API approval 2-6 hafta — Sprint 149'da **scaffold-only**, aktivasyon Sprint 152+.

**NOT:** `whatsapp-web.js` (unofficial) risk içeriyor (WhatsApp TOS ihlali, session ban). Official Business API tercih.

`src/connectors/whatsapp.ts` (~100 LoC):
```typescript
import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, OutgoingMessage } from './types.js';

export class WhatsAppConnector extends BaseConnector {
  readonly id = 'whatsapp' as const;
  readonly name = 'WhatsApp';

  async start(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) return;
    throw new Error(
      'WhatsApp connector requires official Business API approval. ' +
      'Scaffold only in Sprint 149. Activation targeted for Sprint 152+. ' +
      'See src/connectors/whatsapp-README.md for activation steps.'
    );
  }

  async stop(): Promise<void> {
    // No-op
  }

  async sendMessage(_msg: OutgoingMessage): Promise<void> {
    throw new Error('WhatsApp connector not yet activated');
  }

  isHealthy(): boolean {
    return false;  // Always unhealthy until activated
  }
}
```

`src/connectors/whatsapp-README.md` — activation steps (Business API approval, webhook setup, endpoint config).

### Test (3 test)
1. Disabled start → no-op
2. Enabled start → throws activation error
3. isHealthy → false

**Kanıt:** Scaffold exists, import resolves, clear activation path documented.

---

## Task 14: Connector Pool + Parallel Dispatch

- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/connectors/connector-pool.ts (NEW), tests/connectors/connector-pool.test.ts
- Scope: src/connectors/, tests/connectors/

### Description
Multi-connector paralel dispatch. "Mesaj Discord'a + Telegram'a aynı anda gönder".

`src/connectors/connector-pool.ts` (~150 LoC):
```typescript
import type { IMessageConnector, OutgoingMessage, ConnectorId } from './types.js';

export class ConnectorPool {
  private readonly connectors = new Map<ConnectorId, IMessageConnector>();

  register(connector: IMessageConnector): void {
    this.connectors.set(connector.id, connector);
  }

  async broadcast(msg: Omit<OutgoingMessage, 'connector'>, targets: ConnectorId[]): Promise<Array<{ connector: ConnectorId; success: boolean; error?: string }>> {
    return Promise.all(targets.map(async (id) => {
      const conn = this.connectors.get(id);
      if (!conn) return { connector: id, success: false, error: 'Not registered' };
      try {
        await conn.sendMessage({ ...msg, connector: id });
        return { connector: id, success: true };
      } catch (err) {
        return { connector: id, success: false, error: (err as Error).message };
      }
    }));
  }

  async startAll(configs: Record<ConnectorId, ConnectorConfig>): Promise<void> {
    for (const conn of this.connectors.values()) {
      const config = configs[conn.id];
      if (config?.enabled) {
        try { await conn.start(config); }
        catch (err) { console.error(`[pool] ${conn.id} start failed:`, err); }
      }
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.connectors.values()).map(c => c.stop()));
  }

  onAnyMessage(handler: (msg: IncomingMessage) => void): void {
    for (const conn of this.connectors.values()) conn.onMessage(handler);
  }
}
```

### Test (6 test)
1. Register + broadcast parallel
2. Partial failure (1 of 3 fails) → other 2 succeed
3. Not-registered connector → skip with error
4. startAll + stopAll lifecycle
5. onAnyMessage fans out to all
6. Empty targets → empty result

**Kanıt:** `npx vitest run tests/connectors/connector-pool.test.ts` 6/6 PASS.

---

## Task 15: Incoming Webhook Router + Nervous Bridge

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/connectors/incoming-router.ts (NEW), src/api/server.ts (patch), tests/connectors/incoming-router.test.ts
- Scope: src/connectors/, src/api/, tests/connectors/

### Description
Gelen mesajlar → nervous system bridge. Kullanıcı Discord'dan "deploy yap" yazarsa → nervous system detector değerlendirir → onay gerekirse suggest-30m notification.

`src/connectors/incoming-router.ts` (~200 LoC):
```typescript
import type { IncomingMessage } from './types.js';
import { eventBus } from '../orchestra/event-bus.js';

export class IncomingMessageRouter {
  async route(msg: IncomingMessage): Promise<void> {
    eventBus.emit('deckent-event', {
      type: 'INCOMING_MESSAGE',
      source: 'connector',
      connectorId: msg.connector,
      fromUser: msg.fromUser,
      text: msg.text,
      timestamp: msg.timestamp,
    });
    // Nervous observer will pick this up via event-bus subscription
    // Detectors can then evaluate (e.g., command parsing, auth check)
  }
}
```

`src/api/server.ts` yeni endpoint (line ~TBD):
```typescript
// Webhook endpoint for inbound messages
// POST /api/webhooks/:connector/:key
server.post('/api/webhooks/:connector/:key', async (req, reply) => {
  const { connector, key } = req.params as { connector: string; key: string };
  // Validate key matches .deck config
  // Parse webhook payload per connector
  // Route to IncomingMessageRouter
  reply.status(200).send({ ok: true });
});
```

### Test (7 test)
1. IncomingMessage → event emitted on deckent-event channel
2. Event payload includes connectorId, fromUser, text
3. Multiple messages → multiple events
4. Webhook endpoint rate-limited
5. Invalid webhook key → 401
6. Discord-specific webhook parse
7. Telegram-specific webhook parse

**Kanıt:** `npx vitest run tests/connectors/incoming-router.test.ts` 7/7 PASS.

---

# BLOCK D — DeckentHub + Ed25519 (5 task, Wave 4)

## Task 16: `src/core/signature.ts` Ed25519 Sign/Verify

- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist
- Files: src/core/signature.ts (NEW), tests/core/signature.test.ts, package.json
- Scope: src/core/, tests/core/, ./

### Description
Ed25519 cryptographic signature. `@noble/ed25519` lightweight dep ekle.

`package.json`: `"@noble/ed25519": "^2.1.0"`.

`src/core/signature.ts` (~150 LoC):
```typescript
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const KEYPAIR_DIR = join(homedir(), '.deckent', 'keys');

export interface Keypair {
  privateKey: Uint8Array;  // 32 bytes
  publicKey: Uint8Array;   // 32 bytes
}

export async function generateKeypair(): Promise<Keypair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey };
}

export function loadOrGenerateKeypair(): Keypair {
  const privPath = join(KEYPAIR_DIR, 'private.hex');
  const pubPath = join(KEYPAIR_DIR, 'public.hex');
  if (existsSync(privPath) && existsSync(pubPath)) {
    return {
      privateKey: hexToBytes(readFileSync(privPath, 'utf-8').trim()),
      publicKey: hexToBytes(readFileSync(pubPath, 'utf-8').trim()),
    };
  }
  // Generate and save (sync version)
  const priv = ed.utils.randomPrivateKey();
  const pub = ed.getPublicKey(priv);
  require('node:fs').mkdirSync(KEYPAIR_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(privPath, bytesToHex(priv), { mode: 0o600 });
  writeFileSync(pubPath, bytesToHex(pub), { mode: 0o644 });
  return { privateKey: priv, publicKey: pub };
}

export async function signMessage(message: Uint8Array | string, privateKey: Uint8Array): Promise<string> {
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const sig = await ed.signAsync(msgBytes, privateKey);
  return bytesToHex(sig);
}

export async function verifySignature(message: Uint8Array | string, signatureHex: string, publicKey: Uint8Array): Promise<boolean> {
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const sigBytes = hexToBytes(signatureHex);
  return ed.verifyAsync(sigBytes, msgBytes, publicKey);
}

function bytesToHex(bytes: Uint8Array): string { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex: string): Uint8Array { return new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16))); }
```

### Test (8 test)
1. generateKeypair returns 32-byte keys
2. signMessage + verifySignature round-trip
3. Wrong public key → verification fails
4. Tampered message → verification fails
5. loadOrGenerateKeypair creates file on first call
6. File permissions 0600 private, 0644 public
7. Dir permissions 0700
8. Determinism: same message + same key → same signature

**Kanıt:** `npx vitest run tests/core/signature.test.ts` 8/8 PASS.

---

## Task 17: VerhexIO/deckent-hub Repo Create + Templates

- Model: sonnet
- Effort: normal
- Skills: documentation-writer, devops-engineer
- Files: deckent-hub/README.md (NEW — local git worktree), deckent-hub/SKILL_TEMPLATE.md, deckent-hub/CONTRIBUTING.md, deckent-hub/.github/workflows/validate-skill.yml
- Scope: deckent-hub/ (yeni local dizin)

### Description
**NOT:** Worker Alperen'in GitHub hesabı olmadığı için yeni repo CREATE edemez. Onun yerine local `deckent-hub/` dizini (git repo olarak init edilebilir) + push için Alperen elle yapar Sprint 150'de.

`deckent-hub/` yeni dizin, içinde:
- `README.md` — "Deckent Skill Registry — OpenClaw ClawHub alternative with Ed25519 + AST sandbox"
- `SKILL_TEMPLATE.md` — yeni skill için şablon
- `CONTRIBUTING.md` — PR süreci (sandbox validate + sign + submit)
- `.github/workflows/validate-skill.yml` — CI: AST sandbox scan + signature verify
- `skills/` dizin (ilk 20 seed skill için yer)

### Test (3 test)
1. `test -d deckent-hub` exists
2. README.md contains "Ed25519" + "AST sandbox"
3. .github/workflows/validate-skill.yml is valid YAML

**Kanıt:** Manual Alperen GitHub create + push Sprint 150.

---

## Task 18: 20 Seed Skill Creation

- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer
- Files: deckent-hub/skills/*/SKILL.md + manifest.json (×20)
- Scope: deckent-hub/

### Description
20 seed skill author + sign (T-149-016 Ed25519 kullan):
1. spotify-control — Spotify Web API
2. telegram-bot — Telegram bot framework
3. discord-moderator — Discord bot + moderation
4. calendar-google — Google Calendar API
5. email-imap — IMAP/SMTP
6. weather-forecast — OpenWeatherMap API
7. rss-reader — RSS/Atom parser
8. web-scraper — Playwright wrapper
9. github-issues — GitHub API
10. slack-notifier — Slack webhooks
11. notion-sync — Notion API
12. todoist — Todoist API
13. spotify-playlist — Spotify playlist manage
14. youtube-downloader — yt-dlp wrapper (user responsibility)
15. reddit-fetcher — Reddit API
16. twitter-post — Twitter API v2
17. screenshot-vision — Playwright + Claude Vision
18. file-organizer — Local fs helpers
19. currency-converter — Exchange rates API
20. translator — DeepL API

Her skill: `SKILL.md` (trigger patterns + examples) + `manifest.json` (manifestVersion 2) + `signature.ed25519` (T-149-016'dan).

### Test (3 test)
1. 20 skill dizinleri mevcut
2. Her skill manifest.json valid (schema check)
3. Her skill signature.ed25519 verifiable with public key

**Kanıt:** `ls deckent-hub/skills/ | wc -l` → 20.

---

## Task 19: `deckent skill publish` CLI Complete (Sign + Upload)

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/skill.ts (patch), tests/cli/skill-publish.test.ts
- Scope: src/cli/, tests/cli/

### Description
Mevcut `deckent skill publish` stub'ı complete. Pipeline:
1. AST sandbox scan (already exists — skill-sandbox.ts)
2. Ed25519 sign (T-149-016)
3. Generate `signature.ed25519` file
4. Create git branch + commit in deckent-hub
5. Manual push (Alperen review) veya auto PR

`src/cli/commands/skill.ts` publish action extend:
```typescript
program.command('skill publish <skillPath>').action(async (skillPath) => {
  const skillContent = readFileSync(join(skillPath, 'SKILL.md'), 'utf-8');
  const manifest = JSON.parse(readFileSync(join(skillPath, 'manifest.json'), 'utf-8'));

  // Step 1: Sandbox scan
  const sandboxResult = await validateSkillSafety(skillPath);
  if (!sandboxResult.safe) {
    console.error(`❌ Sandbox violations:`, sandboxResult.violations);
    process.exit(1);
  }

  // Step 2: Sign
  const keypair = loadOrGenerateKeypair();
  const signature = await signMessage(skillContent + JSON.stringify(manifest), keypair.privateKey);
  writeFileSync(join(skillPath, 'signature.ed25519'), signature);

  console.log(`✓ Sandbox OK, signed with public key ${bytesToHex(keypair.publicKey).slice(0, 16)}...`);
  console.log(`  Next: push to VerhexIO/deckent-hub`);
});
```

### Test (5 test)
1. Sandbox-unsafe skill → publish rejected
2. Valid skill → signature generated
3. Signature verifiable
4. Missing manifest → clear error
5. Already-signed skill → signature overwritten

**Kanıt:** `npx vitest run tests/cli/skill-publish.test.ts` 5/5 PASS.

---

## Task 20: Hub CI Workflow — validate-skill.yml

- Model: sonnet
- Effort: normal
- Skills: devops-engineer, typescript-expert
- Files: deckent-hub/.github/workflows/validate-skill.yml, scripts/hub-validate.mjs (NEW)
- Scope: deckent-hub/.github/workflows/, scripts/

### Description
Hub repo'ya PR geldiğinde CI otomatik:
1. Deckent'i checkout
2. Her değişen skill için `scripts/hub-validate.mjs`:
   - AST sandbox scan
   - Ed25519 signature verify
   - Manifest schema validate
3. Fail olursa PR blocked

`.github/workflows/validate-skill.yml`:
```yaml
name: Validate Skill

on:
  pull_request:
    paths: ['skills/**']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Deckent (from npm)
        run: npm install -g deckent@beta
      - name: Validate changed skills
        run: |
          git diff --name-only origin/main HEAD | grep '^skills/' | xargs -I{} node scripts/hub-validate.mjs {}
```

`scripts/hub-validate.mjs` (bundle check: sandbox + signature + manifest).

### Test (4 test)
1. Valid skill passes
2. Sandbox-unsafe skill fails
3. Invalid signature fails
4. Missing manifest fails

**Kanıt:** `node scripts/hub-validate.mjs deckent-hub/skills/spotify-control/` exit 0.

---

# BLOCK E — Doc Consolidation (4 task, Wave 5)

## Task 21: README.md Overhaul + Landing Page

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: README.md, README-TR.md
- Scope: ./

### Description
Mevcut README 11 sprint geride (god-analysis P1 #11). Yeni README:
- **Tagline:** "Deckent — The AI orchestrator for developers who want discipline. (Sprint Mode + Task Mode, open source, AST-sandboxed)"
- **Quick start:** `npm install -g deckent` + `deckent init` + `deckent mode task` / `sprint`
- **Features:** 15 agents + 21 skills + nervous system + 3 providers + 3 backends + cross-platform
- **USPs:** Sprint Discipline + Nervous System + AST Sandbox (vs OpenClaw %20 malicious)
- **Screenshots:** `deckent nervous` TUI + dashboard ChatPage (Sprint 150'de çekilecek — placeholder şimdilik)
- **Comparison table:** vs OpenClaw vs Claude Code vs Cursor
- **License:** MIT

README-TR.md Turkish parity.

### Test (3 test)
1. README.md references v1.0.0-beta.1
2. README mentions "OpenClaw" + "AST sandbox"
3. README-TR.md parallel structure

**Kanıt:** grep checks + manual review.

---

## Task 22: AGENTS.md Refresh (39 Sprint Behind)

- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: AGENTS.md
- Scope: ./

### Description
God-analysis P1 #12: AGENTS.md Sprint 102'den beri güncellenmemiş (39 sprint geride). Sprint 148 agent taksonomi reform sonrası 15 built-in agent listesi yaz:
- architect, security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist (15 total, test-writer KALDIRILDI)

Her agent için 1-2 satır açıklama + primary intent mapping.

### Test (2 test)
1. AGENTS.md 15 agent listed (not 16)
2. "test-writer" kelimesi yok

**Kanıt:** `grep -c "test-writer" AGENTS.md` → 0.

---

## Task 23: 388 .md Interaktif Review Script

- Model: sonnet
- Effort: normal
- Skills: documentation-writer, typescript-expert
- Files: scripts/doc-review.mjs (NEW), docs/audits/sprint-149/doc-review-report.md
- Scope: scripts/, docs/audits/

### Description
388 .md dosya için review. Otomatik kategorize (keep/revise/delete/move) + Alperen manual inceleme için report.

`scripts/doc-review.mjs` (~200 LoC):
- Tüm .md dosyaları listele
- Size, last-modified, sprint reference count analyze
- Duplicate detect (hash-based)
- Link check (broken ref)
- Stale heuristic: "Sprint N" + N < current-10 → "REVISE"
- Output: `docs/audits/sprint-149/doc-review-report.md` (384 satır tablo)

### Test (3 test)
1. Script runs, produces report
2. Report has 4 category bölümü
3. Broken link detection works

**Kanıt:** `node scripts/doc-review.mjs` exit 0 + report exists.

---

## Task 24: TR/EN Parity + Link Checker

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: scripts/i18n-parity.mjs (NEW), scripts/link-checker.mjs (NEW), docs/audits/sprint-149/i18n-parity-report.md
- Scope: scripts/, docs/audits/

### Description
TR ↔ EN doküman parity check (ANA-PLAN-TR ↔ MASTER-BLUEPRINT, BETA-TRACKER-TR ↔ BETA-TRACKER, README-TR ↔ README, VISION-TR ↔ VISION).

Link checker: tüm markdown link'leri validate (internal + external HEAD request).

### Test (2 test)
1. i18n-parity.mjs runs, reports missing sections
2. link-checker.mjs runs, lists broken links

**Kanıt:** Both scripts exit 0 with report.

---

# BLOCK F — Release Prep (3 task, Wave 6)

## Task 25: ADR-041 ACCEPT + ADR-042 Draft

- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: .brain/memory.db (via MemoryStore), .brain/exports/decisions.md (regen)
- Scope: .brain/

### Description
ADR-041 "Agent Taxonomy" Sprint 148'de proposed. Sprint 149'da ACCEPT. Dogfood kanıtları:
- Sprint 148 test-writer 10 task (önceki %95'ten %36'ya inmesi)
- AgentRoutingHealth detector anomaly doğruladı
- 22 task arasında test-writer assigned 0 olmalı (Sprint 149'da)

ADR-042 draft: "Hybrid Mode Architecture — Sprint + Task Dual Modes"
- Status: proposed
- Context: Deckent = developer + life assistant birleşik
- Decision: `deckent_style` config, single mode active, user switch
- Consequences (+): dual audience, hub ecosystem için zemin
- Consequences (-): mode-aware code complexity

```typescript
store.updateById('adr-041', { status: 'accepted', sprint_id: 'sprint-149' });
store.insert({
  id: 'adr-042',
  type: 'adr',
  title: 'Hybrid Mode Architecture — Sprint + Task Dual Modes',
  status: 'proposed',
  sprint_id: 'sprint-149',
  decay_exempt: true,
  body: /* MADR v3 content */,
});
```

### Test (3 test)
1. adr-041 status accepted
2. adr-042 status proposed
3. exports/decisions.md regenerated

**Kanıt:** `store.getByType('adr').find(a => a.id === 'adr-041')?.status === 'accepted'`.

---

## Task 26: npm pack --dry-run + Version Bump 1.0.0-beta.1

- Model: sonnet
- Effort: normal
- Skills: devops-engineer
- Files: package.json, scripts/npm-publish-dry-final.sh (NEW), docs/audits/sprint-149/npm-publish-dry-final.md
- Scope: ./, scripts/, docs/audits/

### Description
Version bump 0.4.0-beta.3 → 1.0.0-beta.1 (major). npm pack dry-run final check:
- Tarball size < 2MB
- No secrets (scan `.deck`, `.env`, credentials)
- Only src + dist + docs + README + LICENSE + CHANGELOG included
- package.json metadata complete (description, homepage, bugs, repository, keywords)

`scripts/npm-publish-dry-final.sh`:
```bash
#!/bin/bash
set -euo pipefail
npm version 1.0.0-beta.1 --no-git-tag-version --allow-same-version
npm pack --dry-run 2>&1 | tee /tmp/pack.log

# Size check
size=$(npm pack --json 2>/dev/null | jq -r '.[0].size')
if [ "$size" -gt 2000000 ]; then echo "❌ Tarball too large: $size"; exit 1; fi

# Secret scan
if grep -iE "ANTHROPIC_API_KEY|OPENAI_API_KEY|\.deck$|credentials\.json" /tmp/pack.log | grep -v "!\.deck"; then
  echo "❌ Potential secrets in tarball"; exit 1
fi

# package.json metadata
required_fields=("description" "homepage" "bugs" "repository" "keywords" "license")
for field in "${required_fields[@]}"; do
  node -e "const p=require('./package.json'); if(!p.$field) process.exit(1)" || { echo "❌ Missing $field"; exit 1; }
done

echo "✅ npm publish dry-run final PASS"
```

### Test (5 test)
1. npm pack --dry-run exit 0
2. Tarball < 2MB
3. No secrets
4. package.json complete metadata
5. version === 1.0.0-beta.1

**Kanıt:** `bash scripts/npm-publish-dry-final.sh` exit 0.

---

## Task 27: VerhexIO/deckent Public Repo Hazırlık (Sprint 150'de Alperen Flip)

- Model: sonnet
- Effort: normal
- Skills: devops-engineer, documentation-writer
- Files: docs/release/public-repo-manifest.md (NEW), scripts/public-repo-sync.sh (NEW)
- Scope: docs/release/, scripts/

### Description
Public repo için hazırlık (henüz public flip yok — Alperen Sprint 150'de manuel):

`docs/release/public-repo-manifest.md` — public'e gidecek dosya listesi:
- ✅ src/ (tüm source)
- ✅ tests/ (test files)
- ✅ docs/ (user-facing, not audits)
- ✅ README.md, README-TR.md, LICENSE, CHANGELOG.md, CONTRIBUTING.md
- ❌ `.brain/` (internal memory — exclude)
- ❌ `.deckent/` (project-specific — exclude, user will have their own)
- ❌ `.deck` (secrets — always exclude)
- ❌ `DECKENT-MASTER-BLUEPRINT.md` (private, ADR-033 governance)
- ❌ `DECKENT-ANA-PLAN-TR.md` (private)

`scripts/public-repo-sync.sh` — helper: `deckent-dev` → `deckent` sync (Alperen Sprint 150'de çalıştırır):
```bash
#!/bin/bash
# This script helps Alperen do the Sprint 150 public repo flip
# NOT run during Sprint 149 — informational only
set -euo pipefail

TARGET_REPO="../deckent-public"
if [ ! -d "$TARGET_REPO" ]; then
  echo "First-time setup: git clone https://github.com/VerhexIO/deckent.git ../deckent-public"
  exit 1
fi

rsync -av --delete \
  --exclude='.brain/' \
  --exclude='.deckent/' \
  --exclude='.deck' \
  --exclude='DECKENT-MASTER-BLUEPRINT.md' \
  --exclude='DECKENT-ANA-PLAN-TR.md' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.tasks/' \
  --exclude='.locks/' \
  ./ "$TARGET_REPO/"

cd "$TARGET_REPO"
git add -A
git commit -m "sync: Sprint 149 beta GA prep"
echo "✓ Ready for Alperen review before push"
```

### Test (3 test)
1. public-repo-manifest.md documents ≥10 include/exclude items
2. public-repo-sync.sh dry-run mode works (--dry-run flag)
3. Excluded paths correctly filtered

**Kanıt:** Script exists, manifest complete.

---

# BAĞIMLILIK ZİNCİRİ

```
Wave 1 (paralel, Block A):    T1 + T2 + T3 ← T1 | T4 ← T1
Wave 2 (paralel, Block B):    T5 + T6 + T7 + T8 + T9
Wave 3 (paralel, Block C):    T10 → {T11 + T12 + T13 + T14 ← T10 | T15 ← T10}
Wave 4 (paralel, Block D):    T16 → {T17 + T18 ← T16 | T19 ← T16 | T20 ← T17}
Wave 5 (paralel, Block E):    T21 + T22 + T23 + T24
Wave 6 (paralel, Block F):    T25 + T26 + T27
```

# SPRINT GATE (15-Gate Chain Safety) — BETA-TRACKER.md ile uyumlu

1. tsc --noEmit 0 errors ✅
2. vitest fail < 50 (Sprint 148 baseline 135, hedef <50)
3. doctor ≥ 92/100
4. NO_GO ≤ 2 (Sprint 148 baseline 1)
5. Nervous events ≥ 5 (detector canlı)
6. Agent routing `test-writer` = 0 assigned (Sprint 148 reform enforcement)
7. cost < $130 soft cap
8. ADR-041 accepted + ADR-042 proposed
9. `deckent_style` toggle canlı
10. Discord + Telegram connector smoke test (WhatsApp scaffold only)
11. DeckentHub 20 seed skill signed
12. npm pack --dry-run clean
13. Dockerfile USER non-root
14. .deck interpolation canlı
15. Public repo sync manifest hazır (Alperen Sprint 150'de flip)

# FALLBACK — Sprint 150 Numaratör +1

Katastrofik fail (< 50% completion veya > 3 NO_GO veya 8h hard cap aşımı):
- Sprint 149 archive/
- Sprint 150 DIRECTIVES aynı content tekrar
- Beta GA **1 gün kayar** (Cuma 24 Nis) — kabul edilebilir

# BETA GA COUNTDOWN

Sprint 150 Perşembe 23 Nis TRT = **1 gün 11 saat** (Sprint 149 Çarşamba bittikten sonra).

**Sprint 149 başarılı = Sprint 150 Beta GA cutover'a temiz giriş:**
- v1.0.0-beta.1 npm publish
- VerhexIO/deckent public flip
- Discord + Telegram bots launch
- DeckentHub 20 skill canlı
- `deckent nervous` + dashboard ChatPage showcase
- Show HN + Reddit + Twitter + Discord announce

---

**Oluşturan:** Koordinatör (5 paralel agent kod tabanı analizi + Alperen 12 karar + ROADMAP-GOD-LEVEL.md anchor + OpenClaw rekabet verisi)
**Baseline:** Sprint 148 27/28 DONE 1h 0m 1 TD 1 NO_GO (hedef Sprint 149 ≤ 8h, ≥26/27 DONE, NO_GO ≤ 2)
**İlk komut:** `deckent_plan mode: 'structured'` — Alperen onayı bekliyor Çarşamba sabah
