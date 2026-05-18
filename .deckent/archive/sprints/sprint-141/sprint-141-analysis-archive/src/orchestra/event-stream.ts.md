# Analysis: src/orchestra/event-stream.ts
**Task ID:** 141-002 | **LoC:** 311

## 1. Amaci
Brain ↔ Worker ↔ Auditor iletişimi için append-only JSONL olay akışı. ADR-035 Protocol V1.0. Her olayı `.deckent/sprint-NNN-events.jsonl` dosyasına yazar; monoton sıra numarasıyla.

## 2. Public API (export listesi)
- `DeckentEvent` interface — olay yapısı (timestamp, sequence, protocol_version, source, target, channel, payload)
- `EventFilter` interface — olay filtreleme kriterleri
- `ReconstructedState` interface — olay akışından sprint durumu yeniden yapılandırma
- `CHANNELS` const — tüm kanal kodları (TASK_ASSIGN, HEARTBEAT, RESULT, GATE_COMPUTED, vs.)
- `ChannelCode` type
- `readSequence(projectRoot, sprintId)` — sıra numarasını okur
- `getCurrentSprintId(projectRoot)` — sprint-state.json'dan sprint ID
- `writeEvent(projectRoot, sprintId, source, target, channel, payload)` — olay yazar
- `readEvents(projectRoot, sprintId, filter?)` — filtrelenmiş olayları okur
- `reconstructState(projectRoot, sprintId)` — sprint durumunu yeniden yapılandırır

## 3. Ic + Dis Bagimliliklar
- **Dış:** ../core/constants.js (DECKENT_DIR), ../core/utils.js (debugLog)
- **Node:** node:fs (appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync)

## 4. Complexity
7 export fonksiyon. `reconstructState`: switch/case, cyclomatic ~8. `writeEvent`: path yardımcı çağrıları + appendFileSync, cyclomatic ~3. `readEvents`: parse loop + filtreler, cyclomatic ~10. Toplam: ~25.

## 5. Type Safety
- `event.payload as { phase?: string }` gibi cast'lar `reconstructState`'te mevcut — unsafe ama JSONL yapısı tip bilgisi olmadığından zorunlu.
- `const state = JSON.parse(raw) as { sprintId?: string }` — güvenli optional chaining ile kullanılmış.
- `JSON.parse(line) as DeckentEvent` — type assertion, partial validation yok.

## 6. ADR Compliance
- **ADR-035 (Event Stream Protocol V1.0):** FULLY COMPLIANT — `DeckentEvent` yapısı ADR-035 spec'e uygun. Channel kodları CHANNELS const'da tanımlanmış.
- **ADR-037 (RBAC):** COMPLIANT — CHANNELS içinde `AUTHORITY_VIOLATION` kanalı var. `emitAuthorityViolation` authority-enforcer.ts'de tanımlanmış.
- **ADR-006 (spawnSync):** N/A — spawnSync yok.
- **ADR-005 (Sync I/O):** `appendFileSync`, `readFileSync`, `writeFileSync` kullanılıyor. Performance-kritik yolda değil ama async migration potansiyeli var.

## 7. Test Coverage
- `tests/e2e/event-stream-runtime.test.ts` mevcut (Sprint 139 Task 44).
- `tests/orchestra/event-stream.test.ts` beklenir.

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
`reconstructState` `case CHANNELS.SPRINT_PHASE_CHANGE` bloğunda `payload.phase` okunuyor ama `fromPhase`/`toPhase` kullanılıyor; payload yapısı tutarsız. `reconstructState` fonksiyonu kullanım alanı sınırlı olabilir.

## 10. Security Findings
- Append-only JSONL: bir actor kötü amaçlı JSON enjekte edebilir — `JSON.parse` güvenliği risk altında değil (satır bazlı).
- `nextSequence` file sistemi yarış koşulu potansiyeli: concurrent write durumunda sıra numarası çakışabilir.

## 11. Memory V2 Uyumu
Event stream Memory V2 ile doğrudan ilişkisi yok — mesajlaşma katmanı. Olaylar dosya sisteminde; DB'de değil.

## 12. Oneriler
- `reconstructState` payload tip güvenliğini artırmak için ADR-035 payload şemaları tanımlanabilir.
- `nextSequence` için atomic file lock veya CAS mekanizması değerlendirilebilir.
- `JSON.parse(line) as DeckentEvent` için minimal runtime validation (zod veya basit tip guard) eklenebilir.
- `SPRINT_PHASE_CHANGE` payload parse tutarsızlığı: hem `p.phase` hem de `fromPhase`/`toPhase` kullanılıyor.

## 13. Verdict: ANALYZED
