# Nervous System — Proaktif Meta-Orkestratör

> Deckent'in kendi kendini izleyen, tehlike sinyali algılayan ve kullanıcıya öneri sunan proaktif koruma katmanı.

## Ne işe yarar?

- **Proaktif algılama** — Sprint sırasında stale heartbeat, scope ihlali, stale lock, kaynak tehditleri ve routing anomalilerini 15 saniyede bir otomatik tarar.
- **12 dedektör** — Her biri farklı bir tehdit türüne odaklanır; dedektörlerden biri hata verse diğerleri etkilenmez.
- **30 eylem, 4 kategori** — low/medium/high risk + 5 kilitli SAFETY_FLOOR eylemi; kategoriye göre otonom/suggest/approve politikaları uygulanır.
- **Önerme & onay kapısı** — Tehlike tespitinde öneriyi `dispatcher` aracılığıyla kullanıcıya sunar; kullanıcı CLI veya dashboard üzerinden kabul/reddeder.
- **Panic-gate protokolü** — Kritik olmayan eylemler advisory modda (anında PROCEED + görünür uyarı) çalışır; SAFETY_FLOOR eylemleri (KILL_LIVE_SPRINT vb.) asla otomatik geçmez.
- **Re-enable akışı** — `deckent nervous accept <id>` / `deckent nervous reject <id>` ile bekleyen öneriler CLI'dan yönetilir.
- **Dashboard entegrasyonu** — NervousPage'de bekleyen onay listesi, panic rozeti ve 30s canlı polling görünümü.

## Neden önemli?

- **Sprint'i korur** — Auditor'ın denetlediği sınır ihlalleri + stale lock'lar otomatik alarm üretir; Brain FIX fazına girmeden önce uyarı alırsın.
- **Kullanıcı onayı merkezi** — Tehlikeli aksiyonlar için insan-onay kapısı, ADR-040 ve ADR-037 RBAC ile uyumlu; sistem asla sessizce yıkıcı eylem yapmaz.
- **Genişletilebilir dedektör** — `detector-registry.ts` aracılığıyla yeni tehdit dedektörleri eklenebilir; mevcut pipeline değişmez.
- **Tam audit trail** — Her eylem `.deckent/nervous-history.jsonl` üzerinde append-only olarak kaydedilir, geri alınabilir (undo destekli).

## Nasıl çalışır?

### Pipeline

```
Observer → DetectorRegistry → DecisionEngine → Proposer → Dispatcher → Executor → History
```

