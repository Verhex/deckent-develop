# Paperclip (paperclipai/paperclip) vs Deckent — Kod-Düzeyi Karşılaştırma

> Tarih: 2026-07-01 · Yöntem: her iki repo `src/` + Drizzle şema + adapter/katalog dizinleri **birincil kaynaktan** okundu (README pazarlama metnine güvenilmedi). Paperclip 3 alt-sistemi + Deckent muadilleri kod düzeyinde (file:line) doğrulandı. README'deki iki iddia ("atomic execution", 7-katmanlı budget scope) kodda **yanlışlandı** ve aşağıda düzeltildi.

## 0. Tek cümle
**Paperclip = kalıcı, çok-şirketli bir "AI şirketi" KONTROL DÜZLEMİ** (Postgres, org-chart, budget, governance, heartbeat, secrets, plugin, portability).
**Deckent = kendini-öğrenen bir SPRINT ORKESTRATÖRÜ + terminal-first agentic runtime** (SQLite+FTS5, brain-worker, ADR-governance, outcome→routing→promotion, fine-tune hattı).
Aynı pazarın (multi-agent orchestration) iki farklı ucu; %30 örtüşme, %70 farklı tasarım tercihi.

## 1. Kimlik & Konumlandırma

| Boyut | Paperclip | Deckent |
|---|---|---|
| Metafor | "Şirket" — org-chart, çalışan-agent'lar, patron/rapor hattı | "Sprint takımı" — Brain (orchestrator) + Worker'lar |
| Birincil yüzey | Web UI (task-manager benzeri) + mobile | Terminal (native agentic REPL) — dashboard yalnız izleme (2026-06-29 pivot) |
| Çalışma modeli | Heartbeat: agent zamanlı uyanır, iş çeker, çalışır (7/24) | Sprint lifecycle: PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP |
| İş birimi | Issue/ticket (kalıcı, goal-ancestry'li) | Task JSON (`.tasks/task-XXX.json`, sprint-scoped, ephemeral) |
| BYO-agent tezi | "Heartbeat alabiliyorsa işe alınır" — runtime-agnostik | Provider-adapter (Claude/Codex/Gemini CLI + API) |
| Öğrenme | YOK (README de iddia etmiyor) | Kapalı outcome→routing→promotion döngüsü (default-on) |
| Lisans | MIT | (beta) |

## 2. Teknoloji Stack

| Katman | Paperclip | Deckent |
|---|---|---|
| Dil | TypeScript (ESM, Node ≥20) | TypeScript (ESM, Node16 resolution) |
| Repo | pnpm monorepo (server/ui/cli + 8 packages) | tek-paket (`src/` 17 alt-sistem) |
| Persistence | **PostgreSQL** (dev: embedded PGlite) + **Drizzle ORM** | **SQLite** (better-sqlite3) + **FTS5** + WAL |
| Şema | 94 tablo, **126 migration** (Drizzle) | tek `.brain/memory.db`, type-bazlı satırlar |
| API | Express REST + SSE realtime | HTTP API + SSE + MCP (stdio) |
| UI | React 19 + Vite + Storybook | React + Vite + Tailwind (dashboard) |
| Test | Vitest + Playwright e2e + promptfoo eval | Vitest (hermetik, ≤16GB cap) |
| Dependency | Ağır (pnpm-lock 567KB) | **13 prod dep** (ADR-D-005 merit-policy, lean) |
| Deploy | Self-host / Postgres / Vercel | npm CLI (`deckent`) + MCP server |

## 3. Boyut & Olgunluk (kaba)

| Metrik | Paperclip | Deckent | Not |
|---|---|---|---|
| Kaynak LOC (test hariç) | ~470K | ~669K | Doğrudan kıyaslanamaz (farklı test/generated dahil-hariç); ikisi de olgun, ~0.5–0.7M |
| TS/TSX dosya | ~2.3K | ~3.3K | |
| DB objesi | 94 tablo / 126 migration | tek db, ~10 type | Paperclip domain-model çok daha zengin |
| Governance artefaktı | approvals + execution-policies (runtime) | 41 ADR (constitution-tarzı) | Farklı governance felsefesi |
| Provider/adapter | 12 agent-adapter | 6+ provider + 3 messaging connector | |

## 4. ANA KARŞILAŞTIRMA — Boyut-boyut derinlik skoru (1–10)

> Skor = o boyuttaki **kod-düzeyi olgunluk/derinlik** (kim "kazandı" değil). ⚑ = kategori-tanımlayıcı tasarım tercihi (eksiklik değil, yön farkı). Tek toplam skor **bilinçli verilmedi** — sistemler kısmen farklı kategoriler.

| # | Boyut | Paperclip | Deckent | Kısa gerekçe |
|---|---|:---:|:---:|---|
| 1 | Çok-kiracılık / izolasyon | **9** | 3 | PC: 94 tablonun 82'si `companyId`, tek deploy N şirket, tam izolasyon. DK: row-level `tenant_id`, opt-in, default NULL-tenant sızdırır; tek per-proje db |
| 2 | Kalıcılık & ölçek | **8** | 5 | PC: Postgres, multi-tenant ölçek. DK: SQLite tek-dosya (terminal-first tercih ⚑) |
| 3 | Governance & approvals | **9** | 6 | PC: 2-katman approval + execution-policy stage'leri (review/approval), race-safe state machine, override-approval. DK: 41 ADR + soft scope-RBAC (advisory) + hard flow-RBAC (`E_RBAC_DENIED`) |
| 4 | Maliyet & bütçe kontrolü | **7** | 6 | PC: scoped budget-policy (company/agent/project) + hard-stop pause+cancel + override — ama **reactive** (harcama-sonrası, TOCTOU; README'nin "atomic" iddiası kodda YOK). DK: pre-spawn cost-gate + limit-ledger, ama hiyerarşik scope yok |
| 5 | Heartbeat / execution / orphan-recovery | **8** | 6 | PC: DB-backed CAS queue + coalescing + 2 watchdog (process-reaper + silent-run→evaluation-issue) + liveness-continuation. DK: worker-liveness + respawn + orphan-cleaner, ama P0-C "orphan-on-finalize-force" nüks sınıfı |
| 6 | Zamanlama / routines | **8** | 6 | PC: cron/webhook/api trigger, HMAC-webhook, concurrency (coalesce/skip/enqueue) + catch-up cap, her run→tracked issue. DK: nervous + TOPP continuous-dispatch + autonomous |
| 7 | Secrets yönetimi | **9** | 2 | PC: AES-256-GCM vault, instance master-key, binding-scoped injection, per-run access-audit, pluggable (AWS SM). DK: `.deck` **plaintext** .env, vault YOK |
| 8 | Config revisioning / rollback | **8** | 3 | PC: per-agent, in-txn snapshot, forward-rolling rollback (history immutable), secret-marker koruması. DK: ADR-amendment + rollback.ts (sprint-scoped), agent-config revisioning yok |
| 9 | Company portability (export/import) | **9** | 1 | PC: bundle export/import, secret-scrubbing (değer asla export, import'ta taze secret), collision (rename/skip/replace). DK: yok |
| 10 | Adapter/provider genişliği (BYO-agent) | **8** | 6 | PC: 12 adapter (claude/codex/cursor/gemini/grok/opencode/pi/openclaw/hermes) her biri cli+server+ui katkısı. DK: 6 provider (claude/codex/gemini/bedrock/ollama/openai-compat) |
| 11 | Plugin / genişletilebilirlik | **8** | 5 | PC: out-of-process plugin (capability-gated host-services, tool/UI katkısı, job-scheduling). DK: agent-pool + skill-pool + MCP (in-process) |
| 12 | UI / dashboard | **9** | 5⚑ | PC: 229K LOC React task-manager + mobile. DK: dashboard yalnız-izleme (pivot ⚑ — kasıtlı) |
| 13 | **Self-learning / routing zekâsı** | 1 | **8** | PC: YOK (org-chart delegasyonu, öğrenmeyen). DK: outcome→stats→`routeTaskV2` bonus (±3 cap, domain-match 8'e ek), promote/demote pipeline, decay — **default-on kapalı döngü** |
| 14 | **Deterministik sprint + eval** | 3 | **9** | PC: promptfoo prompt-eval + playwright (runtime değil). DK: 8-faz brain-worker, result-evaluator, honest-gate self-assessment (DONE/GO_WITH_TECH_DEBT/NO_GO) |
| 15 | **Memory / knowledge** | 2 | **8** | PC: ROADMAP'te ⚪ GELECEK ("durable memory" henüz yok). DK: memory-store FTS5 + decay + pattern-promotion + `recall` |
| 16 | **Enforced outcomes / honest-gate** | 2 | **8** | PC: ROADMAP'te ⚪ GELECEK. DK: go/no-go criteria + disk-verify ground-truth + auditor |
| 17 | **Terminal / CLI UX** | 4 | **8**⚑ | PC: CLI onboarding var ama yüzey web. DK: native agentic REPL (cc-grade UX hedefi, pivot ⚑) |
| 18 | Messaging / mobile erişim | 6 | 7 | PC: web-mobile-ready. DK: Telegram/Discord/WhatsApp + rich approval-bot + gateway + voice |
| 19 | **Fine-tune / own-model hattı** | 1 | **7** | PC: yok. DK: training/cc-trace-extractor + JSONL pipeline + vLLM PROVIDER vizyonu |
| 20 | Immutable audit log | **8** | 7 | PC: append-only `activity_log` (immutable ama hash-chain YOK). DK: audit-writer + audit-export + compliance-report |

**Profil özeti (toplam değil):**
- Paperclip domine ettiği alanlar: **multi-tenancy, secrets, portability, config-revisioning, governance-workflow, heartbeat-recovery, plugin, UI** — yani *bir organizasyonu üretimde işletme* katmanı.
- Deckent domine ettiği alanlar: **self-learning routing, deterministik eval, memory/knowledge, enforced-outcomes, fine-tune, terminal-UX** — yani *orkestrasyon zekâsı ve kendini-iyileştirme* katmanı.

## 5. DECKENT NE KAZANABİLİR — iki kova

### 5a. HİZALI kazanımlar (benimse — yön+yasalarla uyumlu)

| Öncelik | Kazanım | Paperclip'te kod-referansı | Deckent'teki boşluk | Neden hizalı |
|---|---|---|---|---|
| **P0** | First-class **secrets vault** | `local-encrypted-provider.ts` (AES-256-GCM, 0600 key), `company_secret_bindings` binding-scoped injection, `secret_access_events` audit | `.deck` plaintext .env; vault yok | Yasa #1 (enterprise) + Yasa #2 (multi-tenant); prompt'a secret sızmaması kritik |
| **P0** | **Hiyerarşik budget policy** | `budgets.ts:648 evaluateCostEvent`, `pauseAndCancelScopeForBudget`, `getInvocationBlock` pre-flight gate | cost-gate var ama company→agent→project scope yok | Milyon-ölçek maliyet güvenliği; deckent'in cost-gate'ini scope hiyerarşisiyle genişlet |
| **P0** | **Gerçek multi-company izolasyon modeli** | 82/94 tablo `companyId`, `company-portability.ts`, membership+grant | tenant_id opt-in, default sızdırır | Yasa #1 (solo→dünyanın en büyükleri) + Yasa #2 |
| **P1** | **Heartbeat orphan-recovery deseni** | `reapOrphanedRuns` (process-reaper, tek-retry), `scanSilentActiveRuns`→evaluation-issue (kill yerine escalate) | P0-C orphan-on-finalize nüks sınıfı | Açık orphan-start/finalize-force bug'ına doğrudan reçete; "stuck-but-alive"ı öldürmek yerine değerlendirme-issue'suna eskale et |
| **P1** | **Config revisioning + rollback** | `agents.ts:447` in-txn snapshot + `diffConfigSnapshot`, `:735` forward-rolling rollback | ADR-amendment var ama runtime config revision/rollback yok | Governance-by-construction'ı runtime rollback ile tamamlar |
| **P1** | **Company/company-template portability** | `exportBundle`/`importBundle` + secret-scrubbing + collision (rename/skip/replace) | yok | "Reusable company" = enterprise onboarding; deckent'in agent/skill/config'ini taşınabilir yap |
| **P2** | **Execution-policy stage'leri** (review/approval gate) | `issue-execution-policy.ts` ordered stages, comment-zorunlu approve | ApprovalBroker 🔴 yok (memory'de P0) | Mevcut ApprovalBroker P0'ına doğrudan blueprint |
| **P2** | **Out-of-process plugin izolasyonu** | capability-gated host-services, out-of-process worker | agent/skill in-process | Güvenlik + 3rd-party genişletme (Yasa #2) |
| **P2** | **Routine webhook güvenliği** | HMAC-SHA256 + replay-window + `timingSafeEqual` | TOPP var ama webhook-trigger güvenlik deseni zayıf | Event-trigger'ları sertleştir |

### 5b. SAPMALAR (not al, benimseme — deckent yönüne aykırı)

| Paperclip özelliği | Neden benimseme |
|---|---|
| 229K-LOC web task-manager UI + mobile | Deckent pivotu: terminal = ana yüzey, dashboard = yalnız izleme. Ağır UI kasıtlı sapma |
| "Şirket/org-chart/çalışan" kalıcı metaforu | Deckent brain-worker + sprint metaforunu koruyor; org-chart farklı ürün DNA'sı |
| Postgres/vector-DB'ye geçiş | **Reddedilmiş karar (ADR-G-035):** yön = better-sqlite evrim + sqlite-vec opt-in (never-calls-home moat). Ölçek `tenant_id` row-scoping ile; engine göçü GÜNDEMDE DEĞİL |
| Reactive/pause-after-spend budget | Deckent pre-spawn gate + honest-gate zaten daha proaktif; PC'nin reactive modelini geriye alma |

## 6. PAPERCLIP DECKENT'TEN NE ÖĞRENEBİLİR (çift-yön)
Paperclip ROADMAP'inde ⚪ (gelecek) işaretli maddeler = deckent'in bugün ✅ sahip oldukları:
- **Memory/Knowledge** (PC ⚪) ← deckent memory-store + FTS5 + decay
- **Enforced Outcomes** (PC ⚪) ← deckent go/no-go + honest-gate + disk-verify
- **Deep Planning** (PC ⚪) ← deckent planner + sprint plan + ADR
- **Maximizer/higher-autonomy** (PC ⚪) ← deckent autonomous + nervous + TOPP
- **Self-Organization** (PC ⚪) ← deckent autonomous-first grand-vision
- **Self-learning routing** (PC'de hiç yok) ← deckent'in en büyük teknik moat'ı

## 6b. ÜRÜN-MERCEĞİ ÖNCELİK SIRASI (solo→enterprise, sprint-motoru değil)

> Mercek: her kazanım "hangi segmenti açar (solo/team/enterprise)" + "sonradan-retrofit maliyeti" + "deckent'in bugünkü durumu" ile sıralandı. Yasa #1 (çift-bakış + solo→dünyanın en büyükleri).

| # | Kazanım | Kimi açar | Deckent bugün | Efor/bağımlılık | Blueprint |
|---|---|---|---|---|---|
| 1 | **Secrets vault** (AES-256-GCM, binding-scoped, provider-backed, access-audit) | Solo→Enterprise (hepsi) | `.deck` plaintext | Orta, bağımsız | `local-encrypted-provider.ts`, `company_secret_bindings`, `secret_access_events` |
| 2 | **Scoped budget + hard-stop** (pause/cancel/override) | Solo (runaway-cost korkusu) + Enterprise (per-team cap) | cost-gate var, scope yok | Orta, cost-gate üstüne | `budgets.ts:648`, `pauseAndCancelScopeForBudget`, `getInvocationBlock` |
| 3 | **Izolasyon DİSİPLİNİ** (mevcut sqlite tenant_id substratı üstünde) | Team+Enterprise (kapı) | tenant_id opt-in, **default sızdırır**; strict-mode wire değil | **Foundation — engine DEĞİŞMEZ (ADR-G-035)** | 82/94 tablo `companyId` **disiplini** + membership/grant (engine'i değil, kapsama-titizliğini al) |
| 4 | **Approvals / execution-policy stage** → ApprovalBroker | Solo ("chime in") + Team + Enterprise (sign-off) | ApprovalBroker 🔴 yok | Orta; #3'ten bağımsız başlanabilir | `issue-execution-policy.ts` ordered stages |
| 5 | **Multi-user / org-RBAC / SSO-OIDC** | Team+Enterprise | social-identity RBAC Faz 1a+1b merged (kısmi) | Mevcut RBAC üstüne; #3'e dayanır | `company_memberships`, principal grants |
| 6 | **Config revisioning + rollback** | Enterprise (change-governance) | runtime config revision yok | Orta | `agents.ts:447` in-txn snapshot, `:735` rollback |
| 7 | **Company/template portability** (export/import + secret-scrub) | Team+Enterprise (onboarding, fleet) | yok | Orta; #3'e dayanır | `exportBundle`/`importBundle` |
| 8 | **Heartbeat orphan-recovery hardening** (watchdog→evaluation-issue) | Solo (7/24) + Enterprise (SLA) | partial (worker-liveness/respawn), P0-C nüks | Orta, mevcut üstüne | `reapOrphanedRuns`, `scanSilentActiveRuns` |
| 9 | **Out-of-process plugin izolasyonu** | Enterprise (ekosistem+güvenlik) | in-process pool | Büyük | capability-gated plugin worker |
| 10 | **Webhook/routine güvenliği** (HMAC+replay) | Team+Enterprise (entegrasyon) | zayıf | Küçük | `firePublicTrigger` HMAC-SHA256 |

**Faz önerisi:** Faz-1 (evrensel değer, hızlı): #1 secrets + #2 budget + #4 ApprovalBroker. Faz-2 (team/enterprise kapısı, paralel foundation): #3 multi-tenant + #5 RBAC/SSO. Faz-3 (enterprise-depth): #6 config-rollback + #7 portability + #8 recovery + #9 plugin + #10 webhook.

**Çatal DEĞİL — karar verili (ADR-G-035):** persistence yönü **better-sqlite evrim** (SQLite SSOT + FTS5 default + `sqlite-vec` opt-in, never-calls-home); **Postgres/vector-DB göçü reddedildi**. Ölçek yolu engine değiştirmek değil, `tenant_id` row-scoping + `withTenant` context (ADR-G-031/068). Dolayısıyla #3'te paperclip'ten alınan şey **DB engine değil, izolasyon disiplini**: her entity'yi scope'la + NULL-tenant leak'ini kapat + membership/grant modeli. Bkz. memory `project_persistence_direction_sqlite_evolution`.

## 7. Sonuç
- **Örtüşme (~%30):** multi-agent orchestration, MCP server, cost tracking, heartbeat/liveness, agent-adapter, skill-catalog, governance, dashboard.
- **Farklılık (~%70):** Paperclip *işletme/kontrol-düzlemi* (kalıcı org, multi-company, secrets, portability); Deckent *orkestrasyon-zekâsı* (self-learning, eval, memory, terminal-first, fine-tune).
- **En yüksek ROI kazanımlar (kod-hazır blueprint):** (1) secrets-vault (AES-256-GCM binding-scoped), (2) hiyerarşik budget-policy, (3) heartbeat orphan-recovery watchdog deseni, (4) execution-policy approval-stage → ApprovalBroker, (5) config-revisioning+rollback.
- **Deckent'in koruması gereken moat:** kapalı öğrenme döngüsü, deterministik eval, memory, terminal-UX — bunlar paperclip'te YOK ve paperclip'in gelecek-roadmap'i.
