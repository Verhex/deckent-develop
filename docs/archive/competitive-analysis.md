# Deckent — Stratejik Güçlü Yanlar (Mart 2026 Arşiv)

> ⚠️ **ARŞİV:** Bu belge 27 Mart 2026 tarihlidir ve aktif olarak güncellenmemektedir.
> Güncellenmiş sürüm için bkz: [`competitive-analysis-2026-06.md`](competitive-analysis-2026-06.md) (Haziran 2026).

**Tarih:** 27 Mart 2026 | **Belge Tipi:** Dahili Strateji Raporu

---

## Deckent Yetenek Değerlendirmesi (1-5)

| Boyut | Deckent | Notlar |
|---|---|---|
| Kurulum kolaylığı | 3 | Tek-komut kurulum hedefleniyor; wizard mevcut |
| Sprint/task orkestrasyon | **5** | 8-faz motor, 76+ orkestra modülü, sektörde eşsiz |
| Multi-agent yönetimi | 4 | Brain/Worker/Auditor hiyerarşisi, paralel dependency waves |
| Öğrenme/memory sistemi | **4** | SQLite FTS5, 9 tip entry, dual-layer i18n, otomatik decay |
| Plugin/skill ekosistemi | 2 | 21 built-in skill, temp→permanent evolution pipeline |
| Community/adoption | 1 | Pre-beta; public release hedefleniyor |
| Enterprise readiness | 1 | RBAC V1 advisory; enterprise tier yol haritasında |
| Fiyat/değer oranı | 4 | MIT lisansı, açık kaynak, sıfır platform lock-in |
| Genişletilebilirlik | 4 | MCP server+client, plugin loader, custom generator |
| Dokümantasyon | 2 | Geliştirilme sürecinde; kullanıcı-yönelik içerik artıyor |

---

## Deckent Nerede Guclu?

### 1. Sprint Orkestrasyon Motoru (Sektorde Essiz)
PLAN-SPAWN-EXECUTE-EVALUATE-FIX-RETRO-DECAY-CLEANUP döngüsü — kullanıma hazır, opinionated bir sprint yöneticisi sunan sistem sayısı çok azdır. Çoğu araç tek-task düşünür; deckent tüm geliştirme ekibini 8-faz boyunca yönetir. 78+ orkestra modülü bu alanın endüstrideki en derin implementasyonu.

### 2. V2 Intent-Based Routing (3-Katman)
intent-classifier → activation-engine → routing-engine. Task'i anlamlandirip dogru agent+skill+provider kombinasyonuna yonlendiren yapisal sistem. Rakiplerin cogu sabit kural tabanli.

### 3. Yapisal Hafiza + Otomatik Decay
.brain/memory.db (SQLite FTS5) + learning-decay. 9 entry type (ADR, memory, sprint, debt, pattern, retro, error, identity, audit), dual-layer i18n normalize, `deckent recall` CLI. Deckent zamanla çürüyen yapısal bilgi tabanı — her sprint sonrası güncel kalır, decay mekanizması alakasız bilgiyi otomatik kaldırır.

### 4. Muhendislik Disiplini
16,697+ test descriptor, 186+ sprint. Bu seviyede test disiplinine sahip acik kaynak AI araci cok az.

### 5. Multi-Provider Esnekligi
Claude + Codex + Gemini + fallback chain + model equivalence. Cogu rakip tek provider'a bagimli.

---

## Deckent Nerede Geri?

### 1. SIFIR KULLANICI (En Kritik)
Henüz public bile değil. Teknik üstünlük kullanıcısız anlamsız; piyasadaki olgun araçlar büyük topluluklara sahip. Bu boşluk en kritik risk olmaya devam ediyor.

### 2. Windows Native Destek Yok
Dunyada gelistiricilerin ~%50'si Windows. WSL2 gerekliligi ciddi bariyer. Tum rakipler Windows destekliyor.

### 3. Enterprise Katmani Yok
SSO, RBAC, audit log, SOC2, SLA, on-premise — hiçbiri yok. Ticari otonom platformlar kurumsal müşterilere bu katmanlar sayesinde ulaşıyor.

