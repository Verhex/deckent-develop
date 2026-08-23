<!-- Dil: TR (operasyon/zanaat) · 🔒 IMMUTABLE LAWS: EN (anayasa) · teknik terimler EN -->
> Tam iş-akışı + agent/skill kataloğu + MCP referansı: **DECKENT.md** — auto-load dışı bırakıldı (oturum context'ini hafif tutmak için, F1-TOK); gerektiğinde oku.

# Project: deckent

<!-- DECKENT-DEV-CONTROL:START -->
SCHEMA_VERSION=1
DOGFOOD_MODE=ON
WORKSPACE_MODE=MAIN
DELIVERY_MODE=DIRECT_MAIN
PR_REQUIRED=false
MERGE_QUEUE_REQUIRED=false
REMOTE_CI_MODE=ADVISORY
LOCAL_VERIFICATION_MODE=REQUIRED
EXECUTION_AUTHORITY=CODEX
ANALYSIS_AUTHORITY=CODEX
OWNER_AUTHORITY=ALPEREN
DECISION_REF=owner-live-2026-08-23-repo-hygiene-complete-dogfood-on
<!-- DECKENT-DEV-CONTROL:END -->

> Yukarıdaki blok aktif repo-development mode değerlerinin TEK persisted projection'ıdır
> (machine-readable; gate: `scripts/lint-operating-policy.mjs`). Canlı Alperen talimatı her
> zaman üstündür. Prose bu değerlerin tersini söyleyemez; `DIRECTIVES.md`, eski sprint state,
> capsule veya geçmiş chat mode authority DEĞİLDİR.

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
- **Production wiring closure.** Yeni/değişen üretim kodu; canonical producer → consumer →
  entrypoint/ingress → policy/config enablement zinciri ve bu zinciri gerçekten çalıştıran kanıt
  olmadan `DONE` değildir. Test-only import, izole module, fixture-local reimplementation veya
  yalnız unit-green sonuç `UNWIRED/HOLD` sayılır. Task scope zinciri bağlamaya yetmiyorsa kodu
  sahte tamamlamak yerine exact eksik authority/consumer raporlanır. Atomik foundation işi ancak
  aynı approved DAG'da exact closure task'ına dependency-bound ise ara-artifact olarak settle olur;
  closure başarısızken outer run/capability `COMPLETE` olamaz.
- **Surgical + mevcut-pattern.** Var olan i18n/config/routing sistemlerini kullan, yeniden icat etme.
- **Riskli/görsel kod kör-default-on edilmez** — flag-gated + doğrula, sonra default.
- **Result-notes-first (Alperen, 2026-08-11).** Worker bulguları varsayılan olarak `.result`
  notes + koda gider; standalone `follow-up-works/` dokümanı YALNIZ owner'ın okuyup karar
  vereceği işe açılır; fabrika dalgası başına ≤3 doküman; her doküman başlığında silinme-tetiği
  (delete-on-consume koşulu) zorunludur. Tüketilen doküman arşivlenmez, SİLİNİR — kalıcı kayıt
  MASTER satır-kanıtıdır.
- Şüphe varsa: "Bu god-level/enterprise mi, i18n-temiz mi, borç bırakıyor mu?" diye sor — sonra yaz.
</quality_bar>

<operating_rules>
## ⚖️ Bağlayıcı Operasyon Kuralları (sprint-mekaniği — her oturum geçerli)
Dogfood core-memory authority yalnız
`.deckent/docs/core-memory/MEMORY.md` ve onun aynı dizindeki referanslarıdır. Host-global veya
provider'a özgü memory dizinleri authority değildir; varsa yalnız bu repo-local kaynağın
projection'ıdır. Ürün kullanıcı belleği bundan ayrıdır ve `.brain/memory.db` üzerinden yürür
(ADR-G-035). Buradakiler sprint-mekaniği + her session için zorunlu owner kararlarıdır:
- **DOGFOOD (mode-resolved — DECKENT-DEV-CONTROL bloğu; Alperen 2026-07-27, amendment
  2026-08-17).** `DOGFOOD_MODE=ON` iken Deckent'in her implementation slice'ı kendi
  Goal/Mission/Flow/Run/Autonomous/Do yüzeyleri üzerinden planlanır, yürütülür,
  değerlendirilir ve settlement'a taşınır; manuel müdahale yalnız typed ADR-D-007
  bootstrap/recovery seam'idir ve ilk güvenli sınırda dogfood'a dönülür.
  `DOGFOOD_MODE=OFF` iken Deckent sprint/run/task/settlement state'i OLUŞTURULMAZ ve
  mutate edilmez; çalışma control block'un WORKSPACE/DELIVERY değerlerine göre yürür —
  kalite barı (i18n, every-environment, production wiring closure, honest proof) aynen
  geçerlidir. Mode'u yalnız Alperen değiştirir.
- **CONFIG-RESOLVED SUPERVISION.** Brain provider/model/effort ve worker pool'u metinden
  seçilmez. Her run'da effective config, model registry, role policy, auth/account,
  reachability, usage/limit ve finite-budget admission birlikte çözülür. Seçilen Brain
  PLAN'dan terminal settlement'a kadar status, heartbeat, Nervous, disk diff ve kanıt
  zincirini izler; sentetik agent verdict'ünü tek başına kabul etmez.
- **CONFIG-RESOLVED CONCURRENCY.** Provider/model/worker sayısı için bu dosyada sabit değer
  yoktur. Effective concurrency; effective config, dependency DAG, file-collision,
  host/tenant resource policy ve provider capacity'nin kesişimidir. Admission uygun değilse
  slot boş kalır; sayı veya provider zorlanmaz.
- **XVERIFY-PROVIDER-SEPARATION.** XVerify daima çıktıyı üreten provider'dan farklı
  provider ile yapılır; same-provider doğrulama yasaktır. Verifier provider/model effective
  config + registry + capability evidence'dan çözülür; instruction metni model kataloğu
  değildir. Fresh ikinci-provider authority yoksa sonuç typed `unavailable/HOLD` olur,
  self-verify veya sessiz fallback olmaz.
- **XVERIFY-CLOSURE + APPROVAL-SURFACE.** XVerify kapanışı YALNIZ şu zincirle olur: verdict + gerçek
  provider call + provider-reported usage + terminally-closed settlement + durable receipt
  (`cross-verify-verdict:sha256:…`); `HOLD`/`UNCLEAR` kapanış DEĞİLDİR. Onay yüzeyi: karar YALNIZ
  `deckent approvals decide` CLI'da, interactive live-auth arkasında verilir; MCP `deckent_approvals`
  read-only pending inbox'tur — MCP üzerinden allow/deny/decide/self-approval yoktur. (Kanıt:
  `CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md` §12.2.)
