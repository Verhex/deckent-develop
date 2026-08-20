# GEÇİCİ AKIŞ-PLANI (tmp — her satır silinmek üzere yazılır; SSOT = docs/MASTER-PLAN.md)

> Kural (Alperen 2026-08-20): burası anlık iş-alanı; ara-işler/blocker'lar bağlam
> korusun diye buraya düşer, bitince "BİTTİ" işaretlenir ya da satır silinir.

## Aktif (şimdi)
- [x] BİTTİ — Sprint-591 BÜYÜK i18n-paketi: 6/6 DONE, 0 debt, 0 fix, 29dk56sn; Brain-doğrulama (tsc 0, 181/1skip, hardcode-grep 0); sonuç-mühür codex CONFIRMED `…2ccf541`; MASTER 4056-satırına D5-GENİŞLEME bloğu yazıldı; hermetic+policy+closure gate'leri yeşil. LANDING: D2b-2a sonuç-mührüyle BİRLİKTE tek commit (messages.ts ortak).
- [x] BİTTİ — D2b-2a canlı-kanıt + sonuç-mühür: motor gerçek aprp'yi kararladı (decidedBy rule:rule-xv-probe-allow zarfı diskte, .analysis/xverify/d2b2a-result-proof.txt); canlı-kanıt İKİ bütünleşme-defekti yakalattı (ingress ön-kontrol + tüketici approval_untrusted) — ikisi de fix+pin'li; 9+1 zombi auto-approve watcher öldürüldü; sonuç-mühür codex CONFIRMED `…0baeac92`; MASTER-blok yazıldı. ŞİMDİ: 591+D2b-2a tek landing (commit+push).

## Kuyruk (MASTER 4056 sırası)
- [x] BİTTİ — D2b-2a (kod+impl-mühür `…8fc6e4417` + canlı-kanıt + sonuç-mühür `…0baeac92` + MASTER-blok).
- [ ] D2b-2a mikro-wiring: xverify-poll'e otomatik rules-apply (pending-aprp görülünce motor tetiklenir; CLI-elle değil).
- [ ] D2b-2b (GEREKİRSE): tam `kind:'rule'` union'ı approval-contract'ta — staged authorityRef-ayrımı yeterliyse İPTAL edilir, owner-karar.
- [ ] D3+DE3: Telegram/Slack/Teams relay CANLI wiring + VS Code decide + buton/y·n.
- [ ] D4: TTL/SLA normalizasyonu (confirmations/autonomous/pairing süresiz-pending kalmaz).
- [ ] D5: legacy karar-yüzeyi emekliliği + i18n-kalanı.

## Örgülü
- [ ] 9040: enforce-modlu dogfood-canary (UNDECIDABLE→ROUTE→confirmations uçtan-uca) · extension/grace-enforce · confirmation→debt geri-besleme.
- [ ] 3112 L1-L7 (ön-koşul: 3111 v2 runTask closure).

## Fabrika-kuyruğu (sıradaki dogfood-paket adayları)
- [ ] BÜYÜK-PAKET (owner-talimatı: çok-görevli, 6'lı-worker sürekli-akış) — status-sprinti bitince başlat: i18n-genişleme dalgası, dosya-ayrık 6-10 görev: src/core/cost-gate.ts · src/orchestra/prompt-gate.ts · src/core/scope-gate.ts · src/mcp/tools/autonomous.ts · src/mcp/tools/start.ts · src/api/server.ts hata-stringleri · (tarama-tabanlı ekler). Her görev kendi test-hedefiyle; messages.ts ortak (collision-serileşir).
- [ ] 7092 RECOVERY-TRUTH.
- [ ] status "blocked by dependencies" yanlış-etiketi (collision-blokajı ayrı gösterilmeli) — owner-admission alındı sayılır mı? SOR.
- [ ] 7091 cursor-docker hakem-CLI (hakem-çeşitliliği).

## Blocker/not
- (boş)
