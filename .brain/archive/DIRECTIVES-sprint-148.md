# DIRECTIVES — Sprint 148: Agent Taxonomy Reform + Nervous Dogfood Activation + Cross-Platform Validation

> **Sprint tipi:** Beta-kritik, meta-dogfood (Sprint 150 GA'ya 2 gün 18 saat kaldı)
> **Önceki sprint:** sprint-147 (23/23 DONE, 0 TD, 49m 34s, ADR-040 accepted)
> **Tema:** "Deckent kendi taksonomisini nervous system ile düzeltir" — self-healing architecture
> **Toplam task:** 28
> **Hard cap:** 8h (28800000 ms)
> **Cost cap:** $150 (soft alert, subs modu)
> **Wave sayısı:** 6
> **Planning mode:** **AI** (ilk deneme — Sprint 145-147 structured başarılıydı, Sprint 148 AI mode riski alıyoruz)
> **Fallback:** Katastrofik fail → Sprint 149 numaratör +1 tekrar çalıştırma

## Referanslar
- **Design spec:** `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md` (433 satır, 8 section)
- Sprint 147 retro: `.brain/archive/retro-sprint-147.md` (23/23 DONE, avg rubric 73%)
- Sprint 147 DIRECTIVES arşiv: `.brain/archive/DIRECTIVES-sprint-147.md`
- ADR-040: Nervous System Architecture — ACCEPTED (Sprint 147 T-22)
- ADR-037: Brain-Auditor-Worker Authority Matrix RBAC (T-148-007 constraint)
- Memory: `feedback_test_agent_removal.md`, `project_deckent_nervous_system.md`
- Sprint 147 canlı kanıt: agent routing %95 anomaly (22/22 test-writer)
- Nervous src: `src/nervous/` (13 modül, Sprint 147)
- Nervous types: `src/core/nervous-types.ts` (~410 LoC Sprint 147 genişletilmiş)

## Goal

Sprint 147'de yazılan nervous system çekirdeği Sprint 148'de **canlıya alınır** (`enabled=true`, balanced preset). Aynı sprint'te agent taksonomi reform (5 task) yapılır: `test-writer` agent kaldırılır, `testing-expert` skill otomatik aktive edilir, routing V2 agent selection'dan "test" keyword skip edilir. Block B'de 5 detector canlı kanıt üretir (retro'da event listelenir). Block C'de 3 platform × 3 backend cross-validation GitHub Actions matrix ile. Block D'de polish + debt liquidation + docs. Sprint 150 Beta GA yolu için **zorunlu temizlik**.

## Tema: Self-Healing Architecture

Sprint 147 `AgentRoutingHealth` detector'ı kendi sprint'inde %95 anomaly kaydetti. Sprint 148 Block A bu anomalyi çözer → Block B (detector re-run) pozitif sonuç döner. **Bu Deckent'in ilk "conscious" sprint'i** — kendi sorunlarını görür, nervous system ile rapor eder, kendi worker'ları ile düzeltir.

---

## KRİTİK MİMARİ CONSTRAINT — Ana PID Notification Scope

**Alperen direktifi 2026-04-20 (T-148-007 canlıya alıyor):**

Nervous system notification dispatcher **ANA orchestrator process (Brain PID)** üzerinde yaşar. Worker process'lerden nervous init çağırmak **YASAK**. ADR-037 RBAC ihlali sayılır.

- Worker → Brain: event-stream JSONL (`src/orchestra/event-stream.ts`)
- Brain → User: NotifyDispatcher (Sprint 145) + 3 adapter (MCP/CLI/File)
- Runtime check: `process.env.DECKENT_WORKER_MODE === '1'` ise nervous.init() **throw**

Bu constraint T-148-007'de implement edilir ve Sprint 148 boyunca **0 violation** olmalı (event stream'de `NERVOUS_SCOPE_VIOLATION` count = 0).

---

# BLOCK A — Agent Taxonomy Reform (5 task, Wave 1-2)

## Task 1: test-writer Agent Archive + Removal Justification

- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: .deckent/agents/test-writer/ (move to archive), docs/audits/sprint-148/test-writer-removal-justification.md
- Scope: .deckent/agents/, docs/audits/

### Description
Sprint 146-147 canlı kanıtları:
- Sprint 145: test-writer 14/27 (%52)
- Sprint 146: test-writer 9/17 (%53)
- Sprint 147: test-writer 21/22 (%95) — **%100 anomaly** threshold aşıldı

Reform ilk adımı: `.deckent/agents/test-writer/` dizinini **TAMAMEN KALDIRMAK** yerine archive'a taşı (geri yükleme kapasitesi için):
- Source: `.deckent/agents/test-writer/`
- Destination: `.deckent/agents/archive/test-writer-removed-sprint-148/`

Aynı zamanda `docs/audits/sprint-148/test-writer-removal-justification.md` yaz:
- Sprint 145/146/147 stats tablosu
- AgentRoutingHealth detector findings
- Beta GA user experience gerekçesi
- "Test yatay skill, agent dikey uzmanlık" taksonomi kararı

`agent-pool.ts` boot sırasında archive dizinini skip eder — 16 → 15 built-in agent.

### Test (3 test)
1. `fs.existsSync('.deckent/agents/test-writer')` → false
2. `fs.existsSync('.deckent/agents/archive/test-writer-removed-sprint-148/agent.json')` → true
3. `new AgentPoolManager().getBuiltinAgents().length === 15`

**Kanıt:** `ls .deckent/agents/ | grep -v archive | wc -l` → **15**. `cat docs/audits/sprint-148/test-writer-removal-justification.md` → 3 sprint stats içerir.

---

## Task 2: testing-expert Skill Auto-Activation Heuristic

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/skill-pool.ts, .deckent/skills/testing-expert/manifest.json, tests/core/skill-auto-activation.test.ts
- Scope: src/core/, .deckent/skills/testing-expert/, tests/core/

### Description
`skill-pool.ts` `selectSkills()` fonksiyonuna yeni auto-activation kuralı:

```typescript
export function selectSkills(task: Task, stack: ProjectStack, opts?: { existingSkills?: string[] }): string[] {
  const skills = existingV2Logic(task, stack);  // mevcut intent/manifest activation

  // NEW: Auto-activate testing-expert if task touches tests
  const scopeHasTests = task.scope?.directories?.some(d => d.startsWith('tests/')) ?? false;
  const writesTest = task.scope?.filesWrite?.some(f =>
    f.endsWith('.test.ts') || f.endsWith('.spec.ts') || f.endsWith('.test.tsx')
  ) ?? false;

  if ((scopeHasTests || writesTest) && !skills.includes('testing-expert')) {
    skills.push('testing-expert');
  }
  return skills;
}
```

`testing-expert/manifest.json` alan ekle:
```json
{
  "autoActivate": {
    "scopeMatch": ["tests/**"],
    "filesWriteMatch": ["**/*.test.ts", "**/*.spec.ts", "**/*.test.tsx"]
  }
}
```

