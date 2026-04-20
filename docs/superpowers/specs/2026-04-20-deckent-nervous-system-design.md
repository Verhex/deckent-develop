# Deckent Sinir Sistemi (Nervous System) — Design Spec

**Tarih:** 2026-04-20 (Sprint 145 canlı sırasında Alperen direktifi)
**Durum:** APPROVED — Sprint 147 implementation
**Hedef:** Sprint 150 Beta GA (Per 23 Nis TRT) user-facing v1.0
**Kapsam:** C — tam (sürekli 7/24 organizatör, sprint-içi + sprint-arası)
**Yetki modeli:** Kademeli (strict / balanced / autopilot / full-auto + customize)
**Yazan:** Koordinatör, Alperen direktifleriyle
**Brainstorming diyaloğu:** 5-soru tamamlanmış, bu session'da

---

## 1. Motivasyon

### Alperen'in tanısı (2026-04-20 Sprint 145 canlı)

> "Şimdi bu kadar kritik işleri belirledik bir soru ve cevaplarla akışı neler yapılması gerektiğini sürekli sordum sen inceledin ve düzelttik veya plana ekledik. İşte deckentten istediğim şey bu süreci otomatize etmesi gerekli. Yani akışı projeye göre bilmeli. doğru soruları sorup cevapları bilmeli ona göre ilerlemi veya sonuçları doğru analiz etmeli worker-auditor-brain doğru konuşmalı hatta gerekliyse sürekli çalışan bir organizatör daha doğrus sinir sistemi inşa edelim."

### Debt Spiral Problemi

Sprint 145'in kendisi kanıt:
- Her fix → yeni bug keşfi → yeni fix → debt yığılıyor
- Özellik geliştirme bloke
- Reaktif koordinatör modeli beta GA'ya ölçeklenemez
- Sprint 145 sonuç: 24 GO_WITH_TECH_DEBT — Sprint 146-148'e yük

### Çözüm: Proaktif Meta-Layer

**Sinir Sistemi** = sürekli çalışan, proje durumunu bilen, doğru soruları soran, proaktif öneri üreten meta-orkestratör. Brain/Auditor/Worker üzerinde bir katman daha.

### Rekabet Pozisyon

- **OpenHands / CoWork / Devin:** reactive agent execution
- **Deckent:** **proactive nervous system** — agent'lar arası koordinasyon + sürekli öğrenme + zamanlama kontrolü
- **USP:** "Deckent hata olmadan önce görür, kullanıcıya söyler, onay alır, düzeltir"

---

## 2. Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────────┐
│                    NERVOUS SYSTEM                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Observer Layer                                    │  │
│  │  • Event stream subscriber (sprint-145 T-003 temel)│  │
│  │  • Filesystem watcher (.tasks/, .brain/, .deckent/)│  │
│  │  • Sprint lifecycle hooks (PLAN/SPAWN/EXECUTE/...)  │  │
│  │  • Periodic cron (10-30s tick, background)         │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Detector Registry (10+ built-in, MVP 5 active)    │  │
│  │  • StaleWorkerDetector                             │  │
│  │  • ScopeCollisionMonitor                           │  │
│  │  • DebtTrendAnalyzer                               │  │
│  │  • AgentRoutingHealth                              │  │
│  │  • DirectivesMidSprintProtection                   │  │
│  │  • ... (10 more template, Sprint 148 activate)     │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Decision Engine                                   │  │
│  │  • Detector → Action mapping                        │  │
│  │  • Authority matrix lookup (preset + overrides)    │  │
│  │  • Risk classification (low/medium/high)           │  │
│  │  • Safety floor enforcement (hardcoded)            │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Action Registry (30+ actions)                     │  │
│  │  🟢 Autonomous: 8 actions                           │  │
│  │  🟡 Suggest: 11 actions                             │  │
│  │  🔴 Approve: 11 actions                             │  │
│  │  🚨 Safety Floor (locked): 5 actions                │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Proposer                                          │  │
│  │  • Generates NervousNotification (4 severity)      │  │
│  │  • Throttle + grouping + severity filter           │  │
│  │  • Quiet hours respect                             │  │
│  │  • Cross-channel dedup                             │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Notification Dispatcher (Sprint 145 T-006 foundation)│
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐            │  │
│  │  │MCP Push │  │CLI stderr│ │File log │            │  │
│  │  │Adapter  │  │Adapter   │ │Adapter  │            │  │
│  │  └─────────┘  └─────────┘  └─────────┘            │  │
│  │  Post-beta: Desktop / Email / Webhook              │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Executor                                          │  │
│  │  • Autonomous → execute + log to history           │  │
│  │  • Suggest-timeout → timer + auto-apply on expire  │  │
│  │  • Approve → wait for user /accept or /reject      │  │
│  │  • History: .deckent/nervous-history.jsonl         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕
                    ┌─────────────┐
                    │  Brain +    │
                    │  Auditor +  │
                    │  Worker     │
                    └─────────────┘
                          ↕
                    User (MCP / CLI)
