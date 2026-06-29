# ADR Review & Renumber Crosswalk (tek-tek interaktif)

> **Süreç:** Her ADR tek-tek analiz → Alperen kararı → kayıt. **Sınıf:** ADR-G (anayasa/runtime, immutable, user+dogfood) ·
> ADR-D (dev/contributor) · (deprecated → arşiv). **Numara:** sınıf-içi renumber (ADR-G-001.., ADR-D-001..) + bu crosswalk.
> **DB:** better-sqlite evrim (schema + FTS5; vector sonra opt-in). **Backup:** `.brain/memory.db.backup-2026-06-29` ✓.
> **Durum:** ⏳ bekliyor · 💬 öneri-sunuldu · ✅ karar-verildi.
> Karar verilince row güncellenir; tüm ADR'ler bitince → schema-migration + renumber + re-export + index-rebuild (build/restart gated).

## Önerilen G/D kriteri
- **ADR-G** = deckent ÇALIŞIRKEN nasıl davranır + ihlal-edilemez kanunlar (orchestration/güvenlik/eval/memory/izolasyon/capability/nervous/approval/proof-of-function). User'a gelir, kullanıcıyı etkiler.
- **ADR-D** = deckent NASIL İNŞA edilir (dil/test/build/kod-yapısı/runtime-dep). Yalnız contributor'a gelir.
- **deprecated** = arşiv (aktif G/D numarasına taşınmaz; tarihsel kayıt korunur).

## Karar Tablosu