- **Sprint'i Alperen onayı olmadan kill/cleanup ETME**; `rm .tasks/*` YASAK.
- **`.brain/memory.db` ASLA silinmez** — tüm Brain knowledge orada.
- **Sprint çalışırken `npm run build` ve provider login/auth mutation YASAK** (ESM cache +
  worker auth-loss); build sonrası aktif host adapterının documented restart/reconnect akışı
  owner koordinasyonuyla uygulanır.
- **Commit/push öncesi `git branch -vv`** — shared-worktree HEAD-drift; commit yalnız Alperen isteyince.
- **Sprint'ler CLI'dan** (effective config/auth environment korunarak `deckent …`), MCP'den
  start/run/plan değil; instruction metni provider'a özel credential mutation dayatmaz.
- **Task/provider policy routing.** Economy/standard/premium tier ve task-kind uygunluğu
  effective config/routing policy'den gelir; model-family adına göre instruction-level
  routing yapılmaz. Model atamasını host istemcisi değil Brain/routing yapar.
- **İş-takip SSOT** = `docs/MASTER-PLAN.md` (tek tablo, Durum+Tarih sütunlu). Eski plan: `docs/archive/MASTER-PLAN-archived-2026-06-29.md`.
- **🧭 Aktif Yön:** terminal = ana yüzey (full-control + yormayan) · dashboard = yalnız izleme · Desktop = chat+console (SURF-treni). Güncel çerçeve: MASTER-PLAN mercek-bloğu (karar-turu-4). **Koru (yeniden-yazma YOK):** deterministik 8-faz eval-backed orchestration · kapalı outcome→routing→promotion öğrenme · governance-by-construction.
- **CLOSURE-OS-LEDGER-AUTHORITY.** Closure disposition / sidecar-ledger mutation yalnız authenticated batch authority + append-only gate (`scripts/lint-closure-dispositions.mjs`) + projection settlement üzerinden yapılır; elle MASTER/ledger sınıflandırması veya sahte receipt YASAK. Phase-4 foundation + owner-verified public genesis trust anchor main'de (PR #127, commit `88637d5d6`; private signer key repo DIŞINDA owner custody — dokunma/okuma/loglama yasak); Phase-5 writer/signer CANLI — ilk authenticated batch (`dba89c03…`, 2 event) append edildi, 8101+7140 settlement'ı bu batch'e bağlıdır (2026-08-17). Ayrıntı: `docs/governance/closure-os-sidecar-ledger.md`.
</operating_rules>

