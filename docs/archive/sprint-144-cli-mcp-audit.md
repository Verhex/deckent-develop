# Sprint 144 CLI+MCP Katmanı Audit Raporu

**Tarih:** 2026-04-17 (Sprint 144 canlı sırasında, subagent-driven parallel audit)
**Kapsam:** 3 paralel `general-purpose` subagent — CLI audit + MCP audit + canlı bug avı
**Süre:** ~2.5 dk (paralel dispatch)
**Triangülasyon:** `resume.ts` bulgusu 2 ajan tarafından bağımsız teyit edildi

---

## Özet İstatistikler

| Metrik | Değer |
|---|---|
| CLI komut dosyası | 48 (40 komut + 8 helper) |
| CLI çalışan (--help smoke) | 38 OK |
| CLI unwired | 1 (`resume.ts`) |
| MCP tool (DECKENT.md ↔ kod) | 22/22 tam eşleşme |
| MCP schema drift | 1 (help.ts TOOLS vs tool annotation) |
| **P0 runtime wire fail** | **5 adet** |
| P1 ölü kod modül | 9+ |
| P1 config drift key | 7 |

---

## 🔴 P0 — Kritik Runtime Wire Fail'ler (Sprint 145 Zorunlu)

| # | Bulgu | Kaynak | Etkilenen |
|---|---|---|---|
| 1 | `checkWorkerAuthority()` hiç çağrılmıyor | `src/agents/worker.ts:379` | Sprint 139 T-035 ADR-037 RBAC runtime-dead |
| 2 | `isSelfModifying*()` dedektör flag her zaman `false` | `src/orchestra/self-modifying-detector.ts` | Sprint 139 T-051/052 ADR-038 runtime-dead |
| 3 | `NotifyDispatcher` instantiate edilmiyor, `addAdapter` yok | `src/core/notification-dispatcher.ts`, `src/mcp/server.ts:95` | Sprint 139 T-41 DECKENT→USER:NOTIFY ölü |
| 4 | `CHANNELS.NOTIFY` `writeEvent` ile emit edilmiyor | `src/orchestra/event-stream.ts:73` | ADR-035 NOTIFY kanalı ölü |
| 5 | `registerResume` import+call yok | `src/cli/index.ts`, `src/cli/commands/resume.ts:22` | Sprint 138 T-9 Long-Running Resume ölü |

**Pattern:** 5 sprint boyunca tekrar eden lesson — "helper/export yazıldı, test geçti, **ama wire eksik**." Sprint 145 için tek büyük task adayı: **"Runtime Wire Audit + Fix Sprint"**.

---

## 🟡 P1 — Temizlik + Parity

### Ölü kod (Sprint 144 T-7/T-8 listesi dışındakiler)
- `src/orchestra/sprint-estimator.ts`
- `src/orchestra/result-merger.ts`
- `src/orchestra/shared-memory.ts`
- `src/orchestra/task-retry.ts` (MAX_RETRY_COUNT/shouldRetry/createRetryTask)
- `src/orchestra/pattern-reader.ts`
- `src/orchestra/pattern-recorder.ts`
- `src/orchestra/adaptive-agent.ts` (AdaptiveAgent class)
- `src/orchestra/conflict-resolver.ts` `ConflictResolver` class (sadece top-level function import ediliyor)

→ **Sprint 145 için "Ölü Kod Wave C"** task adayı.

