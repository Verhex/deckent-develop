# Vizyon & Yol Haritası — "Open Source for Open World"

> Makinenizde çalışan, hiçbir şeye bağlanmayan, gelişen bir AI runtime ekosistemi — bir geliştirici için de, bir şirket için de, bir bireysel kullanıcı için de.

## Ne işe yarar?

- **Trinity motoru** — tek codebase, üç yüz: geliştirici sprint modu, şirket süreç modu, bireysel sohbet modu.
- **Otonom sürekli runtime** — tetikleyici → analiz → RBAC + onay kapısı → yürüt → denetle döngüsü; kısa sprint ötesi uzun soluklu ajan davranışı.
- **ERP & kurumsal runtime** — şirketin içinde çalışır; sipariş/MRP/dosya analizini kendi RBAC kurallarınla yönetir.
- **Multi-provider 8-fleet** — Claude + Gemini + Codex aboneliği + DeepSeek/Qwen/GLM API + yerel Ollama aynı anda koordine; API anahtarı zorunlu değil.
- **Sürekli öğrenen** — her sprint retro'su routing kararlarını, agent/skill seçimini ve prompt evrimini besler; sistem zamanla kendi kendine gelişir.
- **MIT, ücretsiz** — pro/team/enterprise sürüm yok; kurumsal katmanlar (RBAC, audit, multi-tenant) aynı lisansta herkese açık.

## Neden önemli?

- **"Open source for open world"** — never-calls-home, yerel SQLite belleği; veriler hiçbir zaman makinenden çıkmaz.
- **Tek ürün tam güç** — bireysel geliştirici ile 10.000 kişilik şirket aynı motoru çalıştırır; gizli özellik kapısı yok (ADR-033).
- **Evrimsel mimari moat** — routing + prompt-evolution + adaptive-agent öğrenme döngüsü tek bir özellikten çok daha kalıcı bir farklılaştırıcıdır.

## Nasıl çalışır? — Bugün ✅ / Yarın 🔜

| Alan | Durum |
|------|-------|
| Sprint Mode (geliştirici yüzü) | ✅ ~%90 — 224 sprint dogfood, GO/NO_GO/GO_WITH_TECH_DEBT değerlendirme |
| Process Mode (şirket yüzü) | ✅ ~%85 — scheduled-flow, self-dispatch guard, flow-runtime daemon |
| Chat Mode (bireysel yüz) | ✅ ~%80 — `deckent` REPL, canlı streaming, slash-menü, session-persist |
| 8-provider fleet | ✅ ~%95 — Claude+Gemini+Codex+DeepSeek+Qwen+GLM+Ollama bootstrap kayıtlı |
| Enterprise RBAC/audit | ✅ %100 — enforceRbac, JSON+CSV+HMAC audit, rate-limiter, multi-tenant |
| Evolutionary architecture | ✅ ~%90 — 6 evrim modülü canlı caller ile (Sprint 212, ADR-075) |
| **Otonom sürekli runtime (F3-009)** | 🔜 ~%40 — iskelet var (autonomous-runtime.ts), gerçek wire roadmap (Sprint 225) |
| **ERP runtime / Capability Broker** | 🔜 önerildi — F8 Capability Broker henüz inşa edilmedi |
| **Yerel LLM tam preset** | 🔜 kısmi — OllamaAdapter canlı; tam yerel sprint preset + CUDA doğrulaması eksik |
| **Million-user (k8s/mTLS)** | 🔜 kısmi — token auth canlı; k8s pod-exec, row-level security, HSM yok |
| **Ses arayüzü** | 🔜 gated — 10K GitHub yıldız sonrası (Whisper STT + TTS) |
| **Mobil (iOS/Android)** | 🔜 gated — 50K GitHub yıldız sonrası |

## Komut / Örnek

```bash
# Bireysel geliştirici — sprint başlat
deckent start

# Şirket — sürekli süreç modu 🔜 (Sprint 225, henüz yok)
# deckent autonomous   # F3-009 wire tamamlandığında kullanılabilecek

# Multi-provider — provider seç
deckent config set brain_provider claude
deckent config set worker_provider gemini

# Yerel LLM (kısmi — OllamaAdapter canlı)
deckent config set chat_provider ollama
deckent chat
```

## Durum

- Olgunluk: ✅ **sprint modu canlı** · 🔜 **otonom runtime + ERP + tam local-LLM yolda**
- Bugün güçlü: Sprint Mode, Chat REPL, 8-provider fleet, Enterprise RBAC, Memory V2, evrimsel öğrenme
- Yarın hedef: F3-009 otonom wire (Sprint 225), Capability Broker (F8), yerel LLM preset (sub-#5), million-user ölçek (sub-#3)
- İlgili: ADR-033 (Product-Not-Service) · ADR-040 (Nervous) · ADR-065 (İki-repo) · ADR-081 (Agentic REPL) · `docs/MASTER-PLAN.md` §1/§5/§10
