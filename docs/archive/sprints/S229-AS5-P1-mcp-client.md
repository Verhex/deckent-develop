# DIRECTIVES — Sprint 229 (AS-5·P1 — MCP-Client): MCP-Client Broker + REPL + Yönetim CLI (Claude-parity)

## Goal: deckent'i MCP **tüketicisine** evirten ilk dilim (MASTER-PLAN §4C Faz 1). Merkezi `McpClientBroker` harici MCP server'larına bağlanır (yerel stdio + uzak HTTP), tool'larını keşfeder, REPL agentic loop'ta **confirm-gate + audit** ile çağırır; `deckent mcp add/list/remove/get` CLI + `/mcp` REPL (Claude-parity). **SDK zaten dep** (`@modelcontextprotocol/sdk ^1.27.1`) → yeni dep YOK. Worker/otonom yüzeyleri Faz 2-3 (kapsam DIŞI). **god-level, RUN-VERIFY, CI yeşil KORUNUR.**

## Ortak kurallar
- **🟢 RUN-VERIFY (ADR-079):** kanıt **çağıran** dosyada (def DIŞLA); user-surface → `Smoke:` gerçek-binary şart. Mock-only = GO_WITH_TECH_DEBT.
- **🔴 HERMETİK:** tmpdir + sandbox HOME, **async spawn (spawnSync YASAK)**, `npm run test:ci-sim` yeşil. CI yeşil KORUNUR.
- ESM `.js` uzantısı. ≤200 LoC/task, YENİ test dosyası, **sadece kendi filesWrite'ına yaz** (paralel-güvenlik).
- **🔴 Güvenlik (§4C omurga):** harici MCP çağrısı keyfi yan-etkili → her çağrı **confirm-gate (tool-permissions)** + **audit (event-stream)**. İz bırakmadan harici aksiyon YOK. (RBAC/scope Faz 2.)

---