### Config Key Drift (validate ediliyor ama runtime 0 okuma)
- `notify_on_complete`, `notify_channel`, `notify_url` (P0 Finding #3 ile bağlı)
- `rollback_policy`
- `search_enabled`, `search_provider`, `search_cache_ttl`
- `ai_planner_timeout`
- `detected_env`, `multi_ide_mode` (sadece init-steps yazıyor, runtime kimse okumuyor)

### ADR-022-v2 CLI/MCP Parity İhlalleri
1. **`--root` flag eksik:** MCP'de 22 tool'un hepsinde `root` parametresi var, CLI'da hiçbir komutta yok. Tüm komutlar `process.cwd()` varsayıyor.
2. **18 MCP eksik komut** (ayrı raporda: `.brain/exports/cli-mcp-parity-gap.md`).

### MCP Schema / Kaynak Tekilleştirme
1. **help.ts TOOLS drift P1:** `deckent_plan` description + `readOnly` alanı gerçek tool annotation ile zıt. help.ts TOOLS[2] Sprint 136 sonrası plan preview-only davranışına güncellenmemiş.
2. **4 kaynak description drift:** DECKENT.md tablosu + server.ts `DECKENT_MCP_INSTRUCTIONS` + help.ts TOOLS dizisi + tool dosyası — manuel senkron edilmek zorunda.
3. **outputSchema / structuredContent eksikliği:** 22/22 tool MCP SDK output schema kullanmıyor; istemci ham JSON string parse etmek zorunda.

---

## 🟢 P2 — Kozmetik

- `src/orchestra/authority-enforcer.ts:415` hardcoded string yerine `CHANNELS.AUTHORITY_VIOLATION` sabiti.
- `openWorldHint` annotation 22/22 tool'da eksik (özellikle `deckent_sync`, `deckent_run`, `deckent_start` için uygun).
- `deckent_start` / `deckent_run` `destructiveHint: true` tartışması (canlı sprint'e çakışıp veri üretme durumu).
- `src/mcp/tools/review.ts:85` sprint ID drift riski (`Math.max(1, num - 1)` yerine canlı state'ten oku).

---

## Sprint 145 Öncelik Sıralaması

### Sprint 145 Zorunlu (P0, 5 task)
1. **Runtime Wire Audit + Fix** — 4 dead wire (checkWorkerAuthority, self-modifying-detector, NotifyDispatcher, CHANNELS.NOTIFY)
2. **`registerResume` wire** (2 satır fix)
3. **CLI registration test harness** (vitest e2e, her PR'da otomatik wire regression yakala)

### Sprint 145 İsteğe Bağlı (P1)
4. **Ölü Kod Wave C** — 8+ orchestra helper silme
5. **Config key audit** — 7 key ya wire et ya sil
6. **CLI `--root` parity** — 37 komuta ortak flag
7. **MCP description tekilleştirme** — tek kaynak (tool dosyası), diğerleri runtime türet
8. **MCP outputSchema migration** — 22 tool structuredContent

### Sprint 146+ Bekleyebilir (P2)
9. `authority-enforcer` CHANNELS sabiti
10. `openWorldHint` / `destructiveHint` annotation audit
11. `review.ts` sprint ID drift

---

## Canlı Sprint 144 Etkileşimi

Subagent'lar sprint 144 canlı çalışırken **sadece okuma** yaptı. Worker'ların Docker scope'unda değildi. Sprint 144 worker'ları `src/cli/commands/` altında yeni dosyalar oluşturuyor (init/doctor/retro/worker split), subagent'lar **mevcut dosyaları** okudu. Race condition yok.

**Worker'lar Sprint 144 boyunca bu audit bulgularını görmez** (scope dışı) — bulgular Sprint 145 DIRECTIVES için kayıt altında.

---

## Oluşturan
3 paralel `general-purpose` subagent:
- CLI audit (aef72f3125e93f531) — 146s, 62 tool use, 73K token
- MCP audit (ac3b6d7cd5f7c1ff3) — 143s, 32 tool use, 90K token
- Bug hunt (a0c5dcf121628d87d) — 272s, 82 tool use, 114K token
**Koordinatör konsolidasyon:** 2026-04-17 ~12:53 UTC

---

## 🔴 YENİ P0 BULGU — Worker Timeout Policy (Sprint 144 Canlı Kanıt, 2026-04-17 13:02 UTC)

### Tespit
- **Bulgu:** `src/orchestra/spawn-backend-docker.ts:20` + `src/orchestra/tmux.ts:71` → `DEFAULT_TIMEOUT_SECONDS = 1200` (20dk) sabit. `Effort: low | normal | high` DIRECTIVES'te var ama worker.sh'a **yansımıyor** — tüm task'lar aynı hard cap alıyor.
- **Sprint 144 kanlı kanıt:** T-144-001 (init 1566 LoC, high effort) + T-144-004 (worker 1669 LoC, high effort) = **iki NO_GO, iş yapılmış ama result yazılamadan SIGKILL**. Pattern %66 high-effort fail rate.

### Etki
God Object split, big refactor, büyük test dağıtımı gibi "high effort" task'lar 20dk'da bitmiyor → worker.sh `timeout 1200 claude` SIGKILL → EXIT trap `{"selfAssessment":"NO_GO"}` yazıyor → Brain false NO_GO alıyor (Spurious NO_GO Reconciliation helper runtime-dead olduğu için düzelmiyor).

### Sprint 145 Zorunlu Fix

**P0 #10 — Per-Task Timeout Scaling**

```typescript
// src/core/constants.ts (yeni)
export const TIMEOUT_BY_EFFORT: Record<Effort, number> = {
  low: 600,       // 10dk — basit bug fix, dokümantasyon
  normal: 1200,   // 20dk — mevcut default, orta kapsamlı
  high: 2400,     // 40dk — God Object split, derin refactor
};

// src/orchestra/spawn-backend-docker.ts
const timeoutSeconds = TIMEOUT_BY_EFFORT[task.effort] ?? DEFAULT_TIMEOUT_SECONDS;
// worker.sh template: `timeout ${timeoutSeconds} claude -p - ...`

// Aynı değişiklik: src/orchestra/tmux.ts WORKER_TIMEOUT_SECONDS
```

**P0 #11 — Result Atomicity Guarantee (git diff tabanlı partial result)**

Worker SIGKILL sırasında:
1. EXIT trap git diff ile değişen dosyaları saptasın
2. Boş NO_GO yerine `{"selfAssessment":"TIMEOUT_WITH_WORK","filesChanged":[...git diff],"notes":"Worker timeout but files changed, Brain should reconcile"}` yazsın
3. Brain mid-sprint-adapter bu durumu görünce Spurious NO_GO Reconciliation helper tetiklesin (helper'ın runtime-dead bug fix'i ayrı P0)

### Sprint 144 Etkilenen Task'lar
- T-144-001 — init.ts split, **gerçekte %80 tamam** (1566→282 LoC, 3 yeni modül, test split eksik)
- T-144-004 — worker.ts split, **gerçekte %90 tamam** (1669→434 LoC, 4 yeni modül, 2 yeni test dosyası)

**Koordinatör kararı:** Sprint 144 bitene kadar bekle, retro'da spurious NO_GO pattern'i belgele. Sprint 145 start öncesi **manual reconcile** (Seçenek C) — iki task'ın result dosyasını `selfAssessment: GO_WITH_TECH_DEBT` olarak yeniden değerlendir (test split eksikliği tech debt olarak).

### Alperen Tespit Kredisi
Bu bulgu Alperen'in hipotezi: *"timeout 1200 verilmesi olabilir mi? zor görevlerde worker.sh dosylarında katı timeout politikası güdüyoruz."* — koordinatör canlı doğrulama ile kanıtladı (2026-04-17 13:05 UTC).
