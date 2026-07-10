# DESK-2 (born-626) — Desktop Ürün-UX Blueprint v1+v2 (2026-07-10, KARARLI)
> Üretim: code-architect ajanı (kod-doğrulamalı, file:line'lı). KARARLAR (Alperen): Studio-dark + command-deck=power-mode ·
> yeni-accent (teal/cyan; gold=dashboard) · ana-yüzey adı=CONSOLE · v1=TAM-11-dilim (+Slice-0) · persona+ERP birinci-sınıf.
> Tam-metin iki ajan-raporunda üretildi; bu dosya karar-SSOT'u ve inşa-referansı. (İnşa: Faz-1-SONRASI; GAP-1/2/5 = 611/607/614.)

## Bilgi-mimarisi (v1 §1)
Sol-ray: **Talk** (Console + Terminal — ADR-G-034 agentic-konuşma ≠ ADR-G-029 ham-PTY, ikisi ayrı birinci-sınıf) ·
**Run** (Sprint-Timeline · Missions/Automations [non-coder'da "Processes"] · Approvals-Inbox) · **Know** (Memory-Browser ·
Agent/Skill-Katalog) · **Connect** (Connectors · Multi-Project-Workspace) · **Settings** (+enterprise'da **Governance** grubu).
Üst-bar: profil-değiştirici · model/sağlayıcı · maliyet-şeridi · daemon-pill. Sağ-pane bağlamsal. 12 ekran + onboarding-modal.
Çekirdek-ilke: Desktop = KARAR-VEREN 3. yüzey (dashboard yalnız gözler — ApprovalsPanel kendi başlığında yazıyor).

## Console çekirdeği (v1 §2)
Asistan-dönüşü tipli-blok dizisi: text-delta · tool-kartı (tier'a göre görsel-ağırlık; classifyTool reuse) ·
TRANSCRIPT-İÇİ onay-kartı (worker-suspend noktasında Allow/Deny/Defer) · usage-footer. Session-sidebar (GAP-3'e bağlı).

## Ekran→API haritası + 12 isimli GAP (v1 §5 + v2 §5)
GAP-1 CHAT-EVENT-STREAM (stream bugün text-only; delta|tool_use|tool_result|approval_request|approval_resolved|usage|done|error — 607+611'den) ·
GAP-2 APPROVAL-DECIDE-WIRE (rpc-write-handler /api/rpc'ye merge edilmemiş + approval.api_decide flag + push-kanalı=611) ·
GAP-3 CHAT-SESSION-STORE (konuşma-oturumu listesi/resume — 614-lineage) · GAP-4 DIFF-API (hiç yok; /api/tasks/:id/diff + artifacts) ·
GAP-5 TRACE-API (614 read-endpoint) · GAP-6 CONNECTORS-API (canlı-health/pairing/enable) · GAP-7 MISSIONS-WRITE-API (GET-only bugün) ·
GAP-8 PERSONA-PROFILE-PERSISTENCE (ConnectionProfile.persona + global-default; IPC-grade) · GAP-9 PERSONA-I18N-AXIS
(persona-boyutlu string-setleri; plain-language capability-adları alt-kümesi) · GAP-10 ONBOARDING-PERSONA-WIZARD (6-senaryo→4-persona) ·
GAP-11 CAPABILITY-APPROVAL-BRIDGE (approval-adapter parked-trigger kuyruğu ≠ ApprovalBroker kontratı — erp.write/mail.send
kartları Inbox'a bunsuz DÜŞMEZ; Slice-4/7 gate'i) · GAP-12 ENTERPRISE-POLICY-PUSH (org-zorlamalı persona/exposure; post-v1-isimli).
+ RISK-TAXONOMY-MAP (resolveRiskClass 3-tier → ApprovalRisk 5-tier; GAP-11 ile).

## Persona-adaptivite (v2 §1)
4 preset — ray PERSONA-BAŞINA KOMPOZE (greyed-out değil): solo-noncoder (Console+Processes+Approvals+Connectors+Settings;
Terminal/Timeline/Diff/Katalog/Workspace YOK) · solo-dev (tam v1-rayı) · team (+üye/RBAC-görünürlük, decidedBy) ·
enterprise (+Governance: approvals-audit/tenant-policy/fail-closed-göstergesi — /api/enterprise/* canlı). Persona =
LOKAL UI-tercihi; güvenlik-sınırı DEĞİL — decide-kontroller ayrıca /api/auth/me Role'üne server-side gate'li.
Seçim: onboarding + Settings + profil-başına-override (GAP-8).

## İş-süreci/ERP (v2 §2)
Ayrı ekran YOK — Run-grubunun aynı ekranları + domain-filter-chip'leri (WorkDomain: code-repo|erp|messaging|web|data-pipeline).
Kanıt: TaskKind kod-merkezli ama WorkDomain+CapabilityTarget canlı; mission-store renderAs zaten kind'ları birleştiriyor.
Non-coder copy'si GAP-9 alt-kümesi. Capabilities allow/deny (execute.ts) ile policy-gate park'ı FARKLI kontrat → GAP-11.

## Onboarding (v2 §3)
Step-0 "deckent'i nasıl kullanacaksın?" → 6-senaryo→4-persona eşlemesi (1-3→solo-dev · 4→solo-noncoder · 5→enterprise · 6→team)
+ profil-kind önerisi.

## Dilim-planı (v2 §4 — v1'in 11'i + YENİ Slice-0)
0 Persona/Mode-framework (saf-client: UiPersona + persona-i18n-ekseni + nav-composer + onboarding-step-0 + literal-string lint-gate)
→ 1 Shell+Terminal → 2 Console-baseline → 3 tool-kartları+inline-onay (GAP-1+607+611) → 4 Approvals-Inbox (GAP-2+GAP-11)
→ 5 Timeline (+kill/retry) → 6 Diff (GAP-4) → 7 Missions/Processes (+domain-chips; GAP-7+11) → 8 Memory+Katalog →
9 Connectors (GAP-6) → 10 Workspace+Settings+Onboarding → 11 Session-resume (GAP-3). Post-v1: GAP-12.
Her dilim Playwright-Electron smoke + Alperen user-truth turu. Teknik: React+Vite+Tailwind+lucide (dashboard ui/* + token-reuse,
ayrı-accent), IPC=UI-grade-only kuralı sert.
