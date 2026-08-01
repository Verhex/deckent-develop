# T-152-009: MCP Smoke Part 3 — Docs + Agent/Skill + Nervous + Beta Trio (12 tools)

**Sprint:** sprint-152 (post-migration READ-ONLY audit)
**Date:** 2026-04-24
**Worker:** w-152-009 (model: opus, effort: normal)
**Scope:** `docs/audits/sprint-152/T-152-009-mcp-nervous-beta.md`

## Özet

12 MCP tool'un schema, handler wiring ve registry kaydı kanıt tabanlı doğrulandı. `src/mcp/tools/index.ts:30-58` içerisinde 27 `register*Tool` çağrısı yapılıyor; bunlardan `registerNervousTools` içinde 5 ayrı `server.registerTool` olduğu için **MCP server'ın kullanıcıya dönen gerçek tool sayısı 31'dir** (grep: `server.registerTool(` → 31 match in `src/mcp/tools/`). DECKENT.md + IDENTITY.md "22 tool" iddia ediyor; DIRECTIVES.md §Task 9 "27 tool" diyor. **Her iki satır de gerçek koddan drift — Sprint 153'e doc-update debt olarak taşınmalı.** `deckent_kill` şeması görsel inceleme ile doğrulandı ama **ASLA invoke edilmedi** (destructive). 12 hedef tool'un hepsi **FOUND + SCHEMA VALID**; sadece 3 dokümantasyon drift'i var.

## Bulgular

### Kayıt Altyapısı (Infrastructure)

- [PASS] — MCP server entry point: `src/mcp/server.ts:134` (`registerTools(server)` çağrısı). Tool index: `src/mcp/tools/index.ts:30-58` (27 register function).
- [PASS] — Tool dosyaları: `src/mcp/tools/*.ts` = 27 dosya `server.registerTool` içeriyor. `grep -rn "server.registerTool" src/mcp/tools/ | wc -l` → **31 toplam çağrı** (nervous.ts içinde 5 ayrı registrations).
- [DRIFT] — **Tool sayısı mismatch.** `DECKENT.md` "22 tools" + `IDENTITY.md` "MCP Tools: 23" + `DIRECTIVES.md` "27 tool" — ama koda göre 31. Sprint 147 sonrası nervous 5+ feature-query + audit + recover eklenmesiyle aritmetik kaydırmış. **Sprint 153 doc-sync debt'i.**

### Group 1: Docs + Agent/Skill (4 tool)

1. **deckent_docs** — [PASS]
   - File: `src/mcp/tools/docs.ts:12-14`
   - Schema (Zod v4): `{ action: enum(add|remove|list|update|run), file?, autoSections?[], protectedSections?[], addAutoSections?[], removeAutoSections?[], addProtectedSections?[], skills?[], maxLines?, root? }`
   - Handler: lines 32-141 → `addDoc/removeDoc/loadDocsConfig/saveDocsConfig` (managed-docs/docs-config.js) + `runManagedDocUpdates` + `buildStandaloneDocContext`
   - Annotations: `readOnlyHint: false, destructiveHint: false, idempotentHint: true` (line 18)
   - **Managed-Docs bağlantısı**: ADR-029 (universalization) + ADR-030 (template engine + plugin loader). Sprint 131'de tanıtılan `src/orchestra/managed-docs/` paketine doğru wire.
   - Runtime aktif: `.deckent/config.json` `deckent_style: "sprint"` ile uyumlu.

