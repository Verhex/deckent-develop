# ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol Standard (Sprint 138)

**Status:** accepted

**Date:** 2026-04-14

**Sprint:** 138

---

**Context:**

Sprint 137 meta-dogfood analizi kritik bir iletişim sorununu ortaya koydu: Task 137-001 worker `status: DONE exitCode: 0` bildirdi, ancak vitest 53 fail test bıraktı. Worker "kod var" → DONE kısayolu. Bu sapmanın temel nedeni, Brain ↔ Worker ↔ Auditor arasındaki mesaj akışının formal bir protokole sahip olmamasıydı — her bileşen kendi dosya formatını üretiyordu (.hb heartbeat, .result, git diff çıktısı) ama bu mesajlar versiyonlanmış, kanonik, parse edilebilir değildi.

Sorunlar:

1. **Doğrulama eksikliği:** Worker `DONE` bildirdiğinde Auditor bağımsız doğrulama yapamıyordu. Auditor sadece `.result` dosyasının varlığını kontrol ediyor, içeriğinin doğruluğunu değil.
2. **Kanal belirsizliği:** `WORKER→BRAIN` yönünde sadece `.result` dosyası vardı; `WORKER→AUDITOR` doğrudan iletişim kanalı yoktu.
3. **Replay edilemezlik:** Sprint sonunda hangi olayların hangi sırada yaşandığını reconstruct etmek imkânsızdı. `.hb` timestamp'leri kaba granülaritede, `.result` tek snapshot.
4. **Mesaj versiyonlaması yok:** Yeni alan eklendiğinde eski consumer'lar uyumsuz hale geliyordu. Örn. Sprint 136 `rubricScores` alanı eski Brain evaluate kodunu bozdu.

Sprint 138 bu sorunu formal mesaj protokolü ile çözer. Dosya tabanlı state (`.hb`, `.result`) geriye dönük uyumluluk için Sprint 142'ye kadar devam eder, ancak event stream kanonik truth olur.

**Decision:**

Brain ↔ Worker ↔ Auditor iletişimi için versiyonlanmış mesaj protokolü (Protocol Version 1.0). Append-only event stream (`.deckent/sprint-NNN-events.jsonl`) tüm mesajları sıralı olarak kaydeder. Dosya tabanlı state paralel devam eder (fail-safe fallback), ancak event stream kanonik gerçek kabul edilir.

### Mesaj Formatı

```json
{
  "timestamp": "2026-04-14T10:00:00.000Z",
  "sequence": 42,
  "protocol_version": "1.0",
  "source": "worker | brain | auditor | deckent",
  "target": "brain | worker | auditor | user | *",
  "channel": "CHANNEL_CODE",
  "payload": {}
}
```

