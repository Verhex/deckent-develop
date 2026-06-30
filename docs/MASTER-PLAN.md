# Deckent — Master Plan (Tek İş-Planı Tablosu)

**Yenileme:** 2026-06-29 — Hermes-vs-Deckent analiz turu + Alperen detaylı yön (pass-2) + Codex gap-fold. · **2026-06-30** — ADR-redesign-hizalama (4-katman ADR-G/D taksonomi + `## ADR Traceability` + born/gap-items + stale-ref-fix).
**Arşiv (lossless, eski plan tam hali):** `docs/archive/MASTER-PLAN-archived-2026-06-29.md` (1329 satır).
**Kaynaklar:** `.analysis/hermes-vs-deckent-claude-analysis.md` (Claude) · `.analysis/hermes-vs-deckent-analysis.md` (Codex) · `.analysis/hermes-vs-deckent-direction-decisions.md` (Alperen yön-kararları).

> **SSOT.** Tüm açık iş bu tek tablodadır. Done-history + her maddenin tam detayı arşivde; bu tablo **ileriye-dönük tracker**.
> `docs/MASTER-PLAN-TR.md` = Türkçe okuma-companion'ı (aynı maddeler, pillar-gruplu).
> **ADR-grounded:** her item bir ADR-G/D'ye trace eder — bkz. **`## ADR Traceability`** (41 ADR → item, %100 coverage). Taksonomi: 4-katman ADR-G(anayasa)/D(dev)/UG/UP, precedence **G>U>D**.
> **Sıralama:** Önceliklendirme adımında **Sıra** sütunu eklenecek / satırlar yürütme-sırasına dizilecek (Alperen ile, bir sonraki adım).

### Nasıl kullanılır (Excel gibi filtrele)
- **Durum** = ⬜ Açık · 🟡 Kısmi · 🔬 Araştırma · ⏸️ Ertelendi · ✅ Tamam. **Kaynak** = `A` Alperen · `CL` Claude · `CX` Codex(gap) · `MP` eski-backlog. **Önc** = P0/P1/P2.
- Filtre: Pillar + Durum + Önc + Tarih üzerinden grep/sort. Yeni madde = Pillar + ID ata.

---

## North Star (yön — 2026-06-29)

> **Deckent = local-first AI orchestration shell. Terminal runs · Dashboard explains · Core orchestrates · Enterprise governs.**
> **Terminal** = ana yönetim+kullanım penceresi (solo ürünün kalbi); **tam kontrol + yormayan + tam işlevsellik (esneklik=kabul-edilmez)**;
> tool-driven + conversational; iş CLI-komutuyla değil terminalden — ama zorlamadan (CLI/MCP opsiyonel). **Dashboard** = yalnız izleme/görsel
> anlama (basit, tutarlı); chat **Desktop-app** tarafında; sonra Electron CC-Desktop ürünü. **Çekirdek Hermes'ten daha derin → terminal+tool'da daha
> İYİ olmak zorunda.** Kopyalama yok: Hermes desenlerini rol-model al, daha iyisini kur. **Deckent global kurulur, öğrenimler proje-scope.**

## 3-Yönlü Sentez (Claude ↔ Codex ↔ Alperen)
- **Mutabık:** progressive-disclosure yok · approval worker→terminal canlı yok · onboarding/Windows Hermes önde · enterprise enforcement parçalı · lifecycle-derinliği Deckent farkı · dashboard=observability.
- **Claude düzeltmeleri:** "serverless"=FS-snapshot · auth fail-CLOSED (eksik=pairing-UX) · ERP=4 driver · approval 4-yüzey (boşluk=worker-live-suspend) · **training-trace UNWIRED** · self-learning loop kapalı (koru).
- **Alperen kararı:** terminal-pivot(derin) · tool-rol-model · çok-ortamlı canlı-approval · training WIRE · global-install+proje-scope · DIRECTIVES 0-kırılganlık · worker-prompt token-opt · APP-protocol+SDK · ADR-layering+modülerleşme · 6-dil i18n · provider first-class · moat-koru.

---

## MASTER TABLO