2. **deckent_agent_list** — [PASS]
   - File: `src/mcp/tools/agent-list.ts:68-70`
   - Schema: **input şeması YOK** (parametresiz read-only)
   - Handler: `readAgents(root)` → `.deckent/agents/*/agent.json` tarar; returns `{id, name, type: built-in|temp, uses, successRate}` sıralı liste
   - Annotations: `readOnlyHint: true, destructiveHint: false, idempotentHint: true` (lines 78-81)
   - **Live proof (CLI parity)**: `node dist/cli/entry.js agent list` → 17 agent (15 built-in ADR-037 RBAC + 2 temp: `temp-react-specialist`, `temp-react-ts-specialist`). `IDENTITY.md` "16 built-in + 2 custom" ile 1 ayrı yerde mismatch var (15 built-in görüldü; kayıp agent: `test-writer` Sprint 148 reform ile YASAK — ROADMAP §11.2, doğru davranış).

3. **deckent_skill_list** — [PASS]
   - File: `src/mcp/tools/skill-list.ts:54-56`
   - Schema: **input şeması YOK** (parametresiz read-only)
   - Handler: `readSkills(root)` → `.deckent/skills/*/manifest.json` tarar; returns `{id, name, category, triggers[]}` + `byCategory` özeti
   - Annotations: `readOnlyHint: true, destructiveHint: false, idempotentHint: true` (lines 65-68)
   - **Live proof (CLI parity)**: `node dist/cli/entry.js skill list` → **21 built-in skill** enabled (DECKENT.md + IDENTITY.md "21 built-in" ile %100 match). Priority `system-architect: 12, testing-expert: 10, typescript-expert: 10` gibi sıra ADR-032 i18n pattern ile uyumlu.

4. **deckent_kill** — [PASS] — **SCHEMA-ONLY (not invoked)**
   - File: `src/mcp/tools/kill.ts:79-82` (registerKillTool)
   - Schema: `{ taskId?: string, all?: boolean (default false) }`
   - Handler: `killTaskById` (lines 14-55) + `killAllTasks` (lines 57-77): task status → PAUSED, heartbeat unlink, lock cleanup
   - Annotations: `readOnlyHint: false, destructiveHint: true, idempotentHint: false` (line 85) — **doğru destructive flag**
   - Guard (lines 95-100): `!taskId && !all` → early return error (Zod prevents empty call)
   - **Uyum**: DIRECTIVES.md "ASLA çalıştırma, sadece schema" → ✅ bu denetim kesinlikle hiç invoke etmedi.

### Group 2: Nervous System (5 tool — Sprint 147 Task 16)

Tümü tek dosyada: `src/mcp/tools/nervous.ts`. Registrasyon fonksiyonu: `registerNervousTools(server)` at line 336-342.

5. **deckent_nervous_subscribe** — [PASS]
   - File: `src/mcp/tools/nervous.ts:54-80`
   - Schema: `{ sprintId?: string }`
   - Handler (lines 67-80): in-memory `subscribers: Set<string>` (line 50) → `subscribers.add(subId)`
   - Annotations: `readOnlyHint: false, destructiveHint: false, idempotentHint: true` (line 62)
   - **Caveat**: Subscribe in-memory (process-lifetime) — MCP server yeniden başlarsa state kaybolur. Sprint 153+ için **persistent subscriber store** önerilir (Nervous System `src/nervous/history.ts` ile birleştirilebilir).

6. **deckent_nervous_accept** — [PASS]
   - File: `src/mcp/tools/nervous.ts:84-131`
   - Schema: `{ id: string }` (zorunlu)
   - Handler (lines 97-131): `NervousHistory.load()` → `findById(id)` → `markAsAccepted()`
   - Annotations: idempotent

7. **deckent_nervous_reject** — [PASS]
   - File: `src/mcp/tools/nervous.ts:135-175`
   - Schema: `{ id: string, reason?: string }`
   - Handler (lines 149-175): `NervousHistory.findById → markAsRejected(reason)`

8. **deckent_nervous_status** — [PASS]
   - File: `src/mcp/tools/nervous.ts:179-229`
   - Schema: `{ root?: string }`
   - Handler (lines 191-229): `loadNervousConfig` + `NervousHistory.load` + pending notifications counter
   - **Runtime bağlantısı**: Sprint 150A H6 DECKENT→USER:NOTIFY canal (12 sprint sonra tekrar canlı) → Sprint 151 T-151-009 smoke (22 E2E). Status tool bu canal'ı okur.

