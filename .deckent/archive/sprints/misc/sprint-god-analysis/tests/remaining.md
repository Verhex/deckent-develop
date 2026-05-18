# Batch Analysis Report: tests/ batch 6 — agents/ + providers/ + remaining

**Task ID:** 142-035 | **Model:** opus | **Effort:** max | **Total Files:** 99 | **Total LoC:** 22,404

---

## Executive Summary

99 test dosyası, 19 kategori, 22,404 satır test kodu analiz edildi. Genel kalite YÜKSEK — deprecated pattern sıfır, Memory V2 doğrudan kullanım sıfır (bu katmanda beklenen), TODO/FIXME/HACK sıfır. En güçlü kategori agents/ (8,908 satır, 757 it block). En zayıf: brain/ (1 dosya, 98 satır), config/ (1 dosya, 46 satır), smoke/ (1 dosya, 52 satır).

---

## Global Metrics

| Metric | Value |
|--------|-------|
| Total Files | 99 |
| Total Lines | 22,404 |
| Total describe blocks | 448 |
| Total it/test blocks | 2,267 |
| Files with vi.mock() | 30 (30%) |
| Files with vi.fn() | 28 (28%) |
| Files with vi.spyOn() | 2 (2%) |
| countBrainLines (deprecated) | 0 |
| parseDebtTable (deprecated) | 0 |
| generateDebtTable (deprecated) | 0 |
| MemoryStore usage | 0 |
| memory-store import | 0 |
| `as any` casts | 50 |
| `: any` annotations | 13 |
| @ts-ignore | 0 |
| @ts-expect-error | 7 |
| TODO/FIXME/HACK | 0 |
| describe.skipIf / it.skipIf | 9 occurrences (3 files) |

---

## Category-by-Category Analysis

---

### 1. tests/agents/ (25 files, 8,908 LoC, 153 describe, 757 it/test)

**Source Mapping:** Tüm dosyalar `src/agents/` altındaki 16 modüle eşleşir. 10 test dosyası doğrudan `src/agents/worker.ts`'in alt özelliklerini test eder (worker-edge, worker-progress, worker-feedback, worker-log, worker-doc-skip, worker-agent, worker-shutdown, worker-verify-lang). Bu "fan-out" test patternı mantıklıdır çünkü worker.ts 1,700+ satırlık büyük modüldür.

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| worker.test.ts | 1,714 | 28 | 116 | EXCELLENT | src/agents/worker.ts |
| worker-feedback.test.ts | 1,192 | 17 | 103 | EXCELLENT | src/agents/worker.ts |
| worker-ipc.test.ts | 705 | 10 | 63 | EXCELLENT | src/agents/worker-ipc.ts |
| builtin-agents.test.ts | 502 | 11 | 59 | EXCELLENT | .deckent/agents/ |
| worker-edge.test.ts | 460 | 7 | 40 | EXCELLENT | src/agents/worker.ts |
| prompt-analytics.test.ts | 337 | 12 | 29 | EXCELLENT | src/agents/prompt-analytics.ts |
| worker-verify-lang.test.ts | 321 | 3 | 20 | EXCELLENT | src/agents/worker.ts |
| prompt-ab-test.test.ts | 281 | 8 | 25 | EXCELLENT | src/agents/prompt-ab-test.ts |
| adaptive-agent.test.ts | 250 | 3 | 23 | EXCELLENT | src/agents/adaptive-agent.ts |
| cross-sprint-analyzer.test.ts | 246 | 1 | 19 | EXCELLENT | src/agents/cross-sprint-analyzer.ts |
| prompt-version.test.ts | 239 | 7 | 23 | EXCELLENT | src/agents/prompt-version.ts |
| worker-log.test.ts | 236 | 7 | 29 | EXCELLENT | src/agents/worker.ts |
| prompt-metrics.test.ts | 227 | 3 | 16 | GOOD | src/agents/prompt-metrics.ts |
| manifest-v2-validation.test.ts | 225 | 5 | 19 | EXCELLENT | .deckent/agents/ + skills/ |
| agent-genealogy.test.ts | 218 | 1 | 18 | GOOD | src/agents/agent-genealogy.ts |
| permission-guard.test.ts | 248 | 4 | 20 | EXCELLENT | src/agents/permission-guard.ts |
| prompt-rollback.test.ts | 193 | 6 | 18 | GOOD | src/agents/prompt-rollback.ts |
| agent-retirement.test.ts | 189 | 5 | 19 | GOOD | src/agents/agent-retirement.ts |
| shared-context.test.ts | 186 | 1 | 15 | GOOD | src/agents/shared-context.ts |
| worker-agent.test.ts | 177 | 3 | 10 | GOOD | src/agents/worker.ts |
| worker-doc-skip.test.ts | 169 | 5 | 17 | GOOD | src/agents/worker.ts |
| prompt-evolution.test.ts | 162 | 1 | 12 | GOOD | src/agents/prompt-evolution.ts |
| worker-shutdown.test.ts | 150 | 1 | 6 | GOOD | src/agents/worker.ts |
| specialization-drift.test.ts | 145 | 1 | 15 | GOOD | src/agents/specialization-drift.ts |
| worker-progress.test.ts | 136 | 3 | 22 | GOOD | src/agents/worker.ts |