### Test (5 test)
1. Task scope `['tests/nervous/']` → `selectSkills` returns array containing `testing-expert`
2. Task filesWrite `['src/foo.ts', 'tests/foo.test.ts']` → contains `testing-expert`
3. Task scope `['src/core/']` filesWrite `['src/core/types.ts']` → does NOT contain `testing-expert`
4. Task with manifest activation rule for testing-expert + no scope tests → still activated (primary path respected)
5. Duplicate prevention — existing `testing-expert` in skills not doubled

**Kanıt:** `npx vitest run tests/core/skill-auto-activation.test.ts` 5/5 PASS. Sprint 148 task routing log: scope tests/ olan her task'ta testing-expert skill.

---

## Task 3: Intent Classifier "testing" Intent Refactor — test-coverage Tag

- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/core/intent-classifier.ts, src/core/activation-engine.ts, src/core/routing-types.ts, tests/core/intent-classifier-refactor.test.ts
- Scope: src/core/, tests/core/

### Description
Mevcut `intent-classifier.ts` line 13: "testing" primary intent olarak tanımlı. Bu kaldırılır.

**Before:**
```typescript
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  testing: ['test', 'spec', 'coverage', 'vitest', ...],
  documentation: [...],
  'bug-fix': [...],
  // ...
};
```

**After:**
```typescript
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  // testing removed as primary intent
  documentation: [...],
  'bug-fix': [...],
  'core-dev': ['types', 'config', 'routing', 'engine', 'observer', 'registry'],
  'cli-dev': ['cli', 'command', 'tui'],
  'mcp-dev': ['mcp', 'tool', 'server'],
  'ui-dev': ['frontend', 'component', 'dashboard'],
  security: [...],
};

// New tag system in TaskDNA
export interface TaskDNA {
  primary: Intent;  // 'testing' no longer valid
  secondary: Intent[];
  tags: string[];  // includes 'test-coverage' when tests/ in scope
}
```

`routing-types.ts` Intent union update:
```typescript
export type Intent = 'core-dev' | 'documentation' | 'bug-fix' | 'security' | 'mcp-dev' | 'cli-dev' | 'ui-dev';
// 'testing' removed
```

`activation-engine.ts` eski "testing" intent match rule'ları kaldırılır, `test-coverage` tag eşleşmesi eklenir (skill activation için).

Tests/ scope + "types" description → primary='core-dev', tag=['test-coverage']
Tests/ scope + "fix flaky" description → primary='bug-fix', tag=['test-coverage']

### Test (10 test)
1. Task `{scope: ['tests/nervous/'], description: 'nervous types runtime testing'}` → primary='core-dev', tags include 'test-coverage'
2. Task `{scope: ['tests/'], description: 'fix flaky race condition test'}` → primary='bug-fix', tags include 'test-coverage'
3. Task `{scope: ['src/core/'], description: 'write types'}` → primary='core-dev', no 'test-coverage' tag
4. Task `{scope: ['src/cli/'], description: 'new command'}` → primary='cli-dev'
5. Task `{scope: ['src/mcp/'], description: 'add mcp tool'}` → primary='mcp-dev'
6. Task `{scope: ['src/dashboard/'], description: 'ui component'}` → primary='ui-dev'
7. TypeScript strict: `const x: Intent = 'testing'` → compile error
8. Sprint 147 T-147-019 (integration tests) replay → primary='core-dev' tag 'test-coverage' (NOT 'testing')
9. Sprint 146 T-146-011 (vitest regression fix) replay → primary='bug-fix'
10. `routingMeta.taskDNA.tags` arrayInclude 'test-coverage' when scope tests/

**Kanıt:** `grep "intent.*'testing'" src/core/intent-classifier.ts` → 0 match as primary. `tsc --noEmit` PASS (union değişmesine rağmen).

---

## Task 4: Router V2 Agent Fallback — test-writer Yok, architect/refactorer Chain

- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/task-router.ts, src/core/routing-engine.ts, src/core/agent-pool.ts, tests/orchestra/router-agent-fallback.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
test-writer agent removal sonrası (T-148-001), router V2 `selectAgent()` yeni fallback chain:

```typescript
export const AGENT_FALLBACK_CHAIN: Record<Intent, string[]> = {
  'core-dev': ['architect', 'refactorer'],
  'documentation': ['doc-writer'],
  'bug-fix': ['bug-fixer', 'refactorer'],
  'security': ['security-auditor'],
  'mcp-dev': ['architect', 'api-builder'],
  'cli-dev': ['architect', 'refactorer'],
  'ui-dev': ['frontend-designer'],
};

export function selectAgent(task: Task, dna: TaskDNA): string {
  const primary = dna.primary;
  const fallbackChain = AGENT_FALLBACK_CHAIN[primary] ?? ['architect'];

  for (const agentId of fallbackChain) {
    if (ACTIVE_AGENT_IDS.has(agentId)) return agentId;
  }
  return 'architect';  // ultimate fallback
}
```

**KRİTİK:** `ACTIVE_AGENT_IDS` Set'i `.deckent/agents/` dizin taraması ile oluşturulur. `test-writer` dizinde OLMAYACAK (T-148-001) → Set'te yok → hiçbir task'a atanamaz.

### Test (8 test)
1. Task primary='core-dev' → agent='architect'
2. Task primary='documentation' → agent='doc-writer'
3. Task primary='bug-fix' → agent='bug-fixer'
4. Task primary='security' → agent='security-auditor'
5. Task primary='ui-dev' → agent='frontend-designer'
6. `ACTIVE_AGENT_IDS.has('test-writer')` → false
7. Unknown primary → fallback 'architect'
8. Sprint 147 replay: 22/22 task re-route → **0 test-writer**, distribution: architect (~12), refactorer (~5), doc-writer (~2), bug-fixer (~1), frontend-designer (~1), security-auditor (~1)

**Kanıt:** Sprint 148 canlı task routing log: `grep "assignedAgent" .tasks/task-148-*.json | grep test-writer` → **0 match**.

---

## Task 5: 16 Agent PROMPT.md Rubric Spec Batch Cleanup

- Model: sonnet
- Effort: normal
- Skills: documentation-writer, typescript-expert
- Files: .deckent/agents/{architect,security-auditor,doc-writer,bug-fixer,code-reviewer,refactorer,api-builder,performance-analyzer,ci-guardian,architecture-planner,accessibility-auditor,data-engineer,devops-engineer,frontend-designer,migration-specialist}/PROMPT.md, scripts/agent-prompt-validator.mjs
- Scope: .deckent/agents/, scripts/

### Description
Sprint 146 T-146-010 Rubric Consolidation eksik wire: rubric spec sadece `prompt-god-template.ts`'ten kaldırıldı, **agent PROMPT.md'lerinden KALDIRILMADI**. Sprint 147 T-147-001 prompt analiz canlı kanıt: 3/3 prompt'ta "CRITICAL: Your result JSON MUST include a rubricScores field..." satırı vardı.

