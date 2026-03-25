# DIRECTIVES — Sprint 056: Continuous Watch Mode

## Goal: `deckent watch --act` → Repo'yu izle, ne yapılması gerektiğini öner, onay al, sprint çalıştır. "Yaşayan organizma" deneyimi.

---

## Task 1: Repository Analyzer (Continuous)
- Model: opus
- Effort: high
- Files: src/orchestra/repo-analyzer.ts (new)
- Scope: src/orchestra/

### Description
Repo'yu periyodik analiz et (her 5 dakika veya file change): open TODO/FIXME sayısı, test coverage trend, stale branches, dependency updates, open issues (GitHub API). Her analiz sonucu "suggestion" listesi oluştur.
8+ test.

---

## Task 2: Suggestion Engine
- Model: opus
- Effort: high
- Files: src/orchestra/suggestion-engine.ts (new), src/core/suggestion-types.ts (new)
- Scope: src/orchestra/, src/core/

### Description
Repo analysis + MEMORY + PATTERNS'tan sprint önerileri üret. Priority scoring: TODO count (high), coverage drop (critical), dependency update (low). Suggestion format: { title, description, priority, estimatedEffort, suggestedModel }. Max 5 suggestion at a time.
8+ test.

---

## Task 3: Watch Mode CLI
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/watch.ts (modify), src/cli/commands/continuous.ts (new)
- Scope: src/cli/

### Description
`deckent watch --act` → sürekli izle + öner + onayla + çalış döngüsü. Interactive: "3 öneri var: 1) Fix 5 TODO, 2) Update deps, 3) Increase coverage. Hangisini yapayım? [1/2/3/all/skip]". `--auto` mode: priority > HIGH olanları otomatik çalıştır.
8+ test.

---

## Task 4: Watch Dashboard Integration
- Model: sonnet
- Effort: normal
- Files: src/api/server.ts, src/dashboard/ (modify)
- Scope: src/api/, src/dashboard/

### Description
Web dashboard'da "Suggestions" tab. Real-time suggestion listesi, one-click sprint başlatma. SSE ile live update. Suggestion history (kabul/red edilen öneriler).
5+ test.

---

## Quality Rules
- Watch mode CPU < %5 idle
- Suggestion kalitesi: false positive < %20
- Auto mode güvenli (destructive action yok)
