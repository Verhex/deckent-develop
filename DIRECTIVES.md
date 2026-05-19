# DIRECTIVES — Sprint 175: Embedded Web Terminal (Sub-project #1/4)

## Spec + Plan Referansları

- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-19-embedded-web-terminal.md` (commit `905087d`) — her worker kendi Task bölümündeki **adım/kod/kanıt/test'i** + aşağıdaki Worker Contract'ı **mutlaka** okur. Per-task tam kod orada (DIRECTIVES tekrarlamaz).
- **Spec (doğrulanmış gerçek):** `docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md` — §1c (Step A verified), §1c.2 (auth kök-neden), §1d (VSCode dock + enterprise dikişler). Worker spec'i değiştiremez; davranış spec'e uyar.
- **Predecessor:** Sprint 172-174 (doc-reorg + OSS GA prep + dashboard repair). Brainstorm→spec→Step A→writing-plans→systematic-debugging gate tamamlandı (Alperen onaylı).

## Goal

deckent dashboard'una VSCode-benzeri **gömülü, dock-edilebilir terminal** ekle: interaktif `claude`/`gemini`/`codex`/`deckent`/`shell` PTY oturumları, `ws` transport, tmux-benzeri reattach, **global API bypass'tan bağımsız + daha katı** localhost-default token auth (token localhost-only sayfa-enjekte → WS subprotocol), şeffaf tenant-scoped `memory.db` audit (ham PTY çıktısı ASLA persist edilmez). Enterprise/k8s **dikişleri** (`AuthProvider`/`SessionBackend`/`tenantId`) baştan konur ama implement edilmez (#3). Bu sub-project #1/4; #2-4 ayrı sprint.

## Brain Planning Instructions

Mode: structured. **Self-modifying / dogfood: ZORUNLU sequential** (`src/api/` + `src/dashboard/` → `self-modifying-detector.ts` tetikler). Wave: 5 (Wave 0→4, plandaki sıra; **wave'ler ÇAKIŞMAZ, sıralı**). Max workers: 2 (sequential — paralel değil; aynı wave içinde bağımsız task'lar en fazla 2). `dependency_pipeline_enabled: false` → Wave geçişleri + GATE doğrulamaları **Brain manuel** (ADR-047, Sprint 164-174 kanıtlı). Provider: claude. Bir wave, önceki wave'in tüm task'ları DONE + GATE doğrulanmadan başlamaz. Alperen review: sprint başlangıç (bu tablo) + her wave GATE + finalize. **Build/run (npm run build:all, deckent serve, npm publish) son doğrulama Alperen'in kararı — worker çalıştırmaz** (memory: build approval).

## Worker Contract

Tüm worker'lar plan dosyasındaki kendi Task bölümünü + bu Contract'ı okur. Invariant:

- **Bu sprint kod + test YAZAR** (doc değil): atanan task scope'undaki dosyalar modify/create edilir. Scope DIŞINA yazma YASAK (ADR-037, auditor `git diff --stat` izler — advisory).
- **TDD ZORUNLU (tüm kod task'ları):** plandaki RED→GREEN→REFACTOR adımları aynen; test önce yazılır, fail görülür, sonra minimal implementasyon. Plan adımlarını atlama.
- **ESM:** import'larda `.js` uzantısı zorunlu (Node16). Yeni runtime dep yalnız Task 0.1'de (`node-pty`, `ws`) — başka dep ekleme YASAK; ADR-010 amendment Task 0.2'de.
- **memory.db:** SADECE additive migration (Task 1.3 `tenant_id` kolon + `audit` tip). DROP/rebuild/sil KESİN YASAK (memory: db_silmek_yasak). Schema-version + non-destructive ALTER.
- **Güvenlik invariant'ı (spec §1c.2):** terminal WS auth `DECKENT_API_AUTH_DISABLED`'dan BAĞIMSIZ ve daha katı — bypass shell'i AÇMAZ. Token header'da değil WS subprotocol'de. Ham PTY çıktısı audit'e/diske ASLA yazılmaz.
- **Enterprise dikişleri (spec §1d):** `AuthProvider`/`SessionBackend` interface + `tenantId` baştan; ama multi-tenant/SSO/k8s **implement EDİLMEZ** (#3). YAGNI — interface var, tek `"local"` impl.
- `.tasks/task-<id>.result`: `selfAssessment`, `filesChanged`, `coverage` (test var — kod task'ları), `notes`.

## GO/NO_GO Criteria

**Wave-gate (Brain manuel, ADR-047):**

- **GATE-0** (Wave 0): Task 0.1-0.4 commit'li; `npm install` + `npm run lint` (tsc --noEmit) exit 0; `npm run lint:adr` exit 0; `tests/core/config-terminal.test.ts` PASS; ADR-010 amendment 2 satır + ADR-062 mevcut.
- **GATE-1** (Wave 1): 1.1-1.4 commit'li; `npx vitest run tests/api/terminal/{auth-provider,session-backend,audit,session-manager}.test.ts` PASS; bypass-independence testi PASS; ring-buffer bound + detach≠kill + idle-reaper(deckent muaf) testleri PASS.
- **GATE-2** (Wave 2): 2.1-2.3 commit'li; ws-gateway auth-before-bridge + reattach replay PASS; HTTP control routes PASS; serve `--host`/`--no-terminal` PASS; `npm run lint` exit 0.
- **GATE-3** (Wave 3): 3.1-3.6 commit'li; `npm run test:dashboard` tüm yeşil; dock panel toggle/resize + multi-tab + subprotocol-token testleri PASS.
- **GATE-4** (Wave 4): e2e reattach (disconnect→replay MARKER_ONE+TWO) PASS; `npm run lint:link`+`docs:ref`+`docs:stats` exit 0; full `npx vitest run` PASS; `npm pack --dry-run` temiz (node-pty/ws var, internal state yok).

**Sprint verdict:** **GO** = 5 gate tam. **GO_WITH_TECH_DEBT** = GATE-0..2 tam (backend sağlam) + GATE-3/4 kısmi (≤2 frontend/doc task re-iterate backlog). **NO_GO** = GATE-0 veya 1 ihlali (deps/ADR/config/auth çekirdeği eksik → frontend anlamsız) veya güvenlik invariant'ı ihlali (bypass shell açıyor / ham çıktı persist ediliyor → kesin NO_GO).

**Kritik:** Güvenlik invariant ihlali (auth bypass-bağımlılığı veya ham-çıktı-persist) = otomatik NO_GO, tech debt KABUL EDİLMEZ (RCE yüzeyi).

## Sprint 176+ Handoff

Post-#1: sub-project #2 (self-security prosedürü — prompt/komut guard), #3 (milyon-ölçek multi-tenant izolasyon + k8s — `AuthProvider`/`SessionBackend` impl'leri buraya), #4 (enterprise dış-dünya entegrasyon). Server-restart session persistence (disk) post-#1 backlog. Her biri ayrı spec→plan→sprint.

---

## Task 1: W0.1 — Runtime deps (node-pty + ws)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Agent: devops-engineer
- Files: package.json
- Scope: ./

### Description
Plan Task 0.1 adımları. `node-pty@^1.0.0` + `ws@^8.18.0` → dependencies; `@types/ws` → devDependencies (alfabetik). `npm install` + `npm run lint` exit 0 (kullanım yok).

**Kanıt:** `node -e "const p=require('./package.json');console.log(!!p.dependencies['node-pty'],!!p.dependencies['ws'])"` → `true true`; `npm run lint` exit 0.
**Test:** Build-only — lint exit 0 (TDD yok, sadece dep ekleme).

---

## Task 2: W0.2 — ADR-010 amendment ext + ADR-062
- Model: sonnet
- Effort: normal
- Skills: system-architect, documentation-writer
- Agent: architect
- Files: docs/adr/010-tek-runtime-dependency-commander-js.md, docs/adr/062-embedded-web-terminal.md
- Scope: docs/adr/

### Description
Plan Task 0.2. Mevcut Sprint-172 Amendment tablosuna 2 satır ekle (ws, node-pty → ADR-062 map, mevcut desen). ADR-062 oluştur (ADR-061 yapısı, MADR hibrit, status accepted): PtySessionManager+ws gateway+AuthProvider/SessionBackend interface; güvenlik = localhost-default, token bypass-bağımsız+daha katı (B-022 hizalı), localhost sayfa-enjekte→WS subprotocol; tenant-scoped audit, ham çıktı persist edilmez; reattack server-restart sınırı; multi-tenant/k8s #3'e ertelenir. `npm run lint:adr` exit 0, non-destructive DB sync.

**Kanıt:** ADR-010'da ws+node-pty satırları; `docs/adr/062-embedded-web-terminal.md` mevcut; `npm run lint:adr` exit 0.
**Test:** Doc — `npm run lint:adr` exit 0.

---

## Task 3: W0.3 — TerminalConfig → DeckentConfig
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: refactorer
- Files: src/core/config.ts, src/core (DeckentConfig tip dosyası), tests/core/config-terminal.test.ts
- Scope: src/core/, tests/core/, ./

### Description
Plan Task 0.3 (TDD). RED: `tests/core/config-terminal.test.ts` (terminal defaults) fail. GREEN: gerçek `TerminalConfig` interface + `DeckentConfig.terminal` (intersection bolt-on DEĞİL — mevcut `dependency_pipeline_enabled` tip-borcunu tekrarlama); `DEFAULT_CONFIG` + nested merge (`model_strategy` deseni). Defaults: enabled true, bind 127.0.0.1, maxSessions 10, idleTimeoutMs 1_800_000, scrollbackBytes 262_144, allowShellKind true.

**Kanıt:** `npx vitest run tests/core/config-terminal.test.ts` PASS (RED→GREEN izlendi); `npm run lint` exit 0.
**Test:** TDD — defaults + override-merge 2+ test.

---

## Task 4: W0.4 — Shared terminal types
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Agent: refactorer
- Files: src/api/terminal/types.ts
- Scope: src/api/terminal/, ./

### Description
Plan Task 0.4. `TenantId`/`SessionKind`/`AiTool`/`CreateSessionInput`/`SessionMeta`/`AuditAction`/`AuditEvent` (plandaki tam tanımlar). `tenantId` tüm yapılarda baştan (enterprise dikişi). `npm run lint` exit 0.

**Kanıt:** `src/api/terminal/types.ts` mevcut, plandaki tüm tipler export; `npm run lint` exit 0.
**Test:** Type-only — tsc --noEmit exit 0 (TDD yok, saf tip modülü).

---

## Task 5: W1.1 — AuthProvider (bypass-independent)
- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist
- Agent: security-auditor
- Files: src/api/terminal/auth-provider.ts, tests/api/terminal/auth-provider.test.ts
- Scope: src/api/terminal/, tests/api/terminal/
- Dependencies: ["175-004"]

### Description
Plan Task 1.1 (TDD). RED: 4 test (doğru/yanlış/boş token + **DECKENT_API_AUTH_DISABLED=1 iken yanlış token RED**). GREEN: `AuthProvider` interface + `LocalTokenAuthProvider` (SHA-256 + `timingSafeEqual`, env bypass'ı KASITLI yok-sayar — spec §1c.2). Güvenlik invariant.

**Kanıt:** `npx vitest run tests/api/terminal/auth-provider.test.ts` PASS (4); bypass-independence testi yeşil.
**Test:** TDD — 4 test (RED→GREEN).

---

## Task 6: W1.2 — SessionBackend + LocalPtyBackend
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: api-builder
- Files: src/api/terminal/session-backend.ts, tests/api/terminal/session-backend.test.ts
- Scope: src/api/terminal/, tests/api/terminal/
- Dependencies: ["175-001","175-004"]

### Description
Plan Task 1.2 (TDD). RED: gerçek `bash -c echo` spawn → output + exit test fail. GREEN: `SessionBackend` interface + `LocalPtyBackend` (node-pty spawn/write/resize/kill, plandaki tam kod). Enterprise dikişi: interface (remote/k8s #3).

**Kanıt:** `npx vitest run tests/api/terminal/session-backend.test.ts` PASS (hello-pty + exitCode 0).
**Test:** TDD — spawn/stream/exit 1+ test.

---

## Task 7: W1.3 — TerminalAudit (tenant-scoped DB)
- Model: opus
- Effort: normal
- Skills: typescript-expert, database-migration
- Agent: data-engineer
- Files: src/api/terminal/audit.ts, src/core/memory-store.ts, src/core/memory-types.ts, tests/api/terminal/audit.test.ts
- Scope: src/api/terminal/, src/core/, tests/api/terminal/
- Dependencies: ["175-004"]

### Description
Plan Task 1.3 (TDD). RED: structured event + ham-çıktı-yok testi fail. GREEN: MemoryStore additive `tenant_id TEXT` kolon (schema-version migration, NON-destructive ALTER — DROP/rebuild YASAK) + `audit` tip; `TerminalAudit.record()` (plandaki kod). Ham PTY çıktısı ASLA geçirilmez (güvenlik invariant).

**Kanıt:** `npx vitest run tests/api/terminal/audit.test.ts` PASS; content ANSI/raw içermez; `npm run lint` exit 0; migration additive.
**Test:** TDD — structured-write + no-raw 2+ test.

---

## Task 8: W1.4 — PtySessionManager
- Model: opus
- Effort: high
- Skills: typescript-expert
- Agent: api-builder
- Files: src/api/terminal/session-manager.ts, tests/api/terminal/session-manager.test.ts
- Scope: src/api/terminal/, tests/api/terminal/
- Dependencies: ["175-006","175-004"]

### Description
Plan Task 1.4 (TDD). RED: 4 test (ring-buffer bound, detach≠kill, maxSessions, idle-reaper deckent-muaf). GREEN: `PtySessionManager` (plandaki tam kod — Map, bounded ring, attach/detach, kill, reapIdle deckent exempt).

**Kanıt:** `npx vitest run tests/api/terminal/session-manager.test.ts` PASS (4); detach kill çağırmıyor, deckent reaper'dan muaf.
**Test:** TDD — 4 test (RED→GREEN).

---

## Task 9: W2.1 — WS gateway (auth-before-bridge + reattach)
- Model: opus
- Effort: high
- Skills: typescript-expert, security-specialist
- Agent: api-builder
- Files: src/api/terminal/ws-gateway.ts, tests/api/terminal/ws-gateway.test.ts
- Scope: src/api/terminal/, tests/api/terminal/
- Dependencies: ["175-005","175-008","175-007"]

### Description
Plan Task 2.1 (TDD). RED: (a) geçersiz subprotocol token → upgrade RED, **session spawn YOK**; (b) geçerli token → attach + buffer replay. GREEN: `attachTerminalGateway` (plandaki kod — `server.on('upgrade')`, token `Sec-WebSocket-Protocol`'den, auth BRIDGE'DEN ÖNCE, backpressure, detach≠kill, `handleProtocols` ayarı). Güvenlik invariant: auth fail → spawn yok.

**Kanıt:** `npx vitest run tests/api/terminal/ws-gateway.test.ts` PASS (2); kötü token close 4401/spawn yok.
**Test:** TDD — reject-before-spawn + accept+replay 2+ test.

---

## Task 10: W2.2 — HTTP control + localhost bootstrap inject
- Model: opus
- Effort: high
- Skills: typescript-expert
- Agent: api-builder
- Files: src/api/server.ts, tests/api/terminal/server-routes.test.ts
- Scope: src/api/, tests/api/terminal/
- Dependencies: ["175-009","175-003"]

### Description
Plan Task 2.2. `createHttpServer`'a: cfg.terminal.enabled ise manager+audit+auth kur (`auth = LocalTokenAuthProvider(finalToken ?? randomUUID())` — terminal HER ZAMAN token, API auth kapalı olsa bile), `attachTerminalGateway`, idle reaper interval (close'da temizle); `GET/POST /api/terminal/sessions` + `DELETE /:id` (mevcut Bearer middleware AFTER); **localhost-only** (`req.socket.remoteAddress` 127.0.0.1/::1) index.html'e `window.__DECKENT_TERMINAL_TOKEN__` enjekte; `api.terminalToken` test-expose.

**Kanıt:** `npx vitest run tests/api/terminal/server-routes.test.ts` PASS (create 201/list/delete); `npm run lint` exit 0.
**Test:** TDD — CRUD + localhost-inject 2+ test.

---

## Task 11: W2.3 — serve CLI surface
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Agent: devops-engineer
- Files: src/cli/commands/serve.ts, tests/cli/serve-terminal.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: ["175-010"]

### Description
Plan Task 2.3 (TDD). RED: `--host`/`--no-terminal` opsiyon yok testi fail. GREEN: `.option('--host <addr>','Bind address','127.0.0.1')` + `.option('--no-terminal',...)`; createHttpServer'a geçir; `--host` non-localhost + token yok → stderr warning + terminal'i ETKİNLEŞTİRME (spec §5).

**Kanıt:** `npx vitest run tests/cli/serve-terminal.test.ts` PASS; opsiyonlar mevcut.
**Test:** TDD — opsiyon-varlık + remote-refuse 2+ test.

---

## Task 12: W3.1 — xterm deps + terminal-api
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Agent: frontend-designer
- Files: src/dashboard/package.json, src/dashboard/src/lib/terminal-api.ts, tests/dashboard/terminal/terminal-api.test.ts
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: ["175-010"]

### Description
Plan Task 3.1 (TDD). `@xterm/xterm@^5.5.0`+`@xterm/addon-fit@^0.10.0` devDeps (ADR-010 etkilenmez — frontend devDep). RED: terminal-api modül-yok fail. GREEN: `getBootstrapToken`/`createSession`/`listSessions`/`killSession` (plandaki kod).

**Kanıt:** `npm run test:dashboard -- terminal-api` PASS; bootstrap-token + create POST.
**Test:** TDD — token-read + create 2+ test.

---

## Task 13: W3.2 — useTerminalSocket
- Model: opus
- Effort: high
- Skills: react-specialist, typescript-expert
- Agent: frontend-designer
- Files: src/dashboard/src/components/terminal/useTerminalSocket.ts, tests/dashboard/terminal/useTerminalSocket.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: ["175-012"]

### Description
Plan Task 3.2 (TDD). RED: WS `deckent.<token>` subprotocol + attach gönderimi fail. GREEN: `useTerminalSocket` (plandaki kod — subprotocol token, onopen→attach, reconnect backoff→reattach, input/resize send).

**Kanıt:** `npm run test:dashboard -- useTerminalSocket` PASS; protocols `['deckent.tk']`, attach gönderiliyor.
**Test:** TDD — subprotocol+attach 1+ test.

---

## Task 14: W3.3 — TerminalView (xterm)
- Model: opus
- Effort: normal
- Skills: react-specialist
- Agent: frontend-designer
- Files: src/dashboard/src/components/terminal/TerminalView.tsx, tests/dashboard/terminal/TerminalView.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: ["175-013"]

### Description
Plan Task 3.3 (TDD). RED: container render fail (xterm/fit mock'lu). GREEN: `TerminalView` (plandaki kod — Terminal+FitAddon, onData→socket, ResizeObserver→fit+resize, dispose cleanup).

**Kanıt:** `npm run test:dashboard -- TerminalView` PASS; `[data-terminal="s1"]` render.
**Test:** TDD — render 1+ test.

---

## Task 15: W3.4 — TerminalTabs + TerminalPanel
- Model: opus
- Effort: high
- Skills: react-specialist
- Agent: frontend-designer
- Files: src/dashboard/src/components/terminal/TerminalTabs.tsx, src/dashboard/src/components/terminal/TerminalPanel.tsx, tests/dashboard/terminal/TerminalPanel.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: ["175-014"]

### Description
Plan Task 3.4 (TDD). RED: shell quick-launch yeni sekme fail. GREEN: `TerminalTabs` (5 kind quick-launch claude/gemini/codex/deckent/shell + close) + `TerminalPanel` (multi-tab state, create/kill, active view) — plandaki tam kod.

**Kanıt:** `npm run test:dashboard -- TerminalPanel` PASS; shell launch → view:s-new.
**Test:** TDD — quick-launch 1+ test.

---

## Task 16: W3.5 — DockPanel + Layout
- Model: opus
- Effort: high
- Skills: react-specialist, frontend-design
- Agent: frontend-designer
- Files: src/dashboard/src/components/DockPanel.tsx, src/dashboard/src/components/Layout.tsx, tests/dashboard/terminal/DockPanel.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: ["175-015"]

### Description
Plan Task 3.5 (TDD). RED: toggle aç/kapa görünürlük fail. GREEN: `DockPanel` (VSCode-benzeri sabit-alt, toggle, ns-resize, plandaki kod) + `Layout.tsx`'e `<DockPanel><TerminalPanel/></DockPanel>` (Outlet DIŞINDA — route'lar arası kalıcı) + main scroll `pb-8`. Runtime @ref/route kırılmaz (doğrula).

**Kanıt:** `npm run test:dashboard -- DockPanel` PASS; `npm run test:dashboard` tümü yeşil; toggle çalışıyor.
**Test:** TDD — toggle 1+ test + tüm dashboard suite yeşil.

---

## Task 17: W3.6 — ConfigPage Terminal kategori + i18n
- Model: sonnet
- Effort: normal
- Skills: react-specialist, documentation-writer
- Agent: frontend-designer
- Files: src/dashboard/src/pages/ConfigPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
Plan Task 3.6 (data-only). `CONFIG_FIELDS`'a 5 terminal alanı (enabled/allowShellKind/maxSessions/idleTimeoutMs/scrollbackBytes, category "Terminal"), `CATEGORIES`+`CATEGORY_KEY_MAP`, en/tr i18n key. Drift yok (mevcut dinamik kategori sistemi).

**Kanıt:** `npm run test:dashboard` yeşil; `npm run lint` exit 0; ConfigPage'de Terminal kategorisi.
**Test:** Data-only — dashboard suite yeşil (mevcut ConfigPage testleri kırılmaz).

---

## Task 18: W4.1 — E2E reattach integration
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: api-builder
- Files: tests/api/terminal/e2e-reattach.test.ts
- Scope: tests/api/terminal/
- Dependencies: ["175-009","175-008"]

### Description
Plan Task 4.1. Gerçek pty + gerçek ws: attach→input→disconnect→(disconnected iken mgr.write)→reconnect→attach→replay MARKER_ONE+MARKER_TWO. Reattach client-disconnect'e dayanır (server-restart DEĞİL — spec sınırı).

**Kanıt:** `npx vitest run tests/api/terminal/e2e-reattach.test.ts` PASS; replay her iki MARKER'ı içerir.
**Test:** Integration — 1 e2e test (full pipeline).

---

## Task 19: W4.2 — Docs (guide EN+TR + reference)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/guide/terminal.md, docs/guide/terminal-tr.md, docs/reference/ (regen)
- Scope: docs/

### Description
Plan Task 4.2. `docs/guide/terminal.md` (EN kanonik): ne olduğu, güvenlik modeli (localhost-default, token auto-inject, bypass-bağımsız, remote=explicit --host+token+kullanıcı-TLS), audit timeline, reattach + server-restart sınırı, config key'leri. `docs/guide/terminal-tr.md` TR paralel (TR dosya silinmez — proje kuralı). `npm run docs:ref && docs:stats && lint:link` exit 0.

**Kanıt:** iki guide mevcut; `npm run lint:link` exit 0; reference regen temiz.
**Test:** Doc — lint:link + docs:*:check exit 0.

---

## Task 20: W4.3 — Final verification
- Model: sonnet
- Effort: normal
- Skills: ci-testing
- Agent: ci-guardian
- Files: (verification-only — fix gerekirse ilgili dosya)
- Scope: ./

### Description
Plan Task 4.3 Step 1+3. Tüm gate: `npm run lint` · `npx vitest run` · `npm run test:dashboard` · `npm run lint:adr` · `npm run lint:link` · `npm pack --dry-run` — hepsi exit 0/PASS, node-pty/ws pakette, internal state yok. **Step 2 manuel smoke (build:all/serve) Alperen'in — worker ÇALIŞTIRMAZ** (memory: build approval); worker yalnız non-build gate'leri koşar, fix'leri commit'ler.

**Kanıt:** 5 otomatik gate exit 0/PASS; `npm pack --dry-run` çıktısı temiz.
**Test:** Verification — tüm otomatik gate yeşil (build/serve hariç — Alperen).