| Eski | Başlık | Sınıf | Çakışma | Evrim önerisi | Yeni-No | Karar | Durum |
|---|---|---|---|---|---|---|---|
| 001 | TypeScript + ESM | D | HAYIR | **002 ile MERGE** → "Build Baseline (TS·ESM·Node24+·nodenext)" (Node-18-sweep + Node16→nodenext folded) | ADR-D-001 | ✅ onay (001+002 merge) | ✅ |
| 002 | Node16 Module Resolution | D | HAYIR | **ADR-001'e MERGE** (Build Baseline); Node16→nodenext (ADR-002-W) burada izlenir | →ADR-D-001 (merged) | ✅ merge | ✅ |
| 003 | vitest over Jest | D | HAYIR | merge-aday ADR-087 ile ("Test Infra"); şimdilik koru | ADR-D-002 | ✅ onay (087-merge-flag) | ✅ |
| 004 | Layered Config Merge | G | HAYIR (güçlendirir) | GENİŞLET → "Layered Config & Scope Precedence" (global-install+proje-scope + ADR G>U>D bağı) | ADR-G-001 | ✅ onay + genişlet | ✅ |
| 005 | Synchronous I/O (deprecated) | ARŞİV | HAYIR | superseded→ADR-087; aktif sete alınmaz, tarihsel kayıt | — (arşiv) | ✅ arşiv | ✅ |
| 006 | spawnSync Security Pattern | G | HAYIR | Koru + Windows-istisna SPAWN-1 sertleştir; **enforcement advisory→runtime (ADR-G engine + ADR-094 hard-flip)** | ADR-G-002 | ✅ onay + enforcement-notu | ✅ |
| 007 | SpawnOptions Interface | G | HAYIR | **ADR-G-014'e FOLD** (Spawn Backend, Options & Observation; 027 ile); D-003 düştü → G spawn-ADR alt-bölümü; güvenlik-yanı ADR-037 | →ADR-G-014 (merged) | ✅ fold | ✅ |
| 008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | D | HAYIR | import-yönü/kod-hijyeni; kalan-ihlal LAYER-1/ADR-008-W; **rol-ayrımı AYRILDI → ADR-G-003** | ADR-D-004 | ✅ onay (D; role-sep ayrı) | ✅ |
| 009 | DEBT.md Markdown Tablo (deprecated) | ARŞİV | HAYIR | deprecated→arşiv (auto-policy) | — (arşiv) | ✅ arşiv | ✅ |
| 010 | Tek Runtime Dependency → Dep Policy | D | HAYIR | **REFRAME → "Dependency Policy & Inventory (All Deps + Rationale)"**: minimal-kısıt KALK; full envanter + her-dep NEDEN-seçildi + alternatifler + güvenlik-disiplini (exact-pin/audited, Hermes dersi). DB-kararı merit-bazlı oldu. | ADR-D-005 | ✅ onay (REFRAME) | ✅ |
| 011 | node:readline Built-in Prompt | D | HAYIR | **ADR-D-005'e MERGE** (readline-builtin dep-gerekçesi); rich-UI zaten ADR-081/083/080 | →ADR-D-005 (merged) | ✅ merge | ✅ |
| 012 | register<Name>(program) Pattern | D | HAYIR | merge-aday ADR-024/026 ile ("Code Architecture Conventions"); şimdilik koru | ADR-D-006 | ✅ onay (024/026-merge-flag) | ✅ |
| 013 | DECKENT.md Adapter Pattern | G | HAYIR (destekler) | ADR-013-W (saf-adapter, locale-leak kök-fix) + global+proje scope genişlet → "Instruction-File Adapter Pattern" | ADR-G-004 | ✅ onay | ✅ |
| 014 | .deck Secret File System | G | HAYIR | global+proje scope genişlet; "Secret File System & Zero-Worker-Exposure" güvenlik-kanunu | ADR-G-005 | ✅ onay | ✅ |
| 015 | TaskRouter — 6-level routing | G | HAYIR | **028-merge** ("Routing & Selection"); routeTaskV2 → **öğrenen model/effort matrisi** (per-task-type metrik, auto-model-upgrade ör.opus4.9, vektör-seçim, proje+provider-scoped, user-yönetilebilir); ROUTE-1/PROV-MATRIX evrimi. **ADR today+tomorrow şeffaf.** | ADR-G-006 | ✅ onay (028-merge + learning-vision) | ✅ |
| 016 | External Messaging Connectors | G | HAYIR (güçlendirir) | "External Messaging Connectors & Integration Layer" — MSG-1/APR-2/pairing(onCallback)/WhatsApp(MSG-3) genişlet; today+tomorrow şeffaf | ADR-G-007 | ✅ onay (evrim kabul) | ✅ |
| 017 | MCP-Native Provider Adapters | G | HAYIR (güçlendirir) | merge-aday 066/077 ("Provider Abstraction & Fleet"); +023/093/027 bağlı; today=7-adapter+PSL, tomorrow=subs-paket/sözleşme-izleme/F1-AD | ADR-G-008 | ✅ onay (evrim) | ✅ |
| 018 | Multi-Environment Config Generation | G | HAYIR | **ADR-G-004'e MERGE** (Instruction-File Adapter & Multi-Env Generation); **bakım-yükü:** provider/ortam genişledikçe data/registry-driven generator (per-env hardcode değil) — düşük-bakım tasarla | →ADR-G-004 (merged) | ✅ merge (bakım-notu) | ✅ |
| 019 | Language-Agnostic Worker Verify | G | HAYIR (Law#2) | merge-aday ADR-070 ("Language-Agnostic Evaluation & Verify") + WM-7 eval-criteria formalize; today=18-stack, tomorrow=+stack/hard-enforce | ADR-G-009 | ✅ onay (070-merge-flag) | ✅ |
| 020 | Rich Sprint Output (multi-section) | G | ◑ KISMİ | merge-aday ADR-083 ("Output & Terminal UX"); pivot-hiza: terminal özet/canlı (TERM-LIVE), dashboard rich-detail; today+tomorrow | ADR-G-010 | ✅ onay (083-merge-flag + pivot-hiza) | ✅ |
| 021 | Kraken ASCII Brand Identity | G | HAYIR | **ADR-G-010'a MERGE** (Output+Terminal-UX+Brand); ADR-021-W (output_splash gerçek-gate/kaldır) | →ADR-G-010 (merged) | ✅ merge | ✅ |
| 022 | CLI/MCP Feature Parity | G | HAYIR (kritik destek) | "Surface Parity & Thin-Wrapper" — genişlet CLI≡MCP≡terminal/tool; LAYER-1 enforcement + WATCH-W; today+tomorrow | ADR-G-011 | ✅ onay | ✅ |
| 023 | Plan Tier Generalizasyonu | G | HAYIR | merge-aday 066/077 (Provider Abstraction & Fleet); **ortak/standart tier + custom tier + NL-terminal TÜM-ayar customize (ONB-CHAT) + kolaylık/tutarlılık + ayarlar KODDA-gerçek (DORMANT-2 honesty)**; CFG-1; today+tomorrow | ADR-G-012 | ✅ onay (066/077-merge + custom/NL/honesty) | ✅ |
| 024 | sprint-controller God Object Split | D | HAYIR | **ADR-D-006'ya MERGE** (026 ile, "Code Architecture Conventions"); **god-object sınırı = işlevsel-cohesion/doğru-sınır, LoC-dogma DEĞİL** (Hermes 15-18K LOC çalışıyor; uzun-dosya≠sorun, karışık-sorumluluk=sorun); GODOBJ boundary-bazlı | →ADR-D-006 (merged) | ✅ merge (boundary-principle) | ✅ |
| 025 | Graceful Shutdown Stratejisi | G | HAYIR | merge-aday 043/044 ("Lifecycle & Reliability"); MOAT-2 (ORPHAN-START-PROC) + ROLE-GUARD bağı; today+tomorrow | ADR-G-013 | ✅ onay (043/044-merge-flag) | ✅ |
| 026 | God Object Split Stratejisi | D | HAYIR | **ADR-D-006'ya MERGE** (012+024+026 "Code Architecture Conventions"); boundary=işlevsel-cohesion (LoC-dogma değil); MOD-SPLIT forward-link (MODULARIZE) | →ADR-D-006 (merged) | ✅ merge | ✅ |
| 027 | Hybrid Spawn Backend | G | ◑ KISMİ→restate | **ADR-G-014 "Spawn Backend, Options & Observation"** (007 fold + 089 merge); restate: rol-mix-red KORU + per-worker heterojen backend KUCAKLA (ADR-089/ORCH-BE/MOAT-ISO + firecracker/k8s); today+tomorrow | ADR-G-014 | ✅ onay (restate) | ✅ |
| 028 | Decision-Engine V1→V2→V3 Routing | G | HAYIR | **ADR-G-006'ya MERGE**; **V1 TAMAMEN SİL (izi-bile-kalmayacak): DecisionOrchestrator + v1-config + V1-testleri + manifest-entry + tüm-ref**; V2 yetersiz→**V3 planlı** (öğrenen routing=ROUTE-1+); ADR-028-W = manifest-entry-DELETE | →ADR-G-006 (merged) | ✅ merge (V1-purge + V3) | ✅ |
| 029 | Managed-Docs Universalization | G | ◑→reframe | **ADR-G-015 "Managed-Docs (Core-Gen) + Tracking/Staleness"** (030/031/032 absorb; merge-aday ADR-090); **REFRAME: minimal auto-gen YALNIZ deckent-core; user-projede deckent doc YAZMAZ → AI-tools yönetir, deckent staleness-track (ADR-090); sprint-log→deckent-log multi-mode**; ADR-029-W/013-W locale-fix | ADR-G-015 | ✅ onay (reframe) | ✅ |
| 030 | Template Engine + Plugin Loader | G | HAYIR | **ADR-G-015'e MERGE** (managed-docs pipeline); MJS-loader latent-security (wired-değil) → wire edilirse SkillSandbox şart | →ADR-G-015 (merged) | ✅ merge | ✅ |
| 031 | Content Hash Cache | G | HAYIR | **ADR-G-015'e MERGE** (managed-docs cache; dual-key + sprint-dim) | →ADR-G-015 (merged) | ✅ merge | ✅ |
| 032 | i18n Pattern System | G | ◑ | **ADR-G-015'e MERGE** (managed-docs i18n-layer); Layer-2 locale-leak (per-doc lang, ADR-032/029-W); cross-ref I18N-6 (6-lang) | →ADR-G-015 (merged) | ✅ merge | ✅ |
| 033 | Product Vision — Product Not Service | G | ◑→reconcile(a) | **ADR-G-016 kurucu vizyon**; reconcile-(a): 4-ilke korunur + opsiyonel-katmanlar (enterprise-modül/opt-in-hosted-core[BYO-default]/local-first-app/console/opt-in-telemetri) çekirdek-garantisini bozmadıkça izinli; **community-core=TÜM özellik (hep korunur); enterprise=AYNI işlev, fark=katı kontrol/disiplin/audit/governance/management (feature-gating DEĞİL)**; geliştikçe netleşir | ADR-G-016 | ✅ onay (a + core/ent-clarification) | ✅ |
| 034 | Multi-Project Isolation | G | HAYIR (güçlendirir) | 4-izolasyon-katman (directory+AES-cred-enc+symlink-scope+config-boundary); multi-project≠multi-tenant; today=advisory-scope, tomorrow=hard-enforce(ADR-037-V2/TOOL-SCOPE)+enterprise-multi-tenancy(modüler) | ADR-G-017 | ✅ onay | ✅ |
| 035 | Verification Protocol Standard | G | HAYIR (omurga) | merge-aday ADR-037 ("Protocol & Authority"); dual (file+event-stream) KALICI fail-safe + event-stream kanonik-okuma; APR/COMM-2 genişletir; naming-fix (PROGRESS bare-code); today+tomorrow | ADR-G-018 | ✅ onay (037-merge + dual-kalıcı) | ✅ |
| 036 | ADR Governance Integration | G | HAYIR | **ADR-G-019 (meta-governance EVİ)** — yeni 4-sınıf taksonomi + precedence G>U>D + ADR-AUTHORING-STD + ADR-G-enforcement (immutable/publisher-fed) + ADR-U-NL-management buraya; today+tomorrow | ADR-G-019 | 💬 öneri-sunuldu (YARIN karar) | 💬 |
| 037 | Authority Matrix — RBAC V1.0 | ⏳ | | | | | ⏳ |
| 038 | Dead Code Disposition | ⏳ | | | | | ⏳ |
| 039 | Self-Modifying Task Detection | ⏳ | | | | | ⏳ |
| 040 | Nervous System Architecture | ⏳ | | | | | ⏳ |
| 041 | Agent Taxonomy (Horizontal/Vertical) | ⏳ | | | | | ⏳ |
| 042 | Hybrid Mode (Sprint+Task) | ⏳ | | | | | ⏳ |
| 043 | Brain Crash Recovery Protocol | ⏳ | | | | | ⏳ |
| 044 | Sprint State Observability Contract | ⏳ | | | | | ⏳ |
| 045 | Wave-Based Execution Semantics | ⏳ | | | | | ⏳ |
| 046 | Brain Self-Update Hook | ⏳ | | | | | ⏳ |
| 047 | Manuel Subagent Dispatch Protocol | ⏳ | | | | | ⏳ |
| 048 | Prompt Lifecycle Contract | ⏳ | | | | | ⏳ |
| 053 | TaskType Taxonomy | ⏳ | | | | | ⏳ |
| 055 | Hybrid Scoring 5-Layer (proposed) | ⏳ | | | | | ⏳ |
| 060 | Self-Awareness Propagation (proposed) | ⏳ | | | | | ⏳ |
| 061 | AEGIS Methodology (proposed) | ⏳ | | | | | ⏳ |
| 062 | Embedded Web Terminal | ⏳ | | | | | ⏳ |
| 063 | Consent-Based Prerequisite Provisioning | ⏳ | | | | | ⏳ |
| 064 | TOPP — Continuous Dispatch | ⏳ | | | | | ⏳ |
| 065 | Develop / Product Two-Repo Split | ⏳ | | | | | ⏳ |
| 066 | Provider Independence | ⏳ | | | | | ⏳ |
| 067 | Process Mode + Tenant (proposed) | ⏳ | | | | | ⏳ |
| 068 | Enterprise Foundation | ⏳ | | | | | ⏳ |
| 069 | Event-Driven Triggers + RBAC | ⏳ | | | | | ⏳ |
| 070 | Brain Evaluation Integrity | ⏳ | | | | | ⏳ |
| 071 | F3 Autonomous + F4 RBAC/Tenant | ⏳ | | | | | ⏳ |
| 072 | Agent Routing Balance | ⏳ | | | | | ⏳ |
| 073 | Routing Live Validation + FIX Prompt | ⏳ | | | | | ⏳ |
| 074 | Native Chat + Enterprise + F5 | ⏳ | | | | | ⏳ |
| 075 | F5 Evolution Wiring + Affinity | ⏳ | | | | | ⏳ |
| 076 | Auth-Precedence Fix + Surfaces | ⏳ | | | | | ⏳ |
| 077 | Multi-Provider 8-Fleet | ⏳ | | | | | ⏳ |
| 078 | CI-Hermeticity Standard | ⏳ | | | | | ⏳ |
| 079 | Proof-of-Function DoD | ⏳ | | | | | ⏳ |
| 080 | Dashboard God-Level | ⏳ | | | | | ⏳ |
| 081 | Native Agentic Deckent | ⏳ | | | | | ⏳ |
| 082 | Native-LLM-Wire + Nervous | ⏳ | | | | | ⏳ |
| 083 | REPL-UX-Evolution + Provider-Parity | ⏳ | | | | | ⏳ |
| 086 | Native CLI Parity (F11) | ⏳ | | | | | ⏳ |
| 087 | Async I/O & Test Hermeticity Standard | ⏳ | | | | | ⏳ |
| 088 | Memory V2 — DB-First Architecture | ⏳ | | | | | ⏳ |
| 089 | Backend-Agnostic Worker Observation | ⏳ | | | | | ⏳ |
| 090 | Documentation Tracking & Staleness | ⏳ | | | | | ⏳ |
| 091 | Project-Scoped Messaging Gateway | ⏳ | | | | | ⏳ |
| 092 | Connector Social Identity RBAC | ⏳ | | | | | ⏳ |
| 093 | Real Token/Cost Capture | ⏳ | | | | | ⏳ |
| 094 | Flag-Gated Enforcement Vein | ⏳ | | | | | ⏳ |

> **Not:** Aralarda boş numaralar (009 sonrası 049-052/054/056-059/084-085 yok) — silinmiş/atlanmış; crosswalk yalnız mevcutları taşır.
> Deprecated (005, 009) + proposed (055, 060, 061, 067) ayrı ele alınır (arşiv / kabul-ya-da-düşür).
> **Drift bulguları (re-export/index fazında düzelt):** `046` ÇİFT dosya (`-architecture.md` + `-hook.md`) → tekle; `091` (Project-Scoped Messaging Gateway) `docs/adr/`'de YOK (memory.db'de var) → export et.

