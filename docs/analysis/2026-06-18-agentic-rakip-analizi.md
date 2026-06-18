---
title: "Agentic Rakip Analizi — Deckent vs CrewAI / LangGraph / OpenHands / Hermes / OpenClaw"
last_updated: 2026-06-18
status: active
doc_rank: 90   # provisional — iç-strateji/analiz dokümanı (0=core ... 95=customer ölçeği). Kod adı doc-tracking brainstorming'de netleşecek.
content_hash: <managed>   # dokümantasyon-takip mekanizması (ADR-031 hash genişletmesi) tarafından yönetilecek; elle düzenleme.
method: "5 paralel araştırma ajanı (web + GitHub API + Deckent kod tabanı caller-trace)"
---

# Deckent vs. Agentic Rakipler — Kapsamlı Rekabet Analizi

*Tarih: 2026-06-18 · Yöntem: 5 paralel araştırma ajanı · Puanlama: 1–10, 10 = sınıfının en iyisi*

> **Güvenilirlik uyarısı:** Bazı yıldız/popülerlik rakamları (Hermes Agent ~196k, OpenClaw 68k–379k) web kaynaklarında şişkin/çelişkili — **düşük güvenle** işaretli. Niteliksel kıyas ve puanlama sağlam; ham popülerlik sayılarına yaslanma.

## Yönetici Özeti

Hiçbir rakip, Deckent'in **tek üründe** birleştirdiği beşli kombinasyonu sunmuyor: *çok-sinyalli akıllı routing (D2) + SQLite-FTS5 hafıza (D3) + otonom motor (D5) + enterprise RBAC/multi-tenant (D6) + kendi-kendini geliştirme (D10)*. Tek-eksende en yakın tehditler **LangGraph** (orkestrasyon + enterprise olgunluk) ve **OpenClaw** (otonomi + evrim + mindshare). Deckent'in tek belirleyici açığı: **sıfır gerçek-dünya adoption (D9=3)** ve **bilinçli-yumuşak enforcement (D6 RBAC advisory)**.

---

## Ana Kıyaslama Tablosu (10 Boyut × 8 Ürün)

| # | Boyut | **Deckent** | CrewAI | LangGraph | OpenHands | Hermes Agent | AutoGen/AG2 | MetaGPT | OpenClaw |
|---|-------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| D1 | Çoklu-ajan orkestrasyon & koordinasyon | **8** | 9 | 9 | 4 | 4 | 8 | 7 | 4 |
| D2 | Akıllı routing (model/ajan/skill/provider) | **9** | 5 | 6 | 3 | 6 | 6 | 5 | 5 |
| D3 | Hafıza & bilgi yönetimi | **8** | 8 | 8 | 4 | 9 | 6 | 6 | 7 |
| D4 | Çoklu-provider / model esnekliği | **8** | 8 | 8 | 9 | 9 | 8 | 7 | 9 |
| D5 | Otonom / kendi-yöneten çalışma | **7** | 6 | 6 | 8 | 8 | 7 | 7 | 9 |
| D6 | Enterprise hazırlık (RBAC/tenant/audit/güvenlik) | **6** | 8 | 8 | 6 | 2 | 6 | 4 | 2 |
| D7 | Geliştirici deneyimi & benimseme kolaylığı | **6** | 9 | 6 | 6 | 7 | 6 | 7 | 8 |
| D8 | Ekosistem & entegrasyonlar (MCP, araç, konnektör) | **7** | 9 | 8 | 8 | 7 | 7 | 6 | 8 |
| D9 | Üretim olgunluğu & gerçek-dünya adoption | **3** | 8 | 9 | 7 | 4 | 6 | 6 | 7 |
| D10 | Kendi-kendini geliştirme / öğrenme / evrim | **8** | 3 | 4 | 4 | 9 | 5 | 6 | 8 |
| | **Bileşik (10 üzeri ort.)** | **7.0** | **7.3** | **7.2** | **5.9** | **6.5** | **6.5** | **6.1** | **6.7** |

