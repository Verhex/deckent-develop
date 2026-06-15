# Vizyon ve Konumlandırma

deckent, AI destekli yazılım geliştirmeyi bireysel geliştiricinin makinesinde —  herhangi bir bulut hesabı, abonelik ya da kurumsal lisans gerektirmeden — god-level kalitede yürütmek için tasarlanmış açık kaynaklı bir orkestrasyon ürünüdür. Ürünün varoluş amacı, birden fazla uzmanlaşmış AI agent'ı koordineli biçimde çalıştırarak tek bir geliştirici deneyimini gerçek bir yazılım ekibinin üretkenliğine taşımaktır.

---

## Ürün Vizyonu: Agentic-OS

deckent'in uzun vadeli yönü, tek bir iş için çağrılan bir CLI aracının ötesine geçerek bir **agentic işletim sistemi** olmaktır (ADR-081). Bu vizyon şu anlama gelir:

- Geliştirici `deckent` komutunu çalıştırdığında, bir REPL (Read-Eval-Print Loop) açılır.
- REPL içinde doğal dil komutları ve yapılandırılmış direktifler aynı anda çalışır.
- Arkada çalışan **Nervous System** (ADR-040), projedeki değişiklikleri izler, riskleri tespit eder ve geliştiriciye aksiyon önerir — sormadan.
- **Autonomous Engine**, tekrarlayan görevleri cron tabanlı veya reaktif tetikleyicilerle kendiliğinden başlatır.

Bu yaklaşım deckent'i "soru sor, cevap al" modelinden çıkarıp "proaktif kolaboratör" modeline taşır.

---

## Product-Not-Service İlkesi (ADR-033)

deckent bir **üründür, servis değildir.** Bu ayrım, tüm mimari kararların temel filtresidir.

| Ürün | Servis |
|------|--------|
| Kullanıcı makinesinde çalışır | Bulut sunucusunda çalışır |
| Veri dışarıya çıkmaz | Veri sağlayıcıya gider |
| Kurulum: `npx deckent init` | Kayıt, ödeme, yapılandırma |
| Offline çalışabilir | İnternet bağlantısı zorunlu |
| MIT lisansı, ücretsiz | Abonelik veya kullanım ücreti |

Bu ilkenin pratik yansımaları:

- **SaaS barındırma, cloud-hosted deployment, paywall:** Kalıcı olarak roadmap dışı.
- **Çoklu kiracı (multi-tenant) SaaS:** ADR-034 ile ayrıca yasaklı — multi-project isolation ≠ SaaS multi-tenancy.
- **Vendor lock-in:** Belirli bir cloud sağlayıcısına bağımlılık kabul edilmez; Claude, Codex, Gemini ve Ollama eş düzeyde desteklenir.

ADR-033'ün 2026 Sprint 281 güncellemesiyle enterprise yetenekler ayrı bir ürün veya fork olarak değil, **aynı kod tabanında modüler bir katman** olarak tanımlanmıştır. Community çekirdeği MIT, ücretsiz ve tam işlevsel olmaya devam eder.

---

## God-Level / Enterprise-Grade Kalite

deckent'in tasarım kalite çıtası şu üç ilkeyle tanımlanır:

1. **i18n-first:** Kullanıcıya görünen hiçbir string hardcode değildir. Tüm metinler `getMessage(key, lang)` üzerinden gelir (`src/cli/helpers/messages.ts`, TR/EN). Bu kural, tüm mekanizma modüllerini (TUI/render/controller) string-free tutar.

2. **Teknik borç yasağı:** MVP, placeholder veya "sonra düzeltirim" yaklaşımı kabul edilmez. Kısa yollar açıkça işaretlenir ve nedeni belirtilir. Sessiz borç bırakmak red sebebidir.

3. **Proof-of-Function:** Kullanıcıya dokunan her değişiklik gerçek binary çalıştırmasıyla doğrulanır (ADR-079 Tier-1 kriteri). Mock-only test yeterli sayılmaz.

---

## MIT Açık Kaynak

deckent, MIT lisansı altında tamamen açık kaynak olarak geliştirilmektedir. Bu tercih;

- Topluluk katkısını engelsiz açar.
- Fiyatlandırma tartışmalarını sonlandırır: tüm özellikler herkese ücretsiz.
- Kurumsal müşterilerin "bağımlılık riski" endişesini ortadan kaldırır — kod daima erişilebilir.
- Standart MCP protokolü üzerinden uyumlu tüm istemci ve araçlarla ekosistem entegrasyonu sağlar.

---

## Çok-Provider Bağımsızlığı (ADR-066)

deckent, hiçbir tek AI sağlayıcısına bağımlı değildir. Model seçimi tier tabanlıdır; geliştiricinin hangi API anahtarına sahip olduğuna göre görevler otomatik yönlendirilir:

| Tier | Claude | Codex (OpenAI) | Gemini |
|------|--------|---------------|--------|
| premium_plus | fable | o3 | gemini-3.1-pro-preview |
| premium | opus | gpt-5 | gemini-2.5-pro |
| standard | sonnet | gpt-4.1, o4-mini | gemini-2.5-flash |
| economy | haiku | gpt-5-mini, gpt-4.1-mini | gemini-2.0-flash |

Yerel çalıştırma için Ollama desteği de mevcuttur — tam offline sprint, API anahtarı gerektirmez.

---

## Yerel Gözlemlenebilirlik

deckent, her sprintin metriklerini doğrudan geliştirici makinesinde tutar:

- `.brain/memory.db` — SQLite, tek doğruluk kaynağı, tüm ADR/karar/retrospektif
- `.dashboard` — her 30 saniyede güncellenen sprint durumu
- `deckent status` — aktif worker'lar, uyarılar, ilerleme
- `deckent recall "<sorgu>"` — geçmiş sprintleri FTS5 ile sorgula

Veri asla dışarıya çıkmaz. Gözlemlenebilirlik bir SaaS panosuna değil, yerel terminale aittir.

---

## Konumlandırma Özeti

deckent şu sorunun cevabıdır: "Birden fazla AI agent'ı, uzman rollerinde, bağımlılık sırası gözetilerek, kalite kapılarından geçirerek, aynı projede paralel nasıl çalıştırırım — ve bunu tek bir `npx deckent init` komutuyla kurabilmeli miyim?"

Cevap: evet, ve MIT lisansıyla, geliştiricinin kendi makinesinde.
