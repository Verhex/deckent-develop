# Hermes Agent vs Deckent — Bağımsız Kod-Tabanlı Karşılaştırma (Claude)

Tarih: 2026-06-29
Analist: Claude (Opus 4.8, 1M context) — Anthropic CLI
Yöntem: 7 paralel kod-keşif ajanı (4 Hermes + 3 Deckent), her bulgu `file:line` ile gerekçelendirildi.

> Bu doküman Codex'in `hermes-vs-deckent-analysis.md` analizinin **kopyası veya özeti değildir**. Bağımsız
> bir kod incelemesidir; Codex'in iddialarını ayrı ayrı **kod üzerinden doğruladım/çürüttüm** (§10). Codex
> dosyası yalnızca "ikinci görüş" olarak okundu; tek otorite kaynağım koddur.

## Kapsam ve Kaynak Sınırı

- **Hermes kaynağı:** `/home/alperen/.hermes/hermes-agent` (Python 3.11, v0.17.0, MIT, Nous Research).
- **Deckent kaynağı:** `/home/alperen/deckent-dev/src` (TypeScript, Node16 ESM).
- **Resmi otorite = kod.** README/AGENTS.md yalnızca ürün-bağlamı ve "iddia ↔ kod" doğrulaması için kullanıldı.
- **Okunmayanlar:** `.env`, `state.db` (içerik), credential cache, secret dosyaları — kasıtlı dışarıda bırakıldı.
- **Honest-tag disiplini:** her bulgu `REAL/WIRED` · `SOFT/ADVISORY` · `CONFIG-ONLY/NO-OP` · `STUB/UNWIRED` olarak işaretlendi. Bu ayrım, feature-sayımından daha önemlidir (`feedback_wiring_pct_vs_user_working`).

---

## 1. Yönetici Özeti — Tez

Hermes ve Deckent yüzeyde aynı pazarda görünse de **iki farklı problem sınıfına** optimize edilmiş, birbirini
dışlamayan tamamlayıcı sistemlerdir. Kod bunu net gösteriyor:

- **Hermes = "her yerde yaşayan, kendini iyileştiren tek-ajan kişisel/operasyonel asistan + araştırma veri-motoru."**
  Tek bir conversational agent loop (`agent/conversation_loop.py`), ~28 messaging platformu, 6 terminal backend,
  173 skill, BM25-tabanlı progressive tool disclosure, her ~10 turn'de kendi `USER.md` + `SKILL.md`'sini yeniden
  yazan kapalı öğrenme döngüsü ve ShareGPT trajectory üreten **gerçek (shipped) bir fine-tune veri pipeline'ı**.
  Gücü **yatay genişlik + benimsenme ergonomisi + her-yerde-erişim + araştırma yakıtı**.

- **Deckent = "deterministik çok-ajan iş-orkestrasyon + enterprise kontrol katmanı."**
  8-fazlı sprint lifecycle, Kahn topolojik dependency-wave'leri, atomic dosya-kilidi, heartbeat + 5-katman
  liveness, 9-adımlı deterministik evaluation (disk-vs-claim dürüstlüğü), FIX-reroute, ve **inşa-yoluyla-yönetişim
  (governance-by-construction)** ilkesiyle kurulmuş read-only capability/ERP/process zarfı. Gücü **dikey derinlik +
  deterministik değerlendirme + enterprise yönetişim çekirdeği + test disiplini (2x test:kaynak)**.

**Hüküm:** Deckent'in stratejik hamlesi Hermes'i kopyalamak (daha çok platform/skill/tool eklemek) **değil**.
Doğru sentez iki yönlü: (a) Hermes'in **benimsenme-ergonomisi + progressive disclosure + run-anywhere** derslerini
**orchestration çekirdeğine hizmet ettiği yerde** almak; (b) Deckent'in **gerçek moat'ını** (deterministik
eval-backed orchestration + governance-by-construction + kapalı routing-öğrenme döngüsü) sertleştirmek. En kritik
tek hamle daha çok ajan değil; **(i) ana terminale canlı approval/control-plane'i bağlamak ve (ii) zaten yazılmış
ama bağlanmamış training-trace pipeline'ını canlandırmak** — çünkü ikincisi Deckent'in kendi LLM vizyonunun yakıtı.

---

## 2. Nicel Ölçek (objektif, vendored hariç)

