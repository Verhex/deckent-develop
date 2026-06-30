# Nervous System — Kısa Giriş

> Deckent'in proaktif meta-orkestratörü. Brain'in göremediği sinyalleri yakalar, eylem önerir, opsiyonel olarak otonom yürütür.

---

## Bu rehber kimin için?

- Deckent'i en az bir sprint çalıştırmış kullanıcılar
- "Brain neden bunu fark etmedi?" diye soran kullanıcılar
- Üretim ortamında Deckent çalıştıran ekipler

Tam kullanıcı rehberi Sprint 181 sonrasında yayımlanacak. Bu doküman kısa bir tanıtım + ilk dakika kurulum rehberidir.

> **ADR-040 durumu:** `accepted` (Sprint 180 W3-1 ile sprint-controller wire canlı — mimari karar artık fiilen çalışan sistemle eşleşiyor).

---

## Nervous nedir?

Brain, sprint'in yaşam döngüsünü senkron yönetir: `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`. Ama sprint sırasında oluşan **asenkron sinyaller** (worker heartbeat'i durdu, event stream sessizleşti, DIRECTIVES.md mid-sprint değişti) Brain'in döngü içinde "görmediği" şeylerdir.

Nervous System bu boşluğu doldurur:

1. **Observer** — Sprint state'i, dosya sistemi event'leri ve cron tick'leri dinler
2. **Detector** — 12 farklı detector pattern'i (her biri farklı bir risk sinyali)
3. **Decision Engine** — Authority matrix + safety floor üzerinden eylem riskini değerlendirir
4. **Proposer** — `suggest-Nm` veya `approve` veya `autonomous` politikası ile eylem önerir
5. **Dispatcher** — Onaylı eylemleri Executor'a yönlendirir
6. **Executor** — Action handler'ları çağırır (WORKER_RESPAWN, ORPHAN_TASK_ARCHIVE, vb.)

Brain bu sistemi sprint başında bootstrap eder, sprint biterken `dispose()` ile temizler. Sprint scope'unda yaşar.

---

## Nasıl açılır?

Varsayılan olarak Nervous System **kapalıdır**. Açmak için `.deckent/config.json` dosyasına gidip:

```json
{
  "nervous_system": {
    "enabled": true,
    "mode": "strict",
    "notifications": {
      "channels": {
        "mcp": true,
        "cli": true,
        "file": true,
        "desktop": false
      },
      "severity_min": "critical"
    },
    "detectors": {
      "stale_worker": {
        "enabled": true,
        "threshold_ms": 180000
      },
      "scope_collision": {
        "enabled": true
      },
      "debt_trend": {
        "enabled": true,
        "threshold_rate": 0.15
      },
      "agent_routing": {
        "enabled": true,
        "anomaly_threshold": 0.40
      },
      "directives_protection": {
        "enabled": true,
        "auto_restore": true
      }
    }
  }
}
```

Bu yapılandırmada **5 detector varsayılan olarak açıktır**: `stale_worker`, `scope_collision`, `debt_trend`, `agent_routing`, `directives_protection`. Mode `strict` — `severity_min` değerini ihtiyaca göre `critical` veya `warning` olarak ayarla.

Diğer 7 detector (`dead_event_stream`, `task_mode_idle`, `build_failure_recurrence`, `token_spike`, `agent_routing_anomaly`, `scope_collision_rate`, `notification_delivery_health`) varsayılan `enabled: false`'tır. Projeye göre ihtiyaç duyulduğunda etkinleştirilebilir.

---

## Varsayılan Detector'lar (5 Aktif)

### 1. stale_worker

Aktif worker'ların heartbeat dosyalarını (`.tasks/task-<id>.hb`) izler. Threshold süresinden uzun (default 180000ms = 3dk) güncelleme olmayan worker → **medium risk** alarmı + `WORKER_RESPAWN` önerisi.

**Tetikleyici:** Sprint 179'da 5 kez tekrarlayan pattern (worker container OOM-killed, .result yazılamadı, Brain sonsuz beklemeye girdi).

