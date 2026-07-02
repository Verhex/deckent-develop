# Deckent — Ana Plan (Türkçe okuma-companion'ı)

> **Rol:** Kanonik iş-planının **Türkçe okuma + önceliklendirme companion'ı**. **Canlı tek-kaynak (SSOT)** —
> 9-sütunlu wide tablo + gelecekteki **Sıra** sütunu — `docs/MASTER-PLAN.md`'dedir; çelişki olursa **o** esastır.
> **Yenileme:** 2026-06-29 (analiz turu + Alperen detaylı yön pass-2 + Codex gap-fold). **Arşiv:** `docs/archive/MASTER-PLAN-archived-2026-06-29.md`.
> **Kaynaklar:** `.analysis/hermes-vs-deckent-claude-analysis.md` · `.analysis/hermes-vs-deckent-analysis.md` · `.analysis/hermes-vs-deckent-direction-decisions.md`.
> İm: ⬜ Açık · 🟡/◑ Kısmi · 🔬 Araştırma · ⏸️ Ertelendi · ✅ Tamam. Kaynak: A=Alperen · CL=Claude · CX=Codex(gap) · MP=eski-backlog.
> **Sıralama:** Önceliklendirme adımında **Sıra** sütunu / satır-reorder yapılacak (Alperen ile — sonraki adım).

---

## 1. Kuzey Yıldızı (2026-06-29)
**Deckent = local-first AI orkestrasyon kabuğu. Terminal çalıştırır · Dashboard açıklar · Çekirdek orkestre eder · Enterprise yönetir.**
- **Terminal** = ana yönetim+kullanım penceresi (kalp); **tam kontrol + yormayan + tam işlevsellik (esneklik=kabul-edilmez)**;
  tool-driven + conversational; iş CLI değil terminalden — ama zorlamadan (CLI/MCP opsiyonel).
- **Dashboard** = yalnız izleme/görsel-anlama; **chat Desktop-app tarafında**; sonra Electron CC-Desktop ürünü.
- **Çekirdek Hermes'ten daha derin → terminal+tool'da daha İYİ olmak zorunda.** Kopyalama yok: rol-model al, daha iyisini kur.
- **Deckent global kurulur (sistem-seviye), öğrenimler proje-scope.**

## 2. Yeni/Önemli Eklemeler (bu tur)
- **APP Protocol + SDK** (topluluk-hediyesi, MCP gibi) · **DIRECTIVES 0-kırılganlık** (tüm modlar) · **ONB global-install + proje-scope** ·
  **worker-prompt token-opt** + scope'u TOOL ile çöz · **agent-skill expansion** · **PROV first-class** (cost/limit/bildirim/fallback/hız/kalite/güvenlik) +
  subs-paket + sözleşme-engelleri · **APR §11 tam** (broker/store/eventstream/shell-client/worker-gate/policy/fallback/contract) ·
  **TERM §9 tam** (Ask/Run/Control + simple-task-flow + /connect + resume + busy + catalog-badge + compat-matrix + RPC) ·
  **ADR-layering + AEGIS-redesign + modülerleşme** (solo/enterprise) · **6-dil i18n** · **WIN Azure-ERP** · **PERF local/VPS** · izole-ortam + git-soyutlama.

