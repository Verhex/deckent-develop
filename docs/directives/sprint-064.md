# DIRECTIVES — Sprint 064: Git Auto-Workflow

## Goal: Branch-per-sprint, auto-commit-per-task, sprint PR oluşturma. Git workflow otomasyonu.

---

## Task 1: Branch-per-Sprint
- Model: opus
- Effort: high
- Files: src/orchestra/git-workflow.ts (new), src/orchestra/sprint-controller.ts
- Scope: src/orchestra/

### Description
Sprint başladığında otomatik branch oluştur: `deckent/sprint-{id}`. Config: `git_auto_branch: true/false` (default: false — backward compat). Sprint tamamlandığında main'e merge önerisi. Dirty working tree handle: stash → branch → pop.
10+ test.

---

## Task 2: Auto-Commit-per-Task
- Model: sonnet
- Effort: normal
- Files: src/orchestra/git-workflow.ts, src/agents/worker.ts
- Scope: src/orchestra/, src/agents/

### Description
Her task tamamlandığında otomatik commit: `deckent(sprint-051): Task 1 - Add login endpoint`. Conventional commits format. Scope: task'ın scope.directories'i. Config: `git_auto_commit: true/false`. Sadece DONE veya GO_WITH_TECH_DEBT task'lar commit edilir.
8+ test.

---

## Task 3: Sprint PR Generator
- Model: sonnet
- Effort: normal
- Files: src/integrations/github-pr.ts (new)
- Scope: src/integrations/

### Description
Sprint tamamlandığında PR oluştur (gh CLI). Title: `deckent(sprint-051): npm Publish + README Overhaul`. Body: task listesi (checkbox), metrics (coverage, test count), RETRO özeti, files changed. Draft PR default. Config: `github_auto_pr: true/false`.
5+ test.

---

## Task 4: Merge Conflict Detection
- Model: sonnet
- Effort: normal
- Files: src/orchestra/git-workflow.ts
- Scope: src/orchestra/

### Description
Sprint sırasında main branch'te değişiklik olursa: rebase attempt, conflict varsa alert. Auditor'a merge conflict detection ekle. Dashboard'da "merge conflict" uyarısı.
5+ test.

---

## Quality Rules
- Branch naming consistent
- Commit messages conventional
- PR template populated
- Conflict detection false positive < %5
