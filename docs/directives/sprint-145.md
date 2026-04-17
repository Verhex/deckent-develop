# DIRECTIVES — Sprint 145: i18n 95 + Test A + Dokümantasyon + .deckent Temizlik + Observability + Feature Co-Evolve

## Goal

Kalite + meta sprint (zincir final). Feature-level brain co-evolve (features-manifest.json canlı + sync-docs.mjs auto-gen). i18n 95 puan (CLI tam + MCP 22 tool + Dashboard 28 eksik key + V2 uyum). Test A (CI Node 22 fix + vitest %99.9 stabilize + 21 skill coverage). Dokümantasyon (README/AGENTS/CLAUDE/IDENTITY/BLUEPRINT + memory-system.md rewrite + .npmignore). .deckent temizlik politikası (3 sprint retention + periyodik arşiv). Observability (debug-log 4 seviye + error hierarchy unify + ERRORS.md noise filter). Config katı yapı (Zod validation). DECISIONS.md archive finalize. Chain toplu review raporu. Sprint 146 pre-flight.

**Spec:** `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md` § 4
**Plan:** `docs/superpowers/plans/2026-04-17-sprint-145-implementation-plan.md`

**Süre hard cap:** 4.5h | **Cost budget:** $15 | **Opus task:** 12/18, **Sonnet task:** 6/18 (P2).

---

## Cross-Cutting Rules

1. **Opus-only P0/P1:** 12 task opus (feature co-evolve, CLI i18n, CI fix, vitest stabilize, doc updates, dashboard V2, observability, config Zod, chain review). 6 P2 sonnet OK (MCP i18n, dashboard 28 key, skill test, .npmignore, cleanup policy, DECISIONS finalize, Sprint 146 preflight).
2. **MVP yasak** + **Core bozulamaz** + **Chain safety gate**.
3. **Son sprint — toplu review:** Sprint 145 sonu Alperen + Claude Code joint audit. 11 sağlık boyutu hedefleri karşılanmalı.

---

## Task 1: Feature-Level Co-Evolve (Karar 4-D-C)
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert, system-architect
- Files: .deckent/features-manifest.json (canlı), scripts/sync-docs.mjs (yeni), src/core/features-manifest.ts (yeni), src/mcp/server.ts, src/cli/index.ts, docs/reference/{mcp-tools,cli-commands,agents,skills}.md (auto-gen), src/orchestra/sprint-finalizer.ts, tests/
- Scope: .deckent/, scripts/, src/, docs/reference/, tests/

### Description
Manifest schema: 22 MCP tool + 41+ CLI + 16 agent + 21 skill. Collection sources (MCP tool index, commander program, agents/*/agent.json, skills/*/manifest.json). `sync-docs.mjs` → docs/reference/ 4 dosya auto-gen. Sprint-finalizer runCoEvolveHook() adım 6 entegrasyon.

**Kanıt:** `jq '.stats' .deckent/features-manifest.json` → 22/41/16/21. `docs/reference/mcp-tools.md` AUTO-GENERATED header ile.
**Test:** 15+ test (schema, collection, render, idempotency).

---

## Task 2: CLI Tam i18n (35+ hardcoded → messages.ts)
- Model: opus | Effort: high | Agent: refactorer | Skills: typescript-expert
- Files: src/cli/helpers/messages.ts, ~35 CLI komut dosyası, tests/
- Scope: src/cli/, tests/cli/

### Description
T-144-010 temel 5 komut → tüm CLI (~200 mesaj × 2 locale = ~400 string). Namespace organization (init, start, status, ... , output, wizard). Hardcoded string 0.

**Kanıt:** `grep -rn "console\.log(['\"][A-Z]" src/cli/commands/ | wc -l` → 0.
**Test:** 30+ test.

---