## 3. Pillar + Öncelik Haritası
| Pillar | Açıklama | Öncelik |
|---|---|---|
| TERM | Terminal-shell (3-mod + simple-flow + /connect + chat + kategorili-komut + onay-etkileşimi + compat) | P0 |
| APR | Runtime-wide ApprovalBroker + tam §11 (store/eventstream/policy/fallback/contract) + çok-ortam relay | P0 |
| TRN | Training-trace WIRE + label + pipeline mükemmelleştir (usage-cost kritik) | P0 |
| TOOL | Hermes rol-model + progressive disclosure + registry-mekaniği + scope-via-tools + agent-skill expansion | P0 |
| ONB | global-install + proje-scope + sohbetle setup + zengin doctor | P0 |
| MOAT | Çekirdeği koru + güven-bug'ları + worker-prompt-opt + çok-backend orkestre + izole-ortam | P0/sürekli |
| DASH | İzleme-only + observability panel-seti (chat→Desktop) | P1 |
| PROV | first-class cost/limit/fallback + subs-paket + sözleşme-engeli + maliyet-uygun matris | P0/P1 |
| MEM | kırılım + hız + kullanım-denetimi + UserMemory + background-review | P1 |
| MODE | tüm modlar uçtan-uca + DIRECTIVES 0-kırılganlık + cost-limit organizma | P0/P1 |
| WIN | native Windows + tmux/docker gözlem + Azure-ERP kalp-adayı | P1/P2 |
| MSG | integration layer + session-continuity | P1 |
| MCP | sığ→enterprise + trust gate | P1 |
| DESK | Desktop+Mobile app + chat (terminal-sonrası) | P2 |
| ENT | theater-temizliği + tek-policy-gateway + IFS-write (sonra) | P2 |
| GOV | ADR-tutarlılık + ADR-layering + AEGIS-RD + layer-cleanup + dormant + god-object | P1/P2 |
| PERF | local-RAM/worker + VPS/VDS + cold-start/index/observability | P1/P2 |
| DOCS/I18N/OFFLINE/SDK/LAUNCH | docs + 6-dil + air-gap + APP/SDK + modülerleşme + OSS/GA | P1/P2 |

---

## 4. İş Maddeleri (pillar-gruplu — okuma + önceliklendirme)

> Aynı maddeler; canlı 9-sütun + Sıra `MASTER-PLAN.md`'de.

### 🟥 P0 — Publish-öncesi kalp

**TERM — Terminal** (tam-işlevsellik şart, esneklik yok)
- **TERM-1** Açılış health snapshot (provider/model/auth/MCP/mem/cwd/mode) [A·CL·⬜]
- **TERM-LIVE** Çalışırken canlı run-status footer (1-5 satır, 5 soru) + provider-health+auth [CX·A·⬜]
- **TERM-MODE** Ask/Run/Control 3-mod shell (read-only / plan→approve→run→eval / yönetim) [CX·⬜]
- **TERM-FLOW** Simple-task altın akış: NL prompt→plan-preview→approve→run→evaluate [CX·A·⬜] ⭐ en yüksek-sinyal
- **TERM-2** Conversational chat (Hermes user-msg); bg-tamamlanan→yeni turn [A·⬜]
- **TERM-3** Kategorili komut keşfi (Core/Run/Memory/MCP/Enterprise/Danger; tek registry) [A·CL·CX·⬜]
- **TERM-4** Tool-driven terminal (CLI değil; CLI/MCP opsiyonel) [A·⬜]
- **TERM-CONNECT** `/connect` wizard (provider/MCP/IDE/Windows-shell + auto-detect + health-badge) [CX·⬜]
- **TERM-5** Görsel/işlevsel tutarlı-yormayan dil + sade risk-dili (Oku/Değiştir/Çalıştır/Otonom) [A·CX·🔬]
- **DIR-1** Terminalde NL "planla" → DIRECTIVES üret (el-yazımı sabit-format yerine) [A·⬜]
- _(P1 TERM: TERM-CAT, TERM-RESUME, TERM-BUSY, TERM-COMPAT, TERM-SIMPLE, TERM-RPC, F2-008, F11-014/016, TERM-NAT, F7-004, REPL-001 — aşağıda)_

