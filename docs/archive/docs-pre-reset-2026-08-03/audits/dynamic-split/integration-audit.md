# src/api/ + src/mcp/ + src/connectors/ + src/providers/ — Consolidated Integration-Surface Audit

**Task:** Sprint 185 / 185-005-fix — Dynamic-split codebase audit (integration surfaces)
**Auditor:** code-reviewer (worker `w-185-005-fix`, model `opus`)
**Date:** 2026-05-21
**Scope:** Four integration-surface trees — `src/api/` (15 files, 2,584 LoC), `src/mcp/` (39 files, 5,259 LoC), `src/connectors/` (7 files, 716 LoC), `src/providers/` (5 files, 1,711 LoC). **Total:** 66 `.ts` files, ~10,270 LoC.
**Output mode:** Single consolidated report (per DIRECTIVES Sprint 185 task scope — `integration-audit.md`, not 66 per-file reports).

> **Methodology note.** The original 9-section template ("Inventory + Bağlam + Debt Risk + Dead Code + Documentation Gaps + ADR Compliance + Refactor Recommendations + Sprint 187 Follow-up + Summary") is applied at the *report* level, not per file — same approach validated in `orchestra-audit.md`, `core-audit.md`, `cli-audit.md`, `frontend-audit.md`, `agents-nervous-monitor-audit.md`. Per-module observations are folded into Section 1 (Inventory) and the thematic sections that follow. Where a finding is module-specific, the file path is cited inline (`file:line` format).

---

## 1. Inventory

### 1.1 Sub-tree shape

| Path | Files | LoC | Role |
|---|---|---|---|
| `src/api/` (root) | 5 | 1,315 | HTTP API server + auth + rate-limiter + dashboard watcher + chat handler |
| `src/api/terminal/` | 10 | 1,089 | Embedded web terminal (ADR-062): PTY sessions, WS gateway, auth, audit, guards, outbound limiter |
| `src/mcp/` (root) | 2 | 351 | Stdio MCP server entry + singleton lock |
| `src/mcp/tools/` | 28 | 4,328 | 27 MCP tool registrations + `job-runner.ts` (shared job-state helper) |
| `src/mcp/resources/` | 8 | 297 | 8 MCP resource registrations (URI: `deckent://...`) |
| `src/mcp/helpers/` | 3 | 443 | `enrich.ts` (i18n summary/hints), `format.ts` (markdown summaries), barrel `index.ts` |
| `src/connectors/` | 7 | 716 | Messaging-platform connectors (Discord, Telegram, WhatsApp scaffold), base class, pool, webhook router, types |
| `src/providers/` | 5 | 1,711 | LLM provider adapters: Claude (tmux/subprocess/mcp), Codex, Gemini, Subprocess base, Sandbox |
| **Total** | **66** | **~10,270** | |

### 1.2 Module catalog (by role)

**A. HTTP API surface (`src/api/`, 5 files, 1,315 LoC)**
- `server.ts` (1,052) — `createHttpServer()` factory + `handleRequest()` router. All routes: `/api/status`, `/api/sprint`, `/api/history`, `/api/config`, `/api/doctor`, `/api/memory`, `/api/debt`, `/api/tasks`, `/api/job/:id`, `/api/worker/:id/log`, `/api/events` (SSE), `/api/start`, `/api/plan`, `/api/chat`, `/api/kill/:id`, `/api/set-directives`, `/api/cleanup`, `/api/webhooks/:connector/:key`. Embeds: `RateLimiter` class (duplicate of `rate-limiter.ts`, see §3 Dead Code), `generateApiToken`, security headers, Zod schema validation, terminal route bypass with token-injection into `index.html` (localhost-only, lines 988-1007).
- `auth.ts` (112) — `bearerAuthMiddleware()` factory + `resolveAuthToken()` + `verifyBearerToken()` (constant-time SHA-256 compare via `timingSafeEqual`). Secure-by-default: no token → 401. Explicit bypass via `DECKENT_API_AUTH_DISABLED=1` env var (logs warning).
- `rate-limiter.ts` (95) — `RateLimiter` class with token-bucket per-IP + auto-cleanup timer (`unref()`). **Currently unimported** — see §3.
- `watcher.ts` (28) — `watchDashboard()` debounced 500 ms `fs.watch` wrapper for SSE broadcast.
- `chat-handler.ts` (28) — `buildChatReply()` minimal stub for `/api/chat`: recognizes `status`/`help` commands, otherwise echo + help line.