Her 15 agent PROMPT.md'sinde (test-writer T-148-001'de kaldırıldığı için) şu pattern'i kaldır:

```markdown
CRITICAL: Your result JSON MUST include a rubricScores field with 4 integer keys (0-100): correctness, test_coverage, scope_compliance, documentation. Example: "rubricScores": { "correctness": 95, "test_coverage": 90, "scope_compliance": 100, "documentation": 85 }
```

Yerine yorum satırı: `<!-- Rubric scores computed by Brain QualityAssessor, no worker self-report -->`

Validator script `scripts/agent-prompt-validator.mjs`:
```javascript
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const agentsDir = '.deckent/agents';
const agents = readdirSync(agentsDir).filter(d => !d.startsWith('archive') && d !== 'test-writer');

let failed = 0;
for (const agent of agents) {
  const promptPath = join(agentsDir, agent, 'PROMPT.md');
  const content = readFileSync(promptPath, 'utf-8');
  if (/rubricScores/.test(content)) {
    console.error(`❌ ${agent}/PROMPT.md still contains rubricScores`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} agent(s) still contain rubric spec`);
  process.exit(1);
}
console.log(`✅ All ${agents.length} agents clean — no rubric spec`);
```

### Test (3 test)
1. 15 agent PROMPT.md'de regex `/rubricScores/` → 0 match
2. `node scripts/agent-prompt-validator.mjs` exit 0
3. Sprint 148 `.tasks/.prompt-148-*.txt` → regex `/rubricScores/` → 0 match (canlı)

**Kanıt:** `grep -r "rubricScores" .deckent/agents/` → **0 match**. `node scripts/agent-prompt-validator.mjs` → exit 0.

---

# BLOCK B — Nervous Dogfood + 5 Detector Activation (8 task, Wave 3-4)

## Task 6: Nervous System enabled=true Pivot — BALANCED Preset

- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: .deckent/config.json, src/core/config-defaults.ts, tests/core/nervous-enabled-integration.test.ts
- Scope: .deckent/, src/core/, tests/core/

### Description
`.deckent/config.json`'a top-level alan ekle (yoksa):
```json
{
  "nervous_system": {
    "enabled": true,
    "mode": "balanced",
    "actionOverrides": {},
    "quietHours": { "start": "22:00", "end": "08:00" },
    "throttleWindowMs": 300000
  }
}
```

`src/core/config-defaults.ts` defaults.nervous_system: `enabled: false` (yeni projeler default güvenli).

Brain boot sırasında (sprint-controller.ts başlangıcı) config.nervous_system.enabled true ise NervousObserver + DetectorRegistry + Dispatcher init edilir. **Ana PID'de** (T-148-007 constraint).

### Test (3 test)
1. `.deckent/config.json` load → `nervous_system.enabled === true`
2. `configDefaults.nervous_system.enabled === false` (global default)
3. Brain boot integration: config enabled → observer.start() called, event-stream'de `NERVOUS:STARTED` event

**Kanıt:** Sprint 148 ilk 30s event stream'de `NERVOUS:STARTED source=brain` event.

---

## Task 7: 🚨 Notification Delivery Scope Enforcement (Ana PID Constraint)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/nervous/runtime-scope-check.ts (NEW), src/nervous/dispatcher.ts, src/nervous/observer.ts, tests/nervous/runtime-scope.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Alperen direktifinin kod ifadesi. Yeni dosya `src/nervous/runtime-scope-check.ts`:

```typescript
/**
 * KRİTİK: Nervous system dispatcher/observer sadece Brain PID'de çalışabilir.
 * Worker process'ten init girişimi ADR-037 RBAC ihlali sayılır.
 */
export function assertBrainScope(component: string): void {
  if (process.env.DECKENT_WORKER_MODE === '1') {
    const error = new Error(
      `NERVOUS_SCOPE_VIOLATION: ${component} cannot run in worker process. ` +
      `ADR-037 RBAC: nervous system is Brain-scoped. ` +
      `Workers emit events via event-stream.ts; Brain observes and dispatches.`
    );
    error.name = 'NervousScopeViolationError';

    // Best-effort event emit (stderr fallback if event bus not available)
    try {
      const { eventBus } = require('../orchestra/event-bus.js');
      eventBus.emit('deckent-event', {
        type: 'NERVOUS_SCOPE_VIOLATION',
        component,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      });
    } catch {
      process.stderr.write(`⚠ ${error.message}\n`);
    }

    throw error;
  }
}
```

`dispatcher.ts` constructor başında `assertBrainScope('NervousDispatcher')`.
`observer.ts` constructor başında `assertBrainScope('NervousObserver')`.

Worker spawn script'leri `docker-spawn-backend.ts`, `tmux.ts`, `spawn-backend.ts` environment'a `DECKENT_WORKER_MODE=1` ekler.

### Test (6 test)
1. Brain context (env yok) → `new NervousDispatcher(...)` OK
2. Worker context (`DECKENT_WORKER_MODE=1`) → `new NervousDispatcher(...)` throws `NervousScopeViolationError`
3. Error message contains "ADR-037" + "Brain-scoped"
4. Scope violation event emitted on `deckent-event` channel
5. `NervousObserver` aynı kontrol
6. Worker spawn script env var doğru set ediyor (mock test)

**Kanıt:** Sprint 148 event stream'de `NERVOUS_SCOPE_VIOLATION` count = **0**.

---

## Task 8: StaleWorkerDetector Canlı Activation + DetectorRegistry

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/detector-registry.ts (NEW), src/nervous/observer.ts (patch), tests/nervous/detectors/stale-worker-live.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Yeni `src/nervous/detector-registry.ts`:

```typescript
import type { NervousSystemConfig, DetectorContext, DetectorResult } from '../core/nervous-types.js';
import { StaleWorkerDetector } from './detectors/stale-worker.js';
import { ScopeCollisionMonitor } from './detectors/scope-collision.js';
import { DebtTrendAnalyzer } from './detectors/debt-trend.js';
import { AgentRoutingHealth } from './detectors/agent-routing.js';
import { DirectivesMidSprintProtection } from './detectors/directives-protection.js';

export interface IDetector {
  readonly detectorId: string;
  detect(ctx: DetectorContext): DetectorResult | null;
}

export class DetectorRegistry {
  private readonly active: IDetector[] = [];

  constructor(private readonly config: NervousSystemConfig) {
    if (config.detectors?.stale_worker?.enabled) {
      this.active.push(new StaleWorkerDetector(config.detectors.stale_worker.threshold_ms));
    }
    if (config.detectors?.scope_collision?.enabled) {
      this.active.push(new ScopeCollisionMonitor());
    }
    if (config.detectors?.debt_trend?.enabled) {
      this.active.push(new DebtTrendAnalyzer(config.detectors.debt_trend.threshold_rate));
    }
    if (config.detectors?.agent_routing?.enabled) {
      this.active.push(new AgentRoutingHealth(config.detectors.agent_routing.anomaly_threshold));
    }
    if (config.detectors?.directives_protection?.enabled) {
      this.active.push(new DirectivesMidSprintProtection());
    }
  }

