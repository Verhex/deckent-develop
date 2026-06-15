# Nervous System — Proaktif Meta-Orchestrator

deckent Nervous System, sprint sırasında meydana gelen anormal durumları (donmuş worker, scope çakışması, agent yönlendirme sapması, DIRECTIVES.md bozulması) kullanıcı müdahalesine gerek kalmadan tespit eden, öneri üreten veya doğrudan çözen proaktif bir meta-katmandır. ADR-040'ta tanımlanmış, `src/nervous/` altında hayata geçirilmiştir.

---

## Neden Gerekli?

Sprint 145-146 boyunca yaşanan canlı olaylar reaktif mimarinin sınırlarını gösterdi:

- **Sprint 145 08:14**: `DIRECTIVES.md` EXECUTE fazında 463 byte'lık boş template'e döndü. Sprint manüel müdahaleye durdu.
- **Sprint 145**: test-writer agent 17 task'ın 14'üne (%82) route edildi — normal dağılım %40 eşiğini çok aştı.
- **Sprint 146 T-146-005**: `assignedAgent` alanına `string;` TypeScript syntax artığı yazıldı. Sprint sonuna kadar fark edilmedi.

Tüm bu hatalar retro'dan sonra görüldü. Proaktif bir gözlemci yoktu.

---

## Pipeline Mimarisi

```
Observer → DetectorRegistry → DecisionEngine → Proposer → Dispatcher → Executor
```

Her bileşen `src/nervous/` altında kendi modülünde yaşar.

---

## Observer (`src/nervous/observer.ts`)

4 event kaynağını tek `observe` event akışına dönüştürür:

| Kaynak | Açıklama |
|--------|----------|
| `event-bus` | EventBus üzerinden sprint lifecycle olayları (SPRINT_PHASE_CHANGE, SPRINT_STARTED, SPRINT_COMPLETED, SPRINT_RETRO_COMPLETE) |
| `filesystem` | `fs.watch` ile `.tasks/`, `.brain/`, `DIRECTIVES.md`, `.deckent/` izleme |
| `cron` | Konfigürasyona göre düzenli aralık tick (varsayılan 15s) |
| `sprint-lifecycle` | EventBus sprint faz değişim olayları |

---

## DetectorRegistry (`src/nervous/detector-registry.ts`)

12 detector, her biri bağımsız olarak çalışır — birinin başarısız olması diğerlerini etkilemez:

| Detector | Tespit Ettiği |
|----------|--------------|
| `StaleWorkerDetector` | 3 dk+ heartbeat yok → worker donmuş |
| `ScopeCollisionMonitor` | PLAN/EXECUTE fazında çakışan `filesWrite` alanları |
| `DebtTrendAnalyzer` | Son 3 sprint >%15 teknik borç oranı |
| `AgentRoutingHealth` | `string;` corruption + %40 anomali eşiği |
| `DirectivesMidSprintProtection` | EXECUTE/FIX fazında `DIRECTIVES.md` template'e dönüşü |
| `TaskModeIdleDetector` | Task modunda boşta kalan sprint |
| `BuildFailureRecurrenceDetector` | Tekrarlayan build hataları |
| `TokenSpikeDetector` | Anormal token kullanım artışı |
| `AgentRoutingAnomalyDetector` | Routing dağılımındaki sapma |
| `ScopeCollisionRateDetector` | Scope ihlali oranı artışı |
| `NotificationDeliveryHealthDetector` | Bildirim dağıtım sağlığı |
| `DeadEventStreamDetector` | Ölü event akışı tespiti |

---

## DecisionEngine (`src/nervous/decision-engine.ts`)

`DetectorResult` → `AuthorityMatrix` araması → `DecisionOutput`:

- Eylem politikasını belirler: autonomous / suggest-timeout / approve
- Güvenlik katmanı (Safety Floor) kontrolü
- Sessiz saatler desteği (quiet hours)

---

