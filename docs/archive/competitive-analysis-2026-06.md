# Deckent vs Rakipler — Kapsamlı Stratejik Karşılaştırma (v2)

**Tarih:** 5 Haziran 2026 · **Belge Tipi:** Dahili Strateji Raporu
**Önceki sürüm:** [`competitive-analysis.md`](competitive-analysis.md) (27 Mart 2026) — bu belge onun güncellenmiş, doğrulanmış ve genişletilmiş hâlidir.

**Kaynak güven işaretleri:** 🟢 primary repo/resmi site · 🟡 ikincil/blog · ⚪ proje-içi bilgi · 🔴 doğrulanamadı

> **Metodoloji dürüstlüğü:** Bu rapor bir deep-research harness (23 kaynak, 106 iddia, 5 arama açısı) ile üretildi.
> Arama+çekme fazı sağlam çalıştı ve iddiaların çoğu **primary kaynaklardan** (resmi GitHub repo'ları + resmi siteler) geldi.
> Ancak çekişmeli **doğrulama (verify) fazı mekanik olarak çöktü** (oy-veren subagent'lar `StructuredOutput` çağıramadı,
> hepsi "abstain" kaldı). Yani aşağıdaki rakamlar **yanlışlanmadı, sadece bağımsız çekişmeli doğrulamadan geçmedi.**
> Primary-kaynak iddiaları yüksek güvenli kabul edilmiştir; spesifik sayılar (★, benchmark) hedefli WebFetch ile tekrar
> teyit edilebilir.

---

## 0. İki önemli düzeltme (eski rapor + ilk araştırma listesi)

**🔴 WrongStack — harici rakip DEĞİL.** `github.com/WrongStack/WrongStack` araştırmada hiçbir sonuç vermedi
(muhtemelen yok / boş / private). Hafıza kayıtlarındaki "WrongStack" deckent'in **kendi iç risk envanteri kod adıdır**
(WS-Z1/Z2/Z3 — `project_system_risk_inventory.md`), bir ürün rakibi değil. Rakip tablosundan çıkarıldı.

**🟡 OpenClaw — kategori düzeltmesi.** Eski raporun "OpenClaw = 250K★ / 2M kullanıcı / 341 malicious skill / dev-aracı"
tanımı yanıltıcı. Canlı veri (`github.com/openclaw/openclaw` + kucoin 2026 karşılaştırması): OpenClaw bir **self-hosted
kişisel AI asistanı** — WhatsApp/Telegram/Discord/Slack/Signal/iMessage üzerinden cevap veren. **deckent'le aynı
kategoride değil** (kod orkestratörü değil, kişisel asistan). Komşu kategori, doğrudan rakip değil. Eski rapordaki
yüksek rakamlar doğrulanamadı — büyük olasılıkla başka bir ürünle karıştırılmış.

---

## 1. Kategori Haritası — deckent nereye düşüyor?

| Kategori | Sistemler | deckent ilişkisi |
|---|---|---|
| **Multi-agent orkestrasyon ÜRÜNÜ** (kullanıma hazır, sprint/ekip yöneten) | **🟢 deckent** | Bizim kategori |
| Otonom kodlama agent platformu | 🟢 OpenHands, SWE-agent ve benzeri otonom platformlar | En yakın fonksiyonel rakipler |
| Genel-amaçlı otonom agent | 🟢 Hermes-Agent, AutoGPT | Mimari benzer, alan farklı |
| Multi-agent **framework** (kütüphane, ürün değil) | 🟢 LangGraph, CrewAI, AutoGen/AG2, MetaGPT | Bizim altımızdaki katman |
| Tek-agent kodlama asistanı | 🟢 goose, Cline ve benzeri tek-agent araçlar | deckent'in spawn ettiği worker'lar bunlar olabilir |
| Kişisel AI asistanı (kod değil) | 🟢 OpenClaw | Komşu kategori, rakip değil |

**Ana içgörü:** deckent bir "AI kodlama asistanı" değil, **"AI geliştirme-ekibi yöneticisi / orkestratör ÜRÜNÜ"**.
Bu kutuda kullanıma-hazır, opinionated, sprint-yöneten bir **ürün** olarak gerçek rakip sayısı çok az — çoğu rakip ya
framework (kendin kur) ya da tek-agent asistan.

---

## 2. Tam Karşılaştırma Matrisi (özellik bazlı)

| Boyut | **deckent** ⚪ | Hermes-Agent 🟢 | OpenHands 🟢 | goose 🟢 | LangGraph 🟡 | CrewAI/AutoGen 🟡 |
|---|---|---|---|---|---|---|
| **Kategori** | Multi-agent orkestrasyon ürünü | Genel otonom agent | Otonom kod platformu | Tek-agent asistan | Framework | Framework |
| **Mimari** | Brain–Auditor–Worker (planner/worker ayrık, hiyerarşik) | Tek ana agent + izole subagent'lar | Multi-trajectory + neural critic | Tek-agent (desktop+CLI) | Directed-graph state machine | Rol-bazlı / konuşma-bazlı |
| **Sprint/yaşam-döngüsü** | ✅ 8-faz (PLAN→…→CLEANUP) **eşsiz** | ❌ | ❌ (görev-bazlı) | ❌ | ⚠️ graph akışı (sprint değil) | ❌ |
| **Provider bağımsızlığı** | ✅ Claude/Codex/Gemini + fallback + tier denkliği | ✅✅ 200+ model (OpenRouter, NIM, OpenAI…) | ✅ model-agnostik | ✅✅ 15+ provider + Ollama | ✅ (framework) | ✅ |
| **Lokal model** | ⚠️ kısmi (foundation aşaması) | ✅ | ✅ (Ollama) | ✅ (Ollama) | ✅ | ✅ |
| **Lisans** | MIT (no-gate) | **MIT** | **MIT** (enterprise/ ayrı) | **Apache 2.0** | MIT + paid platform | MIT/açık |
| **Olgunluk** | ⚪ pre-beta, ~0 dış kullanıcı, 285+ sprint | 🟢 aktif | 🟢🟢 çok yüksek (~50k★ sınıfı) | 🟢🟢 **46.5k★**, 137 release, Linux Foundation | 🟢🟢 çok yüksek | 🟢🟢 çok yüksek |
| **Kalıcı hafıza** | ✅✅ SQLite **FTS5** + 9 tip + decay + i18n normalize | ✅ **FTS5** oturum arama + LLM özet + agent-curated | ⚠️ session/event | ⚠️ session | ✅ Checkpointer (DB) | ⚠️ değişken |
| **Human-in-the-loop** | ✅ checkpoint CLI/MCP + confirm-gate | ⚠️ | ✅ | ✅ | ✅✅ breakpoints + time-travel | ⚠️ |
| **Scope/sandbox/RBAC** | ✅ scope.filesWrite + Auditor + ADR-037 RBAC (V1 advisory) | ⚠️ subagent izolasyonu | ✅ Docker sandbox | ⚠️ | ❌ (framework sorumlu) | ❌ |
| **MCP desteği** | ✅✅ **server (34 tool/8 resource) + client** | ⚠️ | ✅ consumer | ✅ consumer (70+ ext) | ✅ | ⚠️ |
| **SWE-Bench görünürlüğü** | ❌ yok | ⚠️ | ✅✅ **66.4% Verified** (SOTA iddiası) | ⚠️ | n/a | n/a |
| **Benzersiz farklılaştırıcı** | Sprint orkestrasyon + evrimleşen agent/skill + yapısal hafıza | 200+ model + agent-curated memory | SOTA benchmark + critic model | Linux Foundation + dev deneyimi | Production state-machine | Çoklu-agent desenleri |

---

## 3. Puan Matrisi + Eski Rapora Göre DELTA

Eski (27 Mart) raporun 1–5 skala matrisi yeni sistemlerle genişletildi. **🆕 = yeni eksen/sistem.**

| Boyut | deckent | Hermes 🆕 | OpenHands 🆕 | goose 🆕 | LangGraph 🆕 | OpenClaw* |
|---|---|---|---|---|---|---|
| Kurulum kolaylığı | 3 | 4 | 4 | 5 | 3 | 4 |
| **Sprint/orkestrasyon** | **5** | 2 | 3 | 1 | 3 | 1 |
| Multi-agent yönetimi | 4 | 3 | **5** | 1 | 4 | 2 |
| Öğrenme/memory | **4** | **4** ⚠️ *yakın tehdit* | 2 | 2 | 4 | 2 |
| Provider bağımsızlığı 🆕 | 4 | **5** | 4 | **5** | 4 | 3 |
| MCP entegrasyonu 🆕 | **5** | 2 | 4 | 4 | 3 | 1 |
| Plugin/skill ekosistemi | 2 | 3 | 4 | **5** | 4 | 3 |
| Community/adoption | **1** | 3 | **5** | **5** | **5** | 3 |
| Benchmark görünürlüğü 🆕 | **1** | 2 | **5** | 3 | n/a | 1 |
| Enterprise readiness | **1** | 2 | 4 | 4 | 4 | 2 |
| Dokümantasyon | 2 | 3 | 4 | **5** | **5** | 4 |

\* OpenClaw farklı kategori — referans için bırakıldı.

**Mart → Haziran kritik delta'lar:**
- 🔺 **MCP artık deckent'in en güçlü ayırt edici ekseni** (server + client, Sprint 229). Rakipler çoğunlukla sadece *consumer*; deckent hem sunuyor hem tüketiyor. Eski raporda bu eksen **hiç yoktu.**
- 🔻 **Hermes-Agent yeni ve en tehlikeli rakip:** "yapısal FTS5 hafıza" farklılaştırıcımızın **neredeyse birebir aynısına sahip** (FTS5 oturum arama + LLM özet + agent-curated memory). Memory artık tek-başına savunulabilir bir hendek değil.
- 🔻 **goose** Mart raporunda yoktu — şimdi **46.5k★ + Linux Foundation** ile devasa bir komşu (tek-agent ama provider-bağımsızlık ve toplulukta önde).
- 🔺 deckent kendi tarafında: 186→229 sprint, MCP-client, native REPL (Ink), dashboard ile olgunlaştı — ama **dış kullanıcı hâlâ ~0**.

---

## 4. En Yakın 3 Tehdit — Derin Not

### 🥇 Hermes-Agent (Nous Research) — en doğrudan mimari rakip 🟢
- **Neden tehlikeli:** Tek-ana-agent + izole subagent paralel çalışma + **FTS5 oturum arama + agent-curated memory** = iki ana hendeğimize (multi-agent + yapısal hafıza) aynı anda dokunan tek sistem. MIT, 200+ model (`hermes model` ile kod değişmeden switch).
- **deckent'in üstünlüğü:** Hermes "tek agent subagent spawn eder"; deckent **kalıcı rol ayrımı** (Brain planlar, Worker uygular, Auditor denetler) + **sprint yaşam döngüsü** + **ADR yönetişimi**. Hermes'te sprint/evaluate/retro/decay döngüsü yok.
- **deckent'in zayıfı:** Hermes'in model genişliği (200+) ve hafıza paritesi "eşsiz" anlatımızı zayıflatıyor.

### 🥈 OpenHands — en güçlü kod-otonomi rakibi 🟢
- **Neden tehlikeli:** **%66.4 SWE-Bench Verified** (ölçülebilir kanıt), multi-trajectory + neural critic, MIT, SDK/API/micro-agent ile orkestrasyon, devasa topluluk. **Bizim ölçemediğimizi ölçüyor.**
- **deckent'in üstünlüğü:** OpenHands görev-bazlı; deckent **sprint-bazlı çok-task ekip yönetimi** + yapısal hafıza + ADR yönetişimi. Onlar "bir görevi en iyi çözen agent", biz "bir projeyi yöneten ekip".
- **deckent'in zayıfı:** **Benchmark görünürlüğü sıfır.** "Ölçemediğin şeyi satamazsın" — en kritik açık.

### 🥉 goose (Block) — topluluk + dev-deneyimi devi 🟢
- **Neden tehlikeli:** 46.5k★, 137 release, **Linux Foundation governance** (Agentic AI Foundation), 15+ provider + Ollama, MCP consumer (70+ extension). Kurumsal güven + momentum.
- **deckent'in üstünlüğü:** goose **tek-agent**; multi-agent orkestrasyon, sprint, planner/worker ayrımı yok. deckent mimari olarak bir kademe üstte.
- **deckent'in zayıfı:** Topluluk, provider genişliği, governance olgunluğu, dokümantasyonda goose çok önde.

---

## 5. deckent — Güncellenmiş Güçlü / Zayıf

**Güçlü (savunulabilir hendekler):**
1. 🟢 **Sprint orkestrasyon motoru** (8-faz) — ürün-kategorisinde hâlâ gerçekten eşsiz. Framework'ler (LangGraph/CrewAI) bunu *kurabilir* ama hazır sunmuyor.
2. 🟢 **MCP server + client çift yönlü** (S229) — yeni ve güçlü ayırt edici. Rakipler çoğunlukla tek yön.
3. 🟢 **Evrimleşen agent/skill + promotion pipeline + ADR yönetişimi** — hiçbir rakipte bu kombinasyon yok.
4. 🟡 **Yapısal hafıza (FTS5 + decay + 9 tip)** — güçlü ama **artık tek değil** (Hermes paritesi).
5. 🟢 **Mühendislik disiplini** (17k+ test descriptor, 229 sprint) — açık-kaynak AI aracında nadir.

**Zayıf (kapatılması gereken açıklar — öncelik sırası):**
1. 🔴 **Dış kullanıcı ~0 / public değil** — hâlâ #1 risk (Mart'tan değişmedi). goose 46.5k★, OpenHands ~50k★ sınıfı.
2. 🔴 **Benchmark görünürlüğü yok** — OpenHands %66.4 ile somut; biz hiçbir sayı veremiyoruz.
3. 🟡 **Hafıza hendeği erozyonu** — Hermes paritesi; anlatıyı "sprint + evrim"e kaydırmalı.
4. 🟡 **Provider/lokal-model genişliği** — Hermes 200+, goose 15+; biz 3 (+lokal foundation).
5. 🟡 **Windows native + dokümantasyon + IDE** — Mart raporundaki açıklar duruyor.

---

## 6. Stratejik Sonuç

Mart raporunun ana tezi **hâlâ geçerli ve şimdi daha keskin:** deckent teknik olarak **ürün-kategorisinde en derin
sprint-orkestrasyon motoruna** sahip, ama bir **laboratuvar projesi** — risk teknik değil, **go-to-market**.

**Mart'tan beri değişen üç gerçek:**
1. **Hendekler daraldı** — Hermes hafıza paritesi getirdi, goose/OpenHands toplulukla ezici geldi. "Eşsiz memory" artık savunma değil.
2. **Yeni hendek açıldı** — MCP server+client çift yönlülüğü gerçek bir farklılaştırıcı oldu.
3. **Konumlandırma netleşmeli** — deckent'i tek-agent asistanlarla DEĞİL, **orkestrasyon ürünü** olarak konumla. "AI agent" değil **"AI development team manager"**.

**En kritik 3 aksiyon (öncelik):**
1. **Public + ilk 100 kullanıcı** (Mart'tan beri #1, değişmedi).
2. **SWE-Bench skoru yayınla** — OpenHands'in %66.4'üne karşı somut bir sayı; "ölçülebilir orkestrasyon avantajı" anlatısı.
3. **Anlatıyı kaydır:** memory → **sprint orkestrasyon + evrimleşen ekip + MCP çift yönlülük** (Hermes'in dokunamadığı eksenler).

---

## Ek: Kaynaklar (primary 🟢)

| Sistem | Kaynak |
|---|---|
| Hermes-Agent | https://github.com/nousresearch/hermes-agent |
| OpenClaw | https://github.com/openclaw/openclaw |
| OpenHands | https://github.com/OpenHands/OpenHands · https://www.openhands.dev/ · .../blog/sota-on-swe-bench-verified-with-inference-time-scaling-and-critic-model |
| goose | https://github.com/block/goose |
| Karşılaştırma/framework | meta-intelligence.tech · alicelabs.ai · kucoin.com (hermes vs openclaw 2026) |

> Tüm spesifik sayılar (★, release, benchmark %) primary-kaynak iddialarıdır ancak çekişmeli doğrulamadan geçmemiştir
> (verify fazı çöktü). Yayın/karar öncesi hedefli WebFetch ile teyit önerilir.