### 4. Dokumantasyon Kullaniciya Yonelik Degil
222 markdown dosyasi var ama hepsi dahili. Hello world ornegi, tutorial serisi, video walkthrough eksik.

### 5. IDE Entegrasyonu Sinirli
CLI-first guc ama ayni zamanda zayiflik. IDE kullanicilarinin cogunlugu terminal'e gecmek istemiyor.

### 6. Benchmark Gorunurlugu Yok
SWE-Bench'te sonuc yok. Olcemedigin seyi satamazsin.

---

## Kritik Bosluklar (Milyonlarca Kullaniciya Ulasma Icin)

| Oncelik | Bosluk | Neden Kritik |
|---|---|---|
| P0 | Public release + GitHub acik kaynak | On kosul — kullanici olmadan hicbir sey anlamsiz |
| P1 | Kullaniciya yonelik dokumantasyon | Ilk 5 dakika deneyimi herseyi belirler |
| P2 | Windows native veya sorunsuz WSL deneyimi | Kullanici tabaninin yarisi |
| P3 | VS Code extension MVP | IDE kullanicilarina ulasma |
| P4 | Plugin guvenlik katmani | OpenClaw 341 malicious skill yasadi — erken onlem |
| P5 | Benchmark gorunurlugu | Teknik iddialari dogrulanabilir yapma |

---

## Stratejik Firsatlar (Rakiplerin Yapamadigi)

### 1. Sprint-as-a-Service
Hicbir rakip sprint kavramini birinci sinif vatandas olarak sunmuyor. "AI agent" degil "AI development team manager" olarak konumlanma.

### 2. Proje-Spesifik AI Takimi
Agent genealogy, promotion pipeline (temp→permanent), specialization drift. "Projeniz icin ozel AI uzmanlari yetistirin" mesaji.

### 3. Ogrenme Kaniti
"Her sprint'ten sonra ekibiniz daha iyi olur" — Sprint 1 vs Sprint 10 performans karsilastirmasi gosteren somut metrikler.

### 4. CI/CD Native Entegrasyon
PR acildiginda otomatik sprint baslat, testleri calistir, evaluate et. Enterprise'in para odeyecegi ozellik.

### 5. Acik Kaynak Sprint Orkestrasyon Standardi
DIRECTIVES.md, .brain/, .tasks/ yapisi bir endustri standardi olabilir.

---

## Yol Haritasi

### Kisa Vade (0-3 ay) — Temeli At
1. npm public release + GitHub acik kaynak
2. Quickstart + 3 tutorial + "60 seconds" demo video
3. SWE-Bench benchmark calistir
4. VS Code extension MVP
5. Discord/community kanal ac
6. **Hedef: 500+ star, 100+ aktif kullanici**

### Orta Vade (3-6 ay) — Ekosistemi Buyut
1. Skill marketplace icerigi + community katkilari
2. Windows native subprocess backend
3. Jira/Linear entegrasyonu
4. Plugin SDK + dokumantasyon
5. Slack bot entegrasyonu
6. Sprint analytics dashboard
7. **Hedef: 5,000+ star, 1,000+ kullanici, 50+ community skill**

### Uzun Vade (6-12 ay) — Olceklen
1. Enterprise tier (SSO, RBAC, audit)
2. Cloud-hosted sprint execution
3. Team collaboration
4. CI/CD native entegrasyon (GitHub Actions, GitLab CI)
5. On-premise deployment
6. SOC2 sertifikasyonu
7. **Hedef: 25,000+ star, 10,000+ kullanici, ilk enterprise musteri**

---

## Sonuc

Deckent teknik olarak sektorun en derin sprint orkestrasyon motoruna sahip. Ama su anda bir **laboratuvar projesi**. En buyuk risk teknik degil, **go-to-market** riski. Sprint orkestrasyonu alaninda gercek bir bosluk var ve Deckent bunu doldurmak icin en iyi konumlanmis arac — ama bosluk, onu dolduramazsan firsattir; doldurursan avantajdir.

**Yapilmasi gereken en onemli sey: kodu public yapmak ve ilk 100 kullaniciyi kazanmak.**