| Metrik | Hermes (Python) | Deckent (TypeScript) | Not |
|---|---|---|---|
| Kaynak kod | **~595K LOC** / 831 dosya | **~202K LOC** / 857 dosya | Hermes ~3x kaynak |
| Test kodu | ~654K LOC / 1822 dosya | ~408K LOC / 1798 dosya | İkisi de test-yoğun |
| Test : kaynak oranı | ~1.1x | **~2.0x** | Deckent test-disiplini daha sıkı |
| Ek UI katmanı | ~116K LOC (`ui-tui` Ink + `web`) | `src/dashboard` (React/Vite) | İkisi de Ink TUI'ye sahip |
| Tool yüzeyi | **88 tool modülü** (`tools/*.py`) | 37 MCP tool (20 RO / 17 W) | farklı paradigma |
| Skill | **173 SKILL.md** (72 bundled + 101 optional, 37 kategori) | 22 skill | Hermes life/work; Deckent dev |
| Plugin manifest | **87 `plugin.yaml`** (18 üst-dizin) | yok (built-in modül) | Hermes plugin-mimarisi |
| Sabit agent rosteri | yok (tek agent + subagent) | **16 aktif agent** | farklı delegation modeli |
| Provider | 32 model-provider plugin | 12 provider dosyası / 6 tipli adapter | Hermes plugin, Deckent tipli |
| Messaging platformu | **~28** (20 plugin + 8 built-in) | 3 (telegram live, discord, whatsapp-stub) | Hermes 9x genişlik |
| Terminal backend | **6** (local/docker/ssh/singularity/modal/daytona) | local subprocess + `providers/sandbox.ts` | Hermes run-anywhere |
| Slash/komut | 81 `CommandDef` (5 kategori) + 41 CLI subcommand | 37 slash (kategorisiz) | Hermes IA daha olgun |
| ERP connector | yok | **4 driver** (ifs tam + odoo/sap/dynamics ref) | Deckent enterprise |
| Yönetişim | consumer/assistant güvenliği | OIDC/RBAC/audit/capability/process | Deckent control-plane |

**Çıkarım:** Hermes yatay-genişlik devi (~2.2x toplam LOC, 9x platform, 8x skill); Deckent dikey-derinlik +
test-disiplini sistemi. Deckent'in 3 ayda 340+ sprint dogfood ile bu seviyeye gelmesi (202K kaynak + 408K test)
hız verisidir — ama hız "ürün-şekli" yerine "sistem-genişliği" üretme riskini de taşır (§9).

---

## 3. Çekirdek Mimari Model Farkı

```text
HERMES                                   DECKENT
──────                                   ───────
user msg ──> AIAgent.run_conversation    deckent start ──> runSprint()
              (tek conversational loop)                     (8-faz lifecycle)
                                            PLAN ─> SPAWN ─> EXECUTE ─> EVALUATE
   while iter<max & budget>0:                 │       │         │          │
     API call (stream)                        │   N worker   dependency  9-adım
     tool_use? ──> _execute_tool_calls        │   spawn      wave (Kahn)  deterministik
        (concurrent ≤8 / sequential)          │   (file-lock,            eval (GO/
     no tool? ──> final response              │    heartbeat)            NO_GO/DEBT)
                                                                   │
   delegate_task ──> nested AIAgent              FIX ─> RETRO ─> DECAY ─> CLEANUP
        (flat, depth=1, bg≤3,                    (reroute)  (learnings) (decay)  (lock release)
         completion-queue ─> yeni idle turn)
```

- **Hermes** = *senkron olmayan, conversational, insan-merkezli tek ajan.* Delegation **flat** (`delegate_tool.py:140`
  `MAX_DEPTH=1`), top-level model'den gelen delege **background** çalışır ve **tamamlanınca yeni bir idle turn olarak**
  konuşmaya geri döner (asla turn-ortasına enjekte edilmez, `tools/async_delegation.py:9-20`). Persistent kanal
  (gateway) yoksa **sessizce senkrona düşer** (`delegate_tool.py:2565`). Determinizm hedefi yok; insan-akışı hedefi var.

- **Deckent** = *deterministik, repo-güvenli, evaluation-gated çok-ajan runtime.* Faz geçişleri çift-kayıtlı
  (`emitPhaseChange` nervous event + `writePhaseCheckpoint` disk, `sprint-controller.ts:1132-1568`); dependency
  wave'ler **Kahn topolojik sort + cycle detection** (`dependency-scheduler.ts:123,179-200`); yazma kilidi **atomic
  `O_EXCL`** (`core/file-lock.ts:100-107`); worker self-assessment **ipucu, karar Brain'in** (`result-evaluator.ts:162-163`)
  ve disk-vs-claim dürüstlüğü (`linesAdded=0 && !testsPassed` → DONE'ı NO_GO'ya düşürür, `worker.ts:395-409`).

Bu fark her şeyi belirler: Hermes "kullanıcıyla sohbet ederek iş gördürür", Deckent "yapılandırılmış işi
deterministik koşar ve değerlendirir". İkisi rakip değil, **farklı katman**.

---

## 4. Boyut-Boyut Kod-Temelli Karşılaştırma