  async runAll(ctx: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];
    for (const detector of this.active) {
      try {
        const result = detector.detect(ctx);
        if (result) results.push(result);
      } catch (err) {
        // Detector failure shouldn't break nervous loop
        console.error(`Detector ${detector.detectorId} failed:`, err);
      }
    }
    return results;
  }

  get activeCount(): number { return this.active.length; }
  get detectorIds(): string[] { return this.active.map(d => d.detectorId); }
}
```

`observer.ts` observe callback'inde DetectorRegistry.runAll çağırılır. Sprint 148 config tüm 5 detector enabled=true.

### Test (5 test)
1. Registry boot — 5 detector active (config tüm enabled)
2. `registry.detectorIds` includes 'stale-worker', 'scope-collision', 'debt-trend', 'agent-routing', 'directives-protection'
3. Config stale_worker.enabled=false → 4 active
4. Detector throws → catch + log, other detectors continue
5. Live: Sprint 148 boyunca en az 1 detector event üretir (event-stream channel `DETECTOR→NERVOUS:DETECTION`)

**Kanıt:** Sprint 148 RETRO'da "Detector Activity" bölümü — 5 detector'dan en az 3'ü event üretti.

---

## Task 9: ScopeCollisionMonitor + DebtTrendAnalyzer Live Activation

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/nervous/detector-registry.ts (already active from T-008), tests/nervous/detectors/scope-collision-live.test.ts, tests/nervous/detectors/debt-trend-live.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
T-008 registry 5 detector enabled. Bu task her iki detector için **canlı integration test** + Sprint 148 sırasında event kanıt.

**ScopeCollisionMonitor** — Sprint 148 PLAN phase'inde auto-trigger:
- 28 task arasında `filesWrite` overlap analizi
- Beklenti: Block A 5 task + Block B 8 task + ... birbirine yakın scope yok (DIRECTIVES temiz yazıldı)
- Canlı sonuç: 0 collision (pozitif kanıt detector çalışıyor ama false positive yok)

**DebtTrendAnalyzer** — Sprint 148 RETRO phase'inde auto-trigger:
- Son 3 sprint (145, 146, 147) debt rate: 24/28=%86, 6/17=%35, 0/23=%0 — avg %40
- **ALERT** — threshold %15 aşıldı (Sprint 145 debt spike outlier)
- Action: DEBT_REPRIORITIZE suggest-30m

### Test (6 test)
1. Scope collision plan-time trigger — 28 task temiz → 0 collision detection (pozitif)
2. Deliberate collision fixture (2 task aynı dosya) → 1 collision event
3. Collision payload includes task IDs + file path
4. Debt trend Sprint 145-147 data → avgDebtRate calculation correct
5. Debt trend alert severity='warning', suggestedAction=DEBT_REPRIORITIZE
6. Sprint 148 retro'da debt-trend event listed

**Kanıt:** Sprint 148 RETRO "Detector Events" section — debt-trend ≥1 event.

---

## Task 10: AgentRoutingHealth Canlı Pozitif Doğrulama

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: tests/nervous/detectors/agent-routing-positive.test.ts
- Scope: tests/nervous/

### Description
Bu detector'ın **kendi sprint'inde ikinci kez** çalışacağı kritik an. Sprint 147'de %95 anomaly yakaladı. Sprint 148'de Wave 1-2 sonrası (Block A reform tamamlandıktan sonra) EVALUATE phase'de **tekrar** çalışır.

**Beklenen canlı sonuç:**
- 28 task analizi:
  - architect: ~12 task (%43) — core-dev + mcp-dev + cli-dev
  - refactorer: ~5 task (%18)
  - doc-writer: ~6 task (%21) — Block D docs
  - devops-engineer: ~3 task (%11) — cross-platform
  - bug-fixer: ~1 task (%4)
  - security-auditor: ~1 task (%4)
- Anomaly threshold %40 → architect %43 **sınırda**, muhtemelen alert üretir (borderline case)
- Critical severity (corrupt agent) → **0** (test-writer removal sonrası string; pattern yok)

### Test (5 test)
1. 28 task analizi → architect %43 → borderline medium-severity alert
2. `string;` corrupt agent pattern → 0 detection (reform sonrası)
3. Anomaly threshold 0.40 → architect borderline, sonraki sprint Block D docs balanced eder
4. False positive test — architect %43 legitimate (multi-block presence), detector warning ama blocker değil
5. Sprint 147 replay — aynı detector %95 → critical alert (regression test, Sprint 147 data hâlâ detect edilir)

**Kanıt:** Sprint 148 EVALUATE phase event stream: `agent-routing` detector event, severity='warning' (critical değil — reform başarılı).

---

## Task 11: DirectivesMidSprintProtection Canlı + Deliberate Stress Test

- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: tests/nervous/detectors/directives-protection-stress.test.ts, scripts/directives-stress-simulator.mjs (NEW)
- Scope: tests/nervous/, scripts/

### Description
Sprint 145 08:14 TRT canlı bug (DIRECTIVES.md template'e dönüştü) Sprint 146 T-146-008 phase guard ile çözüldü. Sprint 147 T-147-013 detector yazıldı. Sprint 148'de **canlı stress test**: Block D Wave 6'da deliberate simulation:

Script `scripts/directives-stress-simulator.mjs`:
```javascript
// EXECUTE phase içinde deliberate olarak DIRECTIVES.md'yi template'e dönüştür
// (sadece test amacıyla, 5 saniye sonra otomatik restore edilir)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const backupPath = join(root, '.directives-backup.md');
const directivesPath = join(root, 'DIRECTIVES.md');

// Backup original
const original = readFileSync(directivesPath, 'utf-8');
writeFileSync(backupPath, original);

// Overwrite with template (triggers detector)
const template = `# DIRECTIVES — (Sprint 149 için hazırlanıyor)\n\n## Task 1: (Task başlığı)\n- Model: sonnet\n`;
writeFileSync(directivesPath, template);

console.log('[stress-sim] DIRECTIVES overwritten, detector should alert within 5s');

// Auto-restore after 5s (safety)
setTimeout(() => {
  writeFileSync(directivesPath, original);
  console.log('[stress-sim] DIRECTIVES auto-restored');
  process.exit(0);
}, 5000);
```

Test verifies:
1. Stress simulator çalışır
2. Detector 3s içinde emergency alert üretir
3. Nervous executor autonomous policy (emergency severity bypass authority) restore tetikler
4. Original DIRECTIVES.md geri yüklenir
5. Sprint devam eder (interruption yok)

### Test (8 test)
1-7. Sprint 147 T-147-013'teki 7 unit test regression
8. Sprint 148 Wave 6 canlı simulator → detector alert → auto-restore → sprint continues

**Kanıt:** Sprint 148 event stream `directives-protection` detector ≥1 emergency event + restore success. `.directives-backup.md` cleanup edilir.

---

## Task 12: CLI `deckent nervous` TUI Integration Test + Smoke Script

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: scripts/nervous-tui-smoke.sh (NEW), tests/cli/nervous-tui-live.test.ts
- Scope: scripts/, tests/cli/

### Description
Sprint 147 T-147-014'te CLI command yazıldı. Sprint 148 canlı TUI kullanımı + smoke test.

Smoke script `scripts/nervous-tui-smoke.sh`:
```bash
#!/bin/bash
set -euo pipefail

