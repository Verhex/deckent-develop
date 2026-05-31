# Deckent Core Memory — Dogfood Backup

**Amaç:** Bu dizin **deckent-dev (kendi self-host) dogfood için** Claude Code user-level memory yedeği tutar. `~/.claude/projects/-home-alperen-deckent-dev/memory/` session logout veya cleanup ile kaybolduğunda referans + recovery için.

## Önemli kurallar

- 🔒 **GITIGNORED** — `.gitignore`'da `docs/core-memory/` listeli. Git'e commit edilmez, npm publish'e dahil değil. Kullanıcılar `npm install -g deckent` yaptığında BU DİZİNİ GÖRMEZ.
- 📦 **Dogfood-only** — Sadece deckent-dev kendi geliştirme repo'su için. Product (deckent) içinde yer almaz.
- 🔄 **Bidirectional sync** — Yeni memory entry oluşturulursa hem `~/.claude/projects/.../memory/` hem `docs/core-memory/` altına yazılır (manuel veya hook ile).
- 🧬 **ADR-grade dogfood records** — Bu memory'ler Deckent geliştirme felsefesinin parçası (god-level vision, AEGIS, Trinity, Karpathy, vs). ADR'lerle birlikte canonic kaynak.

## İçerik

### Feedback memory (5)
- `feedback_no_minimum_no_mvp_deckent.md` — Deckent için MVP/minimum YASAK, hep god-level
- `feedback_db_silmek_yasak.md` — .brain/memory.db korunur, asla rm
- `feedback_break_sprint_bug_cycle.md` — Ship & iterate, sprint-bug döngüsünü kır
- `feedback_trust_brain_eval_not_worker.md` — Brain verdict gerçek, worker .result ipucu
- `feedback_docker_oom_false_no_go.md` — Docker OOM/auth-fail durumunda disk-verify zorunlu
- `feedback_build_requires_user_approval.md` — Build sonrası user approval / MCP restart
- `feedback_prompt_completeness_over_brevity.md` — Worker prompt complete > brevity

### Project memory (12)
- `project_deckent_god_level_vision.md` — God-level ürün vizyonu
- `project_deckent_agentic_os_vision.md` — Agentic-OS 3 persona × 3 audience
- `project_deckent_trinity_anchor.md` — Trinity 3-face anchor (2026-05-20)
- `project_june1_beta_roadmap.md` — 1 Haziran 2026 KESİN beta launch
- `project_aegis_methodology.md` — AEGIS methodology (ADR-061)
- `project_karpathy_skill_discipline.md` — Karpathy 4-Discipline (Sprint 191-197 anchor)
- `project_embedded_web_terminal.md` — Embedded terminal (Sprint 175, Sub-project #2)
- `project_nervous_activation_plan.md` — Nervous System aktivasyon (ADR-040)
- `project_topp_continuous_dispatch.md` — TOPP continuous-dispatch (ADR-064)
- `project_task_type_taxonomy_vision.md` — TaskType + EnvironmentType + Hybrid Scoring
- `project_sprint188_self_analysis.md` — Sprint 188 self-analysis (W-B kaynak)
- `project_4cli_subscription_vision.md` — 4 CLI subscription mode (Sprint 195-197)
- `project_api_mode_deferred_post_beta.md` — API mode 1 Haziran sonrası
- `project_system_risk_inventory.md` — 11 sistem riski

### Recovery memory (Sprint 195-197)
- `feedback_brain_synthetic_nogo_disk_verify.md` — 7 sentetik NO_GO kaynağı + disk-verify zorunlu
- `feedback_container_auth_precedence.md` — Per-task Auth wire (Sprint 195)
- `feedback_no_auth_touch_during_sprint.md` — Sprint çalışırken /login YASAK
- `feedback_proactive_blocker_disclosure.md` — Bilinen blocker disclosure
- `feedback_worker_prompt_engineering_god_level.md` — Worker prompt 10 sorun + WP-1..WP-12 stream

## Sync mekanizması (Sprint 198+ hedef)

Sprint 198'in opsiyonel task'larından biri **memory backup sync hook** olmalı:

```bash
# Yeni entry ya da update sonrası
node scripts/sync-core-memory.mjs
# ~/.claude/projects/.../memory/ → docs/core-memory/ rsync (bidirectional)
```

Eğer Claude Code user-level memory cleanup yaparsa bu dizinden restore:

```bash
node scripts/sync-core-memory.mjs --restore
# docs/core-memory/ → ~/.claude/projects/.../memory/
```

## Versiyonlama notu

Bu dizin **deckent-dev repo'sunun parçası** ama gitignored. Yani:
- Lokal `git status` görmez
- Commit'lenmez, push'lanmaz
- Yedek **manuel olarak** başka bir secure store'a (Dropbox, iCloud, vs) kopyalanabilir

Eğer yedeklenmek istenirse Alperen kendi backup pipeline'ına ekler (örn. `cp -r docs/core-memory/ ~/Dropbox/deckent-backup/`).

## Recovery hikayesi

**2026-05-26 incident:** Session logout sonrası `~/.claude/projects/.../memory/` 18 entry kayboldu. Master plan dosyalarındaki referans + git history + memory.db pattern entry'lerinden essence yeniden inşa edildi. `docs/core-memory/` bu deneyimden doğdu — bir daha kaybolmaması için.