**B. Embedded web terminal (`src/api/terminal/`, 10 files, 1,089 LoC) — ADR-062**
- `session-manager.ts` (152) — `PtySessionManager`: create/get/list/replay/write/resize/attach/detach/kill/reapIdle. Pluggable backend (`SessionBackend` interface). Per-session scrollback ring buffer (`scrollbackBytes`), idle timeout (`idleTimeoutMs`), max-sessions cap. Wires `command-guard.checkCommandGuard()` into write path for `kind=shell` sessions on non-localhost hosts.
- `session-backend.ts` (54) — `SessionBackend` interface + `LocalPtyBackend` implementation using `@lydell/node-pty`.
- `ws-gateway.ts` (232) — `attachTerminalGateway()`: `WebSocketServer` (ws@npm) `noServer` upgrade handler. Auth from `Sec-WebSocket-Protocol` header (browsers can't set Authorization on WS — spec §1c.2). Backpressure check (`BACKPRESSURE_LIMIT_BYTES=1_000_000`). Wires `matchPromptPatterns()` (prompt-guard) and optional `OutboundLimiter` for per-tenant outbound quota. mTLS hook reserved for sub-project #3 (lines 53-62).
- `auth-provider.ts` (54) — `AuthProvider` interface + `LocalTokenAuthProvider` (constant-time SHA-256 compare). **Deliberately ignores `DECKENT_API_AUTH_DISABLED`** — security invariant (spec §1c.2).
- `audit.ts` (109) — `TerminalAudit` recorder + `AuditSink`/`ChainedAuditSink` interfaces. HMAC-chain support via `audit-integrity.ts` when constructed with `integrity` config and chain-aware sink. Security invariant: raw PTY output **never** routed through (only short structured `detail` strings).
- `audit-integrity.ts` (152) — `computeAuditHmac()`, `loadOrCreateAuditKey()` (32-byte key at `.deckent/audit-key`, mode 0600), `verifyAuditChain()` walker. Sprint 179 W5-12.
- `command-guard.ts` (64) — pre-write deny-list for `kind=shell` on remote hosts. Patterns: `rm_rf_root`, `mkfs`, `dd_of_dev`, `fork_bomb`, `ssh_keygen_rewrite`, `authorized_keys_write`. Localhost-bypass set: `{127.0.0.1, ::1, localhost}`.
- `prompt-guard.ts` (47) — pre-bridge pattern matcher. Patterns: `base_blob` (≥256-char Base64), `osc_escape` (`\x1b]`), `curl_pipe_shell`. I1 + I2 invariants (`offset+patternId` only, never raw bytes).
- `outbound-limiter.ts` (91) — `OutboundLimiter` per-tenant byte budget. Token-bucket-style. Decision contract: `pass | warn (one-shot per window) | kill (sticky)`. Default 24h window, 50% warn fraction. **Not wired by default — see §3 / §4.**
- `types.ts` (34) — `TenantId`, `SessionKind=ai|deckent|shell`, `AiTool=claude|gemini|codex`, `CreateSessionInput`, `SessionMeta`, `AuditAction` union, `AuditEvent`.

**C. MCP server core (`src/mcp/`, 2 files, 351 LoC)**
- `server.ts` (224) — Stdio MCP entry. `createServer()` builds `McpServer` (name=`deckent`, version=`DECKENT_VERSION`), registers tools + resources, binds `McpNotificationAdapter`, initializes global `NotifyDispatcher` (CLI + MCP + File adapters). `bootSingletonGuard()` acquires lock. `DECKENT_MCP_INSTRUCTIONS` constant — **out-of-sync with reality (see §5).** Entry-point detection via `import.meta.url === argv[1]`.
- `server-singleton-lock.ts` (127) — `acquireSingletonLock()` (O_EXCL `openSync(path, 'wx')`), `releaseSingletonLock()`, `isProcessAlive()` (uses `process.kill(pid, 0)` + `EPERM` heuristic), `SingletonLockError`. PID-file at `.deckent/mcp-server.pid`. Sprint 161 T-006 double-MCP race fix.

**D. MCP tools (`src/mcp/tools/`, 28 files, 4,328 LoC)** — 27 registered tools + `job-runner.ts` shared helper.

| Tool | LoC | Notes |
|---|---|---|
| `init.ts` | 312 | Creates `.deckent/`, `.brain/`, `.tasks/`, `.locks/`, `.claude/rules/`, workspace dirs. Seeds `docs.json`. Auto-registers MCP in `.claude/settings.json`. `installMissing` calls `provisionMissing()` (ADR-063). |
| `directives.ts` | 87 | `deckent_set_directives` — writes `DIRECTIVES.md`. |
| `plan.ts` | 110 | `deckent_plan` — calls `planSprint()` from orchestra/brain. |
| `start.ts` | 237 | Forks `sprint-runner-entry.js` as **detached child** (`stdio: 'ignore'`, `unref()`) — Sprint 143 MCP disconnect fix. IPC config in `.deckent/{jobId}-ipc/`. Bootstraps providers for dry-run. Sprint lock check via `isSprintLocked()`. ⚠️ `force` flag: documented parity divergence (CLI skips doctor, MCP does not — lines 46-51). |
| `status.ts` | 487 | Status dashboard. **Strict ADR-008 file-system-only reads** (`readEventStreamTail`, `readLastOutputs`, `readMetricSnapshot`, `loadDepGraphFiles`) — no orchestra/ imports. Sprint 139 T-047 rich-output fields. `outputMode` enum: `explainatory|standart|verbose|json`. |
| `doctor.ts` | 89 | Health checks via `runDoctorChecks` (CLI helper). |
| `retro.ts` | 108 | Reads retro from `.brain/exports/retro.md`. |
| `history.ts` | 86 | Sprint history listing. |
| `analyze.ts` | 48 | Project stack analysis. |
| `sync.ts` | 49 | `ensureDeckentImport()` for CLAUDE.md + AGENTS.md (additive, never overwrite). |
| `config.ts` | 87 | Read/get/set/list config keys. |
| `review.ts` | 133 | Sprint result evaluation (GO/NO_GO/TECH_DEBT). |
| `run.ts` | 113 | Single-task execution. |
| `kill.ts` | 124 | `taskId` or `all` — sets status=PAUSED, removes hb files, deletes locks owned by task. |
| `cleanup.ts` | 138 | Removes `.tasks/*.{json,plan,hb,result,paused,log}` + `.locks/*`. Optional `decay` runs `runDecay()`. DB-first `getMemoryEntryCount()` via `MemoryStore`. |
| `help.ts` | 242 | Runtime capabilities + state detection + recommended next action. **Out-of-sync TOOLS array (see §5).** |
| `agent-list.ts` | 111 | Lists `.deckent/agents/*/agent.json` + built-ins. |
| `skill-list.ts` | 100 | Lists `.deckent/skills/*/skill.json` + built-ins. |
| `checkpoint.ts` | 148 | `list|approve|reject` checkpoint gates. Uses `validateSprintId()`, `validatePhase()`, `validatePath()` from `core/validators`. |
| `docs.ts` | 143 | Managed-docs add/remove/list. |
| `explain.ts` | 149 | Natural-language sprint result explainer. |
| `memory-query.ts` | 72 | `MemoryStore` + `searchMemory()` (FTS5 dual-layer). `mode=or|and` token join. |
| `watch.ts` | 129 | `deckent_watch` — push-based subscription via `server.sendLoggingMessage()`. `eventBus.subscribe()`. Channel-keyword filter. |
| `nervous.ts` | 508 | 5 sub-tools: `subscribe`, `accept`, `reject`, `status`, `config`. Pure handler exports `handleNervousAccept`/`handleNervousReject` (Sprint 180 W2-2). `panic:<taskId>` approval path. IPC queue via `NervousIpcQueue`. |
| `feature-query.ts` | 145 | Feature manifest query (active/dormant/dead). |
| `audit.ts` | 57 | Brain Self-Audit Gate runner — wraps `runSelfAuditGate()` from sprint-finalizer. Writes `.deckent/{sprintId}-gate.json`. |
| `recover.ts` | 127 | Crash-recovery chain: audit → `cleanOrphanIpcDirs(checkLivePid:true)` → `clearStaleLocks(>5min)` → `postFinalizeCleanup()`. |
| `job-runner.ts` | 97 | Shared `JobState`/`TaskSummary`/`writeJobState`/`readJobState`/`buildTaskSummaries`/`readLatestJobState` helpers used by start.ts + status.ts. |

**E. MCP resources (`src/mcp/resources/`, 8 files, 297 LoC)**
- All registrations follow the same shape: `server.registerResource(name, uri, { title, description, mimeType }, async (uri) => contents)`.
- `dashboard.ts` (32), `directives.ts` (26), `memory.ts` (36), `debt.ts` (50), `config.ts` (36), `retro.ts` (36), `tasks.ts` (41), `agents.ts` (46).
- `dashboard.ts` uses `readDashboardSafe()` (monitor/dashboard-manager) for auto-repair on parse failure.
- All resources read from filesystem (no orchestra/ imports — ADR-008 honored).

**F. MCP helpers (`src/mcp/helpers/`, 3 files, 443 LoC)**
- `enrich.ts` (98) — `EnrichedMeta`/`enrichResponse()`/`generateSummary()`/`generateHints()`. EN/TR i18n summaries hardcoded as record. **18 tool entries in `SUMMARIES`/`HINTS` (see §5 — drift).**
- `format.ts` (323) — `formatStatusResponse`, `formatPlanResponse`, `formatStartResponse`, `formatDoctorResponse`, `formatRetroResponse`, `formatHistoryResponse`, `formatErrorResponse`, `wrapResponse`. Markdown-summary builders used by tools to wrap raw JSON with human-readable text.
- `index.ts` (22) — barrel re-export.

**G. Connectors (`src/connectors/`, 7 files, 716 LoC)**
- `types.ts` (82) — `ConnectorId = 'discord' | 'telegram' | 'whatsapp' | 'slack' | 'email'`, `IncomingMessage`/`OutgoingMessage`, `IMessageConnector`, `ConnectorConfig`, `MessageHandler`.
- `base-connector.ts` (80) — `BaseConnector` abstract class. Lifecycle (`start`/`stop`), `onMessage` registration, `emitMessage` fan-out with try/catch isolation.
- `connector-pool.ts` (113) — `ConnectorPool` with `register`/`get`/`has`/`getAll`/`broadcast` (parallel `Promise.all`, per-target error isolation) + `startAll`/`stopAll` (sequential start, parallel stop) + `onAnyMessage`.
- `discord.ts` (74) — `DiscordConnector` extends `BaseConnector`. Uses `discord.js` (`Client`, `GatewayIntentBits`, `Events.MessageCreate`). Health via `client.ws.status === 0`.
- `telegram.ts` (112) — `TelegramConnector`. **Dynamic import of `telegraf` via `Function('m', 'return import(m)')(moduleName)`** — avoids tsc error when telegraf is not installed.
- `whatsapp.ts` (68) — `WhatsAppConnector` scaffold. Throws on `start({enabled:true})` — requires Business API approval. `isHealthy()` always false. Sprint 153+ activation target.
- `incoming-router.ts` (187) — `IncomingMessageRouter.route()` publishes `DeckentEvent` to `eventBus` on `CHANNELS.NOTIFY` channel. `validateWebhookKey()` constant-time compare. Discord/Telegram payload parsers. `isValidConnectorId()` type guard. Module-scope `routerSequence` counter (test-resettable via `_resetSequence`).

**H. Providers (`src/providers/`, 5 files, 1,711 LoC)**
- `claude.ts` (275) — `ClaudeAdapter` implementing `ProviderAdapter`. Three backends via `claude_backend`: `tmux` (default, delegates to `orchestra/tmux.ts`), `subprocess` (delegates to `SubprocessSpawnBackend`), `mcp` (**throws `ProviderError` — not implemented**, lines 41-43). `_cleanupOrphanedPromptFiles()` with selective filter via `getActiveWorkerIds()` (Sprint 168 C0e BUG-HH eradication). `parseAgentResponse()` unwraps `{type:"result", result:"..."}` envelope.
- `subprocess.ts` (327) — `SubprocessSpawnBackend` implementing `ProviderAdapter`. `SubprocessProviderConfig` interface + `CLAUDE_SUBPROCESS_CONFIG` default. `spawn()` writes initial + periodic (15s) heartbeats, redirects stdio to `.tasks/task-{id}.log`. **Cross-platform**: `shell: process.platform === 'win32'` for `.cmd`/`.ps1` wrappers (BUG-19 UTF-8 env). **BUG-24 fallback result**: writes `.result` with `selfAssessment` based on exit code if worker didn't. **BUG-26 fd lifecycle**: keeps logFd open until child exits.
- `codex.ts` (371) — `CodexAdapter`. Supports both Rust + Node CLI variants (`detectCliVariant()`). Auth detection: `OPENAI_API_KEY`/`DECKENT_OPENAI_API_KEY` env or `codex auth status` subscription. Args: `['exec', '--full-auto', prompt, '--model', model]`.
- `gemini.ts` (577) — `GeminiAdapter`. Uses `gemini -p <prompt> --output-format json -m <model> --approval-mode plan`. `parseGeminiOutput()` handles both single-JSON and NDJSON (`stream-json`) formats. Tier-mapping via `model-equivalence.getModelForProviderTier()` + direct `modelRegistry` lookup for `premium_plus`. REST API fallback header documented (`x-goog-api-key`).
- `sandbox.ts` (161) — `SandboxSpawnBackend extends SubprocessSpawnBackend`. Extra security layers: `enforceScope()` (allowedDirs check via `safeResolve`/`realpathSync`), `buildEnv()` adds `NODE_OPTIONS --max-old-space-size=${mb}`, optional `blockNetwork` via `http_proxy=127.0.0.1:0`. Activated via `--sandbox` flag on `deckent start`.

### 1.3 Public-API surface mapping (cross-tree)

| Boundary | Caller surface | Provider surface |
|---|---|---|
| Dashboard SPA / HTTP | `src/api/server.ts:handleRequest` | `cli/commands/doctor`, `cli/commands/history`, `orchestra/brain`, `core/config`, `core/deck-file`, `connectors/incoming-router`, `agents/worker:readWorkerLog`, `monitor/dashboard-manager` |
| MCP clients | `src/mcp/server.ts:registerTools+registerResources` | `core/*` (constants, config, MemoryStore), `orchestra/brain` (planSprint/readContext/runDecay), `orchestra/sprint-finalizer:runSelfAuditGate`, `orchestra/sprint-reporter:generateProjectIdentity`, `orchestra/event-bus`, `monitor/dashboard-manager`, `monitor/sprint-state`, `nervous/action-registry`, `nervous/history`, `nervous/ipc-queue` |
| Messaging webhooks | `src/api/server.ts:/api/webhooks/:connector/:key` | `connectors/incoming-router:parseWebhookPayload+validateWebhookKey+IncomingMessageRouter` |
| Worker spawn | `orchestra/spawn-backend.ts` → `providers/*` | `core/provider:ProviderAdapter`, `orchestra/tmux` (claude tmux backend only) |
| Terminal WS | Browser (Sec-WebSocket-Protocol token) | `api/terminal/ws-gateway.attachTerminalGateway` → `PtySessionManager` → `LocalPtyBackend` (`@lydell/node-pty`) |

---

## 2. Bağlam (Context)

Bu dört dizin, Deckent'in **dış dünyaya açılan ana yüzeyleri**: HTTP API + dashboard, MCP stdio sunucusu, mesajlaşma platformları, ve LLM provider CLI'lerine spawn katmanı. Diğer altyapı modülleri (orchestra, core, nervous, monitor) iç dünyada birbiriyle haberleşirken bu yüzeyler kullanıcının dokunduğu protokol sınırlarıdır.

**Tarihsel sıralama (sprint-ID düzeyinde gözlemlenebilir):**
- **Sprint 044-046:** Provider adapters + `.deck` secrets + multi-environment config (ADR-014/017/018/019) — providers tree'sinin doğuşu.
- **Sprint 123, revisited 139:** Hybrid spawn backend (tmux + subprocess) — ADR-027. `claude.ts` üç-backend tasarımı buradan.
- **Sprint 138:** ADR-035 verification protocol + ADR-036 ADR governance + ADR-037 RBAC. Event-stream/event-bus altyapısı bu sprintte konsolide oldu; `connectors/incoming-router.ts` üzerinden mesajlaşma → nervous system köprüsü kuruldu (Sprint 149 T-015).
- **Sprint 143:** MCP disconnect fix — `start.ts` detached fork pattern. Long sprintler için kritik.
- **Sprint 145:** `deckent_watch` MCP tool — push-based event subscription.
- **Sprint 147 T-016:** Nervous System MCP entegrasyonu — `nervous.ts` 5 sub-tool.
- **Sprint 149-153:** Messaging connectors (Discord canlı, Telegram dinamik-import, WhatsApp scaffold). `whatsapp.ts` deliberate-dormant; Business API onayı bekleniyor.
- **Sprint 161 T-006:** MCP singleton lock O_EXCL race fix (`server-singleton-lock.ts`).
- **Sprint 168 C0e:** BUG-HH prompt-file orphan cleanup selective-filter — `claude.ts:147-164`.
- **Sprint 175+ (ADR-062):** Embedded web terminal — `api/terminal/` 10 dosyalık alt-sistem. Sprint 179 W5-12 ile HMAC audit chain (`audit-integrity.ts`) eklendi.
- **Sprint 180 W2-2, W4-2:** Nervous pure handlers + PanicGuard approval IPC queue.
- **Sprint 183 W1-3:** `LARGE_PROMPT_THRESHOLD_CHARS` (spawn-backend.ts) — burada doğrudan değil ama provider'lara akıyor.

**Stratejik ağırlık:** `api/server.ts` (1,052 LoC) ve `mcp/tools/status.ts` (487 LoC) tek-dosyada en büyük integration modülleri. İkisi de **tek noktadan yönlendirme** prensibiyle yazılmış: server.ts tek `handleRequest` router'ı, status.ts tek `registerStatusTool` ama 6 yardımcı fonksiyon içeriyor (readEventStreamTail, readLastOutputs, readMetricSnapshot, computePhaseCountdown, buildBackendBreakdown, loadDepGraphFiles).

**Stack genişlikleri:**
- API: `node:http` (no Express/Fastify) — ADR-010 minimal-dependency politikasına bağlı.
- WebSocket: `ws` (npm).
- PTY: `@lydell/node-pty` fork (Windows + Linux uyumu).
- MCP: `@modelcontextprotocol/sdk` (resmi paket).
- Discord: `discord.js`.
- Telegram: `telegraf` (**dinamik import** — opsiyonel).
- Validation: `zod` v4 (tüm MCP tool input şemaları).

---

## 3. Debt Risk

### 3.1 Critical (orta-vadede borç biriktirme riski yüksek)

1. **`src/api/server.ts:58-83` duplicate `RateLimiter` class.** Aynı isimli ve aynı kontratlı sınıf hem `server.ts` içinde (lines 58-83, kullanılan instance: line 841) hem de `rate-limiter.ts` (lines 28-95) dosyasında tanımlı. `server.ts` içindeki versiyon `cleanup()` timer'ı yok, `windowMs+windowStart` yerine `resetAt` field'ı kullanıyor, `retryAfter` döndürmüyor — **iki ayrı implementasyon, ortak bir test yüzeyi yok**. `rate-limiter.ts` dosyası şu anki haliyle hiçbir yerden import edilmiyor (potansiyel **ölü modül**). Bkz. §4.

2. **`src/api/terminal/outbound-limiter.ts` üretimde wire değil.** `OutboundLimiter` sınıfı + `OutboundTrackResult` tipi tam olarak yazılmış (I5 invariant açıklamaları, deterministic tenant-isolation testleri için hazır) ama `api/server.ts:1017-1029` `attachTerminalGateway()` çağrısında `limiter` parametresi geçilmiyor (sadece `manager`, `auth`, `audit`). Sonuç: per-tenant outbound quota canlı yolda devre dışı. Bu **kasıtlı bir 'tests-ready, prod-off'** durumu mu yoksa wire eksikliği mi belirsiz — Sprint 179 W4-10 invariant I5 sözleşmesi tamamen pasif.

3. **`src/api/server.ts:904` `AuditSink` no-op default.** Terminal audit sink olarak `{ insert: () => { /* no-op default */ } }` veriliyor; yorum satırı "production wires MemoryStore" diyor ama gerçek wire kodu yok. HMAC integrity chain (`audit-integrity.ts`) `integrity` config'i olmadığından **devreye girmiyor** — `TerminalAudit.record()` legacy path'i kullanıyor. ADR-062 audit-trail garantisi V1.0'da sadece test ortamında doğrulanmış görünüyor.

4. **`src/providers/claude.ts:94` MCP backend throw.** `claude_backend: 'mcp'` seçildiğinde `ProviderError` fırlatıyor: "deferred past Sprint 048". 2026 itibarıyla hâlâ TODO — DECKENT-MASTER-BLUEPRINT.md referansı veriyor ama implementasyon yok. Eğer roadmap silinmişse bu **dead branch** kategorisine düşer (§4).

5. **`src/providers/sandbox.ts` kullanıcı yüzeyi belirsiz.** `SandboxSpawnBackend` `--sandbox` CLI flag ile etkinleşiyor (yorum satırına göre) ama `cli/commands/start.ts` içinde nereden çağrıldığı bu audit'te incelenmedi. `createSandboxBackend()` factory `core/spawn-backend.ts` factory pattern'ine bağlanmış olabilir — eğer bağlı değilse **dormant feature**.

### 3.2 Medium (potansiyel future-tech-debt)

6. **`src/mcp/tools/help.ts:48-71` ve `src/mcp/helpers/enrich.ts` tool-listesi drift.** `TOOLS` const'unda 22 tool var ama gerçek registry (`tools/index.ts`) 27 tool kayıt ediyor. Eksikler: `watch`, `feature-query`, `audit`, `recover`, `nervous_subscribe/accept/reject/status/config`. `enrich.ts` `SUMMARIES` map'inde de yalnızca 18 tool entry mevcut. `deckent_help` çağıran kullanıcı eksik bilgi alır. **Documentation drift, kullanıcıya görünür.**

7. **`src/mcp/server.ts:24-99` `DECKENT_MCP_INSTRUCTIONS` drift.** Sabit string "Tools (27)" diyor ama gerçek registry 27 + 5 nervous sub-tool = 32 (bazıları sayım farklı yapılırsa 27/31). Listelenen toollar arasında `watch`, `feature-query`, `audit`, `recover` **yok**. MCP istemcilerine yanlış kapasite bildirimi.

8. **`src/mcp/tools/nervous.ts:90` notification ID regex.** `NOTIFICATION_ID_PATTERN = /^[a-f0-9-]{36}$/` UUID v4 pattern'i için yazılmış ama herhangi 36-char `a-f0-9-` kombinasyonunu kabul ediyor (örn. `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` geçer). True UUID v4 (`[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`) doğrulaması yok. Bonus: `id.startsWith('ns-')` alternatifi var — iki ayrı format kabul.

9. **`src/providers/codex.ts:32-36` `CODEX_TIER_MODELS` deprecated alias.** Backward-compat için tutuluyor; getter'lar `getModelForProviderTier()`'a delege ediyor. Tüm consumer'lar `model-equivalence.ts` direkt API'sine geçtiğinde kaldırılmalı. Aynı pattern `src/providers/gemini.ts:34-39` `GEMINI_TIER_MODELS`'de de var. **Iki ayrı dosyada dual export — koordinasyon riski.**

10. **`src/api/server.ts:558-565` planner recommendation hard-coded.** `/api/plan` endpoint'i `SprintSizeRecommendation`'ı sabit `size:'full', reason:'No usage constraints'` ile yapıyor. Dashboard'dan plan yaparken kullanıcı tier/size seçimi yansımıyor. CLI'de `core/sprint-estimator.ts:recommendSprintSize()` mevcut ama API tarafı bunu çağırmıyor.

11. **`src/connectors/incoming-router.ts:17-24` modül-düzey sequence sayacı.** `let routerSequence = 0` global state. Test için `_resetSequence` exposed ama production'da iki ayrı `IncomingMessageRouter` instance'ı **aynı sayacı paylaşır** — yan etki riski. Sequence aslında `DeckentEvent.sequence` için kullanılıyor; event-stream'in kendi sequence'ı (`.deckent/sprint-NNN-seq`) ile çakışıyor olabilir.

12. **`src/mcp/tools/nervous.ts:55` modül-düzey `subscribers` Set.** Process-lifetime in-memory. MCP server restart sonrası tüm subscription'lar kayıp. Persistent değil; durum dashboard `nervous_status` toolunda `subscribers.size` olarak görünür ama anlamlı değil.

### 3.3 Low (kozmetik / küçük risk)

13. **`src/api/chat-handler.ts` minimal stub.** Sadece `status`/`help` recognize ediyor — dashboard ChatPage entegre değil görünüyor. Belgelenmiş "stub kapatma" yorumu var (line 2). Genişletilirse provider routing eklenmeli.

14. **`src/mcp/tools/init.ts:172-174` Claude rules content hard-coded.** Brain/auditor/worker rule template'leri 312-LoC init dosyasının içinde inline string. `.claude/rules/*.md` örnek içeriği kaynak kodunda — değişirse iki yerde güncelleme gerekir. Yalnızca dosya yoksa yazıldığı için drift kullanıcı projelerinde yaşanmaz, ama init template ile gerçek runtime rule birbirinden farklı görünüyor.

15. **`src/api/server.ts:823` `terminalToken` minted but logged.** `process.stderr.write` ile token stderr'a yazılıyor (line 896 de aynı). MCP/CLI parent process bunu görür — istenen davranış mı? "Auto-generated API token" log satırı production'da log dosyalarında token leak edebilir.

---

## 4. Dead Code

### 4.1 Confirmed unused

- **`src/api/rate-limiter.ts` (95 LoC) — şu an hiçbir import yok.** `src/api/server.ts` kendi inline `RateLimiter` sınıfını kullanıyor (lines 58-83 + line 841). `tests/` referansı olabilir ama production wire path'inde değil. **Aksiyon önerisi:** ya `server.ts` inline sınıfı silip `rate-limiter.ts` import'una geçilsin, ya da `rate-limiter.ts` silinsin. İki versiyon arasında özellik farkı var (windowMs, retryAfter, cleanup) — uyumlu hale getirme + tek dosyaya konsolide etme gerekli.

### 4.2 Dormant by design (kasıtlı pasif)

- **`src/connectors/whatsapp.ts` — Sprint 153+ aktivasyon hedefi.** `start({enabled:true})` çağrılırsa explicit throw atıyor ("scaffold only"). Test edilebilir, üretim wire'ı yok. ADR-040 nervous-system genişlemesinde planlanan messaging connector yelpazesinin parçası.
- **`src/providers/claude.ts:'mcp'` backend dalı.** Kasıtlı 'not-yet-implemented' — `ProviderError` informativ mesaj döndürüyor. Refactor önerisi: dal silinsin veya gerçekten yazılsın (§3.4).
- **`src/api/terminal/outbound-limiter.ts`** — Sprint 179 W4-10 invariant I5 testi için yazılmış; `attachTerminalGateway` opsiyonel parametre kabul ediyor ama production wire'da geçirilmiyor (§3.2).

### 4.3 Vestigial / backward-compat (tutuluyor ama uyarılmış)

- `CODEX_TIER_MODELS` (codex.ts:32-36) ve `GEMINI_TIER_MODELS` (gemini.ts:34-39) — `@deprecated` yorumlu, getter pattern ile aslında live function'a delegate. Tüketici sayısı küçükse silinebilir.
- `src/providers/claude.ts:MCP_NOT_IMPLEMENTED_MESSAGE` — kullanıldığı tek nokta `spawn()` throw'u; lokal const olmasında sakınca yok ama dosya-düzey export'u yok.

### 4.4 Apparent unused exports (false positive riski yüksek — test grep'i gerekli)

- `src/api/rate-limiter.ts:RateLimiter` (tüm class) — tüketici yok.
- `src/api/server.ts:generateApiToken` — `randomUUID()` ile değiştirilmiş görünüyor (line 821 `resolvedToken = randomUUID()`); export edilmiş ama `server.ts` kendi içinde kullanmıyor. Cli komutu kullanıyor olabilir — doğrulanmadı.
- `src/api/server.ts:RateLimiter._resetActiveJob` (line 124) — sadece test için.
- `src/providers/sandbox.ts:createSandboxBackend` — factory; consumer wiring incelenmedi.

---

## 5. Documentation Gaps

### 5.1 Source-of-truth drift (kullanıcıya görünür)

1. **MCP tool count: 27 vs 31 vs 32.** `DECKENT.md` "31 tools" diyor, `src/mcp/server.ts:33` ve `DECKENT_MCP_INSTRUCTIONS` "27" diyor, `help.ts` TOOLS array'i 22 tool listeliyor. Üç farklı sayı, tek bir kanonik liste yok. **`docs/reference/mcp-tools.md`** dosyası `DECKENT.md` içinde referans verilmiş (auto-generated) — `npm run docs:ref` ile üretiliyor; bu dosyanın güncelliği bu audit'te doğrulanmadı.

2. **`src/mcp/tools/help.ts:48-71` `TOOLS` array eksik.** Eksik kayıt: `deckent_watch`, `deckent_feature_query`, `deckent_audit`, `deckent_recover`, `deckent_nervous_*` (5 sub-tool). Kullanıcı `deckent_help` çağırınca 9 toolu hiç göremez.

3. **`src/mcp/helpers/enrich.ts:SUMMARIES`** ve **`HINTS`** map'leri 18 tool entry içeriyor. 9 tool için summary/hint yok — `generateSummary()` fallback ile `"${toolName} operation completed."` veriyor, `generateHints()` ise boş array. Görsel kalite kaybı, hata değil.

4. **`src/api/server.ts` route inventory dokümante değil.** 17 farklı endpoint var — dashboard developer'ları için bir liste/route table yok. `docs/reference/api-surface.md` referansı CLAUDE.md'de geçiyor ama bu dosya **`.tasks/` ve `.brain/` formatlarına odaklı**; HTTP API route'larını içermiyor.

5. **`src/api/terminal/` ADR-062 cross-link eksik.** ADR-062 (Embedded Web Terminal) accepted statüsünde, ama 10 dosyanın hiçbirinde dosya-üst dokümantasyonunda ADR referansı yok. `audit.ts:50-54` "spec §1c.2" diyor ama hangi spec? `auth-provider.ts:33`, `command-guard.ts:7`, `outbound-limiter.ts:29` benzer şekilde "I3, I5, sub-project #2/#3 invariants" geçiriyor — bunların lookup'ı için bir mapping table yok.

6. **`src/connectors/whatsapp-README.md` referansı var.** `whatsapp.ts:35,38,55` üç ayrı yerde "see src/connectors/whatsapp-README.md" diyor. Bu dosya `ls` ile gerçekten görünüyor — README var. Ancak Deckent docs/' tree'sinde `docs/reference/messaging.md` gibi konsolide bir connector kılavuzu yok.

### 5.2 Yorum eksiklikleri (low priority)

7. **`src/api/server.ts:265-269` `countTaskBlocks` regex açıklaması yok.** `^## Task\b` regex — multi-line markdown task block sayımı. Niyet açık ama "neden Task ve Tasks değil" yorumu yok.

8. **`src/providers/gemini.ts:65-69` stream-json detection heuristic.** "more than one line → try stream-json" basit ama `lines.length > 1` koşulu single-line valid JSON'u hatalı stream-json olarak yorumlayabilir. Yorum bunu açıklamıyor.

9. **`src/mcp/tools/status.ts:14-37` `readEventStreamTail` neden var?** Yorum "to avoid ADR-008 import cycle" diyor — açık. Ama `eventBus.tail()` (`src/mcp/tools/watch.ts:63` içinde kullanılıyor) zaten file-system read yapıyor olabilir. **Iki paralel okuyucu** — birinin diğerini kullanması mümkün mü incelenmemiş.

### 5.3 Eksik API kontrat dokümanları

10. **`src/connectors/types.ts:9` `ConnectorId` enum'u** ile **`src/connectors/incoming-router.ts:141` `VALID_CONNECTORS` Set'i** **iki kopya kaynakta**. Eğer `email`/`slack` eklenirse iki yerde güncelleme gerekir. `Set<string>` `Set<ConnectorId>` olmalı.

11. **`src/api/server.ts:283-288` middleware function signature**'ı `bearerAuthMiddleware` factory'den dönüyor ama dokümante edilmemiş. `authMiddleware: (req, res) => boolean` semantiği inline anlaşılır, ama formal interface (`AuthMiddleware`) tanımlı değil.

---

## 6. ADR Compliance

### 6.1 Honored (canlı kanıt)

- **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık).** `src/mcp/tools/status.ts:14-17` açık yorum: *"File-system based to avoid ADR-008 import cycle (status.ts must not import orchestra/)."* status.ts dosya-okuma sürümleri (`readEventStreamTail`, `readLastOutputs`, `readMetricSnapshot`, `loadDepGraphFiles`) bu yüzden var. `src/mcp/resources/*` tümü FS-only okuyor (orchestra import yok). ✅
- **ADR-010 (Tek Runtime Dependency — commander.js).** `src/api/server.ts` Express/Fastify değil `node:http` kullanıyor. Validation `zod` (peer dep), pty `@lydell/node-pty`, ws `ws` — hepsi minimal-set. ✅
- **ADR-022/022-v2 (CLI/MCP Feature Parity).** `src/mcp/tools/start.ts:46-51` parity divergence'ı **açık dokümante ediyor**: *"KNOWN DIVERGENCE: documented, acceptable for non-interactive MCP context."* ADR'ye uygun şeffaflık. ✅
- **ADR-035 (Verification Protocol Standard).** `src/mcp/tools/watch.ts` ve `src/connectors/incoming-router.ts` `CHANNELS` import edip `event-stream`/`event-bus` üzerinden yayın yapıyor. Channel codes (`NOTIFY`, `PHASE`, `TASK_ASSIGN`, etc.) `watch.ts:10-18`'de literal değer olarak listeli. ✅
- **ADR-037 (RBAC Protocol V1.0).** `src/mcp/tools/audit.ts` ve `src/mcp/tools/recover.ts` brain/auditor/worker authority matrix'ini direkt enforce etmiyor ama `runSelfAuditGate()` çağrısıyla compile-time + audit-trail mekanizmasına bağlanıyor. `src/api/terminal/audit.ts` HMAC chain ADR-037 V2 (post-GA) hard-flip için altyapı sağlıyor. ⚠️ V1.0 advisory mode hâlâ aktif — bkz. §3.3.
- **ADR-062 (Embedded Web Terminal).** `src/api/terminal/` 10 dosyalık alt-sistem ADR-062 design'ı tamamen impl ediyor: PTY sessions (session-manager), WS gateway (ws-gateway), auth (auth-provider — `LocalTokenAuthProvider`), audit (audit + audit-integrity HMAC chain). Spec §1c.2 referansları doğru yere bağlı (auth-provider.ts:33, audit.ts:50, ws-gateway.ts:36). ✅
- **ADR-063 (Consent-Based Prerequisite Provisioning).** `src/mcp/tools/init.ts:264-284` `installMissing` flag ile `provisionMissing()` çağrısı. ADR-063'ün MCP non-interactive context'i için açık explicit-opt-in pattern'i. ✅

