# DIRECTIVES — Sprint 054: Self-Healing Completion (6 NO_GO Recovery)

## Goal: Sprint 053'teki 6 NO_GO task'ı tamamla. Her task KÜÇÜK ve ODAKLI. Worker test VE implementation birlikte yazmalı.

---

## Task 1: Agent Activation — systemPrompt + Worker Injection
- Model: opus
- Effort: high
- Files: src/agents/worker.ts, src/orchestra/sprint-controller.ts, src/core/agent-pool.ts
- Scope: src/agents/, src/orchestra/, src/core/, .deckent/agents/, tests/orchestra/

### Description
8 agent tanımlı ama runtime'da kullanılmıyor. 3 iş:

**A) Agent JSON'lara systemPrompt ekle:**
`.deckent/agents/*/agent.json` dosyalarına `systemPrompt` string alanı ekle. Her agent için 100-200 kelime domain-specific prompt. Örnek:
- security-auditor: "You are a security expert. Focus on OWASP top 10, injection vulnerabilities, auth issues..."
- test-writer: "You are a testing expert. Write comprehensive unit/integration tests, aim for edge cases..."
- doc-writer: "You are a documentation expert. Write clear, concise docs with examples..."
- bug-fixer: "You are a bug-fixing expert. Read error logs, trace root cause, fix with minimal changes..."
- code-reviewer: "You are a code reviewer. Check for bugs, performance, readability, security..."
- refactorer: "You are a refactoring expert. Improve code structure without changing behavior..."
- api-builder: "You are an API expert. Design RESTful APIs, validate inputs, handle errors..."
- performance-analyzer: "You are a performance expert. Profile bottlenecks, optimize hot paths..."

**B) Worker'a agent context injection:**
`src/agents/worker.ts`'da worker spawn edilirken, task'a atanan agent'ın `systemPrompt` + `expertise` bilgisini worker context'e ekle. `buildWorkerPrompt()` veya benzeri fonksiyona agent prefix ekle.

**C) Agent stats güncelleme:**
Sprint sonrası `updateAgentStats()` çağrısı: `totalUses++`, `successRate` hesapla. `src/core/agent-pool.ts`'deki mevcut `AgentPoolManager`'ı kullan.

**Test:** tests/orchestra/agent-activation.test.ts — 8+ test (systemPrompt varlığı, injection, stats update)

IMPORTANT: Test VE implementasyon birlikte yazılmalı. Sadece test yazmak NO_GO sebebidir.

---

## Task 2: Brain Self-Learning — Config Suggestions + Pattern Detection
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-reporter.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Brain sprint sonrası kendi performansını analiz edemiyor. `src/orchestra/sprint-reporter.ts`'e 4 fonksiyon ekle:

**A) `generateConfigSuggestions(sprintResult)` → ConfigSuggestion[]**
- NO_GO rate > %50 → "brain_planning mode değiştir" önerisi
- Coverage < %40 → "testing skill'ini aktifleştir" önerisi
- Duration > 1 saat → "max_workers artır" önerisi
- Return: `{ field: string, currentValue: any, suggestedValue: any, reason: string }[]`

**B) `detectRecurringFileErrors(projectRoot, sprintResults[])` → string[]**
- Son 3 sprint'teki NO_GO task'ların dosyalarını topla
- 3+ sprint'te aynı dosyada hata → recurring file
- Return: recurring file path listesi

**C) `addRecurringPatternsToFile(projectRoot, recurringFiles)` → number**
- Recurring file'ları `.brain/PATTERNS.md`'ye ekle (mevcut format: JSON array of PatternEntry)
- Return: eklenen pattern sayısı

**D) `buildBrainInsights(sprintResult, configSuggestions, recurringFiles)` → string**
- Sprint sonuç raporu için "Brain Insights" text bloku oluştur
- Markdown format, 5-10 satır

**Test:** tests/orchestra/brain-self-learning.test.ts — 10+ test (her fonksiyon için 2-3 test)

IMPORTANT: Test VE implementasyon birlikte yazılmalı. `export` ile dışarı açılmalı.

---

## Task 3: Rich Sprint Output + README Update
- Model: sonnet
- Effort: normal
- Files: src/cli/helpers/sprint-summary-rich.ts, README.md
- Scope: src/cli/, tests/cli/, README.md

### Description
Sprint çıktısı yetersiz, README güncel değil. 2 iş:

**A) Rich Sprint Output:**
`src/cli/helpers/sprint-summary-rich.ts`'deki `formatRichSprintSummary()`'yi genişlet:
- Task-by-task tablo ekle: `| ID | Title | Status | Agent | Duration |`
- GO/NO_GO/TECH_DEBT sayıları ayrı satırda
- Config migration mesajı (eğer yapıldıysa)
- Brain insights bölümü (buildBrainInsights'tan gelen text)
Mevcut fonksiyonu boz**MA** — sadece yeni bölümler ekle.

**B) README.md CLI Komut Tablosu:**
README.md'deki CLI komut tablosunu güncelle. Eksik komutları ekle: explain, quick-start, skill, skill-marketplace, agent, review, finalize, config migrate. Mevcut 28 → 33+ komut.

**Test:** tests/cli/rich-output.test.ts — 8+ test (tablo format, komut sayısı)

---

## Task 4: docs/ Reorganization + .claude/rules/ Update
- Model: sonnet
- Effort: normal
- Files: docs/ altındaki dosyalar, .claude/rules/brain.md, .claude/rules/worker-default.md, .claude/rules/auditor.md
- Scope: docs/, .claude/rules/, tests/docs/

### Description
docs/ dağınık (38 dosya root'ta), rules güncel değil. 2 iş:

**A) docs/ Reorganization:**
Mevcut docs/ dosyalarını kategorilere ayır:
```
docs/
├── guide/          → getting-started.md, first-sprint.md, concepts.md
├── reference/      → cli.md, api.md, config-reference.md, mcp-guide.md
├── architecture/   → ARCHITECTURE.md, AGENT-SKILL-ARCHITECTURE.md
├── development/    → CONTRIBUTING.md, PLUGIN-GUIDE.md, WORKER-GUIDE.md
├── release/        → CHANGELOG.md, RELEASE-NOTES-BETA.md, ROADMAP.md
├── directives/     → (mevcut, dokunma)
├── .vitepress/     → (mevcut, dokunma)
```
Dosyaları `mv` ile taşı. README.md'deki docs linklerini güncelle. VitePress sidebar'ı güncelle (docs/.vitepress/config.ts).

**B) .claude/rules/ Update:**
- `brain.md`: Agent selection + skill injection + self-critique kuralları ekle
- `worker-default.md`: Skill context kullanımı kuralı ekle
- `auditor.md`: Agent/skill usage monitoring kuralı ekle

**Test:** tests/docs/docs-structure.test.ts — 5+ test (directory structure, link validity)

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression (10,495 test geçmeli)
- Her task test VE implementasyon birlikte yazmalı — sadece test yazmak KABUL EDİLMEZ
