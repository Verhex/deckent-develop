# Deckent — Kapsamlı İş Planı (2026-05-23)

**Tarih:** 2026-05-23
**Versiyon:** 1.0
**Sahip:** Alperen Sartaçoğlu
**Hedef:** OSS GA (1 Haziran 2026 beta) → milyon kullanıcı → agentic-OS vizyonu

**Kapsam Girdileri:**
- `docs/audits/sprint-188/*.md` (12 audit raporu, 250 KB, ~80+ bulgu)
- `docs/alperen-analysis/2026-05-22-wrongstack-comparison-learnings.md` (WS-Z/D/K/X serisi)
- `docs/ROADMAP-GOD-LEVEL.md` (Trinity + Sub-projects + Conversational Shell)
- `docs/vision/roadmap.md` (Trinity matrix, Path B/A/C)
- `docs/alperen-analysis/2026-05-22-memory-v2-migration.md` (Memory V2 migration)
- 2026-05-23 yeni stratejik direktifler (Alperen)
- 3 çatal kararı (Alperen onaylı, 2026-05-23)

---

## 0. Yönetici Özeti

Sprint 189 "fix-only" değil — **çok-akarsulu OSS GA programı**. Master plan **11 work stream**a bölündü; her stream Sprint 188 bulgularını + WrongStack derslerini + 2026-05-23 yeni stratejik yönlerini somut iş maddelerine çevirir.

### 3 Çatal Kararı (Alperen onaylı, 2026-05-23)

| # | Karar | Sonuç |
|---|-------|-------|
| 1 | **Provider katalog:** Saf live (models.dev her oturum, 24h cache, fallback önceki cache) | `model-registry.ts` 13 hardcoded model kaldırılır → runtime fetch + cache |
| 2 | **Vektörel arama:** Şimdilik atla (FTS5 dual-layer TR normalize kanıtlı), post-GA Q3 2026 karar | Yeni bağımlılık yok, mevcut search korunur |
| 3 | **Runtime bağımlılık:** Status quo (9 dep), her biri ADR amendment + supply-chain audit checklist | WrongStack 0-dep yolu reddedildi; mevcut gerekçe netleştirilir |

### Felsefe

- **Dead code temizlenmeyecek** — `prompt-evolution`, `agent-genealogy`, `adaptive-agent`, `cross-sprint-analyzer`, `agent-retirement`, `specialization-drift`, `prompt-rollback`, `permission-guard`, `shared-context`, `cascade-detector`, `agent-cache`, `skill-cache`, `lazy-loader`, `DiscordConnector`, `TelegramConnector`, `WhatsAppConnector`, `ConnectorPool`, `SandboxSpawnBackend` = **gelecek özelliklerin canlı kaynak kodu**.
- **Evrimsel mimari taçlandırma** = milyon-user vizyonunun ana farklılaştırıcısı. Her sprint görünür davranış değişikliği üretmeli.
- **No MVP, no minimum** — `feedback_no_minimum_no_mvp_deckent` geçerli, god-level scope.
- **Trinity korunur** — AI Asistan + AI System Worker + Developer (3 yüz, tek motor).

### 11 Work Stream

> **Status snapshot (2026-05-31, post-Sprint-197):** ✅ = closed for the band • ⚠ = partial / carry-over open • ⬜ = not yet started. Detailed Sprint 189-197 landing per stream lives in *Appendix A — Sprint 189-197 Landing Summary* at the end of this document.

| Stream | Başlık | Faz | Sprint | Anchor | Status (2026-05-31) |
|--------|--------|-----|--------|--------|---------------------|
| **W-A** | OSS GA Blokerleri (WrongStack zorunlulukları) | 1 | 189-190 | WS-Z1/Z2/Z3 | ✅ 5/5 P0 (A-1 coverage gate, A-2 CHANGELOG backfill Sprint 157→197 via 197-003, A-3 sprint-reporter wire, A-4 SECURITY.md update, A-5 ADR-037 advisory note) |
| **W-B** | Sprint 188 Doc/Wire Drift Düzeltmeleri | 1 | 189-190 | Audit raporları | ✅ 23/35 (P0 + most P1 closed: B-1 ADR-008 fix, B-2/B-3 MCP count, B-4 lint guard, B-5 CLI count, B-7/B-8/B-9 Memory V2 doc cleanup — auditor.md template carry-over to Sprint 198-003; B-13 cost-gate, B-28 baseline categorize via 196-007). P2/P3 dağınık 12 madde Sprint 199+ |
| **W-C** | Native Chat (`deckent chat`) — Path B → A → C | 2 | 191-198 | WS-X1, ROADMAP-GOD §192, vision §200 | ✅ Path B LIVE — `src/cli/commands/chat.ts` subprocess + MCP auto-attach + tty forward landed; C-4 (resume), C-5 (naïve sohbet), C-6 (demo video) Sprint 199-200. Path A + Path C remain phased post-beta |
| **W-D** | Dashboard Yeniden Doğuş (UI/UX + Native) | 2 | 192-195 | ROADMAP-GOD §192 Sub-project #4 | ⬜ Deferred post-beta (Sprint 201+). Sprint 188 StatusPage 404 fix (B-10) is the only landed item; UX overhaul + Tauri native window not started — confirms `feedback_no_minimum_no_mvp_deckent` god-level scope is a multi-sprint pull |
| **W-E** | ⭐ Evrimsel Mimari Taçlandırma | 3 | 196-199 | Sprint 188 DORMANT agent evolution cluster | ⬜ Faz 3 — DORMANT modules (`prompt-evolution.ts`, `adaptive-agent.ts`, `cross-sprint-analyzer.ts`, etc.) still wired-off pending Sprint 198 honesty closure + Sprint 200 OSS launch stabilization |
| **W-F** | Provider Repair + Local LLM + Live Catalog | 1-2 | 189-195 | 3 çatal #1, vision §195, WS-D3 | ✅ Faz 1 P0 — Sprint 195-004 models.dev bootstrap startup wire landed (NO_GO classified as legitimate baseline since `bootstrapFromCatalog` is opt-in); Sprint 195-005 host-RAM detect 24 GB WSL2 / meminfo live. Local LLM (Ollama/CUDA) phased post-beta |
| **W-G** | API Surface Test + HTTP Validation | 1 | 189-190 | api-dashboard-consistency.md | ✅ P0 — Sprint 189 baseline contract coverage + Sprint 197 197-005 persona-task matcher live verify covers the persona-routing surface |
| **W-H** | Dokümantasyon Kusursuzlaştırma (içerik + sayı) | 1-2 | 189-195 | doc-code-drift.md 25 madde | ⚠ Partial — 14/25 doc-drift items closed (MCP count, CLI count, Memory V2 path, ADR list, README badges); 11 long-tail items (api.md Memory V2 9 satır + cli.md PROJECT-IDENTITY references) remain — auditor.md template via Sprint 198-003. **This refresh (Sprint 198-004) closes the 3 master-plan staleness items.** |
| **W-I** | OSS Publish Pipeline (public repo + npm + community) | 4 | 200-202 | Trinity vision, ADR-033 | ⬜ Sprint 199-200 — npm pack dry-run + Dockerfile.worker image build/push (Sprint 199), `npm publish v1.0.0-beta.1` (Sprint 200, Alperen manual) |
| **W-J** | Million-User Hardening (perf + observability + security) | 4 | 200-205 | WS-Z3 + load-test-report | ⬜ Post-beta. Sprint 196 has `docs/audits/sprint-196/load-test-report.md` baseline; full hardening Sprint 201+ |
| **W-K** | Dead Code → Live Feature Wire-Up Programı | 3 | 196-199 | Sprint 188 dead inventory | ⬜ Sequenced after W-E (same DORMANT cluster); Sprint 200+ |

### Faz Hizalama

```
Faz 1: OSS GA Blokerleri (Sprint 189-191) — 1 Haz 2026 beta launch
  W-A + W-B + W-F-1 + W-G + W-H-1

Faz 2: Trinity Üç Yüz Tamamlama (Sprint 192-195) — chat + dashboard + provider parity
  W-C + W-D + W-F-2 + W-H-2

Faz 3: Evrimsel Mimari Taçlandırma (Sprint 196-199) — dead code → live + learning evolution
  W-E + W-K

Faz 4: Public + Million-User (Sprint 200+) — public repo + npm + hardening
  W-I + W-J
```

---

# BÖLÜM I — ÇALIŞMA AKARSULARI (WORK STREAMS)

## W-A — OSS GA Blokerleri (WrongStack Zorunlulukları)

**Hedef:** 1 Haziran 2026 beta launch için kredibilite eşiklerini kapat.
**Anchor:** `2026-05-22-wrongstack-comparison-learnings.md` §1
**Faz:** 1 · **Sprint:** 189-190

| ID | İş | Kanıt | Efor | Öncelik | Bağımlılık |
|----|----|-------|------|---------|------------|
| **A-1** | Coverage threshold kapısı + CI gate | `vitest.config.ts:8` `coverage:{}` blok var, `thresholds` yok. CI `.github/workflows/ci.yml:188` coverage job çalışıyor ama build kırmıyor. **Mevcut coverage'ı ölç → floor onun biraz altına (örn. %62→%58) → her sprint ratchet** | normal | **P0** | — |
| **A-2** | CHANGELOG backfill Sprint 157→188 (30 sprint) + otomatik update | `CHANGELOG.md` son giriş "Sprint 156 (2026-05-12)" — 30 sprint geride. `v1.0.0-beta.1` etiket için zorunlu | normal | **P0** | — |
| **A-3** | CHANGELOG otomatik update sprint-reporter'a wire | Her sprint sonunda Added/Changed/Fixed otomatik üret + commit | normal | **P0** | A-2 |
| **A-4** | SECURITY.md tehdit modeli + versiyon güncelleme | "Supported Versions" tablosu `0.1.x — Yes` diyor, gerçek `1.0.0-beta.1`. Tehdit modeli yok. ADR-014/034/037 + spawn-safety özetlenmeli | normal | **P1** | — |
| **A-5** | ADR-037 advisory/soft notu SECURITY.md ve README'de dürüstçe belgele | "strict role boundaries" yanıltıcı; runtime advisory + audit-trail gerçeği | low | **P1** | A-4 |

---

## W-B — Sprint 188 Doc/Wire Drift Düzeltmeleri

**Hedef:** 12 audit raporundaki **kritik ve yüksek bulguları** doğrudan iş maddesine çevir.
**Anchor:** `docs/audits/sprint-188/*.md`
**Faz:** 1 · **Sprint:** 189-190

### W-B.1 — ADR-008 Çapraz-Teyitli İhlal (3 worker bağımsız buldu)

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **B-1** | `core/notify.ts:17` ADR-008 ihlali fix — dependency inversion | `src/core/notify.ts:17` `import { eventBus } from '../orchestra/event-bus.js'` — core→orchestra yasak yön. Fix: `core/notify-registry.ts` üzerinden dispatcher injection | normal | **P0** |

### W-B.2 — Sayısal Drift (3 yerde MCP tool count yanlış)

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **B-2** | `src/mcp/server.ts:33` DECKENT_MCP_INSTRUCTIONS "Tools (27)" → "Tools (31)" + 4 eksik tool ekle | `deckent_watch`, `deckent_feature_query`, `deckent_audit`, `deckent_recover` listede yok | low | **P0** |
| **B-3** | `IDENTITY.md:30` "MCP Tools: 27" → "31" | Self-Update Hook ile drift; manuel düzelt + AUTOGEN bloğu eşitle | low | **P0** |
| **B-4** | `scripts/lint-mcp-instructions.mjs` regression-guard | DECKENT_MCP_INSTRUCTIONS ↔ gerçek tool listesi otomatik kontrol; CI'ya wire | normal | **P1** |
| **B-5** | CLI command count "55+/56+" → gerçek 46 üst-düzey (+ alt-komut sayısı) | IDENTITY.md:17,32 + DECKENT.md drift | low | **P1** |
| **B-6** | CLAUDE.md modül sayıları güncelle (core 90→93, orchestra 76→78) | doc-code-drift.md §13 D-22..D-25 | low | **P2** |

