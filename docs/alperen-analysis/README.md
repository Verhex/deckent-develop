# Alperen Analysis

Deckent üzerine yapılan derin analiz serisi. Her belge iki perspektiften değerlendirilir:

1. **Deckent dogfooding** — Deckent'i geliştiren biri olarak iç tutarlılık ve mimari sağlık
2. **Deckent ürünü** — Deckent'i kendi projesinde kullanan kullanıcı perspektifi

Tüm analizler sistematik debugging metodolojisiyle yürütülür (kanıt toplama → kök neden → düzeltme). Açık kaynak hazırlığı kapsamında başlatılmıştır.

## Belgeler

| Dosya | Konu | Tarih |
|-------|------|-------|
| [2026-05-22-claude-rules-audit.md](2026-05-22-claude-rules-audit.md) | `.claude/rules/` dizin audit — tutarlılık, dil-bağımsızlık, çift kod yolu | 2026-05-22 |
| [2026-05-22-ide-adapters-audit.md](2026-05-22-ide-adapters-audit.md) | `.cursor/` `.codex/` `.gemini/` adapter audit — ölü dizinler, CUSTOM kirliliği, MCP kayıt komutu (BUG-18) | 2026-05-22 |