**Key Findings:**
- ✅ **Mock discipline:** vi.mock kullanımı tutarlı — node:fs, node:child_process, stack-detector modülleri mock'lanır
- ✅ **Edge case coverage:** worker-edge.test.ts EEXIST race condition, corrupted JSON, timestamp validation test eder
- ✅ **Security testing:** permission-guard.test.ts self-modification blocking, tool escalation blocking, ADR-037 RBAC doğrular
- ✅ **No deprecated patterns:** countBrainLines, parseDebtTable kullanımı sıfır
- ⚠️ **Orphan SRC:** src/agents/index.ts barrel export'un testi yok (kabul edilebilir — barrel export'lar genellikle test edilmez)
- ⚠️ **`as any` usage:** Test helper'larda partial mock nesneleri için kullanılıyor (beklenen davranış)

**Orphan Test Analysis:**
Worker-* test dosyaları (10 adet) doğrudan `src/agents/worker.ts`'den import eder — bu dosyalar "orphan" değil, worker.ts'in feature-based test bölümleridir. builtin-agents.test.ts ve manifest-v2-validation.test.ts ise `.deckent/agents/` config dosyalarını test eder. codex-integration ve gemini-integration ise integration test'lerdir.

---

### 2. tests/providers/ (7 files, 3,123 LoC, 50 describe, 346 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| gemini.test.ts | 727 | 17 | 85 | EXCELLENT | src/providers/gemini.ts |
| subprocess.test.ts | 645 | 8 | 67 | EXCELLENT | src/providers/subprocess.ts (spawn-backend) |
| codex.test.ts | 561 | 13 | 65 | EXCELLENT | src/providers/codex.ts |
| claude.test.ts | 559 | 8 | 59 | EXCELLENT | src/providers/claude.ts |
| sandbox.test.ts | 425 | 5 | 40 | GOOD | src/providers/sandbox.ts (spawn-backend) |
| codex-integration.test.ts | 111 | 2 | 11 | GOOD | src/providers/codex.ts |
| gemini-integration.test.ts | 102 | 2 | 13 | GOOD | src/providers/gemini.ts |

**Key Findings:**
- ✅ **Full provider coverage:** Claude, Codex, Gemini — üç provider da unit + integration test'lere sahip
- ✅ **Integration tests conditional:** describe.skipIf ile CLI yoksa atlanır (flaky test önlenir)
- ✅ **Multi-backend testing:** tmux, subprocess, MCP backend switching test edilir (claude.test.ts)
- ✅ **Auth mode coverage:** API key, subscription, CLI variant detection (codex.test.ts)
- ✅ **Stream handling:** NDJSON parsing, timeout lifecycle (gemini.test.ts)
- ✅ **Security:** Sandbox constraints — memory limits, allowed directories, network blocking (sandbox.test.ts)

---