**APR — Approval/Control** (§11 SIFIR-kayıp)
- **APR-1** Runtime-wide ApprovalBroker (event; worker emit→suspend→resume) [A·CL·CX·⬜] ⭐ İLK madde
- **APR-SHELLCLIENT** Ink approval card (y/n/a/d) REPL altında [CX·⬜]
- **APR-WORKERGATE** WorkerApprovalGate (riskli aksiyon öncesi broker-karar bekle) [CX·⬜]
- **APR-DUALSTREAM** Terminal çift-stream (run-status + approval) + confirm-queue runtime-wide [CX·⬜]
- **APR-2** Çok-kanallı canlı relay + "xx'de onaylandı" cross-broadcast [A·⬜]
- **APR-EVENTSTREAM** ApprovalEventStream (terminal/dashboard/API/Slack/Teams) [CX·⬜]
- **APR-STORE** ApprovalStore durable persist (restart-survive) [CX·⬜]
- **APR-CONTRACT** Tam kontrat (requester/summary↔details/scope-7/risk-5/policy-4/default-4/tenant-user) [CX·A·⬜]
- **APR-POLICY** ApprovalPolicy karar-motoru (risk/role/tenant/scope/timeout) [CX·⬜]
- **APR-FALLBACK** FallbackResolver (terminal-yok → deny/pause/timeout/escalation) [CX·⬜]
- **APR-4** Redaction/secret-masking (raw vs masked-arg) [CL·CX·⬜]
- _(P1: APR-ALLOWSCOPE, APR-CLIENTS, APR-HISTORY, APPROVE-007b, CKPT-1 — aşağıda)_

**TRN — Training-trajectory** (usage-cost kritik, atlamayalım)
- **TRN-1** trace-recorder → sprint-worker turn'lerine WIRE (redacted+labeled) [A·CL·⬜]
- **TRN-2** trace-recorder → native-REPL WIRE (0-caller) [CL·⬜]
- **TRN-3** cc-trace-extractor driver (0-caller) [CL·⬜]

**TOOL — Tool sistemi** ("deckenti deckent yapan")
- **TOOL-1** Deckent fonksiyonlarını tool-yüzeyine taşı (terminal-native dispatch) [A·⬜]
- **TOOL-2** Progressive tool/action disclosure: core + searchable bridge [A·CL·CX·⬜]
- **TOOL-SCOPE** Scope-enforcement'ı prompt yerine TOOL ile çöz (worker out-of-scope tool-gated) [A·⬜]
- _(P1: TOOL-CORE, TOOL-REG, TOOL-CAT, AGSK-1 agent-skill-expansion, PARITY-1; P2: TOOL-CU, TOOL-4)_

**ONB — Onboarding** (global-install revizyonu)
- **ONB-GLOBAL** Global/sistem-kurulum + proje-scope katman + öğrenimler proje-scope (Deckent global-tutarlı) [A·⬜] ⭐ kesin-revize
- **ONB-1** install→init wizard (provider/auth/MCP/workspace/mode + sistem-tarama) [A·CL·⬜]
- **ONB-CHAT** "deckent" → sohbetle tüm setup + Deckent özellik-önerir (CLI/MCP yine çalışır) [A·⬜]
- **ONB-2** Zengin doctor (--fix + windows-native + auth-state probe) [A·CL·⬜]

