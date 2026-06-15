# Brain Orchestrator — deckent'in Tek Karar Merkezi

Brain, deckent'in tüm sprint yaşam döngüsünü yöneten tek orkestratördür. Hiçbir worker ve auditor plan yapmaz, görev sırası belirlemez; tüm kararlar Brain üzerinden akar. Bu belge Brain'in mimari yapısını, sprint döngüsünü ve modüler iç akışını açıklar.

---

## Brain Nedir?

Brain, `src/orchestra/sprint-controller.ts` tarafından tanımlanan orkestrasyon katmanıdır. Sprint 136'da gerçekleştirilen god-object split'iyle `sprint-controller.ts`, ~1894 satırlık tek bir dosyadan ~209 satırlık ince bir re-export katmanına indirildi. Gerçek iş mantığı bugün 10'dan fazla alt-modüle dağılmış durumdadır:

| Modül | Sorumluluk |
|-------|-----------|
| `sprint-phases.ts` | 8 fazın tam implementasyonu (runPlanPhase → runCleanupPhase) |
| `sprint-planner.ts` | `readContext()`, `planSprint()`, `confirmDraftTasks()` |
| `task-builder.ts` | Direktif ayrıştırma, görev JSON üretimi, worker prompt oluşturma |
| `result-evaluator.ts` | GO / NO_GO / GO_WITH_TECH_DEBT kararı |
| `sprint-spawner.ts` | Worker spawn, `respawnEligibleTasks()`, wave yönetimi |
| `sprint-finalizer.ts` | Sprint kapanışı, adaptif eşikler, dürüstlük kontrolü |
| `result-collector.ts` | `.result` dosyalarını toplama, token kullanım zenginleştirme |
| `ipc-registry.ts` | Worker-Brain IPC kanal kaydı |
| `sprint-lifecycle.ts` | Durdurma, duraklatma, devam, insan onayı bekleme |
| `sprint-utils.ts` | Zaman, sprint durumu okuma/yazma, sağlayıcı varsayılanları |

`src/orchestra/brain.ts` ise yalnızca bu modüllerin `export`'larını yeniden dışa aktaran ince bir zarf dosyasıdır.

---

## 8 Faz Sprint Döngüsü

Brain her sprint'te şu sırayı izler:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
```

### PLAN — `runPlanPhase()`
Brain, `DIRECTIVES.md`'yi okur. `sprint-planner.ts` içindeki `readContext()` ile `.brain/memory.db`'den ilgili ADR'ları, geçmiş dersleri ve borç girişlerini sorgular. `planSprint()`, yönetilen dokümanları oluşturur ve her görev için `.tasks/task-NNN.json` dosyalarını yazar. Planlama modu `'ai'` ise LLM tabanlı, `'structured'` ise kural tabanlı çalışır.

### SPAWN — `runSpawnPhase()`
`sprint-spawner.ts`, görevleri yapılandırılmış bağımlılık grafiği üzerinden (Kahn algoritması ile) wave'lere ayırır. Worker'lar tmux, subprocess veya Docker backend'i aracılığıyla spawn edilir. Auditor scan döngüsü başlar.

### EXECUTE
Worker'lar bağımsız süreçlerde çalışır. Her dosya değişikliğinde `.tasks/task-NNN.hb` (heartbeat) dosyasını günceller. Brain bu süreçte herhangi bir kod çalıştırmaz; sadece sonuç bekler.

### EVALUATE — `runEvaluatePhase()`
`result-collector.ts`, tamamlanan `.result` dosyalarını toplar. `result-evaluator.ts`, her görevi GO / NO_GO / GO_WITH_TECH_DEBT olarak değerlendirir. Değerlendirme kriterleri direktiflerden gelen `goCriteria` ve `noGoCriteria` alanlarına dayanır.

### FIX — `runFixPhase()`
NO_GO kararı alan görevler, yeniden deneme (FIX) fazına alınır. `mid-sprint-adapter.ts`, başarısız görevi analiz ederek yeniden yazılmış bir prompt ile başka bir worker spawn eder.

### RETRO — `runRetroPhase()`
Sprint kazanımları ve kayıpları `.brain/memory.db`'ye `type: 'retro'` girişi olarak yazılır. Mevcut exportlar `deckent memory export` ile güncellenir.

### DECAY — `runDecayPhase()`
`.brain/memory.db`, yapılandırılan `decay_after_sprints` değerine göre eski girdileri düşürür. Bellek bütçesi aşıldığında bu faz devreye girer.

### CLEANUP — `runCleanupPhase()`
Görev dosyaları arşivlenir, kilitler serbest bırakılır, tmux oturumları kapatılır ve sprint tamamlandı olarak işaretlenir.

---

## Planner → Task-Builder → Evaluator Akışı

```
DIRECTIVES.md
     │
     ▼