9. **deckent_nervous_config** — [PASS]
   - File: `src/mcp/tools/nervous.ts:233-329`
   - Schema: `{ action: enum(read|set_preset|set_override|list_actions|reset), preset?: enum(yolo|balanced|cautious|off), overrides?: Record<string, 'auto'|'suggest'|'off'>, root? }`
   - Handler (lines 251-329): `.deckent/config.json` `nervous_system` alanını read/write + `ACTION_REGISTRY` ile eylem listeleme
   - Detector wiring: Sprint 147+148+151 T-151-015 yeni detectorlara hook atıyor (bkz T-152-012).

### Group 3: Sprint 150 Beta Trio (3 tool)

10. **deckent_audit** — [PASS]
    - File: `src/mcp/tools/audit.ts:8-10`
    - Schema: `{ sprintId: string }` (zorunlu)
    - Handler (lines 19-55): `runSelfAuditGate(sprintId, root)` → writes `.deckent/<sprintId>-gate.json` (line 28-29)
    - Annotations: `readOnlyHint: true, destructiveHint: false, idempotentHint: true` (line 14)
    - **Gate result schema**: `{ overallGate: PASS|GATE_FAILURE, tsc: status+errors[], vitest: status+delta, honesty: violations+flaggedTasks, observability: metricsJsonlExists+lineCount, gatePath }`
    - **Sprint 150 context**: Brain Self-Audit Gate (Sprint 134 T-014 → T-150 T-028 brain evaluator verification fix) canlı wire. `.deckent/sprint-152-metrics.jsonl` mevcut → observability OK.
    - `sprint-151-gate.json` observed: Sprint 151 **GATE_FAILURE** (1 vitest fail, ROADMAP §1 Sprint 151). Bu tool o sonucu üreten canlı pipeline.

11. **deckent_feature_query** — [PASS]
    - File: `src/mcp/tools/feature-query.ts:42-44`
    - Schema: `{ category?: string, id?: string }` (zod v3, `import { z } from 'zod'` — ⚠️ drift: diğerleri `zod/v4` kullanıyor, line 7)
    - Handler (lines 61-143): `.deckent/features-manifest.json` read → category filter (active/lightly_used/dormant/dead/all) veya id lookup
    - Annotations: read-only, idempotent (lines 51-55)
    - **Sprint 150 context**: "Feature Manifest Canlılaştırma" (T-029). `node scripts/sync-manifest.mjs` ile regenerate.
    - **Potential drift**: Zod v3 vs v4 tutarsızlığı. TypeScript 0 error verdi, ama uzun vadeli Sprint 153 debt.

12. **deckent_recover** — [PASS]
    - File: `src/mcp/tools/recover.ts:14-16`
    - Schema: `{ sprintId: string, dryRun?: boolean (default false), skipAudit?: boolean (default false) }`
    - Handler (lines 27-125): `runSelfAuditGate` → `cleanOrphanIpcDirs` (dead PIDs only) → `clearStaleLocks(STALE_LOCK_AGE_MS = 5min)` → `postFinalizeCleanup` (archive terminal task files)
    - Annotations: `readOnlyHint: false, destructiveHint: true, idempotentHint: false` (line 20) — **doğru destructive flag**
    - **dryRun enforcement**: lines 42-78 pure preview (no fs mutation)
    - **Sprint 150 context**: Sprint takılması senaryosu (T-019 Error Resolution Guide `deckent kill --all → cleanup → doctor` yerine tek tool-atomik recovery).

### Dokümantasyon Drift Özeti