**Önerilen eylem:** Stale worker spawn-backend üzerinden yeniden başlatılır. NO_GO yazıp sprint'i bloklamak yerine recovery yolu denenir.

**Konfigürasyon:**

```json
"stale_worker": {
  "enabled": true,
  "threshold_ms": 180000
}
```

`threshold_ms` projeye göre ayarlanabilir. Docker backend için 180s yeterli; uzak provider'lar (gemini, slow tier) için 300s daha güvenli olabilir.

### 2. scope_collision

Aynı dosyaya yazmak için birden fazla task'ın `filesWrite` kapsamının çakıştığını tespit eder. PLAN ve EXECUTE fazlarında çakışan görevler varsa **medium risk** alarmı + `SCOPE_COLLISION_REORDER` önerisi.

**Önerilen eylem:** Bağımlılık grafiği yeniden sıralanır ya da çakışan task'lar seri yürütülmesi için reorder edilir.

**Konfigürasyon:**

```json
"scope_collision": {
  "enabled": true
}
```

### 3. debt_trend

Son 3 sprint'teki tech-debt oranını izler. Oran `threshold_rate` (default %15) üzerindeyse **medium risk** alarmı + `DEBT_REPRIORITIZE` önerisi.

**Konfigürasyon:**

```json
"debt_trend": {
  "enabled": true,
  "threshold_rate": 0.15
}
```

### 4. agent_routing

Agent atama anomalilerini tespit eder: geçersiz agent ID (`string;` gibi TypeScript kalıntısı), tek agent'a %40 üzeri aşırı yükleme (anomaly_threshold). **Medium risk** alarmı + `AGENT_PERFORMANCE_FLAG` önerisi.

**Tetikleyici:** Sprint 146 T-146-005 `string;` corruption — assignedAgent alanına geçersiz değer yazıldı.

**Konfigürasyon:**

```json
"agent_routing": {
  "enabled": true,
  "anomaly_threshold": 0.40
}
```

### 5. directives_protection

`DIRECTIVES.md` dosyasının mid-sprint bütünlüğünü korur. Sprint başında baseline hash kaydedilir. EXECUTE veya FIX fazında dosya:

- Tamamen silinirse → `emergency` alarm
- Template'e dönüştürülürse (< 2KB veya placeholder pattern eşleşmesi) → `emergency` alarm
- Adversary tarafından üzerine yazılırsa → `auto_restore=true` ise baseline'a geri yazılır

**Tetikleyici:** Sprint 145 incident — DIRECTIVES.md sprint ortasında 463 byte'lık şablona dönüştü, EXECUTE fazı kontrolsüz devam etti.

**Konfigürasyon:**

```json
"directives_protection": {
  "enabled": true,
  "auto_restore": true
}
```

#### `auto_restore` davranışı