sprint-planner.ts::planSprint()
  ├── readContext()          → memory.db'den ADR + ders + borç
  ├── LLM / kural motoru    → PlannerTask[] üretimi
  └── confirmDraftTasks()   → taslak onayı
          │
          ▼
task-builder.ts::buildTask()
  ├── DirectiveTaskSchema    → Zod doğrulama
  ├── selectRelevantAdrs()   → ilgili ADR'ları seç, worker prompt'a enjekte et
  ├── buildTaskPrompt()      → tam worker prompt (ADR + skill + agent + handoff)
  └── deriveTestScope()      → test kapsamı çıkarımı
          │
          ▼
  .tasks/task-NNN.json       → worker tarafından okunur
          │
          ▼
result-collector.ts::collectResults()
  └── applyStatusMutation()  → selfAssessment → TaskStatus dönüşümü
          │
          ▼
result-evaluator.ts::evaluateWithRubric()
  └── GO / NO_GO / GO_WITH_TECH_DEBT kararı
```

---

## ADR-008: Tek Yönlü Bağımlılık Kuralı

Brain mimarisinin temel kuralı ADR-008'de tanımlanmıştır: `core/` katmanı asla `orchestra/` katmanına import yapamaz. Bağımlılık akışı tek yönlüdür:

```
cli/ api/ mcp/
      │
      ▼
orchestra/ (Brain ailesi)
      │
      ▼
core/ (tipler, config, araçlar)
```

- `tmux.ts`, `auditor.ts`, `worker.ts` — yalnızca Brain ailesi bu modülleri import eder.
- Planner (`sprint-planner.ts`) yalnızca `core/`'dan import yapar.
- Auditor ve Worker, Brain'i hiçbir zaman import etmez; disk üzerinden task dosyalarını okur.

Sprint 279'da tespit edilen `routing-engine.ts → orchestra/ecosystem-intelligence.ts` çapraz bağımlılığı, ADR-008-W iş maddesi olarak açık bir ihlal kaydı olarak tutulmaktadır ve henüz çözülmemiştir.

---

## Brain Tek Orkestratör İlkesi

Brain'in tek orkestratör olması şu garantileri sağlar:

- **Kararlar merkezîdir.** Worker'lar yalnızca görevlerini uygular; hangi görevin ne zaman çalışacağını bilmez.
- **ADR yönetişimi zorunludur.** `selectRelevantAdrs()`, her worker promptuna ilgili ADR'ları enjekte eder. Worker bunlara uymak zorundadır; ihlal → NO_GO + ADR değişiklik önerisi.
- **Döngüsel import yasaktır.** ADR-008 ihlali, CI lint tarafından tespit edilir ve advisory/soft enforcement ile raporlanır (ADR-037 V1.0).
- **Sprint asla yarıda bırakılmaz.** 8 faz tamamlanmadan sprint tamamlanmış sayılmaz; kayıp veya başarısız görevler FIX veya NO_GO ile belgelenir.