| # | Boyut | Hermes kod-gerçeği | Deckent kod-gerçeği | Kazanan | Hüküm |
|---|---|---|---|---|---|
| 1 | Çalışma modeli | Tek conversational loop, OpenAI-tarzı tool döngüsü (`conversation_loop.py:612,4331`) | 8-faz deterministik sprint (`sprint-controller.ts:925-1568`) | farklı | Deckent run-orchestration'da derin; Hermes chat'te |
| 2 | Delegation/parallelism | Flat bg subagent (depth=1, ≤3), completion-queue (`delegate_tool.py:140`, `async_delegation.py`) | Dependency-wave worker, file-lock, eval-gated (`dependency-scheduler.ts`, `worker.ts`) | **Deckent** | Deckent repo-safe + deterministik; Hermes'ten bg-result UX alınır |
| 3 | Tool sistemi & progressive disclosure | 88 tool, BM25 `tool_search/describe/call` bridge, %10 threshold, ~60 core hariç defer (`tool_search.py:234-258`) | 37 MCP tool eager exposure, **progressive disclosure YOK** (grep=0), yalnız writer-lease (`mcp/tools/index.ts`, `writer-lease-gate.ts`) | **Hermes** | Deckent'in en net açığı (§7.1) |
| 4 | Plugin/extensibility | 87 manifest, 24 lifecycle hook, 5 plugin türü (`plugins.py:128-195`) | Plugin sistemi yok; built-in modül | **Hermes** | Deckent connector/tool ekosistemi büyürse hook-mimarisi gerekecek |
| 5 | Provider/model abstraction | 32 model-provider plugin, user-switchable (`hermes model`) | 6 tipli adapter + config-driven registry + live capability detection (`provider.ts:968-1169,575`) | berabere | Hermes breadth+UX; Deckent worker-isolation+routing |
| 6 | Run-anywhere / backends | 6 backend, FS-snapshot kalıcılık (`environments/base.py:290`, modal/daytona) | local subprocess + sandbox provider; run-anywhere yok | **Hermes** | Deckent için açık; backend soyutlaması alınabilir |
| 7 | Memory & learning | User-persona + skill markdown, background-review fork her ~10 turn (`background_review.py:159-275`); FTS5 session | DB-first SQLite/FTS5 + **kapalı outcome→routing→promotion döngüsü** (`outcome-tracker.ts`, `rule-evolver.ts`) | farklı | İki AYRI öğrenme döngüsü; ikisi de gerçek (§5) |
| 8 | Cron/scheduled automation | Tam cron tool (7 aksiyon, per-job model/workdir/skill, context_from chaining, platform delivery) (`cronjob_tools.py`, `cron/scheduler.py`) | Autonomous/process/mission tick-loop REAL ama "scheduled run" olarak yüzeye çıkmıyor (`runtime-loop.ts:501-540`) | **Hermes (UX)** | Deckent primitive daha derin, solo-UX yüzeyi eksik |
| 9 | Terminal/TUI UX | prompt_toolkit REPL (`cli.py`, modal widget'lar) **+** ayrı Ink TUI (`ui-tui`) → `tui_gateway` JSON-RPC | Ink REPL default + legacy readline + native-agent flag (`entry.ts`, `repl/`) | Hermes (olgunluk) | İkisinde de "iki-TUI drift"i var; Deckent foundation sağlam |
| 10 | Onboarding/setup/doctor | Modüler setup wizard + `--portal` OAuth + 19-bölüm doctor `--fix` (`setup.py`, `doctor.py:485`) | Partial; ilk-koşu rehberi zayıf | **Hermes** | Solo benimsenme için P0 |
| 11 | Windows native | ConPTY (`pywinpty`), schtasks+`.vbs` fallback, PowerShell installer, Tauri GUI installer, Electron desktop | subprocess + cmd.exe/PATHEXT fix'leri; ürünleşme yok | **Hermes** | Kurumsal Windows kazanımı için açık |
| 12 | Messaging/gateway | ~28 platform, default-deny authz, pairing, cross-host relay (HMAC), session continuity (`authz_mixin.py:198-207`, `pairing.py`) | 3 connector (telegram live), fail-closed allowlist var, pairing-onay UX eksik (`gateway-daemon.ts:87-90`) | **Hermes** | Deckent "Integration Center" + onay-butonu wire'ı bekliyor |
| 13 | MCP (client+server) | Mature: stdio/http/sse, sampling+elicitation REAL, OAuth, prompt-injection scan, OSV preflight (`mcp_tool.py`) | Canonical 37-tool catalog + writer-lease; client broker default-OFF (`mcp/server.ts`, `mcp-client/broker.ts`) | **Hermes** | Deckent MCP standardı net ama dinamizm/güven katmanı sığ |
| 14 | Enterprise governance | Consumer/assistant güvenliği (approval gate, sandbox, env-filter) | OIDC/RBAC/audit/capability/process — **kısmen enforce, kısmen theater** (§6, §7.3) | **Deckent (temel)** | Deckent çekirdeği doğru; enforcement tamamlanmalı |
| 15 | ERP/process zarfı | yok | ExecutionRequest + CapabilityTarget + ProcessController + 4 ERP driver (read-only) REAL+WIRED (`work-model.ts`, `process-controller.ts`, `erp/`) | **Deckent** | IFS/ERP için doğru taban; Hermes'ten UX alınır |
| 16 | Training/trajectory verisi | **Shipped, research-grade:** ShareGPT trajectory, batch_runner (multiprocessing), compressor, HuggingFace-loadable (`batch_runner.py`, `trajectory_compressor.py`) | Yazılmış ama **UNWIRED:** trace-recorder caller'sız, cc-trace-extractor 0-caller (`trace-wire.ts`, `training/cc-trace-extractor.ts`) | **Hermes** | Deckent'in en zayıf halkası + en kritik fırsatı (§7.2) |
| 17 | Reliability | Inner-retry + jittered backoff + fallback chain + credential-pool + Nous rate-guard (`conversation_loop.py:991-1346`) | 5-katman liveness + PanicGuard + cost-cascade circuit-breaker + sentetik-NO_GO disk-verify (`sprint-controller.ts:1260-1471`) | berabere | İkisi de olgun, farklı domain |
| 18 | Persistence mimarisi | 3 ayrık substrat: markdown (USER/MEMORY.md) + SQLite state.db (FTS5) + JSONL (cron/trajectory) | Tek DB-first memory-store (SQLite/FTS5) + HMAC audit chain + multi-tenant (`memory-store.ts:1002,326`) | farklı | Hermes human-readable; Deckent queryable+tamper-evident |

---

## 5. Derinleştirme: İki Farklı Öğrenme Döngüsü (kritik nüans)

Codex "memory" başlığını tek boyut sandı; kod iki **tamamen farklı** öğrenme döngüsü gösteriyor — ikisi de gerçek:

- **Hermes = kullanıcı-modeli + skill öğrenme döngüsü (insan-merkezli).**
  Her ~10 turn'de (`turn_context.py:290-298`) fork'lanmış bir AIAgent konuşmayı yeniden oynatıp `USER.md`'ye persona/tercih,
  `SKILL.md`'ye düzeltme yazıyor — "bir sonraki oturum zaten bilerek başlasın" (`background_review.py:170-275`). Memory =
  insan-okunur markdown (sistem prompt'una donuk enjekte; canlı tool dosyayı mutate eder). Bu, **kullanıcıyla zamanla
  derinleşen ilişki** için optimize.

- **Deckent = routing/agent-performans öğrenme döngüsü (sistem-merkezli).**
  `outcome → learnings.json → routing bonus + evolved-rule injection + agent promote/demote` zinciri **tam kapalı ve
  finalize→plan→route boyunca wired** (`outcome-tracker.ts:135`, `sprint-planner.ts:493-595`, `routing-engine.ts:611-647`,
  `promotion-pipeline.ts:93-125`). D3 ajanının hükmü: **"en güçlü gerçek subsystem".** Bu, **hangi ajanın/skill'in/modelin
  hangi işi daha iyi yaptığını** öğrenir — kullanıcı kişiliğini değil.

**Hüküm:** Bunlar rakip değil; Codex'in §5.4'teki "UserMemory / RunMemory / TrainingTrace ayrımı" önerisi kod-kanıtıyla
doğrulanıyor. Deckent zaten **RunMemory + outcome-learning**'de güçlü; eksik olan **UserMemory** (kullanıcı tercih/alışkanlık
katmanı, Hermes `USER.md` modeli) ve **TrainingTrace**'in canlandırılması (§7.2).

---

## 6. KRİTİK BULGU — Approval / Control-Plane Boşluğu (Codex §11 doğrulaması)

**Verdict: Codex §11 CONFIRMED (kod-onaylı).** Deckent'te uzun-koşan bir worker/docker/subprocess'in **sprint
ortasında** riskli bir aksiyon için onay isteyip, bu isteğin **ana REPL terminaline canlı düşmesi** ve kullanıcı
cevabıyla worker'ın **kaldığı yerden devam etmesi** — bu mekanizma **yok**.

Kanıt:
- **Worker hiçbir zaman insan kararı için bloke olmaz.** `agents/worker.ts`'te approval/wait/block/pending kodu sıfır
  (grep). Tek yetki teması senkron `checkWorkerAuthority` — bir allow/deny **hesabı**, interaktif prompt değil
  (`worker.ts:566`).
- **`capability-broker.ts` bir insan-broker değil.** İsmine rağmen `CapabilityTarget`'ı kayıtlı handler'a yönlendirir,
  default-off least-privilege gate'i vardır, asla onay için duraklamaz (`core/capability-broker.ts:246,270-293`).

**Var olan 4 ayrı (çoğu out-of-band) yüzey:**
1. **Sprint phase checkpoint** — `waitForHumanApproval` **orchestrator'ı** (worker'ı değil) faz sınırında bloke eder,
   checkpoint JSON yazar ve **5sn'de bir polling** yapar (`sprint-lifecycle.ts:383,414-434`). Bloke eder ama
   file-polled + orchestrator-level + sabit faz-sınırlarında.
