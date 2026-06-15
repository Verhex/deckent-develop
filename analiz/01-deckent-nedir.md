# deckent Nedir?

deckent, yazılım projelerinde birden fazla AI agent'ı eş zamanlı orkestre eden, sprint tabanlı görev yürütme motoru sunan açık kaynaklı bir CLI aracıdır. Geliştiricinin terminal komutuyla başlattığı her sprint'te deckent; görevleri planlar, uzman agent'lara dağıtır, bağımlılık sırasını yönetir ve sonuçları değerlendirerek projeyi ileriye taşır — hiçbir bulut hesabı veya abonelik gerektirmeden.

---

## Hangi Problemi Çözer?

Büyük yazılım projelerinde AI destekli geliştirme yaparken geliştiricilerin karşılaştığı temel engel, tek bir AI oturumunun aynı anda birden fazla bağımsız görevi paralel yürütememesidir. Tek bir konuşma akışında hem güvenlik denetimi hem API belgesi yazımı hem de birim testi eklenmeye çalışıldığında bağlam sınırı aşılır ve kalite düşer.

deckent bu sorunu şöyle çözer:

- **Paralel yürütme:** Bağımsız görevler birden fazla agent'a aynı anda atanır.
- **Uzmanlaşmış agent'lar:** Her görev, kendi uzmanlık alanına sahip bir agent (örn. `security-auditor`, `doc-writer`, `bug-fixer`) tarafından yürütülür.
- **Bağımlılık yönetimi:** Birbirine bağlı görevler Kahn algoritmasıyla topologik sıraya dizilir; birini tamamlamadan diğeri başlamaz.
- **Kalite kapısı:** Her görev tamamlandığında Brain sonucu değerlendirir: GO / NO_GO / GO_WITH_TECH_DEBT. Başarısız görevler FIX fazında yeniden denenir.

---

## Kim İçin?

deckent, projesini hızlı ve güvenilir biçimde ilerletmek isteyen yazılım geliştiricileri için tasarlanmıştır. Özellikle şu profiller için uygundur:

- **Bağımsız geliştiriciler ve küçük ekipler:** Tek başına çalışırken birden fazla AI agent'ı bir orkestra gibi yönetmek isteyenler.
- **Büyük kod tabanlarını yönetenler:** 50+ modüle sahip TypeScript/Node.js projelerinde refactor, test, dokümantasyon gibi çoklu görevi paralel tamamlamak isteyenler.
- **DevOps ve CI entegrasyonu arayanlar:** Sprint çıktılarını CI/CD pipeline'a bağlamak isteyen ekipler.
- **AI araçları inşa edenler:** Kendi agent/skill'lerini kayıt ettirip MCP üzerinden çağırmak isteyen geliştiriciler.

---

## Temel Kavramlar

### Brain
Brain, deckent'in tek orkestratörüdür. DIRECTIVES.md'yi okuyarak sprint planını oluşturur, görevleri wave'lere böler, worker'ları başlatır, sonuçları değerlendirir ve retrospektif yazar. Tüm kontrol akışı `src/orchestra/sprint-controller.ts` üzerinden geçer. Brain asla kod yazmaz; yalnızca yönetir ve değerlendirir.

### Worker
Worker, tek bir görevi yürüten AI agent'ıdır. Kendi görev dosyasını (`.tasks/task-NNN.json`) okur, tanımlanan scope içinde kalır, heartbeat dosyası (`.tasks/task-NNN.hb`) yazar ve tamamlayınca sonucu (`.tasks/task-NNN.result`) bırakır. Her worker bağımsız bir Claude Code (veya Codex/Gemini) oturumunda çalışır. Kaynak: `src/agents/worker.ts`.

### Auditor
Auditor, sprint boyunca arka planda çalışan denetim döngüsüdür. Her 30 saniyede bir aktif worker'ları izler, `git diff --stat` ile scope ihlallerini tespit eder, kalp atışı durmuş (>2 dakika) worker'ları uyarı olarak işaretler ve `.dashboard` dosyasını günceller. Auditor asla kaynak kodu yazmaz. Kaynak: `src/monitor/`.

### Sprint
Sprint, bir veya birden fazla görevin birlikte planlandığı ve yürütüldüğü zaman dilimidir. Her sprint DIRECTIVES.md ile başlar, 8 fazdan geçer (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP) ve retrospektif ile kapanır. Sprint kimliği `sprint-NNN` biçiminde sıralıdır.

---

## Hızlı Başlangıç

```bash
# 1. Projeyi başlat
npx deckent init

# 2. Sprint hedeflerini yaz
# DIRECTIVES.md dosyasını düzenle

# 3. Planla
deckent plan

# 4. Başlat
deckent start

# 5. İzle
deckent status
```

deckent kurulumu için bulut hesabı, API anahtarı veya abonelik gerekmez. `npx deckent init` tek komutla çalışır duruma gelir.

---

## Teknik Kimlik

| Alan | Değer |
|------|-------|
| Dil | TypeScript (ESM) |
| Runtime | Node.js ≥24.0.0 |
| Lisans | MIT |
| Sürüm | 1.0.0-beta.1 |
| CLI komutları | 55+ |
| MCP araçları | 34 araç, 8 kaynak |
| Built-in agent | 15 |
| Built-in skill | 21 |
| Provider | Claude, Codex (OpenAI), Gemini + Ollama (yerel) |
| Platform | macOS, Linux, WSL2 |
