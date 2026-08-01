# W5 — Architecture & Consistency Audit (Sprint 132)

## Executive Summary

Deckent'in iç mimarisi 130+ sprint boyunca tutarlı bir şekilde gelişmiş ve genel olarak sağlam bir modüler yapıya sahip. Ancak iki kritik **god object** — `sprint-reporter.ts` (2132 satır, 57 export, 13 sorumluluk) ve `sprint-controller.ts` (2133 satır, 31 export, 9 sorumluluk) — karmaşıklık ve bakım maliyeti açısından en büyük mimari riskleri oluşturuyor. **Task dependency parsing** tamamen kırık durumda: `parseStructuredDirectives` `- Dependencies:` satırını parse etmiyor, `spawnWorkers` dependency alanını okumuyor ve `parallel-pipeline.ts` içindeki topological sort hiçbir production kodda çağrılmıyor. API surface contract'ı (`api-surface.md`) güncel ve tutarlı; Sprint 125-128 eklemeleri (tokenUsage, rubricScores, evaluationDecision) doğru şekilde belgelenmiş. Sprint 131'in 5 büyük özelliği (managed-docs, i18n, templates, plugin loader, doc-cache) ADR olmadan implement edilmiş — bu bir documentation debt. Naming convention'lar ise mükemmel seviyede: %99+ kebab-case uyum, sıfır `as any` cast, sıfır `@ts-ignore`.

## Methodology

**Tarama kapsamı:** `src/` altındaki 273 TypeScript dosyası, `.contracts/api-surface.md`, `.brain/DECISIONS.md`, `src/mcp/tools/` dizini, tüm barrel export dosyaları (`src/index.ts`, `src/core/index.ts`, `src/orchestra/index.ts`, `src/agents/index.ts`, `src/monitor/index.ts`).

**Teknikler:**
- Line count ve export sayımı ile god object tespiti
- Import grafı analizi ile coupling ve circular dependency tespiti
- `grep` ile dead code, type safety violation (`any`, `as any`, `@ts-ignore`, `@ts-expect-error`), naming pattern taraması
- ADR implementasyon doğrulaması (son 10 ADR için codebase grep)
- API surface contract'ı ile gerçek kod karşılaştırması
- MCP tool listesi vs. `src/mcp/tools/` dosya sayısı çapraz doğrulaması

**Standartlar:** Clean Architecture, SOLID principles, Hexagonal Architecture module boundary heuristics, cyclomatic complexity thresholds (≤10 hedef, >15 zorunlu split).

## Findings