## Task 3: MCP Tool i18n (22 tool description)
- Model: sonnet | Effort: normal | Agent: refactorer | Skills: typescript-expert
- Files: src/mcp/tools/*.ts (22), src/mcp/helpers/i18n.ts (yeni), tests/
- Scope: src/mcp/, tests/mcp/

### Description
22 tool description TR/EN. `MCP_LANG=tr` env ile TR output. Schema error messages i18n.

**Kanıt:** `MCP_LANG=tr` ile tool description TR.
**Test:** 22 × 2 = 44 description check.

---

## Task 4: Dashboard 28 Eksik ConfigPage i18n Key
- Model: sonnet | Effort: normal | Agent: frontend-designer | Skills: react-specialist
- Files: src/dashboard/src/i18n/tr.ts, en.ts, pages/Config.tsx, tests/dashboard/
- Scope: src/dashboard/, tests/dashboard/

### Description
tr.ts ve en.ts key count eşit olmalı. 28 eksik × 2 locale = 56 yeni entry. ConfigPage render test TR + EN.

**Kanıt:** tr.ts key count === en.ts key count.
**Test:** 10+ test.

---

## Task 5: Dashboard Memory V2 Tam Uyum
- Model: opus | Effort: normal | Agent: frontend-designer | Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/pages/Memory.tsx, hooks/useApi.ts, components/DebtTable.tsx, tests/
- Scope: src/dashboard/, tests/dashboard/

### Description
Memory sayfası DB entry listing + FTS5 search UI + relation graph viz (T-143-007 sonrası). DebtTable.tsx `store.getByType('debt')` API. useApi lazy refetch + abort on unmount.

**Kanıt:** Dashboard Memory sayfası DB live render + search + relations.
**Test:** 12+ test.

---

## Task 6: CI Workflow Yeşil (Sprint 141 Matrix Issue)
- Model: opus | Effort: normal | Agent: ci-guardian | Skills: ci-testing, devops-engineer
- Files: .github/workflows/ci.yml, tests/ci/
- Scope: .github/workflows/, tests/ci/

### Description
`fail-fast: false` matrix. Node 22 uyumsuzluk: `npm rebuild better-sqlite3` step. 3 Node (18/20/22) × 2 OS (ubuntu/macos) = 6 job tümü PASS.

**Kanıt:** CI PR trigger 6/6 green.
**Test:** CI run validation.

---

## Task 7: Vitest %99.9 Stabilize
- Model: opus | Effort: high | Agent: test-writer | Skills: testing-expert
- Files: 10-20 flaky test dosyası audit + fix, vitest.config.ts, god test split (T-144-001/002 ile koordine)
- Scope: tests/, .

### Description
5 ardışık `vitest run` → 5/5 identical PASS. Flaky audit (timing, network mock leak, fs race). vitest.config.ts pool:forks + isolate:true + retry:0. God test'ler bölünür.

**Kanıt:** 5 ardışık run 5/5 PASS (12485+ baseline korunur).
**Test:** Entire suite stabilize.

---

## Task 8: Skill Test Coverage (11 eksik → 21 tested)
- Model: sonnet | Effort: normal | Agent: test-writer | Skills: testing-expert
- Files: tests/skills/<skill-id>.test.ts (11 yeni)
- Scope: tests/skills/

### Description
11 skill test yazılır (api-builder, ci-testing, code-simplifier, devops-engineer, docker-expert, frontend-design, git-expert, graphql-expert, migration-expert, monorepo-expert, system-architect). Her biri ≥5 test (manifest valid, AST sandbox, activation, prompt, integration).

**Kanıt:** `tests/skills/` 21 dosya.
**Test:** 55+ test (11 × 5).

---

## Task 9: README + README-TR Güncel
- Model: opus | Effort: normal | Agent: doc-writer | Skills: documentation-writer
- Files: README.md, README-TR.md
- Scope: .

### Description
11 sprint geride. Memory V2 DB-first + 22 MCP + 41+ CLI + 16 agent + 21 skill + 3 provider + better-sqlite3/mcp-sdk/zod deps + quick start.

**Kanıt:** Sprint 145 state yansıtılır. Sayılar manifest ile uyumlu.
**Test:** Manual review + link checker.

---

## Task 10: AGENTS + CLAUDE + DECKENT + IDENTITY Cross-Validation
- Model: opus | Effort: normal | Agent: doc-writer | Skills: documentation-writer
- Files: AGENTS.md, CLAUDE.md, DECKENT.md, .deckent/workspace/IDENTITY.md, .brain/PROJECT-IDENTITY.md
- Scope: ., .deckent/, .brain/

### Description
AGENTS.md 39 sprint geride. 5 dosyada sayı tutarlılığı (22/40/41+/12485+/145/16/21). T-145-001 features-manifest canonical source. T-143-010 sprint-finalizer auto-regen baseline.

**Kanıt:** 5 dosyada sayılar eşit + manifest ile uyumlu.
**Test:** `scripts/validate-cross-references.mjs` check.

---

## Task 11: docs/architecture/memory-system.md Rewrite + BLUEPRINT
- Model: opus | Effort: high | Agent: doc-writer | Skills: documentation-writer, system-architect
- Files: docs/architecture/memory-system.md (rewrite), DECKENT-MASTER-BLUEPRINT.md
- Scope: docs/, .

### Description
Memory V2 full dokümantasyonu: schema v1 (5 tablo + FTS5 + 3 trigger + 9 index), dual-layer search, relations (Sprint 143 T-143-007), brain co-evolve (Sprint 143+145), CLI/MCP API, exports, migration history. BLUEPRINT Memory V2 section.

**Kanıt:** memory-system.md ≥300 satır + tam dokümantasyon.
**Test:** Markdown lint + link checker.

---

## Task 12: .npmignore + Publishing Rule (Direktif 33)
- Model: sonnet | Effort: low | Agent: devops-engineer | Skills: devops-engineer
- Files: .npmignore, package.json (files field)
- Scope: .

### Description
`docs/superpowers/` + internal assets npm'e gitmez. Whitelist approach (package.json `files`). `npm pack --dry-run` validation.

**Kanıt:** `npm pack --dry-run` output'ta docs/superpowers/ + DECKENT-MASTER-BLUEPRINT YOK, docs/reference/ + docs/guide/ VAR.
**Test:** 5 test (npm pack dry-run content validation).

---

## Task 13: .deckent Temizlik Politikası + Periyodik Arşiv
- Model: sonnet | Effort: normal | Agent: devops-engineer | Skills: devops-engineer
- Files: scripts/deckent-cleanup-policy.mjs (yeni), src/orchestra/sprint-finalizer.ts, src/cli/commands/cleanup.ts, tests/
- Scope: scripts/, src/orchestra/, src/cli/commands/, tests/

### Description
Retention: config.json.bak* (3), sprint-*-events.jsonl (5), sprint-*-seq (3), sprint-*-layer3-scorecard.md (3), jobs/* (1 gün), sprint-god-analysis/ (1 keep). Sprint finalize `mode='suggest'`, periyodik rapor `.deckent/cleanup-suggestions.md`. `deckent cleanup --policy --apply` Alperen onayıyla.

**Kanıt:** `.deckent/cleanup-suggestions.md` üretilir. Apply retention'a göre arşiv/sil.
**Test:** 12 test.

---

## Task 14: Observability Katmanı (debug-log + error hierarchy + ERRORS.md filter)
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert
- Files: src/core/debug-log.ts (genişlet), errors.ts, stack-detector.ts, audit console.warn/error, catch (err: unknown), tests/
- Scope: src/core/, src/, tests/

### Description
**Direktif 22:** log/debug sertleşmesi. debug-log 4 seviye tam impl (DECKENT_LOG_LEVEL env). DeckentError base → BrainError + ValidationError + MemoryQueryError + ConfigError + NetworkError + ProviderError. stack-detector.ts proje type detect öncesi → ENOENT noise <5/sprint. Tüm `catch (err)` → `catch (err: unknown)` + type narrow. `console.warn/error` → debugLog.

**Kanıt:** `.brain/ERRORS.md` noise <50/sprint. `DECKENT_LOG_LEVEL=trace deckent doctor` full trace.
**Test:** 20+ test.

---

## Task 15: Config Katı Yapı (Zod Validation, Direktif 21)
- Model: opus | Effort: normal | Agent: architect | Skills: typescript-expert, security-specialist
- Files: src/core/config-schema.ts (yeni), config.ts, config-types.ts, .deckent/project-stack.json, tests/
- Scope: src/core/, .deckent/, tests/

### Description
Zod schemas (DeckentConfigSchema, MemoryV2ConfigSchema, ProviderSchema, TierSchema, PlanningModeSchema). loadConfig Zod parse + ConfigError on invalid. project-stack.json buildTool fix (vite→tsc). Migration flat→nested helper.

**Kanıt:** Invalid config → ConfigError. project-stack.json doğru.
**Test:** 15+ test.

---

## Task 16: DECISIONS.md Archive Finalize (Direktif 29)
- Model: sonnet | Effort: low | Agent: devops-engineer | Skills: git-expert
- Files: .brain/archive/decisions-root-pre-sprint145/ manifest, .brain/PROJECT-IDENTITY.md
- Scope: .brain/

### Description
T-143-009 archive finalize. Archive manifest SHA verify. PROJECT-IDENTITY.md "See .brain/DECISIONS.md for 28 ADRs" → "See .brain/exports/decisions.md for 40 ADRs" (T-143-010 auto-regen).

**Kanıt:** `ls .brain/DECISIONS.md` yok. manifest valid.
**Test:** 3 test.

---

## Task 17: Chain Toplu Review Raporu
- Model: opus | Effort: high | Agent: architect | Skills: documentation-writer, system-architect
- Files: docs/audits/sprint-145/CHAIN-REVIEW-REPORT.md (yeni)
- Scope: docs/audits/sprint-145/

### Description
3 sprint zincir raporu: executive summary, 11 boyut baseline→final, 60 borç closure, 5 karar execution trace, chain gate pass/fail history, remaining work, Sprint 146 recommendations, risk/incident log, MVP yasak check, next steps.

**Kanıt:** Rapor ≥500 satır, tüm 11 boyut metriği + kanıt + recommendation.
**Test:** Manual review.

---

## Task 18: Sprint 146 Pre-Flight
- Model: sonnet | Effort: low | Agent: architecture-planner | Skills: system-architect
- Files: .brain/sprints/sprint-146-preflight.md (yeni)
- Scope: .brain/sprints/

### Description
Tema: Multi-provider + macOS/Windows dogfood. Task candidates (15-20): Codex/Gemini live test, macOS dogfood, Windows spike, provider equivalence benchmark, cost comparison. Risks (API quota, platform regression). Budget $20. Süre ~5h.

**Kanıt:** Pre-flight hazır, Sprint 146 brainstorming için temel.
**Test:** Manual review.

---

## Sprint 145 Sonu — TOPLU REVIEW + Chain Handoff

Chain safety gate (son 5-check) **VE** Alperen + Claude Code joint audit:
1. `docs/audits/sprint-145/CHAIN-REVIEW-REPORT.md` birlikte okunur
2. 11 sağlık boyutu hedef karşılanıyor mu? (Brain 95+, Memory V2 100/100, i18n 95, vb.)
3. MVP yasak ihlali var mı? (retro'lardan worker "acaba" pattern tespit)
4. Core bozulmadı mı? (brain finalize/cleanup/heartbeat)
5. Opus-only P0/P1 uyumu kanıtlı mı?
6. 60 borç closure status
7. Sprint 146 brainstorming başlar

**Zincir sonu:** Sprint 146 otomatik tetiklenmez. Alperen onayıyla brainstorming new cycle.
