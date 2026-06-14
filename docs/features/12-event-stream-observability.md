# Event Stream — ADR-035 Yapılandırılmış Olay Günlüğü

> Her sprint'te Brain, Worker ve Auditor arasında akan her olayı tek bir append-only JSONL dosyasına yazar; böylece tüm sprint geçmişi gerçek zamanlı izlenebilir ve sorgulanabilir hale gelir.

## Ne işe yarar?
- Sprint süresince üretilen tüm olayları `.deckent/sprint-NNN-events.jsonl` dosyasına sıralı olarak kaydeder.
- Kaynak/hedef (brain / worker / auditor / user), kanal kodu ve payload ile tam bağlam sağlar.
- `reconstructState()` ile faz geçişleri, görev sonuçları, kapsam çarpışmaları ve metrikler anlık olarak yeniden oluşturulabilir.
- Stale heartbeat, ADR ihlali, kapsam çarpışması gibi kritik olayları izole kanal kodlarıyla işaretler.
- Fail-safe: yazma hatası sprint'i durdurmaz; uyarı loglanır ve akış devam eder.
- Sprint 280 (PLANOBS-001): `emitProgress()` — PLAN/SPAWN/EXECUTE fazlarında yüzde-tamamlanma sinyali yayar.

## Neden önemli?
- Tüm karar izi şeffaf — bir görevi neden NO_GO aldığını event log'dan izleyebilirsiniz.
- Auditor ve Brain bağımsız kaynaklardan okur; paylaşılan bellek yok, kilit riski yok.
- ADR-035 protokolü sabit kanal kodu sözleşmesi tanımlar — log formatı sprint'ten sprint'e değişmez.
- ADR-044 (Sprint State Observability Contract): faz geçişleri `.deckent/sprint-state.json`'a da yansır; event stream ve state dosyası birlikte çalışır.

## Nasıl çalışır?
- Her olay `{ timestamp, sequence, protocol_version, source, target, channel, payload }` yapısındadır.
- Monoton artan sıra numarası `.deckent/sprint-NNN-seq` dosyasında tutulur.
- Kanal kodları (28 adet, ADR-035 V1.0): Brain↔Worker: `TASK_ASSIGN`, `HEARTBEAT`, `RESULT`, `QUESTION`, `ANSWER`, `FIX_REQUEST`, `TIMEOUT_ASSIGN`, `TIMEOUT_EXTEND`, `NEVER_DISPATCHED`, `DEPENDENCY_BLOCKED`; Worker↔Auditor: `CODE_VERIFY_REQUEST`, `VERIFICATION_RESULT`, `SCOPE_COLLISION_DETECTED`, `ADR_VIOLATION`, `GATE_COMPUTED`, `LOAD_REPORT_WRITTEN`, `ORPHAN_HB_DETECTED`, `AUTHORITY_VIOLATION`, `TIMEOUT_CAP_EXCEEDED`, `AUTH_FAILED`; Broadcast: `METRIC_EMITTED`, `SPRINT_PHASE_CHANGE`, `DEPENDENCY_RESOLVED_BY_FIX`, `SPAWN_BLOCKED`, `CONTAINER_PATH_SANITIZED`, `PROGRESS`; User: `NOTIFY`.
- `readEvents()` kaynak, hedef, kanal veya sıra numarasına göre filtreli okuma sağlar.
- `emitDependencyBlockedIfChanged()` yalnızca durum değiştiğinde yazar — log spam'i engeller (Sprint 183 W1-2 dedupe).

## Komut / Örnek

```bash
# Aktif sprint olay günlüğünü görüntüle
cat .deckent/sprint-286-events.jsonl | tail -20

# Yalnızca faz geçişi olaylarını filtrele
cat .deckent/sprint-286-events.jsonl \
  | grep '"channel":"BRAIN→*:SPRINT_PHASE_CHANGE"'

# Kapsam çarpışmalarını bul
cat .deckent/sprint-286-events.jsonl \
  | grep '"channel":"AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED"'

# Sprint durumunu olay log'undan yeniden oluştur (API)
# reconstructState(projectRoot, 'sprint-286')
```

## Durum
- Olgunluk: ✅ canlı — sprint-190+ aktif kullanım, yüksek import sayısı
- İlgili: ADR-035 (Verification Protocol Standard) · ADR-044 (Sprint State Observability) · Sprint 138
- Modül: `src/core/event-stream.ts` (634 satır) — Sprint 279'da `orchestra/` → `core/` taşındı (ADR-008); `src/orchestra/event-stream.ts` artık geriye-dönük uyumluluk için re-export shim'dir.