### 3. tests/scripts/ (10 files, 2,234 LoC, 57 describe, 208 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| validate-publish.test.ts | 359 | 8 | 41 | EXCELLENT | scripts/validate-publish.js |
| pre-flight-health-check.test.ts | 333 | 8 | 32 | EXCELLENT | scripts/pre-flight-health-check.mjs |
| pack-test.test.ts | 282 | 9 | 30 | EXCELLENT | scripts/pack-test.js |
| scripts.test.ts | 247 | 4 | 23 | GOOD | Shell scripts (verify-publish, changelog, bump-version) |
| prepublish.test.ts | 223 | 5 | 24 | GOOD | scripts/prepublish.js |
| publish.test.ts | 214 | 12 | 30 | EXCELLENT | scripts/publish.js |
| dead-code-audit.test.ts | 193 | 4 | 15 | GOOD | scripts/dead-code-audit.mjs |
| build-verify.test.ts | 183 | 6 | 25 | GOOD | scripts/build-verify.js |
| adr-validator.test.ts | 135 | 3 | 14 | GOOD | scripts/adr-validator.mjs |
| publish-workflow.test.ts | 75 | 1 | 13 | GOOD | .github/workflows/publish.yml |

**Key Findings:**
- ✅ **Publish pipeline fully tested:** prepublish → build-verify → validate → pack-test → publish — tam zincir
- ✅ **Real file I/O tests:** validate-publish mkdtempSync ile izole test (gerçek dosya sistemi)
- ✅ **Platform guard:** scripts.test.ts Windows'ta skipIf ile atlanır
- ✅ **ADR validation:** adr-validator.test.ts 37+ ADR parse/validate eder, ADR-036 self-referential kontrol
- ✅ **Health checks:** pre-flight-health-check tsc, vitest, brain budget, stale locks, Docker, MCP kontrol eder

---

### 4. tests/security/ (3 files, 500 LoC, 6 describe, 27 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| api-auth.test.ts | 227 | 2 | 15 | EXCELLENT | src/api/server.ts |
| lock-atomicity.test.ts | 143 | 1 | 9 | EXCELLENT | src/agents/worker.ts |
| shell-injection.test.ts | 133 | 2 | 10 | EXCELLENT | src/orchestra/tmux.ts |

**Key Findings:**
- ✅ **All EXCELLENT quality** — güvenlik testleri kritik öneme sahip ve kalite yüksek
- ✅ **Shell injection:** Tehlikeli metacharacter'ların ($(), backtick, ${}, pipe) komut argümanlarında BULUNMADIĞI doğrulanır
- ✅ **Lock atomicity:** O_EXCL flag ile atomic dosya oluşturma, race condition (EEXIST) handling
- ✅ **API auth:** Bearer token auth, 401/403 response'lar, CORS origin kısıtlaması (sadece localhost)
- ⚠️ **Küçük kategori:** Sadece 3 dosya — SQL injection (better-sqlite3) testi bu kategoride YOK (muhtemelen core/ testlerinde)

---

