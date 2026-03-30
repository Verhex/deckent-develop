<!-- Dil: TR | Teknik terimler EN -->

# Deckent — Vizyon ve Strateji

---

## Vizyon

Deckent, yazılım geliştirmeyi tek bir AI asistanından çok-ajanlı bir ekibe dönüştüren açık kaynak orkestrasyon CLI'dır. İnsan sadece hedefi tanımlar — Deckent planlar, paralel worker'lar atar, kaliteyi izler ve sonuçları değerlendirir. Nihai hedef: bir DIRECTIVES.md yazmak, gerisini Deckent'e bırakmak.

---

## Misyon

Solo AI asistanı kullanımı doğası gereği sınırlıdır: tek context window, tek görev, tek bakış açısı. Deckent bu sınırı Brain-Worker-Auditor mimarisi ile aşar. Brain stratejiyi belirler, Worker'lar paralel çalışır, Auditor kaliteyi garanti eder. Her sprint sonunda öğrenimler hafızaya yazılır — sistem her iterasyonda daha iyi kararlar alır.

---

## Hedef Kullanıcılar

| Segment | Profil | Deckent Değeri |
|---------|--------|----------------|
| **Bireysel geliştirici** | Indie dev, freelancer, solo founder | Tek kişilik bir takıma multi-agent güç katmak — sprint'lerle paralel iş çıkarma |
| **Küçük takım** | 2-10 kişilik startup veya ekip | AI worker'ları ekip üyesi gibi kullanmak — tekrarlayan görevleri otomatize etme |
| **Enterprise** | Büyük ölçekli organizasyon (gelecek) | Kontrollü otonom geliştirme — audit trail, scope enforcement, memory/learning |

---

## Rakip Analizi

| Araç | Yaklaşım | Güçlü Yön | Zayıf Yön | Deckent Farkı |
|------|----------|-----------|-----------|---------------|
| **Devin** | Tam otonom AI geliştirici | End-to-end otonom çalışma | Kapalı kaynak, pahalı, kontrol eksik | Açık kaynak, orkestrasyon odaklı, kullanıcı kontrollü |
| **OpenHands** | Açık kaynak AI geliştirici | Topluluk destekli, genişletilebilir | Tek agent, sprint lifecycle yok | Multi-agent, hafıza/öğrenim, kalite kapısı |
| **Aider** | Git-entegre AI pair programming | Hafif, hızlı, git-native | Tek agent, orkestrasyon yok | Paralel worker, planlama, değerlendirme döngüsü |
| **Cursor** | AI-destekli IDE | Zengin IDE deneyimi | IDE'ye bağlı, orkestrasyon yok | IDE-agnostik CLI, çoklu provider, sprint yaşam döngüsü |
| **Claude Code (solo)** | Tek AI asistanı | Güçlü tek-görev performansı | Tek context, paralel yok | Claude Code'u worker olarak kullanır, orkestrasyon katmanı ekler |

**Deckent'in temel farkı:** Orkestrasyon. Tek bir AI asistanını güçlendirmek yerine, birden fazla AI worker'ı bir sprint disiplini içinde koordine eder. Planlama, yürütme, değerlendirme ve öğrenim tek bir döngüde birleşir.

---

## Teknoloji Kararları

### TypeScript + ESM

TypeScript, tip güvenliği ile büyük kod tabanlarında güvenilir refactoring sağlar. ESM (ES Modules) modern Node.js ekosistemiyle uyumludur ve tree-shaking gibi optimizasyonlara kapı açar. AI agent'ları yöneten bir sistem için tip güvenliği kritiktir — hatalı config veya task yapısı sprint'i çökertir.

### Multi-Provider (Claude + Codex + Gemini)

Tek bir AI provider'a bağımlılık hem maliyet hem de erişilebilirlik riski oluşturur. Deckent, provider-agnostic bir mimari ile farklı görevlere farklı modeller atayabilir: opus karmaşık mimari kararlar için, haiku basit dokümantasyon için. Provider fallback zinciri kesinti dayanıklılığı sağlar.

### tmux + Subprocess Backend

tmux, birden fazla AI worker'ı paralel terminal session'larında çalıştırır — her worker kendi izole ortamında kod yazar, test eder ve raporlar. tmux olmayan ortamlar (Windows gibi) için subprocess backend alternatif sunar. Bu çift backend yaklaşımı platform bağımsızlığı sağlar.

### MCP (Model Context Protocol) Entegrasyonu

MCP, Deckent'i herhangi bir MCP-uyumlu IDE veya araçla entegre eder. 17 tool ve 9 resource ile sprint yaşam döngüsünün tamamı programatik olarak erişilebilir. Bu, Deckent'i sadece bir CLI değil, bir platform haline getirir.

---

## Yol Haritası

### Faz 1: "Kendin Kullan" — Tamamlandı

npm paketleme, dogfooding, Windows desteği, temel sprint döngüsü. Vizetron (Python/FastAPI) projesinde gerçek sprint'ler başarıyla tamamlandı.

### Faz 1.5: "Init UX + Onboarding" — Tamamlandı

Init wizard, stack detection, quick-start rehberi, worker prompt iyileştirmeleri. 26 dogfooding bug'ının 22'si düzeltildi.

### Faz 2: "Genel Kullanılabilirlik" — Aktif

Provider ve tier generalizasyonu, dokümantasyon tutarlılığı, god object split, güvenlik altyapısı. Multi-provider test ve dashboard iyileştirmeleri devam ediyor.

### Faz 3: "Dokümantasyon"

TR+EN çift dil desteği, VISION belgesi, link audit, config dashboard. Kullanıcı-dostu dokümantasyonla onboarding süresini kısaltma.

### Faz 4: "Public Repo"

Secret leak koruması (.detect-secrets), VerhexIO/deckent açık kaynak reposuna taşıma, CI/CD pipeline, npm publish. Topluluk katkısına açılma.

---

## Değerler

- **Açık kaynak** — Deckent ücretsiz ve açık kaynaklıdır. Topluluk katkısına açıktır.
- **Şeffaflık** — Her sprint'in planı, sonucu ve öğrenimi kayıt altındadır. `.brain/` dizini karar geçmişini tutar.
- **Kalite** — Auditor kalite kapısı, GO/NO-GO değerlendirmesi ve test zorunluluğu ile her sprint kalite standardını karşılar.
- **Otonom ama kontrollü** — Deckent otonom çalışır ama kullanıcı her zaman kontroldedir. Scope enforcement, audit trail ve memory budget ile sınırlar nettir.
- **Sürekli öğrenim** — Her sprint sonunda MEMORY.md ve PATTERNS.md güncellenir. Sistem zamanla daha iyi kararlar alır, aynı hataları tekrarlamaz.

---

## Sayılarla Deckent

| Metrik | Değer |
|--------|-------|
| Test sayısı | 12,180+ |
| Coverage | 96%+ |
| Tamamlanan sprint | 74+ |
| CLI komut | 33+ |
| MCP tool | 17 |
| MCP resource | 9 |
| Built-in agent | 9 |
| Built-in skill | 11 |
| Provider | 3 (Claude, Codex, Gemini) |
| Platform | macOS, Linux, WSL2, Windows |
