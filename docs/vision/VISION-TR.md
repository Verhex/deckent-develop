<!-- Dil: TR | Teknik terimler EN -->

# Deckent — Vizyon ve Strateji

---

## Vizyon

Deckent, tam otonom bir AI geliştirme platformu olmaya doğru ilerliyor. Mevcut faz **AI agent orkestrasyon**: paralel sprint'lerle geliştirme görevlerini planlayan, yürüten ve değerlendiren çok-ajanlı bir CLI. Bu varış noktası değil — temeldir.

Uzun vadeli hedef: Deckent, her zaman açık, kendi kendini geliştiren bir geliştirme takım arkadaşı olacak. Kod tabanınızı anlayacak, her sprint'ten öğrenecek, proaktif planlama yapacak ve minimum insan müdahalesiyle çalışacak. Açık kaynak, self-hosted, provider-agnostik — **"açık dünya için açık kaynak"**. Aynı MIT ürünü, solo bir geliştirici dizüstünden büyük bir enterprise ortamına fork olmadan ölçeklenir.

---

## Misyon

Solo AI asistanı kullanımı doğası gereği sınırlıdır: tek context window, tek görev, tek bakış açısı. Deckent bu sınırı Brain-Worker-Auditor mimarisi ile aşar. Brain stratejiyi belirler, Worker'lar paralel çalışır, Auditor kaliteyi garanti eder. Her sprint sonunda öğrenimler hafızaya yazılır — sistem her iterasyonda daha iyi kararlar alır.