2. **Nervous executor approval** — nervous AKSİYONLARI için in-memory `pendingApprovals`, file-based MCP→Executor IPC
   ile çözülür (`nervous/executor.ts:111,164`, `ipc-queue.ts`). Worker operasyonu değil; async.
3. **REPL-local tool-confirm** — yalnız REPL'in KENDİ native-agent'ının çalıştırdığı tool'lar için
   (`tool-permissions.ts:43`, `agent/permission.ts`). Sprint worker'larına bağlı değil.
4. **Telegram bot butonları** — `makeGatedDispatcher` riskli tool'u park edip Approve/Reject butonu gönderir
   (`connectors/bot-agentic.ts:54-56,141-145`); cevap `nervous_accept`'e besler. Out-of-band.

**Birleşik OKUMA yüzeyi var ama blocker değil:** `core/pending-approvals.ts:92-94` nervous + autonomous pending'lerini
status/watch/dashboard için birleştirir — bir **display aggregator**, canlı blocker değil.

**Tam boşluk:** worker'ın bir approval-request emit edip (a) terminale canlı yansıdığı ve (b) worker'ın cevap üzerine
**askıya alınıp devam ettiği** runtime-wide broker. En yakın bloke-eden gate (`waitForHumanApproval`) orchestrator-level +
faz-sınırlı + file-polled; worker'ın kendisinde approval-wait yolu hiç yok.

