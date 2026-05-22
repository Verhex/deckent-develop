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
| [2026-05-22-deckent-i18n-audit.md](2026-05-22-deckent-i18n-audit.md) | `.deckent/i18n/` audit — write-only dead files mimarisi, 59 aspirasyonel anahtar, 3 içerik düzeltmesi, post-GA tasarım borcu | 2026-05-22 |
| [2026-05-22-sprint-file-retention-audit.md](2026-05-22-sprint-file-retention-audit.md) | Sprint dosya saklama audit — 2 eksik pattern (metrics, panic), keep_last_n 10→2, backfill sprint-181~184 | 2026-05-22 |