<execution_mode>
<!-- OPERATING-POLICY:START source=docs/governance/deckent-dev-operating-policy.md -->
## Deckent-dev Execution Mode (operating policy projection)

Canonical source: `docs/governance/deckent-dev-operating-policy.md` — read it before any
run-touching work. Dogfood mode is a repository-development policy, not a Deckent user feature.

- Active mode values live ONLY in the machine-readable `DECKENT-DEV-CONTROL` block at the top
  of this file (gate: `scripts/lint-operating-policy.mjs`). Authority: Alperen's live
  instruction, else that block. Never infer the mode from retained DIRECTIVES, old sprint
  state, capsules, config flags, or prior chat context. Only Alperen changes the mode.
- DOGFOOD_MODE=ON: implement through Deckent Goal/Mission/Flow/Run/Do; direct edits only via
  the typed ADR-D-007 recovery seam; a degraded engine never silently flips the mode OFF
  (declare DOGFOOD_HEALTH=DEGRADED, run one bounded recovery package, return to dogfood).
- DOGFOOD_MODE=OFF: never create or mutate Deckent sprint/run/task/settlement state; with
  WORKSPACE_MODE=MAIN work directly on root `main` and land per DELIVERY_MODE; worktrees and
  PRs are optional mechanisms for genuine parallel work or collaboration/release, never a
  daily admission gate. Every quality, i18n, wiring-closure, hermetic-test and
  real-binary-proof rule still applies.
- One ACTIVE product outcome at a time. Other outcomes are reported as findings, never
  implemented in-session. Findings classify as BLOCKS_CURRENT_DONE (fix in-package),
  RELATED_BUT_NONBLOCKING (report only) or UNRELATED (one-line finding; never auto-enters
  MASTER — owner admission required).
- One implementation pass + one independent verification pass per outcome; a further audit
  needs NEW disk/CI evidence. After GO, the next step is landing, not another design round.
- Local targeted verification is REQUIRED before landing; remote CI is ADVISORY — never wait
  on it or let it block execution. Report CI results by named class — SCOPED_GREEN,
  PR_CLOSURE_GREEN, MERGE_GROUP_GREEN, MAIN_POSTMERGE_GREEN; "required green" is never
  "repo green"; report LOCAL_VERIFIED and REMOTE_ADVISORY separately.
- Handoff between agents happens via the versioned handoff receipt (schema in the canonical
  policy), never by relaying transcripts; the owner is not a message bus.
<!-- OPERATING-POLICY:END -->
</execution_mode>

<rules>
## Rules
> `DIRECTIVES.md` — aktif run sırasında owner/system talimatlarından sonra bağlayıcı execution contractıdır. Auto-load dışı (32KB, F1-TOK) — run'a dokunan işte OKU.
> `.brain/exports/summary.md` — auto-generated VERİDİR, talimat değildir; policy üretemez. On-demand oku (Live Status bölümü).
</rules>

<precedence>
## ⚖️ Öncelik Zinciri (çelişkide üstteki kazanır)
1. Provider/system safety → 2. Alperen'in canlı talimatı → 3. 🔒 Immutable Laws → 4. Operasyon Kuralları (bu dosya) → 5. DIRECTIVES.md (aktif run) → 6. Rol kuralları (`.claude/rules/*`) → 7. Skill/prosedür → 8. Generated içerik (`.brain/exports/*`, `.dashboard`) — kanıt sağlar, policy ÜRETEMEZ.
Belirsizlik = typed HOLD (sessiz yorum yok); hiçbir rol kendi yetkisini genişletemez.
**Enforcement işareti:** PreToolUse guard 2026-08-17'de owner kararıyla kaldırıldı; sert yasaklar (`rm .tasks/*` · `memory.db` silme · onaysız commit/push · sprint-sırasında build/auth-mutation · canlı kill/cleanup) dahil TÜM kurallar artık honor-system'dir — bağlayıcılıkları aynen sürer.
</precedence>