1. **Observer** (`observer.ts`) — 4 kaynak (EventBus, Filesystem watcher, 15s cron tick, Sprint-lifecycle event'leri) üzerinden gelen sinyalleri `DetectorRegistry`'ye yönlendirir.
2. **DetectorRegistry** (`detector-registry.ts`) — 12 dedektörü sırayla çalıştırır; her biri bağımsız, biri hata verirse diğerleri devam eder.
3. **DecisionEngine** (`decision-engine.ts`) — `AuthorityMatrix`'e danışarak eylem politikasını belirler (autonomous / suggest-timeout / approve).
4. **Proposer** (`proposer.ts`) — 5 dakika groupKey dedup + severity filtresiyle `NervousNotification` oluşturur.
5. **Dispatcher** (`dispatcher.ts`) — Context'e göre (MCP / TTY) uygun adapter'ı seçer; cross-channel dedup uygular.
6. **Executor** (`executor.ts`) — Üç modda çalışır: `autonomous` (hemen), `suggest-timeout` (10s hard deadline, süre dolunca otomatik devam), `approve` (SAFETY_FLOOR için kullanıcı kararı bekler, sonsuz).
7. **History** (`history.ts`) — Her kararı `.deckent/nervous-history.jsonl`'e yazar; 30 gün saklama, undo desteği.

### 12 Dedektör

| Dedektör | Algıladığı Tehdit |
|----------|-------------------|
| `StaleWorkerDetector` | 3dk+ heartbeat yok → WORKER_RESPAWN önerisi |
| `ScopeCollisionMonitor` | PLAN/EXECUTE fazında çakışan `filesWrite` alanları |
| `DebtTrendAnalyzer` | Son 3 sprintte >%15 tech debt oranı |
| `AgentRoutingHealth` | Agent ID corruption (`string;` kalıntı) + %40 anomali eşiği |
| `DirectivesMidSprintProtection` | EXECUTE/FIX'te DIRECTIVES.md template'e dönüşünü yakalar |
| `TaskModeIdleDetector` | Task mode'da uzun süre hareketsiz kalan sprint |
| `BuildFailureRecurrenceDetector` | Tekrarlayan build hatası örüntüsü |
| `TokenSpikeDetector` | Bütçe eşiğini aşan token maliyeti ani artışı |
| `AgentRoutingAnomalyDetector` | Agent routing dengesizliği ve eşik sapmaları |
| `ScopeCollisionRateDetector` | Sprint boyunca artan scope collision oranı |
| `NotificationDeliveryHealthDetector` | Bildirim iletim sağlığı ve ölü kanal tespiti |
| `DeadEventStreamDetector` | Bozuk ya da askıda kalan event stream dosyası |

### Authority Matrix — 4 Preset

| Preset | Düşük Risk | Orta Risk | Yüksek Risk |
|--------|------------|-----------|-------------|
| `strict` | suggest-30m | approve | approve |
| `balanced` | autonomous | suggest-30m | approve |
| `autopilot` | autonomous | autonomous | suggest-5m |
| `full-auto` | autonomous | autonomous | autonomous |

> SAFETY_FLOOR eylemleri tüm preset'lerde daima `approve` gerektiriyor — config ile bypass edilemez.

### 5 Kilitli SAFETY_FLOOR Eylemi

```
KILL_LIVE_SPRINT · MANUAL_FILE_DELETE · COST_OVER_THRESHOLD · DESTRUCTIVE_GIT · ADR_DEPRECATE_ACCEPTED
```

Bu eylemler `full-auto` modda bile autonomous çalışamaz.

### Panic-Gate Protokolü (`panic-gate.ts`)

- **Advisory:** Anında PROCEED + stderr uyarısı (non-blocking).
- **Blocking-with-timeout:** 10s hard deadline; süre dolunca `TIMEOUT_AUTO_PROCEED`.
- **SAFETY_FLOOR:** Daima REJECTED — timeout bypass yok, kullanıcı çözene kadar bekler.

## Komut / Örnek

```bash
# Nervous sistem geçmişini gör
deckent nervous history

# Raw log akışı
deckent nervous log

# Öneri kabul et
deckent nervous accept <proposal-id>

# Öneri reddet
deckent nervous reject <proposal-id>

# Panic-gate onayı (sprint spawn bloğunu açar)
deckent nervous accept-panic <task-id>

# Nervous config: preset değiştir
deckent config set nervous_system.mode balanced
```

## Yapılandırma

Nervous System varsayılan olarak kapalıdır; `.deckent/config.json` üzerinden aktifleştirilir:

```json
{
  "nervous_system": {
    "enabled": true,
    "mode": "balanced"
  }
}
```

MCP araçları: `deckent_nervous_subscribe`, `deckent_nervous_accept`, `deckent_nervous_reject`, `deckent_nervous_status`, `deckent_nervous_config`.

## Durum

- Olgunluk: **detection pipeline canlı** — 12 dedektör + 30 eylem + panic-gate protokolü aktif; cross-process approval round-trip (CLI/MCP/REPL'den executor'a) bağlı.
- Config-gated opt-in: varsayılan `enabled: false` — açmak için `nervous_system.enabled: true` gerekiyor.
- İlgili: ADR-040 · ADR-037 (RBAC) · `src/nervous/` (observer, detector-registry, decision-engine, proposer, dispatcher, executor, panic-gate, authority-matrix, history + 12 dedektör modülü)
