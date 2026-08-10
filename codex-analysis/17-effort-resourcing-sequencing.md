# 17 — Effort, Resourcing and Sequencing

## Tahmin yaklaşımı

Efor; code volume'dan çok authority migration, test recovery, platform lab ve proof closure'a göre hesaplandı. Belirsizlik yüksek olduğu için tek tarih yerine ROM range kullanıldı. `EXEC-TEMPO-001` içindeki 2.5–3 ay tahmini current 318 active row, depth 33, zero READY, platform/scale proof ve 591 failure nedeniyle düşük confidence'tır.

## Önerilen ekip topology'si

5–8 senior cross-functional engineer için:

- Lifecycle/settlement authority: 2
- Runtime/scheduler/recovery: 1–2
- Security/tenant/approval/provider: 1–2
- Terminal/Desktop/surface/application service: 1–2
- Quality/platform/release/assurance: 1–2
- Product/UX/docs owner: shared explicit authority

Aynı hotspot file'larda parallel work yapılmamalı; contracts ve test matrices paralel, authority cutover seri yürür.

## Takvim senaryoları

| Senaryo | Varsayım | Calendar ROM |
|---|---|---:|
| 3–4 senior | Düşük paralellik, platform lab sınırlı | 36–60 hafta |
| 5–8 senior | Önerilen topology, dedicated proof track | 24–40 hafta |
| 9–12 senior | Güçlü program ownership; collision kontrollü | 20–34 hafta |

Bu aralıklar full vision closure içindir; publish/autonomy gate'i bağımsız olarak daha erken veya daha geç çıkabilir. Ekip büyütmek canonical authority cutover'ı lineer hızlandırmaz.

## Parallelization ilkeleri

Paralel yapılabilir:

- Plan/evidence reconciliation domain audits
- Provider adapter matrix ve platform labs
- Surface negative-space/i18n/a11y auditleri
- Test package reduction, file collision yoksa
- Store migration tooling ve read-model adapters

Seri authority gerektirir:

- Canonical schema/ID/state decision
- Dual-write cutover ve source-of-truth switch
- Goal live executor admission
- Tenant isolation migration
- Promotion/release authority activation

## Efor yeniden-baseline gate'i

WP0 sonunda exact READY roots, file ownership, dependency depth, owner approvals, provider/platform lab capacity ve test failure clusters güncellenir. Ancak bundan sonra sprint/calendar commitment yapılmalıdır.