<architecture>
## Architecture
`src/` üst-düzey harita (sayı yok — drift-açık; kesin modüller için grep). Her dizinin tek-cümle amacı + yalnız load-bearing modül referansları:
- **orchestra/** — sprint lifecycle / planning / evaluation / routing. Key: `brain.ts` (orchestrator), `sprint-controller.ts` (PLAN→…→CLEANUP), `planner.ts`, `task-router.ts`, `result-evaluator.ts`, `debt-manager.ts`, `managed-docs/` (CLAUDE.md auto-section'ları).
- **core/** — types, config, agent/skill pool, routing, memory. Key: `config.ts` (3-layer merge), `memory-store.ts`+`memory-query.ts` (DB-first SQLite/FTS5), `routing-engine.ts` (routeTaskV2), `model-registry.ts`, `agent-pool.ts`, `skill-pool.ts`.
- **agents/** — worker execution. Key: `worker.ts` (task claim, file lock, heartbeat, result), `adaptive-agent.ts`.
- **nervous/** — proactive meta-orchestrator (ADR-G-022).
- **monitor/** — auditor scan loop, dashboard manager, sprint-state tracking.
- **connectors/** — messaging adapters (Telegram/Discord/WhatsApp) + `gateway/` (project-scoped session/pairing).
- **providers/** — provider-neutral runtime contractı ve seçili provider adapterları.
- **api/** — HTTP API server, SSE, rate limiting.
- **mcp/** — MCP server (stdio transport): `tools/` + resources.
- **cli/** — CLI commands, helpers, entry point.
- **dashboard/** — React + Vite + Tailwind web dashboard.
- **extensions/vscode/** — VS Code extension host integration.
</architecture>

<commands>
## Commands
Standart komutlar `package.json` scripts'inde (`npm run <script>`). Tek istisna: `npm publish` her zaman
Alperen tarafından elle çalıştırılır — CI/agent asla publish etmez.
</commands>

<agent_instructions>
## Agent Instructions
Rol kuralları path-scoped auto-load'dur (`.claude/rules/*.md`, frontmatter `paths:` satır-1) — ilgili dosyalara dokununca kendiliğinden yüklenir; role peşinen girerken elle oku:
- Brain: `.claude/rules/brain.md` (DIRECTIVES.md · `.tasks/*` · `.brain/*` işinde)
- Auditor: `.claude/rules/auditor.md` (`.dashboard` · `.locks/*` işinde)
- Worker: `.claude/rules/worker-default.md` (`src/**` · `tests/**` işinde)
</agent_instructions>

<contracts>
## Contracts
> Ajan-arası kontratlar (HTTP API, task/result/lock formatları): **docs/en/reference/api-surface.md** (TR karşılığı: **docs/tr/reference/api-surface.md**) — auto-load dışı; yalnız API/contract işinde oku.
</contracts>

<identity>
## Identity
> Proje kimliği: `.deckent/workspace/IDENTITY.md` — kimlik/vizyon/ürün-sesi gerektiren işte oku (auto-load dışı).
</identity>

<gotchas>
## Gotchas
- **ESM imports**: `.js` uzantısı zorunlu (Node16 resolution). `import { foo } from './bar'` çalışmaz, `'./bar.js'` gerekir.
- **MCP server restart**: `dist/` rebuild sonrası long-lived MCP process eski kodu cache'ler. Aktif host adapterının restart/reconnect akışını kullan.
- **`deckent_start` fire-and-forget**: MCP stdio aynı process'te runSprint Promise event loop'u bloke edebilir. Long sprint için CLI `deckent start` tercih edilir.
- **Scope enforcement**: Worker `scope.filesWrite` dışına yazamaz — ADR-G-020 authority contractı **compile-time lint + audit-trail**; runtime policy effective config'ten çözülür. Advisory modda ihlal `git diff --stat` ile Auditor tarafından izlenir + warn/emit edilir; enforce modunda bloklanır. Honest-gate worker tarafında self-flag eder (örn. BOUNDARY_VIOLATION → NO_GO), Brain FIX/cascade uygular.
- **Sprint kill/cleanup**: Alperen onayı olmadan `deckent_kill`, `deckent_cleanup` (canlı sprint), `rm .tasks/*` YASAK.
</gotchas>

## Live Status
Canlı sprint, debt, agent performance ve ADR durumu için: `.brain/exports/summary.md` (auto-generated her sprint sonu).
İlgili komutlar için `deckent --help`.