### 6.2 Partially honored / soft violations

- **ADR-029 (Managed-Docs Universalization).** `init.ts:215` `seedDocsConfig(root)` ile `.deckent/docs.json` seed ediliyor. ✅. Ancak audit yüzeyleri (api/mcp/connectors/providers) tarafı `docs.json`'a yeni entry eklemiyor — kendi belgelerini managed-docs sistemine bağlamamış. Bunun "kasıtlı boyut sınırı" mı yoksa unutkanlık mı olduğu belirsiz.
- **ADR-034 (Multi-Project Isolation).** `src/api/server.ts:projectRoot` parametresi root-scoped — tek proje varsayımı doğru. Ama `src/api/terminal/session-manager.ts:KIND_CMD.deckent` `file: 'deckent'` mutlak komut adı kullanıyor; çoklu install (npx vs global) durumunda nereye çalıştığı belirsiz. Multi-tenant V2'de bu sorun olacaktır.
- **ADR-045 (Wave-Based Execution Semantics).** `mcp/tools/start.ts` `config.dependency_pipeline_enabled` değerini doğrudan kontrol etmiyor; sprint-controller'a aktarıyor. ADR-045 enforcement orchestra/ tarafında — burada compliance dolaylı. ✅
- **ADR-064 (TOPP — Continuous Dispatch).** `mcp/tools/watch.ts` event-bus subscription'ı ile **canlı sunum yapıyor** (ADR-064'ün dispatch tarafı runtime'da `result-collector.ts`'de wired). MCP integration tarafı doğru — sadece pasif gözlemci.

