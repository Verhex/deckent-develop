# DIRECTIVES — Sprint 101: Automation Suite — Epic Planner + Git Workflow + GitHub Issue Mode

## Goal: Deckent'i tam otonom hale getir: büyük hedefleri çoklu sprint'e böl (Epic), her sprint'i git branch/commit/PR ile yönet, GitHub issue'dan doğrudan sprint başlat. `deckent start --epic "Build e-commerce"` + `deckent do --issue 42` + auto-branch/commit/PR. Her task test VE implementasyon birlikte.

---

## Task 1: Epic Planner — Büyük Hedefi Alt-Sprint'lere Böl
- Model: opus
- Effort: high
- Files: src/orchestra/epic-planner.ts (new), src/core/epic-types.ts (new)
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
`EpicPlanner` class: büyük hedefi alt-sprint'lere böl. Input: natural language goal + project analysis. Output: EpicPlan { sprints: SprintGoal[], dependencies: string[][], estimatedTotal: number }. AI planner'ı kullan (mevcut planner.ts pattern). Zod validation. Max 10 sprint per epic.

**Test:** 10+ test.

---

## Task 2: Sequential Sprint Executor — Epic Sıralı Çalıştırma
- Model: opus
- Effort: high
- Files: src/orchestra/epic-executor.ts (new), src/orchestra/sprint-controller.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
EpicPlan'ı sırayla execute et: Sprint 1 → evaluate → Sprint 2 → ... Her sprint arası MEMORY güncelle. Önceki sprint'in sonuçlarını sonraki sprint'in context'ine ekle. Pause/resume epic level. `deckent start --epic "Build e-commerce site"`.

**Test:** 10+ test.

---

## Task 3: Epic Progress Tracking + Dashboard
- Model: sonnet
- Effort: normal
- Files: src/orchestra/epic-tracker.ts (new), src/api/server.ts
- Scope: src/orchestra/, src/api/, tests/

### Description
Epic durumunu .deckent/epics/{id}.json'a kaydet. API endpoint: GET /api/epic/{id} → progress. Dashboard'da epic view (sprint listesi, overall progress). `deckent status --epic` komutu.

**Test:** 5+ test.

---

## Task 4: Cross-Sprint Context — Sprint N → N+1 Bağlam Aktarımı
- Model: sonnet
- Effort: normal
- Files: src/orchestra/cross-sprint-context.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint N'in sonuçlarını Sprint N+1'in DIRECTIVES'ine otomatik ekle: "Önceki sprint'te Auth tamamlandı, şimdi Products üzerine çalış. Auth modülü src/auth/ altında, JWT token formatı: ...". MEMORY + git diff + task results birleştir.

**Test:** 5+ test.

---

## Task 5: Branch-per-Sprint — Otomatik Git Branch
- Model: opus
- Effort: high
- Files: src/orchestra/git-workflow.ts (new), src/orchestra/sprint-controller.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint başladığında otomatik branch oluştur: `deckent/sprint-{id}`. Config: `git_auto_branch: true/false` (default: false — backward compat). Sprint tamamlandığında main'e merge önerisi. Dirty working tree handle: stash → branch → pop.

**Test:** 10+ test.

---

## Task 6: Auto-Commit-per-Task — Conventional Commits
- Model: sonnet
- Effort: normal
- Files: src/orchestra/git-workflow.ts, src/agents/worker.ts
- Scope: src/orchestra/, src/agents/, tests/

### Description
Her task tamamlandığında otomatik commit: `deckent(sprint-051): Task 1 - Add login endpoint`. Conventional commits format. Scope: task'ın scope.directories'i. Config: `git_auto_commit: true/false`. Sadece DONE veya GO_WITH_TECH_DEBT task'lar commit edilir.

**Test:** 8+ test.

---

## Task 7: Sprint PR Generator — Otomatik Pull Request
- Model: sonnet
- Effort: normal
- Files: src/integrations/github-pr.ts (new)
- Scope: src/integrations/, tests/

### Description
Sprint tamamlandığında PR oluştur (gh CLI). Title: `deckent(sprint-051): npm Publish + README Overhaul`. Body: task listesi (checkbox), metrics (coverage, test count), RETRO özeti, files changed. Draft PR default. Config: `github_auto_pr: true/false`.

**Test:** 5+ test.

---

## Task 8: Merge Conflict Detection — Sprint İçi Çakışma Tespiti
- Model: sonnet
- Effort: normal
- Files: src/orchestra/git-workflow.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint sırasında main branch'te değişiklik olursa: rebase attempt, conflict varsa alert. Auditor'a merge conflict detection ekle. Dashboard'da "merge conflict" uyarısı.

**Test:** 5+ test.

---

## Task 9: GitHub Issue Reader — Issue'dan Veri Çekme
- Model: opus
- Effort: high
- Files: src/integrations/github.ts (new), src/core/issue-types.ts (new)
- Scope: src/integrations/, src/core/, tests/

### Description
GitHub API ile issue oku (gh CLI veya REST API). Issue → structured format: title, body, labels, comments, linked PRs. `GITHUB_TOKEN` env var ile auth. Rate limiting handle. Public repo'lar için token opsiyonel.

**Test:** 8+ test.

---

## Task 10: Issue-to-DIRECTIVES Converter — Issue'dan Sprint Planı
- Model: opus
- Effort: high
- Files: src/orchestra/issue-to-directives.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
GitHub issue'yu DIRECTIVES.md formatına çevir. Label-based model selection: `bug` → sonnet, `feature` → opus, `docs` → haiku. Body'den scope inference (dosya adları, modül isimleri tespit et). Multi-issue support: `deckent do --issue 42,43,44` → tek sprint.

**Test:** 10+ test.

---

## Task 11: `deckent do` CLI Command — Tek Komutla Sprint
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/do.ts (new)
- Scope: src/cli/, tests/cli/

### Description
`deckent do "description"` → inline sprint (mevcut zero-config mode genişletmesi). `deckent do --issue 42` → GitHub issue mode. `deckent do --file TODO.md` → dosyadan oku. Tüm modları planner'a yönlendir. `--auto-approve` flag.

**Test:** 8+ test.

---

## Task 12: Sprint Result → GitHub Comment — Otomatik Rapor
- Model: sonnet
- Effort: normal
- Files: src/integrations/github-reporter.ts (new)
- Scope: src/integrations/, tests/

### Description
Sprint tamamlandığında GitHub issue'ya yorum yaz: task listesi, GO/NO_GO sonuçları, değişen dosyalar, coverage. `gh issue comment` veya REST API. Config: `github_auto_comment: true/false`.

**Test:** 5+ test.

---

## Quality Rules
- Epic plan Zod-validated, cross-sprint MEMORY tutarlı
- Branch naming consistent, commit messages conventional
- PR template populated, conflict detection false positive < %5
- `gh` CLI veya REST API ile çalışır (ikisi de desteklenmeli)
- Rate limiting handle edilmeli, token yoksa public repo'lar hala çalışmalı
- %100 GO hedefli