### W-B.3 — Memory V2 Doc Stale (9 satır api.md'de)

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **B-7** | `docs/reference/api.md` Memory V2 stale referansları temizle (9 bağımsız satır) | `MEMORY_FILE`, `DECISIONS_FILE`, `DEBT_FILE` .md constant'ları + ".brain/MEMORY.md" / ".brain/DEBT.md" referansları | normal | **P0** |
| **B-8** | `docs/reference/cli.md:220,981` + `cli-commands.md:196` PROJECT-IDENTITY.md referansı temizle | Sprint 166'da kaldırıldı; `deckent finalize` açıklaması olmayan dosyayı yazacağını söylüyor | low | **P0** |
| **B-9** | `.claude/rules/auditor.md:12` "PATTERNS.md append" → "memory.db `pattern` entries" | Legacy paradigma; Sprint 187 B7'de kod değiştirildi, rule kaldı | low | **P1** |

### W-B.4 — Dashboard 404 + API Yanlış Envanter

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **B-10** | Dashboard StatusPage `App.tsx`'e wire — 404 fix | `src/dashboard/src/pages/StatusPage.tsx` işlevsel ama `App.tsx` import/route yok; 7 sayfa iddiasının 1'i 404 | low | **P0** |
| **B-11** | DECKENT.md "src/api — 4 modules" → "15 modules" (5 doğrudan + 10 terminal) | api-dashboard-consistency.md:43 | low | **P1** |
| **B-12** | `routes.tsx` senkronizasyonu veya silme — App.tsx kullanmıyor | api-dashboard-consistency.md §3 | low | **P2** |

### W-B.5 — CLI ↔ MCP Parite Kritik Açıklar

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **B-13** | `deckent_start` MCP cost-gate ekleme | `mcp/tools/start.ts:38-50` vs CLI `cli/commands/start.ts:335-384`. Sprint 140 $42 aşımı MCP'de hâlâ mümkün | normal | **P0** |
| **B-14** | `deckent_kill` MCP `force`/`userExplicit` panic-guard bypass | `mcp/tools/kill.ts:86-89` vs CLI `kill.ts:303-307` | low | **P1** |
| **B-15** | `autoApprove` varsayılan CLI false ↔ MCP true parite | `mcp/tools/start.ts:140` hardcoded true | low | **P1** |
| **B-16** | `deckent_agent_manage` + `deckent_skill_manage` MCP tools | CLI 8+10=18 alt-komut MCP'de yok (yalnız read-only `agent_list`/`skill_list`) | high | **P1** |
| **B-17** | `deckent_memory_manage` MCP tool (rebuild/export/stats/relations) | CLI `memory.ts` vs MCP `memory_query` only-read | normal | **P1** |
| **B-18** | `deckent_cost` MCP tool (show/update/budget) | CLI `cost.ts` MCP'de yok | normal | **P2** |
| **B-19** | `deckent_history`, `deckent_retro`, `deckent_review`, `deckent_run`, `deckent_explain` opsiyon paritesi | cli-mcp-parity.md §5.6-5.10 toplam ~20 eksik opsiyon | high | **P2** |
| **B-20** | `scripts/lint-cli-mcp-parity.mjs` regression-guard | Yeni CLI option eklendiğinde MCP'ye uyarı | normal | **P2** |

### W-B.6 — Script + Build + Test

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **B-21** | `scripts/directives-stress-simulator.mjs` koruma + onay gate | DIRECTIVES.md'yi koruma-sız üzerine yazar | low | **P1** |
| **B-22** | `scripts/validate-publish.ts` (Sprint 149) ↔ `.mjs` (Sprint 180) duplicate temizlik | İki versiyon paralel; eski .ts hâlâ test ediliyor | low | **P1** |
| **B-23** | `scripts/fresh-env-test.sh` Node versiyonları güncelle | 18/20/22 EOL — 24/26'ya çevir | low | **P2** |
| **B-24** | `src/dashboard/vitest.config.ts` ölü kopya — sil veya wire | Kök `vitest.dashboard.config.ts` aktif | low | **P2** |
| **B-25** | `scripts/link-checker.mjs` vs `lint-links.mjs` birleştir | İkisi de Markdown link doğrulaması; link-checker.mjs referanssız | low | **P2** |
| **B-26** | `postbuild` hook doküman düzelt — `npm run build` zaten dashboard build'i çalıştırır | CLAUDE.md eksik açıklama | low | **P3** |
| **B-27** | `tests/` dizini tsconfig'e dahil et | scripts-build-config.md §8.8 | low | **P3** |

### W-B.7 — Test Regresyon Doğrulama

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **B-28** | `npm test` tam suite çalıştır → gerçek fail sayısı + kategori | adr-test-health.md "17→43 regresyon" iddiası — Sprint 188 audit-only oldu, baseline drift mi gerçek regresyon mu doğrula | normal | **P0** |
| **B-29** | Fail kategorileri için fix planı (workflows/docs config/nervous/docker-e2e/rules-refactor) | B-28 sonucuna göre | high | **P1** |

### W-B.8 — Düşük Öncelik Drift

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **B-30** | README badge drift (sprints 175+ vs 186+) | README:10 vs IDENTITY.md:11 | low | **P2** |
| **B-31** | README "96% context reduction" iddiası → benchmark dosyası ekle veya kaldır | `docs/benchmark/memory-v2.md` yok | normal | **P2** |
| **B-32** | README Nervous System tonu "opt-in/configurable" notu | Default-off ama "Proactive meta-orchestrator" canlı gibi sunuluyor | low | **P2** |
| **B-33** | `decision-engine.ts` deprecation netleştir veya `handleScopeCollision` ayır | @deprecated etiketi yanıltıcı; handleScopeCollision aktif | normal | **P2** |
| **B-34** | `docs/reference/api-surface.md` WAVE_BUILD notu — "embedded within SPAWN" | Sprint 187 worker WAVE_BUILD ekledi ama enum'da yok | low | **P3** |
| **B-35** | `mode-presets.ts` `balanced` ile WrongStack `balanced` ad çakışmasını netleştir | Birisi `ModelStrategy`, diğeri context-window politikası | low | **P3** |

---

## W-C — Native Chat (`deckent chat`) — Path B → A → C

**Hedef:** Trinity'nin AI-Asistan personasını canlandır. "Claude-like native arayüz + naïve sohbetle çalışır + tool-use loop'u Deckent yönetir."
**Anchor:** WS-X1, ROADMAP-GOD-LEVEL §189-272, vision §192-220
**Faz:** 2 · **Sprint:** 191-198

### W-C.1 — Path B (Kısa Vade, ~150 LoC, Sprint 191)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **C-1** | `src/cli/commands/chat.ts` Path B implementasyon | Kullanıcının `claude`/`codex`/`gemini` CLI'ını subprocess spawn + Deckent MCP auto-attach + tty forward | normal | **P0** |
| **C-2** | `deckent chat` tool-use loop kontrol | Host CLI tool-use loop'u yapar, Deckent MCP server + 31 tool sunar | low | **P1** |
| **C-3** | `deckent chat --tool <cli>` opsiyonu (varsayılan: ilk bulunan) | claude/gemini/codex tercih önceliği | low | **P1** |
| **C-4** | `deckent chat --resume <session-id>` (chat history) | `memory.db` yeni `chat` entry type (schema additive); FTS5 üzerinde aranır | normal | **P1** |
| **C-5** | "Naïve sohbet" modu — task-driven değil, conversational | Kullanıcı "merhaba", "neler yapabilirsin?", "bugün ne yapsam?" gibi soruları yanıtlamalı — Brain task'a çevirmeden | normal | **P1** |
| **C-6** | Beta launch demo videosu: `npx deckent chat` → çalışıyor | June 1 kanıt | low | **P1** |

### W-C.2 — Path A (Orta Vade, ~600 LoC, Sprint 195-196)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **C-7** | `DeckentChatBackend` `src/api/terminal/session-backend.ts`'e ekle | `deckent` SessionKind PTY yerine `ChatOrchestrator` spawn — embedded terminal infra (PTY, WS gateway, auth, audit) yeniden kullanılır | high | **P1** |
| **C-8** | Dashboard "Deckent" tab — native chat surface | `src/dashboard/src/pages/ChatPage.tsx` veya terminal page içinde tab | high | **P1** |
| **C-9** | Multi-tenant uyumu — her tenant kendi chat geçmişi | Sub-project #4 (Sprint 192) ile birlikte | normal | **P1** |
| **C-10** | CLI `deckent chat --embedded` — dashboard'tan dış değil aynı backend | Single source of behavior | normal | **P2** |

### W-C.3 — Path C (Uzun Vade, ~1500 LoC + ADR-010 amendment, Sprint 198+)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **C-11** | Provider SDK migration — CLI shell-out'tan native SDK'ye | WrongStack 4 wire-family transport deseni (~1030 LoC) referans implementasyon. ADR-010 amendment | high | **P2** |
| **C-12** | Native REPL (Ink/React TUI veya custom) | `npx deckent` fresh-machine → chat sıfır prerequisite. ADR-033 tam uyum | high | **P2** |
| **C-13** | Tool-use loop kendi içimizde — host CLI bağımlılığı sıfır | Path B'nin tam terkimi (B opsiyonel kalır) | high | **P2** |
| **C-14** | Path C maliyet/zaman tahmini revize edilir | WrongStack 10 günde benzerini yapıyor — "Q3 2026" tahmini abartılı olabilir; **WS-X1 kararı: aşağı revize** | — | **P1** |

---

## W-D — Dashboard Yeniden Doğuş (UI/UX + Native Window)

**Hedef:** Dashboard'u "embedded web app" yerine **native window** + UI/UX'i Claude/Linear sınıfı kaliteye çıkar.
**Anchor:** ROADMAP-GOD-LEVEL §192 Sub-project #4, Sprint 188 api-dashboard-consistency.md
**Faz:** 2 · **Sprint:** 192-195

### W-D.1 — UI/UX Yeniden Tasarım

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **D-1** | UX audit + Linear/Claude/Vercel sınıfı referans | Mevcut 7 sayfa: Sprint, Tasks, Workers, Audit, Memory, Terminal, Status — UX/component standardı yok | high | **P1** |
| **D-2** | Design system + component library (shadcn/ui veya custom) | Tailwind + Radix + tutarlı tipografi/spacing/renk | high | **P1** |
| **D-3** | Dark mode + theme switching | Modern OSS standardı | normal | **P1** |
| **D-4** | Sayfa hiyerarşisi yeniden — `/dashboard`, `/sprints`, `/memory`, `/agents`, `/skills`, `/chat`, `/terminal`, `/audit`, `/settings` | StatusPage wire + yeni sayfalar | high | **P0** |
| **D-5** | Realtime SSE/WS event consumption — animasyonlu sprint lifecycle | Şu an polling; event-stream var, dashboard kullanmıyor | high | **P1** |
| **D-6** | "Deckent chat" tab (W-C.2 Path A ile birlikte) | Dashboard'ın merkezi olur | — | **P1** |

### W-D.2 — Native Window

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **D-7** | Tauri vs Electron vs Wails karşılaştırma + karar | Tauri tercih edilen (Rust-tabanlı, ~3MB binary, native menu) | low (karar) | **P1** |
| **D-8** | `deckent dashboard --native` opsiyonu — native window launch | `serve.ts` ile aynı backend, frontend Tauri shell | high | **P1** |
| **D-9** | macOS/Windows/Linux binary build pipeline | GitHub Actions matrix | high | **P2** |
| **D-10** | System tray icon + notifications | Sprint events → OS native bildirim | normal | **P2** |
| **D-11** | Native menu bar (File/Edit/Sprint/Tools/Help) | Native HCI standardı | normal | **P3** |

### W-D.3 — Sprint 188 Dashboard Bulguları

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **D-12** | `/api/sprint` endpoint karar — CLI mi dashboard mu kullanıyor | api-dashboard-consistency.md follow-up | low | **P1** |
| **D-13** | `/api/job/:jobId` job-tracking mekanizması | Eksik endpoint | normal | **P2** |
| **D-14** | `fetchJson`/`postJson` standardize et (AgentDetail, LanguageProvider) | Drift'i azalt | low | **P2** |
| **D-15** | `api/server.ts` eski `RateLimiter` class temizlik | Refactor borç | low | **P2** |

---

## W-E — ⭐ Evrimsel Mimari Taçlandırma

**Hedef:** Her sprintte **görünür davranış değişikliği** — sistem gerçekten öğrendiğini ve geliştiğini hissettirmeli. Mevcut "sprint learnings" + "ERRORS.md" yetmiyor — kazanım hissedilmiyor.