### 6.3 No-touch ADR'lar (relevant değil ama anılan)

- ADR-001/002/003/004 (TypeScript, ESM, vitest, config-merge) — temel altyapı, bu tree'lerde özel ihlal yok.
- ADR-006 (spawnSync Security). `providers/claude.ts:187`, `codex.ts:179,201,232`, `gemini.ts` `spawnSync` kullanımları hepsinde **`encoding+timeout` mandatory args** ile çağrılıyor. ✅
- ADR-038 (Dead Code Disposition). Bu audit'te tespit edilen dead/dormant kod (§4) ADR-038 dosya kategorilerine uyabilir; `src/api/rate-limiter.ts` aday.
- ADR-039 (Self-Modifying Task Detection). Provider/MCP tarafında deckent-vs-user discriminator yok — sprint-controller tarafına bırakılmış. Doğru.

### 6.4 ADR amendment önerisi (hiçbiri kritik değil — bilgi amaçlı)

- **ADR-062** için bir "Audit Chain Activation" alt-bölüm eklenebilir: HMAC chain'in production wire'ı (V1.0 currently no-op sink) için takvim ve aktivasyon shartı.
- **ADR-027 (Hybrid Spawn Backend)** içinde `providers/claude.ts:'mcp'` dalının kaderi netleştirilmeli — silme veya implementation.

