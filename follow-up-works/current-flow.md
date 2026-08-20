# GEÇİCİ AKIŞ-PLANI (tmp — her satır silinmek üzere yazılır; SSOT = docs/MASTER-PLAN.md)

> Kural (Alperen 2026-08-20): burası anlık iş-alanı; ara-işler/blocker'lar bağlam
> korusun diye buraya düşer, bitince "BİTTİ" işaretlenir ya da satır silinir.

## Aktif (şimdi)
- [x] BİTTİ — Sprint-589 i18n-paketi: 4/4 DONE, 0 fix; Brain-doğrulama (tsc 0, 38/38, hardcode-grep 0); mühür codex CONFIRMED `…15b6e8a8`; landed.
- [ ] D2b-1 el-kodlama: nervous+autonomous karar-federasyonu (decision-federation origins'e ekle + settle-back: NervousIpcQueue.writeApproval / autonomous decisions.json; nervous kısa-kod üreticisi absorbe) → 3-aşama mühür → landing.

## Kuyruk (MASTER 4056 sırası)
- [ ] D2b-2: `rule` yetki-zarfı varyantı (approval-contract) + DE2-motorunun otomatik-karara terfisi (decidedBy: rule:<id>, audit).
- [ ] D3+DE3: Telegram/Slack/Teams relay CANLI wiring + VS Code decide + buton/y·n.
- [ ] D4: TTL/SLA normalizasyonu (confirmations/autonomous/pairing süresiz-pending kalmaz).
- [ ] D5: legacy karar-yüzeyi emekliliği + i18n-kalanı.

## Örgülü
- [ ] 9040: enforce-modlu dogfood-canary (UNDECIDABLE→ROUTE→confirmations uçtan-uca) · extension/grace-enforce · confirmation→debt geri-besleme.
- [ ] 3112 L1-L7 (ön-koşul: 3111 v2 runTask closure).

## Fabrika-kuyruğu (sıradaki dogfood-paket adayları)
- [ ] 7092 RECOVERY-TRUTH.
- [ ] status "blocked by dependencies" yanlış-etiketi (collision-blokajı ayrı gösterilmeli) — owner-admission alındı sayılır mı? SOR.
- [ ] 7091 cursor-docker hakem-CLI (hakem-çeşitliliği).

## Blocker/not
- (boş)