**Okuma:** Deckent zirvedekilere (CrewAI 7.3, LangGraph 7.2) çok yakın bir bileşik puanla oturuyor — ama dağılım farklı. Deckent **D2 (routing) ve D10 (evrim)** boyutlarında lider/eş-lider; **D9 (adoption)** boyutunda en zayıf büyük oyuncu. "Olgunluk değil, kanıtlanmamışlık" sorunu.

---

## Deckent'in Boyut-Bazlı Konumu

**Lider olduğu yerler:**
- **D2 — Akıllı routing (9):** 3-katmanlı `intent-classifier → activation-engine → routing-engine` (routeTaskV2, 7 caller'dan canlı çağrılıyor), TaskDNA, confidence skorlama, çapraz-provider tier-eşdeğerliği (opus↔gpt-5↔gemini-2.5-pro), **kapanmış outcome-learning döngüsü** (`outcome-tracker.recordOutcome` → `learnings.json` → sonraki sprint'e geri-okuma). Rakipler agent+skill+model+provider'ı bu kadar zengin route etmiyor.
- **D10 — Evrim (8):** `sprint-finalizer.ts`'e gerçekten wire'lı pipeline: quality-assessor → rule-evolver → agent/skill promotion/demotion → mid-sprint adaptive rerouting. CrewAI 3, LangGraph 4 — onların en zayıf boyutu.