> **Alperen (2026-05-23):** "Otonom native sohbet gerçekten her çalıştığında süreci öğrenen ve gelişen bir evrimsel mimari tasarlamak istiyorum. Her sprint sonrası yazılanlar learnings ve errors vs beni tatmin etmiyor, gerçek bir kazanım olduğunu hissedemiyorum. Bunu, bu mimariyi taçlandırmalıyız."

**Anchor:** Sprint 188 DORMANT agent evolution cluster (9 modül ~1.876 LoC zaten yazılmış, wire yok)
**Faz:** 3 · **Sprint:** 196-199

### W-E.1 — "Gerçek Kazanım" Tasarımı (Tatmin Eşiği)

**Problem:** Mevcut learnings tatmin etmiyor çünkü:
1. Tekrarlayıcı ("Task X NO_GO çünkü Y") — pattern çıkarımı yok
2. Eyleme dönmüyor — sonraki sprint davranış değişmiyor
3. Sentezi yok — cross-sprint pattern yüzeye çıkmıyor
4. Kullanıcı görmüyor — `.brain/memory.db`'de gömülü kalıyor

**Tatmin Eşiği Tasarımı:**
Her sprint sonunda **3 görünür değişim** raporlanmalı:
- (a) **Agent davranışı** — hangi agent'ın prompt'u nasıl mutate edildi (somut diff)
- (b) **Skill repertuvarı** — hangi skill kazanıldı/güçlendi/emekli oldu
- (c) **Brain karar paterni** — gelecek sprint planı X yerine Y diyecek (somut karar)

### W-E.2 — DORMANT Modülleri Live Yap (Wire Programı)

| ID | İş | Mevcut Durum | Yeni Hedef | Efor | Öncelik |
|----|----|---------------|------------|------|---------|
| **E-1** | `prompt-evolution.ts` wire | 132 LoC dormant | Sprint sonu retro → her agent için prompt mutation öneri; A/B test; başarılı mutation prod prompt'a integrate | high | **P0** |
| **E-2** | `prompt-rollback.ts` wire | 150 LoC dormant | Performans regresyonu tespiti → otomatik son iyi prompt'a dön | normal | **P1** |
| **E-3** | `adaptive-agent.ts` wire | 213 LoC dormant | Runtime agent adaptation — task scope'a göre system prompt evolution | high | **P0** |
| **E-4** | `agent-genealogy.ts` wire | 187 LoC dormant | Her agent için "soy ağacı" — hangi sprint'te mutate edildi, hangi prompt'tan türedi, hangi başarı oranı | normal | **P1** |
| **E-5** | `agent-retirement.ts` wire | 206 LoC dormant | 5 sprint üst üste %20'nin altında başarı → emekli + uyarı | normal | **P1** |
| **E-6** | `specialization-drift.ts` wire | 107 LoC dormant | Agent gerçek kullanım vs ilan edilen uzmanlık ayrışırsa flag | normal | **P2** |
| **E-7** | `cross-sprint-analyzer.ts` wire | 242 LoC dormant | Cross-sprint pattern detection — "Son 5 sprintte memory.db ilgili task'lar %X fail" gibi sentez | high | **P0** |
| **E-8** | `permission-guard.ts` wire | 219 LoC dormant | Worker runtime permission check (ADR-037 V2 hard-flip seed) | high | **P2** |
| **E-9** | `shared-context.ts` wire | 120 LoC dormant | Worker'lar arası paylaşılan context (cross-task hint propagation) | normal | **P2** |

### W-E.3 — Görünürlük Katmanı (Tatmin Eşiği Üretici)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **E-10** | `deckent evolution report` CLI komutu | Sprint sonu üç görünür değişim raporlar: agent mutation, skill repertuar, brain karar paterni | normal | **P0** |
| **E-11** | Dashboard `/evolution` sayfası | Genealogy tree + retirement timeline + prompt diff viewer | high | **P1** |
| **E-12** | `memory.db` yeni entry type'lar: `mutation`, `genealogy`, `retirement` | Schema additive | normal | **P0** |
| **E-13** | Brain'in retro yazımına "Next Sprint Behavior Changes" bölümü ekleme | "Bir sonraki sprintte X agent şu prompt'la çalışacak" | normal | **P0** |
| **E-14** | Agent/Skill stat dashboard — success rate trend, mutation history | Mevcut `agent-pool.ts` stats var ama dashboard'ta görünür değil | normal | **P1** |

### W-E.4 — Brain'in Kendi Davranışını Mutate Etmesi

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **E-15** | `brain-self-update.ts` — sprint sonu kendi planlama prompt'unu mutate | Sprint 166 ADR-046 Brain Self-Update Hook seed; wire et | high | **P1** |
| **E-16** | Routing decision learning — outcome-tracker.ts canlandır | Mevcut module var; sprint sonu routing matrix update | normal | **P1** |
| **E-17** | Skill activation rule auto-generation — `rule-evolver.ts` canlandır | Mevcut module, outcome'lardan rule üret | normal | **P1** |
| **E-18** | Temp-skill promotion pipeline canlandır | Project conventions otomatik skill olur | normal | **P2** |
| **E-19** | Brain'in DIRECTIVES'siz çalışması (pending todo + dirty git + LLM brainstorm) | WS-K2 always-on tohumu — TOPP ADR-064 ile bağlı | high | **P2** |

### W-E.5 — AEGIS Methodology Entegrasyonu

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **E-20** | ADR-061 AEGIS proposed → accepted geçiş | Tatmin eşiği üretici evrimsel mimari = AEGIS uygulamasının kanıtı | normal | **P1** |
| **E-21** | AEGIS 9 phase × 5 rol × 3 katman model deckent kod yapısına bind | Şu an manifest-only | high | **P2** |

---

## W-F — Provider Repair + Local LLM + Live Catalog

**Hedef:** Gemini + Codex CLI'lar görünmüyor — onar. models.dev live catalog (3 çatal kararı #1). Local LLM provider (Ollama/CUDA).
**Anchor:** Alperen 2026-05-23 ("Gemini + Codex CLI kurdum ama görmüyor"), WS-D3, vision §195
**Faz:** 1-2 · **Sprint:** 189-195

### W-F.1 — Provider CLI Detection Repair (P0)

| ID | İş | Kanıt | Efor | Öncelik |
|----|----|-------|------|---------|
| **F-1** | Gemini + Codex CLI detection neden çalışmıyor — RC tespit | `which gemini`, `which codex` → varsa `src/providers/gemini.ts:isAvailable()` / `codex.ts:isAvailable()` neden false dönüyor? PATH? Binary adı? Versiyon kontrolü? | low | **P0** |
| **F-2** | `deckent doctor --providers` kanaldan kanaldan rapor | Hangi provider mevcut/eksik, hangi env var set, hangi auth çalışıyor | normal | **P0** |
| **F-3** | Provider adapter availability check — uniform interface | `claude.ts`, `codex.ts`, `gemini.ts` ortak `detect()` metodu (binary + version + auth) | normal | **P1** |
| **F-4** | Provider seçim UI/CLI — kullanıcı `deckent config providers` ile aktif provider'ları seçer | Şu an `.deckent/config.json` manuel; UX dostu yap | normal | **P1** |
| **F-5** | Provider auth wizard — `deckent auth <provider>` | Codex/Gemini için API key, Claude için session/login | normal | **P1** |

### W-F.2 — models.dev Live Catalog (3 Çatal Kararı #1)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **F-6** | `src/core/model-catalog.ts` — models.dev fetch + 24h cache | Cache: `~/.deckent/cache/models-catalog.json`. Fallback: önceki cache. Offline ise fallback | normal | **P0** |
| **F-7** | `model-registry.ts` 13 hardcoded model kaldırma → runtime fetch | ADR-023 (Plan Tier Generalizasyonu) korunur — tier-based routing model-agnostic | normal | **P0** |
| **F-8** | models.dev down → fallback chain dokumentasyonu | SECURITY.md threat model'e ekle (3rd party dependency riski) | low | **P1** |
| **F-9** | `deckent models list` CLI — kullanıcı katalog görür | Aktif provider'ların modelleri + tier mapping | low | **P1** |
| **F-10** | `deckent models refresh` — manuel cache yenile | 24h beklemeden | low | **P2** |