| Kaynak | İddia | Gerçek | Delta |
|-------|-------|--------|-------|
| DECKENT.md `## MCP Integration` | 22 tools | 31 tools | **-9** |
| IDENTITY.md `Project Status` tablosu | 23 tools | 31 tools | **-8** |
| DIRECTIVES.md §Task 9 | "27 tool" | 31 tools | **-4** |
| DECKENT.md "8 resources" | 8 | 8 | ✅ |
| DECKENT.md "16 built-in agents" | 16 | 15 enabled (ADR-037/148 reform ile test-writer yasak) | **-1 (amaçlı)** |
| DECKENT.md "21 built-in skills" | 21 | 21 | ✅ |

**Not**: 31 tool listesi:
init, set_directives, plan, start, status, doctor, retro, history, analyze_project, sync, config, review, run, kill, cleanup, help, agent_list, skill_list, checkpoint, docs, explain, memory_query, watch, nervous_subscribe, nervous_accept, nervous_reject, nervous_status, nervous_config, feature_query, audit, recover.

## Sprint 153+ İçin Aksiyon Listesi

- [P0] — **Doc sync**: DECKENT.md (line "## MCP Integration\n- **22 tools**") + IDENTITY.md (`MCP Tools: 23`) + DIRECTIVES Sprint template → gerçek 31 tool sayısına çek. Otomatikleştir: `scripts/count-mcp-tools.mjs` (grep-based) + managed-docs auto-update hook (`deckent_docs` action=update).
  - **Effort**: low (30dk).
  - **Why P0**: ADR-022-v2 "CLI/MCP feature parity" + Sprint 160 CLI/MCP parity audit prep'i için guaranteed source of truth gerekli.

- [P0] — **Zod v3→v4 birleşmesi**: `src/mcp/tools/feature-query.ts:7` tek kaldı v3'te; 26 diğer dosya `zod/v4`. Migration: `z.object` API'si uyumlu olduğundan 1-line import swap + schema validation re-run.
  - **Effort**: low (15dk).

- [P1] — **Nervous subscribe persistence**: `src/mcp/tools/nervous.ts:50` `subscribers: Set<string>` in-memory → process restart kaybı. `.deckent/nervous-subscribers.json` veya mevcut `NervousHistory` DB alanı ekle. Sprint 159 Nervous 6-10 detector activation hedefi ile uyumlu.
  - **Effort**: normal (1h).

- [P1] — **Smoke harness** (T-151-NEW-C kalanı): Sprint 152 CLI harness'ı MCP tarafına da genişlet — `scripts/mcp-smoke.mjs` ile stdio JSON-RPC `tools/list` + `resources/list` + her tool için read-only `tools/call` (kill + recover hariç). CI'ya bağla.
  - **Effort**: normal (2-3h).

- [P2] — **Tool annotation audit**: `destructiveHint: true` olan tüm tool'lar için `annotations` + doc `DESTRUCTIVE:` prefix tutarlılığı doğrula (kill, recover, cleanup, run, plan?, start?). Sprint 147 T-151-NEW yeni annotation kuralı.
  - **Effort**: low (45dk).

- [P2] — **`deckent_kill` dry-run option**: Recover'da `dryRun` var; kill'de yok. Smoke test + audit sprintleri için güvenli preview modu (`dryRun: true` → would-kill listesi, unutma).
  - **Effort**: low (30dk).

- [P2] — **`deckent_watch` MCP tool**: `src/mcp/tools/watch.ts:23` tek tool `registerWatch` — DECKENT.md/DIRECTIVES.md tool listesinde HIÇ bahsedilmiyor. Kullanıcı-görünür mü, gizli mi? Sprint 153 doc sync ile birlikte listeye ekle veya hide.

## Kanıt Ekleri

