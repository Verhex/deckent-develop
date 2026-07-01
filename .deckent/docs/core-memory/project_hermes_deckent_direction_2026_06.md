---
name: project_hermes_deckent_direction_2026_06
description: Hermes-vs-Deckent kod-analizi sonrası stratejik pivot + yeni tek-tablo MASTER-PLAN; Deckent yön/öncelik kararı verirken İLK durak.
metadata: 
  node_type: memory
  type: project
  originSessionId: 19160cf1-778d-4af6-bd98-df55797bdb2d
---

2026-06-29: Hermes (Nous Research, Python self-improving AI-agent) ile Deckent **kod-tabanlı** karşılaştırıldı (7 paralel keşif-ajanı, file:line-grounded). Çıktılar: `.analysis/hermes-vs-deckent-claude-analysis.md` (Claude analiz, 12 bölüm + kanıt-eki), `.analysis/hermes-vs-deckent-analysis.md` (Codex, ikinci görüş), `.analysis/hermes-vs-deckent-direction-decisions.md` (Alperen yön-kararları, konsolide).

**Stratejik pivot (Alperen kararı):**
- **Terminal = ana yönetim+kullanım penceresi** (solo ürünün kalbi); tool-driven + conversational (Hermes "user msg" sohbet modeli Deckent'e gelecek); iş CLI-komutuyla DEĞİL terminalden — ama **zorlamadan** (kullanıcı isterse CC'den CLI kurar / MCP bağlar / hepsini terminalde). CC/Hermes/Codex/OpenClaw seviyesi şart.
- **Dashboard = yalnız izleme/görsel-anlama** katmanı (basit, görsel tutarlı); ilerledikçe terminal-chat ile entegre (CC-Desktop benzeri: terminal+chat+connector). "Terminal runs · Dashboard explains."
- **Çekirdek Hermes'ten daha derin → terminal+tool'da daha İYİ olmak zorunda** (Alperen: "bu bir gerçek"). Kopyalama yok: Hermes desenlerini rol-model al, daha iyisini kur.

**P0 set:** TERM (terminal-shell+chat+kategorili-komut) · APR (runtime-wide ApprovalBroker + çok-ortamlı canlı onay relay — telegram/whatsapp/terminal nereden gelirse "xx'de onaylandı" cross-broadcast; şu an YOK, [[project_human_interaction_wire_gap]]) · TRN (training-trace UNWIRED→wire; deckent-LLM yakıtı, [[project_sp2_training_data_pipeline]]) · TOOL (Hermes-rol-model progressive disclosure) · ONB (init-wizard+doctor+NL-ayar) · MOAT güven-bug'ları (worktree-merge-race 🔴, orphan-start-proc 🟠).

**Korunacak moat (yeniden-yazma YOK):** deterministik 8-faz eval-backed orchestration · kapalı outcome→routing→promotion öğrenme döngüsü (D3 hükmü: "en güçlü gerçek subsystem") · governance-by-construction (yapısal read-only capability/ERP) · 2x test disiplini · HMAC tamper-evident memory.

**En kritik bağımsız bulgu** (Alperen: "burada Codex'ten çok sana güveniyorum"): training-trace pipeline kodda yazılı ama **0-caller/UNWIRED** (`cli/repl/trace-wire.ts:20`, `cli/repl/native-agent-bridge.ts:43,122`, `training/cc-trace-extractor.ts:51`); Hermes'te aynısı shipped+research-grade (ShareGPT batch_runner+compressor). Düzeltmeler: "serverless persistence"=yalnız FS-snapshot · auth-gate fail-CLOSED var (eksik=pairing-onay UX) · ERP=4 driver (sadece IFS değil).

**SSOT değişti:** `docs/MASTER-PLAN.md` artık **tek pillar-tablosu** (157 iş-satırı, Durum+Tamamlanma-Tarihi sütunlu, 20 pillar, filtrelenebilir; eski §1-§18 yapı arşivlendi). Eski plan lossless: `docs/archive/MASTER-PLAN-archived-2026-06-29.md`. `docs/MASTER-PLAN-TR.md` artık **stale**.

**Why:** 340+ sprint dogfood hızlıydı ama "ürün-şekli" yerine "sistem-genişliği" üretti; pivot bunu terminal-merkezli sade ürün-kabuğuna indirir + Deckent'in derin çekirdeğini korur.
**How to apply:** Deckent yön/öncelik kararı verirken önce `docs/MASTER-PLAN.md` tablosu + bu üç analiz dosyası. Terminal/dashboard işinde rol-ayrımına uy. Yeni iş = MASTER-PLAN'a Pillar+ID+Durum+Tarih ekle. Pivot-sonrası bir sonraki adım Alperen-emri bekleniyor.

Related: [[project_deckent_native_terminal_agent]] · [[project_deckent_native_terminal_agent]] · [[project_deckent_core_model_and_provider]] · [[work_tracking_ledger]] · [[feedback_finalize_force_orphan_state]] · [[feedback_agent_routing_imbalance]].