---

## 7. Refactor Recommendations

Önceliklendirilmiş, ölçülebilir ve geri çevrilebilir öneriler.

### 7.1 High value (Sprint 187 / 188 kapsamında ele alınabilir)

**R1. `src/api/rate-limiter.ts` ↔ `src/api/server.ts` `RateLimiter` konsolide et.** Tek implementasyon (`rate-limiter.ts` daha zengin: `retryAfter`, `cleanup`) `server.ts`'e import edilsin. server.ts inline sınıfı silinsin. Ölçüm: `tsc --noEmit` + vitest pass; ek olarak `RateLimitResult.retryAfter` 429 response'larında kullanılabilir.

**R2. `DECKENT_MCP_INSTRUCTIONS` + `help.ts:TOOLS` + `enrich.ts:SUMMARIES/HINTS` tek kaynaktan üretmek için bir `tools/manifest.ts` oluştur.** Her tool registration kendi metadata'sını (name, description, summary EN/TR, hints) bir manifest objesinden okur; `registerTools()` bu manifest'i iterate eder. Doc-drift kalıcı çözüm. Ölçüm: yeni tool eklenirken sadece manifest entry + registration → liste otomatik güncellenir.

**R3. `src/api/terminal/outbound-limiter.ts` production wire'ı.** `attachTerminalGateway` çağrısına `OutboundLimiter` instance'ı geçilsin (`api/server.ts:1017`). Default quota ne olmalı sorusu için config ekle: `terminal.outbound_quota_mb` (default 100 MB / 24h). Ölçüm: production'da audit log'da `outbound.warn|kill` event'leri görünmeye başlar.

