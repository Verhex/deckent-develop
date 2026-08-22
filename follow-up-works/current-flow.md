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
- [x] BİTTİ — LANDING `03411827e` → origin/main: dalga-1/2/3/4 + borç-ödeme + fallback-rules + closure-hazırlık. FULL-SUITE TAM-YEŞİL (2617 dosya / 37229 test / 0 failed, exit-0 kanıtlı); tüm gate'ler yeşil; build:all alındı, bot fix'li dist'te.
- Akış: envanter-ölçüm → DIRECTIVES çok-görevli paket → start --force-replan --force-scope → Monitor → Brain-doğrulama → mühür → MASTER → landing → build:all. Alp-Discipline her sınırda; ai-operator-lessons.md refle+güncelle.
- [x] BİTTİ — fallback-rules konsolidasyonu (Codex-tasarımı `authority-handoff.md`; for-codex/to-claude emekli) LANDED `67265a8df` + cross-provider mühür Fable-hattından alındı: codex CONFIRMED `cross-verify-verdict:sha256:db72fa1e254a2ee3ca6f09d96c8ebf231e55fb6386ab97be943db80b04bf9878`. RELATED_BUT_NONBLOCKING: ters yön Codex→Fable xverify canonical evidence producer'da `source_bundle_unavailable` HOLD (`xv-1787294109062-a726d100-62c5-4de6-a6fa-5d51de0d5733`); same-provider/doğrudan-CLI fallback yapılmadı. 7093 TERMINAL-DONE landed (`b898b9c61`+`67265a8df`; GR-2026-08-21-CLOSURE-BATCH-03).

## AKTİF — codex prefix-mimarisi (7094 kalan büyük faz)
- [x] Envanter TAMAM (agent-ölçümlü): baseline 43.169B; kollar −%68 kombine; %80 cache-hit zaten var — hedef hit-oranını KORUYARAK prefix küçültmek; R1 AGENTS.md authority-inversion; R4 aşırı-daraltma cache'i öldürür (F2a emsali); codex sürüm-pinsiz (R5e).
- [x] Ö1 DENEYİ SONUÇ: model_instructions_file AUGMENT-sınıfı — shell-tool korunuyor (probe-ok exit-0) + marker uygulanıyor (ACK) → KANAL=model_instructions_file. (in 23.995/cached 16.896 kanıt-koşusu scratchpad/o1-exp/out.jsonl)
- [x] BİTTİ — prefix-mimarisi UÇTAN-UCA: tasarım-mühür `…f57ada` → 596 (2/2) → 597 (4/4) → T8 canary 598 (DONE; argv+prompt+usage kanıtlı; A/B toplam-input −%47 tek-örnek) → birleşik sonuç-mühür `…3367a7b9`. MASTER-blok yazıldı. Bayraklar canary-açık; default-ON kararı OWNER'A (ek ölçümle).
- [x] BİTTİ — handoff-tooling: scripts/authority-handoff.mjs (create-only receipt-zinciri, transition-tablosu, tamper-tespiti, recovery owner-ref şartı; gerçek-CLI hermetik 3/3) + policyDigest=lint --digest; doc-pointer eklendi; mühür birleşik `…3367a7b9` içinde. %99-devri TEK KOMUT: prepare → Codex verify → commit.
- OWNER-DİREKTİFİ (geçici, 2026-08-21): Anthropic-limit %95 → FULL-SUITE ASKIDA; landing-doğrulaması = scoped-testler + gate'ler. %99'da authority-handoff.md protokolüyle EXECUTION_AUTHORITY geçici Codex'e (PREPARED'ı Fable üretir, tooling'le).

