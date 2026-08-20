# DIRECTIVES — i18n-genişleme BÜYÜK-paket (fabrika-dalga-3; yetki-devri 2026-08-20)

## Goal

Gate/MCP yüzeylerindeki kalan İngilizce hardcode kullanıcı-metinlerini kapatmak:
kullanıcıya görünen her metin `getMessage(key, lang)` (src/cli/helpers/messages.ts,
en+tr) üzerinden gelir. Davranış değişmez — YALNIZ metin-kaynağı değişir;
metin-değişiminden kırılan test-pinleri amaç korunarak yeni anahtar-metnine
hizalanır. messages.ts'e yalnız EKLEME yapılır; mevcut anahtarlar değiştirilmez.
Görevler PARALEL koşar; src/cli/helpers/messages.ts ortak dosyadır — file-lock
sırası beklenir, lock beklemek NO_GO nedeni değildir. Prose'da dosya-adı DAİMA
tam-yol yazılır. Makine-payload alanları (typed code/reasonCode/JSON alan-adları)
i18n'e TAŞINMAZ — yalnız insan-okur metinler taşınır.

## Task 1: cost-gate kullanıcı-metinleri i18n

### Description
src/core/cost-gate.ts içindeki İngilizce insan-okur metinler (gate sonuç/uyarı
cümleleri) getMessage anahtarlarına taşınır (en+tr, `cost_gate.*` ailesi);
typed kodlar (COST_GATE_EXCEEDED vb.) aynen kalır.
- Files: src/core/cost-gate.ts, src/cli/helpers/messages.ts, tests/core/cost-gate.test.ts
- Test: npx vitest run tests/core/cost-gate.test.ts tests/core/cost-gate-spend.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/core/cost-gate.ts'te insan-okur İngilizce hardcode kalmaz; iki cost-gate
test-dosyası yeşil; tsc --noEmit temiz.

## Task 2: prompt-gate kullanıcı-metinleri i18n

### Description
src/orchestra/prompt-gate.ts içindeki İngilizce insan-okur metinler getMessage
anahtarlarına taşınır (en+tr, `prompt_gate.*` ailesi — mevcut
prompt_gate.test_not_discoverable desenine uy); typed lint-kodları aynen kalır.
- Files: src/orchestra/prompt-gate.ts, src/cli/helpers/messages.ts, tests/orchestra/prompt-gate.test.ts
- Test: npx vitest run tests/orchestra/prompt-gate.test.ts tests/orchestra/prompt-gate-start-path.test.ts tests/orchestra/prompt-gate-scope-wiring.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/orchestra/prompt-gate.ts'te insan-okur İngilizce hardcode kalmaz; üç
prompt-gate test-dosyası yeşil; tsc --noEmit temiz.

## Task 3: scope-gate kullanıcı-metinleri i18n

### Description
src/core/scope-gate.ts içindeki İngilizce insan-okur metinler getMessage
anahtarlarına taşınır (en+tr, `scope_gate.*` ailesi); typed kodlar
(SCOPE_GATE_SUSPECT vb.) aynen kalır.
- Files: src/core/scope-gate.ts, src/cli/helpers/messages.ts, tests/core/scope-gate.test.ts
- Test: npx vitest run tests/core/scope-gate.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/core/scope-gate.ts'te insan-okur İngilizce hardcode kalmaz;
tests/core/scope-gate.test.ts yeşil; tsc --noEmit temiz.

## Task 4: MCP autonomous ana-tool metinleri i18n

### Description
src/mcp/tools/autonomous.ts içindeki İngilizce insan-okur mesajlar getMessage
anahtarlarına taşınır (en+tr, `autonomous.*` ailesi); JSON-payload alan-adları
ve typed kodlar aynen kalır.
- Files: src/mcp/tools/autonomous.ts, src/cli/helpers/messages.ts, tests/mcp/autonomous-start-honest.test.ts
- Test: npx vitest run tests/mcp/autonomous-start-honest.test.ts tests/mcp/autonomous-surface.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/mcp/tools/autonomous.ts'te insan-okur İngilizce hardcode kalmaz; iki test
dosyası yeşil; tsc --noEmit temiz.

## Task 5: MCP start-tool metinleri i18n

### Description
src/mcp/tools/start.ts içindeki İngilizce insan-okur mesajlar getMessage
anahtarlarına taşınır (en+tr, `start.*`/`mcp.start.*` komşu-desenine uy);
payload alan-adları ve typed kodlar aynen kalır.
- Files: src/mcp/tools/start.ts, src/cli/helpers/messages.ts, tests/mcp/start-lifecycle.test.ts
- Test: npx vitest run tests/mcp/start-lifecycle.test.ts tests/mcp/start-cost-gate.test.ts tests/mcp/start-autoapprove.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/mcp/tools/start.ts'te insan-okur İngilizce hardcode kalmaz; üç start test
dosyası yeşil; tsc --noEmit temiz.

## Task 6: api/server approvals hata-metinleri i18n

### Description
src/api/server.ts içindeki approvals-endpoint bölgesinin İngilizce insan-okur
hata-metinleri (yalnız approvals-route'ları; başka bölgeye DOKUNMA) getMessage
anahtarlarına taşınır (en+tr, `api.approvals.*` ailesi); HTTP-status kodları ve
JSON alan-adları aynen kalır.
- Files: src/api/server.ts, src/cli/helpers/messages.ts, tests/api/approvals-endpoint.test.ts
- Not: tests/api/approvals-endpoint.test.ts mevcut değilse YENİ oluşturulur —
  approvals-route hata-metinlerinin katalogdan geldiğini hermetik pinler.
- Test: npx vitest run tests/api/approvals-endpoint.test.ts
- Model: claude-sonnet-5

### GO Criteria
src/api/server.ts approvals-route'larında insan-okur İngilizce hardcode kalmaz;
tests/api/approvals-endpoint.test.ts yeşil; tsc --noEmit temiz.