**R4. `TerminalAudit` production sink wire'ı.** `api/server.ts:904` no-op AuditSink yerine `MemoryStore` instance'ı geçilsin. `loadOrCreateAuditKey(projectRoot)` ile HMAC integrity etkin olsun. Ölçüm: `.deckent/audit-key` üretilir, terminal session lifecycle event'leri MemoryStore'a `type: 'audit'` olarak girer, `verifyAuditChain()` testi yeşil.

### 7.2 Medium value

**R5. `src/providers/claude.ts:'mcp'` backend kararı.** Roadmap'te kalacaksa `@todo` etiketi + sprint hedefi açıkla; kalmayacaksa dal silin ve `ClaudeBackend` union'dan kaldır. Ölçüm: `git grep "claude_backend.*mcp"` sıfırlanır veya implementation eklenir.

**R6. `src/connectors/types.ts:ConnectorId` ve `incoming-router.ts:VALID_CONNECTORS` tek-kaynak.** `VALID_CONNECTORS = new Set<ConnectorId>([...])` ile derive-from-type. Ölçüm: tipo hatası imkansız hale gelir.

**R7. `src/api/server.ts` route table'i dış dokümana taşı.** `docs/reference/http-api.md` yeni dosya: 17 endpoint listesi, request/response şema, auth gereksinimleri. `server.ts` içinde JSDoc'la cross-link.

