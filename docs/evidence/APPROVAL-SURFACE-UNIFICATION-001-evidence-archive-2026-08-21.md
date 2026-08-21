# APPROVAL-SURFACE-UNIFICATION-001 — Evidence arşivi (MASTER satırından taşındı, 2026-08-21)

> MASTER-PLAN Evidence hücresi 10.000-karakter sınırını aştığı için erken-dilim
> kanıtları buraya taşındı. Satırdaki pointer bu dosyayı gösterir; receipt'ler
> ve mühür-sha'ları burada AYNEN korunur (kanıt seyreltilmedi, taşındı).

Tasarim: docs/governance/unified-approval-surface.md (owner-komisyonu 2026-08-20; envanter 2 paralel agent + dosya:satir kanitli — guclu cekirdek: approval-contract MAC+TTL+tombstone; dagitik ikinci katman: 11 yuzey tablolu; yazilmis-ama-bagsiz: telegram/slack/teams relay + vscode decide handler). Ilke: ABSORBE ET, ikinci broker ASLA (KANUN 10 authority-uygulamasi).

**TASARIM-MUHRU TAMAMLANDI 2026-08-20:** codex CONFIRMED `cross-verify-verdict:sha256:7043476a326d2c73969cdb0b83344598f07c44abf02206af86fd1589691c21a3` — hakem-kanali probe-debris defekti (4090-blogu) onarilarak GERI GETIRILDI; hakem bir atif-hatasini da duzeltti (stop-marker runtime-loop'ta degil CLI-sleep'inde) ve dokuman duzeltildi. Ara HOLD/REFUTED zinciri .analysis/xverify'da durust kayit. Gemini verifier IPTAL (yalniz API); cursor docker-CLI 7091 kalani. Ilk muhursuz landing (58da7d603) owner'ca reddedilip revert edilmisti (65e382a57) — muhurlu yeniden-kapanis budur.

