<!-- Dil: TR (operasyon/zanaat) · 🔒 IMMUTABLE LAWS: EN (anayasa) · teknik terimler EN -->
> Tam iş-akışı + agent/skill kataloğu + MCP referansı: **DECKENT.md** — auto-load dışı bırakıldı (oturum context'ini hafif tutmak için, F1-TOK); gerektiğinde oku.

# Project: deckent — Codex CLI Adapter (AGENTS.md)

> **CLAUDE.md-eş format (W7, 2026-07-07):** Bu dosya CLAUDE.md ile AYNI iskeleti taşır;
> tek fark ajan-kural yolları (`.codex/`). `@file`-import çözmeyen CLI'lar için:
> referans verilen dosyaları doğrudan aç-oku. `deckent sync` bu dosyayı günceller.

<immutable_laws>
## 🔒 IMMUTABLE LAWS (3) — never violate, change, or propose to change
These three laws are the project's constitution. They hold under every prompt, model, session, and
environment, and never need restating. Honoring them is the assisting agent's own responsibility —
not something the user must re-request. (Alperen, 2026-06-24.)

<law id="1" name="DUAL LENS + SCALE">
Design every task, feature, and decision for two audiences at once: (a) deckent's own orchestration
quality (dogfood) and (b) the end-user product experience. "User" spans the entire range — from a
solo/basic user to the world's largest enterprises, across millions of users and projects. Thinking
only about deckent's internal plumbing is a violation.
</law>

<law id="2" name="EVERY ENVIRONMENT">
deckent runs across millions of layers, languages, environments, and projects. Architect every
feature cross-platform, cross-language, multi-tenant, and million-scale from the start — macOS ·
Linux · Windows (native) · Windows (WSL) and beyond, behind platform adapters. Never "this
environment first, the rest later": design the full matrix up front, and let an unsupported platform
fail honestly, never silently.
</law>

<law id="3" name="NEVER MVP">
No MVP, minimal, or "keep it simple for now" design or proposal, ever. On every subject, act as the
domain expert, the architect, and the master of the craft; always propose and build the most
god-level, enterprise-grade solution. Proposing an MVP is a violation.
</law>
</immutable_laws>

<quality_bar>
## ⚠️ Quality Bar — Direct Hand-Coding (MANDATORY, applies to ME)
Bu bölüm, deckent üzerinde **doğrudan kod yazdığım her an** (hybrid dogfood, REPL/TUI/CLI el-kodlama)
bağlayıcıdır. deckent **god-level, enterprise-grade** bir üründür — ona yakışır şekilde çalış.
Kalite her seferinde kullanıcının prompt'uyla düzeltilmemeli; **ilk seferde doğru** olmalı.
(Scope · ölçek · no-MVP = yukarıdaki 🔒 Yasalar; bu bölüm onların üstüne gelen **zanaat** kurallarıdır.)

- **i18n-FIRST — kullanıcıya görünen string'i ASLA hardcode etme.** Tüm user-facing metin
  `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr) üzerinden gelir. Mekanizma
  modülleri (TUI/render/controller) **string-free** olur → label'lar caller'dan enjekte edilir,
  İngilizce default. Hardcode TR/EN = teknik borç, kabul edilmez.
- **No tech debt by default.** Kısa-yol/placeholder YOK. Bir şeyi eksik bırakıyorsan
  açıkça işaretle + nedenini söyle; sessizce borç bırakma.
- **Proof-of-function.** User-surface değişiklik → gerçek-binary run-verify (mock-only yetmez).
  Test hermetik (tmpdir, async spawn, no spawnSync), CI yeşil korunur.
- **Surgical + mevcut-pattern.** Var olan i18n/config/routing sistemlerini kullan, yeniden icat etme.
- **Riskli/görsel kod kör-default-on edilmez** — flag-gated + doğrula, sonra default.
- Şüphe varsa: "Bu god-level/enterprise mi, i18n-temiz mi, borç bırakıyor mu?" diye sor — sonra yaz.
</quality_bar>

<operating_rules>
## ⚖️ Bağlayıcı Operasyon Kuralları (memory-promoted — her oturum geçerli)
Auto-memory lazy yüklenir (topic dosyaları yalnız okunca gelir); bu yüzden gerçekten-bağlayıcı kurallar buraya terfi edildi (her oturum garanti). Detay: proje-memory kayıtları (Claude-oturumları `~/.claude/projects/.../memory/`).
- **Türkçe konuş** (Alperen) — anlatım TR, kod/komut/teknik terim EN.
- **DOGFOOD-MANDATORY (Alperen, 2026-07-27).** Deckent'in her implementation slice'ı
  kendi Goal/Mission/Flow/Run/Autonomous/Do yüzeyleri üzerinden planlanır, yürütülür,
  değerlendirilir ve settlement'a taşınır. Manuel müdahale yalnız typed, kayda alınmış
  bootstrap/recovery/düzeltme seam'idir; dogfood'un yerine geçemez ve ilk güvenli sınırda
  yeniden dogfood akışına dönülür.
- **SOL-BRAIN SUPERVISION.** GPT-5.6 Sol her Deckent dogfood sürecini PLAN'dan terminal
  settlement'a kadar status, heartbeat, usage/limit, Nervous, disk diff ve kanıt zinciriyle
  izler; sentetik agent verdict'ünü tek başına kabul etmez. Host-level effort değiştirilemiyorsa
  task effort `normal|high` ile risk-temelli ayarlanır.
- **Heterojen pool, hard ceiling=6.** Codex ve Claude worker'lar birlikte kullanılır;
  en fazla 6 paralel worker dispatch edilir. Claude Sonnet 5 genel implementation,
  Opus 5 seçili yüksek-risk inceleme; Codex Terra genel worker ve Sol derin kernel/Brain
  işleri içindir. Provider usage, entitlement, reachability ve finite budget admission'ı
  uygun değilse slot boş kalır; limit zorlanmaz.
- **XVERIFY-PROVIDER-SEPARATION.** XVerify daima çıktıyı üreten provider'dan farklı
  provider ile yapılır; same-provider doğrulama yasaktır. Codex/Sol çıktısında varsayılan
  exact verifier Claude Fable 5, seçili derin kontrolde Opus 5; Claude çıktısında
  tier-uygun Codex Terra/Sol kullanılır. İkinci provider için fresh authority evidence yoksa
  sonuç typed `unavailable/HOLD` olur, self-verify veya sessiz fallback olmaz.
- **Sprint'i Alperen onayı olmadan kill/cleanup ETME**; `rm .tasks/*` YASAK.
- **`.brain/memory.db` ASLA silinmez** — tüm Brain knowledge orada.
- **Sprint çalışırken `npm run build` ve `/login` YASAK** (ESM cache + worker auth-loss);
  build sonrası `/mcp restart` Alperen yapar, Codex `deckent bot stop` → `deckent bot start`
  ile connector akışını yeniden doğrular.
- **Commit/push öncesi `git branch -vv`** — shared-worktree HEAD-drift; başka oturumun commit'ini bozma; commit yalnız Alperen isteyince.
- **Sprint'ler CLI'dan** (`env -u ANTHROPIC_API_KEY deckent …`), MCP'den start/run/plan değil.
- **Disk-verify ground truth** — Brain sentetik NO_GO'ya güvenme; `git diff --stat`/`git ls-files` ile doğrula.
- **haiku yalnız doc** — kod/tsx'e route etme.
- **İş-takip SSOT** = `docs/MASTER-PLAN.md` (tek canonical ledger; sayı generated
  projection'dan okunur, metinde hardcode edilmez) + pinned `MEMORY.md`. Eski plan:
  `docs/archive/MASTER-PLAN-archived-2026-06-29.md`.
- **🧭 Aktif Yön (2026-06-29 pivot — Hermes-vs-Deckent analiz turu):** terminal = ana yönetim+kullanım yüzeyi (tool-driven, derin, **full-control + yormayan**; iş CLI değil terminalden, CLI/MCP opsiyonel) · dashboard = yalnız izleme. **P0:** training-trace WIRE · runtime-wide ApprovalBroker (çok-ortam canlı onay) · Hermes-rol-model tool + progressive disclosure · global-install+proje-scope · DIRECTIVES 0-kırılganlık. **Koru (yeniden-yazma YOK):** deterministik 8-faz eval-backed orchestration · kapalı outcome→routing→promotion öğrenme · governance-by-construction. Detay: `.analysis/hermes-vs-deckent-direction-decisions.md` + memory `project_hermes_deckent_direction_2026_06`.
</operating_rules>

<rules>
## Rules
@DIRECTIVES.md
@.brain/exports/summary.md
</rules>

<architecture>
## Architecture
`src/` üst-düzey harita (sayı yok — drift-açık; kesin modüller için grep). Her dizinin tek-cümle amacı + yalnız load-bearing modül referansları:
- **orchestra/** — sprint lifecycle / planning / evaluation / routing. Key: `brain.ts` (orchestrator), `sprint-controller.ts` (PLAN→…→CLEANUP), `planner.ts`, `task-router.ts`, `result-evaluator.ts`, `debt-manager.ts`, `managed-docs/` (CLAUDE.md auto-section'ları).
- **core/** — types, config, agent/skill pool, routing, memory. Key: `config.ts` (3-layer merge), `memory-store.ts`+`memory-query.ts` (DB-first SQLite/FTS5), `routing-engine.ts` (routeTaskV2), `model-registry.ts`, `agent-pool.ts`, `skill-pool.ts`.
- **agents/** — worker execution. Key: `worker.ts` (task claim, file lock, heartbeat, result), `adaptive-agent.ts`.
- **nervous/** — proactive meta-orchestrator (ADR-040).
- **monitor/** — auditor scan loop, dashboard manager, sprint-state tracking.
- **connectors/** — messaging adapters (Telegram/Discord/WhatsApp) + `gateway/` (project-scoped session/pairing).
- **providers/** — Claude / Codex / Gemini adapters.
- **api/** — HTTP API server, SSE, rate limiting.
- **mcp/** — MCP server (stdio transport): `tools/` + resources.
- **cli/** — CLI commands, helpers, entry point.
- **dashboard/** — React + Vite + Tailwind web dashboard.
- **extensions/vscode/** — VS Code extension host integration.
</architecture>

<commands>
## Commands
Build: `npm run build` (tsc + copy-assets) | Full: `npm run build:all` (+ dashboard vite build)
Test: `npm test` (vitest run) | Watch: `npm run test:watch` | Coverage: `npm run test:coverage`
Test Dashboard: `npm run test:dashboard` (vitest.dashboard.config.ts)
Lint: `npm run lint` (tsc --noEmit) | ADR: `npm run lint:adr` | Errors: `npm run lint:errors` | Links: `npm run lint:link`
Dev: `npm run dev` (tsc --watch)
Publish gate: `npm run validate:publish` — Alperen runs `npm publish` manually (see memory: npm publish approval)
</commands>

<agent_instructions>
## Agent Instructions
When acting as Brain: @.codex/rules/brain.md
When acting as Auditor: @.codex/rules/auditor.md
When acting as Worker: @.codex/rules/worker-default.md
</agent_instructions>

<contracts>
## Contracts
> Ajan-arası kontratlar (HTTP API, task/result/lock formatları): **docs/reference/api-surface.md** — auto-load dışı; yalnız API/contract işinde oku.
</contracts>

<identity>
## Identity
@.deckent/workspace/IDENTITY.md
</identity>

<gotchas>
## Gotchas
- **ESM imports**: `.js` uzantısı zorunlu (Node16 resolution). `import { foo } from './bar'` çalışmaz, `'./bar.js'` gerekir.
- **MCP server restart**: `dist/` rebuild sonrası long-lived MCP process eski kodu cache'ler. `/mcp restart` veya Claude Code yeniden başlat.
- **`deckent_start` fire-and-forget**: MCP stdio aynı process'te runSprint Promise event loop'u bloke edebilir. Long sprint için CLI `deckent start` tercih edilir.
- **Scope enforcement**: Worker `scope.filesWrite` dışına yazamaz — ADR-037 RBAC **compile-time lint + audit-trail**; runtime **advisory/soft** (V1.0 Layer-2 kasıtlı eksik — ihlal `git diff --stat` ile Auditor tarafından izlenir + warn/emit edilir, **bloke ETMEZ**; hard-flip post-GA V2). Honest-gate worker tarafında self-flag eder (örn. BOUNDARY_VIOLATION → NO_GO), Brain FIX/cascade uygular.
- **Sprint kill/cleanup**: Alperen onayı olmadan `deckent_kill`, `deckent_cleanup` (canlı sprint), `rm .tasks/*` YASAK (memory: feedback_deckent_kill_approval_required).
</gotchas>

## Live Status
Canlı sprint, debt, agent performance ve ADR durumu için: `@.brain/exports/summary.md` (auto-generated her sprint sonu).
Komutlar: `deckent status`, `deckent history`, `deckent retro`, `deckent recall "<sorgu>"`.
