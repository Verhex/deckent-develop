# DIRECTIVES — Sprint 102: Platform — Continuous Watch Mode + Community Infrastructure

## Goal: Deckent'i yaşayan organizmaya çevir: repo'yu sürekli izle, öneri üret, onayla, sprint çalıştır. Aynı zamanda açık kaynak topluluk altyapısını kur (GitHub Discussions, CONTRIBUTING overhaul, Discord webhook, label system). Her task test VE implementasyon birlikte.

---

## Task 1: Repository Analyzer (Continuous) — Periyodik Repo Analizi
- Model: opus
- Effort: high
- Files: src/orchestra/repo-analyzer.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Repo'yu periyodik analiz et (her 5 dakika veya file change): open TODO/FIXME sayısı, test coverage trend, stale branches, dependency updates, open issues (GitHub API). Her analiz sonucu "suggestion" listesi oluştur.

**Test:** 8+ test.

---

## Task 2: Suggestion Engine — Akıllı Sprint Önerisi
- Model: opus
- Effort: high
- Files: src/orchestra/suggestion-engine.ts (new), src/core/suggestion-types.ts (new)
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Repo analysis + MEMORY + PATTERNS'tan sprint önerileri üret. Priority scoring: TODO count (high), coverage drop (critical), dependency update (low). Suggestion format: { title, description, priority, estimatedEffort, suggestedModel }. Max 5 suggestion at a time.

**Test:** 8+ test.

---

## Task 3: Watch Mode CLI — `deckent watch --act`
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/watch.ts (modify), src/cli/commands/continuous.ts (new)
- Scope: src/cli/, tests/cli/

### Description
`deckent watch --act` → sürekli izle + öner + onayla + çalış döngüsü. Interactive: "3 öneri var: 1) Fix 5 TODO, 2) Update deps, 3) Increase coverage. Hangisini yapayım? [1/2/3/all/skip]". `--auto` mode: priority > HIGH olanları otomatik çalıştır.

**Test:** 8+ test.

---

## Task 4: Watch Dashboard Integration — Suggestions Tab
- Model: sonnet
- Effort: normal
- Files: src/api/server.ts, src/dashboard/ (modify)
- Scope: src/api/, src/dashboard/, tests/

### Description
Web dashboard'da "Suggestions" tab. Real-time suggestion listesi, one-click sprint başlatma. SSE ile live update. Suggestion history (kabul/red edilen öneriler).

**Test:** 5+ test.

---

## Task 5: GitHub Discussions Setup — Topluluk Forumu
- Model: sonnet
- Effort: normal
- Files: .github/DISCUSSION_TEMPLATE/ (new), docs/COMMUNITY.md (new)
- Scope: .github/, docs/, tests/docs/

### Description
GitHub Discussions kategori yapısı: Ideas (feature requests), Q&A (help), Show & Tell (projeler), Announcements. Discussion template'leri. COMMUNITY.md: Discord link, contribution guide, code of conduct referansı.

**Test:** 5+ test.

---

## Task 6: CONTRIBUTING.md Overhaul — Geliştirici Rehberi
- Model: opus
- Effort: high
- Files: CONTRIBUTING.md
- Scope: ./, tests/docs/

### Description
CONTRIBUTING.md'yi yeniden yaz. Sections: Quick Start (5 dakika dev setup), Architecture Overview (module map), Development Workflow (branch → test → PR), Plugin Development, Skill Development, Translation Guide. "Good First Issue" rehberi. Code review checklist.

**Test:** 8+ test.

---

## Task 7: Issue Label System + Sync Script
- Model: haiku
- Effort: low
- Files: .github/labels.yml (new), scripts/sync-labels.ts (new)
- Scope: .github/, scripts/, tests/

### Description
Standart label seti: `good first issue`, `help wanted`, `bug`, `enhancement`, `plugin`, `skill`, `docs`, `provider:claude`, `provider:codex`, `provider:gemini`, `priority:p0-p3`, `area:brain`, `area:worker`, `area:auditor`, `area:api`, `area:dashboard`. GitHub API ile sync script.

**Test:** 3+ test.

---

## Task 8: Discord Webhook Notification
- Model: sonnet
- Effort: normal
- Files: src/integrations/discord-webhook.ts (new)
- Scope: src/integrations/, tests/

### Description
Sprint complete → Discord webhook notification. Format: embed with sprint summary, task count, NO_GO rate. Config: `discord_webhook_url`. Mevcut notification system'e entegre (NotificationConfig).

**Test:** 5+ test.

---

## Task 9: Code of Conduct
- Model: haiku
- Effort: low
- Files: CODE_OF_CONDUCT.md (new)
- Scope: ./, tests/docs/

### Description
Contributor Covenant v2.1 adapte et. İletişim: community@deckent.agency. Enforcement guidelines.

**Test:** 2+ test.

---

## Quality Rules
- Watch mode CPU < %5 idle
- Suggestion kalitesi: false positive < %20
- Auto mode güvenli (destructive action yok)
- Tüm template'ler GitHub API ile uyumlu
- Discord webhook test edilmiş
- CONTRIBUTING.md 5 dakika dev setup çalışır
- %100 GO hedefli