**D1 UYGULANDI 2026-08-20 (ASAMA-BAZLI UC MUHUR):** src/core/approval-inbox-federation.ts — 7 fail-soft READ-ONLY okuyucu (confirmations · autonomous pending · nervous pending · panic markers · pending-checkpoint'ler · bot-action parklari · gateway-pairing) origin-etiketli satirlara projeler; bozuk depo typed-unreadable satiri (asla crash/gizleme); karar-yollari DOKUNULMADI (D2 isi). CLI `deckent approvals list` broker-bolumu AYNEN + federe bolum (i18n en+tr, karar-ipucu komutlariyla); MCP read-only inbox ayni federe satirlari tasir (decide yuzeyi yine YOK). Pin: 3 federasyon + 48 komsu yesil, tsc 0, hermetic +1-modul belgeli. Gercek-binary kanit: bos/dolu/geri-bos uc durum .analysis/xverify/d1-result-proof.txt. MUHURLER — tasarim: `…691c21a3` (ortak); uygulama: codex CONFIRMED `cross-verify-verdict:sha256:dd5c1e023dcea06bc9d844aa7af06ec6b67d99bb35070b3bd47dd317cf4930c5`; sonuc: codex CONFIRMED `cross-verify-verdict:sha256:6ffdf5598dc88aac2fb8412299dcd6a050b6346c9830c3c75416530460fce97a`.

**ERGONOMI-EKI (owner admission 2026-08-20: 'CLI'da cok fazla onay-mekanizmasi; 64-char sha ile onay verilemez; buton/y-n; approval-rules.json takipli + sokulebilir; en-zeki-cozum-mimari kimligi — skill yoksa create'):** .claude/skills/solution-architect OLUSTURULDU (kalici kimlik-checklist'i; tasarim-islerinde varsayilan). Tasarim-eki doc §3.5: (1) KISA-KOD — sha256(requestId) ilk 25-bit → 5-char Crockford-base32 (O/0-I/1 yok; cakismada uzat), HER yuzeyde AYNI kod, decide kisa-kod VEYA tam-id, bayat-kod typed fail-closed; nervous'un kendi kod-uretici D2b'de ABSORBE. (2) KART-UCLUSU: kaynak · neden · kod tek satir. (3) Sohbet: nonce-bagli Approve/Deny butonlari + `y <kod>`/`n <kod>`; critical view-only+deep-link. (4) approval-rules.json (.deckent/settings, git-izlenir): typed kural-semasi (match origin/pattern/riskTierMax; critical TIP-DISI), her uygulama audit + decidedBy:'rule:<id>', autonomous-bagli onaylar da AYNI dosyada kural olarak SOKULEBILIR (rules list/disable/enable/remove + decide --always yalniz routine-promosyon); NO-AUTO-APPROVE genellesir: sistem kendine kural yazamaz. Kolaylik yetki GENISLETMEZ (kimlik/MAC/kanal-matrisi aynen). Dilimler DE1 (kisa-kod+kart) → DE2 (rules store+motor+CLI) → DE3 (buton/y-n, D3 ile) — her biri 3-asama muhurlu. Ergonomi-eki TASARIM-MUHRU: codex CONFIRMED `cross-verify-verdict:sha256:2f877c34cd2c220c8e5789ff06b50831b9925a61140dcc4ca25da0a123868d35`.

**DE1 UYGULANDI 2026-08-20 (UC-ASAMA MUHURLU):** src/core/approval-short-code.ts — sha256(id) ilk-25-bit → 5-char Crockford (O/0-I/1 yok; normalize-confusables; looksLike guard'i tam-id'yi asla yanlis-yonlendirmez); resolveShortCode YALNIZ o-anki pending-kumesi, typed resolved/unknown/ambiguous (asla tahmin). CLI list satirlari (broker + federe) #kod onekli; decide kod-sekilli argumani karar-akisindan ONCE cozer — unknown/ambiguous typed hata + exit-1; kimlik/TTY-reauth/MAC AYNEN. MCP payload'larina shortCode alani. Pin 4 kod + 52 komsu, tsc 0, hermetic +1-modul. Gercek-binary kanit .analysis/xverify/de1-result-proof.txt: '#BSJ1F · [checkpoint] …' kart-satiri + bilinmeyen-kod typed fail-closed TR-hatasi. MUHURLER — uygulama: codex CONFIRMED `cross-verify-verdict:sha256:b93d44c9c3193ed3303f9573f5871c78e19dda0b08bf6b61656e9c5a3a67e585`; sonuc: codex CONFIRMED `cross-verify-verdict:sha256:cc5e1e519fa80dc72e31d9702f4f190aa5215b791026f68625c5af141eacd4f5`.

**DE2a UYGULANDI 2026-08-20 (kural-store + rules-CLI + --always; DURUST-ASAMALAMA: motor ADVISORY — otomatik-karar zarf-varyanti D2b'de, sahte-enablement yok):** src/core/approval-rules.ts — TAM-sema dogrulamasi (hakem ilk olcumde kismi-dogrulamayi HAKLI REFUTED'ladi `…6778be11`; opsiyonel-alanlar+source dahil her alan dogrulanir, gecersiz satir fault-bayrakli DUSER, asla kismen guvenilmez), critical TIP-DISI, atomic-save, first-match-wins advisory-matcher, promoted-from-provenance'li --always terfisi (daima routine). CLI: rules list/disable/enable/remove + decide --always + eslesen-kural onerisi-satiri; i18n en+tr. Pin 3 store + 55 komsu; tsc 0. Gercek-binary yasam-dongusu kaniti (bos→aktif→DISABLED→silinmis + gecersiz-satir uyarisi) .analysis/xverify/de2a-result-proof.txt. MUHURLER — tasarim-delta+uygulama: codex CONFIRMED `cross-verify-verdict:sha256:ea840604b39a7394ab5266fcf4e90398a85e75b78af42d20ba7a756b05fdd63f`; sonuc: codex CONFIRMED `cross-verify-verdict:sha256:3946a3f420a77e31cb76bf4408868f11dff71e0e00cecb78ac43503c60d6aa1f`.

**D2a UYGULANDI 2026-08-20 (KARAR-FEDERASYONU ilk iki origin — auth-asimetrisi kapandi):** src/core/approval-decision-federation.ts — confirmation+checkpoint hedefleri karar-aninda broker'a KENDI id'leriyle lazy-mirror edilir (sema-gecerli istek; duplicate/yaris tolere; 24h pencere — D4'e ara-cozum), karar AYNI decideTerminal canli-oturum ingress'inden verilir (bypass-yolu YOK), settle-back legacy depoya byte-uyumlu geri-yazar (confirmation CONFIRMED/FAILED; checkpoint status approved/rejected, diger alanlar korunur; typed failed-nedenler). Kisa-kod cozumu broker+federe BIRLESIK kumede; goc-edilmemis origin'ler typed origin_not_migrated reddi. Pin 3 kopru + 58 batarya; tsc 0; hermetic +1-modul. GERCEK-BINARY UCTAN-UCA KANIT (.analysis/xverify/d2a-result-proof.txt): '#CT4WG' kisa-koduyla checkpoint canli-TTY kimlikle broker'dan karara baglandi ve legacy dosya approved'a geri-yazildi. MUHURLER — uygulama: codex CONFIRMED `cross-verify-verdict:sha256:704ade2902e241582004de59f5c65d41f70c7ffb655568215fe051c333e73025`; sonuc: codex CONFIRMED `cross-verify-verdict:sha256:8160754a7e1eed3c06f3c6089eec25458976cedc2288c487cc8d673412052c65`.

**D5-ON-KAPANIS (sprint-589 DOGFOOD-FABRIKA paketi, 2026-08-20):** envanterin olctugu 4 i18n-ihlali Deckent'in kendi 8-faz akisiyla kapatildi (4/4 DONE, 0 fix, 0 NO_GO; sonnet worker'lar; messages.ts collision-serilesmesi tasarlandigi gibi): mcp nervous+autonomous karar-mesajlari, sprint-lifecycle 'Onay bekleniyor' TR-hardcode'u, checkpoint CLI option-desc'leri kataloga (en+tr) tasindi. Brain-dogrulama: tsc 0 · 38/38 scoped · hardcode-grep 0. Sonuc-muhru: codex CONFIRMED `cross-verify-verdict:sha256:be611473dcb2737cd526b2bd0dfa039c784306a2cdabdf423e905a9c15b6e8a8`. FABRIKA-DERSLERI (DIRECTIVES-kontrati): gorev-basliklari `## Task N:` + kanonik model-id (legacy-alias E_LEGACY_MODEL_ALIAS fail-closed) + prose'da tam-yol; yanlis-formatta bullet-fallback her satiri gorev yapar (588 vakasi, arsivde). FINDING (admission bekler): status collision-blokajini 'blocked by dependencies' diye etiketliyor.

**KAPANDI (sprint-590 fabrika, yetki-devriyle admission):** status blocked/next/stale satirlari i18n'e tasindi ve blocked-metni neden-durust ('bagimlilik ya da dosya-cakismasi siralamasi'); yeni tests/cli/status-output.test.ts 9/9; worker GWTD verdi ama Brain-tanisi KOZMETIK (kod tam: hardcode-grep 0, tsc 0; rubrik-tavani) — DONE-esdegeri kapanis. 

## D4 TTL/SLA normalizasyonu - uygulama ve LOCAL_VERIFIED (Codex, 2026-08-21)

### Dogfood izi ve bounded recovery

Sprint 609, onayli D4 execution DAG'ini 50 task olarak Deckent fabrikasinda
baslatti. Disk dogrulamasi ilk foundation task'larinin origin-bazli TTL/SLA
profili yerine eski channel-policy matrisini kurdugunu gosterdiginde kalan DAG'i
ilerletmek yanlis contracti yayacakti. Run 5 DONE ve 45 INTERRUPTED durumda
owner-onayli olarak kesildi; task artefact'lari silinmeden
`.tasks/archive/sprint-609-interrupted-2026-08-21/` altinda korundu.

Uygulama `docs/execution/active/APPROVAL-LIFECYCLE-D4-RECOVERY.md` ile typed
ADR-D-007 bounded recovery'ye alindi. Frozen tasarim
`docs/governance/approval-lifecycle-d4-execution.md` oldu. Uc file-disjoint
workstream config/contract/confirmation, autonomous/risk ve pairing/view/scale
zincirlerini izole `recovery/d4-609` worktree'sinde kapatti. Recovery'deki 116
D4 yolu root `main` calisma agacina base-root-recovery uc-yollu merge ile
tasindi; ayni dosyalardaki provider-authority ve ratio-observe-only degisiklikleri
korundu, Sprint 609'un yarim D4 API taslagi tasinmadi.

### Onceki sistem gercegi

- Confirmation, autonomous-trigger ve gateway-pairing depolari broker TTL
  tasisa bile kendi durable truth'larinda suresiz pending kalabiliyordu.
- Autonomous lazy mirror TTL'yi original request saatinden degil mirror anindan
  baslatiyor, broker timeout'unu legacy trigger'a settle etmiyor ve direct
  CLI/MCP/API/bot karar yollari gec karari kabul edebiliyordu.
- Pairing production store object-map iken federated inbox array-only parse
  ediyor; daemon allowlist/pairing snapshot'ini startup'ta cache'liyordu.
- Goal-v2 Mission TTL'si request publish saatine degil work-item createdAt'e
  bagliydi; gec acilan dependency dogustan expired olabiliyordu.
- Stored v1 request'e enumerable lifecycle defaultu eklemek, daha once imzalanmis
  decision MAC digestini restart sonrasinda bozma riski tasiyordu.
- SLA stage, durable outbox/ACK, timeout settle-back ve tum direct surface'lerde
  tek FWW late-decision authority'si yoktu.

### Yeni canonical cozum

1. `approval.lifecycle` config'i tek resolver/policy authority'sine baglandi.
   Owner-onayli profiller confirmation icin 8 saat ve 5 dakika/30 dakika/2 saat;
   autonomous-trigger icin 1 saat ve 2 dakika/10 dakika/30 dakika;
   gateway-pairing icin 10 dakika ve 1 dakika/3 dakika/7 dakika; broker-native
   icin 30 dakika ceiling ve 2 dakika/10 dakika/20 dakika olarak cozuluyor.
   Kisa producer expiry asla uzatilmiyor; policy reload yalniz tightening
   uyguluyor, weakening typed olarak reddediliyor veya in-flight kayitta
   ignore-evidence uretiyor.
2. Approval contract versionlandi. V1 read ve signed-digest byte-shape'i
   degismedi. Yeni V2 envelope origin, effective riskTier, blocking scope,
   embedded lifecycle profile, policy snapshot digest, generation ve source
   lineage tasiyor. Producer schema family bilgisi canonical contract version
   alanina karistirilmiyor.
3. ApprovalStore ve Broker expiry-aware first-writer-wins CAS kullaniyor.
   Human decision ve system timeout ayni durable decision slotu icin yarisiyor;
   kaybeden late decision replay/grant/diriltme uretemiyor. Timeout decision,
   typed receipt ve audit correlation ayni lineage'i koruyor.
4. Runtime expiry driver dort origin'i startup ve scheduled tick'te supuruyor.
   SLA journal initial, renotify, alternate, park-alert ve expired stage'lerini
   monotonic eventId ile persist ediyor; restart catch-up en yuksek actionable
   stage'e coalesce oluyor, durable client ACK tekrar bildirimi engelliyor.
5. Confirmation timeout system:expiry tarafindan UNDECIDABLE park/tombstone'a
   donuyor; yeni evidence/revision explicit successor uretebiliyor. Autonomous
   timeout EXPIRED terminal truth ve park-alert ile replay'i kapatiyor. Pairing
   timeout deny-expire ile request'i kaldiriyor ve access grant vermiyor.
6. Pairing opaque pairingId, tenant/project/principal scope, object-map ve
   legacy-array parser parity, cross-process CAS ve daemon fresh-read kazandi.
   Requesting chat critical pairing kararini veremiyor.
7. Unified CLI lifecycle/quarantine/receipt gorunumu authenticated karar yolunu
   kullaniyor; MCP inbox salt read-only projection ve read sirasinda sweep,
   migration, stage veya decision write yapmiyor.
8. Shared effective riskTier authority channel authenticator, rules engine,
   Telegram/Slack/Teams, bot precheck, policy, fallback, WorkerGate, allow-scope
   ve Nervous safety floor'a baglandi. Critical hicbir auto-approve, fallback
   allow, channel button veya scope-grant reuse uretemiyor.
9. Production wiring config -> producer -> store/broker -> SLA/outbox -> relay ->
   timeout settle-back -> origin terminal truth -> audit -> CLI/MCP/API zinciri
   olarak kapandi. Slack/Teams app-secret provizyonu ve closure imzalari owner
   authority'sinde kaldi; recovery secret mutation yapmadi.

### Gercek-binary smoke'un yakaladigi son BLOCKS_CURRENT_DONE

Ilk landing build'inden sonra bot restart'i, 429 approval dosyasinda mevcut 11
valid timeout receipt'ini her startup'ta FWW EEXIST yoluna tekrar soktu. Bu yol
her prior winner icin file ve directory fsync yaptigindan iki process
`jbd2_log_wait_commit` D-state'ine girdi; yaklasik 1.3 GB read ve binlerce write
syscall olculdu. Unit testler yetki dogrulugunu kanitliyor fakat bu startup I/O
amplification'ini gostermiyordu.

`ApprovalStore.sweepExpired()` artik mevcut receipt'i once parse ediyor. Receipt
valid ise onu read-only restart authority sayiyor ve FWW publisher'a tekrar
girmiyor; malformed/missing bytes ise fail-closed recovery publication yolunda
kaliyor. Read-only directory altinda restart sweep'in sifir write yaptigini
kanitlayan regression eklendi. Yeniden build sonrasinda bot PID kaydini dorduncu
250 ms poll'da yazdi ve iki saniyelik stability kontrolunu gecti.

### Lokal kanit manifesti

- `npx tsc --noEmit`: exit 0.
- D4 combined battery: 65 test file, 298/298 PASS.
- 10k canonical pairing pending: 10,000 unique EXPIRED receipt, 290.3 ms,
  21,929,069 bytes; second sweep no-op ve revision-stable.
- Existing-timeout restart regression: 6/6 PASS; read-only store'da write yok.
- `node scripts/lint-approval-lifecycle-authority.mjs`: OK.
- `git diff --check`: exit 0.
- `npm run build:all`: core TypeScript, asset copy ve Vite dashboard build PASS.
- Dist CLI: confirmation, autonomous, approvals ve isolated gateway list
  yuzeyleri empty-state ile exit 0.
- Dist API: `/api/approvals` HTTP 200; pending, expired ve quarantined alanlari
  array olarak dondu.
- Bot stop/build/start: yeni dist ile PID 733570, official status running ve
  exact `kill -0` stability proof PASS.
- Global configte lifecycle gate enabled; owner-instructed ratioEnforcement
  field count sifir.

### XVerify ve closure siniri

Target'lar okunmadan once satir sayilari olculdu: design 291, policy 465,
contract 493, store 777, federation 490, closure integration 541. Farkli
provider icin `claude/claude-opus-5` istendi; provider call admission'dan once
`xverify_verifier_tier_below_author` reason code'u ile typed HOLD oldu cunku
verifier premium, author `gpt-5.6-sol` premium_plus olarak cozuldu. XVerify id:
`xv-1787330284838-fe68ecaf-d8fb-46f3-87fc-872ab5fe0a15`. Receipt'ler
`.tasks/archive/xverify-2026-08-21/`, rapor `.analysis/xverify/` altinda.

Bu HOLD seal degildir ve tekrar denenmedi. Owner'in bu tur icin verdigi
"verify basarisizsa islere devam et, sonra toplu analiz" karariyla implementation
LOCAL_VERIFIED olarak tamamlandi; 4056 parent satiri formal uc-asama seal ve D5
nedeniyle OPEN kalir. Commit/push owner tarafindan istenmedigi icin yapilmadi.