- `sequence`: sprint başından itibaren monoton artan tam sayı, 1'den başlar
- `protocol_version`: sabit "1.0" (Sprint 138), yeni majör değişiklikler 2.0 olacak
- `target: "*"`: broadcast mesaj (tüm consumer'lar dinler)
- `payload`: kanal koduna göre değişir, JSON object, forward-compatible (ekstra alanlar ignore edilir)

### Kanal Kodları (15 adet, Protocol Version 1.0)

**Brain ↔ Worker Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `BRAIN→WORKER:TASK_ASSIGN` | brain | worker | Task atama, scope + model + skills payload'ı |
| `WORKER→BRAIN:HEARTBEAT` | worker | brain | Periyodik canlılık sinyali (30s interval) |
| `WORKER→BRAIN:RESULT` | worker | brain | Task sonucu (selfAssessment, filesChanged, rubricScores) |
| `WORKER→BRAIN:QUESTION` | worker | brain | Checkpoint/blocker sorusu |
| `BRAIN→WORKER:ANSWER` | brain | worker | Checkpoint cevabı veya blocker çözümü |

**Worker ↔ Auditor Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | worker | auditor | Worker result'ını bağımsız doğrulama talebi |
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | auditor | brain | Doğrulama sonucu: PASS \| DOWNGRADE \| FAIL |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | auditor | brain | İki worker aynı dosyaya yazıyor, plan-time bypass |
| `AUDITOR→BRAIN:ADR_VIOLATION` | auditor | brain | Pilot ADR kural ihlali (ADR-006, ADR-008, ADR-010) |
| `AUDITOR→BRAIN:GATE_COMPUTED` | auditor | brain | Sprint gate hesaplandı (PASS \| WARNING \| FAIL) |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | auditor | brain | load-test-report.md yazıldı |

**Broadcast / Sprint Kanalları:**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `BRAIN→*:METRIC_EMITTED` | brain | * | Sprint metric noktası (coverage, duration, worker count) |
| `BRAIN→WORKER:FIX_REQUEST` | brain | worker | NO_GO sonrası fix yeniden deneği |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | brain | * | Faz geçişi (PLAN→SPAWN→EXECUTE→...) |

**User Notification (Sprint 139 Seed):**
| Kanal | Kaynak | Hedef | Açıklama |
|-------|--------|-------|----------|
| `DECKENT→USER:NOTIFY` | deckent | user | Kullanıcıya bildirim (Sprint 139 dispatcher, Sprint 138'de sadece tanımlı) |

### Backward Compatibility Roadmap

| Sprint | Durum |
|--------|-------|
| Sprint 138 | `.hb` + `.result` dosyaları **paralel devam eder**, event stream ek katman |
| Sprint 139-140 | Event stream primary, file-based secondary |
| Sprint 140+ | File-based **soft-deprecated** (consumer'lar event stream'e migrate edilir) |
| Sprint 142 | File-based **removed** (sadece event stream) |

### Fail-Safe Davranış

Event stream write başarısız olursa (disk tam, permission hata) → `console.warn` + file-based fallback. Sprint asla event stream I/O hatası nedeniyle durmamalı.

**Consequences (+):**

- Sprint sonunda tüm olaylar replay edilebilir → post-mortem analiz mümkün
- Auditor `WORKER→AUDITOR:CODE_VERIFY_REQUEST` ile aktif doğrulayıcı rolüne geçer (Sprint 137 kısayol kapatılır)
- `SCOPE_COLLISION_DETECTED` plan-time saptanabilir → manual wave barrier ihtiyacı azalır
- Protocol versiyonlaması → breaking change'ler kontrollü, consumer'lar protocol_version'ı okur
- `DECKENT→USER:NOTIFY` kanalı Sprint 139 dispatcher'a temiz extension point sağlar

**Consequences (-):**

- Her olay için disk I/O artışı — `.jsonl` append performance testi gerekebilir
- `sequence` monotonicity multi-worker concurrent write'ta race condition riski — atomik increment gerekir (file lock veya process-level counter)
- Event stream büyüyebilir — Sprint 143'te rotation/cleanup mekanizması düşünülmeli
- Sprint 142 file-based remove, legacy consumer'lar için migration burden

**Alternatives Considered:**

- **gRPC/Protobuf:** Tip güvenli, binary verimli. Reddedildi — schema compiler toolchain bağımlılığı, Node.js subprocess'lerde kurulum karmaşıklığı, Deckent "kur-çalıştır" ilkesiyle çelişiyor (ADR-010).
- **WebSocket:** Gerçek zamanlı, bidirektional. Reddedildi — Docker backend'de port mapping karmaşıklığı, Worker container'ların WebSocket server'a erişimi garanti değil, HTTP API zaten var.
- **Redis Pub/Sub:** Yüksek throughput, kanıtlı. Reddedildi — ADR-010 tek runtime dependency ilkesi ihlali, ADR-033 "kur-çalıştır" product vizyonuyla çelişiyor, Redis kurulu olmayan makinelerde sıfır fallback.
- **SQLite:** ACID garantili, structured query. Reddedildi — dosya tabanlı append'den daha karmaşık, basit olmak Deckent kimliğinin temelidir, WAL mode multi-writer complexity ekler.
- **Mevcut dosya tabanlı devam:** Değişiklik yok, `.hb` + `.result` yeterli. Reddedildi — Sprint 137 meta-dogfood canlı kanıtı: file-based state functional doğrulama yapmıyor, replay imkânsız.

**References:**

- Sprint 137 Task 137-001 retrospektif — worker DONE kısayolu canlı kanıtı
- Sprint 138 design spec: `docs/superpowers/specs/2026-04-14-sprint-138-architectural-pivot-design.md` Section 6
- Sprint 138 plan: `docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md`
- ADR-008: Brain Merkezi Import — mesaj akışı sınır disiplini
- ADR-010: Minimal Dependencies — Redis/SQLite reddetme gerekçesi
- ADR-033: Product Vision — WebSocket/Redis reddetme gerekçesi (kur-çalıştır)
- `src/orchestra/event-stream.ts` — Sprint 138 Task 4 implementasyonu
- `src/monitor/auditor.ts` — Sprint 138 Task 3 Auditor Authority Extension
- `.deckent/sprint-138-events.jsonl` — canlı runtime event log

> **Note (verified vs code, Sprint 172):** `src/orchestra/event-stream.ts` exists and implements the versioned protocol + channel codes ✓. **However, the "Backward Compatibility Roadmap" did not materialize:** the table projects file-based state soft-deprecated by Sprint 140 and **removed by Sprint 142** — but at Sprint 172 the file-based `.hb`/`.result` mechanism is still the **live primary** path (`src/orchestra/result-collector.ts`, `src/agents/worker.ts`; the ADR-047 manual-dispatch flow reads `.tasks/task-*.result`). The event stream is an **additive layer**, not the sole canonical truth in practice. "Event stream = canonical truth / file-based removed by 142" is design intent, not the current runtime state (consistent with the ADR-037 V1.0 advisory framing in `docs/architecture/authority-matrix.md`). Behavior unchanged; documentation alignment only.

---

**Amendment — 2026-06-11 (ADR-review, full code-verification):**

1. **Module location:** the canonical implementation moved `src/orchestra/event-stream.ts` → **`src/core/event-stream.ts`** (Sprint 279 WK-import, ADR-008 core→orchestra cycle fix); `src/orchestra/event-stream.ts` is now a ~1KB re-export shim. References/Note paths above predate the move.
2. **Channel codes 15 → 28 (additive, protocol still 1.0):** all original 15 V1.0 channels remain **verbatim**; 13 were added since (ORPHAN_HB_DETECTED, AUTHORITY_VIOLATION, TIMEOUT_ASSIGN/WARNING/CAP_EXCEEDED/EXTEND, NEVER_DISPATCHED, SPAWN_BLOCKED, DEPENDENCY_BLOCKED, DEPENDENCY_RESOLVED_BY_FIX, AUTH_FAILED, CONTAINER_PATH_SANITIZED, PROGRESS — Sprint 280). Additive channels are forward-compatible per this ADR's own design, so `protocol_version` stays `'1.0'`. ⚠️ Naming-convention deviation: `PROGRESS` is a bare code (not `SOURCE→TARGET:NAME` like every other channel) — future channels should follow the convention.
3. **Message envelope gained optional lineage fields** `correlationId`/`causationId` (additive — consumers ignoring them stay compatible).
4. **Re-verified (body-read):** fail-safe (`writeEvent` try/catch → `console.warn` + `null`, never crashes the sprint) ✓; `nextSequence()` monotonic counter ✓; Sprint-172 Note's "file-based still live primary" finding **still true today** (Sprint 280 confirmed: result-collector reads `.tasks/*.result`).

md+db senkron (Alperen ADR-review).

---
