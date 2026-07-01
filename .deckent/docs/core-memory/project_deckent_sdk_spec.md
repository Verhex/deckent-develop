---
name: project_deckent_sdk_spec
description: "🆕 (06-16) Deckent SDK taslak-spec'i YAZILDI (commit c9f33efd, docs/superpowers/specs/2026-06-16-deckent-sdk-design.md). deckent'in KENDİ idiom'lu gömülebilir TS SDK'sı. Implementasyon ERTELENDİ — şimdilik yalnız doküman. Kararlar kilitli (hero=embed, katmanlı, en-geniş-kapsam, yaklaşım ①, Claude Agent SDK config-gated seam)."
metadata: 
  node_type: memory
  type: project
  originSessionId: fa6fce1f-36e1-40e7-a23e-2bf105427bc1
---

**Ne:** Brainstorming oturumuyla (06-16) deckent'in **kendi SDK'sı** için kapsamlı taslak tasarım yazıldı. Spec: `docs/superpowers/specs/2026-06-16-deckent-sdk-design.md` (commit `c9f33efd`, develop repo'da tracked). **Implementasyon yok** — Alperen "ileride hayata geçireceğiz, şimdi kapsamlı dokümante edelim" dedi.

**Kilitli kararlar (D1–D5):**
- **D1 Hero = embed-engine:** geliştirici deckent'i KENDİ uygulamasına motor olarak gömer (`runSprint`/`task`, event-stream, sonuç). SaaS-client sonra bunun ağ-üzeri ikizi.
- **D2 Katmanlı:** düşük-seviye in-process core + yüksek-seviye **managed runtime** (varsayılan, non-blocking, out-of-process). Tek client yüzeyi, mod/transport değişir.
- **D3 En geniş kapsam:** orkestrasyon + gözlem + kontrol + memory(oku/yaz) + config/directives + **extensibility (kendi provider/agent/skill/tool kaydı)**. MVP yok.
- **D4 Yaklaşım ①:** adanmış `src/sdk/` katmanı + **transport-swappable** client (`LocalTransport` ↔ `HttpTransport` = SaaS ikizi neredeyse bedava). Reddedildi: ② ince facade (own-idiom zayıf, internals sızar), ③ protokol-önce daemon (en büyük yeniden-mimari, ayrı gelecek arc).
- **D5 Claude Agent SDK = ertelenmiş, config-gated provider seam:** `defineProvider` örneği olarak `providers.claude_sdk.enabled` arkasında; kapalıyken peer-dep hiç yüklenmez (ADR-010 korunur). Agent SDK zaten `claude` CLI sarmalayıcısı → faturayı DEĞİŞTİRMEZ, kazanç entegrasyon-kalitesi (kırılgan `claude -p` stdout-parse'ı bitirir). Bu seam, abonelik-politikası riskine ([[project_anthropic_subscription_credit_postponed]]) karşı hedge.

**İdiom özeti:** fiil-metotlar (`dk.sprint/task/plan`, CLI'ı yansıtır) · Run = canlı handle (await→sonuç, iterate→event, metot→kontrol) · `dk.memory.*`/`dk.config.*` namespace · `define*` fabrikaları (zod YOK, el-JSON-Schema, ADR-010) · `"./sdk"` kararlı export / `"."` internal işaretli.

**§8 NETLEŞTİRİLDİ (06-16, commit `103fa2b8`):** (1) Runner = `deckent serve` **reuse** (twin-örtüşme max; `runner.ts` yalnız lifecycle-wrap). (2) define* cross-process = serileştirilebilir-metadata + module-specifier (handler IPC'den serileşmez → managed runner modülü import eder; in-process doğrudan kayıt). (3) LocalTransport'ta da **bearer-token** (ephemeral auto-gen, twin-parite; "trusted local socket" yok). (4) Versiyon = v1 subpath `deckent/sdk` paket-versiyonuyla + `SDK_API_VERSION` sabiti + stabilite/deprecation politikası; gerekirse ileride ayrı `@deckent/sdk`.

**MASTER-PLAN:** §17 "DECKENT SDK" olarak eklendi (son madde, commit `103fa2b8`); sıralama notu: MOD-SPLIT'ten ÖNCEYE alınabilir (SDK kontratı + provider-seam = enterprise-modül bölmesinin doğal sınırı). Footer lossless-map invariant'ı §17'yi kapsar.

**İlgili:** [[project_deckent_core_model_and_provider]] (item-3 "kendi SDK" buradan somutlaştı), [[project_anthropic_subscription_credit_postponed]] (D5 hedge), [[project_deckent_runtime_ecosystem]]. Yeni ADR önerisi: "Deckent SDK Contract" (impl başlarken).