**Eş-zirvede:** D1 (8), D3 (8), D4 (8) — Kahn topological wave-scheduling; SQLite FTS5 çift-katman TR-normalize arama; 4 gerçek provider (Ollama worker artık **stub değil**, gerçek agentic tool-loop'u var — eski not düzeltildi).

**Zayıf/orta:**
- **D9 — Adoption (3):** Tek geliştirici, beta, npm'e yayımlanmamış, sıfır dış kullanıcı, ~3 aylık. %88.58 coverage + dogfood prototipin üstüne çıkarıyor ama dış doğrulama yok. **Analizdeki en belirleyici tek sayı.**
- **D6 — Enterprise (6):** Sert primitifler gerçek (OIDC RS256-pinned, alg:none reddi, anti-IDOR cross-tenant 404, HMAC audit-chain, rate-limit 429). Ama **RBAC bilinçli advisory/soft** (ADR-037 V1.0 — loglar+emit, bloke etmez; hard-flip post-GA V2). API sınırında rol-enforcement yok.
- **D7 — DX (6):** Node≥24 + docker + çoklu-CLI-auth kurulumu ağır; CrewAI'nin "birkaç satırda çalışan crew" kolaylığı (9) önde.

---

## Her Ürün — Özet, Neden Başarılı, Neden Değil

### 1. Deckent (7.0) — *bizim ürün*
**Ne:** TypeScript/ESM çok-ajanlı orkestrasyon CLI/platformu; 8-faz sprint döngüsü, Brain/Worker/Auditor üçlüsü, dosya-sistemi-koordineli tek-host motor.
**Başarılı olabilir:** Routing zekası, kalıcı öğrenme döngüsü, FTS5 hafızası **gerçekten wire'lı** (vaporware değil); sert enterprise-güvenlik primitifleri sağlam; ADR-yönetişimi + authority-matrix derin.
**Henüz değil:** Sıfır dış adoption, yayımlanmamış beta, tek geliştirici, tek-host mimari, RBAC/scope yumuşak.

### 2. CrewAI (7.3) — *en yüksek bileşik*
**Ne:** Python rol-bazlı (role/goal/backstory) framework + ticari Enterprise/AMP. MIT çekirdek, ~53.8k yıldız.
**Başarılı:** Sezgisel model → viral benimseme (100k+ sertifikalı dev, ~2 milyar workflow/12ay, "Fortune 500 %60" iddiası, $18M fonlama); AMP ile RBAC/SSO/audit/SOC 2/VPC; MCP first-class.
**Zayıf nokta:** Orkestrasyon katılığı, debugging zorluğu, **self-evolution yok (3)**, Python-only, prototip↔üretim uçurumu, dinamik routing zayıf (5).

### 3. LangGraph (7.2) — *en ciddi orkestrasyon rakibi*
**Ne:** Düşük-seviye graf-tabanlı durumlu orkestrasyon runtime (Python+JS). v1.0, ~30k yıldız.
**Başarılı:** Açık state-machine + dayanıklılık/recovery + deploy platform; **marquee üretim kullanıcıları** (Klarna, Uber, LinkedIn, J.P. Morgan, Replit) → D9=9.
**Değil:** Çok boilerplate, dik öğrenme; **akıllı routing yok (6), self-evolution yok (4)** — Deckent'in D2/D10 kaması; LangChain ekosistemine bağlı.

### 4. OpenHands (5.9) — *açık-kaynak kodlama ajanı lideri*
**Ne:** Otonom yazılım-mühendisi ajanı (eski OpenDevin), All Hands AI, MIT, ~77.6k yıldız, $23.8M fonlama, açık SWE-bench lideri.
**Başarılı:** En iyi açık SWE-bench, CodeAct, Docker-sandbox, LiteLLM 100+ model, sağlam MCP, aylık sürüm, kendini dogfood (commit'lerinin ~%20'si kendi-yazımı).
**Sınırlı:** Bilinçli dar kapsam — tek otonom *kodlama* ajanı, çok-alanlı orkestratör değil (D1=4, D2=3); güvenilirlik (döngüye girme), maliyet, Docker sürtünmesi.

### 5. Hermes Agent (6.5) — *muhtemel rakip, model-bağımsız kişisel ajan*
**Ne:** Nous Research, MIT, self-improving, model-agnostic kişisel ajan. Python+TS. (~196k yıldız iddiası **şüpheli/düşük güven**.)
**Başarılı olabilir:** Sınıfının en iyi **kalıcı hafıza + otonom skill-üretimi (D3=9, D10=9)**, vendor lock-in yok (200+ model), fonksiyon-çağırma moat'ı, omnichannel + MCP, iyi fonlanmış ($50M/Paradigm).
**Değil:** First-class çok-ajan orkestratör yok (D1=4), **enterprise yönetişim ~sıfır (D6=2)**, üretim-olgunsuz, crypto/decentralized-training entanglement'ı.
**Deckent açısından:** *base-model+kişisel-ajan* vs *orkestrasyon katmanı* — **tamamlayıcı/dolaylı rakip**.

### 6. AutoGen / AG2 (6.5)
**Ne:** Microsoft çok-ajan konuşma framework'ü. **AutoGen maintenance mode** → Microsoft Agent Framework (MAF)'a yönlendiriyor; topluluk fork'u **AG2** bağımsız devam. ~35k+ yıldız.
**Başarılı:** Olgun konuşma primitifleri, araştırma adoption'ı.
**Zayıf:** **Ekosistem üç parçaya bölünmüş** (donmuş AutoGen / AG2 / MAF) → benimseme kafa karışıklığı.

### 7. MetaGPT (6.1)
**Ne:** **Yazılım şirketini simüle eden** Python framework (PM/mimar/mühendis, SOP). ~44k–68k yıldız. AFlow → ICLR 2025 oral.
**Başarılı:** Zarif SOP/rol metaforu, tek-satır→kod demosu, araştırma pedigree'si.
**Değil:** Genel orkestrasyondan çok kod-üretim pipeline'ı; enterprise/RBAC zayıf (4), dinamik routing yok.

### 8. OpenClaw / "Molty" (6.7) — *kullanıcının sorduğu "openclaw"*
**Ne:** Peter Steinberger'in (PSPDFKit) yerel-öncelikli, MIT, TypeScript kişisel/computer-use ajanı. "Clawdbot/Moltbot" → Anthropic trademark şikayeti sonrası **OpenClaw** (~Oca 2026). channel→brain→body 3-katman, 25+ kanal. (Yıldız 68k–379k **çelişkili**.)
**Viral başarı:** Patlama-tarzı yayılım (Jensen Huang övgüsü; NVIDIA NemoClaw hardening katmanı). **Kendi skill'lerini otonom yazıyor (D10=8)**, model-agnostic (9), chat-app onboarding (8).
**Risk:** Ciddi güvenlik açığı (prompt injection, geniş host izinleri, Cisco kötü-skill veri-sızdırma), **Çin devlet kurumlarına yasakladı (Mar 2026)**, **enterprise-grade değil — RBAC/tenancy yok (D6=2)**.
**Deckent açısından:** Tasarım uzayının zıt ucu — viral kişisel ajan + self-writing skill, sıfır orkestrasyon/enterprise. "Otonom + self-evolution" tezini doğruluyor; Deckent'in güçlü olduğu yerde (D6) zayıf.

---

## Onursal Mansiyon (doğrudan rakip değil, önemli)

- **Devin (Cognition):** Kapalı/ticari otonom yazılım-mühendisi, ACU fiyat ($20→$500+/ay), ~$25B değerleme söylentisi. Gerçek enterprise kontrolleri. Açık platform değil.
- **SWE-agent (Princeton):** ACI fikri; mini-swe-agent ~100 satırla SWE-bench >%74. Araştırma aracı.
- **Aider:** Terminal pair-programmer, ~40k yıldız, mükemmel git-native DX. Tek-ajan.
- **Goose (Block):** Rust, Apache 2.0, **Linux Foundation/AAIF yönetişimi**, 70+ MCP extension. Genel ajan.
- **Cline / Roo Code:** VS Code ajanları; Cline ~58–61k yıldız; **Roo Code ekibi Nis 2026'da kapanış açıkladı** (istikrar riski).
- **Claude Code / Codex CLI / Gemini CLI:** Deckent'in *orkestre ettiği* ama aynı zamanda *rakip* frontier ajanları. Terminal-Bench 2.1: Codex CLI %83.4 #1, Claude Code %78.9 #2. Gemini CLI → "Antigravity CLI" geçişi/free-tier kesimi bugüne (2026-06-18) tarihli — canlı kontrol et.

---

## Stratejik Çıkarımlar (çift bakış: dogfood + ürün)

1. **Kama net: D2 + D10.** Hiçbir büyük orkestratör (CrewAI 5/3, LangGraph 6/4, AutoGen 6/5) akıllı çok-sinyalli routing **ve** kapalı self-evolution döngüsünü birlikte sunmuyor. Pazarlama hikayesi: "kendini route eden + kendini geliştiren orkestratör."
2. **En büyük açık D9 (adoption), teknik değil ekonomik/operasyonel.** Kod gerçek; eksik olan npm-publish + ilk kullanıcılar + topluluk. Sprint'le değil **dağıtım/GA kararıyla** kapanır.
3. **D6'yı sertleştirmek farklılaştırıcı.** OpenClaw (2) ve Hermes (2) enterprise'da çökerken, RBAC hard-enforce (ADR-037 V2) + API-boundary rol-enforcement Deckent'i ayırır.
4. **DX (D7) borcu adoption'ı boğabilir.** CrewAI 9'a karşı 6 — "tek-komut başlat" + chat-intent netliği D9'u doğrudan besler.
5. **Konumlandırma:** Hermes/OpenClaw'a *tamamlayıcı*; CrewAI/LangGraph/AutoGen'e *doğrudan rakip*; OpenHands/Aider/Cline'a *üst-katman* (worker olarak orkestre eder). Tek-cümle: **"Açık çok-ajan orkestratörlerin akıllı-routing + kendi-kendini geliştiren + enterprise-grade hali."**

---

## Veri Güvenilirlik Notları
- Hermes ~196k ve OpenClaw 68k–379k yıldız → web'de şişkin/çelişkili, düşük güven.
- CrewAI "Fortune 500 %60 / 2 milyar workflow" = şirket-beyanı, denetlenmemiş.
- OpenHands SWE-bench %72 = best-config; tipik %32–53; güncel Haz-2026 sıralaması bilinmiyor.
- Deckent metrikleri **kod-doğrulamalı** (28,453 test descriptor, 88.58% coverage, 1,429 commit / 94 gün).
- Rakip puanları toplanan kaynaklardan **analist yargısı**.