### 5. tests/docs/ (25 files, 2,590 LoC, 53 describe, 347 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| vitepress.test.ts | 226 | 7 | 32 | EXCELLENT | docs/.vitepress/ |
| validate-publish.test.ts | 213 | 7 | 21 | EXCELLENT | scripts/validate-publish.js |
| cli-reference.test.ts | 209 | 4 | 19 | EXCELLENT | docs/reference/cli.md |
| guide-getting-started.test.ts | 199 | 3 | 19 | EXCELLENT | docs/guide/ |
| github-pages-deploy.test.ts | 169 | 8 | 30 | EXCELLENT | .github/workflows/docs.yml |
| docs-structure.test.ts | 127 | 8 | 13 | GOOD | docs/ dizin yapısı |
| readme.test.ts | 124 | 1 | 18 | EXCELLENT | README.md |
| jsdoc.test.ts | 122 | 2 | 7 | EXCELLENT | src/ JSDoc coverage |
| release-prep.test.ts | 102 | 1 | 13 | EXCELLENT | package.json |
| release-notes-beta.test.ts | 101 | 1 | 15 | EXCELLENT | docs/release/ |
| CHANGELOG.test.ts | 94 | 2 | 10 | EXCELLENT | docs/CHANGELOG.md |
| api.test.ts | 94 | 1 | 15 | EXCELLENT | docs/reference/api.md |
| landing-page-content.test.ts | 88 | 1 | 12 | GOOD | docs/archive/ |
| skills.test.ts | 84 | 1 | 8 | EXCELLENT | docs/reference/skills.md |
| contributing.test.ts | 78 | 1 | 12 | EXCELLENT | CONTRIBUTING.md |
| agents.test.ts | 78 | 1 | 8 | EXCELLENT | docs/architecture/agents.md |
| config-reference.test.ts | 77 | 1 | 11 | GOOD | docs/reference/config-reference.md |
| agent-guide.test.ts | 74 | 1 | 6 | GOOD | docs/development/agent-guide.md |
| marketplace-guide.test.ts | 73 | 1 | 7 | GOOD | docs/reference/marketplace.md |
| quickstart.test.ts | 71 | 1 | 11 | EXCELLENT | docs/guide/quickstart.md |
| release-checklist.test.ts | 65 | 1 | 12 | GOOD | docs/release/ |
| issue-templates.test.ts | 62 | 3 | 8 | GOOD | .github/ISSUE_TEMPLATE/ |
| blueprint/files.test.ts | — | — | — | — | (see blueprint category) |
| pr-template.test.ts | 28 | 1 | 3 | BASIC | .github/pull_request_template.md |
| security.test.ts | 28 | 1 | 2 | GOOD | SECURITY.md |
| license.test.ts | 29 | 1 | 4 | GOOD | LICENSE |

