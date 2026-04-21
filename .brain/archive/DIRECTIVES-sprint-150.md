# DIRECTIVES — Sprint 150: Hybrid Foundation + God-Level Start + Debt Liquidation + Beta GA Prep + Manuel Toparlama Konsolidasyonu

> **Sprint tipi:** Beta-kritik foundation, god-level roadmap başlangıç (Sprint 151 Beta GA'ya 2-3 gün kaldı)
> **Önceki sprint:** sprint-149 (FAİL — re-run olarak Sprint 150'ye taşındı), öncesi sprint-148 (27/28 DONE, 1 TD, 1 NO_GO T-148-020, 1h 0m, ADR-041 proposed)
> **Tema:** "Hybrid Foundation — `deckent_style` toggle + messaging trio + DeckentHub + P0 security + doc consolidation + Sprint 148 debt tasfiyesi + 2026-04-21 manuel toparlama 11 task konsolidasyonu"
> **Toplam task:** 38 (Sprint 149 orijinal 27 + 2026-04-21 manuel toparlama 11)
> **Hard cap:** 10h (36000000 ms) — 27 task 8h baseline + 11 yeni task +2h
> **Cost cap:** $160 soft alert (Sprint 149 $130'dan +$30 11 yeni task için)
> **Wave sayısı:** 7 block × 2-4 wave iterasyon
> **Planning mode:** structured (AI mode Sprint 148'de fail, Sprint 149'da tekrar denenmedi — stable mode devam)
> **Fallback:** Katastrofik fail → Sprint 151 numaratör +1, Beta GA Cuma 24 Nis → Pazartesi 28 Nis'e kayar (2-3 gün gecikme kabul)

## Referanslar (Canonical Anchor Documents)
- **Master Roadmap:** `docs/ROADMAP-GOD-LEVEL.md` (334 satır, Sprint 149-200 kanonik)
- **Design Spec:** `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md` (Sprint 148 + yansıma)
- **Beta Tracker:** `BETA-TRACKER.md` (15-gate exit criteria)
- **Competitive:** `docs/analysis/competitive-analysis.md` (OpenClaw 346K star / 5 ay analiz)
- **God-Analysis:** `.deckent/sprint-god-analysis/FINAL-REPORT.md` (233 findings, 15 critical)
- **Sprint 148 retro:** `.brain/archive/retro-sprint-148.md` (27/28 DONE, agent taksonomi reform canlı)
- **Manuel toparlama arşivi:** `NEXT-SESSION-PROMPT.md` (2026-04-21 oturum — 11 task iki-persona analiz + Alperen kararları)
- **Memory anchors:**
  - `project_roadmap_god_level.md` — Sprint 149-200 canlı plan
  - `feedback_openclaw_not_openhands.md` — rakip OpenClaw tartışmasız
  - `feedback_test_agent_removal.md` — test-writer kaldırıldı kalıcı
  - `feedback_two_persona_analysis.md` — iki-persona lens zorunlu (TARTIŞMASIZ)
  - `feedback_max_workers.md` V2 — preset değerleri değişmez, user customize (50+ özgür)
  - `feedback_timezone_trt.md` — UTC+3 TRT sunumu
  - `project_release_strategy.md` — çift repo stratejisi (BLUEPRINT + ANA-PLAN-TR gizli)
  - `feedback_deckent_kill_approval_required.md` — destructive komut onay zorunlu

## Goal

Sprint 150 Deckent'in **Beta GA öncesi son sağlam foundation sprint'i**. 7 block × 38 task:
1. **Block A — Mode Architecture** (4 task): `deckent_style: "sprint" | "task"` config toggle + `deckent mode` CLI + sprint-controller mode-aware routing + task-mode-idle detector
2. **Block B — P0 Security + Sprint 148 Debt** (5 task): Dockerfile USER non-root + `.deck` interpolation + Docker worker exit fix + scope sanitizer fix + auditor stale race
3. **Block C — Messaging Trio** (6 task): `src/connectors/` IMessageConnector + Discord + Telegram + WhatsApp scaffold + connector pool + webhook router
4. **Block D — DeckentHub + Ed25519** (5 task): signature.ts + VerhexIO/deckent-hub local scaffold + 20 seed skill + `deckent skill publish` CLI + CI workflow
5. **Block E — Doc Consolidation** (4 task): 388 .md interaktif review + README overhaul + AGENTS.md refresh + TR/EN parity
6. **Block F — Release Prep** (3 task): ADR-041 accept + ADR-042 draft + npm pack dry-run v1.0.0-beta.1 + public repo hazırlık
7. **Block G — Manuel Toparlama Konsolidasyon** (11 task, 2026-04-21 session): IPC cleanup + feature manifest + observability rotation + built-in bundle + audit CLI + safety-point + sprint file retention + config sadeleştirme + cache git fix + docs.json private/public + metrics wire

**Sprint 151 Beta GA Per 24-25 Nis TRT** için bu sprint **zorunlu geçiş**.

## Sprint 148'den Taşınan Debt (8 item entegre)

| Debt Kaynak | Öncelik | Sprint 150 Task |
|-------------|---------|-----------------|
| T-148-020 Vitest Docker worker exit NO_GO | P0 | T-150-007 |
| T-148-022 Docker HB fix partial | P0 | T-150-007 (birleşik) |
| Scope sanitizer code snippet false positive | P1 | T-150-008 |
| Auditor stale alert race (assigned not spawned) | P1 | T-150-009 |
| AI planning mode provider error (2 sprint fail) | P2 | Ertelendi Sprint 152 (Sprint 150 structured) |
| Dockerfile runs as root (god-analysis P1) | P0 | T-150-005 |
| `.deck` → config interpolation yok | P1 | T-150-006 |
| test-writer PROMPT.md kalıntıları | P2 | T-150-022 (doc consolidation içinde) |

## 2026-04-21 Manuel Toparlama Alperen Kararları (Sprint 150 Konsolidasyon Context)

- **T-150-034 config sadeleştirme ONAYLI (8-karar matris):** duplicate kaldır (claude_backend + flat provider), MODE_PRESETS konsolide, system capacity auto-detect MVP dahil, `api` mode kalır, `rollback never` kalır, alias yok — `config.md` tek referans (AI-first dual-audience).
- **T-150-037 docs.json Seçenek 3 ONAYLI:** private/public split (template kaynak kodda, runtime lokal), BETA-TRACKER + BLUEPRINT gizli kalacak (project_release_strategy.md memory kuralı), path-traversal guard + interaktif prompt eklenecek.
- **T-150-035 FINAL karar (2026-04-21 Alperen onaylı):** Sprint-prefixed dosya aileleri retention (gate/scorecard/events/seq/checkpoint/pre-archive) — 5 soru FINAL kilitli: (1) Hibrit `keep_last_n=10` + `size_cap_mb=500`, (2) Flat path + `.deckent/archive/sprints/<id>/` arşiv, (3) Forensic `.md` dosyaları `docs/audits/sprint-NNN/` altına taşınır, (4) `-seq` + `-checkpoint-seq` counter'lar sprint DONE'da silinir, (5) `gate.json` retention penceresinde kalır (T-150-032 `deckent audit` tarihsel erişim için).
- **Max_workers V2:** WSL2 dev-deckent lokal limit 3-4 (Kural A), product-level user özgür 50+ çalıştırabilir (Kural B), MODE_PRESETS standart değerleri değişmez (performance 8 / balanced 5 / economic 3 / api 10).

---

## KRİTİK KURAL — Koordinatör Disiplin

**Sprint canlı iken `src/` müdahale YASAK** (Sprint 144-148 lesson 5 sprint streak). Koordinatör sadece izler, event-stream + status + .tasks/ monitor. Worker scope'u task.json'daki `scope.filesWrite` ile sınırlıdır (ADR-037 RBAC).

**test-writer agent YASAK** (Sprint 148 reform kalıcı) — Sprint 150 worker assignments'ta `grep test-writer` = 0 olmalı.

**Ana PID Constraint** (Sprint 148 T-007) — Worker process'te `nervous.init()` çağrısı YASAK (`NERVOUS_SCOPE_VIOLATION` event emit + throw).

**deckent_kill / cleanup / docker stop yasağı** (`feedback_deckent_kill_approval_required`) — Alperen açık onayı olmadan destructive komut YASAK.

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

**Kanıt:** Sprint 150 Docker E2E test: 0 "worker exited without result" in retro.

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
8. Integration: Sprint 150 task JSON filesWrite temiz

**Kanıt:** Sprint 150 canlı task JSON'larda `.directories`, `.some`, `foo.ts` = 0 match.

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

**Kanıt:** Sprint 150 live auditor: 0 false positive stale alert for non-EXECUTING tasks.

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
WhatsApp Business API hazırlık. Official API approval 2-6 hafta — Sprint 150'da **scaffold-only**, aktivasyon Sprint 153+.

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
      'Scaffold only in Sprint 150. Activation targeted for Sprint 153+. ' +
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
**NOT:** Worker Alperen'in GitHub hesabı olmadığı için yeni repo CREATE edemez. Onun yerine local `deckent-hub/` dizini (git repo olarak init edilebilir) + push için Alperen elle yapar Sprint 151'de.

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

**Kanıt:** Manual Alperen GitHub create + push Sprint 151.

---

## Task 18: 20 Seed Skill Creation

- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer
- Files: deckent-hub/skills/*/SKILL.md + manifest.json (×20)
- Scope: deckent-hub/

### Description
20 seed skill author + sign (T-150-016 Ed25519 kullan):
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

Her skill: `SKILL.md` (trigger patterns + examples) + `manifest.json` (manifestVersion 2) + `signature.ed25519` (T-150-016'dan).

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
2. Ed25519 sign (T-150-016)
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
- **Screenshots:** `deckent nervous` TUI + dashboard ChatPage (Sprint 151'de çekilecek — placeholder şimdilik)
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
- Files: scripts/doc-review.mjs (NEW), docs/audits/sprint-150/doc-review-report.md
- Scope: scripts/, docs/audits/

### Description
388 .md dosya için review. Otomatik kategorize (keep/revise/delete/move) + Alperen manual inceleme için report.

`scripts/doc-review.mjs` (~200 LoC):
- Tüm .md dosyaları listele
- Size, last-modified, sprint reference count analyze
- Duplicate detect (hash-based)
- Link check (broken ref)
- Stale heuristic: "Sprint N" + N < current-10 → "REVISE"
- Output: `docs/audits/sprint-150/doc-review-report.md` (384 satır tablo)

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
- Files: scripts/i18n-parity.mjs (NEW), scripts/link-checker.mjs (NEW), docs/audits/sprint-150/i18n-parity-report.md
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
ADR-041 "Agent Taxonomy" Sprint 148'de proposed. Sprint 150'da ACCEPT. Dogfood kanıtları:
- Sprint 148 test-writer 10 task (önceki %95'ten %36'ya inmesi)
- AgentRoutingHealth detector anomaly doğruladı
- 38 task arasında test-writer assigned 0 olmalı (Sprint 150'da)

ADR-042 draft: "Hybrid Mode Architecture — Sprint + Task Dual Modes"
- Status: proposed
- Context: Deckent = developer + life assistant birleşik
- Decision: `deckent_style` config, single mode active, user switch
- Consequences (+): dual audience, hub ecosystem için zemin
- Consequences (-): mode-aware code complexity

```typescript
store.updateById('adr-041', { status: 'accepted', sprint_id: 'sprint-150' });
store.insert({
  id: 'adr-042',
  type: 'adr',
  title: 'Hybrid Mode Architecture — Sprint + Task Dual Modes',
  status: 'proposed',
  sprint_id: 'sprint-150',
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
- Files: package.json, scripts/npm-publish-dry-final.sh (NEW), docs/audits/sprint-150/npm-publish-dry-final.md
- Scope: ./, scripts/, docs/audits/

### Description
Version bump 0.4.0-beta.3 → 1.0.0-beta.1 (major). npm pack dry-run final check:
- Tarball size < 2MB
- No secrets (scan `.deck`, `.env`, credentials)
- Only src + dist + docs + README + LICENSE + CHANGELOG included
- package.json metadata complete (description, homepage, bugs, repository, keywords)
- **KRİTİK BAĞIMLILIK:** T-150-031 built-in bundle (15 agent + 21 skill) aynı `npm pack` komutuyla doğrulanır — tarball içinde `dist/core/builtins/` dizini ≥36 JSON/MD dosya içermeli.

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

# Built-in bundle check (T-150-031 live verification)
builtin_agents=$(grep -c "dist/core/builtins/agents/.*\.json" /tmp/pack.log || echo 0)
builtin_skills=$(grep -c "dist/core/builtins/skills/.*\.json" /tmp/pack.log || echo 0)
if [ "$builtin_agents" -lt 15 ]; then echo "❌ Built-in agents bundle incomplete: $builtin_agents < 15"; exit 1; fi
if [ "$builtin_skills" -lt 21 ]; then echo "❌ Built-in skills bundle incomplete: $builtin_skills < 21"; exit 1; fi

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

## Task 27: VerhexIO/deckent Public Repo Hazırlık (Sprint 151'de Alperen Flip)

- Model: sonnet
- Effort: normal
- Skills: devops-engineer, documentation-writer
- Files: docs/release/public-repo-manifest.md (NEW), scripts/public-repo-sync.sh (NEW)
- Scope: docs/release/, scripts/

### Description
Public repo için hazırlık (henüz public flip yok — Alperen Sprint 151'de manuel):

`docs/release/public-repo-manifest.md` — public'e gidecek dosya listesi:
- ✅ src/ (tüm source)
- ✅ tests/ (test files)
- ✅ docs/ (user-facing, not audits)
- ✅ README.md, README-TR.md, LICENSE, CHANGELOG.md, CONTRIBUTING.md
- ❌ `.brain/` (internal memory — exclude)
- ❌ `.deckent/` (project-specific — exclude, user will have their own)
- ❌ `.deckent/docs.json` (T-150-037 ile dev-private lokal runtime — exclude listesine özel)
- ❌ `.deck` (secrets — always exclude)
- ❌ `DECKENT-MASTER-BLUEPRINT.md` (private, ADR-033 governance)
- ❌ `DECKENT-ANA-PLAN-TR.md` (private)

`scripts/public-repo-sync.sh` — helper: `deckent-dev` → `deckent` sync (Alperen Sprint 151'de çalıştırır):
```bash
#!/bin/bash
# This script helps Alperen do the Sprint 151 public repo flip
# NOT run during Sprint 150 — informational only
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
git commit -m "sync: Sprint 150 beta GA prep"
echo "✓ Ready for Alperen review before push"
```

**Bağımlılık chain:** T-150-037 (docs.json private/public split) ÖNCE tamamlanmalı → T-150-027 `.deckent/docs.json` exclude listesine eklenir. `.deckent/` zaten `--exclude` altında olduğu için pratik etki yok ama T-150-037 migration dev-deckent'in docs.json'ını untrack eder — commit diff'i temiz olur.

### Test (3 test)
1. public-repo-manifest.md documents ≥10 include/exclude items
2. public-repo-sync.sh dry-run mode works (--dry-run flag)
3. Excluded paths correctly filtered

**Kanıt:** Script exists, manifest complete.

---

# BLOCK G — Manuel Toparlama Konsolidasyonu (11 task, Wave 7 — 2026-04-21 session)

Bu blok 2026-04-21 oturumundaki iki-persona manuel analiz günün çıktılarını Sprint 150'ye konsolide eder. `NEXT-SESSION-PROMPT.md` referans (~1191 satır), Alperen kararları kilit.

## Task 28: `cleanOrphanIpcDirs` Wire-Up with Live-PID Check

- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/core/orphan-cleaner.ts, src/mcp/tools/start.ts, tests/core/orphan-cleaner-ipc.test.ts (NEW)
- Scope: src/core/, src/mcp/tools/, tests/core/

### Description
`cleanOrphanIpcDirs` (src/core/orphan-cleaner.ts:305) dead code — live-PID check (`process.kill(pid, 0)`) ile her `deckent_start` öncesi çağrılır. `start-detached-fork.integration.test.ts` concurrent test'iyle çakışmaz.

2026-04-21 manuel session'da 435 orphan `.deckent/sprint-<timestamp>-ipc/` dizini silindi + test isolation fix (mocks) + production savunma (writeFileSync + fork try/catch) yapıldı. Ama `cleanOrphanIpcDirs` wire'ı pre-flight'a eklenmedi çünkü concurrent integration test 2 orphan dir bekliyor. Live-PID check ile artık güvenle wire edilebilir.

`src/mcp/tools/start.ts` içinde `deckent_start` handler başında:
```typescript
// Pre-flight: clean up dead orphan IPC directories (keep live PIDs safe)
try {
  const cleaned = cleanOrphanIpcDirs(root, { checkLivePid: true });
  if (cleaned.length > 0) {
    debugLog('start:orphanCleanup', `Cleaned ${cleaned.length} dead orphan dirs`);
  }
} catch (e) { debugLog('start:orphanCleanup:error', e); }
```

`src/core/orphan-cleaner.ts` live-PID check:
```typescript
export function cleanOrphanIpcDirs(root: string, opts: { checkLivePid: boolean } = { checkLivePid: true }): string[] {
  const cleaned: string[] = [];
  const ipcDirs = glob.sync('.deckent/sprint-*-ipc/', { cwd: root });
  for (const dir of ipcDirs) {
    const configPath = join(root, dir, 'config.json');
    if (!existsSync(configPath)) {
      // Config-only dir (no status/result/error) — safe to remove
      rmSync(join(root, dir), { recursive: true, force: true });
      cleaned.push(dir);
      continue;
    }
    if (opts.checkLivePid) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        const pid = config.pid;
        if (pid && !isPidAlive(pid)) {
          rmSync(join(root, dir), { recursive: true, force: true });
          cleaned.push(dir);
        }
      } catch { /* best-effort */ }
    }
  }
  return cleaned;
}

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
```

### Test (3 test)
1. Dead PID dir → removed
2. Live PID dir → preserved
3. Concurrent start isolation: 2 paralel `deckent_start` → ikisi de kendi IPC dir'ini korur

**Kanıt:** `grep -rn "cleanOrphanIpcDirs" src/` → start.ts'de aktif çağrı; `npx vitest run tests/core/orphan-cleaner-ipc.test.ts tests/mcp/tools/start-detached-fork.integration.test.ts` → all pass.

---

## Task 29: Feature Manifest Canlılaştırma (Tam Scope)

- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert, documentation-writer
- Files: scripts/sync-manifest.mjs (NEW), src/orchestra/sprint-finalizer.ts, src/cli/commands/features.ts (NEW), src/mcp/tools/feature-query.ts (NEW), tests/core/features-manifest.test.ts, docs/reference/features.md (NEW), .deckent/features-manifest.json
- Scope: scripts/, src/orchestra/, src/cli/commands/, src/mcp/tools/, tests/core/, docs/reference/, .deckent/

### Description
`.deckent/features-manifest.json` Sprint 139 T-139-038'de "Dead Code Audit Step 2" olarak üretilmiş statik JSON. Runtime'da hiçbir `src/` kodu okumuyor (grep zero hits). Sprint 145 T-145-001'de generator'a bağlanma planlanmıştı ama task başka işe dönüştü. İçerik stale: `learning-decay.ts` silinmiş ama manifest henüz yansıtmamış. Test (`tests/core/features-manifest.test.ts`) sadece şema doğrulaması yapıyor, içerik ↔ kod uyumunu test etmiyor.

**7 adım (~800-900 LoC, 4-6 saat):**

1. **`scripts/sync-manifest.mjs`** — `scripts/dead-code-audit.mjs` genişletmesi. src/ ağacını tara, `@deprecated` JSDoc annotations ile "dead", export edilen + import eden "active", entry-point'siz ama file mevcut "dormant" olarak kategorize et. `.deckent/features-manifest.json` auto-generate.

2. **`src/orchestra/sprint-finalizer.ts` RETRO phase hook** — sprint bitiminde `scripts/sync-manifest.mjs` çağrısı → manifest regenerate + git diff emit.

3. **`src/cli/commands/features.ts` — `deckent features [--category]` CLI.** Kategoriler: `active | dormant | dead | all`. Output: tablo (id + category + evidenceSprints + last modified).

4. **`src/mcp/tools/feature-query.ts` — `deckent_feature_query` MCP tool.** Parametre: `category?: string`, `id?: string`. CLI ile parity (ADR-022-V2).

5. **`tests/core/features-manifest.test.ts` güçlendir:**
   - Her `files[]` entry gerçekten dosya sisteminde var mı
   - `active` entry'ler gerçekten `import` ediliyor mu (grep cross-check)
   - `dead` entry'ler gerçekten `@deprecated` işaretli mi

6. **Manifest regenerate** — stale içeriği düzelt (`learning-decay.ts` drop, Sprint 140-150 feature'ları ekle: event-stream v1.1, authority-enforcer Sprint 139 integration, nervous system 5 detector vb).

7. **`docs/reference/features.md`** — manifest'ten auto-gen. AI-first dil (T-150-034 felsefesiyle tutarlı).

**Reference pattern:** `.deckent/project-stack.json` iskeleti (writer module + mtime cache + staleness check + `config.override` + multi-consumer wire + 15+ test) — `src/core/stack-detector.ts` canlı örnek. Generator modülü aynı pattern'le yaz.

### Test (15+ test)
- Generator output schema valid
- Hook trigger (sprint RETRO)
- CLI args parsing
- MCP tool schema
- Content-vs-code integrity (5+ case)
- Stale entry detection (learning-decay)
- Cross-platform path

**Kanıt:** `node scripts/sync-manifest.mjs --dry-run` 27+ feature listelenir; `deckent features --category=dormant` → 6 feature döner; `deckent_feature_query` MCP tool aktif.

---

## Task 30: Observability Rotation + SprintId Tagging + Dead Read Path Cleanup

- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert, performance-optimizer
- Files: src/core/observability.ts, src/core/observability-rotation.ts (NEW), src/core/config.ts, src/core/config-types.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts, src/mcp/tools/status.ts, tests/core/observability.test.ts, tests/core/observability-rotation.test.ts (NEW), .deckent/config.json
- Scope: src/core/, src/orchestra/, src/mcp/tools/, tests/core/, .deckent/

### Description
`.deckent/metrics.jsonl` şu an append-only, rotation yok, sprintId tag yok, Sprint 135'ten beri tek dosyada 15 sprint telemetrisi birikti (256KB, 2209 satır, %94'ü 3 metric). Orta vade sonsuz çözüm:

1. **Rotation policy:** size-based (>1MB) ve sprint-based (her sprint bitişinde) rotate → `.deckent/archive/metrics/metrics-<sprint-id>.jsonl.gz`. Config key:
```typescript
observability: {
  rotation: {
    maxSizeMB: 1,
    archiveFormat: 'gzip',
    keepLastN: 10
  }
}
```
3-layer config merge'e entegre.

2. **SprintId tagging:** `initObservability(root, sprintId)` signature'a sprintId eklenir, `metric/trace/log` otomatik tag'ler. Retro-kompat: eski "unknown" tag'li entry'ler hâlâ okunur.

3. **Dead read path cleanup:** `src/mcp/tools/status.ts:80` `sprint-NNN-metrics.jsonl` okuma kodu — ya yazıcı tarafını wire et (per-sprint ayrı dosya, rotation ile tutarlı), ya da sil (dead code). **Karar: rotation yaklaşımı per-sprint'i natural yapar → yazıcı wire edilmeli, status.ts canlı consumer olur.** T-150-038 tamamlayıcı.

4. **Bugün yapılan archive:** Sprint 150 başlangıç adımında `.deckent/metrics.jsonl` (256KB) → `.deckent/archive/metrics/metrics-pre-sprint-150.jsonl.gz` taşınır, yeni rotation policy canlı.

5. **Metric efficiency:** Top-3 metric (hb.stale/collect.batch/result.collected) %94. Sampling/aggregation düşün: `hb.stale` her scan yerine sadece **değişiklik olduğunda** emit (counter delta). Konfigüre edilebilir.

```typescript
// src/core/observability-rotation.ts
export function rotateMetricsFile(root: string, sprintId: string): void {
  const metricsPath = join(root, '.deckent', 'metrics.jsonl');
  const archivePath = join(root, '.deckent', 'archive', 'metrics', `metrics-${sprintId}.jsonl.gz`);
  if (!existsSync(metricsPath)) return;
  const stat = statSync(metricsPath);
  if (stat.size === 0) return;
  mkdirSync(dirname(archivePath), { recursive: true });
  const content = readFileSync(metricsPath);
  const gzipped = gzipSync(content);
  writeFileSync(archivePath, gzipped);
  writeFileSync(metricsPath, '');  // truncate
  enforceKeepLastN(root, 10);
}
```

### Test (10+ test)
- Rotation trigger (size threshold, sprint boundary)
- Archive gzip format integrity (roundtrip read)
- keepLastN enforcement (11. arşivde 1. silinir)
- SprintId auto-injection (mock initObservability, assert tag'lenmiş)
- Retro-kompat (eski "unknown" tagli entry'ler `generateLoadReport`'ta görülür)
- status.ts per-sprint okuma (yazıcı wire edilmişse)
- Config 3-layer merge (rotation opts default → global → project)
- Sprint 140 disaster-benzeri anomali: 1500+ satır tek sprint → rotation tetiklenir

**Kanıt:**
- `ls .deckent/archive/metrics/*.gz` → en az 1 arşiv dosya var
- `du -sh .deckent/metrics.jsonl` → <1MB (veya sprint bitişinde 0)
- `jq 'select(.tags.sprintId)' .deckent/metrics.jsonl | wc -l` → tüm canlı entry'ler sprintId'li
- `grep "sprint-NNN-metrics.jsonl" src/mcp/tools/status.ts` → ya canlı çağrı var ya da dead read path silindi
- `deckent config read | grep rotation` → rotation policy config'te

**Kazanımlar:**
- **Runtime:** Dosya asla patlamaz (user projelerinde Beta GA'da kritik). Sprint-segmented analysis mümkün (`generateLoadReport(sprintId)` gerçekten sprint-specific).
- **User:** `.deckent/` dizin boyutu sabit kalır (sprint başına ≤1MB arşiv × keepLastN). Sprint 140 disaster-benzeri anomali kaybolmaz — arşivde korunur.
- **Dashboard/MCP:** `status.ts`'in `sprint-NNN-metrics.jsonl` okuma kodu canlı olur → per-sprint dashboard fetching çalışır.
- **Governance:** Observability loop tam — yazım + rotation + segmentation + okuma + rapor + arşiv, altı katman da canlı.

---

## Task 31: Built-in Agent + Skill Bundle Pipeline (P0 Beta GA Blocker)

- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert, devops-engineer, documentation-writer
- Files: package.json (files[]), src/core/agent-pool.ts, src/core/skill-registry.ts, src/core/builtins/ (NEW), src/cli/commands/init-steps.ts, scripts/bundle-builtins.mjs (NEW), tests/e2e/init-builtin-seed.test.ts (NEW), tests/core/agent-pool.test.ts, .deckent/agents/*/, .deckent/skills/*/
- Scope: package.json, src/core/, src/cli/commands/, scripts/, tests/, .deckent/

### Description
**User tarafı kritik gap (kullanıcı 2026-04-20 tarihinde canlı doğruladı):** `npm pack --dry-run` çıktısında 15 built-in agent + 21 built-in skill JSON/MD dosyaları **yok**. `dist/` altında sadece TS kodu + rule-templates + pricing-baseline mevcut. `agent.json`/`skill.json`/`PROMPT.md`/`SKILL.md` npm bundle'da **sıfır**. User `deckent init` çalıştırdığında built-in agent/skill pool fiziksel olarak oluşmuyor — sadece temp agents (project-stack tabanlı) yaratılıyor. Deckent çalışır gibi görünür (kod içinden keyword match ile agent adları referans ediliyor) ama:
- Dashboard'da built-in listelenmez
- `deckent agent list` boş/eksik döner
- User agent customize edemez (PROMPT.md yok, hangi dosya override edilecek?)
- ADR-041 agent taxonomy reform user projesinde uygulanamaz

**Uygulama planı (7 adım):**

1. **`src/core/builtins/agents/<id>/{agent.json,PROMPT.md}` ve `src/core/builtins/skills/<id>/{skill.json,SKILL.md}`** kanonik seed directory yapısı — deckent-dev'deki `.deckent/agents/` ve `.deckent/skills/` kaynak alınır. **KRİTİK AYRIM:** T-150-018 (20 seed skill deckent-hub) farklı path (`deckent-hub/skills/`), bu task sadece Deckent ürünün içindeki 15+21 built-in fiziksel bundle.

2. **`scripts/bundle-builtins.mjs`** — `.deckent/` (dev) → `src/core/builtins/` sync script. Pre-publish hook:
```javascript
#!/usr/bin/env node
import { cpSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '.deckent';
const DST = 'src/core/builtins';

for (const category of ['agents', 'skills']) {
  const srcDir = join(SRC, category);
  const dstDir = join(DST, category);
  for (const entry of readdirSync(srcDir)) {
    const stat = statSync(join(srcDir, entry));
    if (!stat.isDirectory()) continue;
    // Skip temp agents (LRU eviction)
    if (entry.startsWith('temp-')) continue;
    cpSync(join(srcDir, entry), join(dstDir, entry), { recursive: true });
    console.log(`✓ ${category}/${entry} bundled`);
  }
}
```

3. **`package.json` files[] içine `dist/core/builtins/` eklenir;** tsc build bu dizini kopyalar (veya `"build": "tsc && cp -r src/core/builtins dist/core/"` script).

4. **`init-steps.ts` → `clearStaleCaches` sonrası `seedBuiltins()` çağrısı:** `dist/core/builtins/` → user'ın `.deckent/agents/` + `.deckent/skills/` seed et. **Idempotent: mevcut user override'ları korur (writeIfNotExists pattern).**
```typescript
function seedBuiltins(root: string): void {
  const builtinsDir = resolve(__dirname, '../../core/builtins');
  for (const category of ['agents', 'skills']) {
    const srcDir = join(builtinsDir, category);
    if (!existsSync(srcDir)) continue;
    const dstDir = join(root, '.deckent', category);
    mkdirSync(dstDir, { recursive: true });
    for (const entry of readdirSync(srcDir)) {
      const srcEntry = join(srcDir, entry);
      const dstEntry = join(dstDir, entry);
      if (!existsSync(dstEntry)) cpSync(srcEntry, dstEntry, { recursive: true });
    }
  }
}
```

5. **`agent-pool.ts` / `skill-registry.ts`** — seed eksikse fallback olarak kod içi keyword match çalışmaya devam (backward compat).

6. **`tests/e2e/init-builtin-seed.test.ts`** — tmp dir'de `deckent init` çalıştır → 15 agent + 21 skill fiziksel dosya kontrolü.

7. **CI:** `npm pack --dry-run | grep -c "builtins/agents"` ≥ 15 check (T-150-026 entegre doğrulama).

### Test (12+ test)
- Bundle script idempotent (dev → src/core/builtins roundtrip)
- npm pack contents invariant (agent count, skill count)
- init e2e seed (tmp project, 15+21 file check)
- User override korunur (writeIfNotExists pattern)
- agent-pool fallback (seed yoksa keyword match)
- PROMPT.md / SKILL.md content integrity
- Cross-platform (Windows path separator)

**Kanıt:**
- `npm pack --dry-run 2>&1 | grep "builtins/agents/.*\.json" | wc -l` → ≥ 15
- `npm pack --dry-run 2>&1 | grep "builtins/skills/.*\.json" | wc -l` → ≥ 21
- tmp dir e2e: `cd /tmp/test && npx deckent init && ls .deckent/agents/architect/agent.json` → exists
- `deckent agent list` → 15 built-in görünür

**Kazanımlar:**
- **User:** `npx deckent init` sonrası fiziksel olarak kullanılabilir 15 agent + 21 skill. Customize edebilir, override edebilir, dashboard'da görür.
- **ADR-041:** Agent taxonomy reform user projesinde de uygulanabilir — horizontal skill / vertical agent ayrımı user-facing.
- **Beta GA unblocker:** Bu gap kapanmadan Public Beta GA verilemez — Deckent "self-aware" iddiası çöker çünkü kullanıcıda dosyalar yok.
- **Dogfood:** deckent-dev'deki `.deckent/agents/` user ortamında da aynı olur — paritenin kanıtı.

**Bağımlılık chain:** T-150-031 → T-150-026 (`npm pack --dry-run` bu task'ın canlı doğrulaması) + T-150-027 (public repo sync built-in'leri korur).

---

## Task 32: `deckent audit` + `deckent recover` User-Facing CLI + MCP Yüzeyi

- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert, api-builder, documentation-writer
- Files: src/cli/commands/audit.ts (NEW), src/cli/commands/recover.ts (NEW), src/mcp/tools/audit.ts (NEW), src/mcp/tools/recover.ts (NEW), src/orchestra/sprint-finalizer.ts (export genişletme), src/core/orphan-cleaner.ts, tests/cli/commands/audit.test.ts (NEW), tests/cli/commands/recover.test.ts (NEW), tests/mcp/tools/audit.test.ts (NEW), tests/mcp/tools/recover.test.ts (NEW), docs/reference/cli.md, README.md
- Scope: src/cli/commands/, src/mcp/tools/, src/orchestra/, src/core/, tests/, docs/reference/

### Description
**User tarafı kritik gap (2026-04-21 `.deckent/run-self-audit.mjs` analizi BULGU'sundan):** `runSelfAuditGate()` production feature aşırı canlı (finalizeSprint:898 her sprint otomatik çağırır) ama CLI ve MCP yüzeyinde **YOK**. Dev-deckent Sprint 134'te crash olduğunda throwaway `.deckent/run-self-audit.mjs` ile recovery yaptı. User aynı durumu yaşarsa (Sprint 139 coordinator panic kill, Sprint 140 $42 disaster, Sprint 144 IPC leak — hepsi user'ın başına da gelecek) elinde recovery aracı yok. "Biz yaptık deckent'e ekledik peki user tarafı?" sorusunun tam cevabı.

**Uygulama planı (7 adım):**

1. **`deckent audit <sprint-id>`** CLI komutu — `runSelfAuditGate(sprintId, projectRoot)` çağırır, `SelfAuditResult` JSON'u stdout + `.deckent/<sprint-id>-gate.json`'a yazar. Exit code: PASS → 0, GATE_FAILURE → 1.

2. **`deckent_audit` MCP tool** — `{ sprintId: string }` parametresi, readOnly: true, destructive: false. CLI ile birebir parity (ADR-022-V2).

3. **`deckent recover <sprint-id>`** CLI komutu — audit + orphan cleanup + stale lock clear + task archive pipeline. Sprint yarım kalmışsa yeniden execute edilebilir hale getirir. Interactive prompt (confirm before destructive ops).

4. **`deckent_recover` MCP tool** — destructive: true, autoApprove false default.

5. `sprint-finalizer.ts` → `runSelfAuditGate` zaten export ediliyor (line 228), CLI/MCP katmanları thin wrapper.

6. Docs: `docs/reference/cli.md`'ye komut referansı + recovery workflow (user'ın "sprint crash oldu ne yapmalıyım?" senaryosuna adım adım cevap).

7. README'ye "Crash recovery" bölümü.

```typescript
// src/cli/commands/audit.ts
import { Command } from 'commander';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';

export function registerAudit(program: Command): void {
  program.command('audit <sprint-id>')
    .description('Run Brain Self-Audit Gate for a sprint')
    .option('--json', 'Output JSON only')
    .action(async (sprintId, opts) => {
      const result = await runSelfAuditGate(sprintId, process.cwd());
      const gatePath = join(process.cwd(), '.deckent', `${sprintId}-gate.json`);
      writeFileSync(gatePath, JSON.stringify(result, null, 2));
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Gate: ${result.overallGate}`);
        console.log(`tsc: ${result.tsc.status}, vitest: ${result.vitest.status}`);
        console.log(`Written: ${gatePath}`);
      }
      process.exit(result.overallGate === 'PASS' ? 0 : 1);
    });
}
```

### Test (15+ test)
- CLI `deckent audit` PASS/FAIL/WARNING yolları
- CLI `deckent recover` --dry-run vs live
- MCP tool schema validation
- MCP tool destructive flag enforcement
- Crash recovery e2e (tmp project, simulated crash)
- Exit code matrix
- Multi-sprint audit (geçmiş sprint'in gate.json'ı var mı kontrol)

**Kanıt:**
- `deckent audit sprint-150 --json | jq '.overallGate'` → "PASS" veya "GATE_FAILURE" döner
- `deckent recover sprint-150 --dry-run` → temizlenecekler listesi stdout
- `deckent_audit` MCP tool registered: `deckent_help | grep audit` → tool listesinde
- Crash scenario e2e: tmp project'te sprint yarıda kes → `deckent recover` → sprint yeniden başlatılabilir

**Kazanımlar:**
- **User:** Sprint crash/hang durumunda **sahipsiz kalmaz**. Deckent'in kendi başına getirdiği T-014 Brain Self-Audit Gate her user projesinde de çalışabilir hale gelir.
- **Beta GA:** "Crash recovery story" user doc'unda somut komutla cevap bulur. Launch messaging: "Deckent knows how to recover itself — and you."
- **Dev-prod parity:** deckent-dev Sprint 134'te elle yaptığı adım user'da tek komuta iner. Dogfood paritesi.
- **MCP/CLI parity (ADR-022-V2):** Her CLI komut MCP'de de var — yeni ADR amendment gerektirmez, zaten kural bu.

---

## Task 33: Safety-Point Lifecycle Onarımı + User-Loss Guard

- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/rollback.ts, src/orchestra/sprint-phases.ts, src/core/errors.ts, tests/orchestra/rollback.test.ts, tests/orchestra/sprint-phases-rollback.test.ts (NEW), docs/reference/config.md, .deckent/safety-point.json (bugünkü stale)
- Scope: src/orchestra/, src/core/errors.ts, tests/orchestra/, docs/reference/, .deckent/

### Description
2026-04-21 manuel analiz 3 kritik bulgu:
1. **BULGU 1:** `deleteSafetyPoint` git branch siler **ama JSON dosyası kalır**. Cleanup sözleşmesi asimetrik. Sonuç: `.deckent/safety-point.json` her sprint sonrası güncellenmez ama silinmez de.
2. **BULGU 2 (P1 prod):** No-git-repo fallback **silent** — `createSafetyPoint` fail ederse rollback feature sessizce devre dışı kalır. User bilgilendirilmez.
3. **BULGU 3 (P0 prod user-loss):** Dirty tree + stash pop fail kombinasyonunda user'ın uncommitted changes'i `console.warn` ile gömülüp kaybolabilir.

**Uygulama planı (8 adım):**

1. **`deleteSafetyPoint` genişletme (BULGU 1):** `rollback.ts:201` — git branch delete'ten sonra `SAFETY_POINT_FILE` path'inde `rmSync({ force: true })` çağrısı ekle. Cleanup simetrik olur (save ↔ delete file partner'i tam).

2. **`deleteSafetyPointFile` helper export:** `saveSafetyPoint` / `loadSafetyPoint` / `deleteSafetyPointFile` üçlüsü tek modülde simetrik. Public API.

3. **Orphan temizlik (stale artifact fix):** Sprint 150 PLAN phase başında `cleanOrphanSafetyPoint(projectRoot)` — disk'te JSON var ama `loadSafetyPoint().id !== currentSprintId` ise JSON sil (önceki sprint'in safety point'i temizlenmemiş demek). Live sprint branch'ini kontrol et, gerçekten orphan ise sil, live ise dokunma.

4. **No-git-repo visible warning (BULGU 2):** `createSafetyPoint` → `git rev-parse --git-dir` pre-check. Git repo yoksa `throw ErrorRegistry.createError('DECKENT_E053', {...})` — sprint-phases.ts:213 catch'i warning log yerine `config.rollback.disabledReason` state'ine yazar. User `deckent config read` veya `deckent_status` ile görebilir.

5. **Stash fail-hard (BULGU 3):** `rollback.ts:133-137` — stash pop fail olursa `console.warn` yerine explicit error mesajıyla throw (recovery instructions: "Run `git stash list` to see your changes, `git stash pop` manually"). Sprint start abort edilir — yarım durumla devam etme.

6. **Test genişletme:**
   - `tests/orchestra/rollback.test.ts`: `deleteSafetyPoint` JSON dosyasını siliyor mu (yeni assertion).
   - `cleanOrphanSafetyPoint` unit test (stale detection, live preservation).
   - No-git-repo fail path (tmp dir without .git).
   - Stash pop fail throw (git mock).
   - `tests/orchestra/sprint-phases-rollback.test.ts` (yeni) — PLAN→SPAWN→RETRO lifecycle'ta JSON doğru yazılıyor/siliniyor mu.

7. **Doc:** `docs/reference/config.md`'ye `rollback.enabled` / `rollback.policy` / `rollback.disabledReason` alanları eklenir; user'ın "rollback nedir, ne zaman tetiklenir, nasıl kapatılır" sorularına yanıt.

8. **Bugünkü stale dosyayı temizleme:** Task PLAN phase ilk adımında bugünkü `.deckent/safety-point.json` (sprint-149 referans) silinir — `cleanOrphanSafetyPoint` live-çalışmasının ilk kanıtı.

### Test (8+ test)
- `deleteSafetyPoint` JSON dosyasını siliyor mu
- `cleanOrphanSafetyPoint` stale detection
- `cleanOrphanSafetyPoint` live preservation
- No-git visible warning
- Stash fail throw
- Lifecycle integration
- Config doc schema
- Git-less fallback

**Kanıt:**
- `cat .deckent/safety-point.json 2>&1` → "No such file" (sprint başında temizlenmiş, sonrasında Sprint 150'nin SAFETY_POINT yazılır, sprint sonunda tekrar silinir)
- `git branch --list 'deckent-backup-*' | wc -l` → Sprint 150 sonrası 0 veya tek bir live branch
- `grep -n "rmSync.*SAFETY_POINT_FILE" src/orchestra/rollback.ts` → yeni cleanup call var
- `deckent config read | jq '.rollback.disabledReason'` → null (normal repo) veya "no_git_repo" (git-less project)

**Kazanımlar:**
- **Runtime:** `.deckent/safety-point.json` her sprint sonrası temizlenir — yanıltıcı stale artifact yok.
- **User:** Sprint başlatırken uncommitted changes varsa artık **kesin koruma** — stash fail olursa sprint başlatılmaz, user önce durumu düzeltir. Data loss riski sıfır.
- **Observability:** Rollback disabled ise **görünür** (config field + deckent_status). Silent disable yok.
- **Dogfood:** Bugünkü stale dosya — Sprint 150 PLAN phase'ın ilk canlı çalışması (self-hosting kanıtı).
- **Rakip edge:** OpenClaw'ın rollback feature'ı yok — Deckent'in "sprint öncesi safety point + auto-rollback" story'si launch messaging'in parçası olabilir.

---

## Task 34: Config Sadeleştirme + MODE_PRESETS Konsolidasyon + System Capacity Auto-Detect MVP + Self-Healing (ONAYLI Alperen 8-karar matris)

- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert, documentation-writer, devops-engineer
- Files: src/core/config-migration.ts, src/core/config.ts, src/core/config-types.ts, src/core/mode-presets.ts, src/cli/commands/init-steps.ts, src/cli/auto-setup.ts (genişletme), src/core/system-capacity.ts (NEW), tests/core/config-migration.test.ts, tests/core/config-corrupted-recovery.test.ts (NEW), tests/core/system-capacity.test.ts (NEW), docs/reference/config.md (YENİDEN YAZ), .deckent/config.json (bugünkü dev dosyası clean-up migration ile)
- Scope: src/core/, src/cli/, tests/core/, docs/reference/, .deckent/

### Description
**Alperen 2026-04-21 8-karar matrisi (T-150-009 FINAL SCOPE KİLİT):**

| # | Konu | Karar |
|---|------|-------|
| 1 | Mode preset `max_workers` (8/5/3/10) | **KALIR** — Deckent standart modelleri |
| 2 | Top-level `max_workers` | **KALIR** — user custom override (50 worker bile) |
| 3 | `claude_backend` duplicate | **KALDIR** — çift kabuk çelişki + dead read |
| 4 | Flat `brain_provider/worker_provider` | **KALDIR** — grouped kanon |
| 5 | `api` mode rename | **HAYIR** — `api` kalacak |
| 6 | `rollback_policy` default | **`never` kalacak** |
| 7 | Naming alias | **YOK** — `config.md` tek referans (AI + human dual-audience) |
| 8 | System capacity auto-detect | **Sprint 150'ye al MVP**, Sprint 151+'da genişlet |

**Uygulama planı (7 adım):**

1. **Duplicate key removal migration (Alperen karar 3+4):**
   - `config-migration.ts`'e yeni migration step ekle: "v2-duplicate-remover".
   - Eğer `spawn_backend` varsa → `claude_backend`'i sil (schema violation + çelişki).
   - Eğer `providers.brain` varsa → top-level `brain_provider`'ı sil.
   - Eğer `providers.worker` varsa → top-level `worker_provider`'ı sil.
   - Tüm silme işlemleri **atomik** (writeFileSync tek seferde), `debugLog` ile iz bırak.
   - **Top-level `max_workers` ve preset `max_workers` KORUNUR** (Alperen karar 1+2).

2. **MODE_PRESETS konsolidasyonu (BULGU 2):**
   - `config.ts:84-105`'teki DEFAULT_MODES duplicate silinsin.
   - `config.ts` `mode-presets.ts`'den import etsin.
   - Preset değerleri değişmiyor (performance 8, balanced 5, economic 3, api 10).
   - Hardcode `max_workers` fallback `4` 6 yerde kalmaya devam — Alperen karar "hardcoded fallback doğru tasarım."

3. **Self-healing corrupted config recovery (BULGU 4):**
   - `readJsonFile` yerine `loadConfig`'e catch bloğu ekle.
   - Parse fail olursa: `config.json` → `config.json.corrupted.<ISO-timestamp>.bak` rename, fresh `createDefaultConfig()` yaz, stderr'e warning: "Config dosyanız bozulmuştu, yedeklendi: <path>. Defaults ile devam ediliyor. Düzeltme için `deckent config read`."
   - Test: corrupt JSON inject → CLI crash olmasın, fresh config ile devam etsin.

4. **System Capacity Auto-Detection MVP (Alperen karar 8):**
   - `src/core/system-capacity.ts` yeni modül:
```typescript
export interface SystemCapacity {
  totalRamGB: number;        // os.totalmem() / 1e9
  freeRamGB: number;         // os.freemem() / 1e9
  cpuCores: number;          // os.cpus().length
  dockerAvailable: boolean;  // spawnSync('docker', ['--version'])
  platform: NodeJS.Platform; // os.platform()
}
export function detectSystemCapacity(): SystemCapacity;
export function suggestMaxWorkers(cap: SystemCapacity): number;
export function suggestSpawnBackend(cap: SystemCapacity): 'docker' | 'subprocess' | 'tmux';
```
   - `suggestMaxWorkers` heuristic MVP:
     - `totalRamGB < 4` → 1 worker
     - `totalRamGB 4-8` → 2 worker
     - `totalRamGB 8-16` → 3-4 worker (cpuCores'a bağlı)
     - `totalRamGB > 16` → min(cpuCores-2, 8) worker
   - `suggestSpawnBackend` heuristic:
     - `platform === 'win32'` → 'subprocess' (zaten mevcut kural)
     - `dockerAvailable` → 'docker'
     - aksi → 'subprocess' (veya 'tmux' varsa)
   - `init-steps.ts` `writeConfig`'e entegre: eğer user config'te `max_workers` yoksa **suggest**et değer yaz, auto-detected olduğunu comment'le belirt (JSON comment değil ama `"_auto_detected": { "max_workers": true }` meta key ile).
   - Alperen direktifi: "**şimdilik MVP, sonra detaylandıracağız**" → Sprint 151 aday: GPU (nvidia-smi), network latency, disk quota, Claude subscription tier.

5. **`docs/reference/config.md` tam yeniden yaz (BULGU 3):**
   - AI + human dual-audience başlık paragrafı:
   ```markdown
   Bu doküman Deckent config sisteminin tek kanon referansıdır. AI orchestrator'ları
   (Claude Code, Codex, Gemini) ve insan geliştiricilerin birlikte okuyup anlaması
   için yazılmıştır. Alias yoktur — her key tek kanonik isimle geçer.
   ```
   - 60 key tam matrisi, kategori bazlı 15+ başlık:
     - Identity (projectName, language, last_sprint_id, detected_env, deckent_style)
     - Modes & Models (mode, modes.*, model_strategy, providers, brain_provider flat=deprecated, ...)
     - Backend & Runtime (spawn_backend, docker_image, docker_timeout, multi_ide_mode)
     - Memory (memory.*, memory_budget, decay_after_sprints, patterns_enabled, project_identity_enabled)
     - Sprint Lifecycle (fix_phase_enabled, max_fix_retries, coverage_threshold, max_reroutes, reroute_on_tech_debt, sprint_timeout_minutes, sprint_checkpoint_interval, cleanup_delay_ms)
     - Auditor (scan_interval, heartbeat_timeout, boundary_enforcement, lock_stale_threshold, auto_clean_locks)
     - Rollback & Safety (rollback_policy, human_checkpoints, auth_mode, api_auth_token, plugin_require_signature)
     - Evaluation (evaluation_rubric, rubric_max_retries, adaptive_thresholds, agent_min_score, adaptive_config)
     - Routing (routing_engine, routing_config.*)
     - Search & Docs (search_enabled, search_provider, search_cache_ttl, auto_docs)
     - Notifications (notify_on_complete, notify_channel, notify_url) vs Nervous System notifications (ayrı)
     - Telemetry (telemetry_enabled, telemetry_anonymous)
     - Output (output_splash, output_mode, output_theme, output_render_mode)
     - Timeout (timeout.docker_min/max, tmux_min/max, subprocess_min/max, effort_base, loc_scaling_enabled, history_scaling_enabled, runtime_extension_enabled)
     - Nervous System (enabled, mode, actionOverrides, safety_floor, notifications, detectors, history_retention_days)
     - Collaboration (collaboration.*) — varsa
   - Her key için: **Type** / **Default** / **Env var override (varsa)** / **Okuyan modüller** / **User guide**. Terminoloji AI orchestrator'ların tutarlı anlaması için net.
   - Başlangıç/kurulum senaryoları: "Temel init", "Docker'lı gelişmiş", "Claude Max + api mode", "Monorepo subproject config", "Multi-IDE ortam."
   - Migration changelog: v1 → v2 duplicate key removal.

6. **Live migration Alperen'in `.deckent/config.json`'ı:** Task ilk adımında dev-deckent dosyası live migrate → 188 satırdan ~120 satıra (duplicate keys silinmiş, MODE_PRESETS tek kaynaktan). Validation sonrası auto-saved.

7. **Test matrix (25+ yeni test):**
   - Migration: `claude_backend` removal (spawn_backend ile birlikte), flat provider removal (grouped ile birlikte), top-level max_workers korunur, mode preset max_workers korunur.
   - MODE_PRESETS single-source: `getModePreset('performance').max_workers === 8` (import'tan), `config.ts`'de DEFAULT_MODES yok.
   - Corrupted recovery: JSON syntax error, empty file, null root, binary garbage → 4 senaryo, her biri fresh default + rename.
   - System capacity: mock `os.totalmem()` (4/8/16/32 GB), mock `os.cpus()` (2/4/8/16 core), mock docker available/unavailable → suggest fns doğru değerler döner.
   - Auto-detect wire: `writeConfig` capacity MVP sonrası `max_workers` suggest eder, user override'da kalır.
   - `docs/reference/config.md` lint: markdown linter + her key config-types.ts'de tanımlı mı cross-check.

**Kanıt:**
- `jq 'has("claude_backend")' .deckent/config.json` → false (migration sonrası)
- `jq 'has("brain_provider")' .deckent/config.json` → false (migration sonrası, grouped varken)
- `jq '.max_workers' .deckent/config.json` → number (top-level korundu, user custom)
- `grep -c "max_workers:" src/core/config.ts` → 0 (MODE_PRESETS oradan silindi)
- `deckent config read --repair` → corrupted scenario'da fresh default döner
- `docs/reference/config.md | wc -l` → ≥ 800 satır (60 key × ~13 satır ortalama)
- `npx vitest run tests/core/config-migration.test.ts tests/core/config-corrupted-recovery.test.ts tests/core/system-capacity.test.ts` → all pass

**Kazanımlar:**
- **Dev:** 188 satırlık config.json temizlenir, tek-kaynak prensibi uygulanır, self-healing eklendi.
- **User:** `deckent init` auto-capacity detection ile sistemine uygun `max_workers` gelir. Customize hakkı elinde (50 worker isterse yapar). Config.md dosyası AI-first net referans.
- **Beta GA:** "Config doğru mu dolacak?" sorusuna net cevap — auto-detect + user override + doc + self-heal katmanları hazır.
- **AI orchestrator parity:** Claude Code / Codex / Gemini CLI hepsi aynı config.md'yi okur, tutarlı davranır. Launch messaging'in temeli.

**Bağımlılık kritik:** T-150-034 `src/core/config-types.ts` + `config.ts` dokunur → **T-150-001** (deckent_style) aynı dosyalar. Wave 7'de T-150-034 başlamadan Wave 1 T-150-001'in bittiğini bekle (file lock).

**İlişkili memory:** `feedback_max_workers.md` V2 güncellendi (2026-04-21) — "WSL2 dev-deckent lokal limit 3-4, product hard limit değil. User customize edebilir."

---

## Task 35: Sprint-Prefixed Dosya Retention (FINAL — Alperen 5 soru 2026-04-21 onaylı)

- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/event-stream.ts, src/orchestra/sprint-checkpoint.ts, src/orchestra/task-restoration.ts, src/orchestra/sprint-finalizer.ts, src/core/sprint-file-retention.ts (NEW), src/cli/commands/cleanup.ts, tests/orchestra/sprint-file-retention.test.ts (NEW)
- Scope: src/orchestra/, src/core/, src/cli/commands/, tests/orchestra/

### Description
**2026-04-21 manuel analiz:** `.deckent/` altında 6 makine dosya ailesi + 4 insan üretimi dosya toplam 60 dosya (~515KB) birikmiş. Retention kodu **YOK** — `grep -rn "unlinkSync\|rmSync" src/orchestra/` event/checkpoint/gate/pre-archive için sıfır eşleşme. Sprint 1000'de 6000+ dosya sorunu prod user projelerinde kritik.

**Envanter (2026-04-21):**

| Aile | Sayı | Yazıcı | Amaç |
|------|------|--------|------|
| `-events.jsonl` | 11 | `src/orchestra/event-stream.ts:193` | ADR-035 Brain↔Worker↔Auditor telemetri |
| `-seq` | 10 (2 byte) | `event-stream.ts:129` | events.jsonl sequence counter |
| `-checkpoint.json` | 6 | `sprint-checkpoint.ts:162` | Sprint state snapshot (resume) |
| `-checkpoint-seq` | 6 (1 byte) | `sprint-checkpoint.ts:97` | Checkpoint counter |
| `-gate.json` | 9 | `sprint-finalizer.ts:919` | Brain Self-Audit Gate sonucu |
| `-pre-archive.tar.gz`+`.sha256` | 6+6 | `task-restoration.ts:74-91` | Task dosyaları rollback snapshot |

**Alperen 5 soru FINAL kararları (2026-04-21 onaylı, kilitli):**

1. **Retention stratejisi:** **Hibrit** — `keep_last_n=10` sprint + `size_cap_mb=500` (ikisi de aktif, hangisi önce tetiklenirse o kural uygular). Keep-last-N chronology korur, size-cap disaster sprint'i (Sprint 140 $42 incident) absorbe eder.
2. **Klasör yapısı:** **Flat + retention MVP** — big-bang hierarchy breaking change yok. Retention eşiği aşıldığında arşiv `.deckent/archive/sprints/<sprint-id>/` altına taşınır. Sprint 151+ evrim için hierarchy düşünülebilir.
3. **Forensic manuel dosyalar** (`-layer3-scorecard.md`, `-verifier-log.md`, `-session-starter.md`, `-emergency-assessment.md`) → **`docs/audits/sprint-NNN/` altına taşınır** (git-tracked artifact, runtime dizinden ayrılır).
4. **`-seq` + `-checkpoint-seq` counter'lar** → **sprint DONE'da silinir** (dead-after-sprint, counter state zaten `checkpoint.json` içinde kalır).
5. **`gate.json`** → **retention penceresinde kalır, sonra arşivlenir** (T-150-032 `deckent audit` tarihsel erişim için, retention penceresinden düştüğünde `.deckent/archive/sprints/<id>/gate.json`'a taşınır).

**FINAL scope özeti:**

1. **Retention:** `keep_last_n=10` sprint + size cap `500MB` (Hibrit, kilitli).
2. **Strateji:** Flat path kalır; eşik aşıldığında `.deckent/archive/sprints/<sprint-id>/` altına taşınır.
3. **Forensic manuel dosyalar** `docs/audits/sprint-NNN/` altına taşınır (bonus sub-step, git-tracked artifact).
4. **`-seq` + `-checkpoint-seq` counter'lar** sprint DONE'da silinir.
5. **`gate.json`** retention penceresinde kalır, penceren düştüğünde arşivlenir (silinmez).

Config key:
```json
"sprint_file_retention": {
  "keep_last_n": 10,
  "size_cap_mb": 500,
  "archive_path": ".deckent/archive/sprints/"
}
```

```typescript
// src/core/sprint-file-retention.ts
export function enforceRetention(root: string, config: SprintFileRetentionConfig): RetentionResult {
  const allSprints = listSprintFiles(root);  // 6 family × all sprints
  const groupedBySprint = groupBySprintId(allSprints);
  const sprintIds = Object.keys(groupedBySprint).sort();  // chronological
  const toArchive = sprintIds.slice(0, -config.keep_last_n);
  const archived: string[] = [];
  for (const sprintId of toArchive) {
    const archiveDir = join(root, config.archive_path, sprintId);
    mkdirSync(archiveDir, { recursive: true });
    for (const file of groupedBySprint[sprintId]) {
      const srcPath = join(root, '.deckent', file);
      const dstPath = join(archiveDir, file.replace(`${sprintId}-`, ''));
      renameSync(srcPath, dstPath);
      archived.push(dstPath);
    }
  }
  return { archived, kept: sprintIds.slice(-config.keep_last_n) };
}
```

### Test (10+ test)
- Retention trigger (keep_last_n threshold)
- Archive path (`.deckent/archive/sprints/<id>/`)
- Size cap (500MB enforcement)
- Forensic preservation (`-layer3-scorecard.md` NOT archived, moved to docs/audits/)
- Counter cleanup (`-seq` silinir, checkpoint-seq silinir)
- Config override (user `keep_last_n=5` set)
- Pre-archive integrity (hash verification after archive)
- Retro-kompat (eski sprint'ler retention penceresinde kalır)

**Kanıt:** Sprint 150 DONE sonrası `.deckent/` root'ta sadece son 10 sprint'in makine dosyaları; 11. sprint'te eski biri arşivlendi/silindi; forensic dosyalar `docs/audits/sprint-NNN/` altında.

---

## Task 36: Managed-Docs Cache Git Tracking Fix + Metadata Annotation

- Model: sonnet
- Effort: low
- Skills: git-expert, typescript-expert, testing-expert, documentation-writer
- Files: .gitignore (invariant test trigger), src/orchestra/managed-docs/doc-cache.ts, src/orchestra/managed-docs/types.ts, tests/orchestra/managed-docs/doc-cache.test.ts, tests/orchestra/gitignore-invariant.test.ts (NEW), .deckent/cache/managed-docs-cache.json (bugünkü dev dosyası — untrack)
- Scope: .gitignore, src/orchestra/managed-docs/, tests/orchestra/, .deckent/cache/

### Description
2026-04-21 manuel analiz BULGU 1+2 atomik fix.

**BULGU 1 (P0 git tracking bug):** `.gitignore:37` satırında `.deckent/cache/` yazılı, **ama `managed-docs-cache.json` hâlâ git-tracked**. Kanıt: `git ls-files --error-unmatch .deckent/cache/managed-docs-cache.json` exit 0, `git status --porcelain` → ` M .deckent/cache/managed-docs-cache.json`. Kök-neden: Dosya Sprint 133 commit `06b7c8a`'da git repo'ya eklendi, gitignore **sonradan** yazıldı. `git rm --cached` gerekli.

**BULGU 2 (P2 missing metadata):** Cache ADR-031 tarafından tasarlandı ama dosyada ADR-031 referans yorum/metadata yok. User doküman zincirini izleyemez.

**Üç adım:**

1. **`git rm --cached .deckent/cache/managed-docs-cache.json`** — dosyayı untrack et (diskteki dosya silinmez). Tek commit ile dev-deckent git history temizlenir. Task PLAN phase ilk adımı.

2. **Metadata annotation:** `doc-cache.ts` `DocCache` type'ına opsiyonel `_meta` key ekle; `writeDocCache` yazarken:
```typescript
{
  _meta: {
    adr: 'ADR-031',
    generatedBy: 'managed-doc-runner.ts',
    schemaVersion: 1
  },
  ...cacheEntries
}
```
`readDocCache` `_meta`'yı filtreleyip entry'lere sadece user doc ID'leri sokar (backward-compat).

3. **Gitignore invariant test:** `tests/orchestra/gitignore-invariant.test.ts` — her sprint baseline check. 7 gitignored path (`.deckent/cache/`, `.deckent/sprint-*-events.jsonl`, `.deckent/sprint-*-seq`, `.deckent/sprint-*-checkpoint.json`, `.deckent/metrics.jsonl`, `.deckent/jobs/`, `.deckent/sprint-*-ipc/`) **hiçbiri git-tracked olmamalı**. Test `git ls-files .deckent/ | grep -E "cache/|sprint-.*-ipc/|jobs/"` → boş beklenir. Bu testler Beta GA user projelerinde de aynı invariant'ı doğrular (user cloned Deckent repo'dan install ederse kirli state inherit etmez).

```typescript
// src/orchestra/managed-docs/doc-cache.ts patch
interface DocCacheMetadata {
  adr: string;
  generatedBy: string;
  schemaVersion: number;
}

export type DocCache = { _meta?: DocCacheMetadata } & Record<string, DocCacheEntry>;

export function writeDocCache(projectRoot: string, cache: DocCache): void {
  const path = join(projectRoot, CACHE_FILE);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Auto-insert metadata
  const withMeta: DocCache = {
    _meta: { adr: 'ADR-031', generatedBy: 'managed-doc-runner.ts', schemaVersion: 1 },
    ...cache,
  };
  writeFileSync(path, JSON.stringify(withMeta, null, 2) + '\n', 'utf-8');
}

export function readDocCache(projectRoot: string): DocCache {
  const path = join(projectRoot, CACHE_FILE);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as DocCache;
    return {};
  } catch (e) {
    debugLog('doc-cache:read', e);
    return {};
  }
}
```

### Test (6+ test)
- `readDocCache` `_meta` filter (backward-compat: eski cache'ler `_meta` yok → entry olarak parse edilmez)
- `writeDocCache` `_meta` auto-insert
- `clearDocCache` `_meta` korur (sadece entry'ler sıfırlanır)
- Gitignore invariant `.deckent/cache/` untracked (current dev state doğrulaması)
- Gitignore invariant 7 gitignored path (cache, sprint-*-events, seq, checkpoint, metrics, jobs, ipc) — hiçbiri git-tracked değil
- Concurrent write safety (bonus, opsiyonel): 2 paralel `writeDocCache` sonrası JSON valid olmalı

**Kanıt:**
- `git ls-files .deckent/cache/managed-docs-cache.json` → boş (untracked after fix)
- `git status --porcelain .deckent/cache/` → boş ya da sadece untracked işareti (`??`)
- `head -5 .deckent/cache/managed-docs-cache.json` → `"_meta"` key ilk satırda
- `grep -c ADR-031 .deckent/cache/managed-docs-cache.json` → ≥ 1

**Kazanımlar:**
- **Dev:** git diff gürültüsü sıfırlanır (son 15 sprint boyunca her sprint cache değişikliği commit'e karıştı). `M .deckent/cache/managed-docs-cache.json` git status'ta bir daha görünmez.
- **User:** Beta GA kurduğunda cache dosyası git-tracked olmaz — "neden her commit'te diff var?" sorusu ortaya çıkmaz.
- **Observability:** Cache dosyası açıldığında self-documenting — ADR-031 + schema version + generator module. AI orchestrator (Claude Code / Codex) cache şemasını okuyup doğru yorumlayabilir (T-150-034 AI-first config felsefesiyle uyumlu).
- **Governance:** gitignore invariant test sprint health gate'e eklenir — user projesinde de aynı invariant uygulanır, dev-deckent bug'ı tekrar etmez.
- **Rakip edge:** OpenClaw'ın managed-docs hash cache yok — Deckent launch messaging'e: "Deckent documents live-update themselves, skip rewrites when content unchanged — powered by content-hash cache."

---

## Task 37: `.deckent/docs.json` Private/Public Split + Bootstrap Template + Path Safety + Interactive UX (P0 Beta GA — ONAYLI Alperen Seçenek 3)

- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist, testing-expert, documentation-writer, git-expert
- Files: .gitignore, src/cli/commands/init-templates/docs.json.template (NEW), src/cli/commands/init-steps.ts, src/mcp/tools/init.ts, src/orchestra/managed-docs/docs-config.ts, src/orchestra/managed-docs/types.ts, tests/orchestra/managed-docs/docs-config.test.ts, tests/orchestra/managed-docs/docs-path-safety.test.ts (NEW), tests/cli/commands/docs-add-interactive.test.ts (NEW), docs/reference/managed-docs.md (NEW), .deckent/docs.json (dev-deckent lokal — public repo dışı)
- Scope: .gitignore, src/cli/, src/orchestra/managed-docs/, tests/, docs/reference/, .deckent/

### Description
**2026-04-21 manuel analiz — en büyük keşif:** `.deckent/docs.json` iki-persona ihlali taşıyan **tek registry** — dev-private runtime config ile user-bootstrap template amaçlarını tek dosyada karıştırıyor. Public repo'ya olduğu gibi taşınırsa **deal-breaker leak olur**.

**7 entry'nin private/public durumu:**

| Entry | Path | Public repo durumu |
|-------|------|--------------------|
| `claude-md` | CLAUDE.md | 🟢 Public OK |
| `vision-en` | VISION.md | 🟢 Public OK |
| `vision-tr` | VISION-TR.md | 🟢 Public OK |
| `beta-tracker-en` | BETA-TRACKER.md | 🟥 **GİZLİ** (memory `project_release_strategy`) |
| `beta-tracker-tr` | BETA-TRACKER-TR.md | 🟥 **GİZLİ** |
| `identity-md` | .deckent/workspace/IDENTITY.md | 🟡 İç artifact |
| `blueprint-md` | DECKENT-MASTER-BLUEPRINT.md | 🟥 **GİZLİ** (memory "ASLA dışarı çıkmayacak") |

**7'den 3'ü GİZLİ** — registry olduğu gibi taşınamaz.

**Alperen 2026-04-21 kararı:** **Seçenek 3 ONAYLI** — template kaynak kodda + runtime lokal, private/public split.

**6 adım uygulama:**

1. **Template dosyası oluştur:** `src/cli/commands/init-templates/docs.json.template` — user init'in kanonik default'u. Minimum 1 entry (`claude-md`), opsiyonel olarak `README.md` için 2. entry eklenebilir (README-driven projelerde yararlı).
```json
{
  "version": 1,
  "docs": [
    {
      "id": "claude-md",
      "path": "CLAUDE.md",
      "autoSections": ["Sprint Metrics"],
      "protectedSections": []
    }
  ]
}
```
Template'i `init-steps.ts:553-560` yerine kullanan `seedDocsConfig(root)` helper yaz.

2. **Dev-deckent docs.json gitignore:** `.gitignore` satır ekle `.deckent/docs.json` (sadece bizim repo için). Public repo geçişinde bu dosya **taşınmaz**, private lokal backup olarak Alperen kendi makinesinde/private-mirror repo'da tutar. Alternatif: `.deckent/docs.json.example` public repo'ya, `.deckent/docs.json` dev-private.

3. **Path safety (BULGU 3):** `addDoc` içinde path validation:
```typescript
export function addDoc(projectRoot: string, entry: Omit<ManagedDocEntry, 'id'> & { id?: string }): string {
  // Security: path validation
  if (entry.path.startsWith('/') || entry.path.match(/^[A-Z]:/)) {
    throw new Error(`Absolute paths not allowed: ${entry.path}`);
  }
  if (entry.path.includes('..')) {
    throw new Error(`Path traversal not allowed: ${entry.path}`);
  }
  const resolved = resolve(projectRoot, entry.path);
  if (!resolved.startsWith(projectRoot)) {
    throw new Error(`Path escapes project root: ${entry.path}`);
  }
  // ... existing add logic
}
```
   - Absolute path reddet.
   - Path traversal (`../`) reddet.
   - Projectroot dışı path reddet.
   - Test: `addDoc('../../etc/passwd', ...)` → throws, config değişmez.

4. **User UX (BULGU 4):** `deckent docs add <path>` interaktif prompt:
   - `path` verildi mi yoksa interaktif mi? Tek parametre varsa hemen ekle, yoksa prompt zinciri: "Path:" → "Auto-sections (virgülle ayır, boş geç):" → "Protected sections (virgülle ayır, boş geç):" → confirm.
   - `node:readline/promises` (ADR-011 mevcut pattern).
   - Non-interactive ortam (CI, script) flag: `--no-prompt` veya `--path ... --auto ... --protected ...`.

5. **Doküman (BULGU 4):** `docs/reference/managed-docs.md` YENİ:
   - autoSections/protectedSections kavramları net açıklama.
   - 5+ user scenario: "README'ye sprint metrikleri inject et", "Docs klasöründe API reference auto-generate et", "CHANGELOG sprint history ile besle", "Monorepo subproject config", "Multi-IDE ortam".
   - AI-first dil (T-150-034 config.md felsefesiyle tutarlı) — AI orchestrator'ların managed-docs semantic'ini doğru yorumlaması için.

6. **Test matrix (15+ yeni test):**
   - Template: `seedDocsConfig` çalışır, user `.deckent/docs.json` doğru içerikle oluşur.
   - Gitignore: `.deckent/docs.json` dev-deckent'te untrack test (meta-dogfood — gitignore-invariant.test.ts T-150-036'da yazılmıştı, genişletilir).
   - Path safety: `addDoc('../../etc/passwd')` throws, `addDoc('/absolute/x.md')` throws (veya normalize), `addDoc('docs/architecture.md')` kabul eder.
   - Interactive prompt: mock stdin, 3-step prompt akışı test edilir.
   - Non-interactive flag: `deckent docs add path --no-prompt --auto="A,B"` prompt atlar.
   - Dev-deckent live migration: T-150-037 PLAN phase ilk adımı `.deckent/docs.json` gitignore'a eklenip `git rm --cached` yapar.

**NOT:** T-150-037 önce → T-150-027 (public repo sync `.deckent/docs.json` exclude listesine eklenir, bu task'ın canlı doğrulaması).

**Kanıt:**
- `git ls-files --error-unmatch .deckent/docs.json` → exit ≠ 0 (untracked after migration)
- `cat src/cli/commands/init-templates/docs.json.template` → 1-2 entry template
- Fresh `deckent init` tmp project → `.deckent/docs.json` 1 entry (`claude-md`)
- `deckent docs add ../../etc/passwd` → `Error: path traversal not allowed`, exit 1
- `deckent docs add` (arg yok) → interactive prompt (mock test)
- `cat docs/reference/managed-docs.md | wc -l` → ≥ 200 satır
- `npx vitest run tests/orchestra/managed-docs/ tests/cli/commands/docs-add-interactive.test.ts` → all pass

**Kazanımlar:**
- **Gizlilik (P0):** Public repo geçişinde `BETA-TRACKER.md` + `DECKENT-MASTER-BLUEPRINT.md` referansları leak olmaz. `project_release_strategy.md` memory kuralı korunur.
- **User:** `deckent init` temiz minimal config verir. `deckent docs add` interaktif prompt ile kavram zorlaması yok. `docs/reference/managed-docs.md` AI + human anlaşılır referans.
- **Security:** Path traversal + absolute path guard — adversarial user input kapsamı kapandı. Beta GA'da security audit gate'e girer.
- **İki-persona disiplin:** Registry amacı netleşir — dev runtime config (private) vs user bootstrap template (public kodda). Gelecek dosyalarda bu pattern referans olur.
- **Rakip edge:** OpenClaw managed-docs feature'ı yok — Deckent'in "auto-managed project docs" capability'si launch messaging'in parçası.

**İlişkili memory:**
- `project_release_strategy.md` — çift repo stratejisi, GİZLİ dosya listesi (BLUEPRINT + ANA-PLAN-TR); bu task memory kuralını kod düzeyinde uygular.
- `project_doc_finalization_sprint.md` Section 5 — Public/Private Split stratejisi; T-150-023-024 doc finalization'ın minyatür dogfood uygulaması.
- `feedback_two_persona_analysis.md` — "biz yaptık deckent'e ekledik peki user tarafı?" sorusunun 10. canlı uygulaması.

---

## Task 38: Sprint-Scoped MetricsJsonl Writer Wire-Up + status.ts Live Reader (T-150-030 Tamamlayıcısı)

- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/core/observability.ts, src/mcp/tools/status.ts, tests/mcp/tools/status.test.ts
- Scope: src/core/, src/mcp/tools/, tests/mcp/tools/

### Description
T-150-030'un tamamlayıcısı — status.ts:80 `sprint-NNN-metrics.jsonl` dead read path. T-150-030 rotation yaklaşımı per-sprint natural yapıyor: observability writer per-sprint file opsiyonu ekle + status.ts canlı consumer. Dead-code ayıklanır, dashboard metric/telemetri live.

```typescript
// src/core/observability.ts patch
export function initObservability(root: string, sprintId: string, opts: { perSprintFile?: boolean } = {}): void {
  if (opts.perSprintFile) {
    const perSprintPath = join(root, '.deckent', `${sprintId}-metrics.jsonl`);
    // Override default writer to per-sprint path
    setWriterPath(perSprintPath);
  }
  // ... existing init ...
}
```

```typescript
// src/mcp/tools/status.ts:80 live reader wire
server.registerTool('deckent_status', { ... }, async (args) => {
  const sprintId = args.sprintId ?? getCurrentSprintId(root);
  if (sprintId) {
    const perSprintMetricsPath = join(root, '.deckent', `${sprintId}-metrics.jsonl`);
    if (existsSync(perSprintMetricsPath)) {
      const metrics = readMetricsFile(perSprintMetricsPath);
      return { ...baseStatus, metrics };
    }
  }
  // Fallback: flat file (retro-kompat)
  const flatPath = join(root, '.deckent', 'metrics.jsonl');
  if (existsSync(flatPath)) {
    const metrics = readMetricsFile(flatPath).filter(m => m.tags?.sprintId === sprintId);
    return { ...baseStatus, metrics };
  }
  return baseStatus;
});
```

### Test (5+ test)
- Per-sprint write mode (`initObservability({ perSprintFile: true })`)
- status.ts sprint-scoped reader (per-sprint file exists → read from there)
- Backward compat flat mode (flat file only → filter by sprintId tag)
- Integration: T-150-030 + T-150-038 chain — rotation + per-sprint writer + status.ts reader
- Dashboard live metric fetch (MCP `deckent_status --sprint-id=sprint-150`)

**Kanıt:** `grep "sprint-NNN-metrics.jsonl" src/mcp/tools/status.ts` → canlı çağrı; MCP `deckent_status --sprint-id=sprint-150` → metric verisi döner.

**Bağımlılık chain:** T-150-030 (rotation) önce → T-150-038 (reader wire) sonra.

---

# BAĞIMLILIK ZİNCİRİ (7 Wave)

```
Wave 1 (paralel, Block A):  T1 + T2 ← T1 | T3 ← T1 | T4 ← T1
Wave 2 (paralel, Block B):  T5 + T6 + T7 + T8 + T9
Wave 3 (paralel, Block C):  T10 → {T11 + T12 + T13 + T14 ← T10 | T15 ← T10}
Wave 4 (paralel, Block D):  T16 → {T17 + T18 ← T16 | T19 ← T16 | T20 ← T17}
Wave 5 (paralel, Block E):  T21 + T22 + T23 + T24
Wave 6 (paralel, Block F):  T25 + T26 ← T31 (built-in bundle pack içinde) | T27 ← T37 (docs.json exclude)
Wave 7 (paralel, Block G):  T28 + T29 + T30 → T38 | T31 + T32 + T33 + T35 + T36 + T37 | T34 ← T1 (config-types conflict)
```

**Kritik bağımlılıklar:**
- **T-150-034** `src/core/config-types.ts` + `src/core/config.ts` dokunur → **T-150-001** aynı dosyalar. Wave 7'de T-150-034 başlamadan Wave 1 T-150-001'in bittiğini bekle (file lock).
- **T-150-027** `.deckent/docs.json` exclude listesi → **T-150-037** sonucunu bekler. Chain: T-150-037 → T-150-027.
- **T-150-026** `npm pack --dry-run` → **T-150-031** built-in bundle kontrolü aynı pack komutuyla. Chain: T-150-031 → T-150-026.
- **T-150-030** rotation → **T-150-038** per-sprint reader. Chain: T-150-030 → T-150-038.
- **T-150-031** `.deckent/agents/` + `skills/` source → **T-150-018** farklı path (`deckent-hub/skills/`), çakışma yok.

# SPRINT GATE (20-Gate Chain Safety) — BETA-TRACKER.md + 2026-04-21 Manuel Toparlama Konsolidasyonu

1. tsc --noEmit 0 errors ✅
2. vitest fail < 50 (Sprint 148 baseline 135, hedef <50)
3. doctor ≥ 92/100
4. NO_GO ≤ 3 (Sprint 148 baseline 1; 11 yeni task +2 tolerans)
5. Nervous events ≥ 5 (detector canlı)
6. Agent routing `test-writer` = 0 assigned (Sprint 148 reform enforcement)
7. cost < $160 soft cap
8. ADR-041 accepted + ADR-042 proposed
9. `deckent_style` toggle canlı
10. Discord + Telegram connector smoke test (WhatsApp scaffold only)
11. DeckentHub 20 seed skill signed
12. npm pack --dry-run clean + **built-in 15+21 bundle fiziksel var** (T-150-031 canlı doğrulama T-150-026 pack içinde)
13. Dockerfile USER non-root
14. .deck interpolation canlı
15. Public repo sync manifest hazır + **`.deckent/docs.json` exclude listesinde** (T-150-037+T-150-027 zincir canlı)

**Ek Sprint 150 özel gate'ler (11 task konsolidasyon için):**
16. `.deckent/config.json` 188 → ~120 satır (duplicate sil doğrulaması, T-150-034)
17. `.deckent/cache/managed-docs-cache.json` git-tracked değil (T-150-036)
18. `.deckent/docs.json` git-tracked değil (T-150-037 dev-deckent lokal)
19. `.deckent/metrics.jsonl` <1MB + `.deckent/archive/metrics/*.gz` ≥ 1 (T-150-030)
20. `.deckent/` sprint file count ≤ 60 (T-150-035 retention canlı)

# FALLBACK — Sprint 151 Numaratör +1

Katastrofik fail (< 60% completion veya > 5 NO_GO veya 10h hard cap aşımı):
- Sprint 150 archive/
- Sprint 151 DIRECTIVES aynı content tekrar
- Beta GA **2-3 gün kayar** (Cuma 24 → Pazartesi 28 Nis) — kabul edilebilir risk

# BETA GA COUNTDOWN

Sprint 151 Per 25 Nis TRT = **2-3 gün** (Sprint 150 Çarşamba-Perşembe bittikten sonra).

**Sprint 150 başarılı = Sprint 151 Beta GA cutover'a temiz giriş:**
- v1.0.0-beta.1 npm publish
- VerhexIO/deckent public flip (`.deckent/docs.json` exclude + BLUEPRINT + ANA-PLAN-TR exclude)
- Discord + Telegram bots launch
- DeckentHub 20 skill canlı
- **Built-in 15+21 fiziksel user bundle ✅ (T-150-031 canlı)**
- `deckent nervous` + dashboard ChatPage showcase
- Show HN + Reddit + Twitter + Discord announce

---

**Oluşturan:** Koordinatör (2026-04-21 manuel toparlama session + Sprint 149 orijinal 27-task DIRECTIVES (FAİL sonrası re-run) + Alperen 8-karar matrisi + OpenClaw rekabet verisi + ROADMAP-GOD-LEVEL.md anchor + 5 paralel agent kod tabanı analizi)
**Baseline:** Sprint 149 fail sonrası re-run + 11 yeni task konsolidasyon (hedef Sprint 150 ≤ 10h, ≥35/38 DONE, NO_GO ≤ 3)
**İlk komut:** `deckent_plan mode: 'structured'` — Alperen onayı bekliyor