- `false` — sadece alarm üret, müdahale etme (Sprint 176'ya kadar default)
- `true` — alarm + otomatik baseline restore (Sprint 180 itibarıyla default)

**Sprint 180 itibarıyla `auto_restore: true` güvenlidir** çünkü:

1. Sprint 177-005 baseline-update hook canlı: `deckent set_directives` her başarılı yazımdan sonra `updateBaseline()` çağırır. Legitimate update'ler rollback'e takılmaz.
2. Sprint 179 Bug A landed: aggregate verdict + fix-aware dependency pipeline ile baseline yenilenmesi atomic'tir.
3. Sprint 176 dogfood pattern (DIRECTIVES rollback) artık imkansız: legitimate user write → hook → baseline refresh → scan no-op.

**Manuel baseline yenileme:**

```bash
deckent nervous baseline-refresh
```

CLI komutu mevcut DIRECTIVES içeriğini yeni baseline olarak işaretler — örneğin manuel düzenleme sonrası.

---

## Authority Mode Seçimi

Authority matrix, detector önerisinin **risk seviyesi** ile **politika** (autonomous / suggest-Nm / approve) eşleşmesini belirler. 4 preset mevcut:

| Mode | Düşük Risk | Orta Risk | Yüksek Risk | Kullanım |
|------|------------|-----------|-------------|----------|
| `strict` | suggest-30m | approve | approve | Enterprise, yeni kullanıcı |
| `balanced` | autonomous | suggest-30m | approve | Varsayılan dengeli |
| `autopilot` | autonomous | autonomous | suggest-5m | Güvenilir kullanıcı |
| `full-auto` | autonomous | autonomous | autonomous | CI/CD, hands-off |

**Politika anlamları:**

- `autonomous` — Eylem otomatik yürütülür, log'a yazılır
- `suggest-Nm` — Eylem önerilir, N dakika içinde reddedilmezse otomatik yürütülür
- `approve` — Açık kullanıcı onayı gerekir (CLI veya MCP üzerinden)

**Hangisini seçmeliyim?**

- **İlk açılış:** `strict`. Hiçbir şey otomatik yürütülmesin, her şey önce sana sorulsun. Sistemi tanı, davranışını gözle.
- **2-3 sprint sonra:** `balanced` (varsayılan). Düşük risk eylemler (örn. orphan task archive) artık otomatik.
- **Güvendiğinde:** `autopilot`. Yüksek risk dahil tüm orta seviyeler otomatik, sadece kritik kararlar onaya kalır.
- **CI/CD veya kiosk modu:** `full-auto`. Tüm eylemler otomatik. **Üretim ortamında dikkatli kullan** — safety floor hariç hiçbir bloke yoktur.

**Safety floor:** 5 eylem hiçbir modda autonomous yürütülemez. Bunlar config veya user override ile bypass edilemez:

- `KILL_LIVE_SPRINT`
- `MANUAL_FILE_DELETE`
- `COST_OVER_THRESHOLD`
- `DESTRUCTIVE_GIT`
- `ADR_DEPRECATE_ACCEPTED`

Bu 5 eylem her zaman `approve` politikasına düşer — kim hangi modda olursa olsun.

---

## Bildirimler

Detector bir risk yakaladığında, `notifications.channels` üzerinde aktif olanlara push eder:

```json
"notifications": {
  "channels": {
    "mcp": true,
    "cli": true,
    "file": true,
    "desktop": false
  },
  "throttle_ms": 300000,
  "severity_min": "critical"
}
```

**Kanallar:**

- `mcp` — MCP `deckent_nervous_subscribe` tool ile event stream
- `cli` — `deckent nervous` komutuyla yakın bildirim
- `file` — `.deckent/nervous-events/*.json` dosya channel (Dispatcher yazar)
- `desktop` — Sistem bildirimi (opsiyonel; Sprint 181 sonrası)

**Severity filtreleri:** `info`, `warning`, `critical`, `emergency`. `severity_min` altındaki bildirimler suppressed.

**Throttle:** Aynı `groupKey` için `throttle_ms` (default 300000ms = 5dk) süresince yalnız ilk bildirim gönderilir. Spam'ı önler.

---

## Onay Akışı

Authority mode `approve` veya `suggest-Nm` ise, Nervous System eylem önermeden önce onay bekler:

**CLI üzerinden:**

```bash
# Bekleyen onayları listele
deckent nervous

# Onayla
deckent nervous accept <action-id>

# Reddet
deckent nervous reject <action-id>
```

**MCP üzerinden:**

```typescript
deckent_nervous_subscribe()     // bildirim akışı
deckent_nervous_accept({ id })  // onay
deckent_nervous_reject({ id })  // ret
```

**Panic Guard onayı (Sprint 180 W4-2):**

`PANIC_GUARD_KILL_PENDING` özel bir onay tipidir — sprint istenmeyen şekilde kill ediliyorsa kullanıcıdan açık onay alınır. `deckent nervous accept-panic <task-id>` ile devam edilir.

**IPC queue:** Onaylar `.deckent/nervous-ipc/{pending,resolved}/*.json` dosya kuyruğu üzerinden iletilir. Executor 1 saniyede bir poll eder. Backward-compat: nervous inactive ise queue yazılmaz, mevcut stub davranış korunur.

---

## Geçmiş ve Telemetri

Tüm detector trigger'ları + eylem kararları `.deckent/nervous-history.jsonl` dosyasına append-only yazılır:

```jsonl
{"ts":"2026-05-20T16:00:00Z","detectorId":"stale-worker","severity":"medium","decision":"autonomous","actionId":"WORKER_RESPAWN","outcome":"success"}
{"ts":"2026-05-20T16:05:00Z","detectorId":"directives-protection","severity":"emergency","decision":"autonomous","actionId":"DIRECTIVES_WRITE","outcome":"restored"}
```

**Retention:** `history_retention_days` (default 30 gün) sonrası eski satırlar trim edilir.

**Sorgulama:**

```bash
# Son 24 saat
deckent nervous history --since 24h

# Belirli detector
deckent nervous history --detector stale-worker

# JSON çıktısı
deckent nervous history --json
```

---

## Sorun Giderme

### Nervous aktif olmasına rağmen hiç event üretmiyor

1. `deckent nervous` — observer running mu?
2. `.deckent/nervous-history.jsonl` mevcut mu? Boşsa hiç detector tetiklenmemiş demektir.
3. Detector threshold'ları konservatif olabilir. `stale_worker.threshold_ms` 60000'e çek, kasıtlı stale worker yarat, gözle.

### Yanlış pozitif (false positive) — aslında stale değilken alarm

1. `threshold_ms` değerini artır.
2. Detector'ı `enabled: false` yap, log'da pattern analizi sonrası kararlaştır.
3. `actionOverrides` ile eylem politikasını sıkılaştır (örn. `autonomous → suggest-30m`).

### Bildirimler gelmiyor

1. `severity_min` çok yüksek olabilir — `info`'ya çek.
2. `quiet_hours` aktif olabilir — TRT saatine bak.
3. `throttle_ms` window içinde olabilir — `cross_channel_dedup` ayarını kontrol et.

### auto_restore yanlış yere geri yazıyor

1. `deckent nervous baseline-refresh` ile mevcut DIRECTIVES'i baseline yap.
2. Hâlâ tekrarlıyorsa `auto_restore: false` yap, sadece alarm modunda kullan.
3. Issue raporla — Sprint 177-005 baseline hook'u set_directives dışında bir yoldan yazım yapıyor olabilir.

---

## Opsiyonel Detector'lar

Aşağıdaki 7 detector `enabled: false` ile gelir. Projenize göre açabilirsiniz:

| Detector ID | Açıklama |
|-------------|---------|
| `dead_event_stream` | Sprint event stream'inin uzun süre sessizleşmesini tespit eder (default threshold: 10dk) |
| `task_mode_idle` | Task-mode (tek görev) sprint'lerinde uzun boşluk kalmasını tespit eder |
| `build_failure_recurrence` | Tekrarlayan build hatası pattern'ini izler |
| `token_spike` | Ani token-maliyeti artışlarını tespit eder (cost_threshold ile birlikte kullanılır) |
| `agent_routing_anomaly` | Gelişmiş agent routing anomaly analizi |
| `scope_collision_rate` | Kümülatif scope çakışma oranını izler |
| `notification_delivery_health` | Bildirim iletim başarısını izler |

**dead_event_stream** aktifleştirmek için:

```json
"dead_event_stream": {
  "enabled": true,
  "threshold_ms": 600000
}
```

---

## Sonraki Adımlar

- Tüm 12 detector şu an kodda mevcuttur; opsiyonel olanlar config üzerinden açılabilir
- **Full tuning rehberi:** Detector-by-detector eşik ayarı, runbook senaryoları ve telemetri grafikleri için `docs/development/troubleshooting.md` ve `deckent nervous history` komutunu kullanın

---

## Referanslar

- ADR-040: Nervous System Architecture (accepted Sprint 147, realized Sprint 180)
- Design spec: `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md`
- Crisis Stabilization §6: `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md`
- Sprint 180 plan: `docs/superpowers/plans/2026-05-24-sprint-180-hybrid-beta-nervous.md`
