# DIRECTIVES — Sprint 275: F1-TOK Kapanış-Ölçüm — Usage Yüzey Paritesi + Kanıt Fleet'i

## Goal: F1-TOK'un kanıt sprint'i — bu sprint'in KENDİSİ deneydir: warm-spawn + Skills-first + adr-operative + kind-limitler hep birlikte İLK kez aktif koşar; CC sprint-sonu gerçek cache-gate + final A/B raporunu çıkarır (hedefler: 2.+ worker'larda cache_read>cache_write, boot-cw payı %56→düşüş, task-başı ≤$0.45 teyidi). İş yükü gerçek-değerli usage-yüzey paritesi: `/usage` + `/resources` REPL slash'leri (ÜÇ KATMAN: registry + tool-bridge + permissions — 269 dersi), `deckent_usage` MCP tool'u, 273-010 debt kapanışı, doc senkronları. MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA (sonnet 5 · haiku 3; opus yok — çok-zor iş yok).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable I/O; gerçek ağ/`~/.claude` YASAK testlerde; spawnSync YASAK.
- **3-KATMAN KURALI (269 canlı dersi):** REPL'e slash eklemek = chat-slash-registry + chat-tool-bridge `cliArgsFor` + tool-permissions `classifyTool` ÜÇÜNÜN birden güncellenmesi. Birini atlamak = mock-geçer/canlı-düşer.
- **Davranış korunumu:** additive/opt-in; mevcut yeşil testler yeşil.
- **i18n-FIRST:** user-facing string `getMessage(key, lang)` (en+tr).
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş.

---

## Task 1: /usage REPL slash — üç katman birden
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-slash-registry.ts, src/cli/commands/chat-tool-bridge.ts, src/cli/repl/tool-permissions.ts, tests/cli/chat-slash-usage.test.ts
- Scope: src/cli/, tests/cli/

### Description
`/usage [--sprint N]` slash'i (269-273 desenleri): (1) registry — `/usage` → `deckent_usage` dispatch, `--sprint N`/`since` arg-map (resolveAuditSlash deseni); (2) tool-bridge `cliArgsFor` — `deckent_usage` → `['usage', ...]` argv (sprint paramı `--sprint N`; read-only); (3) tool-permissions — `deckent_usage` → 'read'. NOT: MCP tool'u Task 3'te iniyor — bridge CLI'ı spawn'ladığı için MCP tool'una bağımlı DEĞİL (dispatch adı sözleşmesi yeter); yine de bilinmeyen-arg dürüst i18n mesajı. Testler: registry kaydı + arg-map; bridge argv (sprint'li/siz); permission read; bilinmeyen alt-arg yolu.

**Kanıt:** `npx vitest run tests/cli/chat-slash-usage.test.ts` yeşil; `grep -c "deckent_usage" src/cli/commands/chat-tool-bridge.ts src/cli/repl/tool-permissions.ts | paste -sd+ | bc` ≥ 2 (iki dosyada da). **Test:** 6+.

---

## Task 2: /resources REPL slash — üç katman birden
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-slash-registry.ts, src/cli/commands/chat-tool-bridge.ts, src/cli/repl/tool-permissions.ts, tests/cli/chat-slash-resources.test.ts
- Dependencies: 275-001
- Scope: src/cli/, tests/cli/

### Description
`/resources [--log]` slash'i — Task 1 ile AYNI ÜÇ DOSYAYI değiştirdiği için Dependencies ile serileştirildi (onun düzeninin üstüne otur): registry `/resources` → `deckent_resources` dispatch (`--log [path]` arg-map; path verilmezse default log); bridge → `['resources', ...]`; permissions → 'read'. Anlık snapshot REPL'den tek slash'le (Alperen'in günlük kullanımı). Testler: Task 1 deseninde 5+.

**Kanıt:** `npx vitest run tests/cli/chat-slash-resources.test.ts` yeşil; `grep -n "/resources" src/cli/commands/chat-slash-registry.ts | head -1` ≥ 1. **Test:** 5+.

---

## Task 3: deckent_usage MCP tool — ADR-022 parite
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/mcp/tools/usage.ts, src/mcp/tools/index.ts, src/mcp/server.ts, tests/mcp/usage-tool.test.ts
- Scope: src/mcp/, tests/mcp/

### Description
YENİ `deckent_usage` MCP tool'u (`mcp/tools/` register deseni — 33→34 tool): inputSchema `{ sprint?: string; since?: string; until?: string }` → `core/limit-ledger`+`limit-ledger-report` çağrısı (CLI ile aynı SSOT; usage.ts CLI'ının çekirdek fonksiyonunu re-use et — export gerekiyorsa surgical export, notes'a). Çıktı: JSON özet (model tablosu ya da sprint task-tablosu + cache-gate alanları). `src/mcp/server.ts` instructions bloğuna satır ekle + "## Tools (34)" sayacı güncelle (lint-mcp-instructions yeşil kalmalı — `node scripts/lint-mcp-instructions.mjs` koş!). Read-only/idempotent annotations. Testler: tool kaydı, schema, mock-ledger çıktı shape, instructions-lint.