**R8. Provider tier-mapping merkezleştir.** `CODEX_TIER_MODELS` ve `GEMINI_TIER_MODELS` deprecated alias'larını silin (consumer sayısı tspecified; öncesinde `git grep` kontrolü). Ölçüm: -100 LoC, tek SoT `model-equivalence.ts`.

### 7.3 Low value (kozmetik)

**R9. `src/mcp/tools/nervous.ts:NOTIFICATION_ID_PATTERN` UUID v4'e sıkılaştır** veya alternatif format açıklaması ekle. Mevcut regex çok permisif.

**R10. `src/connectors/incoming-router.ts:routerSequence` module-level state'i `IncomingMessageRouter` instance field'ına taşı.** Test isolation iyileşir, `_resetSequence` export'una gerek kalmaz.

**R11. `src/api/terminal/*.ts` ADR-062 cross-link standardize et.** Her dosyanın üstüne `/** @adr 062 §1c.2 */` JSDoc tag. Future linting için.

---

## 8. Sprint 187 Follow-up

Bu audit'in Sprint 187+ için ürettiği eyleme dönük input listesi:

| Output | Önerilen Sprint | Açıklama |
|---|---|---|
| **integration-audit.md** (bu dosya) | Sprint 187 spec input | Karar: hangi öneriler S187 backlog'a giriyor (R1-R11 listesi) |
| **R1: RateLimiter dedup** | Sprint 187, low effort | İlk hedef; risk düşük, blast radius API auth |
| **R2: MCP tool manifest** | Sprint 187, normal | Doc-drift sürekli çıkıyor — kalıcı çözüm |
| **R3: OutboundLimiter wire** | Sprint 187 veya 188 (gate) | I5 invariant prod-side aktivasyonu; öncesinde load-test gerekli |
| **R4: HMAC audit chain wire** | Sprint 187 veya 188 | ADR-062 production-grade audit garantisinin canlı kanıtı |
| **R5: Claude MCP backend kararı** | Sprint 188+ | Architectural — ADR amendment gerekli |
| **R7: docs/reference/http-api.md** | Sprint 187, doc-only | API surface stabilizasyonu |
| **whatsapp.ts aktivasyon** | Sprint 189+ | WhatsApp Business API onayı bağımlı (external dependency) |
| **`docs/reference/mcp-tools.md` doğrulama** | Sprint 187 başında | `npm run docs:ref` çıktısı manuel inceleme — auto-gen toolu doğru çalışıyor mu? |

