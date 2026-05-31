---
name: feedback-worker-prompt-engineering-god-level
description: "Worker prompt'larında 10 template hijyen sorunu tespit edildi (Opus analizi, 2026-05-26 195-004 prompt audit); mimari ileri seviye ama task injection katmanı generic template'i göreve adapte etmiyor — prompt mühendisliği god-level seviyesine taşınmalı (Sprint 196+ stream)."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kanıt:** 2026-05-26 Sprint 195 koşulurken Alperen, `task-195-004.prompt-*.txt` dosyasını Opus ile analiz etti. Sprint 194-001 (W-AUTH) ve 195-004 (models.dev bootstrap) gibi CLI/Node.js task'larında temp-react-ts-specialist persona'sı atanmış — yanlış agent + task domain. Bu chronic pattern (Sprint 193'te de aynı agent görüldü).

### Tespit edilen 10 sorun

**KRİTİK:**
1. **Persona ↔ task domain uyuşmazlığı** — `temp-react-ts-specialist` (React + Vitest/RTL) ama task CLI bootstrap / Node.js / model-catalog işi. Agent template render katmanı persona-task validation yapmıyor. `task-builder.ts` veya `agent-pool.ts`'te selectAgent() routing bug'ı.
2. **Boş `=== Task ===` bloğu** + tekrar `## Your Task` altta — template double-render. Token israfı + karışıklık.
3. **Dil tutarsızlığı** — görev Türkçe, skills/disciplines İngilizce. Plan/result dosyası hangi dilde olacak belirsiz.

**ORTA:**
4. **OPSİYONEL DALGA bloğu eksik içerik** — sadece "Model: sonnet, Effort: normal" var, ne yapılacağı yazılmamış. (Bu Sprint 195 DIRECTIVES yazarken bizim hatamızdı, opsiyonel task body'sini yanlış konuma yerleştirdim — düzeltilmeli.)
5. **Idempotency Key context mismatch** — GET fetch için anlamsız (POST/PUT için). Generic template kalıntısı. Task tipine göre koşullu inject olmalı.
6. **bootstrapFromCatalog behavior gap** — `force?: boolean` parametre imzada var ama test/doc tanımsız. Singleton thread-safety, 5s timeout doğrulanmamış varsayım.
7. **Token estimation imkansız istek** — `inputTokens/outputTokens "best estimate"` worker'dan isteniyor, LLM kendi token kullanımını güvenilir tahmin edemez. Orchestrator (token counter API) doldurmalı, worker'a bırakılmamalı.
8. **Test kapsam tutarsızlığı** — Kanıt "tek test dosyası" diyor, CRITICAL VERIFY "full suite" istiyor. Worker yeni testler geçince DONE diyebilir, regresyon kaçabilir. "Hedef test + full suite, ikisi de geç" netleştirilmeli.

**DÜŞÜK:**
9. **`.plan` dosyası şablon yok** — result için JSON şema var, plan serbest format. Tutarsız titizlik.
10. **Heartbeat sıklığı muğlak** — "Periodically" ne kadar? (Saniye/dakika/tool-call?) Watchdog timeout false-positive riski.

### Güçlü yanlar (korunmalı)

- Scope izolasyonu (filesWrite/filesRead net + auditor git diff)
- Kanıt-temelli "DONE" tanımı (grep komutları, baseline/end/delta)
- Self-assessment 3-kademeli + "false DONE > truthful NO_GO" doğrulu vurgusu
- ADR mandatory constraint + Karpathy 4-discipline anchor
- Anti-pattern listelerinin somutluğu

### Why

Mimari olgunluk yüksek, **template hijyeni** zayıf. Generic template task injection katmanında göreve özgü adapte edilmiyor. Sprint 193/194 false NO_GO'ların bir kısmı + Sprint 195'te 195-004 cost şişmesi muhtemelen prompt quality kaynaklı.

### How to apply (Sprint 196+ Worker Prompt God-Level Stream)

**Acil (Sprint 196'da landable, ~4-6 task):**
- **WP-1**: Persona-task domain matcher — `task-builder.ts` selectAgent()'a domain validation: task scope src/cli/ + src/core/ → CLI specialist, React/UI scope yoksa temp-react-ts atanmaz
- **WP-2**: Template double-render fix — boş `=== Task ===` bloğunu kaldır, tek task field
- **WP-3**: Conditional Idempotency Key inject — sadece task POST/PUT/external write yapıyorsa
- **WP-4**: tokenUsage orchestrator-side doldur — worker'dan kaldır, IPC üzerinden token counter inject
- **WP-5**: `.plan` JSON şema — result gibi structured
- **WP-6**: Heartbeat frekans belirt — "30 saniyede bir + her tool call sonrası"

**Orta vadeli (Sprint 197+):**
- **WP-7**: Dil seçim flag — DIRECTIVES'te `- Language: tr|en` ile prompt/plan/result dili netleştir
- **WP-8**: Test kapsam pipeline — "hedef test + full suite + regresyon delta" net adımlar
- **WP-9**: Behavior gap auto-detector — interface signature'da olup test'te olmayan parametreler için warn

**Uzun vadeli (post-beta, "god-level" hedef):**
- **WP-10**: Prompt cost telemetry — her sprint'te worker prompt'larının token tüketimi + outcome mapping → optimize döngüsü
- **WP-11**: Persona library refactor — temp-* agent'lar generic değil, domain-specific (CLI / API / Test / Doc / Architecture)
- **WP-12**: Prompt A/B testing — aynı task farklı prompt versiyonları, success rate ölç

### Sprint 195 ironi

195-004 worker'ı persona uyuşmazlığına rağmen task'ı DONE landed (+60 LoC, models.dev bootstrap). Yani persona mismatch görev performansını TAM bloke etmiyor — ama maliyet/kalite/güvenilirlik risk altında. "Çalışıyor" ≠ "doğru çalışıyor".

İlgili: [[feedback_proactive_blocker_disclosure]] (worker'lara giden prompt'lar bilinen blocker disclosure'ı içermeli), [[project_4cli_subscription_vision]] (multi-provider prompt'lar her CLI'ya uyarlanmalı)
