# Brain 8-Phase Sprint Lifecycle

Brain modülü, her sprinti sekiz ardışık fazda yönetir. Bu faz dizisi Deckent'in tüm iş akışını tanımlar ve `sprint-controller.ts` içinde orkestre edilir.

---

## Faz Sırası

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
```

---

## 1. PLAN

**Amaç:** Brain, `DIRECTIVES.md` dosyasını okuyarak sprint hedeflerini analiz eder ve her task için JSON dosyaları oluşturur.

**Kritik Karar:** Hangi task'ların hangi modele, effort seviyesine ve agent'a atanacağına karar verilir. `task-router.ts` üzerinden `TaskDNA` analizi yapılır; her task için en uygun provider, agent ve skill seti belirlenir.

**Temel I/O:**
- **Girdi:** `DIRECTIVES.md`, `.brain/memory.db` (ADR'lar, geçmiş öğrenmeler)
- **Çıktı:** `.tasks/task-NNN.json` dosyaları — her biri `id`, `title`, `description`, `model`, `effort`, `scope`, `goNogo` alanlarını içerir

**Önemli Not:** Planner yalnızca `core/` modüllerinden import yapar (ADR-008 unidirectional bağımlılık kuralı). AI tabanlı planlama (`mode: 'ai'`) veya kural tabanlı planlama (`mode: 'structured'`) kullanılabilir.

---

## 2. SPAWN

**Amaç:** Worker süreçleri ve Auditor tarama döngüsü başlatılır. Her task için ayrı bir worker spawn edilir; paralel çalışma sağlanır.

**Kritik Karar:** Hangi backend kullanılacağı seçilir: `tmux` (kalıcı oturum), `subprocess` (hafif), `Docker` (izole container). Bu seçim `.deckent/config.json` içindeki `spawn_backend` alanına göre belirlenir.

**Temel I/O:**
- **Girdi:** `.tasks/task-NNN.json` dosyaları, provider config, agent promptları
- **Çıktı:** Aktif worker süreçleri, `.tasks/task-NNN.hb` heartbeat dosyaları, `.locks/` kilit dosyaları, `.dashboard` (ilk Auditor taraması)

---

## 3. EXECUTE

**Amaç:** Worker'lar atanan task'ları bağımsız olarak uygular. Her worker kendi scope'unda kalır ve düzenli heartbeat yazar.

**Kritik Karar:** Worker, uygulamanın ADR kısıtlamalarını ihlal edip etmediğini kontrol eder. İhlal varsa, `NO_GO` yazarak durur ve ADR değişiklik önerisi sunar.

**Temel I/O:**
- **Girdi:** `.tasks/task-NNN.json` (atanan task), ADR'lar (Brain tarafından prompt'a enjekte edilir), skill promptları
- **Çıktı:** Değiştirilen kaynak dosyalar, `.tasks/task-NNN.hb` (her değişiklikte güncellenir), `.tasks/task-NNN.plan` (execution planı)

**Auditor Paralel Çalışır:** Auditor her 30 saniyede `git diff --stat` çalıştırarak scope ihlali, heartbeat durması (>2 dakika) ve kilit sorunlarını izler; uyarıları `.dashboard` dosyasına yazar.

---

## 4. EVALUATE

**Amaç:** Brain, tüm worker sonuçlarını toplar ve her task için `GO / NO_GO / GO_WITH_TECH_DEBT` kararı verir.

**Kritik Karar:** `result-evaluator.ts` çok boyutlu kalite skoru hesaplar: `correctness`, `test_coverage`, `scope_compliance`, `documentation`. Eğer A task'ının NO_GO'su B task'ının çıktısından kaynaklanıyorsa, B task'ı öncelikli fix'e alınır.

**Temel I/O:**
- **Girdi:** `.tasks/task-NNN.result` dosyaları (her worker'ın yazdığı JSON)
- **Çıktı:** Değerlendirme kararları; NO_GO task'ları FIX fazına aktarılır, DONE task'ları sprint başarıya sayılır

---

## 5. FIX

**Amaç:** EVALUATE fazında başarısız olan task'lar yeniden denenir. Brain, başarısızlık nedenini analiz eder ve gerekirse farklı bir agent veya model atar.

**Kritik Karar:** `mid-sprint-adapter.ts` devreye girer; task, farklı bir provider ya da model ile yeniden route edilebilir. Maksimum yeniden deneme sayısı konfigüre edilebilir (`fix_max_retries`).

**Temel I/O:**
- **Girdi:** Başarısız task JSON'ları ve result dosyaları, hata detayları
- **Çıktı:** Güncellenmiş `.tasks/task-NNN.result` dosyaları ya da kalıcı NO_GO kararı

---

## 6. RETRO

**Amaç:** Sprint sonuçları özetlenir; öğrenmeler ve kararlar kalıcı belleğe yazılır.

**Kritik Karar:** Hangi bilgilerin uzun vadeli öğrenme olarak saklanacağına karar verilir. `sprint-reporter.ts` bu fazı yönetir ve `quality-assessor.ts` üzerinden genel sprint kalitesini değerlendirir.

**Temel I/O:**
- **Girdi:** Tüm task sonuçları, değerlendirme kararları, Auditor uyarıları
- **Çıktı:** `.brain/memory.db`'ye yeni `memory` ve `retro` kayıtları eklenir, `.brain/exports/summary.md` güncellenir

---

## 7. DECAY

**Amaç:** `.brain/` bellek bütçesi aşıldıysa eski ve düşük önem dereceli kayıtlar kaldırılır. Bellek bütçesi: 900 satır max (MEMORY 300, RETRO 120, PATTERNS 150).

**Kritik Karar:** `store.decay(currentSprintNum, decayAfterSprints)` çağrısıyla hangi kayıtların silineceği belirlenir. `decay_exempt: true` işaretli kayıtlar (örn. `PROJECT-IDENTITY`) korunur.

**Temel I/O:**
- **Girdi:** `.brain/memory.db` (tüm kayıtlar ve `sprint_id`, `last_accessed` metadata'sı)
- **Çıktı:** Kırpılmış `.brain/memory.db`; bellek bütçesi dahilinde tutulan kayıtlar

---

## 8. CLEANUP

**Amaç:** Sprint tamamen kapatılır; tüm geçici dosyalar, kilitler ve oturumlar temizlenir.

**Kritik Karar:** Bu işlem **geri alınamaz** olduğundan Alperen onayı gerektirir (`deckent_kill`, `deckent_cleanup` için). Task dosyaları arşivlenir, silinmez.

**Temel I/O:**
- **Girdi:** `.tasks/task-NNN.*` dosyaları, `.locks/` kilitleri, aktif tmux oturumları
- **Çıktı:** `.tasks/archive/` altında arşivlenmiş task dosyaları, serbest bırakılmış kilitler, kapatılmış tmux oturumları, güncellenen sprint metrikleri

---

## Özet Tablosu

| Faz | Sorumlu Modül | Kritik Çıktı |
|---|---|---|
| PLAN | `planner.ts`, `task-builder.ts` | `.tasks/*.json` |
| SPAWN | `tmux.ts` / `spawn-backend.ts` | Worker süreçleri, `.hb` dosyaları |
| EXECUTE | `worker.ts`, `adaptive-agent.ts` | Değiştirilen kaynak dosyalar, `.result` |
| EVALUATE | `result-evaluator.ts`, `quality-assessor.ts` | GO/NO_GO kararları |
| FIX | `mid-sprint-adapter.ts` | Güncellenmiş `.result` dosyaları |
| RETRO | `sprint-reporter.ts` | `memory.db` öğrenmeler, `summary.md` |
| DECAY | `memory-store.ts` | Kırpılmış `memory.db` |
| CLEANUP | `sprint-controller.ts` | Arşivlenmiş `.tasks/`, serbest kilitler |