**Key Findings:**
- ✅ **Documentation regression tests:** Her önemli .md dosyası için content validation testi var
- ✅ **JSDoc coverage test:** src/ kaynak dosyaların JSDoc kalitesini doğrular
- ✅ **VitePress config validation:** Sidebar, nav, theme ayarları test edilir
- ✅ **API doc parity:** 10 GET, 5 POST endpoint, 21 MCP tool, 8 MCP resource sayıları doğrulanır
- ⚠️ **Mock-free:** Sadece 1 dosya (release-notes-beta) skipIf kullanır — docs testleri genellikle dosya içerik kontrolüdür
- ⚠️ **Memory V2 docs:** Memory V2 dokümantasyon testi spesifik olarak yok (summary.md, memory.md docs test'i eksik olabilir)

---

### 6. tests/analytics/ (4 files, 819 LoC, 21 describe, 84 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| analytics-data.test.ts | 272 | 2 | 20 | EXCELLENT | Dashboard analytics |
| skill-heatmap-data.test.ts | 199 | 6 | 20 | EXCELLENT | Dashboard skill heatmap |
| success-chart-data.test.ts | 186 | 6 | 18 | EXCELLENT | Dashboard success charts |
| agent-comparison-data.test.ts | 162 | 6 | 19 | EXCELLENT | Dashboard agent comparison |

**Key Findings:**
- ✅ **All EXCELLENT** — dashboard analytics veri katmanı tamamen test edilmiş
- ✅ **Pure functions:** Mock kullanımı yok — pure fonksiyon testleri
- ✅ **Edge cases:** Boş sprint, eksik dizin, sıfır değerler test edilir
- ✅ **Immutability:** Test verisi mutasyona uğramaz

---

### 7. tests/blueprint/ (4 files, 182 LoC, 4 describe, 28 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| pull-request-template.test.ts | 54 | 1 | 8 | GOOD | .github/pull_request_template.md |
| sprint-history.test.ts | 50 | 1 | 9 | GOOD | DECKENT-MASTER-BLUEPRINT.md |
| security-md.test.ts | 41 | 1 | 6 | GOOD | SECURITY.md |
| files.test.ts | 37 | 1 | 7 | GOOD | AGENTS.md, api-surface.md, IDENTITY.md |

**Key Findings:**
- ✅ Blueprint dosyalarının yapısal doğrulaması
- ⚠️ **Küçük LoC:** Toplam 182 satır — daha derinlemesine content validation eklenebilir

---

### 8. tests/brain/ (1 file, 98 LoC, 1 describe, 15 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| decisions.test.ts | 98 | 1 | 15 | EXCELLENT | .brain/DECISIONS.md |

**Key Findings:**
- ✅ ADR format doğrulama (21+ ADR), Context/Decision/Consequence section kontrolü
- ⚠️ **Sadece 1 dosya:** .brain/ dizininin diğer dosyaları (MEMORY.md, RETRO.md, PATTERNS.md) için test YOK
- ⚠️ **Memory V2 farkındalığı:** Bu test .brain/DECISIONS.md'yi doğrudan parse eder — Memory V2'de bu dosya artık archive olmalı (DB-first)

---

### 9. tests/config/ (1 file, 46 LoC, 4 describe, 5 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| isolation.test.ts | 46 | 4 | 5 | GOOD | tsconfig.json, vitest.config.ts, .gitignore |

**Key Findings:**
- ✅ Dashboard build izolasyonu doğrulanır
- ⚠️ **Minimal:** Sadece 5 test — config merge (3-layer), config-migration testleri bu kategoride değil (core/ testlerinde)

---

### 10. tests/docker/ (1 file, 93 LoC, 2 describe, 17 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| dockerfile.test.ts | 93 | 2 | 17 | GOOD | Dockerfile, docker-compose.yml |

**Key Findings:**
- ✅ Dockerfile yapısal doğrulama (node:22-slim, tmux/git kurulumu)
- ✅ docker-compose.yml volume ve healthcheck kontrolü
- ⚠️ **Container security:** Non-root user kontrolü eksik olabilir (rapor agent'ı bunu Task 40'ta inceleyecek)

---

### 11. tests/extensions/ (1 file, 139 LoC, 1 describe, 14 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| vscode/extension.test.ts | 139 | 5 | 16 | EXCELLENT | src/extensions/vscode/extension.ts |

**Key Findings:**
- ✅ VS Code extension lifecycle (activate/deactivate), command registration, status bar item
- ✅ Mock setup helper'ları (makeStatusBarItem, makeVsCodeApi, makeContext)
- ✅ Subscription yönetimi doğrulanır

---

### 12. tests/github/ (5 files, 842 LoC, 35 describe, 138 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| workflows/release.test.ts | 212 | 8 | 36 | EXCELLENT | .github/workflows/release.yml |
| .github-files.test.ts | 206 | 3 | 31 | EXCELLENT | .github/ security template, FUNDING.yml |
| ci-workflow.test.ts | 200 | 6 | 27 | EXCELLENT | .github/workflows/ci.yml |
| dependabot.test.ts | 124 | 4 | 16 | EXCELLENT | .github/dependabot.yml |
| workflows/ci.test.ts | 100 | 4 | 13 | GOOD | .github/workflows/ci.yml |

**Key Findings:**
- ✅ **CI/CD pipeline fully tested:** ci.yml, release.yml, docs.yml, publish.yml — tüm workflow'lar
- ✅ **OIDC permissions:** Release workflow'da npm provenance, access controls doğrulanır
- ✅ **Dependabot config:** Version pinning, schedule, commit prefix, label, ignore config
- ✅ **Security template:** Vulnerability types, CVSS ranges, impact assessment, responsible disclosure
- ⚠️ **Overlap:** ci.test.ts ve ci-workflow.test.ts aynı dosyayı test eder — farklı yönlere odaklanırlar

---

### 13. tests/helpers/ (2 files, 198 LoC, 8 describe, 36 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| platform.test.ts | 107 | 5 | 11 | GOOD | Test helper: platform detection |
| paths.test.ts | 91 | 4 | 15 | EXCELLENT | Test helper: path normalization |

**Key Findings:**
- ✅ Test yardımcı modüllerinin kendileri test edilmiş
- ✅ Platform detection (Windows, Unix, WSL), temp dir oluşturma
- ✅ Path normalization, backslash→forward slash, joinUnix

---

### 14. tests/load/ (1 file, 479 LoC, 5 describe, 8 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| load-harness.test.ts | 479 | 5 | 8 | EXCELLENT | Performance microbenchmark harness |

**Key Findings:**
- ✅ **Microbenchmark harness:** loadConfig, task claim/release, Map vs Array lookup, AST scanning
- ✅ **Percentile computation:** P50/P95/P99 nanosecond-to-millisecond conversion
- ✅ **Performance baseline:** Hot path regression detection için kullanılabilir
- ⚠️ **Az test sayısı:** 8 it block — ama her biri uzun benchmark döngüsü çalıştırır

---

### 15. tests/skills/ (1 file, 643 LoC, 12 describe, 86 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| builtin-skills.test.ts | 643 | 12 | 86 | EXCELLENT | .deckent/skills/ (10 skill) |

**Key Findings:**
- ✅ 10 built-in skill kapsamlı test: typescript-expert, react-specialist, python-expert, api-builder, database-migration, testing-expert, documentation-writer, security-specialist, performance-optimizer, devops-engineer
- ✅ Manifest field validation, category kontrolü, trigger matching, stack detection
- ✅ Cross-cutting: semver versioning, stats shape, self-reference prevention
- ⚠️ **11 skill eksik:** 21 built-in skill'den sadece 10'u test edilmiş. Eksikler: ci-testing, accessibility-expert, anthropic-sdk, code-simplifier, docker-expert, frontend-design, git-expert, graphql-expert, migration-expert, monorepo-expert, system-architect

---

### 16. tests/smoke/ (1 file, 52 LoC, 1 describe, 4 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| verify-loop-smoke.test.ts | 52 | 1 | 4 | GOOD | src/orchestra/task-builder.ts |

**Key Findings:**
- ✅ Worker verify loop prompt generation: tsc --noEmit, npx vitest run, CRITICAL VERIFY STEPS
- ⚠️ **Minimal:** Sadece 4 test — smoke test olarak yeterli ama daha fazla smoke test eklenebilir

---

### 17. tests/unit/ (5 files, 1,092 LoC, 30 describe, 61 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| sprint-utils.test.ts | 284 | 7 | 26 | EXCELLENT | src/orchestra/sprint-utils.ts |
| spawn-backend-docker.test.ts | 228 | 3 | 11 | EXCELLENT | src/orchestra/spawn-backend-docker.ts |
| promotion-pipeline.test.ts | 213 | 4 | 14 | EXCELLENT | src/orchestra/promotion-pipeline.ts |
| mid-sprint-adapter.test.ts | 200 | 2 | 6 | EXCELLENT | src/orchestra/mid-sprint-adapter.ts |
| heartbeat-daemon.test.ts | 167 | 3 | 10 | EXCELLENT | src/orchestra/heartbeat-daemon.ts |

**Key Findings:**
- ✅ **All EXCELLENT** — kritik orchestra modülleri tamamen test edilmiş
- ✅ Docker graceful shutdown (docker stop → fallback → kill)
- ✅ Promotion/demotion pipeline: built-in rejection, temp pool promotion
- ✅ Mid-sprint rerouting: shouldReroute, applyReroute, max attempt limiting
- ✅ Heartbeat daemon lifecycle (start/stop), PID file management
- ⚠️ **Naming convention:** Bu testler tests/orchestra/ altında da olabilirdi — tests/unit/ içindeki yerleşimleri biraz belirsiz

---

### 18. tests/workflows/ (1 file, 133 LoC, 2 describe, 24 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| publish.test.ts | 133 | 2 | 19 | EXCELLENT | .github/workflows/publish.yml, release.yml |

**Key Findings:**
- ✅ Publish workflow trigger, OIDC permissions, npm ci, build, test, dry-run, publish
- ✅ NODE_AUTH_TOKEN environment variable, registry-url configuration
- ⚠️ **Overlap:** tests/github/workflows/release.test.ts ile bazı testler örtüşür

---

### 19. tests/audits/ (1 file, 233 LoC, 3 describe, 18 it/test)

| File | LoC | describe | it/test | Quality | Maps To |
|------|-----|----------|---------|---------|---------|
| dead-code-decisions.test.ts | 233 | 3 | 18 | EXCELLENT | docs/audits/sprint-139/dead-code-decisions.md |

**Key Findings:**
- ✅ Dead-code audit kararları: 11 modül (6 dead + 4 dormant + 1 false positive)
- ✅ ADR-038 MADR v3 format doğrulaması
- ✅ Decision categories: Remove 3, Defer 3, Deprecate 4, False Positive 1

---

## Cross-Cutting Analysis

### A. Mock Pattern Distribution

| Pattern | Files | Percentage |
|---------|-------|------------|
| vi.mock() | 30 | 30% |
| vi.fn() | 28 | 28% |
| vi.spyOn() | 2 | 2% |
| Real file I/O (mkdtemp/rmSync) | 15 | 15% |
| No mocks (pure functions/file read) | 42 | 42% |

**Mock discipline iyi:** Modül sınırlarında mock (node:fs, node:child_process), test edilen koda hiç mock uygulanmıyor. Mock temizliği beforeEach/afterEach ile yapılıyor.

### B. Type Safety

| Issue | Count |
|-------|-------|
| `as any` casts | 50 |
| `: any` annotations | 13 |
| @ts-ignore | 0 |
| @ts-expect-error | 7 |

**Yorum:** `as any` kullanımı çoğunlukla partial mock nesneleri için (örn. `{ workerId: 'w-001' } as any` şeklinde tam TaskConfig yerine minimal mock). Test kodunda kabul edilebilir ama `Partial<T>` veya helper factory pattern ile azaltılabilir.

### C. Conditional Execution (skipIf)

| File | Condition | Reason |
|------|-----------|--------|
| gemini-integration.test.ts | !hasGemini | Gemini CLI yoksa atla |
| codex-integration.test.ts | !codexAvailable | Codex CLI yoksa atla |
| scripts.test.ts (5 occurrence) | isWindows, !canBuild | Windows'ta veya build yoksa atla |
| release-notes-beta.test.ts | !fileExists | Release notes dosyası yoksa atla |

**İyi uygulama:** Integration testler conditional execution ile flaky test önleniyor.

### D. Deprecated Pattern Check (Memory V2 Uyumu)

| Pattern | Occurrences | Status |
|---------|-------------|--------|
| countBrainLines | 0 | ✅ TEMİZLENMİŞ |
| parseDebtTable | 0 | ✅ TEMİZLENMİŞ |
| generateDebtTable | 0 | ✅ TEMİZLENMİŞ |
| MemoryStore import | 0 | N/A (bu katmanda beklenen) |
| readFileSync + DECISIONS.md parse | 1 (brain/decisions.test.ts) | ⚠️ ESKİ PATTERN |

### E. Orphan Analysis

**Orphan Tests (test dosyası var, doğrudan src eşleşmesi yok):**
- tests/agents/worker-*.test.ts (10 dosya) → Hepsi src/agents/worker.ts import eder — feature-based bölüm, orphan DEĞİL
- tests/agents/builtin-agents.test.ts → .deckent/agents/ test eder — config validation test
- tests/agents/manifest-v2-validation.test.ts → .deckent/ manifest'leri test eder
- tests/providers/codex-integration.test.ts → Integration test
- tests/providers/gemini-integration.test.ts → Integration test
- tests/docs/* → Dokümantasyon dosyalarını test eder
- tests/blueprint/* → Blueprint dosyalarını test eder
- tests/github/* → GitHub config dosyalarını test eder

**Sonuç:** Gerçek orphan test SIFIR — tüm "orphan" gibi görünen dosyalar aslında config/doc validation veya feature-based test bölümleridir.

**Orphan SRC (kaynak dosya var, hiç test yok — bu kategorilerde):**
- src/agents/index.ts → Barrel export, test gereksiz

---

## Quality Summary

| Category | Files | LoC | Avg Quality | Key Strength |
|----------|-------|-----|-------------|--------------|
| agents | 25 | 8,908 | EXCELLENT | Worker feature fan-out, edge cases |
| providers | 7 | 3,123 | EXCELLENT | Multi-provider, integration tests |
| scripts | 10 | 2,234 | GOOD-EXC | Publish pipeline, real file I/O |
| security | 3 | 500 | EXCELLENT | Shell injection, lock atomicity, API auth |
| docs | 25 | 2,590 | GOOD-EXC | Content validation, JSDoc coverage |
| analytics | 4 | 819 | EXCELLENT | Pure function testing, immutability |
| blueprint | 4 | 182 | GOOD | Structural validation |
| brain | 1 | 98 | EXCELLENT | ADR format validation |
| config | 1 | 46 | GOOD | Build isolation |
| docker | 1 | 93 | GOOD | Dockerfile structural validation |
| extensions | 1 | 139 | EXCELLENT | VS Code lifecycle |
| github | 5 | 842 | EXCELLENT | CI/CD pipeline coverage |
| helpers | 2 | 198 | GOOD-EXC | Platform detection, path normalization |
| load | 1 | 479 | EXCELLENT | Performance benchmarking |
| skills | 1 | 643 | EXCELLENT | 10/21 built-in skill validation |
| smoke | 1 | 52 | GOOD | Verify loop prompt |
| unit | 5 | 1,092 | EXCELLENT | Critical orchestra modules |
| workflows | 1 | 133 | EXCELLENT | Publish workflow validation |
| audits | 1 | 233 | EXCELLENT | Dead code audit decisions |

---

## Findings: P0-P3 Severity

### P0 — Critical
_Yok._

### P1 — High
1. **tests/brain/decisions.test.ts Memory V2 uyumsuzluğu:** .brain/DECISIONS.md'yi doğrudan parse eder — Memory V2'de bu dosya archive'a taşınmış olmalı, testler DB-first'e güncellenmeli
2. **skills/ coverage gap:** 21 built-in skill'den sadece 10'u test edilmiş — 11 skill testi eksik

### P2 — Medium
3. **`as any` cast sayısı yüksek (50):** Test helper factory pattern veya Partial<T> ile azaltılabilir
4. **tests/unit/ naming convention:** Bu testler tests/orchestra/ altında da olabilirdi — karışıklık potansiyeli
5. **tests/github/ overlap:** ci.test.ts ve ci-workflow.test.ts aynı dosyayı test eder
6. **tests/workflows/ ve tests/github/workflows/ overlap:** publish.test.ts ve release.test.ts kısmen örtüşür
7. **Memory V2 docs testi eksik:** .brain/exports/summary.md, memory.md, decisions.md, debt.md content validation testi yok

### P3 — Low
8. **tests/blueprint/ minimal LoC:** 182 satır — daha derin content validation eklenebilir
9. **tests/smoke/ minimal:** Sadece 1 dosya, 4 test — daha fazla smoke test eklenebilir
10. **tests/config/ minimal:** Sadece 1 dosya, 5 test
11. **@ts-expect-error 7 kullanım:** Her biri incelenmeli (negatif tip testi mi, hack mi?)

---

## Sprint 142+ Recommendations

1. **P1 — Memory V2 Test Migration:** tests/brain/decisions.test.ts DB-first'e güncellenmeli — MemoryStore mock ile ADR query test etmeli
2. **P1 — Missing Skill Tests:** 11 eksik skill için builtin-skills.test.ts'e ek test blokları eklenmeli
3. **P2 — Test Consolidation:** tests/unit/ dosyaları tests/orchestra/ altına taşınabilir veya naming convention belgelenmeli
4. **P2 — as any Reduction:** Test helper factory fonksiyonları oluşturulmalı (makeTask, makeResult, makeConfig)
5. **P2 — Memory V2 Export Tests:** .brain/exports/ dosyaları için content validation test'leri eklenmeli
6. **P3 — Smoke Test Expansion:** Login/sprint/MCP lifecycle smoke testleri eklenebilir

---

## Verdict: ANALYZED

**Overall Health Score: 88/100**
- Test coverage genişliği: 92/100 (99 dosya, 22K+ satır, 2,267 test case)
- Mock discipline: 95/100 (temiz modül sınırı mock'lama, iç mock yok)
- Deprecated pattern temizliği: 100/100 (sıfır deprecated usage)
- Memory V2 uyumu: 70/100 (brain/decisions.test.ts eski pattern, export testleri eksik)
- Edge case coverage: 90/100 (güvenlik, atomicity, race condition testleri mükemmel)
- Type safety: 80/100 (`as any` azaltılabilir ama @ts-ignore sıfır)

---

_Analysis completed: 2026-04-16 | Model: opus | Files analyzed: 99 | Lines analyzed: 22,404_
