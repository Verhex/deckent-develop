# Sprint Yaşam Döngüsü

Sprint, deckent'in temel yürütme birimidir: bir veya daha fazla görevin birlikte planlandığı, worker'lara dağıtıldığı ve değerlendirildiği zaman dilimidir. Her sprint kimliği `sprint-NNN` biçiminde sıralıdır ve 8 zorunlu fazdan geçer. Hiçbir sprint eksik bırakılamaz — bu, Brain'in temel kuralıdır.

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
```

---

## Faz 1: PLAN

**Sorumlu:** Brain (`src/orchestra/sprint-controller.ts` → `planner.ts`)

Brain, `DIRECTIVES.md` dosyasını okur ve her görevi `.tasks/task-NNN.json` formatında bir JSON dosyasına dönüştürür. Bu aşamada:

- Her görev için model, effort, provider, scope ve GO/NO_GO kriterleri belirlenir.
- Görev bağımlılıkları tanımlanır.
- `dependency_pipeline_enabled: true` iken (varsayılan), görevler Kahn topolojik algoritmasıyla wave'lere bölünür — bağımsız görevler aynı wave'de paralel yürütülür.
- `task-builder.ts` Agent/Skill override'larını çözümler; `task-router.ts` her görev için uygun agent ve provider'ı seçer.
- Planlama modu: `mode: 'ai'` (AI yorumlama), `mode: 'structured'` (deterministik kural tabanlı) veya `mode: 'auto'` (proje boyutuna göre otomatik).

**Çıktı:** `.tasks/` altında görev JSON dosyaları.

---

## Faz 2: SPAWN

**Sorumlu:** Brain (`src/orchestra/tmux.ts` veya `src/orchestra/spawn-backend.ts`)

Brain, planlanan görevleri worker process'ler olarak başlatır. Arka uç konfigürasyona göre seçilir:

- **tmux:** Her worker kendi tmux penceresinde çalışır — interaktif izleme mümkün.
- **subprocess:** Arka planda alt süreç; CI/CD için tercih edilir.
- **Docker:** Her worker izole container'da çalışır.

Aynı anda Auditor tarama döngüsü (`src/monitor/`) başlar. Worker'lar ilk heartbeat dosyasını (`.tasks/task-NNN.hb`) bu aşamada yazar.

**Çıktı:** Çalışan worker process'ler + Auditor aktif.

---

## Faz 2a: WAVE_BUILD (Bağımlılık Modu)

**Sorumlu:** Brain (`src/orchestra/dependency-scheduler.ts`)

`dependency_pipeline_enabled: true` olduğunda (ADR-045), görevler bağımlılık grafiğinden türetilen wave'lere ayrılır:

- Wave N tamamlanmadan Wave N+1 başlamaz.
- Her wave içindeki görevler paralel yürütülür.
- Tamamlanma koşulu: `DONE ∪ MANUAL_REVIEW_REQUIRED` (MRR-deadlock fix, Sprint 280).

Bu faz, bağımsız görev zincirleri arasında maksimum paralellik sağlarken bağımlı görevlerin doğru sırayla çalışmasını garanti eder.

---

## Faz 3: EXECUTE

**Sorumlu:** Worker'lar (`src/agents/worker.ts`)

Her worker kendi görev dosyasını okur ve tanımlanan scope içinde kalarak görevi uygular:

- Heartbeat dosyasını (`task-NNN.hb`) her değişiklikte günceller — Auditor 2 dakika yanıt gelmezse worker'ı stale olarak işaretler.
- Görev tamamlandığında veya başarısız olduğunda `.tasks/task-NNN.result` dosyasını yazar.
- Self-assessment: `DONE` | `GO_WITH_TECH_DEBT` | `NO_GO`.
- Scope dışındaki dosyalara yazılmaz — ihlal Auditor tarafından `git diff --stat` ile tespit edilir.

**Paralel yürütme:** Aynı wave'deki worker'lar eş zamanlı çalışır. Brain, tüm `.result` dosyalarının yazılmasını bekler.

---

## Faz 4: EVALUATE

**Sorumlu:** Brain (`src/orchestra/result-evaluator.ts`)

Brain, her `.result` dosyasını goCriteria'ya göre değerlendirir:

| Karar | Anlam |
|-------|-------|
| **GO** | Tüm kriterler karşılandı, görev tamamlandı |
| **NO_GO** | Kritik bir kriter karşılanmadı, FIX fazı gerekli |
| **GO_WITH_TECH_DEBT** | Temel kriterler karşılandı, küçük eksikler var; teknik borç kaydedilir |

Çoklu boyutlu kalite puanlama (`quality-assessor.ts`) doğruluk, test kapsamı, scope uyumu ve belgeleme boyutlarını değerlendirir. Auditor denetim raporu (`cross-verify-runner.ts`) isteğe bağlı olarak ek doğrulama sağlar.

---

## Faz 5: FIX

**Sorumlu:** Brain + Worker'lar (`src/orchestra/mid-sprint-adapter.ts`)

NO_GO sonuçlanan görevler yeniden denenir:

- Brain, başarısız görev için zenginleştirilmiş bir FIX prompt'u hazırlar.
- Yeni worker başlatılır — önceki worker'ın `notes` alanı bağlam olarak enjekte edilir.
- Maksimum deneme sayısı konfigüre edilebilir (varsayılan: 1 yeniden deneme).
- A'nın NO_GO'su B'nin çıktısından kaynaklanıyorsa, B öncelikli FIX adayı olur.

---

## Faz 6: RETRO

**Sorumlu:** Brain (`src/orchestra/sprint-reporter.ts`)

Sprint tamamlandıktan sonra Brain retrospektif yazar:

- Öğrenimler `memory.db`'ye `{ type: 'memory', sprint_id }` formatında eklenir.
- Retrospektif `memory.db`'ye `{ type: 'retro', sprint_id }` olarak upsert edilir.
- Agent ve skill performans istatistikleri güncellenir (`totalUses`, `successRate`).
- Konfigürasyon önerileri üretilir: NO_GO oranı, coverage düşüklüğü, süre aşımları.

**Çıktı:** `.brain/exports/summary.md`, `memory.md`, `decisions.md`, `debt.md` güncellenmiş snapshot'lar.

---

## Faz 7: DECAY

**Sorumlu:** Brain (`memory-store.ts` → `store.decay()`)

`.brain/` bellek bütçesi (900 satır limiti) aşıldıysa eski ve düşük önem puanlı girişler çürütülür:

- `decay_exempt: true` işaretli girişler (kritik ADR'lar, kimlik kaydı) dokunulmaz.
- Çürüme hassasiyeti `memory.decay_after_sprints` konfigürasyonuyla ayarlanır.
- Çürüyen girişler silinmez — `status: 'decayed'` olarak işaretlenir ve arama sonuçlarından düşük öncelikle listelenir.

---

## Faz 8: CLEANUP

**Sorumlu:** Brain

Sprint kaynaklarını serbest bırakır:

- `.tasks/` altındaki görev dosyaları `.tasks/archive/sprint-NNN/` altına taşınır.
- `.locks/` dosyaları temizlenir.
- Aktif tmux oturumları kapatılır (tmux backend).
- Sprint tamamlanmış olarak işaretlenir.

```bash
# Manuel cleanup (gerekirse)
deckent cleanup
# veya MCP aracılığıyla:
# deckent_cleanup { root: "." }
```

---

## Sprint Özeti: 8 Faz Tablosu

| Faz | Sorumlu | Çıktı |
|-----|---------|-------|
| PLAN | Brain | `.tasks/task-NNN.json` dosyaları |
| SPAWN | Brain | Çalışan worker process'ler |
| WAVE_BUILD | Brain | Topologik wave'ler |
| EXECUTE | Worker'lar | `.tasks/task-NNN.result` dosyaları |
| EVALUATE | Brain | GO / NO_GO / GO_WITH_TECH_DEBT kararları |
| FIX | Brain + Worker'lar | Yeniden denenen görevler |
| RETRO | Brain | `memory.db` öğrenim ve retrospektif kayıtları |
| DECAY | Brain | Bellek bütçesi optimizasyonu |
| CLEANUP | Brain | Arşivlenmiş görevler, temizlenmiş kilitler |

---

## Sprint Durumu İzleme

Sprint boyunca durumu izlemek için:

```bash
# Anlık durum
deckent status

# Canlı izleme
deckent status --watch

# JSON çıktı (otomasyon için)
deckent status --json
```

MCP ile:
```
deckent_status { watch: false, json: false }
deckent_watch  { } # SSE akışı
```
