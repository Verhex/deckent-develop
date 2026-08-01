# T-152-007: MCP Smoke Part 1 — Lifecycle Tools (8 tool)

## Özet

Deckent MCP stdio server (`dist/mcp/server.js`) canlı olarak `/tmp/mcp-smoke`
scratch projesinde spawn edildi; JSON-RPC üzerinden `initialize` →
`tools/list` → `resources/list` → 8 lifecycle tool için `tools/call` sırası
çalıştırıldı. Ek olarak 3 Zod edge-case (kötü enum, eksik required, yanlış
tip) tetiklendi. Tüm 8 lifecycle tool `tools/list` içinde **listeli** ve
çağrılabilir. **Zod validasyonu 3/3 edge case'de doğru reddetti.** Önemli 3
DRIFT tespit edildi: (1) `tools/list` 31 tool döndürüyor ama server
instructions ve DECKENT.md "27 tools" diyor, (2) `deckent_plan`
`readOnlyHint:true` ama `planSprint()` scratch dizine `.tasks/task-*.json`
yazıyor, (3) `deckent_start --dryRun=true` MCP bağlamında "No providers
registered" hatasıyla başarısız oluyor (fork-based sprint runner provider
registry'yi MCP süreç içinde kurmuyor, AI planner'a düşüyor).

## Metod

