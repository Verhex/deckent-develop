# ADR-033: Product Vision — Product Not Service

**Status:** accepted

**Date:** 2026-04-11

**Sprint:** 134

---

**Context:**
Deckent, Sprint 134 itibarıyla kritik bir kavramsal dönüm noktasına ulaştı. 130+ sprint sürecinde organik büyüme, zaman zaman "SaaS platform" ya da "kurumsal servis" yönünde baskı yarattı: cloud deployment fikirleri, paywall tartışmaları, enterprise tier düşünceleri, SOC2 sertifikasyonu önerileri. Bu baskıların tamamı tek bir tutarsızlık kaynağından besleniyor:

**Deckent'in ne olduğu hiçbir zaman formal olarak kayıt altına alınmamıştı.**

Kullanıcı deneyimi gözlemleri:
- Yeni geliştirici `npx deckent init && deckent start` ile <5 dakikada sprint başlatabilmeli
- Kurulum, lisans, bulut hesabı, API anahtarı, ödeme bilgisi gerektirmemeli
- Deckent offline çalışabilmeli (Claude Code local session ile)
- Her proje kendi `.deckent/` dizinine sahip — veri hiçbir yerde paylaşılmıyor

Sprint 133 post-mortem'de "product-not-service" ifadesi üç ayrı bağlamda kullanıldı ve herhangi bir şekilde formalize edilmedi. Sprint 134 DIRECTIVES bu boşluğu kapatmak için T-007'yi "DOKUNULAMAZ VİZYON" olarak işaretledi.

Referans bellek: proje hafızası — `memory.db` entry `project_vision_product_not_service` (Memory V2; `deckent recall "product not service"`)

**Decision:**
Deckent bir **üründür (product)**, **servis değildir (not service)**.

Bu kararın dört dokunulamaz prensibi:

1. **Product, not service** — Deckent bulutta yaşamaz. Kullanıcının makinesinde çalışır. Bir API endpoint'e bağımlı değildir. Sunucu yoktur, uptime SLA'sı yoktur, oncall ekibi yoktur.

2. **Kur-çalıştır kolay** — `npx deckent init && deckent start` iki komutla tam işlevsel bir sprint orkestrasyon sistemi kurulur. Kurulum friction'ı sıfıra yakın olmalıdır. Wizard, interaktif setup, README-first onboarding.

3. **Açık kaynak, ücretsiz** — Deckent'in hiçbir özelliği ödeme duvarının arkasında olamaz. Tüm core özellikler MIT lisansı altında. Topluluk katkısı teşvik edilir. Fiyatlandırma modeli yoktur.

4. **Herkese, her yerde** — macOS, Linux, WSL2, Docker, CI ortamları. Dil engeli yoktur (TR/EN i18n). Bant genişliği kısıtlı ortamlarda çalışır. Local model desteği roadmap'te.

**Kaldırılan / Yasak Boyutlar:**

Bu karar aşağıdaki yönlerin Deckent roadmap'inden kalıcı olarak çıkarıldığını ilan eder:

| Boyut | Neden Yasak |
|-------|-------------|
| SaaS model | Sunucu bağımlılığı yaratır, product kimliğiyle çelişir |
| Cloud-hosted deployment | Kullanıcı verisini dışarı taşır, gizlilik ilkesini kırar |
| Paywall / premium tier | Açık kaynak taahhüdüyle uyumsuz |
| Enterprise edition | İki kod tabanı yaratır, topluluk bölünmesine yol açar |
| SOC2 / ISO 27001 sertifikasyonu | Kurumsal servis modeli gerektirir, ürün kimliğiyle çelişir |
| Oncall / SLA / uptime monitoring | Servis sorumluluğu gerektirir — ürün mimarisinde geçersiz |
| Multi-tenant cloud infrastructure | ADR-034 ile net ayrım: multi-project ≠ multi-tenant SaaS |
| Subscription billing | Ödeme altyapısı = servis olmak demektir |
| Vendor lock-in | Belirli bir bulut sağlayıcısına bağımlılık kabul edilemez |