# Run in background to avoid hanging
timeout 10 npx deckent nervous 2>&1 | tee /tmp/nervous-tui-output.log
exit_code=${PIPESTATUS[0]}

# Validate output contains expected sections
grep -q "🧠 Deckent Nervous System" /tmp/nervous-tui-output.log || { echo "❌ Missing header"; exit 1; }
grep -q "Pending:" /tmp/nervous-tui-output.log || { echo "❌ Missing Pending section"; exit 1; }
grep -q "Recent" /tmp/nervous-tui-output.log || { echo "❌ Missing Recent section"; exit 1; }
grep -q "Config:" /tmp/nervous-tui-output.log || { echo "❌ Missing Config section"; exit 1; }
grep -q "mode=balanced" /tmp/nervous-tui-output.log || { echo "❌ Mode not balanced"; exit 1; }

echo "✅ Nervous TUI smoke test PASS"
```

Integration test:
- `deckent nervous` no pending → "No pending notifications" mesajı
- Pending var → table format render
- `deckent nervous history --limit 5` → 5 line history
- `deckent nervous accept ns-XXX` → resolveApproval call

### Test (5 test)
1. TUI renders with all sections
2. Pending count matches event stream
3. History `--limit 5` shows 5 records
4. Color/ANSI escape correct (strip + validate structure)
5. Invalid subcommand → usage + exit 1

**Kanıt:** `bash scripts/nervous-tui-smoke.sh` exit 0.

---

## Task 13: MCP `deckent_nervous_*` 5 Tool End-to-End Live Test

- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: tests/mcp/nervous-tools-e2e.test.ts, scripts/mcp-nervous-e2e.mjs (NEW)
- Scope: tests/mcp/, scripts/

### Description
5 MCP nervous tool Sprint 147 T-147-016'da yazıldı. Sprint 148'de **gerçek MCP call chain** test edilir.

Script `scripts/mcp-nervous-e2e.mjs` — programmatic MCP client:
1. `deckent_nervous_status()` — snapshot (pending + recent + config)
2. `deckent_nervous_subscribe({ sprintId: 'sprint-148' })` — event subscription
3. (Wait for notification from live sprint)
4. `deckent_nervous_accept({ id: 'ns-...' })` — resolve
5. `deckent_nervous_reject({ id: 'ns-...', reason: 'test' })` — reject
6. `deckent_nervous_config({ action: 'set_preset', preset: 'autopilot' })` → mode değişir
7. `deckent_nervous_config({ action: 'set_preset', preset: 'balanced' })` — geri

### Test (10 test)
- 5 tool × 2 scenario (happy + error) = 10 test
1. status returns valid JSON structure
2. status error on invalid root
3. subscribe registers client
4. subscribe duplicate → idempotent
5. accept invalid ID → MCP error
6. accept valid ID → resolveApproval
7. reject with reason → recorded
8. reject without ID → MCP error
9. config set_preset valid → persisted
10. config set_preset invalid → error

**Kanıt:** Sprint 148 retro "MCP Nervous Tools E2E: 10/10 PASS".

---

# BLOCK C — Cross-Platform Validation (6 task, Wave 5)

## Task 14: macOS E2E — tmux Backend Full Sprint (GitHub Actions)

- Model: opus
- Effort: high
- Skills: typescript-expert, devops-engineer
- Files: tests/e2e/cross-platform/macos-tmux.test.ts (NEW), .github/workflows/cross-platform-e2e.yml (NEW), docs/audits/sprint-148/macos-validation.md
- Scope: tests/e2e/cross-platform/, .github/workflows/, docs/audits/

### Description
GitHub Actions workflow `cross-platform-e2e.yml`:
```yaml
name: Cross-Platform E2E
on: [push, pull_request]
jobs:
  e2e:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest]
        backend: [tmux, subprocess]
        exclude:
          - os: macos-latest
            backend: subprocess  # prioritize tmux on macOS
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
      - if: matrix.backend == 'tmux' && matrix.os == 'macos-latest'
        run: brew install tmux
      - run: npx vitest run tests/e2e/cross-platform/${{ matrix.os }}-${{ matrix.backend }}.test.ts
```

Test `tests/e2e/cross-platform/macos-tmux.test.ts`:
- 3-task mini sprint
- fs.watch kqueue behavior
- tmux 3.3+ version check
- Worker spawn / HB / result / cleanup lifecycle

### Test (6 test)
1. Platform detection: `os.platform() === 'darwin'`
2. tmux version >= 3.3
3. Mini sprint 3 task — all complete
4. HB format ISO 8601 + UUID valid
5. Result atomic write (kqueue race condition safe)
6. Cleanup graceful — no orphan tmux sessions

**Kanıt:** `docs/audits/sprint-148/macos-validation.md` GO status. CI badge green.

---

## Task 15: Linux E2E — subprocess Backend Full Sprint

- Model: opus
- Effort: high
- Skills: typescript-expert, devops-engineer
- Files: tests/e2e/cross-platform/linux-subprocess.test.ts, docs/audits/sprint-148/linux-validation.md
- Scope: tests/e2e/cross-platform/, docs/audits/

### Description
Ubuntu 22.04 + Node 20 + subprocess backend (no tmux, no Docker). Sprint 139 Backend Parity 3/3 beri subprocess E2E gap. Child process spawn, stdout capture, exit code handling.

### Test (6 test)
1. Platform detection: `os.platform() === 'linux'`
2. 3-task mini sprint — all complete
3. Subprocess stdout line-buffered, captured correctly
4. Exit code 0 → DONE result parsed
5. Exit code non-zero → NO_GO result
6. SIGTERM handling — graceful shutdown

**Kanıt:** `docs/audits/sprint-148/linux-validation.md` GO.

---

## Task 16: WSL2 E2E — Docker Backend Full Sprint

- Model: opus
- Effort: high
- Skills: typescript-expert, docker-expert, devops-engineer
- Files: tests/e2e/cross-platform/wsl2-docker.test.ts, docs/audits/sprint-148/wsl2-validation.md
- Scope: tests/e2e/cross-platform/, docs/audits/

### Description
WSL2 + Docker Desktop. Deckent'in primary dev env (Alperen). Sprint 139 Docker HB core fix burada canlı. File watch inotify behavior, drive mount (/mnt/c/...), line endings (CRLF handling in config).

### Test (6 test)
1. Platform detection: WSL2 uname -r contains "microsoft"
2. Docker daemon accessible
3. Mini sprint 3-task — all complete in containers
4. inotify watchers work across WSL boundary
5. Drive mount paths resolved correctly
6. Line endings normalized (\r\n → \n in config read)

**Kanıt:** `docs/audits/sprint-148/wsl2-validation.md` GO (Alperen local verify fallback).

---

## Task 17: Provider Matrix — Claude + Codex Mixed Mini-Sprint

- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: tests/e2e/provider-matrix/claude-codex-mixed.test.ts, docs/audits/sprint-148/provider-parity.md
- Scope: tests/e2e/provider-matrix/, docs/audits/

### Description
3-task mini sprint: 1 opus (Claude) + 1 gpt-4.1 (Codex) + 1 haiku (Claude). OPENAI_API_KEY test fixture'da, gerçek API değil (mock adapter). Provider fallback test — Codex timeout → Claude fallback.

### Test (4 test)
1. 3 task 3 different provider routed
2. Fallback on provider failure — Codex timeout → Claude
3. Per-provider metrics (latency, tokens, cost)
4. Provider stats aggregation retro'da

**Kanıt:** `docs/audits/sprint-148/provider-parity.md`.

---

## Task 18: i18n Parity — TR/EN Task Description Routing Identical

- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: tests/i18n/task-description-parity.test.ts, docs/audits/sprint-148/i18n-validation.md
- Scope: tests/i18n/, docs/audits/

### Description
Aynı semantic task TR+EN description → aynı routing decision. Turkish normalize (FTS5 Sprint 141) temeli üzerine.

```typescript
const TR_TASKS = [
  { description: 'Nervous types runtime tiplerini genişlet', scope: ['src/core/'] },
  { description: 'DIRECTIVES.md koruma detektörü test et', scope: ['tests/nervous/'] },
  { description: 'MCP nervous tool 5 adet ekle', scope: ['src/mcp/'] },
  { description: 'Dokümantasyon güncelle', scope: ['docs/'] },
];
const EN_TASKS = [
  { description: 'Extend nervous types runtime types', scope: ['src/core/'] },
  { description: 'Test DIRECTIVES.md protection detector', scope: ['tests/nervous/'] },
  { description: 'Add 5 MCP nervous tools', scope: ['src/mcp/'] },
  { description: 'Update documentation', scope: ['docs/'] },
];

