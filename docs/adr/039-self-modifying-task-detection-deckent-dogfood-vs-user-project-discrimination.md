# ADR-039: Self-Modifying Task Detection — Deckent Dogfood vs User Project Discrimination

**Status:** accepted

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** accepted

**Date:** 2026-04-15

**Context:**

Deckent iki farklı modda çalışır:

1. **Deckent-Dogfood modu:** Deckent kendi kaynak kodunu sprint ile değiştirir (örn. Sprint 139 Wave 5 `src/orchestra/` modülleri). Bu durumda Brain'in runtime cache'i invalidate olur, MCP server eski kodu çalıştırır ve `tsc` rebuild gerekir. Sprint 138 Layer 4 fail'in root cause'u tam olarak budur: worker `src/orchestra/sprint-finalizer.ts`'i değiştirdi ama Brain hâlâ eski pre-build cache'teki kodu çalıştırıyordu.

2. **Kullanıcı-Projesi modu:** Deckent, kullanıcının projesini (Rails app, React app, Go service vb.) orkestre eder. Kullanıcının kaynak kodu Deckent'in runtime'ını etkilemez — cache invalidation ve MCP restart gereksizdir.

Bu iki mod arasındaki ayrım hiçbir yerde formalize edilmemişti. Sonuçlar:

- Sprint 138 Task 6 (Layer 4 Wire Forensic Fix): 3-sprint üst üste runtime fail. Worker `sprint-finalizer.ts`'i değiştirdi, Brain eski kodu çalıştırdı, gate.json/load-report/metrics.jsonl üretilmedi.
- Self-modifying sprint'lerde parallel execution riskli: iki worker aynı anda `src/orchestra/` modüllerini değiştirirse tsc rebuild çakışır.
- Kullanıcı projelerinde gereksiz restart/rebuild overhead: her sprint sonunda MCP restart tetiklemek anlamsız.

**Decision:**

`src/orchestra/self-modifying-detector.ts` modülü ile runtime self-modification tespiti. Üç public fonksiyon:

### 1. `detectDeckentRepo(projectRoot: string): boolean`

Proje dizininin Deckent'in kendi repo'su olup olmadığını tespit eder. İki koşulun **ikisi birden** sağlanmalı:
- `.deckent/` dizini mevcut (gerekli ama yeterli değil — kullanıcı projeleri de bunu içerir)
- `package.json` dosyasının `name` alanı `'deckent'` (kesin ayırıcı)

### 2. `isSelfModifying(task: Pick<Task, 'scope'>, projectRoot: string): boolean`

Tek bir task'ın Deckent'in kendi kaynak kodunu değiştirip değiştirmediğini tespit eder. İki koşul:
- `detectDeckentRepo(projectRoot) === true`
- Task'ın `scope.directories` veya `scope.filesWrite` listesinde en az bir Deckent source pattern'ı bulunuyor

**Deckent Source Patterns:**
```
src/core/
src/orchestra/
src/monitor/
src/agents/
src/cli/
src/mcp/
src/providers/
src/api/
src/dashboard/
.deckent/agents/
.deckent/skills/
```

### 3. `isSelfModifyingSprint(tasks: ReadonlyArray<Pick<Task, 'scope'>>, projectRoot: string): boolean`

Sprint seviyesinde tespit: en az bir task self-modifying ise sprint self-modifying kabul edilir.

### Policy Kararları

**P1: Sequential Execution Zorunluluğu**
Self-modifying task'lar aynı wave içinde **sequential** çalıştırılmalı (parallel: false). İki worker aynı anda `src/orchestra/` modüllerini değiştirirse tsc rebuild race condition oluşur.

**P2: Wave 0 Self-Boot Gate (Gelecek Sprint)**
Self-modifying sprint tespit edildiğinde Brain otomatik Wave 0 `tsc && vitest run` gate prepend eder — mevcut codebase sağlığı doğrulanır. Bu ADR tasarımı tanımlar, runtime wiring Sprint 140+ scope.

**P3: Post-Task Auto-Checkpoint**
Self-modifying task tamamlandıktan sonra otomatik checkpoint yazılır (sprint-checkpoint.ts). MCP restart gerekiyorsa checkpoint'ten resume edilebilir.

**P4: Kullanıcı Projelerinde No-Op**
`detectDeckentRepo() === false` → tüm self-modifying kontrolleri atlanır. Zero overhead kullanıcı projeleri için.

### Integration Points

| Entegrasyon | Dosya | Açıklama | Sprint |
|-------------|-------|----------|--------|
| Detection API | `self-modifying-detector.ts` | 3 public fonksiyon | Sprint 139 (bu ADR) |
| Spawner wave sequencing | `sprint-spawner.ts` | `isSelfModifyingSprint` → sequential wave | Sprint 140+ |
| Finalizer MCP restart hook | `sprint-finalizer.ts` | Post-task rebuild + MCP restart | Sprint 140+ |
| Event stream integration | `event-stream.ts` | `BRAIN→*:SELF_MODIFY_DETECTED` channel | Sprint 140+ |

**Consequences (+):**

- Sprint 138 Layer 4 fail root cause formalize edildi — gelecekte aynı hata sınıfı önlenir
- Kullanıcı projeleri sıfır overhead — `detectDeckentRepo()` tek `readFileSync` + JSON.parse
- Self-modifying sprint'ler runtime-aware: Brain cache invalidation, sequential execution, auto-checkpoint
- Deckent-dogfood sprint'lerde `tsc` rebuild race condition riski ortadan kalkar (sequential wave)
- ADR-035 event stream'e `SELF_MODIFY_DETECTED` channel eklenebilir (Sprint 140+ extension point)

**Consequences (-):**

- `package.json` name check heuristic — fork'lar farklı name kullanabilir (edge case, kabul edilebilir)
- Deckent source pattern listesi bakım gerektirir — yeni `src/` alt dizini eklenirse güncellenmeli
- Wave 0 gate ve MCP restart wiring Sprint 140+ ertelendi — Sprint 139'da yalnızca detection API

**Alternatives Considered:**

- **Compile-time detection (tsc plugin):** TypeScript compiler plugin ile import graph analizi. Reddedildi: plugin maintenance cost yüksek, runtime'da tsc plugin API instabil.
- **Git-based detection (`git diff --name-only`):** Değişen dosyaları git'ten oku. Reddedildi: plan-time'da (sprint başlamadan) henüz değişiklik yok — scope'tan tespit etmek daha erken ve daha güvenilir.
- **Environment variable (`DECKENT_DOGFOOD=1`):** Manual flag. Reddedildi: ADR-033 "kur-çalıştır" ilkesi — otomatik tespit tercih edilir, kullanıcı konfigürasyon burden'ı minimize edilmeli.
- **Tüm sprint'leri self-modifying kabul et:** Her sprint sonrası rebuild + restart. Reddedildi: kullanıcı projeleri için gereksiz overhead, Sprint 138 audit 799 sync I/O hot path bulgusuyla çelişir.

**References:**

- Sprint 138 Task 6: Layer 4 Runtime Wire Forensic Fix — root cause (Brain pre-build cache)
- Sprint 138 Task 4: Event Stream + Plan-Time Scope Collision Detection — sequential wave pattern
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol — event stream extension point
- ADR-033: Product Vision — kur-çalıştır ilkesi (otomatik detection, manual flag değil)
- ADR-037: RBAC Authority Matrix — Brain/Worker dosya erişim sınırları
- `src/orchestra/self-modifying-detector.ts` — Sprint 139 implementasyonu
- `src/orchestra/sprint-spawner.ts` — Sprint 140+ sequential wave wiring
