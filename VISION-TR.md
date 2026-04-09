<!-- Dil: TR | Teknik terimler EN -->

# Deckent — Vizyon ve Strateji

---

## Vizyon

Deckent, tam otonom bir AI geliştirme asistanı olmaya doğru ilerliyor — OpenClaw, Microsoft Copilot Cowork ve Devin ile aynı kategoride. Mevcut faz **AI agent orkestrasyon**: paralel sprint'lerle geliştirme görevlerini planlayan, yürüten ve değerlendiren çok-ajanlı bir CLI. Bu varış noktası değil — temeldir.

Uzun vadeli hedef: Deckent, her zaman açık, kendi kendini geliştiren bir geliştirme takım arkadaşı olacak. Kod tabanınızı anlayacak, her sprint'ten öğrenecek, proaktif planlama yapacak ve minimum insan müdahalesiyle çalışacak. Açık kaynak, self-hosted, provider-agnostik — anti-Devin.

---

## Misyon

Solo AI asistanı kullanımı doğası gereği sınırlıdır: tek context window, tek görev, tek bakış açısı. Deckent bu sınırı Brain-Worker-Auditor mimarisi ile aşar. Brain stratejiyi belirler, Worker'lar paralel çalışır, Auditor kaliteyi garanti eder. Her sprint sonunda öğrenimler hafızaya yazılır — sistem her iterasyonda daha iyi kararlar alır.

**Şu an neredeyiz:** AI orkestrasyon CLI — 3 spawn backend (tmux, subprocess, Docker), 3 AI provider, 16 agent, 21 skill ile sprint bazlı çok-ajanlı yürütme.

**Nereye gidiyoruz:** Otonom AI asistanı — heartbeat daemon, proaktif görev yürütme, kanal entegrasyonları (Slack, GitHub), kod tabanı semantik anlayışı, always-on gateway. OpenClaw'ın mimarisi + Deckent'in çok-ajanlı disiplini.

---

## Hedef Kullanıcılar

| Segment | Profil | Deckent Değeri |
|---------|--------|----------------|
| **Bireysel geliştirici** | Indie dev, freelancer, solo founder | Tek kişilik bir takıma multi-agent güç katmak — sprint'lerle paralel iş çıkarma |
| **Küçük takım** | 2-10 kişilik startup veya ekip | AI worker'ları ekip üyesi gibi kullanmak — tekrarlayan görevleri otomatize etme |
| **Enterprise** | Büyük ölçekli organizasyon (gelecek) | Kontrollü otonom geliştirme — audit trail, scope enforcement, memory/learning |

---

## Rakip Analizi

| Araç | Kategori | Güçlü Yön | Zayıf Yön | Deckent Konumu |
|------|----------|-----------|-----------|---------------|
| **OpenClaw** | Otonom AI asistanı (343K+ star) | Always-on daemon, 13K+ skill, 50+ kanal | Tek agent, sprint lifecycle yok, scope enforcement yok | Çok-ajanlı orkestrasyon + sprint disiplini + öğrenim |
| **Copilot Cowork** | Kurumsal AI orkestratör | Çok-modelli critique layer, M365 entegrasyonu | Kapalı kaynak, $30+/kullanıcı/ay, self-hosted yok | Açık kaynak, self-hosted, ücretsiz, provider-agnostik |
| **Devin** | Otonom yazılım mühendisi | End-to-end otonom, interaktif planlama | Tek agent, kapalı kaynak, $20-500/ay | Çok-ajanlı paralel, açık kaynak, ücretsiz |
| **Perplexity Computer** | Çok-modelli AI agent | 19 model, günler süren görevler, 400+ uygulama | $200-325/ay, self-hosted yok, sprint planlama yok | Self-hosted, 13 model, sprint bazlı yapı |
| **Claude Code (solo)** | Tek AI asistanı | Güçlü tek-görev performansı | Tek context, paralel yok | Claude Code'u worker olarak kullanır, orkestrasyon ekler |

**Deckent'in benzersiz konumu:** Çok-ajanlı paralel yürütme + sprint yaşam döngüsü + scope enforcement + hafıza/öğrenim + çoklu provider + self-hosted'ı tek çatı altında birleştiren tek açık kaynak araç. Mevcut faz: orkestrasyon CLI. Sonraki faz: otonom asistan (OpenClaw/Cowork sınıfı).

---

## Teknoloji Kararları

### TypeScript + ESM

TypeScript, tip güvenliği ile büyük kod tabanlarında güvenilir refactoring sağlar. ESM (ES Modules) modern Node.js ekosistemiyle uyumludur ve tree-shaking gibi optimizasyonlara kapı açar. AI agent'ları yöneten bir sistem için tip güvenliği kritiktir — hatalı config veya task yapısı sprint'i çökertir.

### Multi-Provider (Claude + Codex + Gemini)

Tek bir AI provider'a bağımlılık hem maliyet hem de erişilebilirlik riski oluşturur. Deckent, provider-agnostic bir mimari ile farklı görevlere farklı modeller atayabilir: opus karmaşık mimari kararlar için, haiku basit dokümantasyon için. Provider fallback zinciri kesinti dayanıklılığı sağlar.

### Üçlü Spawn Backend (tmux + Subprocess + Docker)