## Task 1: 229-001 — McpClientBroker çekirdek (SDK Client + stdio/HTTP transport)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/mcp-client/broker.ts, src/mcp-client/types.ts, tests/mcp-client/broker.test.ts
- Scope: src/mcp-client/, tests/mcp-client/
### Description
Yeni merkezi yönetici. SDK `Client` (`@modelcontextprotocol/sdk/client/index.js`) + `StdioClientTransport` (`.../client/stdio.js`) ve `StreamableHTTPClientTransport` (`.../client/streamableHttp.js`). `McpClientBroker`: `connect(serverDef)`, `listTools(server)`, `callTool(server, tool, args)`, `disconnect(server)`, connection pool + lifecycle (reconnect/health). Audit-hook **inject edilebilir** (`onCall?: (record)=>void`) — Task 5 wire eder (def burada, çağrı caller'da). Yeni dep YOK.
**Kanıt:** `grep -c "Client\|StdioClientTransport\|StreamableHTTP\|callTool" src/mcp-client/broker.ts` → ≥3; `npx vitest run tests/mcp-client/broker.test.ts` → 4+ pass
**Test:** ≥4 (stdio connect+listTools, callTool sonuç döner, disconnect temizler, server-yok→graceful hata) — hermetik (fake/mock MCP server, in-memory transport)
**Smoke:** (Tier-0 internal) unit yeterli.

## Task 2: 229-002 — 3-scope config (.mcp.json project/user/local merge)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/mcp-client/config.ts, tests/mcp-client/mcp-config.test.ts
- Scope: src/mcp-client/, tests/mcp-client/
### Description
Claude-parity scope modeli: **project** (`./.mcp.json`, git'te) + **user** (global `~/.deckent/mcp.json`) + **local** (kişisel/gizli) 3-katman merge (ADR-004 pattern). `loadMcpServers(root)` → `{ <name>: { transport:'stdio', command, args, env } | { transport:'http', url, headers } }`. Secret `.deck` ile çözülür (AS-2 pattern). Scope-precedence: local > project > user.
**Kanıt:** `grep -c "mcp.json\|project\|user\|local\|merge" src/mcp-client/config.ts` → ≥3; `npx vitest run tests/mcp-client/mcp-config.test.ts` → 3+ pass
**Test:** ≥3 (3-scope merge precedence, stdio+http def parse, dosya-yok→boş graceful) — hermetik (tmpdir .mcp.json fixture)
**Smoke:** (Tier-0) unit yeterli.

## Task 3: 229-003 — Dynamic discovery + namespaced tool registry
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/mcp-client/registry.ts, tests/mcp-client/mcp-registry.test.ts
- Scope: src/mcp-client/, tests/mcp-client/
- Dependencies: 229-001
### Description
Connect'te broker `tools/list` (+ `resources/list`) → tool'ları **namespaced** kaydet (`<server>__<tool>`) — deckent'in 32 kendi tool'uyla çakışmasın. `McpToolRegistry`: `register(server, tools)`, `resolve(namespacedName) → {server, tool}`, `list()`. Reconnect'te refresh. Caller registry dosyasında (def broker DIŞLA).
**Kanıt:** `grep -c "__\|namespace\|listTools\|resolve" src/mcp-client/registry.ts` → ≥3; `npx vitest run tests/mcp-client/mcp-registry.test.ts` → 3+ pass
**Test:** ≥3 (namespaced kayıt, resolve doğru server+tool, çakışma-yok, refresh idempotent) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 4: 229-004 — [Tier-1] `deckent mcp` yönetim CLI (add/list/remove/get)
- Model: opus
- Effort: normal
- Skills: api-builder, typescript-expert
- Files: src/cli/commands/mcp.ts, src/cli/index.ts, tests/cli/mcp-command.test.ts
- Scope: src/cli/commands/, src/cli/, tests/cli/
- Dependencies: 229-002
### Description
Claude-parity CLI (`claude mcp …` zihinsel modeli): `deckent mcp add <name> <cmd|url> [--scope project|user|local] [--transport stdio|http]`, `mcp list`, `mcp remove <name>`, `mcp get <name>`. `registerMcp(program)` (ADR-012 pattern) + **`src/cli/index.ts`'e WIRE** (0-caller olmasın). add/remove `.mcp.json` (Task 2 config) yazar. i18n: `getMessage` (hardcode string YOK — CLAUDE.md i18n-FIRST). Caller mcp.ts + index.ts.
**Kanıt:** `grep -c "registerMcp\|mcp.*add\|loadMcpServers" src/cli/commands/mcp.ts` → ≥2; `grep -c "registerMcp" src/cli/index.ts` → ≥1 (WIRE); `npx vitest run tests/cli/mcp-command.test.ts` → 4+ pass
**Test:** ≥4 (add→.mcp.json yazar, list→server'ları döker, remove→siler, scope flag onurlanır) — hermetik (tmpdir, async spawn)
**Smoke (Tier-1 ZORUNLU):** `env -u ANTHROPIC_API_KEY node dist/cli/entry.js mcp list 2>&1 | head` → kayıtlı server listesi (veya "kayıtlı server yok") — "Unknown command" DEĞİL, gerçek-binary çıktı.

## Task 5: 229-005 — [Tier-1] REPL `/mcp` dispatch + confirm-gate + audit composition
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/chat-mcp-bridge.ts, tests/cli/repl-mcp-dispatch.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: 229-001, 229-003
### Description
REPL composition: `/mcp` slash → broker'dan namespaced tool'ları listele; agentic loop bir `<server>__<tool>` çağırınca → **tool-permissions `classifyTool` confirm-gate** (read/confirm/always) + broker `callTool` + **audit sink** (event-stream `writeEvent` — Task 1 `onCall` hook'una bağla). chat-slash-registry'ye `/mcp` ekle + chat-tool-bridge dispatch'e MCP yolu. Caller chat-mcp-bridge.ts (def broker/event-stream/tool-permissions DIŞLA — burada İÇERİ alınıp çağrılır).
**Kanıt:** `grep -c "callTool\|writeEvent\|classifyTool\|broker\|mcp" src/cli/commands/chat-mcp-bridge.ts` → ≥3 (ÇAĞRI); `npx vitest run tests/cli/repl-mcp-dispatch.test.ts` → 4+ pass
**Test:** ≥4 (/mcp listele, namespaced çağrı→confirm sorar, confirm-onay→callTool+audit yazılır, reddet→çağrı yok) — hermetik (mock broker + tmpdir audit)
**Smoke (Tier-1 ZORUNLU):** `printf '/mcp\n/exit\n' | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head` → MCP server/tool listesi (veya "MCP server yok") — "Unknown command" DEĞİL.

---

**Beklenen:** 5/5 DONE. Wave-1 (229-001, 229-002 paralel) → Wave-2 (229-003→229-001'e bağlı; 229-004→229-002; 229-005→229-001+003). MCP-client çekirdeği canlı: yerel stdio reference server (örn. `@modelcontextprotocol/server-everything`) eklenir, `/mcp` listeler, REPL agentic confirm'li çağırır, audit kaydı düşer. Yerel/ücretsiz. CI yeşil KORUNUR. **Faz 2-3 (worker surface + RBAC + otonom + remote OAuth + dashboard) ayrı.**

İlgili: MASTER-PLAN §4C (AS-5) · F9-001/002/003 · F11-015 · ADR-037 (RBAC, Faz 2) · ADR-040 (nervous) · ADR-062 (audit) · ADR-012 (CLI register) · ADR-010 (SDK zaten dep). Memory: `feedback_proof_of_function_dod` · `feedback_directive_kanit_letter_vs_goal` · `project_ci_green_root_causes` · `feedback_god_level_i18n_quality_bar`.