## Yeni Doğan ADR'ler (review sırasında — eski-no yok)
| Yeni-No | Başlık | Sınıf | Kaynak | Not |
|---|---|---|---|---|
| ADR-G-003 | Brain Role Separation — Orchestrator, Never Code-Author | G | Alperen (008-review) | Brain plan/dispatch/evaluate; kodu worker/AI-tool yazar (deckent-terminal AI-tool ile çalışır). tool+pid enforce. ADR-039(self-modify)+ADR-037(authority) bağ. |

## Doğan İş-Kalemleri (→ MASTER-PLAN batch, review sonu)
- **ROLE-GUARD** (ADR-G-003 enforcement): Brain/orchestrator-process **kod yazamaz** — pid/process-role guard; yazım worker/AI-tool'a. ADR-039 self-modify + git-self-mutation guard üstüne. [MOAT/GOV · P0-aday]
- **ROUTE-1+ (öğrenen routing = Routing V3; V2 yetersiz, V3 hedef):** routeTaskV2 → öğrenen model/effort atama matrisi: per-task-type outcome-metrik (success/kalite/cost/latency) → matris auto-update; yeni-model auto-adopt (opus4.9>4.8, F1-AD); vektör-seçim (task-kind×cost×latency×risk×provider-health×outcome); proje+provider-scoped + user-yönetilebilir + force-* korunur. ROUTE-1+PROV-MATRIX+outcome-tracker+F5+F1-AD birleşik (Codex §12.3 ModelPolicyEngine). [PROV/MOAT · kritik]
- **ROUTE-V1-PURGE:** V1 routing (DecisionOrchestrator) TAMAMEN sil — kod + `routing_engine:'v1'` config + V1-testleri + features-manifest entry + tüm ref; "izi bile kalmayacak" (kapsamlı orkestrasyonda V1 kabul-edilemez). [GOV/PROV]
- **DECKENT-LOG:** `sprint-log` → **`deckent-log`** rename + multi-mode (task/process/autonomous/flow/mission/sprint — yalnız-sprint değil). [MODE/DOCS]
- **MANAGED-DOCS-MINIMIZE:** auto-md-update'i NECESSARY-docs'a indir; **user-projede project-specific auto-update YOK** (deckent yazmaz, AI-tools yönetir; deckent ADR-090 staleness-track). [DOCS]
- **MOD-SPLIT-CLARIFY:** community↔enterprise sınırı = **governance/audit/management DERİNLİĞİ, feature-gating DEĞİL**. deckent-core=TÜM işlev (hep korunur+geliştirilir); enterprise=aynı işlev + daha katı kontrol/disiplin/denetim/yönetim. (ADR-G-016 amendment + MODULARIZE) [ENT/GOV]
- **CODE-LAYERS (🆕 AYRI tartışılacak):** kod-mimarisi katmanlama = **5 katman, deckent-core → deckent-custom** — **ADR-katmanlamasından (G/D/UG/UP) FARKLI**, MOD-SPLIT/MODULARIZE detayı. Proje-katmanı ~ ADR-katmanı (global/proje ~ UG/UP). ADR-034'ün 4-izolasyon-katmanı = ayrı (güvenlik). Ayrı oturumda netleştir. [ENT/GOV/ARCH]
- **ADR-AUTHORING-STD** (GLOBAL ilke): her ADR (özellikle ADR-G) **bugün (today-state) + yarın (intent/roadmap, neden)** şeffaf belgeler → ADR-036'ya authoring-standard olarak bağla. [GOV]
- **CONFIG-CUSTOMIZE:** ortak/standart tier + **custom tier** + **NL-terminal ile TÜM ayar customize** (ONB-CHAT) + kolaylık+tutarlılık; **her config-knob KODDA gerçek-etkili** (DORMANT-2 honesty + zero-hardcode). [ONB/TERM/GOV]