**MOAT — Koru/sertleştir + token-opt**
- **MOAT-1** WORKTREE-MERGE-RACE (8-wide'da 3/11 source-merge düştü) [MP·⬜] 🔴
- **MOAT-2** ORPHAN-START-PROC (normal-completion coordinator lingers) [MP·⬜] 🟠
- **MOAT-4** Deterministik orchestration + kapalı-öğrenme + governance KORU [A·CL·✅(koru)]
- **WP-OPT** Worker-prompt token-opt (aynı kalitede min-token + tekrar-azalt; scope→TOOL) [A·⬜]

**Diğer P0:** **PROV-FC** (first-class cost/limit/bildirim/fallback/hız/kalite/güvenlik) [A·⬜] · **F1-TOK** token/limit-ledger [MP·🟡] · **DIR-2** DIRECTIVES 0-kırılganlık tüm modlar+ilk-proje-safety [A·⬜] · **MEM-4** self-evrim koru [A·✅]

### 🟧 P1 — Solo benimsenme + olgunlaşma

**TERM (kalan):** TERM-CAT tool/action-catalog+badge [CX·CL] · TERM-RESUME recent-session+`/resume` picker [CX] · TERM-BUSY `/queue`+`/interrupt`+`/steer`+mid-run-steer [CX] · TERM-COMPAT REPL compat-matrisi [CX] · TERM-SIMPLE Simple-Mode 5-7 komut [CX] · TERM-RPC ortak session/action RPC [CX·CL] · F2-008 native-SDK [MP·A] · F11-014 multi-provider parity [🟡] · F11-016 Ink stabilizasyon [🟡] · TERM-NAT native-default-flip [🟡] · F7-004 terminal-hardening [🟡] · REPL-001 slash-parity.

**APR (kalan):** APR-ALLOWSCOPE scoped-always-allow+expiry [CX] · APR-CLIENTS Slack/Teams+API [CX] · APR-HISTORY dashboard audit-report [CX] · APPROVE-007b · CKPT-1.

**TRN (kalan):** TRN-LABEL outcome-taksonomi (success/partial/cancel/NO_GO) [CX] · TRN-4 pipeline-mükemmel [A·CL] · TOK-AUT [🟡].

**TOOL (kalan):** TOOL-CORE eager-core-set [CX] · TOOL-REG registry-mekaniği (cache/toolset/dynamic-schema/generation-memo/shadow) [CX·CL] · TOOL-CAT catalog+trust-tier [CX·CL] · **AGSK-1 agent-skill expansion (kritik)** [A] · PARITY-1.

**ONB (kalan):** ONB-HONEST dürüst-mesaj [CX] · ONB-DISCOVERY CLI-auto-detect [CX] · PSL-6 [🟡] · CFG-1 · DOCTOR-1.

**DASH:** DASH-1 scope-freeze+observability (chat→Desktop) [A·CL·CX] · DASH-PANELS panel-seti [CX·◑] · DASH-2 pending-approval-viewer [A·CL] · DASH-D3 ölü-alan-envanteri [MP].

**PROV:** PROV-1 oauth-subs↔api metrik [A] · PROV-SUBS subs-paket [A] · PROV-CONTRACT sözleşme-engeli+fix (Gemini-CLI subs) [A] · PROV-MATRIX maliyet-uygun-seçim [A] · F1-LIM[✅] · F1-CB[✅] · F1-010 overflow · F1-AD model-detect · F1-PD[🟡] · F1-PCACHE[🟡] · F1-IMG-2 · F1-009r · MF-4/5/7/9 · PSL-2/3/4 · AS2-P3 · AS4-P1 · ROUTE-1[🟡].

**MEM:** MEM-1 kullanım-denetimi[🔬] · MEM-2 kırılım(proje/session) · MEM-3 DB-hız/index · MEM-REVIEW background-review-worker [CX·CL] · UMEM-1 UserMemory.

**MODE:** MODE-1 process-executor · MODE-2 lifecycle-kernel · MODE-3 cost-limit-scheduling · MODE-4 scheduled-run-UX · AUT-9[🟡] · IDLE-SPIN.

**WIN:** WIN-1 native-profil · WIN-PATHS data-dir-split [CX] · WIN-2 tmux/docker-gözlem · WIN-3 ölçek-spawn · SPAWN-1 DEP0190.

**MSG:** MSG-1 integration-layer · MSG-CONT session-continuity [CX] · MSG-2 pairing-onay-buton · MSG-3 WhatsApp · BOT-2d.

**MCP:** MCP-1 sığ→enterprise[🟡] · F9-001 broker-wire · F9-002 discovery+shadow-policy · F9-003 trust-gate.

**MOAT/ORCH (kalan):** MOAT-3 sentetik-NO_GO/eval-vs-disk · ORCH-BE çok-backend-kusursuz-orkestre [A·🟡] · MOAT-ISO izole-ortam-kontrol [A] · MOAT-VCS proje-takip-soyutlama(git) [A].

**GOV (P1):** WM-5 provider-free-enforce[🟡] · LAYER-1 core→cli-inversiyon · DORMANT-1 kablosuz-güvenlik🔴 · DORMANT-2 no-op-knob · DORMANT-3 duplikat · DEADMOD wire-vs-kes · COMM-2 tipli-worker-mesaj · ADR-GOV ADR-tutarlılık · **ADR-LAYER ADR-katmanlama(deckent/proje/global)** [A] · GOV-GATE first-user-gate [CX] · WATCH-W · WM-2 · SEC-1.

**PERF (P1):** **PERF-LOCAL local-RAM/worker-denge** [A] · **PERF-VPS VPS/VDS-ideal-akış** [A] · PERF-1 cold-start · PERF-2 query-index/spawn-SLA · PERF-5 coverage-ratchet.

**DOCS (P1):** DOC-1 docs-perfection[🟡] · DOC-PKG-1 README-link-fix · GITIGN-RT runtime-state-untrack · GA-1 npm-publish.

### 🟦 P2 — Sonraki dalga / ertelenmiş

**DESK:** DESK-CHAT chat→Desktop (eski CHAT-A) [A] · DESK-1 App(Desktop+Mobile,Electron)+interaktif-dashboard [MP·A] · DESK-2 productization(CC-Desktop) [A] · FB-1 opt-in-telemetri.

**ENT:** ENT-T1 theater-temizliği(rbac_roles/rate_rules) [CL] · ENT-T2 enforce_rbac-manuel-path [CL] · **ENT-GATEWAY tek-Enterprise-Policy-Gateway** [CX] · ENT-ROLLOUT L0/L1-read-first [CX] · ENT-1/2/3/5[🟡] · F8-003[🟡] · ERP-1 write-side[⏸️] · ERP-2 IFS-round-trip[⏸️] · SCALE-1/2 · WIN-ERP Azure-ERP-kalp-adayı [A] · TEAM-1.

**GOV/SDK (P2):** **ADR-REVISION** (yalnız-Alperen-onayı, 80-ADR)[⏸️] · **AEGIS-RD** AEGIS→Deckent-özel-global-agentic-metod [A] · **MODULARIZE** deckent-solo/enterprise iki-lisans (ADR-revizyon-sonrası)[⏸️] · **APP-1** Agentic-Process-Protocol+SDK topluluk-hediyesi [A] · SDK-1 embed-SDK[⏸️] · GOV-CROSSWALK[◑] · WM-3/4 · GODOBJ · PERF-3/4 · DOC-2/35.

**I18N/OFFLINE:** **I18N-6** 6-dil(en/tr/zh+3) sıfır-hardcode [A] · AS7-1/2/3/4 air-gap.

**LAUNCH:** GA-2 repo-flip+scrub · GA-3 .github+landing · HUB-1 DeckentHub · PB-1 Voice · PB-3 AEGIS-method.

---

## 5. Korunacak Moat (yeniden-yazma YOK)
Deterministik 8-faz eval-backed orchestration · Kahn dependency-wave + atomic file-lock · 9-adım eval + disk-vs-claim dürüstlüğü ·
kapalı outcome→routing→promotion öğrenme döngüsü (en güçlü subsystem) · governance-by-construction (yapısal read-only) · 2x test
disiplini · HMAC tamper-evident memory.

## 6. Bağlayıcı Kurallar (özet)
🔒 3 yasa (çift-bakış+ölçek · her-ortam cross-platform · MVP ASLA) · Türkçe · `.brain/memory.db` silinmez · sprint'te build/login yok ·
sprint kill/cleanup + commit Alperen-onayı · disk-verify · proof-of-function · i18n-first (asla hardcode).

---

*Canlı tek-kaynak (wide tablo + Sıra sütunu): `docs/MASTER-PLAN.md`. Tam detay/done-history: `docs/archive/MASTER-PLAN-archived-2026-06-29.md`. Çelişki olursa EN sürüm esas.*