## Authority Matrix (`src/nervous/authority-matrix.ts`)

4 preset, kullanıcı tarafından seçilir:

| Preset | Düşük Risk | Orta Risk | Yüksek Risk |
|--------|-----------|-----------|------------|
| `strict` | suggest-30m | approve | approve |
| `balanced` | autonomous | suggest-30m | approve |
| `autopilot` | autonomous | autonomous | suggest-5m |
| `full-auto` | autonomous | autonomous | autonomous |

### 5 Kilitli Safety Floor

Hiçbir modda, hiçbir konfigürasyonla bypass edilemez:

```typescript
export const SAFETY_FLOOR = Object.freeze([
  'KILL_LIVE_SPRINT',
  'MANUAL_FILE_DELETE',
  'COST_OVER_THRESHOLD',
  'DESTRUCTIVE_GIT',
  'ADR_DEPRECATE_ACCEPTED',
]);
```

Bu 5 eylem her zaman kullanıcı onayı gerektirir.

---

## Proposer (`src/nervous/proposer.ts`)

- 5 dakika `groupKey` bazlı tekrar engelleme (throttle)
- Şiddet filtresi
- `NervousNotification` nesnesi üretir

---

## Executor (`src/nervous/executor.ts`)

3 yürütme modu:

| Mod | Davranış |
|-----|---------|
| `autonomous` | Hemen uygular, kullanıcı onayı gerekmez |
| `suggest-timeout` | Timer başlatır, süre dolunca otomatik uygular; kullanıcı iptal edebilir |
| `approve` | Kullanıcı kararı bekler; Safety Floor dışındaki işlemler için 10s hard-timeout → auto-proceed |

**Safety Floor işlemleri**: approve modunda koşulsuz sonsuz bekler.

**Undo desteği**: Geri alınabilir işlemler için tersine çevirme kaydı tutulur.

---

## Dispatcher (`src/nervous/dispatcher.ts`)

3 adaptör — ortam bağlamına göre seçilir:

- **MCP**: Claude Code / VS Code entegrasyonlarında `deckent_nervous_*` araçları
- **CLI**: TTY terminalinde `deckent nervous` komutları
- **File**: `.deckent/nervous-pending.json` aracılığıyla IPC

---

## Kullanıcı Arayüzü

### CLI

```bash
deckent nervous             # Nervous System durum panosu
deckent nervous accept <id> # Bekleyen öneriyi kabul et
deckent nervous reject <id> # Bekleyen öneriyi reddet
deckent nervous edit <id>   # Öneri parametrelerini düzenle
deckent nervous history     # Geçmiş eylemler
deckent nervous log         # Ham log akışı
```

### MCP Araçları

```
deckent_nervous_subscribe   # Bildirim akışına abone ol
deckent_nervous_accept      # Bekleyen bildirimi kabul et
deckent_nervous_reject      # Bekleyen bildirimi reddet
deckent_nervous_status      # Mevcut durumu göster
deckent_nervous_config      # Detector konfigürasyonu
```

### Konfigürasyon

```json
// .deckent/config.json
{
  "nervous_system": {
    "enabled": true,
    "mode": "balanced",
    "detectors": {
      "stale_worker": { "enabled": true, "threshold_ms": 180000 },
      "directives_protection": { "enabled": true }
    }
  }
}
```

---

## Denetim İzi

`.deckent/nervous-history.jsonl` — her eylem append-only olarak kaydedilir. 30 günlük saklama süresi. Tüm accept/reject kararları, otomatik uygulamalar ve geri alımlar bu dosyada görünür.

---

## Önemli Tasarım Kararı

Nervous System **config-gated ve opt-in'dir** — proaktif Observer pipeline varsayılan olarak aktif değildir. Büyük dogfood sprintleri (deckent kendi kodunu yazarken) ADR-047 Manuel Subagent Dispatch kullanır. Nervous System, kullanıcı projelerinin izlenmesi için tasarlanmıştır.