```

### Bileşen sınırları

- **Observer** → sadece event'leri toplar, karar vermez
- **Detector** → event'i yorumlar, potansiyel eylem önerir
- **Decision Engine** → politik karar (autonomous/suggest/approve)
- **Proposer** → mesaj formatı + filter
- **Dispatcher** → kanal seçimi + push
- **Executor** → onaylı eylemi uygular + log

Her bileşen tek sorumluluk, test edilebilir, bağımsız.

---

## 3. Yetki Modeli (Authority Matrix)

### 4 Preset

| Preset | Düşük Risk | Orta Risk | Yüksek Risk | Kullanıcı profili |
|---|---|---|---|---|
| **🛡 strict** | suggest-30m | approve | approve | Enterprise, yeni user |
| **⚖ balanced** (default) | autonomous | suggest-30m | approve | Tipik developer |
| **🚀 autopilot** | autonomous | autonomous | suggest-5m | Güvenilir user |
| **🤖 full-auto** | autonomous | autonomous | autonomous + safety floor\* | Hands-off CI/CD |

\* Safety floor: full-auto bile bu 5 eylemi bypass edemez (kod seviyesinde zorla):

1. `KILL_LIVE_SPRINT` — canlı sprint durdurma
2. `MANUAL_FILE_DELETE` — `rm .tasks/*` gibi manuel silme
3. `COST_OVER_THRESHOLD` — $X üstü sprint başlatma
4. `DESTRUCTIVE_GIT` — reset --hard, force push main
5. `ADR_DEPRECATE_ACCEPTED` — accepted ADR'ı deprecate

### Customize (Per-Action Override)

Kullanıcı preset üstüne eylem-bazlı override ekleyebilir:

```json
{
  "nervous_system": {
    "mode": "autopilot",
    "action_overrides": {
      "COMMIT_PUSH": "approve",
      "SPRINT_START": "suggest-30m",
      "DIRECTIVES_WRITE": "autonomous"
    }
  }
}
```

**Preset + override = final davranış.**

### CLI + MCP Config Arayüzü

```bash
$ deckent config nervous
# Interactive TUI: preset seçimi veya custom matrix

$ deckent config nervous set mode autopilot
$ deckent config nervous override COMMIT_PUSH approve
$ deckent config nervous override SPRINT_START suggest-30m
$ deckent config nervous list   # mevcut matrix göster
$ deckent config nervous reset  # preset'e dön
```

MCP:
```typescript
deckent_config_nervous({
  action: 'read' | 'set_preset' | 'set_override' | 'list_actions' | 'reset',
  preset?: 'strict' | 'balanced' | 'autopilot' | 'full-auto' | 'custom',
  overrides?: Record<string, 'autonomous' | 'suggest-30m' | 'suggest-5m' | 'approve'>
})
```

---

## 4. Eylem Registry (Action Registry)

30 eylem, 4 kategori:

### 🟢 Düşük Risk (default: autonomous) — 8 eylem

| Eylem | Açıklama |
|---|---|
| `DEAD_EVENT_STREAM_CLEANUP` | Bozuk event stream dosyası temizleme |
| `ORPHAN_TASK_ARCHIVE` | Orphan `.tasks/` dosyalarını arşivle |
| `LOG_ROTATION` | Log boyut üstü ise rotate et |
| `CACHE_INVALIDATE` | Runtime cache invalidate (örn. memory.db reload) |
| `STALE_LOCK_RELEASE` | 5dk+ stale lock'u otomatik serbest bırak |
| `IPC_DIR_CLEANUP` | Sprint 145 M7 backup katmanı |
| `DEBT_TRENDING_REPORT` | Sprint sonrası debt delta raporu yaz |
| `METRIC_EMIT` | Custom metric'i event stream'e gönder |

### 🟡 Orta Risk (default: suggest-30m) — 11 eylem

| Eylem | Açıklama |
|---|---|
| `DIRECTIVES_WRITE` | Sonraki sprint DIRECTIVES önerisi |
| `PROMPT_BUILDER_TWEAK` | Prompt god template parametre ince ayarı |
| `SKILL_ROUTING_ADJUST` | Skill atama algoritması ayarı |
| `DEBT_REPRIORITIZE` | Debt listesi önceliklendirme |
| `WORKER_RESPAWN` | Stale worker yeniden spawn |
| `SCOPE_COLLISION_REORDER` | Wave planlaması yeniden düzenle |
| `ADR_DRAFT` | Yeni ADR taslağı üret |
| `RETRO_AUGMENT` | Retrospektif ek gözlem ekle |
| `AGENT_PERFORMANCE_FLAG` | Agent'ı sorunlu olarak işaretle |
| `SPRINT_GATE_ADJUST` | Chain safety gate threshold değiştir |
| `TASK_DEPENDENCY_REWIRE` | Task dependency graph düzelt |

### 🔴 Yüksek Risk (default: approve) — 11 eylem

| Eylem | Açıklama |
|---|---|
| `SPRINT_START` | Yeni sprint başlat |
| `SPRINT_STOP` | Sprint'i durdur (kill değil, graceful) |
| `SRC_MODIFICATION` | Deckent kendi src/ değişikliği |
| `COMMIT_CREATE` | Git commit oluştur |
| `COMMIT_PUSH` | Remote'a push |
| `AGENT_DISABLE` | Agent'ı devre dışı bırak |
| `COST_THRESHOLD_RAISE` | Cost cap yükselt |
| `ADR_ACCEPT` | Yeni ADR merge |
| `PROVIDER_SWITCH` | Provider değiştir (claude→codex) |
| `CONFIG_MIGRATE` | Config schema migration |
| `NPM_PUBLISH` | npm publish tetikle |

### 🚨 Safety Floor (LOCKED, override edilemez) — 5 eylem

Yukarıdaki 4 madde + `ADR_DEPRECATE_ACCEPTED` (accepted ADR'ı deprecate).

---

## 5. Detector'lar

### MVP Active (Sprint 147 canlı) — 5 detector

#### 1. `StaleWorkerDetector`
- **Input:** heartbeat file `.tasks/task-NNN.hb`
- **Tetik:** 3dk+ update yok
- **Eylem:** `WORKER_RESPAWN` (orta risk)
- **Mesaj:** `⚠ ALERT — Worker w-NNN 3dk HB atmadı, re-spawn önereyim mi?`

#### 2. `ScopeCollisionMonitor`
- **Input:** plan-time + runtime file locks
- **Tetik:** 2 worker aynı dosyaya yazıyor
- **Eylem:** `SCOPE_COLLISION_REORDER` (orta risk)
- **Mesaj:** `⚠ ALERT — T-NNN ve T-MMM aynı dosyaya yazacak, wave yeniden düzenlensin`

#### 3. `DebtTrendAnalyzer`
- **Input:** sprint sonrası debt delta
- **Tetik:** Debt rate > %15 (son 3 sprint ortalama)
- **Eylem:** `DEBT_REPRIORITIZE` (orta risk)
- **Mesaj:** `💡 SUGGESTION — Debt trending up, Sprint N+1 P0 öneriliyor`

#### 4. `AgentRoutingHealth`
- **Input:** sprint task agent assignments
- **Tetik:** Bir agent > %40 task alırsa anomali
- **Eylem:** `AGENT_PERFORMANCE_FLAG` + `SKILL_ROUTING_ADJUST` (orta risk)
- **Mesaj:** `⚠ ALERT — test-writer 14/27 task aldı (%52), routing anomali`
- **Kanıt:** Sprint 145 canlı kanıt, bu detector'ın ilk gerçek use case'i

#### 5. `DirectivesMidSprintProtection`
- **Input:** `DIRECTIVES.md` watch + sprint phase state
- **Tetik:** Sprint EXECUTE'ta iken DIRECTIVES değişirse
- **Eylem:** Otomatik restore from task-NNN.json + alert (düşük risk — autonomous)
- **Mesaj:** `🚨 CRITICAL — DIRECTIVES mid-sprint değişti, restore edildi (from task JSON)`
- **Kanıt:** Sprint 145 08:14 TRT canlı bug, bu detector olsaydı restore otomatik olurdu

### MVP Template (Sprint 148 activate) — 5 detector

6. `DeadEventStreamDetector` — JSONL dosya yazımı durdu
7. `CostThresholdMonitor` — subs/API cost tracking
8. `PromptQualityLinter` — `.prompt-*.txt` 75/100+ hedef
9. `WorkerOutputVariance` — Sprint 138 lesson'ı otomatikleştirme
10. `SelfModifyingSprintWarner` — ADR-038 runtime wire

---

## 6. Mesaj Sistemi (Notifications)

### 4 Severity

| Severity | İkon | Görünüm | Use case |
|---|---|---|---|
| `info` | 🔵 | Sessiz satır | Status update |
| `suggestion` | 🟡 | Eylem butonlu kart | Öneri (timeout opt) |
| `alert` | 🟠 | Dikkat çeken kart | Durumsal uyarı |
| `critical` | 🔴 | Max dikkat + bypass filter | Safety floor, cost threshold |

### NervousNotification Schema

```typescript
interface NervousNotification {
  id: string;                          // "ns-145-0042"
  timestamp: string;                   // TRT ISO 8601
  severity: 'info' | 'suggestion' | 'alert' | 'critical';
  title: string;                       // Kısa başlık
  body: string;                        // Detay
  reason: string;                      // Neden bu (transparency)
  actions?: NotificationAction[];      // Quick actions
  expiresAt?: string;                  // Timeout varsa
  sourceAction: string;                // Eylem registry'deki id
  riskLevel: 'low' | 'medium' | 'high' | 'safety-floor';
  detectorId?: string;                 // Hangi detector üretti
}

interface NotificationAction {
  label: string;                       // "Kabul"
  command: string;                     // "deckent nervous accept ns-145-0042"
  key?: string;                        // CLI tek tuş: "a"
}
```

### 3 Kanal (MVP)

| Kanal | Teknoloji | Durum |
|---|---|---|
| **MCP Push** | `sendLoggingMessage` | Sprint 145 T-006 NotifyDispatcher temel |
| **CLI stderr** | ANSI escape | Sprint 145 T-013 StatusRenderer temel |
| **File log** | `.deckent/nervous-history.jsonl` | Her zaman |

**Post-beta (Sprint 151+):** Desktop notification, email, webhook (Slack/Discord).

### Bağlam Algılama (otomatik)

```typescript
function selectChannel(notification: NervousNotification): Channel[] {
  const channels: Channel[] = ['file']; // her zaman
  if (mcpClient.isConnected) channels.push('mcp');
  else if (process.env.DECKENT_NERVOUS_ACTIVE === '1') channels.push('cli');
  if (notification.severity === 'critical') channels.push(...allAvailable);
  return channels;
}
```

### Akıllı Filtre (limit YOK)

| Mekanizma | Açıklama |
|---|---|
| **Throttling** | Aynı tip 5dk içinde tekrar etmez |
| **Smart grouping** | 10dk içinde INFO'lar tek karta birleşir |
| **Severity filter** | User `severity_min` seçer (örn. `suggestion` → INFO gizli) |
| **Quiet hours** | 22:00-08:00 TRT (user config) — kritik override |
| **Cross-channel dedup** | MCP'ye gittiyse CLI'ye tekrar push yok |

**Not:** Limit konmadı — heavy user sürekli çalışabilir. Gürültü kontrolü filter ile.

---

## 7. CLI & MCP Arayüzleri

### CLI

```bash
# Dashboard
deckent nervous                        # Pending + recent + config özet

# Config
deckent config nervous                 # Interactive TUI
deckent config nervous set mode autopilot
deckent config nervous override COMMIT_PUSH approve
deckent config nervous list            # Mevcut matrix
deckent config nervous reset

# Eylem
deckent nervous accept <id>            # Öneri kabul
deckent nervous reject <id>
deckent nervous edit <id>              # Modify + accept
deckent nervous undo <action-id>       # Son N eylemi geri al
deckent nervous history                # Audit trail
deckent nervous log                    # Live tail
```

### MCP Tools (YENİ — Sprint 147)

```typescript
// Mevcut deckent_config extend edilir, veya yeni tool:
deckent_nervous_subscribe({ sprintId?: string })       // Background push subscribe
deckent_nervous_accept({ id: string })
deckent_nervous_reject({ id: string, reason?: string })
deckent_nervous_status()                               // Dashboard snapshot
deckent_nervous_config({ action, preset?, overrides? })
```

### MCP Chat Örnek

```
💡 Deckent Nervous System — Suggestion

Sprint 147 DIRECTIVES önerisi hazır (22 task).
Why: Sprint 146 prompt builder bug'ları 3 kez yakalandı + debt trending up.

Quick actions:
  /deckent nervous accept ns-146-0012
  /deckent nervous edit ns-146-0012
  /deckent nervous reject ns-146-0012

Auto-apply in: 22 dakika (autopilot mode, orta risk)
```

---

## 8. Config Schema

```json
{
  "nervous_system": {
    "enabled": true,
    "mode": "balanced",
    "action_overrides": {},
    "safety_floor": {
      "locked_actions": ["KILL_LIVE_SPRINT", "MANUAL_FILE_DELETE", "COST_OVER_THRESHOLD", "DESTRUCTIVE_GIT", "ADR_DEPRECATE_ACCEPTED"],
      "cost_threshold_usd": 100,
      "bypass_allowed": false
    },
    "notifications": {
      "channels": { "mcp": true, "cli": true, "file": true, "desktop": false },
      "throttle_ms": 300000,
      "group_info_window_ms": 600000,
      "severity_min": "info",
      "quiet_hours": "22:00-08:00 TRT",
      "cross_channel_dedup": true
    },
    "detectors": {
      "stale_worker": { "enabled": true, "threshold_ms": 180000 },
      "scope_collision": { "enabled": true },
      "debt_trend": { "enabled": true, "threshold_rate": 0.15 },
      "agent_routing": { "enabled": true, "anomaly_threshold": 0.4 },
      "directives_protection": { "enabled": true, "auto_restore": true },
      "dead_event_stream": { "enabled": false, "reserve_for": "sprint-148" },
      "cost_threshold": { "enabled": false, "reserve_for": "sprint-148" },
      "prompt_quality": { "enabled": false, "reserve_for": "sprint-148" },
      "worker_output_variance": { "enabled": false, "reserve_for": "sprint-148" },
      "self_modifying_warner": { "enabled": false, "reserve_for": "sprint-148" }
    },
    "trust_evolution": {
      "enabled": false,
      "success_window_days": 30,
      "success_rate_threshold": 0.95,
      "promote_after_window": false
    },
    "history_retention_days": 30
  }
}
```

---

## 9. Sprint 146-150 Yol Haritası

| Sprint | Gün | Tema | İçerik |
|---|---|---|---|
| **145** ✅ | Pzt 20 Nis | Adaptive Timeout + Observability + Runtime Wire + Doc Reform | 27/28 done, 24 TD → Sprint 146 yükü |
| **146** | Pzt 20 Nis 13:00+ TRT | Prompt God Template + 3 Bug Fix + Rubric Reform | 15 task (prompt builder reform + DIRECTIVES mid-sprint fix + SDL işlevsellik + agent hard-code + rubric consolidation) |
| **147** | Sal 21 Nis TRT | **Pure Nervous System Sprint** | 20-24 task (foundation + authority + detectors + CLI + MCP + config) |
| **148** | Çar 22 Nis TRT | Nervous System Dogfood + 5 Detector Activation + Cross-Platform | 18-20 task (Sprint 147'yi nervous system ile yönet + polish + macOS/Linux/WSL2 validation) |
| **149** | Çar-Per 22-23 Nis TRT | Doc Consolidation + npm Publish Dry-Run | 14-16 task (388 .md review + CHANGELOG + LICENSE + npm publish test) |
| **150** | Per 23 Nis TRT | **🚀 BETA GA CUTOVER** | npm publish + tag v1.0.0-beta.1 + public announce + `deckent nervous` user-facing v1.0 |

---

## 10. Sprint 147 Task Scope (pure nervous system)

**Hard cap: 6h · Cost cap: $110 · Task count: 22**

### Wave 1 — Foundation (4 paralel)
1. `src/core/nervous-types.ts` — NervousNotification, NotificationAction, AuthorityMatrix types
2. `src/core/action-registry.ts` — 30 eylem + risk seviyeleri
3. `src/core/authority-matrix.ts` — 4 preset + safety floor + override logic
4. `src/nervous/observer.ts` — event bus subscriber + filesystem watcher

### Wave 2 — Core Logic (4 paralel)
5. `src/nervous/decision-engine.ts` — detector → action → risk → decision
6. `src/nervous/proposer.ts` — notification üret + filter
7. `src/nervous/executor.ts` — autonomous/suggest/approve 3 mod handler
8. `src/nervous/history.ts` — `.deckent/nervous-history.jsonl` append + undo

### Wave 3 — Detectors MVP (5 paralel)
9. `src/nervous/detectors/stale-worker.ts`
10. `src/nervous/detectors/scope-collision.ts`
11. `src/nervous/detectors/debt-trend.ts`
12. `src/nervous/detectors/agent-routing.ts`
13. `src/nervous/detectors/directives-protection.ts`

### Wave 4 — UI & Config (4 paralel)
14. `src/cli/commands/nervous.ts` — `deckent nervous` TUI dashboard
15. `src/cli/commands/config-nervous.ts` — `deckent config nervous` interactive
16. `src/mcp/tools/nervous.ts` — MCP `deckent_nervous_*` 5 tool
17. `src/core/config.ts` extend — `nervous_system` schema + 3-layer merge

### Wave 5 — Dispatch & Tests (3 paralel)
18. `src/nervous/dispatcher.ts` — bağlam algılama + 3 adapter routing (Sprint 145 NotifyDispatcher extension)
19. `tests/nervous/` — 40+ test (her detector + authority + executor + dispatcher)
20. `tests/e2e/nervous-flow.test.ts` — canlı sprint simulation end-to-end

### Wave 6 — Integration (2)
21. `src/orchestra/sprint-controller.ts` hook — sprint lifecycle event emit for nervous observer
22. ADR-040 yaz — Nervous System Architecture (MADR v3)

### Chain Safety Gate (Sprint 147)
- tsc PASS
- vitest ≥ %99 pass
- doctor ≥ 90/100
- NO_GO ≤ 2
- ADR-040 accepted

---

## 11. ADR-040 Taslak (Sprint 147 task 22)

**Title:** Deckent Nervous System — Proactive Meta-Orchestrator Architecture

**Status:** proposed → accepted (Sprint 147 biterken)

**Decision:** Deckent'e Brain/Auditor/Worker üzerinde proactive meta-layer eklenir. Event-driven, detector-based, authority-matrix ile yetkilendirilmiş, 3-channel notification sistemi. Kademeli yetki (4 preset + customize) + safety floor (5 locked eylem). MVP Sprint 147, beta GA Sprint 150.

**Consequences (+):** Reactive koordinatör yükü azalır (%80→%20), debt spiral kırılır, OpenHands/CoWork'ten farklılaşma, user control hâlâ var (safety floor).

**Consequences (-):** Yeni attack surface (config bypass riski), kod kompleksitesi +~3000 LoC, learning curve user için.

**References:** Bu spec, Sprint 145 canlı kanıt (DIRECTIVES mid-sprint + agent routing + SDL audit).

---

## 12. Beta GA Başarı Kriterleri (Sprint 150)

Sinir sistemi v1.0 user-facing için:

- [ ] `deckent nervous` açılıyor, TUI dashboard çalışıyor
- [ ] `deckent config nervous` preset değişimi + custom override canlı
- [ ] Claude Code MCP chat'e suggestion kartı push geliyor
- [ ] 4 mode (strict/balanced/autopilot/full-auto) canlı
- [ ] Safety floor bypass edilemiyor (kod testli)
- [ ] 5 MVP detector aktif, Sprint 148'de canlı kanıt
- [ ] Sprint 148 kendisini nervous system ile yönetebildi (dogfood)
- [ ] `tsc PASS, vitest ≥%99.3 PASS, doctor ≥95/100`
- [ ] ADR-040 accepted
- [ ] CHANGELOG.md v1.0.0-beta.1 entry
- [ ] README'de `deckent nervous` bölümü + screenshot
- [ ] npm publish dry-run PASS

---

## 13. Gelecek Sprint 151+ (post-beta)

- Trust evolution (otomatik kademe terfisi)
- Desktop notification adapter (macOS/Linux)
- Email batched summary
- Webhook (Slack/Discord)
- ML-driven proposal learning
- Multi-project cross-talk
- Dashboard UI nervous tab
- Sesli alert (critical)
- 5 template detector activation (post-Sprint 148)

---

## 14. Risk Matrix

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| Config bypass (user kod modifiye) | Düşük | Yüksek | Safety floor kod seviyesinde, test ile korunmuş |
| Spam (detector false positive) | Orta | Orta | Throttle + severity filter + undo |
| Autonomous eylem yanlış | Düşük | Yüksek | History audit + undo command + 30 gün retention |
| MCP client disconnect | Orta | Düşük | File log fallback + reconnect handler |
| Sprint 147 6h aşımı | Düşük | Orta | Hard cap, 22 task uygun, paralel wave'ler |
| Sprint 150 beta GA gecikmesi | Düşük | Yüksek | 146-147-148-149 chain her biri ≤ hedef gün, buffer yok ama Sprint 149 doc hafif |

---

**Oluşturan:** Koordinatör (Alperen direktifleri + brainstorming diyaloğu 5/5)
**Commit hedefi:** Bu spec + Sprint 145 commit + Sprint 146 DIRECTIVES
**Sonraki adım:** `writing-plans` skill ile Sprint 147 implementation planı (sprint 146 bittikten sonra)
