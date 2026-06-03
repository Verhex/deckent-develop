# Mimari — Brain / Worker / Auditor

> Tek yönlü bağımlılık, kural-bazlı otorite ayrımı ve sıkı scope sınırları ile çalışan üçlü mimari.

## Ne işe yarar?

- **Brain** — tek orkestratör: DIRECTIVES okur, task planlar, Worker spawn eder, sonuçları değerlendirir.
- **Worker** — scope-sınırlı yürütücü: yalnızca kendine atanan `filesWrite` listesine yazar.
- **Auditor** — denetçi: kaynak kod YAZAMAZ; heartbeat/boundary/lock izler, Brain'e raporlar.
- **Tek yönlü bağımlılık (ADR-008)** — Brain → Worker/Auditor; Worker/Auditor hiçbir zaman Brain import etmez.
- **Scope enforcement** — Worker `scope.filesWrite` dışına çıkarsa Auditor git diff ile yakalar ve `file_outside_scope` kaydeder.

## Neden önemli?

- **Mimari güvenlik** — Circular import yasaklıdır; Brain tek koordinasyon noktası olduğu için race condition ve çakışma riski minimize edilir.
- **Sorumluluk ayrımı** — Auditor kaynak kodu değiştiremediği için denetim bağımsızlığı garanti altındadır.
- **Ölçeklenebilirlik** — N Worker paralel çalışabilir; Brain merkezi koordinasyonu bırakmaz ancak kendi kendini bloke etmez.

## Nasıl çalışır?

```
DIRECTIVES.md
      │
      ▼
  ┌──────┐   plan + spawn   ┌──────────┐
  │ Brain│ ──────────────→  │ Workers  │
  │      │ ←─────────────── │ (N adet) │
  └──────┘   .result files  └──────────┘
      ▲
      │ alert / scan
  ┌──────────┐
  │  Auditor │   (30s döngü, kaynak kod yazmaz)
  └──────────┘
```

- Brain `sprint-controller.ts` üzerinden tüm fazları yönetir (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP).
- Worker `.tasks/task-NNN.json`'ı diskten okur; Brain import etmez.
- Auditor `.dashboard` dosyasını her taramada üzerine yazar; asla append yapmaz.
- ADR-008 ihlali tespit edilirse → Brain yeni task spawn ETMEZ; ihlal kaydı `memory.db`'ye yazılır.

## Komut / Örnek

```bash
# Brain'in hangi fazda olduğunu görüntüle
deckent status

# Örnek çıktı:
# Sprint: sprint-225 | Phase: EXECUTE
# Workers: 3 active | Tasks: 7/10 done
# Auditor: last scan 12s ago — 0 alerts

# Auditor'ın son taramasını logda izle
deckent status --json | jq '.auditorAlerts'
```

## Durum

- Olgunluk: ✅ canlı (ADR-008 accepted — Sprint 1'den beri aktif; 190+ sprint dogfood)
- Auditor RBAC V1.0: ✅ advisory (ADR-037 — runtime soft-enforce; hard-flip V2 post-GA planında)
- İlgili: ADR-008 · ADR-037 · `src/orchestra/sprint-controller.ts` · `src/monitor/auditor.ts`