// All 4 pairs should produce identical routing
```

### Test (8 test)
- 4 TR/EN pair × 2 assertions (primary intent + agent) = 8 test

**Kanıt:** `docs/audits/sprint-148/i18n-validation.md` + test 8/8 PASS.

---

## Task 19: Fresh Install Matrix — Node 18/20/22 × Clean Env

- Model: opus
- Effort: high
- Skills: devops-engineer, typescript-expert
- Files: tests/e2e/install-matrix/fresh-install.test.ts, scripts/fresh-env-test.sh (NEW), docs/audits/sprint-148/install-matrix.md
- Scope: tests/e2e/install-matrix/, scripts/, docs/audits/

### Description
Docker container fresh Ubuntu 22.04 + Node 18/20/22 matrix. `git clone https://github.com/VerhexIO/deckent-dev.git`, `npm install`, `deckent init /tmp/test-project`, `deckent_set_directives` sample content, `deckent_plan mode:structured`, 1-task mini sprint. Beta GA user experience simulation.

Script `scripts/fresh-env-test.sh`:
```bash
#!/bin/bash
for node_version in 18 20 22; do
  docker run --rm -v $(pwd):/src node:${node_version}-slim bash -c "
    apt-get update && apt-get install -y git
    cp -r /src /tmp/deckent-test
    cd /tmp/deckent-test
    npm ci
    npm run build
    npx vitest run tests/e2e/install-matrix/fresh-install.test.ts
  " || exit 1
done
echo "✅ Fresh install matrix PASS on Node 18/20/22"
```

### Test (5 test)
1. Node 18 fresh install + mini sprint → PASS
2. Node 20 fresh install + mini sprint → PASS
3. Node 22 fresh install + mini sprint → PASS
4. npm ci exit 0 (no peer dependency warnings)
5. `deckent --version` returns correct version

**Kanıt:** `bash scripts/fresh-env-test.sh` exit 0.

---

# BLOCK D — Polish + Debt Liquidation + Docs (9 task, Wave 6)

## Task 20: Vitest Triage — 135 Fail → < 50 Fail

- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: tests/ (multiple patches — Sprint 145-147 regression), docs/audits/sprint-148/vitest-triage.md
- Scope: tests/, docs/audits/

### Description
Sprint 147 sonrası `npx vitest run` → 135 fail. Triage kategori:
- **A:** Sprint 145 regression (~70 fail, spawn-backend-docker mock drift)
- **B:** Sprint 146 regression (~30 fail, rubric consolidation side effects)
- **C:** Sprint 147 yeni (~20 fail, nervous integration expected mocks)
- **D:** Pre-existing Sprint <145 (~15 fail, deprecated)

Her kategoride ilk 5-10 fail fix → cumulative 85+ fix (135 - 85 = 50 target).

Triage doc `docs/audits/sprint-148/vitest-triage.md`:
```markdown
# Sprint 148 Vitest Triage Report

## Summary
- Baseline (Sprint 147): 135 fail / 15256 total
- Target (Sprint 148): < 50 fail
- Fixed: [count]
- Remaining: [count]

## Category A: Sprint 145 Mock Drift (70 fail)
[list + fix commits]

## Category B: Rubric Side Effects (30 fail)
[list + fix commits]
...
```

### Test
- `npx vitest run` fail count < 50
- Coverage stable (not regressed)
- No new test removal (only fixes)

**Kanıt:** Sprint 148 pre-retro: `npx vitest run 2>&1 | grep -E "^Tests"` → fail count printed, < 50.

---

## Task 21: Routing V3 Intent Classifier — core-dev Sub-Intents

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/intent-classifier.ts (V3 refinement), src/core/routing-engine.ts, tests/core/intent-v3.test.ts
- Scope: src/core/, tests/core/

### Description
T-148-003 "testing" kaldırdı, Intent union updated. Sprint 148 Block D'de **V3 granular sub-intent**:

```typescript
export type Intent = 'core-dev' | 'documentation' | 'bug-fix' | 'security' |
                     'mcp-dev' | 'cli-dev' | 'ui-dev' | 'devops' | 'architecture';

// Sub-intent tags for core-dev
export interface TaskDNA {
  primary: Intent;
  subIntent?: 'types' | 'config' | 'routing' | 'observer' | 'registry' | 'dispatcher';
  // ...
}
```

routing-engine V3 `routingVersion: 'v3'` persisted.

### Test (6 test)
1. Task types/... → subIntent='types'
2. Task config/... → subIntent='config'
3. Task routing/router → subIntent='routing'
4. Task observer → subIntent='observer'
5. `routingMeta.routingVersion === 'v3'`
6. Backward compat — v2 tasks still parseable

**Kanıt:** Sprint 148 task routingMeta.routingVersion all v3.

---

## Task 22: Sprint 146 T-146-011 Docker Worker Exit Pattern Root Cause Fix