| # | Severity | Category | Location | Description | Impact | Recommendation |
|---|----------|----------|----------|-------------|--------|----------------|
| 1 | CRITICAL | GodObject | src/orchestra/sprint-reporter.ts | 2132 satır, 57 export, 13 farklı sorumluluk alanı. Metrics, retro, docs, CI health, self-learning, debt tracking hepsi tek dosyada. | Bakım maliyeti çok yüksek; tek dosyada değişiklik 13 farklı alanı etkileyebilir. | 4 dosyaya böl: sprint-metrics.ts, sprint-reporter-retro.ts, sprint-reporter-docs.ts, ci-reporter.ts |
| 2 | HIGH | GodObject | src/orchestra/sprint-controller.ts | 2133 satır, 31 export, 9 sorumluluk. runSprint ~62 branching statement (cyclomatic complexity). IPC registry, spawn, evaluate, finalize hepsi tek dosyada. | runSprint fonksiyonu çok karmaşık; hata ayıklama ve test zorlaşıyor. | IPC registry'yi worker-ipc-registry.ts'e, finalizeSprint'i sprint-finalizer.ts'e çıkar. ADR-024/026 ile başlayan split devam etmeli. |
| 3 | HIGH | DependencyBrokenParsing | src/orchestra/task-builder.ts:358-439 | parseStructuredDirectives "- Dependencies:" satırını parse etmiyor. Parsed fields: Model, Effort, Skills, Agent, Files, Scope — ama Dependencies yok. | DIRECTIVES'te dependency tanımlansa bile task JSON'a aktarılmaz. Sprint 132 W7 gibi bağımlı task'lar self-polling ile workaround yapmak zorunda. | parseStructuredDirectives'e `- Dependencies:` parsing ekle. |
| 4 | HIGH | DependencyBrokenParsing | src/orchestra/sprint-controller.ts:919-1018 | spawnWorkers fonksiyonu task.dependencies alanını kontrol etmeden tüm task'ları paralel spawn ediyor. activeTasks = sprint.tasks.slice(0, maxWorkers). | Bağımlı task'lar dependency sırasına bakılmadan aynı anda başlatılıyor; bağımlılık çözümsüz kalıyor. | ParallelPipelineManager.createPipeline() ile topological sort entegre et. |
| 5 | HIGH | DeadCode | src/orchestra/parallel-pipeline.ts | 106 satırlık topological sort implementasyonu production kodda hiç çağrılmıyor. Sadece test dosyalarında kullanılıyor (collaboration-adaptive.test.ts, parallel-pipeline.test.ts). | Tam çalışan dependency-aware scheduling motoru mevcut ama entegre edilmemiş. Bu orphaned code, teknik borç. | spawnWorkers'a entegre et veya ADR ile karar belirle. |
| 6 | HIGH | ADRMissing | src/orchestra/managed-docs/ | Sprint 131'de eklenen 5 büyük feature (managed-docs universalization, i18n, template rendering, plugin loader, doc-cache) ADR olmadan implement edilmiş. | Mimari kararların gerekçeleri kayıt altında değil. Gelecek sprint'lerde bu kararların neden alındığı bilinmeyecek. | ADR-029 (Managed Docs), ADR-030 (i18n), ADR-031 (Template+Plugin), ADR-032 (Doc Cache) oluştur. |
| 7 | MEDIUM | GodObject | src/core/plugin-hooks.ts | 796 satır, 35 export. İsmine rağmen iki farklı concern: plugin hook registry (~6 fonksiyon) ve CI guardian/validation (~20+ fonksiyon). | Dosya adı yanıltıcı; CI validation fonksiyonları plugin-hooks içinde olmamalı. | CI fonksiyonlarını ci-guardian.ts'e çıkar, plugin-hooks.ts sadece hook registry olsun. |
| 8 | MEDIUM | GodObject | src/monitor/auditor.ts | 612 satır, 16 export, 10 farklı sorumluluk (heartbeat scan, boundary check, stale lock, deadlock, dashboard, pattern detect). | Tek dosya tüm monitoring concern'leri kapsıyor; her değişiklik tüm scan logic'i etkileyebilir. | health-checker.ts, pattern-detector.ts, scan-coordinator.ts olarak 3'e böl. |
| 9 | MEDIUM | Coupling | src/core/provider.ts → src/orchestra/connector.js | Core → orchestra yönünde tek circular dependency. provider.ts Connector'ı import ediyor. | ADR-008 tek-yönlü bağımlılık kuralını ihlal ediyor (core asla orchestra'dan import etmemeli). | Connector interface'ini core/types'a taşı, orchestra sadece implementasyonu sağlasın (Dependency Inversion). |
| 10 | MEDIUM | DeadCode | src/orchestra/decision-engine.ts | Sprint 066'da @deprecated edilmiş. Production'da kullanılmıyor, sadece test dosyalarında import (161 test import). | 161 test import'u bakım yükü oluşturuyor. @deprecated kod referans olarak tutuluyor ama test bağımlılığı artıyor. | V2 routing tamamen stabilize olduğunda testleri migrate et, dosyayı kaldır. ADR-028 timeline belirle. |
| 11 | MEDIUM | ContractDrift | src/mcp/tools/job-runner.ts | src/mcp/tools/ dizininde 22 .ts dosyası var ama 21 tool registered. job-runner.ts internal helper olarak kullanılıyor ama yorum/belgeleme eksik. | Audit sırasında karışıklık yaratır; 22 dosya vs 21 tool tutarsız görünür. | job-runner.ts'e "// @internal — not an MCP tool" yorumu ekle veya helpers/ alt dizinine taşı. |
| 12 | LOW | ADRMissing | .brain/DECISIONS.md:ADR-022 | ADR-022 iki kez listelenmiş: Sprint 067 (v1) ve Sprint 085 (v2). | Duplicate ADR numaraları karışıklık yaratır. | Tek ADR-022 olarak konsolide et veya v2'yi ADR-022a olarak yeniden numarala. |
| 13 | LOW | NamingInconsistency | src/agents/worker-ipc.ts:27 | `interface IPCMessage` — Hungarian notation (I prefix). Codebase'deki 472 interface'in 471'i I prefix kullanmıyor. | Tutarsızlık minimal ama var. | `IPCMessage` olarak bırakılabilir (IPC bir kısaltma, I prefix değil) veya `WorkerIPCMessage` olarak yeniden adlandır. |
| 14 | LOW | NamingInconsistency | src/dashboard/src/hooks/useApi.ts, useSSE.ts | 2 React hook dosyası camelCase — codebase genelinde kebab-case kuralına aykırı. | React convention'ı izliyor ama proje standardını bozuyor. | React hooks için istisnayı dokümante et veya use-api.ts, use-sse.ts olarak yeniden adlandır. |
| 15 | INFO | GodObject | src/agents/worker.ts | 997 satır, 42 export, 7 sorumluluk. Ancak tüm fonksiyonlar task execution lifecycle'ına bağlı — kohezyon yüksek. | Şu an kabul edilebilir. 1200+ satıra çıkarsa split değerlendir. | İzle; lock management ayrı dosyaya çıkarılabilir (file-lock.ts). |
| 16 | INFO | GodObject | src/core/config.ts | 1110 satır, 23 export, 8 sorumluluk. Config inherently cross-cutting, merge+validation+metadata aynı yerde olması gerekli. | Şu an kabul edilebilir. | CONFIG_METADATA ve getConfigHelp'i config-help.ts'e çıkarmak optional. |
| 17 | INFO | ContractDrift | .contracts/api-surface.md | Contract dosyası güncel: tokenUsage (Sprint 124), rubricScores (Sprint 125), evaluationDecision (Sprint 125-126) hepsi belgelenmiş. MCP 21 tool doğru. | Pozitif bulgu — contract discipline iyi. | Mevcut disiplini sürdür. Her sprint sonrası contract review yapılmalı. |
| 18 | INFO | NamingInconsistency | Codebase geneli — type safety | 58 `any` kullanımı var (çoğu error handling). 0 `as any` cast, 0 `@ts-ignore`, 0 `@ts-expect-error`. | Mükemmel type safety disiplini. | 58 `any` kullanımını kademeli olarak `unknown` ile değiştir. |