**Korunan / Güçlendirilen Boyutlar:**

Bu karar aşağıdaki yönlerin öncelikli geliştirme alanları olduğunu teyit eder:

| Boyut | Gerekçe |
|-------|---------|
| Local observability | Kullanıcı kendi sprint metriklerini kendi makinesinde görür (T-011) |
| God object split | Modüler, anlaşılabilir kod = ürün kalitesi (T-009, T-010) |
| Task dependency pipeline | Gerçek orkestrasyon zekası, ürün değer önerisi (T-001) |
| Distribution | `npx deckent` — sıfır kurulum, her yerde çalışır |
| Setup wizard | İlk deneyim mükemmel olmalı — kur-çalıştır hedefi |
| Local model support | Offline-first, API key gerektirmeyen sprint modu (roadmap) |
| i18n / TR-EN | Ürün her kullanıcıya kendi dilinde konuşur |
| Cross-platform | macOS + Linux + WSL2 + Docker = herkese her yerde |
| Açık kaynak ekosistemi | OpenHands, Aider, OpenClaw ile ittifak — değer paylaşımı |

**Consequences (+):**

- Tüm mühendislik kararları net bir lens üzerinden geçer: "Bu özellik local product deneyimini mi güçlendiriyor?"
- Roadmap tartışmalarında "SaaS yapalım mı?" sorusu geçerliliğini yitirir — ADR-033 referans gösterilir
- Katkıda bulunanlar ürün kimliğini anlar, yanlış yönlü PR'lar azalır
- OpenHands ve Aider gibi open-source CLI araçlarla ekosistem uyumu artar
- Kullanıcı trust'ı: veri asla dışarı çıkmıyor, garantisi var

**Consequences (-):**

- Gelecekte kurumsal gelir modeli kurmak isteyenler için kapı kapalı
- Hosting hizmeti sunmak isteyen community fork'ları bu ADR'a aykırı davranır
- "Managed Deckent cloud" gibi ticari girişimlerin core repo'ya merge edilmesi reddedilir
- SaaS rakiplerine karşı "anında erişim" avantajı kaybolur (kurulum gerekir, kayıt yok)

**Alternatives Considered:**

- **Freemium SaaS** — Ücretsiz tier + premium bulut özellikleri. Reddedildi: iki kimlik yaratır, açık kaynak taahhüdünü sulandırır.
- **Enterprise self-hosted** — Kurumsal lisans, on-prem deployment. Reddedildi: farklı destek altyapısı gerektirir, topluluktan kopuş başlar.
- **Hibrit model** — Core açık kaynak, bulut senkronizasyon eklentisi. Reddedildi: "her şey local" ilkesini kırar, veri akışı gizlilik sorusu yaratır.
- **Platform agnostik (karar erteleme)** — Şimdilik karar verme, her iki yöne açık kal. Reddedildi: belirsizlik mühendislik maliyeti yaratır, yanlış yönlü feature'lar birikmesine neden olur.

**References:**

- Sprint 134 DIRECTIVES — "DOKUNULAMAZ VİZYON" bölümü
- Proje hafızası: `memory.db` entry `project_vision_product_not_service` (Memory V2)
- ADR-034: Multi-Project Isolation (kardeş ADR — multi-project ≠ SaaS multi-tenant)
- ADR-010: Minimal Dependencies (bağımlılık minimizasyonu, product kimliğiyle uyumlu)
- `docs/vision/roadmap.md` — Halka açık yol haritası, product vizyonu pazarlama diliyle
- OpenClaw GitHub — kur-çalıştır referans implementasyon
- Sprint 134 design spec: `docs/superpowers/specs/2026-04-11-sprint-134-design.md`
- ADR-008: Module Import Rules — brain/worker sınır disiplini tek-kod-tabanı product kimliğini güçlendirir (SaaS servis katmanına ihtiyaç bırakmaz, community fork'lar aynı sınırları korur)

---