### W-F.3 — Local LLM Provider

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **F-11** | `src/providers/ollama.ts` adapter | Ollama HTTP API; auto-detect localhost:11434 | normal | **P1** |
| **F-12** | `src/providers/cuda.ts` veya `local.ts` — generic local model | RTX 5090 + CUDA 13.2 + WSL2 passthrough (vision §195'te referans) | high | **P1** |
| **F-13** | Local model dataset: Qwen2.5-Coder, Llama-3.3-70B, DeepSeek-V2-Coder, Mistral-Large | 32GB VRAM uyumu — model registry'de local tier | normal | **P2** |
| **F-14** | Enterprise data sovereignty test — kapalı ağ tam local çalışma | Sub-50ms latency, zero-API-cost dogfood | normal | **P2** |
| **F-15** | `deckent config worker_provider local` ile tam local sprint | Sprint 195 hedefi (vision) | normal | **P1** |
| **F-16** | Local LLM tier integration — premium/standard/economy mapping | Qwen-Coder → premium, Llama-3 → standard, küçük model → economy | low | **P2** |

### W-F.4 — Provider Routing Quality

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **F-17** | Mixed-provider sprint test — Claude (brain) + Codex (worker) + Gemini (auditor) | Sprint 134 ADR-017 wire'ı doğrula | normal | **P1** |
| **F-18** | Provider fallback chain test — birinci provider fail → ikinci | `brain_provider + fallback_provider` config wire | normal | **P1** |
| **F-19** | Per-task provider override via DIRECTIVES (`Provider:` alanı) | Şu an `model:` var; provider seçimi gizli | low | **P2** |

---

## W-G — API Surface Test + HTTP Validation

**Hedef:** `src/api/` (5 doğrudan + 10 terminal = 15 modül) hiç test edilmedi. HTTP endpoint contract validation.
**Anchor:** Alperen 2026-05-23 ("API tarafını test etmedik. onu test etmek istiyorum"), api-dashboard-consistency.md
**Faz:** 1 · **Sprint:** 189-190

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **G-1** | `src/api/server.ts` endpoint envanteri çıkar | Toplam endpoint sayısı + HTTP method + auth gereksinimi | low | **P0** |
| **G-2** | E2E HTTP test suite — her endpoint için happy path | `tests/api/*.test.ts` — vitest + supertest veya undici | high | **P0** |
| **G-3** | SSE endpoint test — event stream consumer testi | `/api/events` veya benzeri SSE channel | normal | **P0** |
| **G-4** | Rate limiting test — limit aşımı + 429 + cooldown | api-dashboard-consistency.md'de eski RateLimiter class flag'lendi | normal | **P1** |
| **G-5** | Auth middleware test — token + session + audit | `src/api/terminal/auth-provider.ts` (Sprint 175) | normal | **P1** |
| **G-6** | Dashboard ↔ API contract test — her dashboard fetch ile gerçek endpoint eşleme | api-dashboard-consistency.md "ölü endpoint" denetimi | normal | **P1** |
| **G-7** | OpenAPI spec dokümantasyonu | `docs/reference/api.md` autogen | normal | **P2** |
| **G-8** | API versioning kararı — `/api/v1/` mi `/api/` mi | OSS sürüm öncesi netleşmeli | low | **P1** |
| **G-9** | HTTP error contract — `{ error, code, details }` standart | Her endpoint aynı şekilde hata döndürmeli | normal | **P2** |
| **G-10** | API rate limit + auth + audit log SECURITY.md tehdit modelinde belge | A-4 ile bağlı | low | **P1** |

---

## W-H — Dokümantasyon Kusursuzlaştırma (İçerik + Sayı)

**Hedef:** "Sadece sayı değil **içerik** kusursuz olsun" — doc-code-drift.md 25 madde sayı düzeltmesi + içerik yenileme.
**Anchor:** doc-code-drift.md §13, Alperen 2026-05-23 ("dokümantasyon kusursuz olsun istiyorum sadece sayı değil içerik olarak")
**Faz:** 1-2 · **Sprint:** 189-195

### W-H.1 — Sayı Düzeltmeleri (W-B'de toplandı — bkz. B-2..B-9, B-30..B-31)

### W-H.2 — İçerik Yenileme (Yeni)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **H-1** | README.md baştan yaz — Trinity vision ön planda | Mevcut README teknik ağırlıklı; "Three Faces, One Engine" vision pre-eminent olmalı | normal | **P0** |
| **H-2** | Getting Started (kurulum + ilk sprint) — 5 dakikada deneyim | OSS GA için zorunlu kullanıcı yolculuğu | normal | **P0** |
| **H-3** | `docs/guide/` — Yeni kullanıcı kılavuzu (Türkçe + İngilizce) | Kavramsal: Brain, Worker, Auditor, ADR, Memory V2, Sprint Lifecycle | high | **P0** |
| **H-4** | `docs/reference/cli-commands.md` her komut için detaylı — örnekler, opsiyon tablosu, çıktı örneği | Şu an liste; gerçek referans değil | high | **P1** |
| **H-5** | `docs/reference/mcp-tools.md` her tool için aynı detay seviyesi | CLI parite | high | **P1** |
| **H-6** | `docs/architecture/` — Mimari belgeler (Brain, Worker, Auditor, Routing, Memory) | Şu an dağınık ADR'lerde | high | **P1** |
| **H-7** | `docs/cookbook/` — Tarif/örnek koleksiyonu (5+ tipik kullanım) | "Bir REST API ekle", "Bir testi düzelt", "Dokümantasyon güncelle" | normal | **P1** |
| **H-8** | `docs/vision/` cilalama — VISION.md, blueprint, competitive | Mevcut ama dağınık; tek tutarlı vision | normal | **P1** |
| **H-9** | `CONTRIBUTING.md` baştan yaz — OSS contributor onboarding | Public repo öncesi | normal | **P1** |
| **H-10** | `CODE_OF_CONDUCT.md` ekle | OSS standardı | low | **P1** |
| **H-11** | Architecture diagram (Mermaid veya SVG) — Brain↔Worker↔Auditor↔Memory | Görsel netlik | normal | **P1** |
| **H-12** | Sprint lifecycle diagram — 8 faz görsel | Anlatım kolaylaşır | low | **P2** |
| **H-13** | API surface diagram — CLI / MCP / HTTP / Dashboard | Trinity 3 yüz görseli | normal | **P2** |
| **H-14** | "Why Deckent vs X" karşılaştırma sayfası — Devin/Cursor/Aider/Copilot/OpenHands/Wrong Stack | Mevcut competitive-analysis.md cilala | normal | **P2** |
| **H-15** | Demo videolar — `deckent init`, `deckent chat`, dashboard tour | YouTube + GitHub README embed | high | **P2** |
| **H-16** | i18n — README + ana docs Türkçe + İngilizce çift dilli | ADR-032 i18n pattern uygulanır | high | **P2** |
| **H-17** | `docs/benchmark/memory-v2.md` — "96% context reduction" kanıt benchmark | B-31 ile bağlı | normal | **P1** |
| **H-18** | `docs/security/threat-model.md` — A-4 detaylı versiyonu | SECURITY.md kısa, threat-model.md ayrıntılı | normal | **P1** |
| **H-19** | `docs/adr-index.md` — 64 ADR navigasyon + status + supersede graph | Şu an memory.db'de; markdown export okunabilir değil | normal | **P2** |
| **H-20** | Dokümantasyon test — `npm run docs:test` link + heading + example code çalışıyor mu | Mevcut `lint-links.mjs` genişlet | normal | **P2** |

---

## W-I — OSS Publish Pipeline (Public Repo + npm + Community)

**Hedef:** Beta'yı public repo'ya taşı + npm publish + community altyapısı.
**Anchor:** Alperen 2026-05-23 ("beta'yı açık repo olan deckent reposuna taşımak istiyorum npm publish yapmak istiyorum milyon user istiyorum"), `feedback_build_requires_user_approval`
**Faz:** 4 · **Sprint:** 200-202

### W-I.1 — Public Repo Hazırlığı

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **I-1** | Public repo yapısı planla — monorepo mu split mi? | Şu an monorepo (dashboard içeride). OSS için kalır mı? | low (karar) | **P0** |
| **I-2** | `.brain/`, `.tasks/`, `.deckent/`, audit raporları gitignore karar | Hangileri public commit'te kalır? Hangileri private user-side? | low (karar) | **P0** |
| **I-3** | Hassas bilgi temizliği — API key, internal URL, email | git-filter-repo veya BFG; tarama scripti yaz | normal | **P0** |
| **I-4** | Commit history karar — squash mı tam tarih mi? | 188 sprint commit'i tarih dolu ama gürültülü; squash karar | low (karar) | **P1** |
| **I-5** | LICENSE — MIT (mevcut) onayı + tüm dosyalarda doğru SPDX | OSS standardı | low | **P1** |
| **I-6** | `.github/workflows/` public CI hazırlığı — secrets refactor | Internal secret → public CI secret (codecov, npm token) | normal | **P1** |
| **I-7** | GitHub Issues + Discussions template — bug/feature/question | Community altyapı | low | **P1** |
| **I-8** | GitHub PR template + Conventional Commits guide | Contributor onboarding | low | **P1** |
| **I-9** | `.github/FUNDING.yml` — sponsor opsiyonu | OSS sürdürülebilirlik | low | **P2** |

### W-I.2 — npm Publish

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **I-10** | `package.json` `name: deckent` mı `@deckent/cli` mı `deckent-cli` mı? | npm registry availability check | low (karar) | **P0** |
| **I-11** | `bin` entries — `deckent`, `deckent-mcp`, `deckent-dashboard` | Tek paket çoklu binary | low | **P0** |
| **I-12** | `files` field — dist + assets, kaynaklar hariç | npm publish boyutu küçük tut | low | **P0** |
| **I-13** | `engines` — Node ≥24 (mevcut, doğrula) | Compatibility kontrol | low | **P1** |
| **I-14** | Cross-platform test — macOS + Linux + Windows + WSL2 | better-sqlite3 prebuild availability | normal | **P0** |
| **I-15** | `validate:publish` gate — Alperen manual approval (memory: npm publish approval) | Alperen `npm publish` manuel | low | **P0** |
| **I-16** | `1.0.0-beta.1` ilk yayın | Beta tag, beta kullanıcıları için | low | **P0** |
| **I-17** | `npm view deckent` smoke — fresh machine install + first sprint | Pre-publish validation | normal | **P0** |
| **I-18** | Auto-update mechanism — `deckent update` veya `npm i -g deckent@latest` | UX | normal | **P2** |

### W-I.3 — Community + Marketing

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **I-19** | Landing page — `deckent.dev` veya `deckent.app` (sadece statik, ADR-033 service-yok) | Domain rezerv | low | **P1** |
| **I-20** | Demo videosu + GIF (asciinema) — `deckent chat` ile bir sprint | Show, don't tell | high | **P1** |
| **I-21** | Launch posts — HN, Reddit (r/programming, r/MachineLearning, r/OpenSource), Twitter/X, LinkedIn | Beta launch koordinasyon | normal | **P1** |
| **I-22** | Discord community server | OSS community standardı | normal | **P2** |
| **I-23** | Blog / changelog — `dev.to`, Medium, kişisel blog | Sürdürülebilir mindshare | normal | **P2** |
| **I-24** | "deckent vs X" comparison content | H-14 ile bağlı | — | **P2** |
| **I-25** | Showcase repo — "Built with deckent" örnek projeler | Community sosyal kanıt | normal | **P3** |

---

## W-J — Million-User Hardening (Perf + Observability + Security)

**Hedef:** Milyon kullanıcı vizyonu için sistem dayanıklılığı, gözlemlenebilirlik, güvenlik sertliği.
**Anchor:** Alperen 2026-05-23 ("milyon user istiyorum"), WS-Z3 (security), load-test-report
**Faz:** 4 · **Sprint:** 200-205

### W-J.1 — Performance

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **J-1** | Cold start optimization — `deckent --help` <500ms | Şu an muhtemel ~2s (eager imports) | normal | **P1** |
| **J-2** | Lazy-load: `nervous`, `dashboard`, `serve` komutları (WS-D1) | scripts-build-config + WS-D1 | normal | **P1** |
| **J-3** | Cache stratejisi — `agent-cache`, `skill-cache`, `lazy-loader` modülleri (DORMANT şu an) wire et | Sprint 188 dormant — wire P0 | normal | **P1** |
| **J-4** | Memory V2 query perf — büyük DB (10K+ entry) için index optimization | better-sqlite3 EXPLAIN QUERY PLAN audit | normal | **P2** |
| **J-5** | Parallel sprint execution — multi-sprint same project | Şu an tek sprint; multi-tenant ile bağlı | high | **P2** |
| **J-6** | Worker spawn time — Docker cold start <3s | Sprint 139 docker E2E var, optimize | normal | **P2** |
| **J-7** | Load test framework — `tests/load/` (load-test-report.md seed) | wave.transition p99 7s — hedef <2s | high | **P2** |

### W-J.2 — Observability

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **J-8** | OpenTelemetry (OTel) entegrasyonu — trace + metric + log | Enterprise gözlemlenebilirlik standardı | high | **P1** |
| **J-9** | Prometheus metric endpoint — `/metrics` | sprint duration, worker hb, debt count, NO_GO rate | normal | **P1** |
| **J-10** | Structured log JSON — pino veya benzeri | Şu an console.log; OSS deploy için structured | normal | **P1** |
| **J-11** | Sentry / error tracking opt-in | Hata raporlama (ADR-033 service-yok: opt-in, local-first) | normal | **P2** |
| **J-12** | Health endpoint `/api/health` — sistem durumu | K8s deploy uyumu | low | **P1** |
| **J-13** | Sprint timeline replay — debugging için event-stream replay | UX | normal | **P2** |
| **J-14** | `deckent metrics` CLI — local metric summary | UX | normal | **P3** |

### W-J.3 — Security Hardening

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **J-15** | ADR-037 hard-flip (V2) — runtime scope enforcement | Şu an advisory; V2 hard-block. WS-D4 anchor | high | **P1** |
| **J-16** | Spawn-safety whitelist genişletme + audit | `spawn-safety.ts` — yeni provider/binary için onay flow | normal | **P1** |
| **J-17** | `.deck` secret system audit — encryption-at-rest | ADR-014 | normal | **P2** |
| **J-18** | Multi-project isolation hardening — ADR-034 | Filesystem boundary tests | normal | **P2** |
| **J-19** | Supply chain audit — 9 dep her biri için CVE check + license check | 3 çatal kararı #3 takip | normal | **P0** |
| **J-20** | Dependency pinning + lockfile audit policy | OSS standartı | low | **P1** |
| **J-21** | `npm audit` CI gate | Otomatik CVE detection | low | **P1** |
| **J-22** | Worker code execution sandboxing — Docker isolation default | ADR-027 hybrid backend; Docker default-on opsiyonu | high | **P2** |
| **J-23** | API rate limiting + auth hardening | G-4 ile bağlı | — | **P1** |
| **J-24** | Secret detection pre-commit hook — gitleaks veya benzeri | Public repo öncesi zorunlu | low | **P0** |

---

## W-K — Dead Code → Live Feature Wire-Up Programı

**Hedef:** Sprint 188'in DORMANT olarak işaretlediği modüller = gelecek özellik tohumları. Wire'lanacak, temizlenmeyecek.
**Anchor:** Sprint 188 dead inventory (~3.500-4.000 LoC), Alperen 2026-05-23 ("dead code aslında eklenecek özellikler")
**Faz:** 3 · **Sprint:** 196-199 (W-E ile paralel + sonraki sprintlerde)

### W-K.1 — Agent Evolution (W-E içinde — bkz. E-1..E-9)

### W-K.2 — Cache + Lazy Load Cluster

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **K-1** | `core/agent-cache.ts` wire — `AgentSelectionCache` | LRU cache for selectAgent() — perf | normal | **P1** |
| **K-2** | `core/skill-cache.ts` wire — `SkillLoadingCache` | LRU cache for skill resolution | normal | **P1** |
| **K-3** | `core/lazy-loader.ts` wire — `LazyMap` | Lazy module loading utility | normal | **P2** |
| **K-4** | `core/cascade-detector.ts` wire — `CascadeDetector` | NO_GO cascade detection (Sprint 136 reconciliation seed) | normal | **P2** |

### W-K.3 — Connector Activation Programı

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **K-5** | `DiscordConnector` instantiate + `cli/commands/connector.ts` discord aç | Sprint 153 hedefi; webhook receive zaten canlı, bot send dormant | normal | **P2** |
| **K-6** | `TelegramConnector` aktive et | Discord ile aynı pattern | normal | **P2** |
| **K-7** | `WhatsAppConnector` stub → full implementation | Sprint 153+ aktivasyon hedefi (Sprint 188'de stub) | high | **P3** |
| **K-8** | `ConnectorPool` wire — multi-connector orchestration | Single source of truth for messaging | normal | **P2** |
| **K-9** | Connector setup wizard — `deckent connector add discord` | UX | normal | **P3** |
| **K-10** | Connector usage docs + cookbook | H-7 cookbook'a örnek | low | **P3** |

### W-K.4 — Sandbox Provider

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **K-11** | `providers/sandbox.ts SandboxSpawnBackend` wire | Şu an `start.ts:212 applySandbox` git-stash; class kullanılmıyor | high | **P2** |
| **K-12** | Git-stash sandbox vs class-based sandbox karar | Hangisi koruyacak, hangisi emekli | low (karar) | **P2** |

### W-K.5 — Memory Helper Functions

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **K-13** | `memory-import.ts backfillSprintMemoriesFromSprintsDir` wire veya ADR-038 explicit retirement | Şu an 0 caller; eski sprint backfill için yararlı olabilir | low | **P3** |
| **K-14** | `memory-export.ts exportAdrsToFs` — test-only caller, prod wire kararı | İhtiyaç varsa `deckent memory export-adrs` CLI'a wire | low | **P3** |
| **K-15** | `orchestra/sprint-phases.ts runDecayPhase` orphan export — DECAY tek yer | Şu an `sprint-finalizer.ts:707/709 runDecay()` kullanılıyor; runDecayPhase orphan | low | **P3** |

### W-K.6 — Nervous System Activation Programı

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **K-16** | Nervous Phase 2 pilot — 5 MVP detector balanced mode | vision §195 Sprint 193+ | high | **P1** |
| **K-17** | Nervous Phase 3 GA — 12 detector tamamı | vision §195 | high | **P2** |
| **K-18** | Dashboard `NervousPage` aktif notifications | D-11 ile bağlı, Sub-project #4 | high | **P1** |
| **K-19** | `nervous_system.enabled=true` deckent-dev dogfood | `project_nervous_activation_plan` memory | normal | **P1** |
| **K-20** | ADR-040 metni güncelle — 5 MVP detector → 12 detector, Sprint 148 hedef bayatlık temizle | doc drift | low | **P1** |

### W-K.7 — Self-Modifying Detector Wire (ADR-039)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **K-21** | `orchestra/self-modifying-detector.ts isSelfModifyingSprint` runtime wire | 0 caller şu an; `authority-enforcer.ts:48` parametre alıyor ama set etmiyor. Sprint 139 catastrophic lesson korunmuş ama wire eksik | normal | **P1** |

---

# BÖLÜM II — FAZ HİZALAMA + SPRINT MAPPING

## Faz 1 — OSS GA Blokerleri (Sprint 189-191)

**Hedef:** 1 Haziran 2026 beta launch için kredibilite + bloker temizliği.

### Sprint 189 — "Foundations Fix" (P0 ağırlık)
- **Stream:** W-A, W-B, W-F.1, W-G başlangıç
- **Tahmini task:** 18 task, 2 dalga
- **Dalga 1 (foundations):** A-1, A-2, B-1, B-2, B-3, B-7, B-8, B-10, B-13, B-28, F-1, F-2, G-1, G-2
- **Dalga 2 (parity):** A-3, A-4, A-5, B-4, B-9, B-11, B-14, B-15, G-3

### Sprint 190 — "Drift Cleanup + API E2E"
- **Stream:** W-B kalan, W-G tamamlama, W-F.2 başlangıç
- **Tahmini task:** ~16 task
- **Dalga 1:** B-5, B-6, B-12, B-16, B-17, B-21, B-22, B-29
- **Dalga 2:** B-19, B-20, F-6, F-7, G-4, G-5, G-6, G-7, G-8

### Sprint 191 — "Chat Path B Beta Demo"
- **Stream:** W-C.1, W-H.1 başlangıç
- **Tahmini task:** ~12 task
- **Dalga 1:** C-1, C-2, C-3, C-4, C-5, F-3, F-4, F-5
- **Dalga 2:** C-6, H-1, H-2 (README + Getting Started)
- **Hedef:** June 1 beta launch — `deckent chat` çalışır demo

---

## Faz 2 — Trinity Üç Yüz Tamamlama (Sprint 192-195)

**Hedef:** Trinity üç yüzünü beta sonrası tamamla.

### Sprint 192 — "Dashboard UI/UX Yeniden Tasarım"
- **Stream:** W-D.1, W-H.2 başlangıç
- D-1, D-2, D-3, D-4, D-5, H-3, H-4, H-5

### Sprint 193 — "Local LLM + Provider Polish"
- **Stream:** W-F.3, W-F.4
- F-11, F-12, F-13, F-14, F-15, F-16, F-17, F-18, F-19
- Nervous Phase 2 pilot — K-16

### Sprint 194 — "Dashboard Native + Multi-Tenant"
- **Stream:** W-D.2, W-D.3, Sub-project #4
- D-7, D-8, D-9, D-10, D-12, D-13, D-14, D-15
- Multi-tenant audit log + enterprise dashboard

### Sprint 195 — "Chat Path A + Local LLM GA + Nervous Dashboard"
- **Stream:** W-C.2, W-F.3 tamamlama, W-K.6
- C-7, C-8, C-9, C-10, K-18, K-19, K-20
- Sub-project #4 GA

---

## Faz 3 — Evrimsel Mimari Taçlandırma (Sprint 196-199)

**Hedef:** Tatmin eşiği — her sprint görünür davranış değişikliği.

### Sprint 196 — "Evolution Core Wire"
- **Stream:** W-E.2 ağırlık
- E-1, E-3, E-7 (P0 evolution core: prompt-evolution + adaptive-agent + cross-sprint-analyzer)
- K-1, K-2, K-3, K-4 (cache cluster wire)

### Sprint 197 — "Evolution Visibility + Brain Self-Update"
- **Stream:** W-E.3, W-E.4
- E-10, E-11, E-12, E-13, E-14
- E-15, E-16, E-17

### Sprint 198 — "Connectors + Sandbox + AEGIS"
- **Stream:** W-K.3, W-K.4, W-E.5
- K-5, K-6, K-8 (Discord/Telegram aktive)
- K-11, K-12 (Sandbox provider)
- E-20, E-21 (AEGIS proposed → accepted)
- C-11 başlangıç (Path C native SDK migration başlat)

### Sprint 199 — "Path C + Evolution Mature"
- **Stream:** W-C.3, W-E kalan, W-K kalan
- C-11, C-12, C-13, C-14
- E-2, E-4, E-5, E-6, E-8, E-9, E-18, E-19
- K-21 (self-modifying detector wire)

---

## Faz 4 — Public + Million-User (Sprint 200+)

**Hedef:** Public repo + npm publish + milyon kullanıcı altyapısı.

### Sprint 200 — "OSS Publish Pipeline"
- **Stream:** W-I.1, W-I.2 başlangıç, W-J.3 P0
- I-1, I-2, I-3, I-5, I-6, I-10, I-11, I-12
- J-19, J-24

### Sprint 201 — "npm Publish + Beta Tag"
- **Stream:** W-I.2 tamamlama
- I-13, I-14, I-15, I-16, I-17
- I-7, I-8, I-9
- **Hedef:** `npm publish deckent@1.0.0-beta.1`

### Sprint 202 — "Community + Marketing"
- **Stream:** W-I.3
- I-19, I-20, I-21, I-22, I-23, I-24, I-25
- H-9, H-10, H-15

### Sprint 203-205 — "Million-User Hardening"
- **Stream:** W-J
- J-1..J-23 — perf + observability + security

### Sprint 206+ — "Vector DB Karar Penceresi" (3 çatal #2 deferred)
- Kullanıcı geri bildirimi + ölçüm bazlı karar

---

# BÖLÜM III — KARAR TABLOSU + AÇIK NOKTALAR

## III.A — Verilmiş Kararlar (2026-05-23)

| Karar | Sonuç | Etki |
|-------|-------|------|
| Dead code disposition | **Wire-Up Programı (W-K)** — temizleme yok | ~3.500-4.000 LoC gelecek özellikler |
| Provider katalog | **models.dev live + 24h cache + fallback** | F-6/F-7 implementasyon |
| Vektörel arama | **Skip → post-GA Q3 2026 karar** | FTS5 korunur, yeni dep yok |
| Runtime bağımlılık hedefi | **Status quo 9 dep + ADR audit checklist** | J-19/J-20 audit programı |

## III.B — Açık Kararlar (Master Plan İçinde Karar Beklemede)

| ID | Karar | Seçenekler | Etki | Karar Tarihi |
|----|-------|-----------|------|--------------|
| **D-7** | Native window framework | Tauri / Electron / Wails | Sprint 194 başlangıç | Sprint 192 |
| **C-14** | Path C zaman çizelgesi | Q3 2026 / Sprint 198-199 (revize) / sonra | WrongStack 10 günde benzerini yapıyor — abartılı tahmin | Sprint 195 |
| **I-1** | Public repo yapısı | Monorepo / Split (cli + dashboard + mcp) | Sprint 200 başlangıç | Sprint 199 |
| **I-2** | `.brain/`, `.tasks/` public commit kapsamı | Tüm tarihi public / squash / sadece kod | Public repo öncesi | Sprint 199 |
| **I-4** | Commit history | Tam tarih / squash | Public repo öncesi | Sprint 199 |
| **I-10** | npm package adı | `deckent` / `deckent-cli` / `@deckent/cli` | Sprint 201 öncesi | Sprint 200 |
| **K-12** | Sandbox stratejisi | Class-based / git-stash | Sprint 198 | Sprint 197 |
| **Vector DB** | (deferred) | Plugin / Hybrid / Skip | Post-GA Q3 2026 | Sprint 206+ |

---

## III.C — Sprint 188 Bulgu Kapsamı (Tam Sayım)

**P0 (8 madde):** B-1, B-2, B-3, B-7, B-8, B-10, B-13, B-28
**P1 (28 madde):** A-1..A-5, B-4, B-5, B-9, B-11, B-14..B-17, B-21, B-22, B-29, C-1..C-6, D-12, F-1, F-2, F-17, F-18, G-3, G-4
**P2 (28 madde):** B-6, B-12, B-18..B-20, B-23..B-25, B-30..B-33, D-3, D-5, D-13..D-15, E-2, E-4..E-9, F-3..F-5, F-19, G-1, G-9, H-17
**P3 (12 madde):** B-26, B-27, B-34, B-35, K-7, K-9, K-10, K-13..K-15, J-14, I-25

**Toplam:** **~76 iş maddesi (W-A..W-K kataloğu) + ~70 WrongStack/yeni-stream maddesi = ~150 iş maddesi**

---

## III.D — Acil Sıradaki Adım

1. **Bu plan'ı oku + onayla** (Alperen)
2. **B-28 ön-doğrulama:** `npm test` tam suite çalıştır → gerçek fail sayısı + kategori (Sprint 188 audit-only oldu, baseline drift mi gerçek regresyon mu) — Sprint 189 DIRECTIVES yazımı öncesi zorunlu
3. **Sprint 189 DIRECTIVES.md hazırla** — Dalga 1 (14 task) + Dalga 2 (4 task)
4. **`deckent_plan` + `deckent_start` Sprint 189** — beta launch için 6 günlük pencere (1 Haz - 23 May = 9 gün arası)
5. **III.B açık kararları sırayla netleştir** (Sprint 192 Tauri, Sprint 195 Path C, Sprint 199 public repo)

---

# BÖLÜM IV — RİSK + ÖLÇÜM

## IV.A — Riskler

| Risk | Olasılık | Etki | Azaltım |
|------|----------|------|---------|
| 1 Haz beta launch 9 günde 18+18 task tamamlanamayabilir | Yüksek | Yüksek | Sprint 189-191 task'larının P0 alt-kümesi (sadece kritik) hedeflenmeli; geri kalan post-beta |
| `deckent chat` Path B 1 Haz'a yetişmezse beta'da "chat çalışıyor" iddiası boş kalır | Orta | Yüksek | C-1..C-6 önceliklendirilir; bir provider (Claude) ile bile çalışırsa demo yeterli |
| models.dev down / değişen API sözleşmesi | Düşük | Orta | F-8 fallback chain + bundled snapshot opsiyonu (3 çatal #1 fallback önerisi olarak ele alınabilir) |
| Evrimsel mimari (W-E) tatmin eşiği yakalanamazsa Alperen yine "kazanım hissedemiyorum" der | Orta | Yüksek | W-E.1 tatmin eşiği 3 görünür değişim sözleşmesi katı uygulanmalı; her sprint sonu yazılı kanıt |
| Public repo öncesi hassas bilgi sızıntısı | Düşük | Çok Yüksek | I-3 + J-24 zorunlu; manuel review + automated scan |
| Test suite gerçek regresyon ise Sprint 189-191 görünür yavaş ilerler | Orta | Orta | B-28 önceden çalıştır + B-29 plan |
| Local LLM provider perf gerçek dünya tatmin etmezse "milyon user için yetersiz" eleştirisi | Düşük | Düşük | F-14 sub-50ms latency hedef + benchmark kanıt |
| ADR-037 hard-flip (V2) çok geç gelirse "advisory güvenlik" eleştirisi | Orta | Orta | J-15 Sprint 200+ yerine Sprint 192-193'e öne çekilebilir |

## IV.B — Başarı Ölçütleri

### Faz 1 (Sprint 191 sonu)
- [ ] `npx deckent` fresh install çalışıyor (I-17 smoke yapıldı, public öncesi local)
- [ ] `deckent chat` Path B demo videosu var (C-6)
- [ ] Sprint 188 P0 madde (8) %100 tamam
- [ ] CHANGELOG güncel + CI coverage gate aktif
- [ ] Gemini + Codex CLI tanınıyor (F-1, F-2)

### Faz 2 (Sprint 195 sonu)
- [ ] Dashboard "Linear/Claude sınıfı" UX
- [ ] Native window çalışıyor (Tauri/Electron/Wails seçilen)
- [ ] Local LLM provider canlı (Ollama veya CUDA)
- [ ] Dashboard'tan native chat tab (Path A)
- [ ] Nervous Phase 2 pilot

### Faz 3 (Sprint 199 sonu)
- [ ] `deckent evolution report` her sprint somut 3 değişim raporluyor
- [ ] Alperen "kazanım hissediyorum" der (kullanıcı geri bildirimi)
- [ ] Dead code → live feature wire: 9 evrimsel modül + 4 cache modülü + connector pool wire
- [ ] Path C native SDK ya bitti ya beta'da

### Faz 4 (Sprint 202 sonu)
- [ ] `npm publish deckent@1.0.0-beta.1` LIVE
- [ ] Public repo `github.com/deckent/deckent` (veya seçilen ad)
- [ ] HN / Reddit / Twitter launch koordinasyonu
- [ ] İlk 1.000 kullanıcı (npm install + GitHub star)

### Faz 4+ (Sprint 205 sonu)
- [ ] 10K npm install / ay
- [ ] OTel + Prometheus production gözlemlenebilirlik
- [ ] ADR-037 V2 hard-flip
- [ ] Supply chain audit her sprint zorunlu

---

# BÖLÜM V — EK BAĞ NOKTALARI

## V.A — Mevcut Memory Bağlantıları

- `[[user_alperen]]` — Alperen role + preference
- `[[project_deckent_god_level_vision]]` — god-level ürün vizyonu
- `[[project_deckent_agentic_os_vision]]` — agentic OS 3 persona × 3 audience
- `[[project_deckent_trinity_anchor]]` — Trinity anchor 2026-05-20
- `[[project_june1_beta_roadmap]]` — 1 Haz beta KESİN = Sprint Mode OSS
- `[[project_topp_continuous_dispatch]]` — TOPP continuous-dispatch (W-E.4 ile bağlı)
- `[[project_embedded_web_terminal]]` — Embedded terminal (W-C.2 Path A foundation)
- `[[project_nervous_activation_plan]]` — Nervous aktivasyon planı (W-K.6 ile bağlı)
- `[[project_aegis_methodology]]` — AEGIS metodoloji (W-E.5 ile bağlı)
- `[[project_task_type_taxonomy_vision]]` — TaskType + EnvironmentType + Hybrid Scoring
- `[[project_sprint188_self_analysis]]` — Sprint 188 self-analysis (W-B kaynak)
- `[[brain-memory-v2-migration-incomplete]]` — Memory V2 migration tamam
- `[[feedback_no_minimum_no_mvp_deckent]]` — MVP/minimum yasak
- `[[feedback_db_silmek_yasak]]` — .brain/memory.db korunur
- `[[feedback_break_sprint_bug_cycle]]` — ship & iterate
- `[[feedback_trust_brain_eval_not_worker]]` — Brain verdict gerçek, worker .result ipucu

## V.B — ADR İlişkileri (etkilenen ADR'ler)

- **ADR-008** — W-B B-1 fix sonrası core/notify.ts ihlali biter
- **ADR-010** — W-C.3 Path C native SDK için amendment gerekli
- **ADR-022 / 022-V2** — W-B parite düzeltmeleri sonrası tam uyum
- **ADR-033** — W-I public repo + Path C zero-prerequisite vizyonuyla uyum
- **ADR-037** — V2 hard-flip Sprint 192+ (J-15)
- **ADR-039** — W-K K-21 wire ile aktif
- **ADR-040** — W-K.6 Nervous Phase 2-3 + metin güncelleme (K-20)
- **ADR-045** — Mevcut wire korunur (W-E etkilemez)
- **ADR-046** — W-E.4 Brain Self-Update Hook genişler (E-15)
- **ADR-053** — TaskType taxonomy korunur; audit task kategorisi sprint 188'de kullanıldı
- **ADR-055 (proposed)** — Hybrid Scoring 5-layer — Faz 3 ile accepted'a geçirilebilir
- **ADR-060 (proposed)** — Self-Awareness propagation — W-E.4 ile uyum
- **ADR-061 (proposed)** — AEGIS — W-E.5 ile accepted'a geçirilir
- **ADR-064** — TOPP continuous-dispatch — W-E.4 E-19 always-on tohumu

## V.C — Dosya Lokasyonları

- Bu plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md`
- Sprint 188 raporları: `docs/audits/sprint-188/*.md` (12 dosya)
- WrongStack analizi: `docs/alperen-analysis/2026-05-22-wrongstack-comparison-learnings.md`
- Memory V2 migration: `docs/alperen-analysis/2026-05-22-memory-v2-migration.md`
- Roadmap (planlama log): `docs/ROADMAP-GOD-LEVEL.md`
- Vision (kanonik): `docs/vision/roadmap.md`
- Trinity matrix: `docs/vision/roadmap.md:24-44`
- Conversational Shell Path B/A/C: `docs/vision/roadmap.md:192-220` + `docs/ROADMAP-GOD-LEVEL.md:189-272`

---

**Son not:** Bu plan **iş maddesi kataloğu** — Sprint 189 DIRECTIVES.md değildir. Sprint 189 DIRECTIVES'i ayrı yazılacak; bu master plan'dan Faz 1 task'larının Dalga 1 alt-kümesi seçilecek. Plan her sprint sonu retro'da güncellenmeli (yeni bulgu / değişen öncelik / yapılan task).

---

# EK BÖLÜM — W-L Stream: Karpathy Discipline Refactor (2026-05-23 eklendi)

**Hedef:** Tüm agent PROMPT.md + skill SKILL.md + worker rules `.claude/rules/*.md` dosyalarını **Karpathy 4-discipline + success-criteria** framework'üne göre refactor et. Talimat listesinden ölçülebilir kriter setine geçiş.
**Anchor:** `https://github.com/multica-ai/andrej-karpathy-skills`, `[[project_karpathy_skill_discipline]]`, Alperen 2026-05-23
**Faz:** 3 · **Sprint:** 191-193

## W-L.1 — Karpathy 4-Discipline Framework Adoption

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **L-1** | `.claude/rules/karpathy-disciplines.md` baseline framework dosyası | 4 disiplin core text (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution) + Deckent-spesifik örnekler | normal | **P0** |
| **L-2** | `.claude/rules/worker-default.md` refactor — 98 satırdan ~30 satıra | Karpathy 4-discipline frame + Deckent worker-specific success criteria (heartbeat, scope, .result format) | normal | **P0** |
| **L-3** | `.claude/rules/brain.md` refactor — Karpathy frame altında | Brain decision criteria (GO/NO_GO eşikleri, FIX threshold, decay) | normal | **P0** |
| **L-4** | `.claude/rules/auditor.md` refactor — Karpathy frame altında | Auditor verifiable scan criteria + alert thresholds | normal | **P0** |

## W-L.2 — Agent PROMPT.md Refactor (15 agent + 3 temp/archive)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **L-5** | `agents/bug-fixer/PROMPT.md` refactor — 90→20 satır | "5 Whys" gibi yöntem listesi → "Root cause traced + regression test written + minimal diff" kriterleri | normal | **P0** |
| **L-6** | `agents/architect/PROMPT.md` refactor | "Architecture coherent with ADRs + module boundaries respected + no circular deps" | normal | **P1** |
| **L-7** | `agents/code-reviewer/PROMPT.md` refactor | "Issues found mapped to file:line + severity classified + actionable fix suggested" | normal | **P1** |
| **L-8** | `agents/refactorer/PROMPT.md` refactor | "Behavior preserved (tests green) + complexity reduced (measurable metric) + surgical scope" | normal | **P1** |
| **L-9** | `agents/api-builder/PROMPT.md` refactor | "Schema versioned + auth/rate-limit explicit + happy-path test green + error contract uniform" | normal | **P1** |
| **L-10** | `agents/performance-analyzer/PROMPT.md` refactor | "Baseline measured + bottleneck identified file:line + improvement quantified (% or ms)" | normal | **P1** |
| **L-11** | `agents/security-auditor/PROMPT.md` refactor | "OWASP categories scanned + findings severity-classified + mitigation traceable to ADR" | normal | **P1** |
| **L-12** | `agents/accessibility-auditor/PROMPT.md` refactor | "WCAG level confirmed + violations file:line + a11y axe rule cited" | normal | **P2** |
| **L-13** | `agents/data-engineer/PROMPT.md` refactor | "Data flow traced + idempotency verified + rollback path documented" | normal | **P2** |
| **L-14** | `agents/devops-engineer/PROMPT.md` refactor | "CI step green + deploy reversible + observability hooks (log/metric/trace) added" | normal | **P2** |
| **L-15** | `agents/frontend-designer/PROMPT.md` refactor | "Component visually distinct + responsive breakpoints verified + a11y semantic correct" | normal | **P2** |
| **L-16** | `agents/migration-specialist/PROMPT.md` refactor | "Migration reversible (or one-way explicit) + breaking changes enumerated + ADR amendment" | normal | **P2** |
| **L-17** | `agents/ci-guardian/PROMPT.md` refactor | "Test fail categorized + regression vs new fail distinguished + block_on_test_fail correct" | normal | **P2** |
| **L-18** | `agents/doc-writer/PROMPT.md` refactor | "Doc traces to code (file:line) + no stale ref + heading structure + 3 link minimum" | normal | **P2** |
| **L-19** | `agents/architecture-planner/PROMPT.md` refactor | "ADR proposed/amended + tradeoffs surfaced + dependency graph updated" | normal | **P2** |
| **L-20** | Temp agent PROMPT.md generator template — `temp-skill-generator.ts` wire | Sprint 188 Bug B (archive, temp-react-specialist, temp-react-ts-specialist 3 agent PROMPT.md eksik); generator template Karpathy format yazsın | high | **P0** |

## W-L.3 — Skill SKILL.md Refactor (21 skill)

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **L-21** | `skills/typescript-expert/SKILL.md` refactor — rule-list'ten success-criteria'ya | "Strict mode no @ts-ignore + Result<T,E> for errors + utility types over duplicate definitions" | normal | **P1** |
| **L-22** | `skills/testing-expert/SKILL.md` refactor | "TDD red→green→refactor + ≥3 test per behavior + mock only at boundary + coverage ratchet" | normal | **P1** |
| **L-23** | `skills/anthropic-sdk/SKILL.md` refactor | "Prompt caching enabled + tool use schema validated + retry on rate limit + token budget tracked" | normal | **P1** |
| **L-24** | `skills/security-specialist/SKILL.md` refactor | "OWASP top 10 mapped + input validated at boundary + secrets in .deck + audit log on auth events" | normal | **P1** |
| **L-25** | `skills/performance-optimizer/SKILL.md` refactor | "Profiled (V8 inspector/perf) + bottleneck quantified + improvement ≥20% or no-op" | normal | **P1** |
| **L-26** | `skills/devops-engineer/SKILL.md` refactor | "Pipeline declarative + idempotent + observable + reversible" | normal | **P2** |
| **L-27** | `skills/database-migration/SKILL.md` refactor | "Migration reversible script + zero-downtime safe + dual-write window documented" | normal | **P2** |
| **L-28** | `skills/react-specialist/SKILL.md` refactor | "Hooks rules respected + component pure + props typed + render perf measured" | normal | **P2** |
| **L-29** | `skills/python-expert/SKILL.md` refactor | "Type hints + ruff clean + pytest ≥3 + venv isolated" | normal | **P3** |
| **L-30** | `skills/ci-testing/SKILL.md` refactor | "Test runs in CI matrix + flaky retry max 3 + artifact uploaded on fail" | normal | **P2** |
| **L-31** | `skills/accessibility-expert/SKILL.md` refactor | "axe scan green + keyboard navigable + screen reader tested + WCAG AA min" | normal | **P2** |
| **L-32** | `skills/code-simplifier/SKILL.md` refactor | "Complexity metric reduced + behavior preserved + LoC -X% or ±10%" | normal | **P2** |
| **L-33** | `skills/docker-expert/SKILL.md` refactor | "Multi-stage minimal + non-root user + healthcheck + size <500MB" | normal | **P2** |
| **L-34** | `skills/frontend-design/SKILL.md` refactor | "Design tokens (color/space/font) + responsive + a11y + dark mode" | normal | **P2** |
| **L-35** | `skills/git-expert/SKILL.md` refactor | "Conventional commit + branch hygiene + no force-push to main + signed if required" | normal | **P3** |
| **L-36** | `skills/graphql-expert/SKILL.md` refactor | "Schema introspection + N+1 prevented + persisted query + depth limit" | normal | **P3** |
| **L-37** | `skills/migration-expert/SKILL.md` refactor | "Codemod or migration script + breaking changes ADR + reversible or explicit one-way" | normal | **P3** |
| **L-38** | `skills/monorepo-expert/SKILL.md` refactor | "Workspace boundary enforced + shared deps versioned + build cache hit" | normal | **P3** |
| **L-39** | `skills/system-architect/SKILL.md` refactor | "C4 levels documented + non-functional reqs enumerated + ADR proposed" | normal | **P2** |
| **L-40** | `skills/documentation-writer/SKILL.md` refactor | "Doc traces to code + 3 link min + heading structure + diataxis category" | normal | **P2** |
| **L-41** | `skills/api-builder/SKILL.md` refactor | (agent L-9 ile aynı disiplin, skill versiyonu) | normal | **P2** |

## W-L.4 — Verification + Evolution Integration

| ID | İş | Detay | Efor | Öncelik |
|----|----|-------|------|---------|
| **L-42** | Karpathy framework + W-E evrimsel mimari bağlantısı | Her agent için success criteria = mutation hedefi; `prompt-evolution.ts` Karpathy kriterlerini ölçer | high | **P0** |
| **L-43** | `scripts/lint-prompt-md-karpathy.mjs` regression-guard | Her PROMPT.md/SKILL.md Karpathy format'ına uygun mu (max 25 satır, success criteria block var mı, vb.) | normal | **P1** |
| **L-44** | Worker prompt builder Karpathy framework injection | `task-builder.ts` worker prompt'a Karpathy 4-discipline header inject etsin | normal | **P1** |
| **L-45** | Agent success rate ölçümü — Karpathy criteria match | Worker `.result.notes` Karpathy criteria karşılandı mı parse et + success-rate'e dahil et | high | **P2** |

## Toplam W-L

**Sayım:** 45 task (L-1..L-45) — Sprint 191-193 arasında 3 sprint'e bölünmüş.
**Sprint dağılımı önerisi:**
- **Sprint 191 — Karpathy Core + P0 Agents:** L-1..L-5 (rules baseline + 4 P0 agent), L-20 (temp template), L-42 (evolution bağ) = 8 task
- **Sprint 192 — Agent + Critical Skills:** L-6..L-11, L-21..L-25 (10 critical agent + skill) + L-43, L-44 = 13 task
- **Sprint 193 — Skill Tail + Polish:** L-12..L-19, L-26..L-41 (kalan agent + skill) + L-45 = ~24 task (3 dalga bölünür)

**Beklenen kazanım:**
- Toplam talimat satırı: ~1900 → ~600 (%68 azalma)
- Agent success-rate ölçülebilir (mutation input data)
- W-E (Evrimsel mimari) için kriter-bazlı evolution hedefleri
- Sprint 188 Bug B (3 missing PROMPT.md) kalıcı fix (template generator)
- "Don't tell it what to do, give it success criteria" — worker drift'i azalır

**Bağ noktaları:**
- `[[project_karpathy_skill_discipline]]` memory
- `[[feedback_prompt_completeness_over_brevity]]` — uyum: Karpathy "completeness preserved" (criteria self-contained, talimat değil tasarruf)
- W-E (Evrimsel Mimari) — Karpathy criteria = mutation hedefi
- W-K (Dead Code Wire-Up) — prompt-evolution.ts canlanır, criteria-based feedback loop'la

---

# EK BÖLÜM — Sprint 191 P0 Backlog (2026-05-24 eklendi, 2 sprint dogfood'dan biriken)

**Hedef:** Sprint 189-190 boyunca biriken false-NO_GO + infrastructure + UX bug'larını kapat. Beta launch için her biri kritik.
**Anchor:** [[feedback_docker_oom_false_no_go]], systematic-debug 2026-05-24 RC tanısı

## Sprint 191 P0 — Beta Bloker (12 madde)

| ID | İş | RC | Kanıt |
|----|----|-----|-------|
| **P191-1** | `evaluateWithRubric` → `reconcileSpuriousNoGo` wire (Sprint 145 deprecated path'inde kaldı) | sprint-phases EVALUATE production fn'i partialMarker durumda git-diff reconcile etmiyor | result-evaluator.ts:1087 + sprint-phases.ts:783/1142 |
| **P191-2** | Docker memory budget düzelt — 6 worker × 8g = 48GB, WSL2 yetmez | OOM exit 137 SIGKILL kök neden | `max_workers: 3` veya `--memory 4g` (spawn-backend-docker.ts:383) |
| **P191-3** | `runtime_extension_enabled: true` + auto-extend | Worker timeout yaklaşırsa otomatik uzatma yok | .deckent/config.json:timeout |
| **P191-4** | Sprint 190 16 false-NO_GO retroactive reclassify | evaluateWithRubric fix sonrası mevcut .result'lar re-eval edilmeli | docs/audits/sprint-189/test-fail-categorize.md follow-up |
| **P191-5** | Temp agent PROMPT.md generator template (3 missing: archive, temp-react-specialist, temp-react-ts-specialist) | Sprint 190'da temp-react-ts %33 success — degraded prompt direkt etki | temp-skill-generator.ts wire |
| **P191-6** | Dashboard non-terminal endpoints token bootstrap | /status, /history vs 401 — terminal-api token attach var, diğer fetch'lerde yok | api-dashboard-consistency.md follow-up |
| **P191-7** | Cost-gate `planSprint` mode-respecting (structured → AI fallback bug) | brain_planning:structured iken AI parser çağrılıyor → 3 dk gecikme | start.ts:349, mcp/tools/start.ts:113 dryRun:true (drift) |
| **P191-8** | ci-guardian "0 failure but warning" yanıltıcı mesaj | vitestResult.passed/testFailed parsing — 0 fail ama passed=false (build/OOM) durumu | plugin-hooks.ts:691 |
| **P191-9** | MCP `deckent_start` fire-and-forget Promise lifecycle | MCP stdio process'inde runSprint Promise event loop'a takılı kalıyor → sprint silently başlamıyor | CLAUDE.md gotchas note kalıcı çözüm |
| **P191-10** | CLI `node dist/cli/index.js` silent exit RC + fix | index.js boş çıktı veriyor (bin entry.js doğru ama compat eksik) | bin yolu sanity |
| **P191-11** | Memory DB retro entry yazımı (ADR-046 hook chronic incomplete) — Sprint 189-190'da retro entry yok | sprint-finalizer retro hook DB write fail | sprint-retro-writer.ts |
| **P191-12** | IDENTITY.md sat30 Project Status AUTOGEN extend (Sprint 189-012 carry-over) | AUTOGEN block sat26-38'e taşındı ama hâlâ sat30 manuel düzenleme drift'i mümkün | identity-generator.ts |

## Karpathy + dead-code wire-up (W-L+W-E+W-K kapsamı)

Yukarıdaki P0 12 + W-L Karpathy Discipline Refactor (L-1..L-5 core + L-20 temp template = 6 task) + Sprint 190 yarım kalan (Provider isAvailable + Ollama TECH_DEBT fix) = ~20 task Sprint 191 için.

**Sprint 191 toplam tahmin:** 18-20 task, 2-3 dalga, ~60 dk

## Beta launch için zorunlu eşik (1 Haz 2026)

Bu 12 P0 + Sprint 190 carry-over tamam olmalı. Sprint 192+ (Trinity dashboard reborn, Path A, Local LLM polish) buna bağlı.

---

# W-INTEGRITY — Synthetic Result Eradication (Sprint 192 İzleme + Reform)

**Anchor:** Sprint 191 canlı kanıt — `runEvaluatePhase` 191-009..017 için synthetic NO_GO yazdı (8 task hiç spawn olmadı, max_workers=3 + Wave-0 27dk saturation). 14 fix-task gereksiz üretildi, agent stats çarpıtıldı.

**Kullanıcı kuralı (Alperen 2026-05-24):** "Sentetik veriyle asla iş yapmamalıyız sentetik veri ihtimallerini 0lamalıyız. Time-trigger olsa bile ilerleme varsa NO_GO yazma. Zaman sınırlarını daha geniş tutalım."

**Hotfix landed (Sprint 191, pre-Sprint 192):**
- `src/orchestra/worker-liveness.ts` (new, ~155 LoC) — 5-layer liveness signal evaluator
- `src/orchestra/sprint-phases.ts:1120` öncesi — never-spawned SKIP + alive grace 60s + dead synthetic with honest label
- `tests/orchestra/worker-liveness.test.ts` (new, 9 test) — L1-L5 katman senaryoları
- **Brain in-memory state etkilenmez — Sprint 191 mevcut process eski kod, Sprint 192 yeni davranış**

**Sprint 192 W-INTEGRITY izleme + tamamlama task'ları:**

| Task | Açıklama | Beklenen Etki |
|------|----------|---------------|
| **I-1** | Sprint 192'de hotfix etkisini ölç — never-dispatched, alive-grace-hit/miss, dead event sayıları retro'ya yaz | Veri-bazlı validation |
| **I-2** | `sprint-controller.ts:821, 845` synthetic NO_GO blokları — aynı liveness check entegrasyonu (cleanup/recover path) | İkinci sentetik kaynağı kapanır |
| **I-3** | EVALUATE phase trigger sıkılaştır — "all tasks dispatched OR explicitly DEFERRED" şartı; kısmi-dispatch'te EVALUATE'e geçme | Wave-3 task'lar spawn olmadan EVALUATE'e geçmez |
| **I-4** | `TaskEvaluation.DEFERRED` enum + sprint retro reporting — DEFERRED task sayısı net rapor | Şeffaf retro |
| **I-5** | Sprint-level adaptive timeout — effort × 2-3 multiplier (kullanıcı "zaman sınırlarını geniş tutalım") | Yetersiz timeout false NO_GO'sunu sıfırlar |
| **I-6** | Lint rule `disallow-synthetic-result-without-liveness-check` (eslint custom veya scripts/) | CI guard — gelecek regresyon önleme |
| **I-7** | Audit-trail event `BRAIN→WORKER:NEVER_DISPATCHED` dashboard widget — retro panelinde DEFERRED count | Kullanıcı görünür şeffaflık |

**Onay:** Alperen 2026-05-24 onayladı — hotfix şimdi, Sprint 192'de izleme + reform.

---

# Sprint 191 191-017-fix — Sprint 190 Provider Carry-Over Closure Status (2026-05-23)

**Parent task:** 191-017 (NO_GO — "Timeout - no result received"). Fix task closes the
result-write gap; underlying source already landed during Sprint 190 cross-fixes.

## Ask A — Provider isAvailable() 3-state (was 190-002)

**Status:** ✓ DONE in tree (verified during 190-002-xfix and re-verified here).

| Surface | File:line | State |
|---------|-----------|-------|
| `ProviderDetectResult` interface | `src/providers/claude.ts:38-52` | `ready: true \| false \| 'partial'` |
| `ClaudeAdapter.detect()` | `src/providers/claude.ts:300-323` | binary OK → `ready:true` (CLI session) |
| `CodexAdapter.detect()` | `src/providers/codex.ts:263-286` | binary OK + no auth → `ready:'partial'` |
| `GeminiAdapter.detect()` | `src/providers/gemini.ts:347-369` | binary OK + no GOOGLE_API_KEY → `ready:'partial'` |
| `OllamaAdapter.detect()` | `src/providers/ollama.ts:291-336` | server reachable → `ready:true`, else `false` |
| `getProviderPartialHint()` | `src/cli/commands/doctor.ts:423-430` | per-provider actionable hint |
| `formatProviderDiagnosticsActionable()` | `src/cli/commands/doctor.ts:444-470` | ✓ / ⚠ / ✗ format + hints |

**Test coverage:** 378/378 PASS across in-scope files (89 gemini + 76 codex + 22 ollama
+ 4+4 isAvailable + 183 doctor).

## Ask B — Ollama TECH_DEBT closure (was 190-009)

**Status:** ⚠ Partial — 1 of 4 closed; 3 items deferred for out-of-scope filesWrite.

| # | TECH_DEBT item | File | In 191-017-fix scope? |
|---|----------------|------|----------------------|
| 1 | `tests/core/model-registry.test.ts` invariant (13/3) — closed by 190-009-xfix | `src/core/model-registry.ts` + `src/providers/ollama.ts` opt-in registration | ✓ Done in Sprint 190 |
| 2 | `ProviderName` union widening to 4 values, drop runtime casts | `src/core/task-types.ts` | ✗ Not in filesWrite |
| 3 | `bootstrapProviders` + `detectOllama` factory wiring | `src/core/provider.ts` | ✗ Not in filesWrite |
| 4 | `TIER_PROVIDER_MAP` ollama row for cross-provider tier remapping | `src/core/model-equivalence.ts` | ✗ Not in filesWrite |

**Why items 2-4 are deferred:** 191-017-fix scope is limited to `providers/`,
`cli/commands/`, `docs/alperen-analysis/`, and corresponding tests. Items 2-4 require
writes into `src/core/` which the auditor would flag as boundary violations under
ADR-037. They are documented here verbatim so the next sprint can pick them up with
zero discovery cost — exact files, exact change needed.

## Recommended follow-up

- Sprint 192 candidate task: "Ollama core/ wire-up + ProviderName widen" with
  `filesWrite: [src/core/task-types.ts, src/core/provider.ts, src/core/model-equivalence.ts]`
  and corresponding tests in `tests/core/`. Effort: low (each item is <30 LoC additive).
- User-visible impact today: `deckent config set worker_provider ollama` accepts the
  value but the spawner cannot construct `OllamaAdapter` automatically — chat-mode
  (Task 190-007) still works because it instantiates the adapter directly.

---

# Appendix A — Sprint 189-197 Landing Summary (2026-05-31 refresh)

> Refreshed by Sprint 198-004 (this document refresh). Per-stream details are scattered across the W-A..W-K cards above; this appendix collapses them into a Sprint-major view so the reader can answer "what actually shipped in the band 189-197?" in a single table. Source archives: `.brain/archive/DIRECTIVES-sprint-189.md` through `.brain/archive/DIRECTIVES-sprint-197.md`; outcome ground-truth: `.deckent/archive/sprints/sprint-189/` through `sprint-196/` (Sprint 197 still in `.tasks/archive/`).

| Sprint | Date (2026) | Tasks | DONE / total | Key achievement | W-stream landing |
|--------|-------------|-------|--------------|-----------------|------------------|
| **189** | May 23 | 9 | 8/9 (~89%) | OSS GA Blocker Wave 1 — CHANGELOG backfill Sprint 157→188 (A-2), MCP tool count drift fix (B-2/B-3), `core/notify.ts:17` ADR-008 ihlali dependency-inversion fix (B-1), dashboard StatusPage 404 wire (B-10), `lint-mcp-instructions.mjs` regression guard (B-4) | W-A (5/5 P0), W-B (P0 13 items), W-G (baseline contract coverage) |
| **190** | May 23 | 13 | 9/13 (~69%) | `runtime_extension_enabled: true` default + worker timeout extension wire (191-002 carry); Ollama provider initial wire (190-007 chat-mode, 190-009 ⚠ tech-debt items 2-4 deferred); Docker OOM cycle drove ~14 false NO_GO (reclassified Sprint 197-002 retroactive — see `feedback_brain_synthetic_nogo_disk_verify`) | W-A (A-3 sprint-reporter wire), W-F (provider wire seed), W-B (B-13 cost-gate) |
| **191** | May 24 | 17 | 14/17 (~82%) | Karpathy 4-discipline anchor land (`karpathy-discipline.md` wired into `worker-default.md` / `brain.md` / `auditor.md`); Worker Discipline Anchor adopted; 191-017-fix Ask A + Ask B (provider doctor split) | W-A (A-4/A-5 SECURITY.md update), W-F (F-2 provider doctor), W-H (H-5 anchor docs) |
| **192** | May 24 | 11 | 8/11 (~73%) | Mid-band stabilization — `max_workers` config experiments documented, RAM verify groundwork seeded (Sprint 197-004 finalizes); sprint-log-192 row finalize bug repeats (Sprint 198-002 backfill) | W-B (drift cleanup), W-F (provider repair), W-J (load-test groundwork) |
| **193** | May 25 | 7 | 6/7 (~86%) | SMOKE-001 i18n `en.json` duplicate `error.lock_conflict` cleanup (legitimate baseline NO_GO classification); bootstrap stability fixes | W-H (i18n docs), W-B (drift) |
| **194** | May 25 | 9 | functional ✓, finalize ⚠ | Brain finalize halted mid-flow — `sprint-log-194` row missing from `memory.db` (discovered Sprint 197 197-002; Sprint 198-002 closes via `backfill-sprint-log-rows.mjs` + defensive minimal-row write in `sprint-finalizer.ts`). Functional work landed but evaluation rows incomplete. | (recovered via Sprint 198-002) |
| **195** | May 25 | 9 | 7/9 (~78%) | **WP-1..WP-12 Tier-1 wire** — agent `PROMPT.md` canonical source, skill content full-fidelity, idempotency-key `${sprintId}-${taskId}-${retryCount}`, scope.filesWrite auto-include of test paths (WP-3 `deriveTestScope`); 195-005 host-RAM detect (24 GB WSL2 / `meminfo`) live; 195-004 catalog bootstrap NO_GO → Sprint 196 carry; +90 tests | W-F (catalog), W-J (load-test base), W-A (script hardening) |
| **196** | May 26 | 7 | 5/7 (~71%) | **Disk-verify gate KAYNAK 1-5 live** — `verifyDiskAgainstClaim` runtime gating in `result-collector.ts:518-583` + 4 siblings; 196-005 token-counter.ts NO_GO exposed **KAYNAK 6+7 ungated** paths (Sprint 198-001 seed); 196-007 test-fail audit (`docs/audits/sprint-196/test-fail-categorize.md`) — 41-fail baseline kategorize; +44 tests | W-B (B-28 baseline categorize), W-A (gate hardening) |
| **197** | May 26 | 8 | 6/8 (~75%) + 2 rescued | **7/7 synthetic NO_GO source map complete** (197-001) — `sprint-phases.ts:1318-1330` + `sprint-controller.ts:963-1003` identified for Sprint 198-001; **197-002 retroactive reclassify** 2/12 applied + 10 skipped (sprint-entry-missing — Sprint 198-002 backfill); **197-003 CHANGELOG 40-entry catch-up** Sprint 157→197; **197-004 WSL2 OOM mitigation** rescue (`max_workers 2→6`, `worker_memory_limit 3g→2g`); **197-005 persona-task matcher** live verify + threshold tuning rescue; chore commit `cd4df0ed` regenerated `auditor.md` from legacy PATTERNS.md template (Sprint 198-003 fixes); +30 tests | W-A (A-2/A-3 CHANGELOG), W-B (B-9 auditor.md carry), W-G (persona surface) |

**Band totals (Sprint 189-197):**
- 90 tasks dispatched, ~67 DONE first-pass + ~12 rescued ≈ **88% effective DONE**
- ~17 rescue commits across Sprint 195-197 (the honest-gate band)
- ~6500 net LoC delta (Sprint 195-197), 164 new tests
- 5 of 7 synthetic NO_GO source paths gated (Sprint 198-001 closes 6+7)
- Test baseline 52 → 41 fail (Sprint 198-006 attacks Tier-1 toward ≤26)
- 5 new accepted ADRs in the window: ADR-053 (TaskType Taxonomy), ADR-062 (Embedded Web Terminal — pre-band), ADR-063 (Consent-Based Prerequisite Provisioning), ADR-064 (TOPP Continuous Dispatch); ADR-061 (AEGIS) remains proposed pending beta-stability
- 8 durable feedback memories landed: `feedback_brain_synthetic_nogo_disk_verify`, `feedback_no_auth_touch_during_sprint`, `feedback_worker_prompt_engineering_god_level`, `feedback_proactive_blocker_disclosure`, `feedback_npm_publish_user_approval`, `feedback_no_minimum_no_mvp_deckent`, `feedback_trust_brain_eval_not_worker`, `feedback_trust_deckent_recovery`

---

# Appendix B — Faz 1 Checkpoint (2026-05-31): Beta Launch READY

> Refreshed by Sprint 198-004 (1 day to 1 Haziran 2026 OSS beta launch).

| Çıkış kriteri | Hedef | Sprint 198-004 anı durumu | Karar |
|---------------|-------|---------------------------|-------|
| OSS GA Blocker Wave 1 P0 (W-A 5/5) | All P0 closed | ✅ 5/5 closed | **GO** |
| Sprint 188 doc/wire drift P0 (W-B) | All P0 closed | ✅ 13/13 P0 closed (auditor.md template carry → Sprint 198-003) | **GO with debt** (Sprint 198-003 closes) |
| Native chat (W-C Path B) | LIVE | ✅ `deckent chat` subprocess + MCP auto-attach | **GO** |
| Provider repair P0 (W-F-1) | Live catalog + host RAM detect | ✅ Sprint 195-005 host RAM live, models.dev bootstrap available (opt-in) | **GO** |
| API surface test (W-G) | Baseline + persona | ✅ Sprint 189 baseline + Sprint 197-005 persona | **GO** |
| Doc kusursuzlaştırma (W-H Faz 1) | Master plans + drift fix | ✅ This refresh (Sprint 198-004) closes the 3 master-plan staleness items; long-tail to Sprint 199+ | **GO with debt** |
| Brain dürüst raporlama 7/7 | All 7 synthetic NO_GO source paths gated | ⚠ 5/7 live (KAYNAK 6+7 → Sprint 198-001 in flight) | **GO conditional** (Sprint 198-001 closes within band) |
| memory.db sprint-log integrity | All sprint rows present | ⚠ Sprint 194/196 rows missing (Sprint 198-002 backfill in flight) | **GO conditional** (Sprint 198-002 closes within band) |
| Managed-docs auditor.md template | New paradigm rendered | ⚠ Legacy text regressed by Sprint 197 chore commit (Sprint 198-003 in flight) | **GO conditional** (Sprint 198-003 closes within band) |
| RAM 6-worker × 2g readiness | Host RAM ≥ 14 GB | ⚠ Config tightened Sprint 197-004; verification flag Sprint 198-005 in flight | **GO conditional** (Sprint 198-005 readiness check) |
| Vitest baseline | Don't regress past 41 fail | ✅ 41 fail held since Sprint 196; Sprint 198-006 attacks Tier-1 toward ≤26 | **GO** |

**Verdict (2026-05-31, T-1 day to launch):** Sprint 198 6-task zorunlu band is in flight; **once 198-001 + 198-002 + 198-003 land (all opus-tier, scoped per `DIRECTIVES.md`), every Faz 1 GO-conditional flips to GO** and the 1 Haziran 2026 OSS beta launch window is clean. Sprint 199 packaging (npm pack dry-run + Dockerfile.worker image + release notes) is the final gate; Sprint 200 = `npm publish v1.0.0-beta.1` (Alperen manual per `feedback_npm_publish_user_approval`).

**No new scope expansion accepted between now and Sprint 200.** Any drift-bait (new W-stream items, Sprint 188 P2/P3 long-tail, Sprint 199-008 / 199-009 OPSIYONEL tasks beyond Sprint 198's spec) is parked to Sprint 201+.