Farklı bağlamlar için üç backend: **tmux** (en hızlı, canlı terminal, Linux/macOS default), **subprocess** (Windows fallback, dosya bazlı tracking), **Docker** (container izolasyonu, kaynak limitleri, CI/CD hazır). Her worker hangi backend olursa olsun kendi izole ortamında çalışır.

### MCP (Model Context Protocol) Entegrasyonu

MCP, Deckent'i herhangi bir MCP-uyumlu IDE veya araçla entegre eder. 20 tool ve 8 resource ile sprint yaşam döngüsünün tamamı programatik olarak erişilebilir. Bu, Deckent'i sadece bir CLI değil, bir platform haline getirir.

### Docker Container İzolasyonu

Worker'lar izole Docker container'larında bellek limitleri, non-root yürütme ve volume mount auth ile çalışır. Proje dosya sistemi erişimi container bazında kontrol edilir. Bu, kurumsal deployment, CI/CD entegrasyonu ve gelecekteki Kubernetes ölçekleme için temeldir.

---

## Yol Haritası

### Faz 1: "Orkestrasyon Temeli" — Tamamlandı (Sprint 1-82)

Temel sprint yaşam döngüsü, çok-ajanlı paralel yürütme, tmux/subprocess backend'ler, MCP entegrasyonu, çoklu provider desteği (Claude + Codex + Gemini), ModelRegistry, agent/skill ekosistemi, heartbeat daemon, human checkpoint'ler, adaptive threshold'lar.

### Faz 2: "Beta Hazırlığı" — Aktif (Sprint 83-115)

Docker container backend, dokümantasyon konsolidasyonu (BETA-TRACKER, i18n generator'lar, docs.json otomasyonu), ERRORS.md aktif loglama, backend smoke testing (tmux + subprocess + Docker, MCP + CLI), versiyon 0.4.0-beta.1.

### Faz 3: "Public Beta" — Sonraki

VerhexIO/deckent açık kaynak repo, CI/CD pipeline (GitHub Actions + Docker backend), npm publish, .detect-secrets, CONTRIBUTING rehberi, topluluk onboarding.

### Faz 4: "Otonom Asistan" — Gelecek

Orkestrasyon CLI'dan otonom AI asistanına sıçrayış:
- **Always-on gateway** — daemon modu, SSE dashboard, uzaktan kontrol
- **Kanal entegrasyonları** — Slack bot, GitHub Issues/PR otomasyonu, Linear/Jira sync
- **Kod tabanı semantik anlayışı** — AST indeksleme, bağımlılık grafı, RAG ile zenginleştirilmiş context
- **Multi-sprint zincirleme** — günler süren otonom görev yürütme
- **Critique layer** — çok-modelli doğrulama (yazar + gözden geçiren deseni)
- **Browser/Computer Use** — Claude Computer Use SDK entegrasyonu
- **Provider genişleme** — Grok, Llama, Mistral, DeepSeek (ModelRegistry altyapısı hazır)

Deckent'in OpenClaw/Cowork/Devin kategorisine girdiği nokta — başka bir tek-ajanlı araç olarak değil, tek açık kaynak çok-ajanlı otonom geliştirme platformu olarak.

---

## Değerler

- **Açık kaynak** — Deckent ücretsiz ve açık kaynaklıdır. Topluluk katkısına açıktır.
- **Şeffaflık** — Her sprint'in planı, sonucu ve öğrenimi kayıt altındadır. `.brain/` dizini karar geçmişini tutar.
- **Kalite** — Auditor kalite kapısı, GO/NO-GO değerlendirmesi ve test zorunluluğu ile her sprint kalite standardını karşılar.
- **Otonom ama kontrollü** — Deckent otonom çalışır ama kullanıcı her zaman kontroldedir. Scope enforcement, audit trail ve memory budget ile sınırlar nettir.
- **Sürekli öğrenim** — Her sprint sonunda MEMORY.md ve PATTERNS.md güncellenir. Sistem zamanla daha iyi kararlar alır, aynı hataları tekrarlamaz.
- **Önce orkestrasyon, sonra otonomi** — Deckent sprint bazlı orkestratör olarak başlar ve tam otonomi'ye doğru evrilir. Her faz bir öncekinin üzerine inşa edilir — kestirme yok, yarım iş yok.

---

## Sayılarla Deckent
| Metrik | Değer |
|--------|-------|
| Version | 0.4.0-beta.1 |
| Sprint | sprint-123 |
| MCP Tools | 20 |
| MCP Resources | 8 |
| CLI Commands | 35+ |
| Dashboard Pages | 6 |
| Agents | 16 built-in |
| Skills | 21 built-in |
| Providers | 3 (Claude, Codex, Gemini) |

## Sprint History
| Sprint | Durum |
|--------|-------|
| sprint-116 | tamamlandı |
| sprint-117 | tamamlandı |
| sprint-118 | tamamlandı |
| sprint-119 | tamamlandı |
| sprint-120 | tamamlandı |
| sprint-121 | tamamlandı |
| sprint-122 | tamamlandı |
| sprint-123 | tamamlandı |

## Sprint Metrics
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-123 |
| Toplam Task | 3 |
| Tamamlanan | 3 |
| Tech Debt | 3 |
| No-Go | 0 |
| Süre | 4dk 30sn |
| Coverage | 0.0% |
