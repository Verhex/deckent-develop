# Vizyon & Yol Haritası — "Open Source for Open World"

> Makinenizde çalışan, hiçbir şeye bağlanmayan, gelişen bir AI runtime ekosistemi — bir geliştirici için de, bir şirket için de, bir bireysel kullanıcı için de.

## Ne işe yarar?

- **Trinity motoru** — tek codebase, üç yüz: geliştirici sprint modu, şirket süreç modu, bireysel sohbet modu.
- **Otonom sürekli runtime** — tetikleyici → analiz → RBAC + onay kapısı → yürüt → denetle döngüsü; kısa sprint ötesi uzun soluklu ajan davranışı.
- **ERP & kurumsal runtime** — şirketin içinde çalışır; sipariş/MRP/dosya analizini kendi RBAC kurallarınla yönetir.
- **Multi-provider fleet** — Claude + Gemini + Codex + Ollama (yerel) aynı anda koordine; API anahtarı zorunlu değil.
- **Sürekli öğrenen** — her sprint retro'su routing kararlarını, agent/skill seçimini ve prompt evrimini besler; sistem zamanla kendi kendine gelişir.
- **MIT, ücretsiz** — pro/team/enterprise sürüm yok; kurumsal katmanlar (RBAC, audit, multi-tenant) aynı lisansta herkese açık.

## Neden önemli?

- **"Open source for open world"** — never-calls-home, yerel SQLite belleği; veriler hiçbir zaman makinenden çıkmaz.
- **Tek ürün tam güç** — bireysel geliştirici ile 10.000 kişilik şirket aynı motoru çalıştırır; gizli özellik kapısı yok (ADR-033).
- **Evrimsel mimari moat** — routing + prompt-evolution + adaptive-agent öğrenme döngüsü tek bir özellikten çok daha kalıcı bir farklılaştırıcıdır.

## Nasıl çalışır? — Bugün ✅ / Yolda 🔜

| Alan | Durum |
|------|-------|
| Sprint Mode (geliştirici yüzü) | ✅ Canlı — 285+ sprint dogfood, GO/NO_GO/GO_WITH_TECH_DEBT değerlendirme, dependency-pipeline waves |
| Chat Mode (bireysel yüz) | ✅ Canlı — `deckent` REPL (Ink tabanlı), streaming, slash-menü, session-persist |
| Enterprise RBAC/audit | ✅ Canlı — enforceRbac, JSON+CSV+HMAC audit, rate-limiter, multi-tenant |
| Memory V2 (DB-first) | ✅ Canlı — SQLite FTS5, dual-layer i18n normalize, `deckent recall/remember` |
| Evolutionary architecture | ✅ Canlı — 6 evrim modülü (outcome-tracker, promotion-pipeline, adaptive-thresholds vb.) |
| Multi-provider fleet | ✅ Canlı — Claude + Codex + Gemini + Ollama bootstrap kayıtlı; per-task override |
| Autonomous engine | ✅ Canlı — `deckent autonomous`, backlog (pending/running/parked/done/failed), cron/one-off/reactive tetikleyiciler, 3-gate governance (RBAC→policy→risk), `runtime-loop.ts` tam bağlı |
| **Native-agent REPL** | 🔜 Deneysel / opt-in — `DECKENT_NATIVE_AGENT=1` veya `--native` flag (varsayılan OFF) |
| **ERP runtime / Capability Broker** | 🔜 Planlandı — F8 Capability Broker (backlog-types: capabilityTarget şeması hazır, çalışma ortamı adaptörleri henüz yok) |
| **Yerel LLM tam preset** | 🔜 Kısmi — OllamaAdapter canlı; chat/REPL çalışır; sprint-worker tam preset ve CUDA doğrulaması yolda |
| **Million-user (k8s/mTLS)** | 🔜 Kısmi — token auth canlı; k8s pod-exec, row-level security, HSM henüz yok |
| **Ses arayüzü** | 🔜 Gated — Whisper STT + TTS |
| **Mobil (iOS/Android)** | 🔜 Gated |

## Temel Özellikler — Bugün

### Autonomous Engine

`deckent autonomous` ile otonom backlog yönetimi:

```bash
# Autonomous durumunu gör
deckent autonomous status

# Backlog'a tek seferlik görev ekle
deckent autonomous backlog add --kind task --title "Güvenlik taraması" --policy approval-required

# Periyodik görev (her gece saat 02:00)
deckent autonomous backlog add --kind sprint --cron "0 2 * * *" --title "Gece bakım sprinti"

# Otonom runtime'ı durdur
deckent autonomous stop
```

### Native-Agent REPL (deneysel)

Argümansız `deckent` komutu Ink tabanlı etkileşimli REPL'i başlatır. Native-agent (agentic tool-use) modu opt-in:

```bash
# Standart REPL (tüm kullanıcılara açık)
deckent

# Native-agent modu — deneysel, opt-in
DECKENT_NATIVE_AGENT=1 deckent
# veya
deckent --native
```

### Multi-Provider Fleet

```bash
# Per-task provider override (DIRECTIVES.md)
# - Provider: codex
# - Model: gpt-4.1

# Dinamik config
deckent config set brain_provider claude
deckent config set worker_provider gemini

# Yerel LLM (chat modu)
deckent config set chat_provider ollama
deckent chat
```

## Vizyon — Agentic Runtime Ekosistemi

Deckent'in uzun vadeli yönü tek bir CLI aracının ötesine geçer: her yazılım projesinin içinde çalışan, organizasyonun zihinsel modelini öğrenen ve görevleri proaktif olarak tamamlayan bir **agentic runtime platformu**.

Bu platformun üç katmanı:

1. **Sprint & Task motoru** — geliştirici odaklı, kod değişikliği yapan ajan orkestrasyonu (bugün canlı).
2. **Autonomous engine** — uzun soluklu, tetikleyici tabanlı, 3-gate governance'lı süreç yönetimi (bugün canlı, evrimiçi).
3. **Capability Broker** — şirket sistemlerine (ERP, e-posta, veritabanı) bağlanan, kullanıcı onayıyla iş kapasitesini genişleten ajan katmanı (yolda).

## Durum

- Olgunluk: ✅ **sprint modu + autonomous engine + Chat REPL + Enterprise RBAC canlı** · 🔜 **native-agent deneysel / ERP broker + tam local-LLM yolda**
- Bugün güçlü: Sprint Mode, Autonomous Engine, Chat REPL, multi-provider fleet, Enterprise RBAC, Memory V2, evolutionary learning
- Yolda: Native-agent REPL (stable), Capability Broker (F8), yerel LLM tam preset, million-user ölçek
- İlgili: ADR-033 (Product-Not-Service) · ADR-040 (Nervous) · ADR-065 (İki-repo) · ADR-081 (Agentic REPL) · ADR-064 (TOPP) · ADR-071 (Autonomous)
- Daha fazla: [deckent.ai](https://deckent.ai)
