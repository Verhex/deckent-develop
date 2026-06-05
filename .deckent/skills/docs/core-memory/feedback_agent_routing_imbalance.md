---
name: feedback_agent_routing_imbalance
description: "Agent routing dengesizliği — refactorer ağırlığı kronik. Sprint 209-210 kısmi düzeldi (çeşitlilik göründü) ama Sprint 211'de 12/16 refactorer'a geri döndü. Güvenlik/UI task'ları hâlâ yanlış agent'a gidiyor."
metadata: 
  node_type: memory
  originSessionId: 89c2bcbe-de85-4468-bb6d-2fa12f4b7622
---

Alperen sorusu (Sprint 208 sonrası, 2026-05-31): "sürekli refactorer seçiliyor, bir sürü agent ve skill var, neden bu yapı işlevsel çalışmıyor?" Sprint 209'da ele alınacak.

**Sorun (Sprint 208 kanıtı):** 16 task'tan 15'i `refactorer`, 1'i `doc-writer`. api-builder/security-auditor/data-engineer/devops-engineer/frontend-designer/performance-analyzer/architect/migration-specialist HİÇ kullanılmadı. 21 skill de büyük ölçüde atıl.

**KÖK NEDEN (tarihsel):** Bu, Sprint 205 agent-routing fix'inin **ters yan-etkisi.** Önce sorun: built-in agent'ların hiçbiri `implementation` intent'ine aday değildi → her şey scope-kör temp-react'e gidiyordu. Fix: refactorer impl@7 + architect impl@6 eklendi. ŞİMDİ ters: çoğu kod task'ı `intent.primary: implementation` sınıflanıyor → refactorer@7 her zaman kazanıyor (architect@6'yı bile geçiyor). Diğer agent'lar farklı intent'lere bağlı (api-builder→api domain, security→security intent, frontend→design) ama task'lar "implementation" etiketlendiği için onlara hiç gitmiyor.

**Asıl mesele:** Intent-classifier çok kaba — neredeyse her kod task'ını "implementation" yapıyor. Routing ikincil sinyalleri (domain, scope path, skill match, file patterns) yeterince kullanmıyor. refactorer impl@7 tek-boyutlu kazanıyor.

**Why:** Deckent'in agent/skill çeşitliliği (15 agent + 21 skill) bir değer önermesi — doğru iş doğru uzmana gitmeli (API task → api-builder, güvenlik → security-auditor, UI → frontend-designer). Hepsi refactorer'a giderse uzmanlaşma anlamsız, routing-engine v2 + activation rules + öğrenme sistemi boşa çalışıyor.

**How to apply (Sprint 209 analiz + fix):**
- Intent-classifier'ı incele: neden her kod task'ı "implementation"? Domain/scope/operation sinyalleri intent'i çeşitlendirmeli (api/, auth/, components/, db/ path'leri → ilgili intent).
- Activation scoring multi-sinyal: refactorer impl@7 tek başına kazanmasın — domain match + scope path + skill synergy ağırlığı artsın.
- refactorer impl skorunu düşür (7→5?) VEYA "implementation" intent'ini alt-tiplere böl (api-impl, ui-impl, security-impl, generic-impl).
- Skill routing da denetlenmeli — 21 skill'den kaçı gerçekten atanıyor (outcome-tracker verisi).
- DİKKAT: Sprint 205 fix'i geri ALMA (temp-react sorununa dönmesin) — denge kur, refactorer aday KALSIN ama tek-kazanan olmasın.

**GÜNCEL DURUM (Sprint 209-211 trajektori):**
- **Sprint 209-210:** kısmi düzelme — çeşitlilik göründü (Sprint 210 canlı: refactorer 10 + frontend-designer 3 + api-builder 1 + architect 1 + doc-writer 1). Bu "çözüldü" sanıldı.
- **Sprint 211 (2026-06-01) NÜKS:** build+re-plan sonrası dağılım **12 refactorer + 3 architecture-planner + 1 doc-writer**. Güvenlik task'ları (RBAC/audit/rate-limit, security-specialist skill) → refactorer (security-auditor değil). UI task'ları (Layout/MemoryExplorer, frontend-design skill) → architecture-planner (frontend-designer değil).
- **Önemli gözlem:** skill routing DOĞRU çeşitleniyor (security-specialist, react-specialist, frontend-design, anthropic-sdk hepsi atandı) ama AGENT seçimi collapse ediyor. Yani sorun agent activation scoring'de, skill routing'de değil. Uzmanlık skill üzerinden taşınıyor → tam felaket değil ama "doğru agent persona" hedefi tutmuyor.
- **Çıkarım:** Sprint 209-210 düzelmesi kırılgan/non-deterministik (AI-plan varyansı), kalıcı fix değildi. Kalıcı çözüm hâlâ açık: agent activation'da skill-match + scope-path sinyali agent seçimine de yansımalı (frontend-design skill → frontend-designer agent; security-specialist → security-auditor).

İlgili: [[feedback_brain_rubric_bridge_broken]] (önceki Brain forensic), [[feedback_scale_up_autonomous]] (çok-task → çeşitlilik daha kritik), [[feedback_worker_prompt_engineering_god_level]] (persona-task match), [[feedback_directive_kanit_letter_vs_goal]] (Sprint 211 wire-gap deseni).