- Model: opus
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: src/backends/docker-spawn-backend.ts, tests/backends/docker-exit-reproducer.test.ts
- Scope: src/backends/, tests/backends/

### Description
Sprint 146 T-146-011 NO_GO: "Docker worker exited without writing result file". Sprint 147 T-147-147-011-fix archive edildi (task-146-011-fix dosyaları Sprint 147 pre-flight'ta taşındı). Root cause hâlâ açık.

Hipotez: Container SIGKILL (exit 137) before .result write. Sprint 139 Docker HB core fix `atomicWriteFileSync` + SIGTERM handler eklemiş ama SIGKILL (force kill) için yetersiz.

Çözüm: Worker.sh'ye EXIT trap — script çıkmadan **her zaman** partial result yaz:
```bash
# worker.sh (Docker template)
cleanup_result() {
  local exit_code=$?
  if [ ! -f "$RESULT_PATH" ]; then
    echo "{\"taskId\":\"$TASK_ID\",\"selfAssessment\":\"NO_GO\",\"notes\":\"Worker exited (code=$exit_code) without writing result\",\"exitCode\":$exit_code}" > "$RESULT_PATH"
  fi
}
trap cleanup_result EXIT
```

### Test (4 test)
1. Reproducer: deliberate SIGKILL mid-task → result with exitCode + NO_GO
2. Normal completion — cleanup_result no-op (file exists)
3. SIGTERM handled gracefully — result written normally
4. OOM kill (exit 137) — result still written

**Kanıt:** Sprint 148 Docker E2E test: 0 "worker exited without result" NO_GO.

---

## Task 23: CHANGELOG 0.4.0-beta.4 + Sprint-148.md

- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: CHANGELOG.md, docs/sprint-log/Sprint-148.md
- Scope: ./, docs/sprint-log/

### Description
Release note 0.4.0-beta.4:
```markdown
## [0.4.0-beta.4] - 2026-04-21 (TRT)

### Breaking Changes
- **Agent Taxonomy Reform:** `test-writer` agent removed. Test expertise migrated to `testing-expert` skill with auto-activation (scope tests/** or filesWrite *.test.ts). Intent classifier "testing" primary intent removed, replaced by "test-coverage" tag.

### Added
- Nervous System Activation (balanced preset default for this project, `enabled: false` in new projects)
- 5 MVP Detectors live: StaleWorker, ScopeCollision, DebtTrend, AgentRouting, DirectivesMidSprintProtection
- Ana PID Notification Scope enforcement (ADR-037 RBAC)
- Cross-Platform CI Matrix (macOS/Linux/WSL2 × tmux/subprocess/Docker)
- GitHub Actions workflow: cross-platform-e2e.yml
- Fresh Install Matrix (Node 18/20/22)
- Provider Matrix (Claude + Codex)
- i18n Parity (TR/EN routing identical)

### Fixed
- Docker worker exit pattern (Sprint 146 T-146-011 root cause)
- Vitest regression 135 → < 50 fail
- Routing V3 (agent fallback chain, test-writer excluded)
- 15 agent PROMPT.md rubric spec cleanup (Sprint 146 T-10 eksik wire completion)

### Changed
- Routing V2 → V3 (granular core-dev sub-intents)
- Intent union: removed 'testing', added 'devops', 'architecture'
```

`docs/sprint-log/Sprint-148.md` — Sprint 148 executive summary.

### Test
- `grep "0.4.0-beta.4" CHANGELOG.md` → 1+ match
- `test -f docs/sprint-log/Sprint-148.md`

**Kanıt:** Git diff shows both files.

---

## Task 24: FINAL-EXECUTIVE-REPORT Sprint 148 Living Record

- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md
- Scope: docs/audits/

### Description
Sprint 145+146+147 inline update pattern'i Sprint 148 için uygula:
- Section 1 (Tema): "Meta-Dogfood: Deckent kendi taksonomisini nervous ile düzeltir"
- Section 5 (Roadmap): Sprint 148 DONE, Sprint 149 (doc consolidation + npm publish) + Sprint 150 (🚀 BETA GA cutover) preview
- Section 6 (Risk Register): agent taxonomy anomaly CLOSED, nervous scope violation MONITORED, cross-platform OPEN → CLOSED
- Section 8 (Acceptance Criteria): 28 task deliverables tablosu
- Section N (Sprint 148 Append): detailed outcomes + detector kanıtları

### Test
- `grep -c "Sprint 148" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` ≥ 20

**Kanıt:** Git diff section 1/5/6/8 + Section N append.

---

## Task 25: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 148 Append

- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: DECKENT-ANA-PLAN-TR.md, DECKENT-MASTER-BLUEPRINT.md, BETA-TRACKER.md, BETA-TRACKER-TR.md
- Scope: ./

### Description
4 doc'a Sprint 148 bölümü append:
- Teması (Meta-Dogfood + Agent Taksonomi Reform)
- 28 task özeti 4 block × 6 wave
- Deliverables + detector canlı kanıtları
- Sprint 149-150 preview ("1 day to Beta GA 🚀")
- BETA-TRACKER canonical status: Sprint 145 ✅ 146 ✅ 147 ✅ 148 ✅ 149 🟡 150 🔵

ANA-PLAN-TR + MASTER-BLUEPRINT (EN) parity. BETA-TRACKER EN+TR 5-gün roadmap.

### Test
- 4 doc'ta "Sprint 148" geçer
- 4 doc'ta "Beta GA 1 day" geçer
- 4 doc'ta "test-writer removed" nervous insights

**Kanıt:** `grep -l "Sprint 148" DECKENT-ANA-PLAN-TR.md DECKENT-MASTER-BLUEPRINT.md BETA-TRACKER.md BETA-TRACKER-TR.md` → 4 files.

---

## Task 26: Memory V2 Nervous History Integration

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/memory-store.ts, src/nervous/history.ts, tests/integration/memory-nervous.test.ts
- Scope: src/core/, src/nervous/, tests/integration/

### Description
Memory V2 (SQLite FTS5) nervous history opsiyonel indeksleme. Her ExecutionRecord sonrası:
```typescript
store.insert({
  type: 'nervous-action',
  body: JSON.stringify(record),
  sprint_id: record.sprintId ?? 'unknown',
  tags: [record.actionId, record.decision, record.decidedBy],
  metadata: { notificationId: record.notificationId, outcome: record.outcome },
  decay_exempt: false,
});
```

FTS5 ile aranabilir: `searchMemory(store, { type: ['nervous-action'], text: 'directives-protection' })` → Sprint 148 detector event'leri döner.

### Test (5 test)
1. ExecutionRecord → memory entry insert
2. FTS5 search 'directives-protection' → Sprint 148 record döner
3. Sprint context tagged (sprint_id=148)
4. Retention (decay_after_sprints=20) respect
5. `deckent memory export` includes nervous entries

**Kanıt:** `sqlite3 .brain/memory.db "SELECT count(*) FROM entries WHERE type='nervous-action'"` > 0.

---

## Task 27: npm Publish Dry-Run Rehearsal

- Model: sonnet
- Effort: normal
- Skills: devops-engineer
- Files: package.json, scripts/npm-publish-dry.sh (NEW), docs/audits/sprint-148/npm-publish-dry.md
- Scope: ./, scripts/, docs/audits/

### Description
Sprint 149 full publish öncesi rehearsal. version bump 0.4.0-beta.3 → 0.4.0-beta.4. `npm pack` + `npm publish --dry-run` + tarball inspection.

Script `scripts/npm-publish-dry.sh`:
```bash
#!/bin/bash
set -euo pipefail
npm version 0.4.0-beta.4 --no-git-tag-version --allow-same-version
npm pack --dry-run 2>&1 | tee /tmp/npm-pack-dry.log
npm publish --dry-run 2>&1 | tee /tmp/npm-publish-dry.log

# Check tarball size < 2MB
size=$(npm pack --json | jq -r '.[0].size')
if [ "$size" -gt 2000000 ]; then
  echo "❌ Tarball too large: $size bytes"
  exit 1
fi

# Verify no secrets
if grep -r "ANTHROPIC_API_KEY\|OPENAI_API_KEY\|.env" /tmp/npm-pack-dry.log; then
  echo "❌ Secrets found in tarball"
  exit 1
fi

echo "✅ npm publish dry-run PASS"
```

### Test (4 test)
1. `npm pack` success
2. Tarball size < 2MB
3. Only src + dist + docs included (no node_modules, .brain, .tasks, .deckent)
4. No secret patterns

**Kanıt:** `bash scripts/npm-publish-dry.sh` exit 0. `docs/audits/sprint-148/npm-publish-dry.md` GO.

---

## Task 28: ADR-041 Draft — Agent Taxonomy (Horizontal vs Vertical)

- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: .brain/memory.db (insert), .brain/exports/decisions.md (regenerated)
- Scope: .brain/

### Description
ADR-041 taslak `status: proposed`. Sprint 149'da accept edilecek (dogfood kanıtı sonrası).

MADR v3 hibrit format:
```markdown
# ADR-041: Agent Taxonomy — Horizontal Skills vs Vertical Agents

## Status
proposed (Sprint 148)

## Context
Sprint 146-147 live evidence: `test-writer` agent 22/22 Sprint 147 tasks (100% anomaly). Intent classifier misroutes "test" keyword as primary 'testing' intent...

## Decision
Reorganize agent taxonomy: **agent = vertical expertise** (architect, security-auditor, frontend-designer, doc-writer). **Skill = horizontal capability** (testing-expert, typescript-expert, documentation-writer). Test is a horizontal skill usable by any agent, not a standalone vertical agent.

## Consequences
(+) Routing distribution balanced (no agent > 40%)
(+) Nervous AgentRoutingHealth detector meaningful
(+) Beta GA UX clean ("why does every task go to test-writer?" embarrassment avoided)
(-) Sprint 147 existing test-writer stats archived
(-) Breaking change: custom user agents may require migration adapter

## References
Sprint 146 T-146-005 string; corruption, Sprint 147 95% anomaly, Sprint 148 T-148-001..005 reform.
```

MemoryStore.insert:
```typescript
store.insert({
  id: 'adr-041',
  type: 'adr',
  title: 'Agent Taxonomy — Horizontal Skills vs Vertical Agents',
  body: /* above content */,
  status: 'proposed',
  sprint_id: 'sprint-148',
  tags: ['governance', 'agent-pool', 'taxonomy', 'beta-ga'],
  decay_exempt: true,
});
```

### Test (3 test)
1. `store.insert` success
2. `store.getById('adr-041')` returns entry, status='proposed'
3. `.brain/exports/decisions.md` regenerated, includes ADR-041

**Kanıt:** `store.getByType('adr').find(a => a.id === 'adr-041')?.status === 'proposed'`.

---

# BAĞIMLILIK ZİNCİRİ

```
Wave 1 (paralel, reform hazırlık): T1 + T2 + T3
Wave 2 (paralel, reform kesim):    T4 ← {T1,T2,T3} | T5
Wave 3 (paralel, nervous enable):  T6 + T7 + T8 + T9 ← T8
Wave 4 (paralel, detector + UI):   T10 + T11 + T12 + T13
Wave 5 (paralel, cross-platform):  T14 + T15 + T16 + T17 + T18 + T19
Wave 6 (paralel, polish + doc):    T20 + T21 + T22 + T23 + T24 + T25 + T26 + T27 + T28
```

# SPRINT GATE (CHAIN SAFETY)

1. **tsc --noEmit PASS** (0 errors)
2. **vitest fail < 50** (Sprint 147 baseline 135, hedef < 50)
3. **doctor ≥ 92/100** (READY + agent count 15)
4. **NO_GO ≤ 2** (Sprint 147 baseline 0)
5. **Nervous events ≥ 10** (detector canlı kanıt)
6. **Cross-platform 3/3** (macOS + Linux + WSL2)
7. **Agent routing test-writer = 0** (reform kanıt)
8. **cost < $150** (geniş soft cap)
9. **ADR-041 proposed** kayıtlı
10. **npm publish dry-run PASS**

# SPRINT 148 SELF-MODIFYING UYARISI

Deckent kendi agent pool'unu, intent classifier'ını, router'ını ve nervous system'ini değiştiriyor. ADR-038 Self-Modifying Detection **canlı çalışmalı**. Koordinatör disiplin:
- Sprint canlı iken src/ müdahale **YASAK** (Sprint 144-147 lesson)
- Monitor 15-30s interval
- T-148-007 Ana PID constraint **zorunlu** — worker process'ten nervous init YASAK

# FALLBACK — Sprint 149 Numaratör +1

Katastrofik fail senaryosu (< 50% completion veya > 3 NO_GO veya 8h hard cap aşımı):
1. `deckent_cleanup` (Alperen onaylı)
2. `.tasks/archive/sprint-148-failed/` taşı
3. Aynı DIRECTIVES.md Sprint 149 olarak yeniden başlat
4. Sprint 150 Beta GA **1 gün** ertelenir (Cuma 24 Nis) — **kabul edilebilir**

# BETA GA COUNTDOWN

Sprint 150 Perşembe 23 Nis TRT = **2 gün 18 saat**.

**Sprint 148 başarısı Sprint 149'a temiz giriş → Sprint 150 cutover:**
- npm publish v1.0.0-beta.1
- git tag v1.0.0-beta.1
- GitHub release notes
- `deckent nervous` user-facing v1.0 announcement

---

**Oluşturan:** Koordinatör (writing-plans skill + spec 2026-04-20 + Alperen onayları 7/7)
**Baseline:** Sprint 147 23/23 DONE 49m 34s 0 TD (hedef Sprint 148 ≤ 8h, rubric ≥ 85)
**İlk komut:** `deckent_plan mode: 'ai'` — Alperen onayı bekliyor
