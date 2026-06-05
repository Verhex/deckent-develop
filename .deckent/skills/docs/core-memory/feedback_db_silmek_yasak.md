---
name: feedback-db-silmek-yasak
description: ".brain/memory.db SQLite veritabanı ASLA silinmez — Brain'in tüm hafızası (ADR, sprint outcomes, patterns, retro, learnings) burada. Export .md dosyaları regenerable AMA DB single source of truth."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kural:** `.brain/memory.db` ve `.brain/memory.db-wal`/`-shm` dosyaları **ASLA silinmez**. `rm`, `git clean -fdx` ile yanlışlıkla silinmeleri durumunda büyük veri kaybı. Sadece **`store.delete()` API'si üzerinden** controlled removal yapılabilir.

**Why:** Memory V2 (Sprint 145) sonrası tüm Brain knowledge `.brain/memory.db` SQLite'ta:
- ADR entries (`type: 'adr'`)
- Sprint outcomes (`type: 'sprint'`)
- Sprint learnings (`type: 'memory'`)
- Retro reports (`type: 'retro'`)
- Detected patterns (`type: 'pattern'`)
- Technical debt (`type: 'debt'`)
- Project identity (`type: 'identity'`, decay_exempt)

`.brain/exports/*.md` dosyaları **regenerable export'lar** — DB'yi yeniden oluşturmaz.

**How to apply:**
- Cleanup script'lerinde `.brain/memory.db*` exclude
- Worker `scope.filesWrite` `.brain/memory.db` ASLA içermez
- `deckent memory rebuild` komutu DB'yi yeniden yapar AMA history kaybeder
- Sprint cleanup `.brain/archive/` arşivler, DB'ye dokunmaz
- Yanlışlıkla silindi → git restore yok (DB gitignored), Sprint 195+ yedek: `docs/core-memory/` (gitignored ama dogfood-only)

**Anti-pattern:**
- `rm -rf .brain/` → ✗ DB silinir, geri dönüşsüz
- `git clean -fdx` → ✗ untracked DB silinir
- "Memory bozuldu, sıfırlayayım" → ✗ önce `deckent memory stats` + repair denemesi

İlgili: [[feedback_brain_synthetic_nogo_disk_verify]], [[project_sprint188_self_analysis]]
