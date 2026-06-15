# Mimari Genel Bakış

deckent, her biri net bir sorumluluk sınırına sahip 13 temel katmandan oluşan modüler bir mimariyle tasarlanmıştır. Bu tasarım, Brain → Worker → Auditor rolleri arasındaki tek yönlü bağımlılık ilkesini (ADR-008) korurken her katmanın bağımsız geliştirilebilmesini sağlar. Tüm kaynak kodu `src/` altında yaşar; aşağıda her katmanın sorumluluğu ve temel modülleri verilmektedir.

---

## Katman Haritası

### `src/orchestra/` — Sprint Yaşam Döngüsü ve Yönlendirme (76+ modül)
Sprint'in baştan sona yönetildiği katman; Brain'in tüm faz mantığı, planlama, değerlendirme, rota belirleme ve retrospektif burada yaşar.

| Modül | Sorumluluk |
|-------|-----------|
| `sprint-controller.ts` | Tam sprint yaşam döngüsü (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP) |
| `brain.ts` | İnce re-export katmanı — dışa açılan tek yüzey |
| `planner.ts` | AI tabanlı görev planlama (yalnızca `core/`'dan import eder) |
| `task-builder.ts` | Görev oluşturma, direktif ayrıştırma, worker prompt inşası, Agent/Skill override çözümleme |
| `result-evaluator.ts` | GO / NO_GO / GO_WITH_TECH_DEBT değerlendirmesi |
| `task-router.ts` | Her görev için provider + agent + skill seçimi |
| `debt-manager.ts` | Teknik borç I/O, çürüme, desen yönetimi |
| `sprint-reporter.ts` | Retrospektif, öğrenimler, agent/skill performansı |
| `tmux.ts` | tmux oturum yönetimi, worker başlatma/durdurma |
| `spawn-backend.ts` | Alt süreç (subprocess) worker arka ucu |
| `result-collector.ts` | Sonuç bekleme, kuyruk işleme, sonuç toplama + IPC |
| `dependency-scheduler.ts` | Kahn topolojik dalga sıralama |
| `outcome-tracker.ts` | Yönlendirme çıktısı kayıt, öğrenim bonusları, sinerji matrisi |
| `quality-assessor.ts` | Çok boyutlu kalite puanlama (doğruluk, kapsam, tamamlanma) |
| `mid-sprint-adapter.ts` | FIX fazında gerçek zamanlı yeniden yönlendirme |

---

### `src/core/` — Tipler, Konfigürasyon, Yardımcı Araçlar (90+ modül)
Tüm diğer katmanların import ettiği ortak altyapı; hiçbir üst katmanı import etmez.

| Modül | Sorumluluk |
|-------|-----------|
| `types.ts` + `*-types.ts` | Tüm tip tanımları (task, config, sprint, monitoring, routing) |
| `config.ts` | 3 katman konfigürasyon birleştirme (varsayılanlar → global → proje) |
| `agent-pool.ts` | AgentPoolManager, 15 built-in agent, LRU tahliye (maks. 50 geçici) |
| `skill-pool.ts` + `skill-registry.ts` | 21 built-in skill, AST sandbox doğrulama |
| `provider.ts` | ProviderAdapter arayüzü, çok-provider kayıt defteri |
| `routing-engine.ts` | Birleşik yönlendirme (routeTaskV2), güven puanı, override çözümleme |
| `model-registry.ts` | ModelRegistry — 14 built-in model (3 cloud provider), 4 tier |
| `memory-store.ts` | MemoryStore — SQLite DB-first hafıza (CRUD, FTS5, etiketler, ilişkiler, çürüme) |
| `memory-query.ts` | FTS5 çift katman arama (özgün + Türkçe normalize) |
| `intent-classifier.ts` | Görev niyeti sınıflandırma (katman 1) |
| `activation-engine.ts` | Yapılandırılmış aktivasyon kuralları (katman 2) |

---

### `src/agents/` — Worker Yürütme ve Prompt Mühendisliği (20 modül)
Görev talep etme, dosya kilitleme, heartbeat yazma ve sonuç üretme işlemlerinin gerçekleştiği katman.

- `worker.ts` — Görev talep etme, dosya kilitleme, heartbeat, sonuç yazma
- `adaptive-agent.ts` — Çalışma zamanı agent uyarlaması

---

### `src/nervous/` — Proaktif Meta-Orkestratör
Kullanıcı komutu beklemeden tetiklenen, kararlar öneren ve Brain'in onayıyla uygulayan katman (ADR-040).

Bileşenler: `observer` → `detector-registry` → `decision-engine` → `proposer` → `dispatcher` → `executor` → `authority-matrix` → `runtime-scope-check` → `history`

---

### `src/monitor/` — Denetim Tarama Döngüsü
Auditor'ın çalıştığı katman; her 30 saniyede aktif worker'ları izler, `.dashboard` dosyasını günceller, stale heartbeat ve scope ihlallerini raporlar.

---

### `src/connectors/` — Harici Mesajlaşma Adaptörleri
Discord, Telegram ve WhatsApp üzerinden gelen komutları iç yönlendiriciye ileten bağlayıcılar.

---

### `src/providers/` — AI Provider Adaptörleri (5 modül)
Claude, Codex (OpenAI) ve Gemini ile konuşan adaptörler; provider bağımsız tier yönlendirmesini hayata geçirir.

---

### `src/api/` — HTTP API Sunucusu (4 modül)
`deckent serve` komutuyla başlayan REST API: OIDC auth, SSE, hız sınırlama ve dashboard kontrol düzlemi uç noktaları.

---

### `src/mcp/` — MCP Sunucusu
`deckent-mcp` paketi — 34 araç ve 8 kaynak ile MCP destekli editor ve araçlara stdio transport üzerinden deckent yeteneklerini sunar.

---

### `src/cli/` — Komut Satırı Arayüzü (55+ komut)
`commander.js` tabanlı CLI giriş noktası; her komut `register<Name>(program)` patterniyle (ADR-012) kayıt edilir.

---

### `src/dashboard/` — Web Arayüzü
React + Vite + Tailwind ile inşa edilmiş 12 sayfalık web kontrol paneli; gömülü web terminal (PTY + WebSocket, ADR-062).

---

### `src/extensions/vscode/` — VS Code Uzantısı
VS Code'dan deckent'e erişim sağlayan IDE uzantısı.

---

## Bağımlılık Yönü (ADR-008)

```
cli/ mcp/ api/ dashboard/
        ↓
  orchestra/ (Brain-ailesi)
        ↓
     core/
        ↓
  agents/ monitor/ connectors/
```

`core/` hiçbir üst katmanı import etmez. `agents/`, `monitor/` ve `connectors/` Brain'i import etmez — Brain onları import eder. Bu tek yönlü kuralın ihlali, derleme zamanı lint denetimi (`src/orchestra/authority-enforcer.ts`) ile tespit edilir.

---

## Modül Sayıları (Referans)

| Katman | Yaklaşık Modül |
|--------|--------------|
| `orchestra/` | 76+ |
| `core/` | 90+ |
| `agents/` | 20 |
| `cli/` | 55+ komut |
| `mcp/` | 34 araç, 8 kaynak |