**Kanıt:** `npx vitest run tests/mcp/usage-tool.test.ts` yeşil; `node scripts/lint-mcp-instructions.mjs` exit 0. **Test:** 6+.

---

## Task 4: 273-010 debt kapanışı — kalan "full test suite" eşleşmeleri denetimi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer, testing-expert
- Files: src/core/builtins/
- Scope: src/core/builtins/

### Description
273-010'un dürüst borcu: `grep -rn "full test suite" src/core/builtins/` hâlâ ~6 eşleşme (agents/'ta da kalanlar var — 010'un Kanıt'ı agents=0 bekliyordu, tutmadı). HER eşleşmeyi tek tek sınıflandır (.result'a tablo): (a) CI/PR-bağlamı (testing-expert "on every pull request" gibi) → DOĞRU, KALIR + satıra `<!-- ci-context -->` yorumu eklenebilirse ekle (md yorumu güvenli); (b) worker-verify bağlamı → 273-010'un düzeltme diliyle değiştir ("project-configured verify scope (targeted test files by default...)"). İçerik KORUNUMU: silme yok, ifade düzeltme.

**Kanıt:** `grep -rn "full test suite" src/core/builtins/agents/ | grep -v "ci-context\|pull request\|CI" | wc -l` = 0; .result'ta sınıflandırma tablosu. **Test:** yok — .result YAZ.

---

## Task 5: cli-commands + features — usage/resources slash + MCP satırları
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/cli-commands.md, docs/reference/features.md
- Dependencies: 275-001, 275-002, 275-003
- Scope: docs/reference/

### Description
DİSKTEKİ koddan (inmemişleri yazma + .result'a not): cli-commands REPL-slash bölümüne `/usage` + `/resources`; features.md'ye deckent_usage MCP + slash satırları (tetikleyenleriyle). Mevcut format.

**Kanıt:** `grep -ciE "/usage|/resources|deckent_usage" docs/reference/cli-commands.md docs/reference/features.md | paste -sd+ | bc` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 6: mcp-tools.md regen — 34 tool
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/mcp-tools.md, tests/docs/reference-drift.test.ts
- Dependencies: 275-003
- Scope: docs/reference/, tests/docs/

### Description
Task 3 sonrası `node scripts/gen-reference-docs.mjs` (ya da `npm run docs:ref`) ile mcp-tools.md'yi 34-tool gerçeğiyle yeniden üret; reference-drift testi kod-türevliyse otomatik geçer (DOĞRULA — sabitse güncelle + yorum).

**Kanıt:** `npx vitest run tests/docs/reference-drift.test.ts` yeşil. **Test:** drift yeşil — .result YAZ.

---

## Task 7: resource-profile — F1-TOK optimizasyon bölümü iskeleti
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/resource-profile.md
- Scope: docs/reference/

### Description
resource-profile.md'ye "Token/Cache Optimizasyonu (F1-TOK)" bölümü — DİSKTEKİ koddan: cache_warm config + warm-spawn davranışı (sprint-spawner yorumlarından), prompt.adr_render operative modu, Skills-first sıra gerekçesi (prompt-god-template yorumu), `deckent usage` cache-gate okuma rehberi. "Ölçülmüş A/B" alt-bölümüne yer aç (CC sprint-sonu gerçek sayıları ekler — uydurma sayı YAZMA; 274 ledger'ından bilinen $0.52→$0.22 satırını yazabilirsin, kaynağıyla).

**Kanıt:** `grep -ciE "cache_warm|adr_render|F1-TOK" docs/reference/resource-profile.md` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 8: MASTER-PLAN — F1-TOK durum konsolidasyonu
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Dependencies: 275-001, 275-003, 275-004
- Scope: docs/

### Description
F1-TOK maddesinde durum konsolidasyonu (tek-satır ekler, silme yok): Faz 0+1+1,5 ✅ (273), Faz 2 ✅ (274 + CC el-işleri), kanıt-sprint ✅ Sprint 275 (usage yüzey paritesi: /usage + /resources slash + deckent_usage MCP + 010-debt kapanışı; final ölçüm CC raporunda). Kalan: yalnız sürekli-izleme (haftalık usage gözden geçirme).

**Kanıt:** `grep -c "Sprint 275" docs/MASTER-PLAN.md` ≥ 2. **Test:** yok — .result YAZ.

---

**Beklenen:** 8 mikro task (sonnet 4 · haiku 4 — wait: 001,002,003,004 sonnet; 005,006,007,008 haiku), zincirler: 002→001 (aynı 3 dosya — serileştirme!) · 005→001,002,003 · 006→003 · 008→001,003,004. **BU SPRINT DENEYDİR:** warm-spawn İLK CANLI koşu — CC monitor'de ilk worker'ın TEK başladığını + ~45s sonra fleet'in geldiğini gözler; sprint-sonu `usage --sprint 275` ile gerçek cache-gate (PASS hedefi) + boot-cw payı + final A/B (273/274/275) → **F1-TOK KAPANIŞ RAPORU** + commit/push + 🔨 BUILD.
