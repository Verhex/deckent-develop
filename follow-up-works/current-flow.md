# GEÇİCİ AKIŞ-PLANI (tmp — her satır silinmek üzere yazılır; SSOT = docs/MASTER-PLAN.md)

> Kural (Alperen 2026-08-20): burası anlık iş-alanı; ara-işler/blocker'lar bağlam
> korusun diye buraya düşer, bitince "BİTTİ" işaretlenir ya da satır silinir.

## Aktif (şimdi)
- [x] BİTTİ — Sprint-591 BÜYÜK i18n-paketi: 6/6 DONE, 0 debt, 0 fix, 29dk56sn; Brain-doğrulama (tsc 0, 181/1skip, hardcode-grep 0); sonuç-mühür codex CONFIRMED `…2ccf541`; MASTER 4056-satırına D5-GENİŞLEME bloğu yazıldı; hermetic+policy+closure gate'leri yeşil. LANDING: D2b-2a sonuç-mührüyle BİRLİKTE tek commit (messages.ts ortak).
- [x] BİTTİ — D2b-2a canlı-kanıt + sonuç-mühür: motor gerçek aprp'yi kararladı (decidedBy rule:rule-xv-probe-allow zarfı diskte, .analysis/xverify/d2b2a-result-proof.txt); canlı-kanıt İKİ bütünleşme-defekti yakalattı (ingress ön-kontrol + tüketici approval_untrusted) — ikisi de fix+pin'li; 9+1 zombi auto-approve watcher öldürüldü; sonuç-mühür codex CONFIRMED `…0baeac92`; MASTER-blok yazıldı. ŞİMDİ: 591+D2b-2a tek landing (commit+push).

## AKTİF DALGA — token-opt + cursor-xverify (owner-talimatı 2026-08-21)
- [~] 7093 closure: HAZIRLIK TAMAM — bundle scratchpad/7093-closure/bundle (unsignedManifestDigest 2c30aa3c…), claim broker'da `#F6WJC`/aprcdb-2c30aa3c… (24h). OWNER-ADIMI BEKLİYOR: `deckent approvals decide aprcdb-2c30aa3cb3e365b137a56c2e89cfcc55 --allow` (canlı TTY) → phase5-sign (repo-dışı key) → ben: append+gate+projection+MASTER-flip (Truth 1/1/1/1/1/-/-; kabul-3 moot-ratifikasyonu proposal'da).
- [x] BİTTİ — 7094 dalga-1/2/3 (592/593/594): comment-drift + F2c mekanizma+wiring (bayrak default-FALSE) + F5 profil-SSOT + T4a codex-çekirdek-kaybı fix (CANLI-KANITLI) + F4-tier + dersler 22-25. Mühürler `…6c563ddb`/`…102a8640`/`…4484940c`. MASTER-blok yazıldı. KALAN (sonraki dalga): codex prefix-mimarisi (asıl codex-tasarrufu) · F2c default-ON canary · F5 davranış-dilimi.
- [x] BİTTİ — 7091 kapanış-kıran-4'lü (592): INSTALL_CURSOR (host-build kanıtlı) · registry kök-çözüm · config-şema+verifier_model.cursor · needsSpawnBackend simetrisi. MASTER-blok yazıldı. KALAN-RESIDUAL: üretim-imaj rebuild+tag + uçtan-uca --verifier cursor smoke; limit dürüst-stub.
- [ ] LANDING (3.landing → FULL-SUITE zorunlu; koşuyor): full-vitest bitince gate'ler+hermetic → commit+push → build:all zaten alınmış (594-sonrası).
- Akış: envanter-ölçüm → DIRECTIVES çok-görevli paket → start --force-replan --force-scope → Monitor → Brain-doğrulama → mühür → MASTER → landing → build:all. Alp-Discipline her sınırda; ai-operator-lessons.md refle+güncelle.
- [x] BİTTİ — fallback-rules/ devir-prosedürü yazıldı (owner-talimatı 2026-08-21): for-codex.md (Fable→Codex tam yetki-devri, tek-okuma çalışma-mentali) + to-claude.md (geri-devir 9-bölümlük paket-şeması + doğrulama-prosedürü). KURAL: Anthropic-limit doluyor → worker'lar AĞIRLIKLI CODEX atanır; T4 (codex-çekirdek §4d defekti) bu yüzden ÖNCELİKLİ — codex worker'ları şu an disiplin-bloksuz koşuyor.

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
- FINDING (7092 RECOVERY-TRUTH canlı-vakası, 2026-08-21): `recover <id> --force` task-dosyalarını arşivlerken resume-checkpoint'i de taşıyor → status-projection PAUSED-artığı kalıyor ama `--resume` "checkpoint bulunamadı" veriyor. Sprint-595'te yaşandı (işin kendisi el-fix+worker-fix'le kapandı; yalnız settlement-projection takılı). 7092 tasarımına girdi-vakası.
