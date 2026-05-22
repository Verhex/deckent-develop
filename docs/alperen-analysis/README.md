# Alperen Analysis

Deckent üzerine yapılan derin analiz serisi. Her belge iki perspektiften değerlendirilir:

1. **Deckent dogfooding** — Deckent'i geliştiren biri olarak iç tutarlılık ve mimari sağlık
2. **Deckent ürünü** — Deckent'i kendi projesinde kullanan kullanıcı perspektifi

Tüm analizler sistematik debugging metodolojisiyle yürütülür (kanıt toplama → kök neden → düzeltme). Açık kaynak hazırlığı kapsamında başlatılmıştır.

## Belgeler

| Dosya | Konu | Tarih |
|-------|------|-------|
| [2026-05-22-oss-audit-master.md](2026-05-22-oss-audit-master.md) | OSS audit master özeti — 6 domain, 32 sorun, 32 düzeltme, OSS hazırlık değerlendirmesi | 2026-05-22 |
| [2026-05-22-github-audit.md](2026-05-22-github-audit.md) | `.github/` audit — CODEOWNERS, çift publish race, docs domain, concurrency control | 2026-05-22 |
| [2026-05-22-claude-rules-audit.md](2026-05-22-claude-rules-audit.md) | `.claude/rules/` dizin audit — tutarlılık, dil-bağımsızlık, çift kod yolu | 2026-05-22 |
| [2026-05-22-ide-adapters-audit.md](2026-05-22-ide-adapters-audit.md) | `.cursor/` `.codex/` `.gemini/` adapter audit — claude-coupling, Cursor `.mdc`, CUSTOM kirliliği, MCP komutu (BUG-18), 4-provider init, non-destructive init | 2026-05-22 |
| [2026-05-22-deckent-agents-audit.md](2026-05-22-deckent-agents-audit.md) | `.deckent/agents/` audit — 15 builtin, dil-bağımsızlık (ci-guardian, bug-fixer, migration-specialist), temp agent gitignore | 2026-05-22 |
| [2026-05-22-deckent-skills-audit.md](2026-05-22-deckent-skills-audit.md) | `.deckent/skills/` audit — 21 builtin, ci-testing tam yeniden yazım, multi-stack stackDetection, dead field analizi | 2026-05-22 |
| [2026-05-22-deckent-workspace-audit.md](2026-05-22-deckent-workspace-audit.md) | `.deckent/workspace/` audit — BOOT.md yapısal bozulma, TOOLS.md yanlış MCP isimleri, IDENTITY.md stale metrikler, prompt-god-template TS-only verify steps | 2026-05-22 |
| [2026-05-22-cost-config-audit.md](2026-05-22-cost-config-audit.md) | `.deckent/cost-config.json` audit — parametrik maliyet sistemi, veri akışı, model-registry senkron eksiği | 2026-05-22 |
| [2026-05-22-features-manifest-audit.md](2026-05-22-features-manifest-audit.md) | `.deckent/features-manifest.json` audit — feature usage manifest, "dead"/"dormant" kategori-anlam tutarsızlığı, el-katalog vs auto-generated | 2026-05-22 |
| [2026-05-22-ground-truth-overrides-audit.md](2026-05-22-ground-truth-overrides-audit.md) | `.deckent/ground-truth-overrides.json` audit — doc-sync ground-truth whitelist, expired+redundant override, expiry hijyeni | 2026-05-22 |
| [2026-05-22-deckent-i18n-audit.md](2026-05-22-deckent-i18n-audit.md) | `.deckent/i18n/` audit — write-only dead files mimarisi, 59 aspirasyonel anahtar, 3 içerik düzeltmesi, post-GA tasarım borcu | 2026-05-22 |
| [2026-05-22-sprint-file-retention-audit.md](2026-05-22-sprint-file-retention-audit.md) | Sprint dosya saklama audit — 2 eksik pattern (metrics, panic), keep_last_n 10→2, backfill sprint-181~184 | 2026-05-22 |
| [2026-05-22-docs-json-audit.md](2026-05-22-docs-json-audit.md) | `.deckent/docs.json` audit — managed-docs pipeline, 8 sorun (5 düzeltildi): parseSections fence blindness (BOOT.md bozulma kök sebebi), wrong generator match, stale sprint refs, OSS kişi adı, blueprint phantom | 2026-05-22 |
| [2026-05-22-design-multiproject-isolation-audit.md](2026-05-22-design-multiproject-isolation-audit.md) | `docs/design/multi-project-isolation.md` audit — ADR-034 implementasyon doğrulaması; isWithinScope ✅, credential per-project key ❌ uygulanmadı, config write boundary ❌ uygulanmadı, integration testler ❌, Memory V2 layout güncellendi | 2026-05-22 |
| [2026-05-22-governance-index-audit.md](2026-05-22-governance-index-audit.md) | `docs/governance/INDEX.md` audit — Sprint 172 doc-reorg artığı: 4 phantom INDEX referans + 5 phantom docs.json path + consistency-check 3/7 dosya bulamıyor; tüm path'ler güncellendi, 7/7'ye çekildi | 2026-05-22 |
| [2026-05-22-architecture-docs-audit.md](2026-05-22-architecture-docs-audit.md) | `docs/architecture/` audit — 6 mimari referans; 14 sorun (Node.js ≥18→≥24, coverage<80→<90, wrong config key `routing_min_agent_score`, wrong method `saveTempAgent()`, AgentRole yanlış dosya, DEBT.md Sprint 186'da kaldırıldı, ADR-038 karışıklığı, Planned Evolution geçmiş); sprint-lifecycle.md sorunsuz | 2026-05-22 |
| [2026-05-22-development-docs-audit.md](2026-05-22-development-docs-audit.md) | `docs/development/` audit — 6 geliştirici kılavuzu; 3 ağır stale (agent-guide 8→15 agent + V1 şema, brain-guide pre-Memory-V2, troubleshooting Sprint-065), 2 orta, 5+ kırık cross-reference | 2026-05-22 |
| [2026-05-22-guide-docs-audit.md](2026-05-22-guide-docs-audit.md) | `docs/guide/` audit — 14 kullanıcı kılavuzu (4.474 satır); docker-backend.md **tümüyle düzeltildi** (read-only mount iddiası → rw + ADR-037 advisory, Node 22→24, backend tablosu Default sütunu), deckent-nedir Sprint-099 + faq Sprint-065 ağır stale, 4 kesişen sorun (Memory V2 yok, `config read` hayalet, tmux-default miti, port 3000↔3100) | 2026-05-22 |
| [2026-05-22-vitepress-config-audit.md](2026-05-22-vitepress-config-audit.md) | `docs/.vitepress/config.ts` audit — VitePress nav/sidebar; 44 navigasyon linkinin 34'ü kırık (30 phantom hedef), 29 gerçek sayfa orphan, phantom `/api/` + `/blog/` route grupları, srcExclude yorumu yanlış; kök neden Sprint 172 doc-reorg eksik temizliği (governance-index ile aynı) | 2026-05-22 |
| [2026-05-22-vision-docs-audit.md](2026-05-22-vision-docs-audit.md) | `docs/vision/` audit — 5 doküman (blueprint.md, VISION.md, VISION-TR.md, roadmap.md, competitive-analysis.md); 31 sorun: MCP araç sayısı 27→31 (×9), Node.js ≥18→≥24, entry type 7→9, dashboard pages 6→7, CLI 41+→55+, Sprint 185/186 yanlış açıklama, 12 detektor (3 değil), Memory V2 DB-first güncelleme | 2026-05-22 |