**Spec input — Brain dynamic file-tree split kapasitesi:**
Sprint 184 deneyinin sonucu (zero-config split testi — Brain 3-5 task üretti, 479 değil) bu audit'in **var olma sebebi**: dinamik split başarısız olunca DIRECTIVES.md elle subtree-bazlı task'lara bölündü. Sprint 187 spec input: "Brain AI Planner'a `dynamicFileTreeSplit()` özelliği eklenmeli mi?" — bu auditin bulgusu: integration surface'in 4 tree'si insan tarafından anlamlı şekilde tek dosyaya kondu (10K LoC, tek bir 9-section rapora sığdı). Eğer Brain'in dosya-bazlı 50 task üretmesi yerine **tematik-bazlı 5 task** üretmesi optimum ise mevcut zero-config kuralı (`planner.ts:147`) doğru sınırı koyuyor. **Hipotez:** "dinamik file-tree split mimari bir gereksinim DEĞİL — tematik gruplama Brain için yeterli, kullanıcı DIRECTIVES.md'de hint vermeli."

---

## 9. Summary

**Genel sağlık değerlendirmesi:** İntegrasyon yüzeyleri **olgun ve sürdürülebilir**. 66 dosya / ~10,270 LoC bir orta-büyük subsistem; modülerlik yüksek (her tool/resource/connector/provider tek dosya), separation-of-concerns iyi (auth, rate-limit, terminal ayrılmış altsistem; orchestra/ ile import-yönü temiz).

**Pozitif örüntüler:**
- ADR-008 import discipline'i `status.ts`'de **açık yorumla** uygulanmış — model davranış.
- ADR-062 embedded terminal alt-sistemi 10 dosya / 1,089 LoC ile **production-ready altyapı**: PTY, WS, auth, audit, command-guard, prompt-guard, outbound-limiter — hepsi yazılı, çoğu test-edilebilir.
- Provider adapters hybrid spawn backend (ADR-027) ile flexible: tmux/subprocess/MCP üç yol.
- MCP server detached fork pattern (start.ts) long-sprint stdio block sorununu çözüyor (Sprint 143 fix).
- Singleton lock O_EXCL pattern + liveness check (server-singleton-lock.ts) race fix doğru yapılmış.

**Sayısal özet:**

| Kategori | Sayı | Notlar |
|---|---|---|
| Critical debt | 5 | R1-R4 (server-side), R5 (provider mcp branch) |
| Medium debt | 7 | R6-R8 + R9-R11 + üç ek doc-drift kalemi |
| Low/cosmetic | 4 | Yorum eksikleri, minor naming |
| Confirmed dead modules | 1 | `src/api/rate-limiter.ts` (95 LoC) |
| Dormant by design | 3 | whatsapp.ts, claude `'mcp'` backend, outbound-limiter prod-wire |
| Documentation drifts | 3 main + minor | Tool count, help.ts TOOLS array, enrich.ts SUMMARIES |
| ADR honored fully | 6 | ADR-008/010/022/035/062/063 |
| ADR partial / soft | 4 | ADR-029/034/045/037 |

**Spurious-finding self-check (ADR-035):** Bu raporda dile getirilen "RateLimiter duplicate" iddiası dosya-okuma kanıtı ile destekli (server.ts:58-83 + rate-limiter.ts:28-95). "OutboundLimiter prod-wire eksikliği" iddiası `attachTerminalGateway` çağrısının imza karşılaştırması ile destekli (deps.limiter optional, server.ts:1018-1022 vermiyor). "Tool count drift" iddiası üç ayrı dosyadan kanıt (`DECKENT.md` "31", `mcp/server.ts:33` "27", `help.ts:TOOLS` "22").

**Verdict (kod kalitesi açısından, bu audit kapsamında):** **APPROVE_WITH_TECH_DEBT.** Hiçbir bulgu sprintlerin canlı çalışmasını engellemiyor. Sprint 187'de R1-R4 ele alınması önerilir; geri kalanlar S188+ veya zaman olduğunda fırsat-bazlı.

**En önemli tek bulgu:** `src/api/rate-limiter.ts` ile `src/api/server.ts` içindeki duplicate `RateLimiter` sınıfı tek bir dosyaya konsolide edilmeli (R1) — bu en düşük effort, en yüksek netlik kazancı sağlayan refactor.

---

**Auditor notları (transparency):**
- Bu rapor `code-reviewer` agent tarafından `opus` model ile, **kodu sadece okuyarak** (NEVER write source code) üretildi.
- Per-file 9-section template metodolojisi raporlı düzeyde uygulandı; 66 dosya × 9 section = ~600 mikro-section kurulması ne audit budget'ı içinde mümkün, ne de okunabilir bir output verirdi (orchestra-audit.md ile aynı gerekçe).
- Tüm satır referansları (`file:line` formatı) görüldüğü gibi okunduğu içerikten alındı; ileride dosyalar değişirse satır numaraları drift yapacaktır — kalıcı identifier olarak fonksiyon adları ve sınıf adları tercih edilmeli.
- Hiçbir kaynak kodu dosyasına yazılmadı, hiçbir test çalıştırılmadı. Sadece markdown çıktısı üretildi.