| ID | Pillar | İş Kalemi | Kaynak | Önc | Bağımlılık | Durum | Tarih | Not |
|---|---|---|---|---|---|---|---|---|
| TERM-1 | TERM | Açılış health snapshot (provider/model/auth/MCP/mem/cwd/mode) | A·CL | P0 | — | ⬜ | — | "hazır mıyım?" |
| TERM-LIVE | TERM | Çalışırken canlı run-status footer (1-5 satır, 5 soru) + provider-health+auth state | CX·A | P0 | TERM-1 | ⬜ | — | §10.1; ne çalışıyor/nerede/onay?/sonraki/risk |
| TERM-MODE | TERM | Ask / Run / Control 3-mod shell (read-only / plan→approve→run→eval / yönetim) | CX | P0 | — | ⬜ | — | §9.4 organizan kavram |
| TERM-FLOW | TERM | Simple-task altın akış: NL prompt→plan-preview→approve→run→evaluate | CX·A | P0 | TERM-MODE | ⬜ | — | §9.5 P0×2; en yüksek-sinyal |
| TERM-2 | TERM | Conversational chat yüzeyi (Hermes user-msg); bg-tamamlanan iş → yeni turn | A | P0 | TERM-1 | ⬜ | — | mid-turn enjekte değil |
| TERM-3 | TERM | Kategorili komut keşfi (slash→kategori/risk/scope; tek cross-surface registry) | A·CL·CX | P0 | — | ⬜ | — | Core/Run/Memory/MCP/Enterprise/Danger |
| TERM-4 | TERM | Tool-driven terminal (CLI değil; CLI/MCP opsiyonel access) | A | P0 | TOOL-1 | ⬜ | — | "isterse CC'den CLI/MCP" |
| TERM-CONNECT | TERM | `/connect` runtime wizard (provider/MCP/IDE/Windows-shell + auto-detect + health badge) | CX | P0 | — | ⬜ | — | §9.5; install sonrası bind |
| TERM-CAT | TERM | Tool/Action catalog + trust badge (Core/Project/MCP/Enterprise/Dangerous) | CX·CL | P1 | TOOL-CAT | ⬜ | — | §9.3; actions paneli |
| TERM-RESUME | TERM | Açılış recent-session teaser + interaktif `/resume` picker (number/id/title, degrade-safe) | CX | P1 | — | ⬜ | — | §9.5; Hermes _show_recent |
| TERM-BUSY | TERM | Busy-davranış standardı: `/queue` `/interrupt` `/steer` + mid-run steering (Esc/Ctrl-C) | CX | P1 | — | ⬜ | — | §9.3 row6 |
| TERM-COMPAT | TERM | REPL compat test matrisi (Linux/macOS/WinTerm/PowerShell/GitBash × resize/paste/arrow/raw-mode + PTY smoke) | CX | P1 | — | ⬜ | — | §9.5 |
| TERM-SIMPLE | TERM | Simple Mode edition (basic-user'a 5-7 core komut; advanced ertelenir) | CX | P1 | TERM-3 | ⬜ | — | §3.3/§5.1 |
| TERM-5 | TERM | Görsel+işlevsel tutarlı/yormayan dil + sade risk-dili (Oku/Değiştir/Çalıştır/Otonom) | A·CX | P0 | — | 🔬 | — | tam-işlevsellik şart |
| TERM-RPC | TERM | Ortak session/action RPC protokolü (REPL+dashboard+desktop+gateway) | CX·CL | P1 | — | ⬜ | — | §9.5; Hermes tui_gateway modeli |
| DIR-1 | TERM | Terminalde NL "planla" → DIRECTIVES üret (sabit-format el-yazımı yerine) | A | P0 | TERM-2 | ⬜ | — | DIRECTIVES kırılganlığı |
| F2-008 | TERM | Native SDK round-trip (zero-CLI-prereq) | MP·A | P1 | — | ⬜ | — | §16 SP-1; APP-1 ile |
| F11-014 | TERM | Multi-provider native REPL parity (codex/gemini/ollama=claude) | MP | P1 | F2-008 | 🟡 | — | gemini key-gated |
| F11-016 | TERM | Ink REPL stabilizasyon (cursor/queue/streaming) + ADR | MP | P1 | — | 🟡 | — | stream-segmenter landed |
| TERM-NAT | TERM | Native-agent default-flip (provable-stabilization-gate; publish-gate değil) | MP·CL | P1 | F11-016 | 🟡 | — | §16 FLIP-3 |
| CHAT-IDE | TERM | VS Code/JetBrains extension gerçek impl (stub) | MP | P2 | — | ⬜ | — | — |
| F7-004 | TERM | Terminal hardening (multi-session/history/copy-paste) | MP | P1 | — | 🟡 | — | — |
| REPL-001 | TERM | REPL /autonomous+/mcp+/nervous dispatch parity | MP | P1 | MCP-1 | ⬜ | — | — |
| APR-1 | APR | Runtime-wide ApprovalBroker (event, stdin değil; worker emit→suspend→resume) | A·CL·CX | P0 | — | ⬜ | — | §11.1; İLK madde, en kritik |
| APR-SHELLCLIENT | APR | ShellApprovalClient — Ink approval card (y/n/a/d) REPL altında | CX | P0 | APR-1 | ⬜ | — | §11.3 |
| APR-WORKERGATE | APR | WorkerApprovalGate (riskli tool/aksiyon öncesi broker'dan karar bekle) | CX | P0 | APR-1 | ⬜ | — | §11.3; worker-yan gate |
| APR-DUALSTREAM | APR | Terminal çift-stream (run-status + approval aynı anda) + confirm-queue'yu runtime-wide genişlet | CX | P0 | APR-1 | ⬜ | — | §11.4 |
| APR-2 | APR | Çok-kanallı canlı onay relay + "xx'de onaylandı" cross-broadcast | A | P0 | APR-1 | ⬜ | — | telegram/whatsapp/terminal/dashboard |
| APR-EVENTSTREAM | APR | ApprovalEventStream (çok-client pub: terminal/dashboard/API/Slack/Teams) | CX | P0 | APR-2 | ⬜ | — | §11.3 |
| APR-STORE | APR | ApprovalStore durable persist (pending/approved/denied/expired; restart-survive) | CX | P0 | APR-1 | ⬜ | — | §11.3/§11.7; memory-promise değil |
| APR-CONTRACT | APR | ApprovalRequest tam kontrat (requester/summary↔details/scopeId; scope-7/risk-5/policy-4/default-4 enum; tenant/user) | CX·A | P0 | APR-1 | ⬜ | — | §11.2; SIFIR-kayıp |
| APR-POLICY | APR | ApprovalPolicy karar-motoru (risk/role/tenant/scope/timeout → karar) | CX | P0 | APR-CONTRACT | ⬜ | — | §11.3 |
| APR-FALLBACK | APR | FallbackResolver (terminal-yok → deny/pause/timeout/dashboard-API escalation; sonsuz-takılma yok) | CX | P0 | APR-1 | ⬜ | — | §11.6 P0 |
| APR-4 | APR | Onay redaction/secret-masking (raw-command vs masked-arg ayrı) | CL·CX | P0 | APR-CONTRACT | ⬜ | — | §11.7 |
| APR-ALLOWSCOPE | APR | Scoped "always-allow" (tool+scope+risk+expiry; asla global) | CX | P1 | APR-POLICY | ⬜ | — | §11.6/§11.7 |
| APR-CLIENTS | APR | Slack/Teams + API delegated-approval client'ları | CX | P1 | APR-EVENTSTREAM | ⬜ | — | §11.3/§11.6 |
| APR-HISTORY | APR | Dashboard approval history + audit-report view (approved/denied/expired + policy + trace) | CX | P1 | DASH-2 | ⬜ | — | §11.5 |
| APPROVE-007b | APR | REPL /nervous IPC bridge + handleEdit (modified-payload) | MP | P1 | APR-1 | ⬜ | — | — |
| CKPT-1 | APR | Worker askBrain auto-continue → gerçek human-checkpoint | MP | P1 | APR-1 | ⬜ | — | — |
| DEFER-001 | APR | Autonomous MCP + API/dashboard approval surface (remote/OAuth) | MP | P2 | APR-2 | ⬜ | — | — |
| DEFER-002 | APR | Nervous MCP undo/edit + askBrain escalation | MP | P2 | APR-1 | ⬜ | — | — |
| TRN-1 | TRN | trace-recorder → sprint-worker turn'lerine WIRE (redacted+labeled) | A·CL | P0 | — | ⬜ | — | §7.2 en kritik; 0-caller |
| TRN-2 | TRN | trace-recorder → native-REPL WIRE (buildTurnRecorder 0-caller) | CL | P0 | — | ⬜ | — | trace-wire.ts:20 |
| TRN-3 | TRN | cc-trace-extractor driver (CLI/sprint-hook; 0-caller) | CL | P0 | — | ⬜ | — | cc-trace-extractor.ts:51 |
| TRN-LABEL | TRN | Run-outcome etiket taksonomisi (success/partial/cancelled/NO_GO) training+memory | CX | P1 | TRN-1 | ⬜ | — | §3.5 |
| TRN-4 | TRN | Pipeline mükemmelleştir (ShareGPT/compressor/label/redact) | A·CL | P1 | TRN-1 | ⬜ | — | Hermes shipped-grade |
| TOK-AUT | TRN | tokenUsage autonomous task-mode 0/0/0 enrichment fix | MP | P1 | — | 🟡 | — | WP-4 ailesi |
| SP2-FT | TRN | Deckent-core fine-tune (qwen/Hermes-base QLoRA) | MP·A | P2 | TRN-1 | ⏸️ | — | §16 SP-2 |
| TOOL-1 | TOOL | Deckent fonksiyonlarını tool-yüzeyine taşı (terminal-native dispatch) | A | P0 | — | ⬜ | — | "deckenti deckent yapan" |
| TOOL-2 | TOOL | Progressive tool/action disclosure: core + searchable bridge (search/describe/call) | A·CL·CX | P0 | TOOL-1 | ⬜ | — | §7.1; BM25 modeli, daha iyisi |
| TOOL-CORE | TOOL | Core-tool-set ilk-turda eager (status/plan/run/start/review/help/memory-query); gerisi defer | CX | P1 | TOOL-2 | ⬜ | — | §5.2 |
| TOOL-REG | TOOL | Tool registry mekaniği: availability-cache(TTL) + toolset enable/disable + dynamic-schema-override + generation-memo + shadow/override-policy | CX·CL | P1 | TOOL-1 | ⬜ | — | §3.2 tam |
| TOOL-CAT | TOOL | Tool/action catalog veri-modeli + trust-tier (Core/Project/MCP/Enterprise/Danger) | CX·CL | P1 | TOOL-1 | ⬜ | — | TERM-CAT bunu render eder |
| TOOL-SCOPE | TOOL | Scope-enforcement'ı prompt yerine TOOL ile çöz (worker out-of-scope tool-gated) | A | P0 | TOOL-1 | ⬜ | — | worker-prompt küçülmesi |
| TOOL-CU | TOOL | Computer-use/browser opsiyonel automation pack | CX | P2 | — | ⬜ | — | §6 P2 |
| TOOL-4 | TOOL | Plugin/hook seam (pre/post_tool + transform; 24-hook Hermes deseni) | CL | P2 | — | ⬜ | — | — |
| AGSK-1 | TOOL | Agent + skill katalog GENİŞLEMESİ (kritik) | A | P1 | — | ⬜ | — | "çok kritik" |
| PARITY-1 | TOOL | CLI/MCP parity (agent/skill/memory_manage + cost tool + lint) | MP | P1 | — | ⬜ | — | — |
| ONB-GLOBAL | ONB | Global/sistem-seviye kurulum + proje-scope katman + öğrenimler proje-scope (Deckent global-tutarlı) | A | P0 | — | ⬜ | — | "kesinlikle revize edilecek" |
| ONB-1 | ONB | install→init wizard (provider/auth/MCP/workspace/mode + sistem-tarama) | A·CL | P0 | ONB-GLOBAL | ⬜ | — | Connection Center |
| ONB-CHAT | ONB | "deckent" → sohbetle tüm setup + Deckent faydalı-özellik önerir (CLI/MCP yine çalışır) | A | P0 | TERM-2 | ⬜ | — | NL setup |
| ONB-2 | ONB | Zengin doctor (--fix + windows-native profil + auth-state probe) | A·CL | P0 | — | ⬜ | — | Hermes 19-bölüm |
| ONB-HONEST | ONB | Doctor "hazır/eksik/tek-tık-fix" non-teknik dürüst mesaj | CX | P1 | ONB-2 | ⬜ | — | §3.1 |
| ONB-DISCOVERY | ONB | Provider CLI discovery wizard / kurulu-CLI auto-detect | CX | P1 | ONB-1 | ⬜ | — | §5.3 |
| PSL-6 | ONB | Provider login/OAuth-binding + doctor gerçek-auth probe | MP | P1 | ONB-2 | 🟡 | — | CLI-present≠logged-in |
| CFG-1 | ONB | Legacy `mode` tüm config-set'i blokluyor (3-yol tutarsız) | MP | P1 | — | ⬜ | — | resolveMode wire |
| DOCTOR-1 | ONB·WIN | doctor Platform-check backend-blind (Win+docker) + brain-budget label | MP | P1 | — | ⬜ | — | — |
| MOAT-1 | MOAT | WORKTREE-MERGE-RACE: 8-wide'da 3/11 source-merge düştü | MP | P0 | — | ⬜ | — | güven-bug 🔴 |
| MOAT-2 | MOAT | ORPHAN-START-PROC: normal-completion coordinator lingers | MP | P0 | — | ⬜ | — | recurrence 🟠 |
| MOAT-3 | MOAT | Sentetik-NO_GO / eval-vs-disk güven (NOT_DISPATCHED dürüst-durum) | MP | P1 | — | ⬜ | — | DISP-W1 |
| MOAT-4 | MOAT | Deterministik orchestration + kapalı-öğrenme + governance-by-construction KORU | A·CL | P0 | — | ✅ | — | yeniden-yazma yok |
| WP-OPT | MOAT | Worker-prompt token-opt: aynı kalitede min-token + tekrar-azalt (scope-blok→TOOL-SCOPE) | A | P0 | TOOL-SCOPE | ⬜ | — | promptlar çok uzun |
| ORCH-BE | MOAT | Çok-backend kusursuz orkestre (subprocess/docker/tmux + firecracker/k8s) | A | P1 | — | 🟡 | — | ana güç |
| MOAT-ISO | MOAT | İzole-ortam kontrolleri çoğaldıkça (firecracker/k8s) doğru kontrol | A | P1 | ORCH-BE | ⬜ | — | — |
| MOAT-VCS | MOAT | Proje-takip soyutlaması (şu an git; pluggable diğer VCS/ortam) | A | P1 | — | ⬜ | — | git ≠ GitHub |
| EVO-2 | MOAT | Evolution moat efficacy: gözlemlenebilir outcome-improvement sinyali | MP | P2 | — | ⬜ | — | wired-unproven |
| DASH-1 | DASH | Scope-freeze + observability reframe (izleme-only; chat→Desktop) | A·CL·CX | P1 | — | ⬜ | — | "dashboard explains" |
| DASH-PANELS | DASH | Observability panel-seti (timeline/DAG/mission-flow/run-trace/approval-history/token-cost/outcome-evolution/ERP-flow) | CX | P1 | DASH-1 | ◑ | — | bazısı mevcut |
| DASH-2 | DASH | Pending-approval viewer (çok-kanal, blocker değil) | A·CL | P1 | APR-1 | ⬜ | — | pending-approvals.ts var |
| DASH-D3 | DASH | Ölü-alan envanteri (playwright 14-route) + embedded-terminal bütünlüğü | MP | P1 | — | ⬜ | — | SONRAKİ-OTURUM |
| PROV-FC | PROV | First-class cost+limit+bildirim + fallback-yakalama + hız+kalite+güvenlik (denge değil, hepsi first-class) | A | P0 | — | ⬜ | — | "deckent bunu yapan araç" algısı |
| PROV-1 | PROV | oauth-subs ↔ api eşzamanlı kullanım metriği | A | P1 | — | ⬜ | — | güç-metriği |
| PROV-SUBS | PROV | Subscription-paket desteği (subs, sadece api+local değil) | A | P1 | — | ⬜ | — | Hermes api+local; biz subs de |
| PROV-CONTRACT | PROV | Sağlayıcı-sözleşme engeli izleme+fix (örn. Gemini-CLI subs kalktı) | A | P1 | PSL-3 | ⬜ | — | sistemsel/sözleşme değişimi |
| PROV-MATRIX | PROV | Maliyet-uygun provider/model → uygun-agent seçim matrisi (force-* mevcut) | A | P1 | ROUTE-1 | ⬜ | — | — |
| F1-TOK | PROV | Token/limit ledger (cacheWrite-dominant; subscription cost-eşdeğeri) | MP | P0 | — | 🟡 | — | infra ✅, capture build-gate; usage-cost kritik |
| F1-LIM | PROV | Resource-aware spawn + algıla→park | MP | P1 | — | ✅ | 2026-06-10 | — |
| F1-CB | PROV | Cost billing-mode = auth_mode (subscription→$0) | MP | P1 | — | ✅ | 2026-06-09 | — |
| F1-010 | PROV | Subscription→API overflow load-balancing (limit→başka provider) | MP | P1 | F1-TOK | ⬜ | — | fallback ailesi |
| F1-AD | PROV | Autonomous subscription-model detection (live capability, zero-hardcode) | MP | P1 | — | ⬜ | — | "kullanıcıyı yormazdık" |
| F1-PD | PROV | Parametrik model/provider (DB-persist + reconcile) | MP | P1 | F1-AD | 🟡 | — | — |
| F1-PCACHE | PROV | Provider-agnostik worker-prompt & cache (5-archetype) | MP | P1 | — | 🟡 | — | per-provider kalan |
| F1-IMG-2 | PROV·WIN | Standalone `deckent image build` + init/upgrade | MP | P1 | — | ⬜ | — | F1-DF ✅ unblocked |
| F1-009r | PROV | Live-keys mixed-provider sprint e2e testi | MP | P1 | — | ⬜ | — | — |
| F1-015 | PROV | Bedrock SigV4 (+Vertex) | MP | P2 | — | ⬜ | — | ADR-D-005 dep-policy (no-SDK) |
| MF-4 | PROV | Docker degradation provider-aware (claude-hardcode kaldır) | MP | P1 | PSL-1 | ⬜ | — | — |
| MF-5 | PROV | Result-format consistency (-fix.result brainEval; codex tokenUsage) | MP | P1 | — | ⬜ | — | — |
| MF-7 | PROV | FIX-phase retry verification strategy değişimi | MP | P1 | — | ⬜ | — | — |
| MF-9 | PROV | Sprint process clean-exit (host-adapter timeout-reap) | MP | P1 | — | ⬜ | — | ORPHAN ailesi |
| PSL-2 | PROV | Capability/Contract layer (command≠contract per-provider) | MP | P1 | — | ⬜ | — | AS-4 |
| PSL-3 | PROV | Spec versioning + spawn-time validation (CLI probe) | MP | P1 | — | ⬜ | — | drift-axis |
| PSL-4 | PROV | `deckent upgrade` signed/integrity spec-update channel | MP | P1 | — | ⬜ | — | supply-chain |
| PSL-7 | PROV | Backend taxonomy (process×inference: docker/host/local) | MP | P2 | — | ⬜ | — | — |
| AS2-P3 | PROV | Failover wire (429/limit→switch) + models.dev map | MP | P1 | F1-010 | ⬜ | — | fallback-catch |
| AS2-P4 | PROV | Bedrock/Vertex fleet completion | MP | P2 | F1-015 | ⬜ | — | — |
| AS4-P1 | PROV | Capability Realization Layer (native passthrough + text fallback) | MP | P1 | — | ⬜ | — | — |
| AS4-P2 | PROV | Native skills/plugins passthrough | MP | P2 | — | ⬜ | — | — |
| AS4-P3 | PROV | Nested ultracode/Workflow orchestration | MP | P2 | — | ⬜ | — | — |
| T2 | PROV | vLLM+LiteLLM enterprise multi-model gateway + llama-swap VRAM | MP | P2 | — | ⬜ | — | hosted-core ile |
| ROUTE-1 | PROV·MOAT | Kusursuz model/effort ataması + tracking + evrim (learned, auditable) | MP·A | P1 | TRN-1 | 🟡 | — | §18 routing-v2 precision |
| TEAM-1 | PROV·ENT | Multi-provider TEAM subs (OpenAI/Anthropic Team) RBAC-aware | MP | P2 | — | ⬜ | — | — |
| MEM-1 | MEM | Memory kullanım-denetimi ("her çalışmada okunuyor/yazılıyor mu") | A | P1 | — | 🔬 | — | wiring-vs-working |
| MEM-2 | MEM | Kırılım/scope katmanları: project / session / other-gereklilik | A | P1 | — | ⬜ | — | DB kırılımları |
| MEM-3 | MEM | DB hız/index (query SLA) | A·MP | P1 | — | ⬜ | — | PERF-2 |
| MEM-4 | MEM·MOAT | Self-evrim döngüsü koru (ihtiyaç-duydukça-kullan + kullanımla-geliş) | A | P1 | — | ✅ | — | en güçlü subsystem (koru) |
| MEM-REVIEW | MEM | Background memory/skill review worker (post-run opt-in; Hermes fork-agent ~10 turn) | CX·CL | P1 | — | ⬜ | — | §3.5; aktif review |
| MEM-HYGIENE | MEM | Interrupted-turn guard + next-turn memory prefetch | CX | P2 | — | ⬜ | — | §3.5 |
| UMEM-1 | MEM | UserMemory katmanı (USER.md/SOUL.md modeli, opt-in) | A·CL | P1 | — | ⬜ | — | §13 derinleşme |
| MODE-1 | MODE | process-mode executor (kind=process honest-fail→çalışır) | A·MP | P1 | — | ⬜ | — | mod-geçişi 2/3 |
| DIR-2 | MODE | DIRECTIVES 0-kırılganlık: task/process/autonomous/flow/mission/sprint hepsi + ilk-proje-safety | A | P0 | DIR-1 | ⬜ | — | "çok hassas çubuk" |
| MODE-2 | MODE | Mode-bağımsız lifecycle kernel (retro/decay/cleanup + per-item .tasks hijyeni) | A·MP | P1 | — | ⬜ | — | §18 slice-2 |
| MODE-3 | MODE | Cost/limit-aware scheduling (organizma: limit+maliyet çizelgesi) | A | P1 | F1-TOK | ⬜ | — | "uyumlu organizma" |
| MODE-4 | MODE | Scheduled-run UX (Hermes cron dersi: daily-audit/nightly-fix) | A·CL | P1 | — | ⬜ | — | autonomous'u yüzeye çıkar |
| MODE-ENTMON | MODE | Enterprise scheduled monitors (procurement-anomaly/IFS-read-report/finance-risk-brief) | CX | P2 | MODE-4 | ⬜ | — | §3.4 L0/L1 |
| F3-008 | MODE | Workflow Composer (deklaratif/görsel DAG flow editor) | MP | P2 | — | ⬜ | — | scheduled-flow üstüne |
| F3-004 | MODE | SessionBackend Kubernetes pod-exec | MP | P2 | — | ⬜ | — | — |
| AUT-9 | MODE | Sub-proj 3-5: TODO scanner + autonomous dashboard + composer | MP | P1 | F3-008 | 🟡 | — | work-gen live |
| AUT-10 | MODE | Master-plan autonomous-dogfood (approval-gated) | MP | P2 | APR-1 | ⬜ | — | — |
| IDLE-SPIN | MODE | Autonomous idle busy-spin doğrula (57456-cycle) | MP | P1 | — | ⬜ | — | §18 minor |
| WIN-1 | WIN | Native Windows profil (ConPTY/PTY + service + installer) — WSL2 değil | A·CL | P1 | — | ⬜ | — | Hermes win_pty_bridge dersi |
| WIN-PATHS | WIN | %LOCALAPPDATA%/Deckent vs %ProgramData%/Deckent data-dir split | CX | P1 | WIN-1 | ⬜ | — | §5.3 user vs machine |
| WIN-2 | WIN | tmux/docker local gözlemlenebilirlik (worker izleme, ölçeklenebilir) | A | P1 | — | ⬜ | — | "izlenebilir ölçek" |
| WIN-3 | WIN | Ölçeklenebilir spawn (ERP + milyon-user) | A | P1 | — | ⬜ | — | — |
| WIN-ERP | WIN·ENT | Azure/Windows-ERP enterprise katmanı (IBM/Oracle/dünya-devleri ölçeği) — kalp adayı | A | P2 | — | ⬜ | — | — |
| SPAWN-1 | WIN | Node DEP0190 (shell:true+args) Windows leak + injection fix | MP | P1 | — | ⬜ | — | ADR-G-002 carve-out |
| MSG-1 | MSG | Integration layer (connector pairing/authz/session standardı) | A·CL | P1 | — | ⬜ | — | genel-yapı uyumu |
| MSG-CONT | MSG | Connector output → session continuity (reply = devam eden sohbet) | CX | P1 | MSG-1 | ⬜ | — | §3.4 |
| MSG-2 | MSG | Pairing-onay butonu wire (onCallback — G1 ertelenmiş) | A·CL | P1 | APR-2 | ⬜ | — | gateway-daemon.ts:87-90 |
| MSG-3 | MSG | WhatsApp connector (dormant → wire / ADR-G-007 amend) | MP·CL | P1 | — | ⬜ | — | CONN-W1 |
| BOT-2d | MSG | Bounded multi-turn bot chat-memory + Discord/WhatsApp delivery verify | MP | P1 | — | ⬜ | — | — |
| MCP-1 | MCP | MCP server-client sığ→enterprise olgunlaştırma (umbrella) | A | P1 | — | 🟡 | — | server-client devam |
| F9-001 | MCP | McpClientBroker → live REPL/chat wire (0-caller) | MP | P1 | — | ⬜ | — | default-OFF |
| F9-002 | MCP | Dynamic external-tool discovery + namespaced registration + shadow/override policy | MP·CX | P1 | F9-001 | ⬜ | — | §3.2 shadow |
| F9-003 | MCP | External MCP trust/approval gate (RBAC + risk + audit) | MP·CL | P1 | APR-1 | ⬜ | — | no auto-approve |
| AS5-P2 | MCP | Worker-surface MCP injection + IPC→broker + RBAC non-leak | MP | P2 | — | ⬜ | — | — |
| AS5-P3 | MCP | Remote MCP over HTTP + OAuth + per-tenant + dashboard page | MP | P2 | — | ⬜ | — | enterprise |
| DESK-CHAT | DESK | Chat → Desktop-app tarafına (dashboard-chat değil) | A | P2 | DESK-1 | ⬜ | — | eski CHAT-A reframe |
| DESK-1 | DESK | App (Desktop+Mobile, Electron) + real-time interactive dashboard (non-coder) | MP·A | P2 | DASH-1 | ⬜ | — | CC-Desktop vizyonu; terminal-sonrası |
| FB-1 | DESK | Opt-in self-operation feedback loop (ships OFF, telemetri) | MP | P2 | DESK-1 | ⬜ | — | §16 SP-4; gizlilik-kritik |
| ENT-T1 | ENT | "Theater" temizliği: rbac_roles + rate_rules enforce-or-remove | CL | P2 | — | ⬜ | — | §7.3 no-op |
| ENT-T2 | ENT | enforce_rbac manuel-sprint spawn path'ine bağla (autonomous-only) | CL | P2 | — | ⬜ | — | §7.4 |
| ENT-GATEWAY | ENT | Tek Enterprise Policy Gateway (API+MCP+connector+process+autonomous tek enforcement) | CX | P2 | — | ⬜ | — | §5.5 unification |
| ENT-ROLLOUT | ENT | Read-only L0/L1 rollout-first (write/execute L3+ onaylı+audit'li) | CX | P2 | — | ⬜ | — | §5.5 |
| ENT-1 | ENT | Hard-enforced RBAC (sprint worker-spawn path) | MP | P2 | ENT-T2 | 🟡 | — | Task.requirements plumbing |
| ENT-2 | ENT | Hard multi-tenancy (real actor.tenantId e2e) | MP | P2 | — | 🟡 | — | — |
| ENT-3 | ENT | Audit immutability (durable signed sink + retention wire) | MP | P2 | — | 🟡 | — | hash-chain var |
| ENT-5 | ENT | SSO/OIDC gerçek-IdP smoke + SIEM network transports | MP | P2 | — | 🟡 | — | JWKS+PKCE landed |
| F8-003 | ENT | Capability least-privilege grant-set actor.role'den türet+enforce | MP | P2 | — | 🟡 | — | — |
| ERP-1 | ENT | ERP write-side (AYRI ARC; CompiledMutation + write-driver + sert approval) | MP | P2 | APR-1 | ⏸️ | — | post-beta; IFS test-ortamı |
| ERP-2 | ENT | IFS gerçek round-trip (test-ortamı creds + entity/projection map) | MP | P2 | — | ⏸️ | — | read-side ✅ |
| SCALE-1 | ENT | Million-scale (RemoteTokenAuth+mTLS+HSM+Redis-cluster) | MP | P2 | — | ⬜ | — | sub-#3 |
| SCALE-2 | ENT | Distributed agent mesh (cross-node schedule + shared mem/lock) | MP | P2 | — | ⬜ | — | — |
| SEC-1 | ENT | Sub-#2 self-security (prompt/command guard + planner state-hygiene) | MP | P1 | — | ⬜ | — | — |
| WM-5 | GOV | Provider-free hard-enforcement (CLAUDE_AUTH guard + flag-leak) | MP | P1 | — | 🟡 | — | high-risk parça |
| LAYER-1 | GOV | core→cli/orchestra inversiyon temizliği (CORE-W1+ORCH-W1+API-W1+ADR-D-004-W) | MP | P1 | — | ⬜ | — | logic core'a, yüzey thin |
| DORMANT-1 | GOV | Kablosuz güvenlik wire (cascade-detector+spawn-safety+sandbox.ts) | MP·CL | P1 | — | ⬜ | — | 🔴 |
| DORMANT-2 | GOV | No-op config-knob temizliği wire-or-remove (CORE-W4+ADR-G-012-W) | MP·CL | P1 | — | ⬜ | — | ayar-dürüstlüğü; CONFIG-CUSTOMIZE honesty |
| DORMANT-3 | GOV | Duplikat/dormant disposition (RateLimiter×3/12-orchestra-mod/cli-helpers) | MP | P1 | — | ⬜ | — | — |
| DEADMOD | GOV | 4 zero-caller-ama-dökümanlı modül WIRE-vs-KES (design pass) | MP | P1 | — | ⬜ | — | — |
| COMM-2 | GOV | Tipli Brain-aracılı worker-mesaj vocabulary (DEPENDENCY_REQUEST...) | MP | P1 | — | ⬜ | — | COMM-1 v0 ✅ |
| ADR-GOV | GOV | ADR-türevi -W tutarlılık şemsiyesi (yeni-G/D şema): ADR-002-W·D-004-W·G-012-W·LOCALE-W·ROUTE-V1-PURGE(028) + tracked 064-W/066-W/087-W | MP | P1 | — | ⬜ | — | governance-dürüstlük |
| ADR-LAYER | GOV | ✅ 4-katman taksonomi (ADR-G/D/UG/UP, G>U>D) CANLI; KALAN: UG/UP user-ADR-authoring (ilk-user basit, NL komut+sohbetle genişler) | A | P1 | — | 🟡 | 2026-06-30 | ADR-G-019; taxonomy✅, user-authoring bekliyor |
| ADR-REVISION | GOV | ✅ 89→41 re-review/renumber/migration + 41-ADR content-refinement DONE (2026-06-30); değişim YALNIZ Alperen-onayı | A·MP | P1 | — | ✅ | 2026-06-30 | sistem-side ✅ + content-side ✅ (quality-audit + surgical-refine); ADR-G-019 |
| AEGIS-RD | GOV | AEGIS ADR'yi Deckent-özel global-uygulanabilir agentic metoda yeniden tasarla | A | P2 | ADR-REVISION | ⬜ | — | "uzun/saçma" |
| GOV-GATE | GOV | Per-sprint "ilk-user için daha kolay mı?" zorunlu gate + first-run-path LIVE test | CX | P1 | — | ⬜ | — | §12.4 metodoloji |
| GOV-CROSSWALK | GOV | MASTER-PLAN eski-ID→yeni-ID crosswalk (residual) | CX | P2 | — | ◑ | — | büyük ölçüde reframe'de |
| WATCH-W | GOV | Backend-agnostik watch + CLI/MCP parity + per-worker backend | MP | P1 | — | ⬜ | — | docker logs-f/tmux/subprocess |
| WM-2 | GOV | 5 TaskType enum → tek SSOT | MP | P1 | — | 🟡 | — | — |
| WM-3 | GOV | EnvironmentType non-code domain | MP | P2 | — | 🟡 | — | — |
| WM-4 | GOV | RequirementProfile consume | MP | P2 | — | 🟡 | — | — |
| GODOBJ | GOV | God-object split (result-evaluator/auditor/server/doctor) | MP | P2 | — | ⬜ | — | — |
| PERF-LOCAL | PERF | Local RAM/worker dengesi optimize (kullanıcı kendi sistemi, autonomous) | A | P1 | — | ⬜ | — | — |
| PERF-VPS | PERF | VPS/VDS ideal-operation akışları | A | P1 | — | ⬜ | — | — |
| PERF-1 | PERF | Cold-start <500ms (lazy-load + cache lazy-loader) | MP | P1 | — | ⬜ | — | ~2s bugün |
| PERF-2 | PERF | Memory V2 query index + worker-spawn <3s SLA | MP | P1 | — | ⬜ | — | MEM-3 |
| PERF-5 | PERF | Coverage upward-ratchet | MP | P1 | — | ⬜ | — | — |
| PERF-3 | PERF | OpenTelemetry/Prometheus self-hosted (never-calls-home) | MP | P2 | — | ⬜ | — | — |
| PERF-4 | PERF | GPU/VRAM detection (local-model concurrency) | MP | P2 | — | ⬜ | — | — |
| DOC-1 | DOCS | Docs perfection (cookbook/EN-guide/diagrams/benchmark/threat-model) | MP | P1 | — | 🟡 | — | threat+adr-index ✅ |
| DOC-PKG-1 | DOCS | Shipped README doc-links 404 fix | MP | P1 | — | ⬜ | — | — |
| GITIGN-RT | DOCS | `.deckent/` runtime-state tracked → git rm --cached | MP | P1 | — | ⬜ | — | public-repo churn |
| DOC-2 | DOCS | README badge/module-count + MCP-desc i18n | MP | P2 | — | ⬜ | — | — |
| DOC-35 | DOCS | MCP tool-count drift code-derived | MP | P2 | — | ⬜ | — | — |
| I18N-6 | I18N | 6-dil i18n (en/tr/zh + 3 popüler) + sıfır-hardcode (catalog + getMessage sweep + add-a-language) | A·MP | P2 | — | ⏸️ | — | AS3-1/2/3 birleşik; ASLA hardcode |
| AS7-1 | OFFLINE | Global `offline` config + `--offline` (skip-all-network + assert) | MP | P2 | — | ⬜ | — | data-sovereignty |
| AS7-2 | OFFLINE | Offline ollama-only enforce + host-backend default | MP | P2 | — | ⬜ | — | — |
| AS7-3 | OFFLINE | Offline install bundle (deckent+deps+ollama+model) | MP | P2 | — | ⬜ | — | — |
| AS7-4 | OFFLINE | Air-gap conformance test (zero-outbound) + on-prem package | MP | P2 | — | ⬜ | — | — |
| APP-1 | SDK | Agentic Process Protocol (APP): protokol + SDK topluluk-hediyesi (MCP gibi) | A | P2 | SDK-1 | ⬜ | — | geç-madde; hem protokol hem SDK |
| SDK-1 | SDK | Deckent embed-engine SDK (src/sdk + transport-swappable client) | MP | P2 | — | ⏸️ | — | §17 spec yazıldı |
| MODULARIZE | SDK·ENT | deckent-solo / deckent-enterprise iki-katman iki-lisans (ADR-revizyonundan SONRA) | A·MP | P2 | ADR-REVISION | ⏸️ | — | MOD-SPLIT; SDK-seam ile |
| DESK-2 | LAUNCH | App productization (Electron CC-Desktop; terminal+chat+connector) | A | P2 | DESK-1 | ⬜ | — | — |
| GA-1 | LAUNCH | `npm publish` (manual by Alperen) | MP | P1 | — | ⬜ | — | gate-of-record |
| GA-2 | LAUNCH | Public product-repo flip + sensitive-scrub + monorepo/split kararı | MP | P2 | — | ⬜ | — | §16 SP-6; SP-2-arşiv ÖNCE |
| GA-3 | LAUNCH | .github essentials + landing + demo + final npm-name | MP | P2 | — | ⬜ | — | — |
| HUB-1 | LAUNCH | DeckentHub backend live (registry.deckent.dev) + moderation | MP | P2 | — | ⬜ | — | — |
| PB-1 | LAUNCH | Voice (STT/wake/TTS) — 10K-star gate | MP | P2 | — | ⏸️ | — | post-beta |
| PB-3 | LAUNCH | AEGIS methodology Phase-1 (AEGIS-RD'den sonra) | MP | P2 | AEGIS-RD | ⏸️ | — | post-beta |
| ROLE-GUARD | MOAT·GOV | Brain/orchestrator kod-yazamaz — pid/role guard (tool-enforce) | ADR-rev | P1 | TOOL-1 | ⬜ | — | ADR-G-020/021 |
| ROUTE-V1-PURGE | PROV·GOV | V1 routing TAMAMEN sil (DecisionOrchestrator+config+test+ref, izi-bile-kalmasın) | ADR-rev | P1 | — | ⬜ | — | ADR-G-006 |
| DEP-TOOL | TOOL | Dependency analiz/öneri/kontrol/düzenleme toolu (terminal-trackable, DIRECTIVES-bağımsız) | ADR-rev | P0 | TOOL-1 | ⬜ | — | ADR-G-026; DIRECTIVES kalkınca kritik |
| BRAIN-FAILOVER | MOAT·PROV·APR | Brain-crash provider-failover (Claude→OpenAI) + auditor-onay + nervous + escalation(otonom→retry→kill) | ADR-rev | P1 | — | ⬜ | — | ADR-G-025 |
| WORKER-LIVE-TRACE | TERM·DASH·TRN | Per-worker canlı durum (dashboard/terminal/CLI/MCP, insan+sistem, canlı+snapshot) | ADR-rev | P0 | TERM-LIVE | ⬜ | — | ADR-G-025; .log yetersiz |
| BRAIN-SELFUPDATE | PROV·MOAT | Brain provider/model-agnostik kayıpsız self-update (bugün Claude, yarın GPT-5.5) | ADR-rev | P1 | — | ⬜ | — | ADR-G-025/008 |
| BRAIN-DEATH-PROC | MOAT·APR | Brain-death fallback/retry sistem+user adımları + `finalize --force` trigger + tool | ADR-rev | P1 | — | ⬜ | — | ADR-G-025; finalize-force-orphan |
| LEARNINGS-QUALITY | MEM·MOAT | Brain Learnings/Gains gerçek-öğrenilmiş-içerik (yarım-değil), aranabilir; dogfood+user | ADR-rev | P1 | — | ⬜ | — | ADR-G-035/032 |
| EVOLUTION-SELECTIVE-SCALE | MOAT·MEM·PERF | Evolution-loop yalnız KULLANILAN agent/skill'i güncelle (toplu-değil) + 300-agent/1000-skill ölçek | ADR-rev | P1 | — | ⬜ | — | ADR-G-032; basic-ilk-hata |
| TASKTYPE-EXPAND | MOAT·GOV | Daha fazla TaskKind (db-migration/package-publish/infra/security) + user-custom (UG/UP) | ADR-rev | P1 | — | ⬜ | — | ADR-G-028 |
| NERVOUS-GENERALIZE | MODE·GOV | Nervous action-vocab language/proje-agnostik (NPM_PUBLISH→PUBLISH; python/c++/any) | ADR-rev | P1 | — | ⬜ | — | ADR-G-022 |
| NERVOUS-NONBLOCK | MODE·MOAT | Nervous-enabled non-blocking + kontrollü-aktivasyon (fs.watch/CPU + approval-block fix) | ADR-rev | P1 | — | ⬜ | — | ADR-G-022 |
| NERVOUS-ENTERPRISE | ENT | Nervous = enterprise-katman proaktif-governance/control gücü; kontrollü-rollout | ADR-rev | P2 | — | ⬜ | — | ADR-G-022 |
| AUTH-MULTIMODE | GOV·MODE | Authority-matrix TÜM modlar + global/proje path-scope + per-mode rol/akış/continuation | ADR-rev | P1 | — | ⬜ | — | ADR-G-020 |
| AUTH-USER-CUSTOM | GOV·ENT | User-customize authority-matrix (ADR-UG/UP; G-baseline inviolable, G>U>D) | ADR-rev | P2 | — | ⬜ | — | ADR-G-020 |
| ENFORCE-GENERALIZE | GOV·ENT | RBAC enforcement dogfood-only→user-side genelleştir (lint:adr/authority-enforcer) | ADR-rev | P2 | — | ⬜ | — | ADR-G-020 |
| POLICY-ENGINE-EVAL | GOV·ENT | Centralized policy-engine (OPA/Rego veya embedded) RE-EVAL (ADR-D-005-dogma, eski-010, kalktı) | ADR-rev | P2 | — | ⬜ | — | ADR-G-019/020 |
| MODE-RENAME | TERM·MODE·GOV | "sprint" → user/enterprise/dev/teams evrensel-kavram (run/job/mission...) | ADR-rev | P1 | — | ⬜ | — | ADR-G-024; sürekli-hatırlatma |
| AUTO-NAMING | TERM·MODE | "mode auto"(detect) vs "autonomous engine"(motor) adlandırma-çakışması netleştir | ADR-rev | P2 | — | ⬜ | — | ADR-G-024 |
| ADR-067-TENANT | ENT | TenantContext-threading wire-ya-amend (resolveTenant 0-caller; strict_tenant+kolon canlı) | ADR-rev | P2 | — | ⬜ | — | ADR-G-024 |
| ENT-REPO-STRATEGY | ENT·LAUNCH | Enterprise-repo (deckent açık + deck-ent private?) + tek-repo→bir-kerelik-migration | ADR-rev | P2 | — | ⬜ | — | ADR-D-008; geri-dönülmez |
| CODE-LAYERS | ENT·GOV·ARCH | 5-katman kod-mimarisi (deckent-core → deckent-custom) — ayrı tartışma | ADR-rev | P2 | — | ⬜ | — | ADR-G-016/D-008 |
| MANAGED-DOCS-MINIMIZE | DOCS | Auto-md-update'i NECESSARY-docs'a indir; user-projede deckent-yazmaz (track-only) | ADR-rev | P1 | — | ⬜ | — | ADR-G-015 |
| DECKENT-LOG | DOCS·MODE | sprint-log → deckent-log rename + multi-mode (task/process/autonomous/flow/mission) | ADR-rev | P1 | — | ⬜ | — | ADR-G-015/024 |
| CONFIG-CUSTOMIZE | ONB·TERM·GOV | Custom-tier + NL-terminal TÜM-ayar customize (ONB-CHAT) + her config-knob KODDA-gerçek | ADR-rev | P1 | — | ⬜ | — | ADR-G-012; DORMANT-2 honesty |
| ADR-064-W | MOAT·GOV | `planDispatch` wire — **🔴 SOMUT DİVERGENCE bulundu:** model(planContinuous: DONE+fix-aggregate, MRR-yok, collision-yok) ↔ runtime(respawnEligibleTasks: DONE∪MRR+collision-graph, fix-aggregate-yok). Wire = 3-semantik (MRR+fix-agg+collision) tek-superset reconcile + 246-satır execution(event/metric/adaptive-timeout/checkpoint/throttle/host-adapter)-rewrite. Olduğu-gibi-wire MRR-unblock(S280)+collision REGRESSE eder. **Dedicated scheduler-correctness task + tam dispatch-test şart.** | ADR-rev | P1 | — | ⬜ | — | ADR-G-026; interim comment-fix done (f68c8595) |
| ADR-066-W | PROV·GOV | `?? 'claude'` drift 3→9 → re-audit + getDefaultProviderName konsolide | ADR-rev | P1 | — | ⬜ | — | ADR-G-008; WM-5 |
| ADR-087-W | GOV | Residual ~15 spawnSync (auditor.ts) → async-spawn migration | ADR-rev | P1 | — | ⬜ | — | ADR-D-002 |
| GOCRIT-USERFEAT | TOOL·MODE | Per-task goNogo/goCriteria üretimini hard-coded yerine USER-FACING parametrik özellik (per-task/per-work kriter-üretimi) | A | P2 | — | ⬜ | — | memory-merge: 06-19 gözlem, planner-çıktısı çok temiz+başarılı |
| ADR-002-W | GOV·DOCS | Node16→nodenext tsconfig migration + Node-18-reference purge (Node-24+ sweep) | ADR-rev | P2 | — | ⬜ | — | ADR-D-001 tomorrow |
| LOCALE-W | GOV·I18N | Instruction-file adapter locale-leak fix (pure-adapter, per-doc lang) — ADR-013-W + ADR-029-W | ADR-rev | P1 | — | ⬜ | — | ADR-G-004/G-015; I18N-6 bağ |
| MEM-VECTOR | MEM | Memory vector-layer (sqlite-vec opt-in, never-calls-home) semantic-recall | ADR-rev | P2 | MEM-3 | ⬜ | — | ADR-G-035 tomorrow |
| SELFMOD-W | GOV·MOAT | Self-modify detection P1-P3 rollback-guard wire-ya-formalize + global-install discrimination | ADR-rev | P2 | ROLE-GUARD | ⬜ | — | ADR-G-021 tomorrow (P1-P3 dormant) |

---

## ADR Traceability — 41 ADR → MASTER-PLAN izi (2026-06-30)

> Her aktif ADR'in **tomorrow/roadmap**'i bir MASTER-PLAN item'ına bağlı **VEYA** ✅ current-state (pending-iş yok). **Coverage = %100** (gap'ler ADR-002-W·LOCALE-W·MEM-VECTOR·SELFMOD-W ile kapatıldı). ADR-içerik = `docs/adr/adr-g|d-NNN-*.md`; karar-kaydı = `.analysis/adr-review-crosswalk.md` · özet [[project_adr_taxonomy_redesign_2026_06]].

### ADR-G (34 — anayasa/runtime, immutable, user+dogfood)
| ADR · konu | MASTER-PLAN izi |
|---|---|
| G-001 Layered-Config&Scope | CFG-1 · ONB-GLOBAL · CONFIG-CUSTOMIZE |
| G-002 spawnSync-Security | SPAWN-1 · WM-5 (enforce→runtime) |
| G-004 Instruction-Adapter/Multi-Env | LOCALE-W · I18N-6 |
| G-005 Secret-FS | ✅ current-state |
| G-006 Routing&Selection | ROUTE-1 · ROUTE-V1-PURGE · PROV-MATRIX |
| G-007 Messaging-Connectors | MSG-1/2/3 |
| G-008 Provider-Abstraction/Fleet | PROV-* · F1-* · ADR-066-W · AS2/AS4 |
| G-009 Eval-Integrity | MOAT-3 · proof-of-function (≈✅) |
| G-010 Output/Terminal-UX/Brand | TERM-5 · TERM-LIVE |
| G-011 Surface-Parity | PARITY-1 · LAYER-1 · WATCH-W |
| G-012 Plan-Tier/Config-Customize | CONFIG-CUSTOMIZE · CFG-1 · DORMANT-2 |
| G-013 Graceful-Shutdown/Lifecycle | MOAT-2 · MF-9 |
| G-014 Spawn-Backend/Observation | ORCH-BE · MOAT-ISO · WATCH-W · WORKER-LIVE-TRACE |
| G-015 Managed-Docs/Tracking | MANAGED-DOCS-MINIMIZE · DECKENT-LOG |
| G-016 Product-Vision | MODULARIZE · CODE-LAYERS · MOD-SPLIT-CLARIFY |
| G-017 Multi-Project-Isolation | TOOL-SCOPE · ENT-2 |
| G-018 Verification/Event-Stream | COMM-2 · TERM-LIVE · APR-* |
| G-019 ADR-Governance/4-Layer | ADR-LAYER · ADR-REVISION (≈✅ sistem-side) |
| G-020 Authority/Roles/Enforcement | AUTH-MULTIMODE · AUTH-USER-CUSTOM · ENFORCE-GENERALIZE · POLICY-ENGINE-EVAL · ROLE-GUARD |
| G-021 Self-Modify-Detection | ROLE-GUARD · SELFMOD-W |
| G-022 Nervous-System | NERVOUS-GENERALIZE · NERVOUS-NONBLOCK · NERVOUS-ENTERPRISE |
| G-023 Agent/Skill-Taxonomy | AGSK-1 |
| G-024 Mode-Architecture | MODE-RENAME · AUTO-NAMING · ADR-067-TENANT · DIR-2 · MODE-2 |
| G-025 Resilience/Recovery/LiveObs | BRAIN-FAILOVER · WORKER-LIVE-TRACE · BRAIN-SELFUPDATE · BRAIN-DEATH-PROC |
| G-026 Dependency-Wave | DEP-TOOL · ADR-064-W |
| G-027 Prompt-Lifecycle/Worker-Ctx | WP-OPT · F1-PCACHE |
| G-028 Work-Taxonomy | TASKTYPE-EXPAND · WM-2 |
| G-029 Embedded-Web-Terminal | ✅ done; DESK-1 · TERM-RPC (tomorrow) |
| G-030 Consent-Provisioning/Install | ONB-CHAT · ONB-1 · PSL-6 · ONB-GLOBAL |
| G-031 Enterprise-Foundation | ENT-* · ADR-067-TENANT · NERVOUS-ENTERPRISE |
| G-032 Self-Learning/Evolution | EVOLUTION-SELECTIVE-SCALE · LEARNINGS-QUALITY · EVO-2 |
| G-033 Dashboard-Observability | DASH-1 · DASH-PANELS · DASH-D3 |
| G-034 Native-Agentic-Terminal | TERM-NAT · TOOL-2 · F11-* · TERM-* |
| G-035 Memory-Architecture | ✅ schema-migration; MEM-2/3 · MEM-VECTOR · LEARNINGS-QUALITY |

### ADR-D (7 — dev/contributor, build-konvansiyonu)
| ADR · konu | MASTER-PLAN izi |
|---|---|
| D-001 Build-Baseline | ✅ done; ADR-002-W (nodenext) |
| D-002 Test-Infra/Hermeticity | ADR-087-W |
| D-004 Brain-Central-Import | LAYER-1 (D-004-W) |
| D-005 Dependency-Policy | ✅ reframe-done; POLICY-ENGINE-EVAL · F1-015 |
| D-006 Code-Architecture-Conventions | GODOBJ · DEADMOD · DORMANT-3 |
| D-007 Manual-Subagent-Dispatch | ✅ current-state; BRAIN-DEATH-PROC (G-025) |
| D-008 Develop/Product-Repo | ENTERPRISE-REPO-STRATEGY · GA-2 · MODULARIZE |

> Not: G-003 = ADR-G-020'ye absorbe (Brain role-sep, Kural-4); D-003 = boş (007→G-014); arşiv 005/009/038; sil 061 (→AEGIS-RD).

---

## Lossless-Map & Notlar
- **Tamamlanmış kilometre taşları** (✅ done-history): arşivde — eski §14 `[x]` maddeler (WM-1/F1-DF/012/014r/RE/CB/G/P, MF-1/2/3/8, ENT-4, F8-001/002, CORE-W5 read-side ERP, NERV-W1, WK-*, DASH-UX-1..8, DASH-RT-1/2, WP-1..20, REPL-TOOL+DEBT-1/2, MCP-W1, MODEL-GUARD, PLAN-W1, PLAN-INT-1, XVER-1, BOT-1, AUT-1..8/11, CORE-UNIFORMITY slice-1, last-standing 318-344).
- **Eski §15 arc-haritası** (ARC-A..M) + §16 native-agent + §17 SDK arşivde; yeni Pillar şeması stratejik-yön güncellemesidir (eski ID'ler Kaynak=MP ile taşındı).
- **§16 Native-Agent Program** → TERM (SP-1) + TRN (SP-2) + SDK/APP (SP-3) + FB-1 (SP-4) + GA-2 (SP-6 clean-repo).
- **BUILD-GATE bekleyenler** (Alperen build+`/mcp restart`→live-proof): worker token+cost Step-3, self-git-mutation fix, bot tool-surface+grup-butonu — ilgili Pillar'larda 🟡.
- **Bağlayıcı kurallar** (CLAUDE.md 🔒 + memory): no-MVP/god-level · `.brain/memory.db` silinmez · sprint'te build/login yok · sprint kill/cleanup + commit Alperen-onayı · disk-verify · proof-of-function · i18n-first.

*Single source of truth. Durum/tarih değişince burayı güncelle. Sıra sütunu önceliklendirme adımında eklenecek. Tam detay/done-history: `docs/archive/MASTER-PLAN-archived-2026-06-29.md`.*
