# DIRECTIVES — Sprint 064: GitHub Issue Mode

## Goal: `deckent do --issue 42` → GitHub issue'yu oku, sprint başlat. "Projeyi al götür" deneyiminin temeli.

---

## Task 1: GitHub Issue Reader
- Model: opus
- Effort: high
- Files: src/integrations/github.ts (new), src/core/issue-types.ts (new)
- Scope: src/integrations/, src/core/

### Description
GitHub API ile issue oku (gh CLI veya REST API). Issue → structured format: title, body, labels, comments, linked PRs. `GITHUB_TOKEN` env var ile auth. Rate limiting handle. Public repo'lar için token opsiyonel.
8+ test.

---

## Task 2: Issue-to-DIRECTIVES Converter
- Model: opus
- Effort: high
- Files: src/orchestra/issue-to-directives.ts (new)
- Scope: src/orchestra/

### Description
GitHub issue'yu DIRECTIVES.md formatına çevir. Label-based model selection: `bug` → sonnet, `feature` → opus, `docs` → haiku. Body'den scope inference (dosya adları, modül isimleri tespit et). Multi-issue support: `deckent do --issue 42,43,44` → tek sprint.
10+ test.

---

## Task 3: `deckent do` CLI Command
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/do.ts (new)
- Scope: src/cli/

### Description
`deckent do "description"` → inline sprint (mevcut zero-config mode genişletmesi). `deckent do --issue 42` → GitHub issue mode. `deckent do --file TODO.md` → dosyadan oku. Tüm modları planner'a yönlendir. `--auto-approve` flag.
8+ test.

---

## Task 4: Sprint Result → GitHub Comment
- Model: sonnet
- Effort: normal
- Files: src/integrations/github-reporter.ts (new)
- Scope: src/integrations/

### Description
Sprint tamamlandığında GitHub issue'ya yorum yaz: task listesi, GO/NO_GO sonuçları, değişen dosyalar, coverage. `gh issue comment` veya REST API. Config: `github_auto_comment: true/false`.
5+ test.

---

## Quality Rules
- `gh` CLI veya REST API ile çalışır (ikisi de desteklenmeli)
- Rate limiting handle edilmeli
- Token yoksa public repo'lar hala çalışmalı
