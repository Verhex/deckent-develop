# DIRECTIVES — Sprint 057: Community Infrastructure

## Goal: GitHub Discussions, Discord, CONTRIBUTING overhaul. Community büyümesi için altyapı.

---

## Task 1: GitHub Discussions Setup
- Model: sonnet
- Effort: normal
- Files: .github/DISCUSSION_TEMPLATE/ (new), docs/COMMUNITY.md (new)
- Scope: .github/, docs/

### Description
GitHub Discussions kategori yapısı: Ideas (feature requests), Q&A (help), Show & Tell (projeler), Announcements. Discussion template'leri. COMMUNITY.md: Discord link, contribution guide, code of conduct referansı.
5+ test.

---

## Task 2: CONTRIBUTING.md Overhaul
- Model: opus
- Effort: high
- Files: CONTRIBUTING.md
- Scope: ./

### Description
CONTRIBUTING.md'yi yeniden yaz. Sections: Quick Start (5 dakika dev setup), Architecture Overview (module map), Development Workflow (branch → test → PR), Plugin Development, Skill Development, Translation Guide. "Good First Issue" rehberi. Code review checklist.
8+ test.

---

## Task 3: Issue Label System
- Model: haiku
- Effort: low
- Files: .github/labels.yml (new), scripts/sync-labels.ts (new)
- Scope: .github/, scripts/

### Description
Standart label seti: `good first issue`, `help wanted`, `bug`, `enhancement`, `plugin`, `skill`, `docs`, `provider:claude`, `provider:codex`, `provider:gemini`, `priority:p0-p3`, `area:brain`, `area:worker`, `area:auditor`, `area:api`, `area:dashboard`. GitHub API ile sync script.
3+ test.

---

## Task 4: Discord Bot (Webhook)
- Model: sonnet
- Effort: normal
- Files: src/integrations/discord-webhook.ts (new)
- Scope: src/integrations/

### Description
Sprint complete → Discord webhook notification. Format: embed with sprint summary, task count, NO_GO rate. Config: `discord_webhook_url`. Mevcut notification system'e entegre (NotificationConfig).
5+ test.

---

## Task 5: Code of Conduct
- Model: haiku
- Effort: low
- Files: CODE_OF_CONDUCT.md (new)
- Scope: ./

### Description
Contributor Covenant v2.1 adapte et. İletişim: community@deckent.agency. Enforcement guidelines.
2+ test.

---

## Quality Rules
- Tüm template'ler GitHub API ile uyumlu
- Discord webhook test edilmiş
- CONTRIBUTING.md 5 dakika dev setup çalışır