**Şu an neredeyiz:** AI orkestrasyon CLI — 3 spawn backend (tmux, subprocess, Docker), 4 AI provider, **15 agent**, 21 skill, 34 MCP tool, ADR governance (89 ADR, ADR-089'a kadar), Memory V2 (SQLite FTS5, çift-katmanlı i18n normalize) ile sprint bazlı çok-ajanlı yürütme; dashboard içinde VSCode-benzeri dockable panel olarak çalışan **gömülü web terminali** — `claude` / `gemini` / `codex` / `deckent` / shell oturumlarını kullanıcı tek ekrandan sürer (ADR-062). **Nervous System** (ADR-040) insan sorgulaması olmadan sprint sağlığını proaktif olarak izler ve müdahale önerileri üretir. **Autonomous engine**, yinelenen (cron), tek seferlik ve reaktif backlog öğelerini 3-kapı governance (RBAC → policy → risk) ile çalıştırır.

**Nereye gidiyoruz:** Otonom AI asistanı — heartbeat daemon, proaktif görev yürütme, kanal entegrasyonları (Slack, GitHub), kod tabanı semantik anlayışı, always-on gateway. Gömülü terminal bu geleceğe atılan ilk somut adım: "orkestratör" ile "gerçekten çalıştığın yer" arasındaki sınırı kaldırır. Multi-tenant Kubernetes izolasyonu ve enterprise dış-dünya entegrasyonları için dikişler mimaride zaten mevcut — `AuthProvider`, `SessionBackend` ve `tenantId` ilk günden konumlandı.

---

## Deckent'i Öne Çıkaran Özellikler

Deckent'in değeri birbirini güçlendiren bir dizi yetenekten oluşuyor. Bu kombinasyon açık kaynak ekosisteminde başka hiçbir yerde bir arada bulunmuyor.

| Yetenek | Anlamı |
|---------|--------|
| **Brain-Worker-Auditor mimarisi** | Üç-rol ayrımı: Brain orkestre eder ve öğrenir, Worker'lar scope içinde paralel çalışır, Auditor kalite kapılarını ve sınır uyumluluğunu denetler. |
| **Dependency-pipeline waves** | Kahn topolojik çizelgeleme — bağımlılıklı görevler wave'lerde çalışır; her wave, bloklayıcılar DONE durumuna ulaştıktan sonra açılır. Manuel sıralama gerekmez. |
| **Memory V2 — DB-first** | Çift-katmanlı Türkçe/İngilizce normalize ile SQLite FTS5 deposu. Sprint öğrenimleri, ADR'ler, desenler ve teknik borç sprint'ler arası kalıcıdır ve planlama zamanında yüzeye çıkar. Ham markdown'a kıyasla %96 context azalması. |
| **89 ADR + ADR governance** | Her kabul edilmiş mimari karar zorunlu bir kısıttır. Worker'lar, kabul edilmiş ADR'yi ihlal eden implementasyonları reddeder; Brain tüm çakışmalar için ADR değişiklik önerisi ister. |
| **Nervous System** | Proaktif meta-orkestratör (ADR-040), 12 dedektörle. Sprint sağlığını izler, öneriler üretir ve müdahaleleri — yoklama veya manuel izleme olmadan — dispatch eder. |
| **Autonomous engine** | Yinelenen (cron), tek seferlik ve reaktif backlog. 3-kapı governance (RBAC → policy → risk). Bekleyen öğeler onaylanmadan önce "parked" durumunda kalır. |
| **Evolution pipeline** | Agent'lar ve skill'ler, sonuç verilerine göre geçici'den kalıcıya terfi eder. Yönlendirme motoru her sprint'te öğrenilmiş yakınlık puanları aracılığıyla iyileşir. |
| **Multi-provider fleet** | Claude, Codex, Gemini, Ollama ve OpenAI-uyumlu provider'lar. Görev başına provider ve model-tier override. Aynı sprint, worker'lar arasında provider'ları karıştırabilir. |
| **Native REPL** | Ink tabanlı `deckent` REPL; agentic tool-use protokolü, tur-içi kuyruk + onay ve slash komutlarıyla. Native-agent modu (deneysel, opt-in) tam LLM tabanlı etkileşimleri etkinleştirir. |
| **Açık kaynak, MIT, self-hosted** | Vendor kilidi yok. Herhangi bir makinede kurun, herhangi bir provider'a bağlanın, özel agent ve skill'lerle genişletin. Topluluk katkısına açık. |

---

## Hedef Kullanıcılar

| Segment | Profil | Deckent Değeri |
|---------|--------|----------------|
| **Bireysel geliştirici** | Indie dev, freelancer, solo founder | Tek kişilik bir takıma multi-agent güç katmak — sprint'lerle paralel iş çıkarma |
| **Küçük takım** | 2-10 kişilik startup veya ekip | AI worker'ları ekip üyesi gibi kullanmak — tekrarlayan görevleri otomatize etme |
| **Enterprise** | Büyük ölçekli organizasyon | Kontrollü otonom geliştirme — audit trail, RBAC, scope enforcement, memory/learning |

---

## Teknoloji Kararları

### TypeScript + ESM

TypeScript, tip güvenliği ile büyük kod tabanlarında güvenilir refactoring sağlar. ESM (ES Modules) modern Node.js ekosistemiyle uyumludur ve tree-shaking gibi optimizasyonlara kapı açar. AI agent'ları yöneten bir sistem için tip güvenliği kritiktir — hatalı config veya task yapısı sprint'i çökertir.

### Multi-Provider (Claude + Codex + Gemini + Ollama)

Tek bir AI provider'a bağımlılık hem maliyet hem de erişilebilirlik riski oluşturur. Deckent, provider-agnostic bir mimari ile farklı görevlere farklı modeller atayabilir: opus karmaşık mimari kararlar için, haiku basit dokümantasyon için. Provider fallback zinciri kesinti dayanıklılığı sağlar. Yerel Ollama worker'ları sıfır API maliyetiyle uygun kapsamlı işleri yürütebilir.

### Üçlü Spawn Backend (tmux + Subprocess + Docker)

Farklı bağlamlar için üç backend: **tmux** (en hızlı, canlı terminal, Linux/macOS varsayılan), **subprocess** (Windows fallback, dosya bazlı tracking), **Docker** (container izolasyonu, kaynak limitleri, CI/CD hazır). Her worker hangi backend olursa olsun kendi izole ortamında çalışır.

### MCP (Model Context Protocol) Entegrasyonu

MCP, Deckent'i herhangi bir MCP-uyumlu IDE veya araçla entegre eder. 35 tool ve 8 resource ile sprint yaşam döngüsünün tamamı programatik olarak erişilebilir. Bu, Deckent'i sadece bir CLI değil, bir platform haline getirir.

### Docker Container İzolasyonu

Worker'lar izole Docker container'larında bellek limitleri, non-root yürütme ve volume mount auth ile çalışır. Proje dosya sistemi erişimi container bazında kontrol edilir. Bu, kurumsal deployment, CI/CD entegrasyonu ve gelecekteki Kubernetes ölçekleme için temeldir.

---

## Yol Haritası

### Faz 1: "Orkestrasyon Temeli" — Tamamlandı (Sprint 1-82)

Temel sprint yaşam döngüsü, çok-ajanlı paralel yürütme, tmux/subprocess backend'ler, MCP entegrasyonu, çoklu provider desteği (Claude + Codex + Gemini), ModelRegistry, agent/skill ekosistemi, heartbeat daemon, human checkpoint'ler, adaptive threshold'lar.

### Faz 2: "Beta Hazırlığı" — Tamamlandı (Sprint 83-166)

Docker container backend (canlı doğrulandı, 10 e2e test, ayarlanabilir timeout), dokümantasyon konsolidasyonu (BETA-TRACKER, i18n generator'lar, docs.json otomasyonu), ERRORS.md aktif loglama, backend smoke testing (tmux + subprocess + Docker, MCP + CLI), ADR-027 hibrit backend kararı, versiyon 1.0.0-beta.1. Sprint 138-145: ADR-035/036/037/038/039/040/041 governance + Nervous System meta-orkestratör + Authority Matrix RBAC. Sprint 162-163: Brain stability (6/6 DONE, 0 NO_GO). Sprint 166: Brain Self-Update + Data Integrity Closure — 11/11 task DONE, ~2735 LoC, ADR-046 Brain Self-Update Hook Architecture.

### Faz 3: "Public Beta" — Yayında (Sprint 167-285)

`dependency_pipeline_enabled` flip + Wave scheduling canlı (Sprint 167); F1 provider bağımsızlığı (4 provider + OpenAI-uyumlu HTTP adapter), F2 native chat (Ink REPL + agentic tool-use), F3 process mode (autonomous engine + scheduled flow'lar), F4 enterprise (RBAC, multi-tenant, audit-query, webhook trigger'lar), F5 evolutionary wire (agent/skill promote/demote pipeline), F7 dashboard (16 sayfa, serve, auth). Memory V2 DB-first (SQLite FTS5, %96 context azalması). Nervous System proaktif meta-orkestratör (ADR-040, 12 dedektör). Sprint 255+: agentic-run ekosistemi tek `ExecutionRequest` contract. Mevcut: Sprint 285'te `v1.0.0-beta.1`.

> **Canlı yol haritası:** yetkili, güncel plan [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md) dosyasında yaşar. Bu Yol Haritası bölümü yalnızca üst düzey bir anlatıdır.

### Faz 4: "Otonom Asistan" — Gelecek

Orkestrasyon CLI'dan otonom AI platformuna sıçrayış:
- **Always-on gateway** — daemon modu, SSE dashboard, uzaktan kontrol
- **Kanal entegrasyonları** — Slack bot, GitHub Issues/PR otomasyonu, Linear/Jira sync
- **Kod tabanı semantik anlayışı** — AST indeksleme, bağımlılık grafı, RAG ile zenginleştirilmiş context
- **Multi-sprint zincirleme** — günler süren otonom görev yürütme
- **Critique layer** — çok-modelli doğrulama (yazar + gözden geçiren deseni)
- **Browser/Computer Use** — GUI görev yürütme için computer-use entegrasyonu
- **Provider genişleme** — Grok, Llama, Mistral, DeepSeek (ModelRegistry altyapısı hazır)

Deckent'in tam otonom çok-ajanlı geliştirme platformu haline geldiği nokta — açık kaynak, self-hosted ve ölçekte çalışmak üzere inşa edilmiş.

---

## Değerler

- **Açık kaynak** — Deckent ücretsiz ve açık kaynaklıdır. Topluluk katkısına açıktır.
- **Şeffaflık** — Her sprint'in planı, sonucu ve öğrenimi kayıt altındadır. `.brain/` dizini karar geçmişini tutar.
- **Kalite** — Auditor kalite kapısı, GO/NO-GO değerlendirmesi ve test zorunluluğu ile her sprint kalite standardını karşılar.
- **Otonom ama kontrollü** — Deckent otonom çalışır ama kullanıcı her zaman kontroldedir. Scope enforcement, audit trail ve memory budget ile sınırlar nettir.
- **Sürekli öğrenim** — Memory V2 ve PATTERNS her sprint sonunda güncellenir. Sistem zamanla daha iyi kararlar alır, aynı hataları tekrarlamaz.
- **Önce orkestrasyon, sonra otonomi** — Deckent sprint bazlı orkestratör olarak başlar ve tam otonomi'ye doğru evrilir. Her faz bir öncekinin üzerine inşa edilir — kestirme yok, yarım iş yok.

---

## Sayılarla Deckent
| Metrik | Değer |
|--------|-------|
| Version | 1.0.0-beta.1 |
| Sprint | sprint-437 |
| MCP Tools | 47 |
| MCP Resources | 8 |
| CLI Commands | 70+ |
| Dashboard Pages | 21 |
| Agents | 20 built-in + 2 custom |
| Skills | 31 built-in |
| Providers | 4 (Claude, Codex, Gemini, Ollama) |

## Sprint Metrikleri
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-285 |
| Toplam Task | 8 |
| Tamamlanan | 7 |
| Tech Debt | 1 |
| No-Go | 1 |
| Süre | 49dk 50sn |
| Coverage | 0.0% |

## Sprint History
_Sprint geçmişi yok._

## Sprint Metrics
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-437 |
| Toplam Task | 7 |
| Tamamlanan | 7 |
| Tech Debt | 2 |
| No-Go | 0 |
| Süre | 52dk 35sn |
| Coverage | N/A |