```bash
# Tool dosya sayısı
$ ls src/mcp/tools/*.ts | wc -l
27

# Toplam server.registerTool çağrısı
$ grep -rn "server.registerTool" src/mcp/tools/ | wc -l
31

# Nervous register function sayısı
$ grep -n "^export function" src/mcp/tools/nervous.ts
54:export function registerNervousSubscribeTool
84:export function registerNervousAcceptTool
135:export function registerNervousRejectTool
179:export function registerNervousStatusTool
233:export function registerNervousConfigTool
336:export function registerNervousTools    # orchestrator

# Agent/Skill live CLI parity
$ node dist/cli/entry.js agent list | wc -l  # header + 17 agent row
19
$ node dist/cli/entry.js skill list | wc -l  # header + 21 skill row
23

# Filesystem skill/agent count
$ ls .deckent/skills | wc -l
21
$ ls .deckent/agents | grep -v archive | wc -l
17   # 15 built-in + 2 temp

# Index registrations
$ grep -c "register.*Tool(server)" src/mcp/tools/index.ts
27   # but nervous expands 5x → 31 final tools

# Entry point wiring
src/mcp/server.ts:134 → registerTools(server)
```

### Tool → Handler Evidence Table

| # | Tool | File:Line | Handler Target | Destructive |
|---|------|-----------|----------------|-------------|
| 1 | deckent_docs | `src/mcp/tools/docs.ts:12-14` | `managed-docs/docs-config + managed-doc-runner` | false |
| 2 | deckent_agent_list | `src/mcp/tools/agent-list.ts:68-70` | `readAgents(.deckent/agents/)` | false |
| 3 | deckent_skill_list | `src/mcp/tools/skill-list.ts:54-56` | `readSkills(.deckent/skills/)` | false |
| 4 | deckent_kill | `src/mcp/tools/kill.ts:79-82` | `killTaskById + killAllTasks` | **TRUE** |
| 5 | deckent_nervous_subscribe | `src/mcp/tools/nervous.ts:54-56` | `subscribers: Set` | false |
| 6 | deckent_nervous_accept | `src/mcp/tools/nervous.ts:84-86` | `NervousHistory.markAsAccepted` | false |
| 7 | deckent_nervous_reject | `src/mcp/tools/nervous.ts:135-137` | `NervousHistory.markAsRejected` | false |
| 8 | deckent_nervous_status | `src/mcp/tools/nervous.ts:179-181` | `loadNervousConfig + History.load` | false |
| 9 | deckent_nervous_config | `src/mcp/tools/nervous.ts:233-235` | `loadNervousConfig + saveNervousConfig + ACTION_REGISTRY` | false |
| 10 | deckent_audit | `src/mcp/tools/audit.ts:8-10` | `runSelfAuditGate → write .deckent/<sprint>-gate.json` | false |
| 11 | deckent_feature_query | `src/mcp/tools/feature-query.ts:42-44` | `readManifest(.deckent/features-manifest.json)` | false |
| 12 | deckent_recover | `src/mcp/tools/recover.ts:14-16` | `cleanOrphanIpcDirs + clearStaleLocks + postFinalizeCleanup` | **TRUE** |

### Sprint 152 Total MCP Audit Kanıtı (T-152-007..009 bridge)

T-152-007 (lifecycle 8) + T-152-008 (observational 10) + T-152-009 (bu task, 12) = **30 tool coverage**. Artı `deckent_watch` (T-152-007/008/009 içinde HIÇ explicit mentioned değil) = 31. **Not**: `deckent_watch` DIRECTIVES.md Task 9'da unutulmuş; Sprint 153 doc-sync P0 ile kapanacak.

## Self-Assessment Gerekçesi

- Baseline: `src/mcp/tools/` 27 dosya, 31 registerTool, 12 hedef tool tanımlı.
- End state: Her 12 tool için file:line + schema + handler + destructive flag kanıtlı tablo üretildi. Doc drift 3 yerde tespit edildi. 7 Sprint 153+ aksiyon listelendi.
- Delta: %100 — READ-ONLY audit tam kapsamlı.
- Kod değişikliği: 0 satır src/ veya tests/ içinde (scope-compliant).