**Codex'ten ÖTESİ (benim eklemem):** Bu boşluğun çözümünde model olarak yalnız "Claude Code/Codex" değil, **Hermes'in
kendi approval/permission modeli** de alınmalı — Hermes'te `pre_approval_request`/`post_approval_response` plugin hook'ları
(`plugins.py:128-195`), MCP server `permissions_list_open`/`permissions_respond` tool'ları (`mcp_serve.py:478-873`) ve
`ElicitationHandler` (server tool-call ortasında kullanıcıya sorabilir, `mcp_tool.py:1253-1377`) zaten **pluggable +
uzaktan-sürülebilir bir approval event yüzeyi** kurmuş. Deckent'in ApprovalBroker'ı bu üç deseni (event + remote-drive +
mid-call elicitation) birleştirmeli.

---

## 7. Deckent'in Zayıf Halkaları (dürüst, kod-grounded)

### 7.1 Progressive disclosure SIFIR — tool yüzeyi eager
37 MCP tool host'a **tek seferde, koşulsuz** veriliyor; `registerTools` 33 koşulsuz `register*` çağrısı, sıfır gating/filter/search
(`mcp/tools/index.ts:102-136`). `tool_search|progressive|lazy|deferred` grep'i **sıfır**. Connector/enterprise action katmanı
eklenince bu yüzey patlar. Hermes'in BM25 bridge'i (`tool_search.py`) doğrudan uygulanabilir desen.

### 7.2 Training-trace pipeline yazılmış ama BAĞLANMAMIŞ (en kritik fırsat)
- `trace-recorder` REAL ama `buildTurnRecorder`'ın **hiç caller'ı yok** (`cli/repl/trace-wire.ts:20`); native bridge `recordTurn?`
  çağırır ama dep'i **hiç doldurulmaz** (`native-agent-bridge.ts:43,122`) → native-REPL trace'i **üretimde yazılmıyor**.
- `training/cc-trace-extractor.ts:51` temiz bir CC-JSONL → OpenAI-corpus parser'ı ama **tüm src'de 0 caller**.
- **Sonuç:** Deckent'in kendi-LLM/fine-tune vizyonu (`project_deckent_core_model_and_provider`, `project_sp2_training_data_pipeline`)
  için yakıt üretecek pipeline kodda hazır, **ama hiçbir canlı yüzeye bağlı değil.** Hermes burada **shipped + research-grade**
  (batch_runner multiprocessing → trajectories.jsonl → compressor → HuggingFace). Bu, Deckent'in en zayıf halkası **ve** en
  yüksek kaldıraçlı hamlesi: sprint worker turn'lerini (provider-native tool_use trace'leriyle) redacted+labeled yazmak.

### 7.3 Enterprise "write" yüzeyinin ikisi theater (no-op)
- **`rbac_roles` PUT/POST/DELETE = effective authority matrix'ten KOPUK.** config.json'a yazıyor ama `core/rbac.ts can()`
  veya `PERMISSION_MATRIX` (compile-time const) **hiç okumuyor** (grep-onaylı). Endpoint kendi yorumunda itiraf ediyor:
  "GET /rbac still reads from PERMISSION_MATRIX" (`enterprise-endpoint.ts:613-614`). **Persisted dead config.**
- **`rate_rules` PUT/POST/DELETE = canlı limiter'a bağlı değil.** config.json'a yazıyor, canlı `RateLimiter` `rate_rules`'ı
  **hiç okumuyor** (`enterprise-endpoint.ts:741-742`, grep-onaylı). **No-op.**
- **Düzeltme ilkesi (`feedback_zero_hardcode_live_data`):** ya gerçekten etkili yap ya UI/schema'dan kaldır. "Ayar var ama
  çalışmıyor" güveni öldürür.

### 7.4 Worker RBAC soft VE yalnız-autonomous
`enforce_rbac` hard-deny opt-in (default warn-only, `authority-matrix.ts:352-378`) **ve** yalnız autonomous dispatch'e wired
(`runtime-loop.ts:430`). **Manuel `deckent start` sprint'i bu gate'i hiç geçmiyor** — yani el-başlatılan sprint'te capability
RBAC fiilen yok. ADR-037 zaten "V1 soft-gate" diyor; ama autonomous-only oluşu enterprise iddiası için adreslenmeli.