## Metrics

- Dosya tarandı: 273 TypeScript kaynak dosyası + 5 contract/ADR dosyası
- Toplam bulgu: 18
- CRITICAL: 1, HIGH: 5, MEDIUM: 4, LOW: 3, INFO: 5
- God object tespiti: 7 dosya analiz edildi (toplam 8533 satır, 221 export)
- Circular dependency: 1 (core/provider.ts → orchestra/connector.js)
- ADR sayısı: 28 (27 ACCEPTED, 1 DEFERRED)
- ADR implementasyon oranı (son 10): %100
- Missing ADR: 5 (Sprint 131 features)
- Dead code modülleri: 2 (parallel-pipeline.ts orphaned, decision-engine.ts deprecated)
- Naming tutarlılığı: %99.3 (271/273 dosya kebab-case, 471/472 interface no-prefix)
- Type safety: 0 `as any`, 0 `@ts-ignore`, 0 `@ts-expect-error`
- ESM compliance: %100 (.js extension tüm local import'larda)

## Evidence

### Finding #1 — sprint-reporter.ts God Object
```
File: src/orchestra/sprint-reporter.ts
Lines: 2132
Exports: 57
Responsibilities: metrics calculation, retrospective generation, project doc updates,
  project identity, debt tracking, ADR auto-drafting, self-learning insights,
  CI health reporting, sprint file collection, token usage formatting,
  agent performance tables, skill performance tables, config suggestions
```

### Finding #3 — Dependencies Not Parsed
```
File: src/orchestra/task-builder.ts:358-439 (parseStructuredDirectives)
Parsed fields: title, scope, testTarget, forceModel, forceEffort, forceAgent,
  forceSkills, excludeSkills
NOT parsed: Dependencies (no grep match for "Dependencies" in parser block)
Return type ParsedDirectiveTask (line 110-122) has no dependencies field.
```

### Finding #4 — spawnWorkers Ignores Dependencies
```
File: src/orchestra/sprint-controller.ts:919-1018
Code pattern:
  const activeTasks = sprint.tasks.slice(0, maxWorkers);  // Simple slice
  const queuedTasks = sprint.tasks.slice(maxWorkers);     // No topo sort
  for (const task of activeTasks) {
    // Spawn immediately — no dependency graph check
  }
```

### Finding #5 — parallel-pipeline.ts Orphaned
```
File: src/orchestra/parallel-pipeline.ts (106 lines)
Exports: ParallelPipelineManager, ExecutionWave, PipelineTask
Production imports: 0
Test imports: 3 (collaboration-adaptive.test.ts, parallel-pipeline.test.ts, error-handling-unification.test.ts)
```

### Finding #6 — Missing ADRs for Sprint 131
```
Sprint 131 commit: e1da3c7 "feat: Sprint 131 — Managed Docs Universalization (i18n + Templates + Plugins + Cache)"
Files added: src/orchestra/managed-docs/ (9 files: managed-doc-runner.ts, plugin-loader.ts,
  template-renderer.ts, content-generators.ts, docs-config.ts, doc-cache.ts, ...)
ADR search in .brain/DECISIONS.md: No ADR-029+ found. Last ADR is ADR-028 (Sprint 130).
```

### Finding #9 — Circular Dependency
```
File: src/core/provider.ts
Import: import { Connector } from '../orchestra/connector.js';
Direction: core → orchestra (violates ADR-008 one-way rule)
Reverse: orchestra → core has 55+ imports (expected, types/constants)
```

### Finding #10 — decision-engine.ts Deprecated
```
File: src/orchestra/decision-engine.ts:1-8
Comment: "@deprecated Since Sprint 066. Superseded by V2 intent-based routing engine"
Production usage: 0
Test imports: 161 across test suites
```

### Finding #18 — Type Safety
```
Codebase-wide grep results:
  'any' type usage: 58 occurrences (mostly error handling catch blocks)
  'as any' casts: 0 occurrences
  '@ts-ignore': 0 occurrences
  '@ts-expect-error': 0 occurrences
ESM .js extension: 100% compliance across all local imports
```

## Recommendations (Sprint 133+)

### CRITICAL (Sprint 133)
1. **sprint-reporter.ts God Object Split** — 2132 satır ve 57 export ile en büyük god object. 4 dosyaya bölünmeli: `sprint-metrics.ts` (metrics calculation, comparison), `sprint-reporter-retro.ts` (retro generation, sprint log), `sprint-reporter-docs.ts` (doc updates, identity, debt, decisions), `ci-reporter.ts` (CI health, CI learning). Estimated effort: HIGH.

### HIGH (Sprint 133-134)
2. **Task Dependency Pipeline Entegrasyonu** — Üç parça bir araya getirilmeli: (a) parseStructuredDirectives'e `- Dependencies:` parsing ekle, (b) spawnWorkers'da ParallelPipelineManager.createPipeline() ile topological sort kullan, (c) parallel-pipeline.ts'i production path'e bağla. Bu üçlü entegrasyon dependency-aware scheduling sağlar. Estimated effort: HIGH.

3. **Sprint 131 ADR'lerini Yaz** — ADR-029 (Managed Docs Universalization), ADR-030 (i18n Architecture), ADR-031 (Template Rendering + Plugin Loader), ADR-032 (Doc Cache Strategy). Estimated effort: NORMAL.

4. **sprint-controller.ts Devam Split** — ADR-024/026 ile başlayan split'i tamamla. IPC registry'yi `worker-ipc-registry.ts`'e, finalizeSprint'i `sprint-finalizer.ts`'e çıkar. Estimated effort: NORMAL.

### MEDIUM (Sprint 134+)
5. **Circular Dependency Düzeltme** — core/provider.ts → orchestra/connector.js bağımlılığını ters çevir. `Connector` interface'ini core/types'a taşı, dependency inversion uygula.

6. **plugin-hooks.ts CI Extraction** — CI guardian fonksiyonlarını (~20 fonksiyon) `ci-guardian.ts`'e çıkar.

7. **decision-engine.ts Removal Timeline** — ADR-028'e concrete removal timeline ekle. Test'leri V2 routing'e migrate et.

### LOW (Backlog)
8. **auditor.ts Split** — 3 dosyaya böl: health-checker, pattern-detector, scan-coordinator.
9. **job-runner.ts Clarification** — Internal helper olduğunu belgele veya helpers/ dizinine taşı.
10. **58 `any` usage cleanup** — Kademeli olarak `unknown` + type guard'lara geçir.

## Module Ownership Map

| Module | Primary Files | LoC | Responsibility | Depends On | Used By |
|--------|--------------|-----|----------------|------------|---------|
| **src/core/** | 58 modules | ~12K | Types, config, utilities, routing engine, agent/skill pools, provider registry, model registry | node built-ins only (ideally) | orchestra, agents, monitor, mcp, cli, dashboard |
| **src/orchestra/** | 65 modules | ~18K | Sprint lifecycle, planning, evaluation, routing, spawn, debt management, reporting, managed-docs | core (types, config, constants, routing) | cli (commands), mcp (tools), api |
| **src/agents/** | 16 modules | ~4K | Worker execution, prompt engineering, adaptive agents, IPC, lock management | core (types, constants, errors, stack-detector) | orchestra (spawn, evaluate) |
| **src/monitor/** | 5 modules | ~2K | Auditor scan loop, heartbeat monitoring, boundary violation, pattern detection, dashboard state | core (types, constants) | orchestra (sprint-controller starts scan) |
| **src/mcp/** | 23 modules | ~5K | MCP server, 21 tools, 8 resources, stdio transport | core (types, config), orchestra (brain API) | External (Claude Code, IDE extensions) |
| **src/cli/** | 35+ modules | ~8K | CLI entry point, 35+ commands, helpers, output formatting | core, orchestra, agents, monitor | End user (terminal) |
| **src/api/** | 3 modules | ~1K | HTTP API server, SSE streaming, rate limiting | core (types), orchestra (status) | Dashboard (web client) |
| **src/dashboard/** | 30+ modules | ~6K | React + Vite + Tailwind web dashboard, 6 pages, i18n | api (HTTP/SSE) | End user (browser) |
| **src/providers/** | 5 modules | ~2K | Claude, Codex, Gemini provider adapters | core (provider interface, types) | orchestra (task-router, spawn) |

### Cross-Module Dependency Summary
```
                    ┌─────────┐
                    │  core/  │  ← Foundation (types, config, routing)
                    └────┬────┘
           ┌─────────────┼─────────────┐
           │             │             │
      ┌────▼────┐  ┌─────▼─────┐  ┌───▼────┐
      │orchestra│  │  agents/  │  │monitor/│
      └────┬────┘  └───────────┘  └────────┘
      ┌────┼─────────┐
      │    │         │
   ┌──▼──┐ ┌──▼──┐ ┌──▼──┐
   │ mcp │ │ cli │ │ api │
   └─────┘ └─────┘ └──┬──┘
                    ┌──▼──────┐
                    │dashboard│
                    └─────────┘

ANOMALY: core/provider.ts ──→ orchestra/connector.js (violates one-way rule)
```

### Barrel Export Inventory

| Barrel File | Export Count | Notes |
|-------------|-------------|-------|
| src/index.ts | 4 re-exports | Clean barrel: core, orchestra, monitor, agents |
| src/core/index.ts | 37 groups | Utilities, config, analysis, subscription, routing v2 |
| src/orchestra/index.ts | 20+ | Brain API, tmux, doc updaters, routing v2 utilities |
| src/agents/index.ts | 17 | Worker functions only; 15 other agent files are internal |
| src/monitor/index.ts | 11 | Auditor functions only |

## Context7 References

- **Clean Architecture (Robert C. Martin):** "A good architecture maximizes the number of decisions NOT made." Deckent'in 3-layer config merge ve tier-based model abstraction'ı bu prensibe uygun. God object'ler (sprint-reporter, sprint-controller) ise Single Responsibility Principle'ı ihlal ediyor.

- **Hexagonal Architecture (Ports & Adapters):** Core modülün dış katmanlara bağımlı olmaması gerekir. `core/provider.ts → orchestra/connector.js` import'u bu prensibi ihlal ediyor. Connector interface core'da tanımlanmalı (port), orchestra implementasyon sağlamalı (adapter).

- **DDD Bounded Contexts:** sprint-reporter.ts 13 farklı bounded context'i (metrics, retro, docs, CI, debt, identity, learning, patterns) tek aggregate'te birleştiriyor. Her context kendi modülünde olmalı.

- **Cyclomatic Complexity Thresholds:** Industry standard ≤10 (hedef), ≤15 (kabul edilebilir), >15 (zorunlu refactor). runSprint ~62 branching — 4x üzerinde.

- **Module Boundary Heuristics (Parnas 1972):** "The criteria for module decomposition should be based on the principle of information hiding." parallel-pipeline.ts tam çalışan bir topological sort sunuyor ama spawnWorkers bu bilgiyi kullanmıyor — information hiding yerine information ignoring.