## Kuyruk (MASTER 4056 sırası)
- [x] BİTTİ — D2b-2a (kod+impl-mühür `…8fc6e4417` + canlı-kanıt + sonuç-mühür `…0baeac92` + MASTER-blok).
- [ ] D2b-2a mikro-wiring: xverify-poll'e otomatik rules-apply (pending-aprp görülünce motor tetiklenir; CLI-elle değil).
- [ ] D2b-2b (GEREKİRSE): tam `kind:'rule'` union'ı approval-contract'ta — staged authorityRef-ayrımı yeterliyse İPTAL edilir, owner-karar.
- [x] BİTTİ — D3+DE3 (5 dalga 599-603 + canlı-defekt fix'leri): GERÇEK-CİHAZ kanıtı disk-zarfında (decidedBy channel:telegram:7374744018); sonuç-mühür `…b1d04afc`; MASTER-blok yazıldı. Residual (dürüst): Slack/Teams app-provizyonu owner-işi; OTP tam-kimlik ayrı-dilim; riskTier-zarf D4.
- [x] D4 UYGULAMA + LOCAL_VERIFIED: confirmation/autonomous/pairing/broker-native config-resolved TTL+SLA, typed timeout settle-back, no-replay/no-grant, riskTier authority ve read-only MCP parity kapandi; 65 dosya 298/298, tsc 0, 10k 290.3ms, build+dist CLI/API+bot restart kanitli. Formal Opus xverify provider-tier admission'da typed HOLD; seal sayilmadi, toplu owner-verification'a ertelendi. Ayrinti: `docs/evidence/APPROVAL-SURFACE-UNIFICATION-001-evidence-archive-2026-08-21.md` §D4.
- [ ] D5: legacy karar-yüzeyi emekliliği + i18n-kalanı.

## Örgülü
- [x] 9040 ENFORCE-CANARY LOCAL_VERIFIED: UNDECIDABLE→ROUTE→confirmation→tenant-CAS debt→PREPARED/APPLIED zinciri; human broker-MAC + LLM typed-host receipt restart authority; serve/API production reconciler; AST authority ratchet; 33 dosya/226 acceptance testi + 17 dosya/305 komşu regression + tsc/build/real-binary smoke yeşil; 10k 4.786s/replay 2.403s. Dogfood sprint-619 dört logical task DONE olmasına rağmen stale finalizer gate nedeniyle dürüst `ABORTED`; formal cross-provider seal Opus capability-floor nedeniyle typed HOLD. Ayrıntı: `docs/evidence/EVALUATION-001-9040-enforce-canary-evidence-2026-08-22.md`.
- [ ] 3112 L1-L7 (ön-koşul: 3111 v2 runTask closure).

## Fabrika-kuyruğu (sıradaki dogfood-paket adayları)
- [ ] BÜYÜK-PAKET (owner-talimatı: çok-görevli, 6'lı-worker sürekli-akış) — status-sprinti bitince başlat: i18n-genişleme dalgası, dosya-ayrık 6-10 görev: src/core/cost-gate.ts · src/orchestra/prompt-gate.ts · src/core/scope-gate.ts · src/mcp/tools/autonomous.ts · src/mcp/tools/start.ts · src/api/server.ts hata-stringleri · (tarama-tabanlı ekler). Her görev kendi test-hedefiyle; messages.ts ortak (collision-serileşir).
- [x] 7092 RECOVERY-TRUTH LOCAL_VERIFIED / VERIFY — sprint-622 8/8 COMPLETE; root landing auditte manifest-mutation, canonical-status wire ve legacy-result parity aciklari kapandi. 200 pass/2 skip scoped + 253/253 adjacent, tsc ve authority ratchet yesil; formal cross-provider seal typed unavailable/HOLD oldugu icin DONE degil VERIFY.
- [ ] status "blocked by dependencies" yanlış-etiketi (collision-blokajı ayrı gösterilmeli) — owner-admission alındı sayılır mı? SOR.
- [ ] 7091 cursor-docker hakem-CLI (hakem-çeşitliliği).

## Blocker/not
- [x] MINI-İŞ BİTTİ: bot-daemon listen-child logu `.deckent/runtime/bot-listen.log` altında görünür; 2026-08-22 build sonrası PID/start-token ve Telegram listener satırı canlı doğrulandı.
- [x] BİTTİ — Sprint-595 checkpoint-surukleme vakasi: `recover --force` artik semantic artifact policy + digest-bound manifest kullanir, canonical resume checkpoint explicit successor/terminal authority olmadan tasinmaz; status read modeli checkpoint/terminal receipt uyusmazligini side-effect-free ayirir.
- [x] BİTTİ — Sprint-619 stale-finalizer vakasi: finalizer exact-input-digest gate'i stale projectioni gecersiz kilar, fresh canonical result generation'ini yeniden okur ve terminal task projectionini cleanup'tan once CAS/FWW ile yayinlar.

## Sonraki execution — owner onayi bekliyor
- [ ] 7091 CURSOR-PROVIDER residual: `INSTALL_CURSOR=true` production worker image rebuild + `latest` tag + config-resolved `verifier_priority` cursor sirasi + gercek `--verifier cursor` end-to-end smoke. Cursor kota API'si yoksa limit-admission typed stub olarak durust kalir.
- [ ] D5 approval surface retirement: legacy direct karar ingress'lerini canonical authenticated CLI karar yuzeyine tasima, kalan i18n ve no-bypass ratchet; Slack/Teams secret provisioning owner-adimidir.
- [ ] 7094 ek prefix/F2c olcumu: ratio enforcement owner karariyla kapali kalir; bayraklar degistirilmeden measuredHitRatio + provider-reported USD karar paketi uretilir.
- [ ] 3112 L1-L7 yalniz 3111 v2 runTask closure on-kosulu saglandiktan sonra admission alir.

## DEVİR-PAKETİ 2026-08-21 (aktif handoff-pointer'ı — protokol §4.1)
- handoffId: ah-2026-08-21-codex-rotation · state: PREPARED (epoch 1→2)
- receipt: docs/execution/handoffs/ah-2026-08-21-codex-rotation/0001-prepared.json
  digest sha256:eff13394ec14417a9503f84fc6bc5555dceb58a5925f615dd61ac426f70ff914
- **COMMITTED (epoch 2) — 2026-08-21: EXECUTION_AUTHORITY = CODEX (gpt-5.6-sol).**
  Zincir: 0001-prepared `…f70ff914` → 0002-verified `…` (Codex bağımsız-doğrulamalı) →
  0003-committed `sha256:b0148d1bac9f9e06fc6c50058b6bbae5f9038c0a457aa09f4e987479b5da51cb`.
  Fable aynı-scope mutation'ı KESTİ (gözlem/handoff-desteği modunda). İlk-iş: D4 envanteri.