### 7.5 İlk-deneyim + run-anywhere + Windows ürünleşmesi
Onboarding wizard/doctor zayıf (Hermes 19-bölüm doctor + setup wizard'a karşı), run-anywhere backend yok (Hermes 6 backend),
Windows native ürünleşmemiş (Hermes ConPTY+service+installer+desktop'a karşı). Bunlar solo + kurumsal benimsenme açıkları.

### 7.6 Yüzey-drift riski (her iki tarafta da var — simetrik bulgu)
Deckent: Ink-default + legacy-readline + native-agent-flag üç REPL/agent yolu (`entry.ts:501` bayat "opt-in" yorumu vs `:510`
opt-out kodu). Hermes: prompt_toolkit REPL + Ink `ui-tui` iki frontend. **İkisi de** terminal-stack drift taşıyor; bu Deckent'e
özgü bir kusur değil — ama Deckent'in native-agent default-flip'i "provable stabilization gate"e bağlanmalı, publish-gate'e değil.

---

## 8. Deckent'in Gerçek Moat'ı (korunacak — kopyalanamayan)

1. **Deterministik, eval-backed orchestration.** 8-faz + Kahn dependency-wave + file-lock + 9-adım deterministik eval +
   disk-vs-claim dürüstlüğü + sentetik-NO_GO disk-verify (`result-evaluator.ts`, `sprint-controller.ts:1260-1398`). Hermes'in
   conversational delegation'ı bunu yapamaz. **Bu Deckent'i Hermes/Cursor/Claude Code'dan ayıran ana güç.**
2. **Kapalı routing-öğrenme döngüsü.** outcome→learnings→routing-bonus+rule-injection+promotion (§5). Çalışan, wired, en güçlü
   subsystem.
3. **Governance-by-construction.** Tüm capability/ERP/data katmanı **yapısal olarak read-only** (erp.read/db.query/mail.search/http.get;
   write/send/mutate handler'ı YOK — `capability-runtime.ts:76-87`, `erp/connector.ts:161-183`). Side-effecting iş yapısal olarak
   park'a zorlanıyor (`policy-gate.ts`). Bu feature-gap değil, **inşa-yoluyla-yönetişim** — enterprise için doğru temel.
4. **Test disiplini.** 2x test:kaynak + hermetik test kuralları. Hermes 1.1x.
5. **Tamper-evident memory.** HMAC audit chain + multi-tenant column (`memory-store.ts:1002,326`) — dashboard'un ötesinde
   enterprise primitive'leri.

---

## 9. Hermes'ten Alınacak Dersler (öncelikli, çift-taraflı kanıtla)

| Öncelik | Ders | Hermes kanıtı | Deckent uyarlaması |
|---|---|---|---|
| **P0** | **Runtime-wide ApprovalBroker (worker→terminal canlı)** | elicitation + permissions_respond + pre/post_approval hooks (`mcp_tool.py:1253`, `mcp_serve.py`, `plugins.py`) | §6 boşluğu kapat; 4 yüzeyi tek broker'a topla; event + suspend/resume + remote-drive |
| **P0** | **TrainingTrace pipeline'ını canlandır** | shipped trajectory pipeline (`batch_runner.py`, `trajectory_compressor.py`) | `trace-recorder`/`cc-trace-extractor`'ı sprint-worker turn'lerine bağla; redact+label (§7.2) |
| **P0** | **Progressive tool/action disclosure** | BM25 bridge, %10 threshold, scoping gate (`tool_search.py:234-258,660-677`) | MCP/connector/action catalog'u `deckent_tool_search/describe/call` arkasına al |
| **P0** | **First-run wizard + zengin doctor** | modüler setup + `--portal` + 19-bölüm doctor `--fix` (`setup.py`, `doctor.py:485`) | `deckent setup`/Connection Center + `deckent doctor --windows-native` |
| P1 | **Tek cross-surface komut registry + kategorili keşif** | `COMMAND_REGISTRY` → CLI+gateway+Telegram+Slack (81 cmd, 5 kat) (`commands.py`) | 37 slash'ı kategori/risk/scope/edition etiketiyle tek kaynaktan üret |
| P1 | **Ortak session/action RPC protokolü** | `tui_gateway` JSON-RPC hem Ink TUI hem Electron desktop'u besliyor | REPL + dashboard + future-desktop aynı action protokolünü paylaşsın |
| P1 | **Cron/scheduled runs (solo UX)** | per-job model/workdir/skill + context_from chaining + platform delivery (`cron/scheduler.py`) | autonomous engine'i "Scheduled Deckent Run" olarak yüzeye çıkar |
| P1 | **UserMemory katmanı** | background-review `USER.md` (`background_review.py:159-168`) | RunMemory'nin yanına opt-in kullanıcı tercih/alışkanlık katmanı |
| P1 | **Plugin/hook mimarisi** | 24 lifecycle hook + 87 manifest (`plugins.py:128-195`) | connector/tool ekosistemi büyürse pre/post_tool + transform hook seam'i |
| P1 | **Dynamic tool availability cache** | TTL + transient-failure grace (`registry.py:120-196`) | provider/MCP/connector availability cache |
| P2 | **Run-anywhere backend soyutlaması** | `BaseEnvironment` ABC, 6 backend, FS-snapshot (`environments/base.py:290`) | opsiyonel docker/ssh/cloud worker backend |
| P2 | **Skill self-improvement (background review)** | fork-agent her ~10 turn (`background_review.py`) | opt-in post-run learning worker |

---

## 10. Codex Analiziyle Mutabakat / Ayrışma (senin istediğin karşılaştırma)

### 10.1 DOĞRULADIĞIM Codex iddiaları (kod-onaylı)
- ✅ **Progressive disclosure yok** (Codex §5.2) — grep=0, eager 37-tool (D2).
- ✅ **Runtime-wide ApprovalBroker worker→terminal yok** (Codex §11) — worker.ts approval-kodsuz, capability-broker insan-broker değil (D3).
- ✅ **Onboarding/setup/installer/Windows Hermes çok ileride** (Codex §3.1, §5.3, §9) — 19-bölüm doctor + ConPTY + Tauri installer (H4).
- ✅ **Enterprise enforcement parçalı** (Codex §5.5) — ve **daha sert kanıtım var:** `rbac_roles`+`rate_rules` no-op theater (D3).
- ✅ **Cron/scheduled solo-UX Hermes lehine** (Codex §3.4) — tam cron tool vs yüzeye-çıkmamış autonomous (H3/D1).
- ✅ **Lifecycle derinliği Deckent'in farkı** (Codex §4.1) — 8-faz + dependency-wave REAL (D1).

### 10.2 SERTLEŞTİRDİĞİM / DÜZELTTİĞİM noktalar (bağımsız değerim)
- 🔧 **"Serverless persistence"** Codex'in sunduğundan daha mütevazı: **yalnız filesystem snapshot/restore**, canlı-bellek
  hibernasyonu değil (`modal.py:442-477`, `daytona.py:261-264`). "Idle'da bedava" doğru, ama process/memory state hayatta kalmıyor.
- 🔧 **Auth-gate "publike açma"** notu fazla sert: **fail-CLOSED allowlist kodda VAR** (`gateway-router.ts:47` silent-drop, boş
  allowlist default). Gerçek boşluk **pairing-onay UX'i** (`onCallback` G1'e ertelenmiş, `gateway-daemon.ts:87-90`) — gate yok değil,
  **onay-butonu wire'ı** yok.
- 🔧 **ERP "ilk connector IFS"** eksik resim: **4 gerçek driver** var — IFS (tam OData v4 impl) + odoo/sap/dynamics reference
  + in-memory ref, hepsi yapısal read-only (`erp/ifs/driver.ts:135`, `erp/connector.ts:161-183`). Codex bunu küçük gösterdi.
- 🔧 **Approval boşluğu Codex'in dediğinden daha spesifik:** "approval yok" değil — **4 approval yüzeyi var** (sprint-checkpoint,
  nervous-executor, REPL-confirm, bot-button) + birleşik okuma aggregator'ı. Net boşluk yalnız **worker-scoped + canlı-terminal +
  worker-suspend**. Çözüm modeli olarak Hermes'in kendi elicitation/permissions deseni de alınmalı (§6).
- 🔧 **Self-learning loop Codex'te hak ettiği ağırlığı görmemiş:** outcome→routing→promotion **tam kapalı + en güçlü subsystem**
  (D3). Bu Deckent'in gerçek bir mevcut gücü, "geliştirilecek" değil "korunacak" kategorisinde (§8).

### 10.3 EKLEDİĞİM yeni boyutlar (Codex'in kapsamadığı)
- ➕ **Nicel ölçek tablosu** (§2) — objektif LOC/dosya/feature sayımı.
- ➕ **İki-farklı-öğrenme-döngüsü ayrımı** (§5) — Hermes user-persona vs Deckent routing-performans; ikisi de gerçek.
- ➕ **Training pipeline'ın UNWIRED durumu** (§7.2) — Codex "sonraki adım" demiş; bende kanıt: kod yazılı ama 0-caller, Hermes shipped.
- ➕ **Persistence mimarisi farkı** (§4 #18) — Hermes 3 ayrık substrat vs Deckent unified DB-first + HMAC.
- ➕ **Reliability domain'leri** (§4 #17) — Hermes retry/fallback/credential-pool vs Deckent liveness/panic/circuit-breaker.
- ➕ **Simetrik iki-TUI-drift bulgusu** (§7.6) — Hermes de iki frontend taşıyor; Deckent'e özgü kusur değil.
- ➕ **Hermes "ortak RPC protokolü"nü zaten kurmuş** (§9 P1) — Codex bunu Deckent için "gelecek P2" demiş; Hermes deseni kanıtlıyor.

---

## 11. Yön Kararı Önerileri (tartışma için — sıralı filtre)

Codex'in "Deckent is a local-first AI orchestration shell: terminal runs, dashboard explains, core orchestrates, enterprise
governs" cümlesi sağlam bir karar-filtresi; kodla uyumlu. Bunun üstüne benim kod-temelli **publish-öncesi sıram**:

1. **ApprovalBroker P0 dilimi** — worker→terminal canlı onay + suspend/resume. Bu olmadan terminal yalnız "sprint başlatan pencere";
   bununla **gerçek control-plane**. (§6, §9-P0)
2. **TrainingTrace'i canlandır** — sprint-worker turn'lerini redacted+labeled yaz. Deckent-LLM vizyonunun yakıtı; kod zaten %80 hazır. (§7.2)
3. **Progressive tool/action disclosure** — eager 37 → core + searchable. Connector/enterprise yüzeyi büyümeden önce. (§7.1)
4. **First-run Connection Center + zengin doctor (+windows-native profil)** — solo benimsenme omurgası. (§7.5)
5. **Enterprise "theater" temizliği** — `rbac_roles`/`rate_rules`'ı ya gerçekten enforce et ya schema'dan kaldır; `enforce_rbac`'ı
   manuel sprint path'ine de bağla. (§7.3, §7.4)
6. **Tek cross-surface command registry + kategorili slash** + ortak session/action RPC protokolü. (§9-P1)
7. **Cron/scheduled run yüzeyi + UserMemory katmanı** — solo→pro köprüsü. (§9-P1)

**Korunacak (kopyalama tuzağına düşme):** deterministik eval-backed orchestration, kapalı routing-öğrenme döngüsü,
governance-by-construction, test disiplini (§8). Bunlar Hermes'in **yapamadığı** ve Deckent'i farklılaştıran çekirdek.

**Kısa hüküm:** Deckent'in "god-level enterprise" hedefi için en kritik hamle daha çok ajan/platform/skill **değil**; Hermes'in
başardığı **benimsenme-ergonomisi + progressive disclosure + canlı-asistan hissini**, Deckent'in mevcut **deterministik
orchestration + governance + kapalı-öğrenme** çekirdeğine bindirmek — ve **ana terminale canlı kontrolü** + **training yakıtını**
bağlamak.

---

## 12. Ek — Kanıt Haritası (yük-taşıyan file:line)

**Hermes**
- Agent loop: `agent/conversation_loop.py:497,612,4331`; delegation `tools/delegate_tool.py:140,2548`, `tools/async_delegation.py:9-20`.
- Tool registry + disclosure: `tools/registry.py:120-196,290-345`; `tools/tool_search.py:163-187,234-258,660-677`.
- MCP: client `tools/mcp_tool.py:856-1084,1253-1377,4052-4117`; server `mcp_serve.py:478-873`.
- Memory/learning: `agent/background_review.py:159-275`; `agent/memory_manager.py:353-396`; FTS5 `hermes_state.py:639-788`; recall `tools/session_search_tool.py:756`.
- Cron: `tools/cronjob_tools.py:598-974`; `cron/scheduler.py:828-2122`; `cron/jobs.py:305-413`.
- Training: `agent/agent_runtime_helpers.py:107-237`; `batch_runner.py:473-487`; `trajectory_compressor.py:1487-1491`.
- Terminal/backends: `tools/environments/base.py:290,866`; modal `modal.py:442-477`; daytona `daytona.py:261-264`.
- CLI/gateway/Windows: `cli.py:6321-6371,13217-13312`; `hermes_cli/doctor.py:485`; `gateway/authz_mixin.py:198-207`; `hermes_cli/win_pty_bridge.py:1-25`; `gateway_windows.py:149-282`; `scripts/install.ps1:3168-3193`.
- Plugins: `hermes_cli/plugins.py:128-195,260-294`.

**Deckent**
- Sprint lifecycle: `orchestra/sprint-controller.ts:925-1568`; phases `orchestra/sprint-phases.ts:727-2495`; deps `orchestra/dependency-scheduler.ts:123,179-200`.
- Eval/FIX: `orchestra/result-evaluator.ts:121-213`; `worker.ts:395-409`; FIX `sprint-phases.ts:2142-2291`.
- Provider/routing: `core/provider.ts:89-181,575,968-1169`; `core/routing-engine.ts:324,611-647`; `core/task-router.ts:255-378`.
- Capability/ERP/process: `core/work-model.ts:89-95,133-173`; `core/capability-runtime.ts:71-133`; `orchestra/process-controller.ts:95-194`; `core/erp/connector.ts:161-183`; `erp/ifs/driver.ts:135`; `erp/factory.ts:159`.
- Memory/learning: `core/memory-store.ts:229-278,1002,326`; `core/memory-query.ts:206-209`; `orchestra/outcome-tracker.ts:135`; `orchestra/rule-evolver.ts:32-33`; `orchestra/promotion-pipeline.ts:93-125`.
- REPL/MCP: `cli/entry.ts:341-516`; `cli/repl/app.tsx:358-512`; `cli/commands/chat-slash-registry.ts:57-268`; `mcp/tools/index.ts:59-136`; `mcp/writer-lease-gate.ts:51-78`; `mcp-client/broker.ts:57-180`.
- Approval/nervous: `orchestra/sprint-lifecycle.ts:383,414-434`; `nervous/executor.ts:111,164`; `nervous/detector-registry.ts:11-167`; `core/pending-approvals.ts:92-94`; `connectors/bot-agentic.ts:54-56`.
- Enterprise/auth: `api/auth.ts:110-273`; `api/server.ts:453-455`; `api/enterprise-endpoint.ts:613-614,741-742`; `nervous/authority-matrix.ts:316-379`; `orchestra/autonomous/runtime-loop.ts:430`.
- Training (unwired): `cli/repl/trace-wire.ts:20`; `cli/repl/native-agent-bridge.ts:43,122`; `training/cc-trace-extractor.ts:51`.
