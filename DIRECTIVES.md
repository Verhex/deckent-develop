# DIRECTIVES — Sprint 094: Stats Sync Doğrulama + Usage Son Temizlik

## Goal: Sprint bittiğinde agent.json ve manifest.json stats'larının gerçekten güncellendiğini doğrula. README'deki son usage referansını temizle.

---

## Task 1: Usage Son Kalıntı Temizliği — README CLI Tablosu
- Model: sonnet
- Effort: low
- Agent: refactorer
- Skills: typescript-expert
- Files: docs/reference/cli.md
- Scope: docs/

### Description
docs/reference/cli.md dosyasında `deckent usage` komutu referansı kalmış olabilir. Tüm docs/ altında `deckent usage` veya `usage` komut referansı kaldıysa kaldır.

A) `docs/reference/cli.md`'de `deckent usage` komutu varsa kaldır
B) docs/ altında `grep -rn "deckent usage" docs/` ile tara, kalan varsa kaldır
C) Genel "usage" kelimesi (help text gibi) sorun değil — sadece `deckent usage` komutu ve UsageTracker referansları

**Kanıt:** `grep -rn "deckent usage\|deckent_usage\|usage-tracker\|UsageTracker" docs/ README.md README-TR.md | wc -l` → 0

**Test:** `tsc --noEmit` temiz.

---

## Task 2: Stats Sync Doğrulama Notu
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: typescript-expert
- Files: .brain/PROJECT-IDENTITY.md
- Scope: .brain/

### Description
PROJECT-IDENTITY.md'yi güncelle: Sprint 093'te eklenen özellikleri (stats sync, RETRO skill tablosu, sprint bildirim) yansıt.

A) Features listesine ekle: "Agent/Skill Stats Sync (V2→manifest)"
B) MCP sayısını doğrula: 18 tools, 8 resources
C) Sprint sayısını güncelle: 94+

**Kanıt:** `grep "Stats Sync\|18 tools" .brain/PROJECT-IDENTITY.md` → eşleşme

**Test:** Dosya valid markdown.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- Usage referansı → 0 (src, tests, docs, README dahil)
- Bu sprint'in asıl amacı: finalizeSprint çalıştığında agent.json/manifest.json stats'ın güncellenmesini doğrulamak