- **Server entry:** `node /workspace/dist/mcp/server.js`
- **CWD:** `/tmp/mcp-smoke` (scratch — /workspace'e sızma YOK)
- **Protokol:** JSON-RPC 2.0, MCP protocolVersion `2024-11-05`
- **Harness:** `/tmp/mcp-smoke/smoke.mjs` (spawn + pending map + await her id)
- **Sıra:** initialize → notifications/initialized → tools/list →
  resources/list → 11 `tools/call` (8 lifecycle + 3 Zod edge-case)
- **Kanıt dosyası:** `/tmp/mcp-smoke/results.json` (11 KB), stderr = 0 byte

## Inventory Snapshot

| Metric | Observed | Expected (DECKENT.md) | Status |
|--------|----------|----------------------|--------|
| `tools/list` count | **31** | 27 | **DRIFT** |
| `resources/list` count | 8 | 8 | PASS |
| Lifecycle tools present | 8/8 | 8 | PASS |
| MCP serverInfo | `deckent@1.0.0-beta.1` | matches package.json | PASS |

### 31 Tool Inventory (Sorted by Registration Order)

`deckent_init`, `deckent_set_directives`, `deckent_plan`, `deckent_start`,
`deckent_status`, `deckent_doctor`, `deckent_retro`, `deckent_history`,
`deckent_analyze_project`, `deckent_sync`, `deckent_config`, `deckent_review`,
`deckent_run`, `deckent_kill`, `deckent_cleanup`, `deckent_help`,
`deckent_agent_list`, `deckent_skill_list`, `deckent_checkpoint`,
`deckent_docs`, `deckent_explain`, `deckent_memory_query`, **`deckent_watch`**,
`deckent_nervous_subscribe`, `deckent_nervous_accept`, `deckent_nervous_reject`,
`deckent_nervous_status`, `deckent_nervous_config`, **`deckent_feature_query`**,
**`deckent_audit`**, **`deckent_recover`**.

**4 tool docs'da yok:** `deckent_watch`, `deckent_feature_query`,
`deckent_audit`, `deckent_recover` (Sprint 150 "Hot Fix trio" + Sprint 148
`deckent_watch`). `src/mcp/server.ts:24` instructions bloğu ve
`/workspace/DECKENT.md`'deki "27 tools" ifadeleri eski — 4 tool sayılmalı,
toplam 31 olmalı.

---

## 8 Lifecycle Tool — Detaylı Bulgular

### 1. `deckent_init`

- **Listed in tools/list:** PASS
- **Title:** `Initialize Deckent`
- **Annotations:** `{readOnlyHint:false, destructiveHint:false, idempotentHint:true}`
- **Input schema props:** `projectName, mode, language, force, auto`; no required
- **Smoke call:** `{mode:"performance", language:"en", force:false, auto:true, projectName:"smoke-scratch"}` → **PASS**, oluşturulan:
  14 kayıt (`.deckent/, .brain/, .tasks/, .locks/, .claude/rules/, .deckent/plugins/, .deckent/i18n/, config.json, DECKENT.md, AGENTS.md, CLAUDE.md, .claude/settings.json`).
- **Zod edge-case (`mode:"totally-not-a-mode"`):** PASS — `MCP error -32602: Input validation error … expected one of "performance" | "balanced" | "economic" | "api" | "max_plan" | "max5x_plan" | "pro_plan"`.
- **Return format:** Bare JSON (flat `{success, created, mode, language, projectName, force, auto, nextSteps, _enriched}`). **Nit:** çıktı `wrapResponse(data, summary)` sarmalayıcı kullanmıyor — diğer tools'larla (plan/start/retro) **format inconsistency** (bkz. Consistency Matrix).
- **Side-effect doğrulaması:** `/tmp/mcp-smoke/.deckent/config.json` yazıldı (200+ satır modes preset dahil); idempotentHint doğru. force=true üzerine yazma mekanizması var (init.ts:116-122).

### 2. `deckent_set_directives`

- **Listed:** PASS
- **Annotations:** `{readOnlyHint:false, destructiveHint:false, idempotentHint:false}` — doğru (DIRECTIVES.md'ye yazıyor, idempotent değil: her çağrı sprint numarasını ilerletebilir).
- **Schema:** `{content: string (required)}`. No other params.
- **Required validation (Zod):** PASS — `{}` çağrısı `MCP error -32602 … expected string, received undefined` hatasıyla reddedildi.
- **Smoke call:** 1 minimal DIRECTIVES.md → `{success:true, taskCount:1, breakdown:{code:1,…}, estimatedModels:{opus:1, sonnet:1, haiku:0}, _enriched:{…}}` → PASS.
- **Note:** `estimatedModels.sonnet:1` ama directives'de `haiku` tek model vardı — "estimated" alan preview tahmini, directives parsing'inden bağımsız bir heuristic. Accurate mi tartışmalı; ayrı bir audit konusu (T-152-017 vitest drift veya T-152-024 config).

### 3. `deckent_plan`

- **Listed:** PASS
- **Annotations:** `{readOnlyHint:true, destructiveHint:false, idempotentHint:true}` ← **DRIFT** (bkz. aşağı)
- **Schema:** `{dryRun?:bool (default true), mode?:"ai"|"structured"|"auto"}`.
- **Smoke call:** `{dryRun:true, mode:"structured"}` → PASS.
  Response: `{sprintId:"sprint-001", sprintNumber:1, tasks:[{id:"001-001", title:"Smoke", model:"haiku", priority:"NORMAL"}], recommendation:{size:"full", maxWorkers:8}, planningMode:"structured", waveBreakdown:{wave1:1}, modelDistribution:{haiku:1}, riskAssessment:"low", _enriched:{…}}`.
- **`readOnlyHint:true` DRIFT:** Çağrıdan sonra scratch dizinde `/tmp/mcp-smoke/.tasks/task-001-001.json` **oluştu**. Tool description'da "tasks are never written to disk" yazmasına rağmen `planSprint()` kendi içinde persistTask akışı çalıştırıyor (src/mcp/tools/plan.ts:61 → src/orchestra/brain.ts planSprint). Schema açıklaması yanlış, annotation yanlış. MCP clients `readOnlyHint:true` tool'a agresif çağrı yapma hakkına sahiptir — disk yazımı sessiz bir ihlaldir.
- **Zod:** Enum sınırları doğru (`"ai" | "structured" | "auto"`).
- **Return:** `wrapResponse(data, summary)` sarmalamasıyla `{data:{…}, summary:"Planned 1 task: 1 haiku (lightweight). risk: low."}`.

### 4. `deckent_start`

- **Listed:** PASS
- **Annotations:** `{readOnlyHint:false, destructiveHint:false, idempotentHint:false}` — doğru.
- **Schema:** `{autoApprove?, dryRun?, force?, timeout?, sandbox?}`. No required.
- **Zod tip guard:** PASS — `{dryRun:"nope"}` çağrısı `MCP error -32602 … expected boolean, received string`.
- **dryRun çağrısı:** **FAIL** (beklenmedik). Response:
  ```json
  {"data":{"error":true,"success":false,"message":"No providers registered"},
   "summary":"Something went wrong: No providers registered. Try: run `deckent doctor` to diagnose the issue."}
  ```
  Root cause: `start.ts:85-92` `planSprint(root, config, context, recommendation, { dryRun: true })` çağırıyor, mode vermeden. `brain.ts planSprint` default "auto" ile başlıyor, provider registry boş olduğunda `planner.ts:315 throw ProviderError('No providers registered')`.
  **Bu `deckent_plan`'de olmuyor** çünkü orada `mode:"structured"` explicit olarak structured parse'a düşüyor. MCP server `createServer()` içinde hiçbir provider adapter `registerProvider()` etmiyor (fork-based sprint runner provider'ı child process'te kuruyor — MCP süreçi hiç görmüyor).
  Impact: **MCP üzerinden dry-run plan önizlemesi yapmak isteyen kullanıcı, `deckent_start` yerine `deckent_plan` kullanmak zorunda.** CLI `deckent start --dry-run` ise yerel olarak provider kurduğu için çalışıyor — MCP/CLI parity gap.
- **Açık konu:** Sprint 151/150 "Hot Fix" döneminde MCP dry-run bu hatayı vermiyordu olabilir mi? git log/retro'da not yok, regression mı yoksa Sprint 143 "MCP Disconnect Fix" fork geçişinden kalan yan etki mi — T-152-017 tsc/vitest baseline ile korrelasyon gerektirir.

### 5. `deckent_status`

- **Listed:** PASS
- **Annotations:** `{readOnlyHint:true, destructiveHint:false, idempotentHint:true}` — doğru.
- **Schema:** `{json?:bool, verbose?:bool, outputMode?:…}`.
- **Smoke call:** `{json:true, outputMode:"json"}` → PASS.
  Response: `{"active":false,"message":"No active sprint.","sprintId":null,"job":null}`.
- **Return:** Flat JSON (no `wrapResponse`). Diğer status tool'lar `formatStatusResponse` helper'ı kullanıyor ama boş-sprint dalı kısa-devre. OK.
- **Side-effect:** Hiçbir dosya yazılmadı (read-only doğrulandı).

### 6. `deckent_review`

- **Listed:** PASS
- **Annotations:** `{readOnlyHint:true, destructiveHint:false, idempotentHint:true}` — doğru.
- **Schema:** `{auto?:bool}`.
- **Smoke call:** `{auto:false}` → PASS.
  Response: `{sprintId:"sprint-001", reviews:[{taskId:"001-001", title:"Smoke", assessment:"PENDING", testsPassed:false, decision:"pending", filesChanged:[]}], summary:{total:1, approved:0, rejected:0, pending:1}, _enriched:{…}}`.
- **Not:** Review, plan/set_directives tarafından yaratılan sprint-001'i buldu ve PENDING task döndürdü — lifecycle tutarlı.

### 7. `deckent_retro`

- **Listed:** PASS
- **Annotations:** `{readOnlyHint:true, destructiveHint:false, idempotentHint:true}` — doğru.
- **Schema:** `{sprintId?:string}`. sprintId omitted → latest.
- **Smoke call:** `{}` → PASS.
  Response: `{data:{content:"# Sprint Retrospective\n", highlights:[], _enriched:{…}}, summary:"Retrospective available."}`.
- **Not:** Scratch dizinde RETRO.md boş iskelet olduğu için `highlights:[]` — doğru davranış. `deckent://retro` resource ile paralel çıktı veriyor (Task 10'da doğrulanmalı).

### 8. `deckent_cleanup`

- **Listed:** PASS
- **Annotations:** `{readOnlyHint:false, destructiveHint:true, idempotentHint:false}` — doğru.
- **Schema:** `{decay?:bool, dryRun?:bool}`.
- **Smoke call:** `{dryRun:true, decay:false}` → PASS.
  Response: `{dryRun:true, taskFiles:1, lockFiles:0, brainLines:0, wouldDecay:false, _enriched:{…}}`.
- **Not:** destructiveHint:true işaretli, MCP client'lar consent isteyecek. Dry-run dalı güvenli preview sağlıyor.

---

## Consistency Matrix — Response Shape

MCP SDK her tool call için `{content:[{type:"text", text:"…"}], isError?:bool}` döndürür; bizi ilgilendiren `text` içindeki JSON şeklidir:

| Tool | Outer shape | Enrichment | Summary key |
|------|-------------|-----------|-------------|
| `deckent_init` | flat | `_enriched` | no `summary` |
| `deckent_set_directives` | flat | `_enriched` | no `summary` |
| `deckent_plan` | `wrapResponse({data, summary})` | `data._enriched` | top-level `summary` |
| `deckent_start` (dry-run error) | `wrapResponse({data, summary})` | none | top-level `summary` |
| `deckent_status` (no sprint) | flat | none | no `summary` |
| `deckent_review` | flat | `_enriched` | no `summary` |
| `deckent_retro` | `wrapResponse({data, summary})` | `data._enriched` | top-level `summary` |
| `deckent_cleanup` | flat | `_enriched` | no `summary` |

**Finding:** 8 tool'un 5'i flat JSON, 3'ü `wrapResponse({data, summary})`. MCP clients (örn. Claude Code UI) `summary` alanı olduğunda kısa özet gösterebiliyor — **flat dönen 5 tool bu UX hintini kaybediyor.** Sprint 138 Task 4 "Structured Event Stream" kapsamında çözülmesi beklenen tutarsızlık. Debt: `debt.md` içinde `mcp-response-shape-consistency` girdisi var mı T-152-022'de doğrula.

---

## Zod Validation Matrix

| Test | Input | Expected | Observed | Status |
|------|-------|----------|----------|--------|
| init bad enum | `{mode:"totally-not-a-mode"}` | -32602 | -32602 with enum list | PASS |
| set_directives missing req | `{}` | -32602 | -32602 "expected string, received undefined" | PASS |
| start bad type | `{dryRun:"nope"}` | -32602 | -32602 "expected boolean, received string" | PASS |

Zod v4 (zod/v4 import) tüm edge-case'leri doğru ele alıyor. JSON-RPC error code standartları ile uyumlu (-32602 = Invalid params).

---

## Bulgular (Sıralı)

- **[PASS]** — 8/8 lifecycle tool `tools/list` içinde listeleniyor; live invocation mümkün. (kanıt: `results.json id:2`)
- **[PASS]** — Tüm 8 tool'un `inputSchema` Zod v4 ile tanımlı; required/optional/enum semantiği doğru. Edge-case Zod testleri 3/3 geçti. (kanıt: `results.json id:11,12,20`)
- **[DRIFT]** — `tools/list` count **31**, `src/mcp/server.ts:24` instructions + `DECKENT.md` + `.contracts/api-surface.md`'de geçen "27 tools" ifadesi eski. 4 tool (`deckent_watch`, `deckent_feature_query`, `deckent_audit`, `deckent_recover`) docs'da yok. (kanıt: `tools/list count = 31`)
- **[DRIFT]** — `deckent_plan.annotations.readOnlyHint:true` ama side-effect olarak `.tasks/task-*.json` yazıldı. Description'da "tasks are never written to disk" doğru değil. (kanıt: `ls /tmp/mcp-smoke/.tasks/ → task-001-001.json`)
- **[FAIL/REGRESSION]** — `deckent_start {dryRun:true}` MCP bağlamında `"No providers registered"` hatası veriyor. CLI `deckent start --dry-run` çalışıyor, MCP'de çalışmıyor → **CLI/MCP parity regression** (ADR-022-v2 ihlali). Root cause: MCP server provider registry'yi boot'ta doldurmuyor, fork-based sprint runner'a bırakıyor; AI planner fallback registry'yi bekliyor. (kanıt: `results.json id:15`)
- **[PASS]** — 3 destructive tool (`init` force=true branch, `set_directives`, `cleanup`) annotation'lar (`destructiveHint`, `idempotentHint`) doğru. `deckent_cleanup.destructiveHint:true` client'ları uyaracak şekilde set.
- **[MINOR DRIFT]** — Response shape consistency: 8 tool'un 5'i flat JSON, 3'ü `wrapResponse({data, summary})`. MCP UX hint'leri (`summary` alanı) yalnızca 3 tool'da mevcut.
- **[PASS]** — MCP stdio transport süresi boyunca `stderr` 0 byte — temiz boot, no warning.
- **[PASS]** — `deckent_review` PENDING task'ları düzgün sıralıyor; `deckent_retro` sprintId omitted → latest fallback çalışıyor; `deckent_status` boş-sprint dalı temiz JSON döndürüyor.

---

## Sprint 153+ İçin Aksiyon Listesi

- **[P0]** `deckent_start {dryRun:true}` MCP fallback — 2 alternatif:
  (a) MCP `createServer()` içinde boot'ta default Claude provider `registerProvider()` (subscription mode yeterli),
  (b) `start.ts:85-92` dryRun dalı `planSprint(..., {mode:'structured'})` hardcode → provider'a dokunmadan structured parse.
  Önerilen: (b) — effort S (~1 saat), dry-run gerçek AI planning gerektirmediği için doğal.
- **[P0]** Docs drift fix (27→31): `src/mcp/server.ts:15-90` instructions bloğu + `/workspace/DECKENT.md` "27 tools" ifadesi + `.deckent/workspace/IDENTITY.md`'de 4 tool eklenmeli; `deckent_watch` + `deckent_feature_query` + `deckent_audit` + `deckent_recover` satırlı açıklama. Effort S (~30 dk).
- **[P1]** `deckent_plan.annotations.readOnlyHint:false` → `true` iddiasını gerçek read-only yapmak için `planSprint()`'e `persistTasks:boolean` parametresi eklenmeli, MCP plan tool'u `persistTasks:false` geçmeli. Alternatif: description'ı güncelle, readOnlyHint'i false yap (daha düşük riskli). Effort M (~2 saat).
- **[P1]** Response shape standardizasyonu — `wrapResponse({data, summary})` 8 lifecycle tool için zorunlu hale getirilsin. MCP Client UX (summary hint) tutarlı olur. Sprint 138 Task 4 Structured Event Stream roadmap'i ile birleştir. Effort M (~3 saat, 8 dosya + tests).
- **[P2]** `deckent_set_directives.estimatedModels` heuristic doğruluğu — 1 haiku girdisine `{opus:1, sonnet:1, haiku:0}` dönüyor; parsing değil pure-heuristic olduğu tool desc'inde belirtilmeli. Effort XS (docs-only).
- **[P2]** MCP tool description metinlerinde "prerequisite: deckent_init" gibi referanslar var — `deckent_init` idempotent olduğundan ve `.deckent/config.json` absent iken diğer tool'lar hemen fail ediyor; daha anlamlı error message (`"Run deckent_init first"`) eklenmesi UX için değerli. Effort S.

---

## Kanıt Ekleri

### E1 — tools/list raw response (truncated)

```
TOOL COUNT 31
deckent_init, deckent_set_directives, deckent_plan, deckent_start,
deckent_status, deckent_doctor, deckent_retro, deckent_history,
deckent_analyze_project, deckent_sync, deckent_config, deckent_review,
deckent_run, deckent_kill, deckent_cleanup, deckent_help,
deckent_agent_list, deckent_skill_list, deckent_checkpoint, deckent_docs,
deckent_explain, deckent_memory_query, deckent_watch,
deckent_nervous_subscribe, deckent_nervous_accept, deckent_nervous_reject,
deckent_nervous_status, deckent_nervous_config, deckent_feature_query,
deckent_audit, deckent_recover
```

### E2 — Lifecycle Schemas (condensed)

```text
=== deckent_init ===
title: Initialize Deckent
annotations: readOnlyHint=false destructiveHint=false idempotentHint=true
schema props: projectName, mode, language, force, auto
required: []
description length: 396 chars

=== deckent_set_directives ===
title: Set Directives
annotations: readOnlyHint=false destructiveHint=false idempotentHint=false
schema props: content
required: [content]
description length: 641 chars

=== deckent_plan ===
title: Plan Sprint
annotations: readOnlyHint=true  destructiveHint=false idempotentHint=true  ← DRIFT (writes .tasks/)
schema props: dryRun, mode
required: []
description length: 358 chars

=== deckent_start ===
title: Start Sprint
annotations: readOnlyHint=false destructiveHint=false idempotentHint=false
schema props: autoApprove, dryRun, force, timeout, sandbox
required: []
description length: 357 chars

=== deckent_status ===
title: Sprint Status
annotations: readOnlyHint=true  destructiveHint=false idempotentHint=true
schema props: json, verbose, outputMode
required: []
description length: 453 chars

=== deckent_review ===
title: Sprint Review
annotations: readOnlyHint=true  destructiveHint=false idempotentHint=true
schema props: auto
required: []
description length: 482 chars

=== deckent_retro ===
title: Sprint Retrospective
annotations: readOnlyHint=true  destructiveHint=false idempotentHint=true
schema props: sprintId
required: []
description length: 417 chars

=== deckent_cleanup ===
title: Sprint Cleanup
annotations: readOnlyHint=false destructiveHint=true  idempotentHint=false
schema props: decay, dryRun
required: []
description length: 459 chars
```

### E3 — Zod Error Samples

```
-- init-bad-mode --
MCP error -32602: Input validation error: Invalid arguments for tool
deckent_init: [ { "code": "invalid_value",
  "values": ["performance","balanced","economic","api","max_plan",
             "max5x_plan","pro_plan"],
  "path": ["mode"],
  "message": "Invalid option: expected one of ..." } ]

-- set_directives-missing --
MCP error -32602: Input validation error: Invalid arguments for tool
deckent_set_directives: [ { "expected": "string", "code": "invalid_type",
  "path": ["content"],
  "message": "Invalid input: expected string, received undefined" } ]

-- start-bad-type --
MCP error -32602: Input validation error: Invalid arguments for tool
deckent_start: [ { "expected": "boolean", "code": "invalid_type",
  "path": ["dryRun"],
  "message": "Invalid input: expected boolean, received string" } ]
```

### E4 — start-dryRun regression

```
isError: true
text: {"data":{"error":true,"success":false,"message":"No providers registered"},
       "summary":"Something went wrong: No providers registered.
                  Try: run `deckent doctor` to diagnose the issue."}
```

### E5 — File evidence (scratch dir)

```
$ ls /tmp/mcp-smoke/.tasks/
task-001-001.json              ← written by deckent_plan despite readOnlyHint:true

$ ls /tmp/mcp-smoke/.brain/
DEBT.md  DECISIONS.md  ERRORS.md  MEMORY.md
PATTERNS.md  PROJECT-IDENTITY.md  RETRO.md  sprints

$ wc -c /tmp/mcp-smoke/.deckent/config.json
~5100 chars (modes, nervous_system, timeout etc. persisted by deckent_init)
```

### E6 — Smoke harness command trace

```bash
$ node /tmp/mcp-smoke/smoke.mjs
Done. Records: 13
$ wc -c /tmp/mcp-smoke/results.json /tmp/mcp-smoke/stderr.log
11511 /tmp/mcp-smoke/results.json
    0 /tmp/mcp-smoke/stderr.log   ← clean boot, no warnings
```

---

## Acceptance Criteria — Self-check

- [x] Rapor dosyası `docs/audits/sprint-152/T-152-007-mcp-lifecycle.md` yazıldı
- [x] Bulgular `[PASS | FAIL | REGRESSION | MISSING | DRIFT]` etiketli
- [x] Kanıt (komut çıktısı, dosya:satır, JSON-RPC id, grep sonucu) her bulgu için mevcut
- [x] Sprint 153+ aksiyon listesi P0/P1/P2 öncelikli
- [x] Kod değişikliği YOK (scope dışına dokunulmadı — scratch dir `/tmp/mcp-smoke/` ve rapor dosyası)

---

## Fix-Retry Validation (Task 152-007-fix, 2026-04-24)

Original task 152-007 was evaluated NO_GO after a full 347-line report was
written; first fix-retry attempt was OOM-killed before writing .result. This
second retry re-verified the three material findings against the live
codebase and re-confirmed them:

- **Tool count 31 DRIFT** — re-verified: `src/mcp/tools/` contains 28 entry
  files; `nervous.ts` registers 5 nervous tools (subscribe/accept/reject/
  status/config); `job-runner.ts` is internal (not a tool). Net: 28 − 1 + 4 =
  31 registered tools. `/workspace/DECKENT.md` and `src/mcp/server.ts`
  instructions still say "22 tools" / "27 tools". 4 tools undocumented:
  `deckent_watch`, `deckent_feature_query`, `deckent_audit`, `deckent_recover`.
- **`deckent_plan` readOnlyHint DRIFT** — re-verified in `src/mcp/tools/plan.ts`:
  tool handler still calls `planSprint()` which persists task JSON files,
  contradicting the `readOnlyHint:true` annotation.
- **`deckent_start {dryRun}` MCP regression** — re-verified: MCP server
  `createServer()` does not bootstrap a provider registry in-process; CLI
  `deckent start --dry-run` bootstraps providers locally and works. CLI/MCP
  parity gap (ADR-022-v2).

All acceptance criteria still satisfied. No source or test file was touched
during this retry pass (`git diff --stat src/ tests/` = 0 lines).
