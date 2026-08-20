# DIRECTIVES — i18n-borç paketi (dogfood-dalga; owner-onaylı dönüş 2026-08-20)

## Goal

Onay-yüzeyi envanterinin (docs/governance/unified-approval-surface.md) ölçtüğü
i18n-FIRST ihlallerini kapatmak: kullanıcıya görünen hiçbir metin hardcode kalmaz;
tümü `getMessage(key, lang)` (src/cli/helpers/messages.ts, en+tr) üzerinden gelir.
Davranış değişmez — YALNIZ metin-kaynağı değişir; metin-değişiminden kırılan test
pinleri amaç korunarak yeni anahtar-metnine hizalanır. messages.ts'e yalnız EKLEME
yapılır; mevcut anahtarlar değiştirilmez. Görevler PARALEL koşar;
src/cli/helpers/messages.ts ortak dosyadır — file-lock sırası beklenir, lock
beklemek NO_GO nedeni değildir. Prose'da dosya-adı DAİMA tam-yol yazılır.

## Task 1: MCP nervous karar-mesajları i18n

### Description
src/mcp/tools/nervous.ts içindeki İngilizce hardcode kullanıcı-mesajları (accept/
reject/panic sonuç-metinleri; dosyadaki TÜM template-literal kullanıcı-metinlerini
tara) getMessage anahtarlarına taşınır; anahtarlar src/cli/helpers/messages.ts'e
en+tr eklenir (`nervous.*` ailesi komşu-desenine uy).
- Files: src/mcp/tools/nervous.ts, src/cli/helpers/messages.ts, tests/mcp/nervous-tools.test.ts
- Test: npx vitest run tests/mcp/nervous-tools.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/mcp/tools/nervous.ts içinde kullanıcıya dönen hiçbir İngilizce hardcode metin
kalmaz; tests/mcp/nervous-tools.test.ts yeşil; tsc --noEmit temiz.

## Task 2: MCP autonomous karar-mesajları i18n

### Description
src/mcp/tools/autonomous-approval.ts ve src/mcp/tools/autonomous-surface.ts
içindeki İngilizce hardcode kullanıcı-mesajları getMessage anahtarlarına taşınır
(en+tr, `autonomous.*` ailesi). src/mcp/tools/autonomous.ts bu pakette KAPSAM DIŞI.
- Files: src/mcp/tools/autonomous-approval.ts, src/mcp/tools/autonomous-surface.ts, src/cli/helpers/messages.ts, tests/mcp/autonomous-approval.test.ts
- Test: npx vitest run tests/mcp/autonomous-approval.test.ts
- Model: claude-sonnet-5

### GO Criteria
İki dosyada kullanıcıya dönen İngilizce hardcode metin kalmaz;
tests/mcp/autonomous-approval.test.ts yeşil; tsc --noEmit temiz.

## Task 3: sprint-lifecycle checkpoint-notify hardcode i18n

### Description
src/orchestra/sprint-lifecycle.ts içindeki Türkçe hardcode notify-metni
(satır ~603: "Onay bekleniyor: ..." ve aynı bloktaki eşleri) getMessage
anahtarına taşınır (en+tr, `checkpoint.*` ailesi); lang mevcut çözümle bulunur.
- Files: src/orchestra/sprint-lifecycle.ts, src/cli/helpers/messages.ts, tests/orchestra/checkpoint-loop.test.ts
- Test: npx vitest run tests/orchestra/checkpoint-loop.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/orchestra/sprint-lifecycle.ts'te kullanıcıya görünen hardcode TR/EN metin
kalmaz; tests/orchestra/checkpoint-loop.test.ts yeşil; tsc --noEmit temiz.

## Task 4: checkpoint CLI option-desc i18n

### Description
src/cli/commands/checkpoint.ts içindeki İngilizce hardcode option/komut
açıklamaları ve kullanıcı-mesajları getMessage anahtarlarına taşınır (en+tr;
`--help` çıktısı da kullanıcı-yüzüdür; `checkpoint.*` / `cli.checkpoint.*` ailesi).
- Files: src/cli/commands/checkpoint.ts, src/cli/helpers/messages.ts, tests/cli/checkpoint-i18n.test.ts
- Test: npx vitest run tests/cli/checkpoint-i18n.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/cli/commands/checkpoint.ts'te İngilizce hardcode kullanıcı-metni kalmaz;
tests/cli/checkpoint-i18n.test.ts yeşil; tsc --noEmit temiz.
