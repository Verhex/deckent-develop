# Event Stream — ADR-035 Yapılandırılmış Olay Günlüğü

> Her sprint'te Brain, Worker ve Auditor arasında akan her olayı tek bir append-only JSONL dosyasına yazar; böylece tüm sprint geçmişi gerçek zamanlı izlenebilir ve sorgulanabilir hale gelir.

## Ne işe yarar?
- Sprint süresince üretilen tüm olayları `.deckent/sprint-NNN-events.jsonl` dosyasına sıralı olarak kaydeder.
- Kaynak/hedef (brain / worker / auditor / user), kanal kodu ve payload ile tam bağlam sağlar.
- `reconstructState()` ile faz geçişleri, görev sonuçları, kapsam çarpışmaları ve metrikler anlık olarak yeniden oluşturulabilir.
- Stale heartbeat, ADR ihlali, kapsam çarpışması gibi kritik olayları izole kanal kodlarıyla işaretler.
- Fail-safe: yazma hatası sprint'i durdurmaz; uyarı loglanır ve akış devam eder.

## Neden önemli?
- Tüm karar izi şeffaf — bir görevi neden NO_GO aldığını event log'dan izleyebilirsiniz.
- Auditor ve Brain bağımsız kaynaklardan okur; paylaşılan bellek yok, kilit riski yok.
- ADR-035 protokolü sabit kanal kodu sözleşmesi tanımlar — log formatı sprint'ten sprint'e değişmez.

## Nasıl çalışır?
- Her olay `{ timestamp, sequence, protocol_version, source, target, channel, payload }` yapısındadır.
- Monoton artan sıra numarası `.deckent/sprint-NNN-seq` dosyasında tutulur.
- Kanal kodları (15+, ADR-035 V1.0): `TASK_ASSIGN`, `HEARTBEAT`, `RESULT`, `QUESTION`, `ANSWER`, `CODE_VERIFY_REQUEST`, `VERIFICATION_RESULT`, `SCOPE_COLLISION_DETECTED`, `ADR_VIOLATION`, `GATE_COMPUTED`, `SPRINT_PHASE_CHANGE`, `NOTIFY`, `AUTHORITY_VIOLATION`, `DEPENDENCY_RESOLVED_BY_FIX`, `DEPENDENCY_BLOCKED`, ve daha fazlası.
- `readEvents()` kaynak, hedef, kanal veya sıra numarasına göre filtreli okuma sağlar.
- `emitDependencyBlockedIfChanged()` yalnızca durum değiştiğinde yazar — log spam'i engeller.

## Komut / Örnek

```bash
# Aktif sprint olay günlüğünü görüntüle
cat .deckent/sprint-225-events.jsonl | tail -20

# Yalnızca faz geçişi olaylarını filtrele
cat .deckent/sprint-225-events.jsonl \
  | grep '"channel":"SPRINT_PHASE_CHANGE"'

# Kapsam çarpışmalarını bul
cat .deckent/sprint-225-events.jsonl \
  | grep '"channel":"SCOPE_COLLISION_DETECTED"'

# Sprint durumunu olay log'undan yeniden oluştur (API)
# reconstructState('.deckent/sprint-225-events.jsonl')
```

## Durum
- Olgunluk: ✅ canlı — sprint-190+ aktif kullanım, yüksek import sayısı
- İlgili: ADR-035 (Verification Protocol Standard) · Sprint 138
- Modül: `src/orchestra/event-stream.ts` (553 satır)
