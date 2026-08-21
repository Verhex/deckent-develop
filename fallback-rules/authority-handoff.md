# Provider-Independent EXECUTION_AUTHORITY Handoff Protocol

> **Statü:** Deckent-dev için kalıcı, provider/model/host bağımsız operational contract.
> Bu belge hem **yetkiyi devreden** hem **yetkiyi devralan** tarafından bütünüyle okunur.
> Belgeyi okumak, bir mesaj almak veya `PREPARED` paketi görmek tek başına yetki devri
> DEĞİLDİR. Yetki yalnız aşağıdaki receipt zincirinde geçerli bir `COMMITTED` ya da
> owner-authorized `RECOVERY_COMMITTED` transition'ıyla el değiştirir.
>
> **Dürüst sınır:** Bu sürüm disk-backed manual coordination contract'tır; runtime-enforced
> fencing ürünü varmış gibi davranmaz. `COMMITTED`, taraflar için bağlayıcı tek-yürütücü
> kaydıdır fakat işletim sisteminde ikinci bir süreci teknik olarak durdurduğu iddia edilmez.

## 0. Amaç, kapsam ve negative space

Bu protokol; provider limit/capacity, auth veya reachability kaybı, context exhaustion, host
arızası, owner-directed rotation ya da yürütmeyi durduran başka bir typed decision blocker
durumunda aynı approved outcome'un kesintisiz ve kanıtlı biçimde başka bir uygun yürütücüye
aktarılmasını sağlar.

Bu protokol:

- owner authority'sini, Immutable Laws'u, approved DAG'ı veya destructive/external karar
  sınırlarını devretmez;
- bir approval'ı onaylamaz, reddetmez veya bypass etmez;
- receiver'a scope genişletme, yeni outcome admission'ı ya da anayasal karar yetkisi vermez;
- provider routing kataloğu değildir; provider/model adı hardcode etmez;
- `xverify` değildir: verifier sonuç değerlendirir, sırf doğrulama yaptığı için execution
  authority kazanmaz;
- task bağımlılık iletişimi için kullanılan `.tasks/handoffs/` protokolü değildir;
- transcript'i, chat özetini veya tek taraflı “devrettim/devraldım” beyanını authority saymaz;
- çalışan sprinti öldürme/cleanup etme, sprint sırasında build alma veya auth mutation yapma
  izni vermez.

**İhlal örneği:** Receiver'ın `PREPARED` dosyasını görüp kaynak kod yazmaya başlaması iki aktif
yürütücü yaratır. Bu split-brain'dir; `COMMITTED` yoksa mevcut authority değişmemiştir.

Canonical öncelik zinciri aynen korunur: provider/system safety → Alperen'in canlı talimatı →
Immutable Laws → host operating rules → canonical operating policy → active-run contract → rol
ve skill kuralları → generated evidence.

## 1. Roller ve identity

### 1.1 Roller

- **TRANSFEROR:** Devir başlamadan hemen önce exact scope'un geçerli
  `EXECUTION_AUTHORITY`'si.
- **TRANSFEREE:** Effective policy tarafından uygun bulunan ve receipt'te exact identity ile
  hedeflenen aday yürütücü.
- **OWNER:** Scope/authority/destructive/external/constitutional sınırların nihai karar sahibi.
  Normal handoff'ta message bus değildir; yalnız owner kararı gerektiren sınırda veya transferor
  commit üretemeyecek kadar unavailable ise recovery authority'sidir.

### 1.2 Normative actor identity

Her iki taraf receipt'te aşağıdaki runtime-resolved alanlarla tanımlanır:

- `hostId` — aktif host adapter/surface kimliği;
- `providerId` — canonical provider ID;
- `modelApiId` — registry'deki exact model API ID;
- `role` — operating-policy vocabulary'sinden rol;
- `principalDigest` — account/principal'ın secret içermeyen digest'i;
- `sessionDigest` — varsa oturumun secret içermeyen digest'i.

Alias, pazarlama adı, “Fable”, “Codex”, “en iyi model” gibi serbest metinler identity authority
değildir. Raw token, credential, cookie, key, private signer material veya hassas account path'i
receipt'e ASLA yazılmaz.

### 1.3 Geçerli authority nasıl çözülür

Exact outcome/scope için sıralama:

1. Alperen'in daha yeni canlı ve açık talimatı;
2. aynı scope'a ait en yüksek geçerli epoch'lu `COMMITTED` veya
   `RECOVERY_COMMITTED` receipt;
3. host control block'taki persisted projection.

Receipt ile disk/control block/live owner talimatı çelişirse ilerleme yoktur: typed
`AUTHORITY_CONFLICT/HOLD`. Receiver çatışmayı sessizce yorumlayamaz ve kendine yetki veremez.

## 2. Target resolution ve handoff trigger'ı

Transferor yalnız mevcut authority sınırı içindeki approved outcome'u devredebilir. Hedef;
effective config, model registry, role policy, auth/account identity, reachability, usage/limit,
finite-budget admission, host/tenant resource policy ve gerekli capability evidence'ın
kesişiminden çözülür. Configured sıra niyettir; availability kanıtı değildir.

Canonical `reasonCode` örnekleri:

- `PROVIDER_LIMIT_OR_CAPACITY`
- `AUTHORITY_OR_AUTH_UNAVAILABLE`
- `REACHABILITY_UNAVAILABLE`
- `CONTEXT_EXHAUSTION`
- `HOST_FAILURE`
- `OWNER_DIRECTIVE`
- `DECISION_BLOCKER`
- `PLANNED_ROTATION`

Bir blocker yalnız seçilen yaklaşımı engelliyorsa transferor önce sınır-içi alternatifleri
stakes'e orantılı biçimde tüketir. Blocker hedefin kendisini veya owner-only kararı engelliyorsa
handoff approval bypass olarak kullanılamaz; paket pending authority'yi aynen taşır.

## 3. Split-brain-free state machine

```text
CURRENT(from, epoch=N)
        |
        | transferor writes PREPARED for proposedEpoch=N+1
        v
PREPARED -------- transferor writes ABORTED --------> CURRENT(from, epoch=N)
        |
        | transferee verifies disk evidence and writes VERIFIED
        v
VERIFIED -------- transferor writes ABORTED --------> CURRENT(from, epoch=N)
        |
        | transferor validates VERIFIED and atomically writes COMMITTED
        v
CURRENT(to, epoch=N+1)

If transferor becomes unavailable before COMMITTED:
PREPARED/VERIFIED -- explicit owner authority --> RECOVERY_COMMITTED(to, epoch=N+1)
```

Kurallar:

1. `PREPARED` ve `VERIFIED` authority'yi değiştirmez; transferor tek yürütücüdür.
2. Normal yolun `COMMITTED` transition'ını yalnız geçerli transferor üretir.
3. Receiver kendini promote edemez. Transferor commit üretemiyorsa tek cutover yolu explicit
   owner-authorized `RECOVERY_COMMITTED` transition'ıdır.
4. `COMMITTED` oluştuğu anda transferee tek yürütücü olur; transferor aynı scope'ta mutation'ı
   durdurur ve yalnız gözlem/handoff desteği verir.
5. Her transition yeni immutable receipt'tir; önceki dosya mutate veya delete edilmez.
6. `ABORTED`, authority'yi transferor'da bırakır. Commit sonrası “rollback” state rewind değildir;
   ters yönde yeni `handoffId` ve daha yüksek epoch'lu yeni handoff'tur.
7. Aynı scope/epoch için birden fazla commit, eksik digest chain veya identity uyuşmazlığı
   `EPOCH_CONFLICT/HOLD`'dur. “En yenisini tahmin et” fallback'i yoktur.
8. Manual contract runtime fencing sağlamadığından taraflar kendi rol disiplinleriyle eski epoch
   mutation'ını reddeder. Ürün-side fencing sevk edilene kadar bu sınır açıkça korunur.

## 4. Durable receipt contract

### 4.1 Storage ve immutability

Deckent-dev manual handoff receipt'leri şu versioned dizinde tutulur:

```text
docs/execution/handoffs/<handoffId>/
  0001-prepared.json
  0002-verified.json
  0003-committed.json
```

Receipt'ler elle DEĞİL, `scripts/authority-handoff.mjs`
(prepare/verify/commit/abort/recovery-commit/status) ile üretilir — digest'i
makine hesaplar, create-only yazar, transition-sırasını ve recovery'nin owner
authority-ref şartını mekanik zorlar (tooling 2026-08-21, owner-onaylı;
policyDigest kaynağı `lint-operating-policy.mjs --digest`).
Recovery/abort transition'ı bir sonraki sequence numarasını kullanır. `current-flow.md` yalnız
aktif `handoffId` ve son receipt digest'ine pointer taşıyabilir; receipt'in kendisi değildir ve
tek kanıt kaynağı olamaz. `.tasks/handoffs/` bu amaçla kullanılmaz.

### 4.2 Canonical base + extension

Her transition, `docs/governance/deckent-dev-operating-policy.md` §8'deki base alanların tümünü
taşır. Aşağıdaki `authorityHandoff` nesnesi geriye uyumlu extension'dır; canonical şemayı
supersede etmez:

```json
{
  "schemaVersion": 1,
  "outcomeId": "owner-admitted-outcome-id",
  "role": "supervisor",
  "baseSha": "full-git-sha",
  "headSha": "full-git-sha",
  "branch": "exact-branch",
  "policyDigest": "sha256:...",
  "scopeDigest": "sha256:...",
  "filesChanged": [],
  "verification": [],
  "findings": [],
  "openActions": [],
  "recommendedNextAction": "one exact action",
  "authorityHandoff": {
    "protocolVersion": 1,
    "handoffId": "ah-...",
    "sequence": 1,
    "transition": "PREPARED",
    "transitionActor": "transferor",
    "currentAuthorityEpoch": 7,
    "proposedAuthorityEpoch": 8,
    "previousReceiptDigest": null,
    "from": {
      "hostId": "runtime-resolved",
      "providerId": "runtime-resolved",
      "modelApiId": "exact-registry-api-id",
      "role": "supervisor",
      "principalDigest": "sha256:...",
      "sessionDigest": "sha256:..."
    },
    "to": {
      "hostId": "runtime-resolved",
      "providerId": "runtime-resolved",
      "modelApiId": "exact-registry-api-id",
      "role": "supervisor",
      "principalDigest": "sha256:...",
      "sessionDigest": "sha256:..."
    },
    "trigger": {
      "reasonCode": "PROVIDER_LIMIT_OR_CAPACITY",
      "authorityRef": "standing-policy-or-owner-decision-ref"
    },
    "authorityScope": {
      "goalId": "...",
      "missionId": "...",
      "flowId": "...",
      "runId": "...",
      "roles": ["supervisor"],
      "includes": ["exact approved outcome and open actions"],
      "excludes": ["owner-only and unadmitted work"]
    },
    "evidenceSnapshot": {
      "observedAt": "ISO-8601",
      "repoStateRef": "evidence-ref",
      "runtimeStateRef": "evidence-ref",
      "approvalStateRef": "evidence-ref",
      "verificationStateRef": "evidence-ref",
      "buildStateRef": "evidence-ref",
      "ssotStateRef": "evidence-ref"
    }
  },
  "receiptDigest": "sha256:..."
}
```

`VERIFIED`, `COMMITTED`, `ABORTED` ve `RECOVERY_COMMITTED` receipt'leri aynı base + extension
şemasını kullanır; `sequence`, `transition`, `transitionActor`, evidence ve
`previousReceiptDigest` ilerler. Aynı handoff içindeki `from`, `to`, scope ve proposed epoch
değişemez.

### 4.3 Digest ve chain

- `receiptDigest`, `receiptDigest` alanı çıkarıldıktan sonra RFC 8785/JCS ile canonicalize
  edilmiş JSON byte'larının SHA-256 digest'idir.
- `previousReceiptDigest`, aynı handoff'taki bir önceki geçerli transition receipt'ine bağlanır.
- `scopeDigest`, canonical `authorityScope` nesnesinin aynı yöntemle digest'idir.
- `policyDigest`, aktif Deckent policy authority/lint yüzeyinin raporladığı digest'tir; mechanism
  bu değeri sağlayamıyorsa agent digest uydurmaz, `POLICY_DIGEST_UNAVAILABLE/HOLD` verir.
- Array order semantiktir; timestamp ve path normalize edilip sonra digest alınır.
- Digest, sequence, epoch, scope veya identity doğrulanamıyorsa işlem durur; receipt sessizce
  düzeltilmez. Düzeltme yeni transition/receipt olarak yapılır.

## 5. TRANSFEROR — keskin devir prosedürü

Transferor aşağıdaki sırayı izler; hiçbir adımı receiver'a bırakıp `DONE` diyemez.

1. **Authority ve irtifa:** Kendisinin exact scope'ta geçerli authority olduğunu disk + policy
   ile doğrular; işi patch/slice/design/constitution irtifasında adlandırır. Authority belirsizse
   `AUTHORITY_CONFLICT/HOLD`.
2. **Canonical refresh:** Aktif host entry contract'ını, canonical core memory'yi, operating
   policy'yi, ilgili MASTER satırını, `current-flow.md`yi, Alp Discipline'ı ve run'a dokunulacaksa
   `DIRECTIVES.md`yi okur. Generated export policy üretmez.
3. **Target admission:** Target identity'yi effective config + registry + auth/reachability +
   limit/budget + capability evidence ile çözer. Availability kanıtı yoksa `TARGET_UNAVAILABLE/HOLD`.
4. **Scope freeze:** Devredilecek goal/mission/flow/run/outcome, roller, `openActions`, include ve
   exclude sınırlarını yazar. Owner-only veya unadmitted işleri dışarıda bırakır.
5. **Repo snapshot:** Branch, base/head SHA, upstream durumu ve dirty dosyaları iş-bazlı gruplar.
   Başka oturumun değişikliğini kendi işi gibi sahiplenmez.
6. **Runtime snapshot:** Canlı sprint/run/worker/bot/watcher/xverify durumunu yalnız disk-backed
   kanıtla kaydeder. Status projection tek başına liveness değildir; heartbeat mtime + PID/process
   adapterı + log tail + result/settlement birlikte kullanılır.
7. **Approval snapshot:** Pending/decided approval'ları, kısa kodları, authority tier'larını ve
   kimin karar verebileceğini kaydeder. Handoff sırasında hiçbir kararı devralan adına vermez.
8. **Verification + build snapshot:** Tasarım/uygulama/sonuç receipt'lerini, HOLD/UNCLEAR
   serilerini, son build'in HEAD identity'sini ve source↔dist durumunu kaydeder.
9. **SSOT + honesty:** MASTER/current-flow güncelliğini, yazılmamış ama owner-admitted kayıtları,
   blocker/risk/şüpheleri ve finding classification'larını kaydeder. Kanıtsız iş `DONE` olamaz.
10. **PREPARED:** Base receipt + extension'ı üretir; digest'i bağımsız tekrar hesaplayıp dosyayı
    create-only/immutable yazar. Authority hâlâ kendisindedir.
11. **VERIFIED bekle:** Receiver'ın receipt'ini ve identity'sini doğrular. `HOLD` varsa mevcut
    authority olarak yalnız blocker çözümünü yürütür veya `ABORTED` yazar.
12. **COMMITTED:** Tüm koşullar geçerse bir sonraki immutable receipt'i atomik create ile yazar.
    Bundan sonra aynı scope'taki mutation'ı keser; receiver'ın kabul raporunu gözler.

Transferor limit sıfıra düşmeden önce hazırlık yapar. Hazırlığı tamamlayamadan unavailable olursa
receiver kendini yetkilendiremez; §8 recovery yolu gerekir.

## 6. TRANSFEREE — keskin devralma prosedürü

Receiver'ın ilk görevi işe devam etmek değil, paketi doğrulamaktır.

1. **Identity match:** `to` identity'sinin kendi runtime identity'siyle exact eşleştiğini kanıtlar.
   Alias veya “yakın model” kabul etmez.
2. **Authority chain:** Owner live instruction → latest committed receipt → control block sırasını,
   current/proposed epoch'i ve previous digest chain'i doğrular.
3. **Canonical refresh:** Kendi host entry contract'ını ve §5'in 2. adımındaki aynı canonical kaynakları
   tazeler. Transferor'ın transcript/özetini instruction saymaz.
4. **Disk reconciliation:** Git SHA/status, canlı süreç, approval, receipt, build ve SSOT
   beyanlarını bağımsız read-only ölçümlerle karşılaştırır.
5. **Bounded review:** Yalnız `openActions`, scope ve değişmiş evidence üzerinden devam planı
   kurar. Yeni disk/CI evidence yoksa yeni full audit açmaz.
6. **Mismatch handling:** Beyan ile disk farklıysa mutation yapmaz; exact “beyan / disk / etki /
   gereken authority” biçiminde typed HOLD üretir. Sessiz repair yoktur.
7. **VERIFIED:** Tüm kontroller geçerse immutable `VERIFIED` receipt'i yazar. Bu adım authority
   devri değildir; yalnız hazır ve doğrulanmış olduğunu bildirir.
8. **COMMITTED bekle:** Geçerli `COMMITTED`/`RECOVERY_COMMITTED` receipt'i görmeden source,
   run-state, approval veya SSOT mutation'ı yapmaz.
9. **Activation:** Commit'i gördüğünde epoch ve digest'i son kez doğrular; transferor'ın eski
   epoch'ta durduğunu contractual evidence ile kontrol eder; yalnız `openActions` üzerinden
   yürütmeye başlar ve aşağıdaki kabul mesajını verir.

## 7. Handoff snapshot'ında zorunlu dokuz evidence grubu

1. **Identity + trigger:** Kimden/kime, exact model/provider/host/role, zaman, reasonCode ve
   authority ref.
2. **Authority scope:** Outcome ve Goal→Mission→Flow→Run kimlikleri, roles, includes, excludes,
   current/proposed epoch.
3. **Repo state:** Branch, base/head SHA, upstream ilişkisi, dirty değişikliklerin iş-bazlı grubu.
4. **Live runtime:** Sprint/run/task/worker/bot/watcher/xverify ve her liveness iddiasının disk
   kanıtı; orphan şüphesi açık etiketli.
5. **Approvals:** Pending/decided listesi, exact subject, karar authority'si ve beklenen işlem.
6. **Verification:** Local/remote sınıflı sonuçlar, design/implementation/result receipts,
   provider call+usage+settlement zinciri, HOLD/UNCLEAR nedenleri.
7. **SSOT + build:** MASTER/current-flow durumu, son build HEAD'i, source↔dist identity ve restart
   gereksinimi.
8. **Honesty + findings:** Yarım işler, riskler, şüpheler; `BLOCKS_CURRENT_DONE`,
   `RELATED_BUT_NONBLOCKING`, `UNRELATED` sınıfları ve reasonCode'lar.
9. **Open actions:** Öncelikli 3–5 exact eylem ve tek `recommendedNextAction`; devralan yalnız
   buradan devam eder.

## 8. HOLD, abort, recovery ve re-handoff

Canonical handoff HOLD reasonCode'ları en az şunları kapsar:

- `AUTHORITY_CONFLICT`
- `IDENTITY_MISMATCH`
- `RECEIPT_DIGEST_MISMATCH`
- `RECEIPT_CHAIN_INCOMPLETE`
- `EPOCH_CONFLICT`
- `SCOPE_UNCLEAR`
- `EVIDENCE_STALE`
- `SOURCE_STATE_MISMATCH`
- `TARGET_UNAVAILABLE`
- `POLICY_DIGEST_UNAVAILABLE`
- `OWNER_AUTHORITY_REQUIRED`
- `SECRET_EXPOSURE`

Kurallar:

- Aynı typed HOLD aynı evidence ile döngüsel retry edilmez; eksik authority/evidence sağlanır.
- Commit öncesi vazgeçişi yalnız transferor `ABORTED` transition'ıyla kaydeder; authority onda
  kalır.
- Transferor unavailable ise receiver yalnız owner'ın canlı explicit kararı ve bu karara ait
  `authorityRef` ile `RECOVERY_COMMITTED` üretebilir. Owner kararı yoksa güvenli duruş sürer.
- Commit sonrası geri dönüş, önceki receipt'i silmek/değiştirmek değildir; mevcut authority'nin
  başlattığı yeni handoff ve daha yüksek epoch'tur.
- Receipt secret içeriyorsa dosya yayılmaz; `SECRET_EXPOSURE/HOLD`, dar containment ve owner'a
  evidence aktarımı uygulanır. Secret receipt'e taşınmaz.

## 9. Korunan operasyon kuralları

- Canlı sprint/run handoff sırasında kill/cleanup edilmez; devredilir ve yeni authority izlemeyi
  disk kanıtıyla yeniden kurar.
- Sprint çalışırken `npm run build` ve provider login/auth mutation yapılmaz.
- Source değiştiyse build ancak aktif sprint terminally closed olduktan sonra documented
  restart/reconnect akışıyla alınır.
- Approval kararı yalnız authorized live CLI yüzeyinde verilir. Read-only MCP inbox veya agent
  mesajı karar yüzeyi değildir.
- Cross-verification author provider'dan farklı provider ile yapılır; gerçek call +
  provider-reported usage + terminal settlement + durable receipt olmadan CONFIRMED denmez.
  `HOLD/UNCLEAR` closure değildir ve same-provider fallback yoktur.
- Private signer key repo dışındadır; okunmaz, loglanmaz, taşınmaz.
- MASTER/closure-ledger mutation yalnız kendi canonical authority/gate zinciriyle yapılır.
- Commit/push ancak owner talimatı ve landing ritüeliyle; hemen öncesinde `git branch -vv` ile
  HEAD drift doğrulanır.
- Generated exports elle edit edilmez; policy değil evidence projection'ıdır.

## 10. Kısa rapor şablonları

### Transferor — PREPARED

```text
HANDOFF PREPARED (<handoffId>, proposed epoch <N>)
- From: <host/provider/exact-model/role digests>
- To: <host/provider/exact-model/role digests>
- Scope: <outcome + run + includes/excludes>
- Trigger: <reasonCode + authorityRef>
- Receipt: <path + sha256>
- Live work: <disk-backed summary>
- Pending approvals/HOLD: <exact list>
- Recommended next action: <one action>
- Authority now: TRANSFEROR (COMMITTED henüz yok)
```

### Transferee — VERIFIED veya HOLD

```text
HANDOFF VERIFIED|HOLD (<handoffId>, proposed epoch <N>)
- Identity/digest/epoch: <verified or exact mismatch>
- Repo/runtime/approval/build/SSOT: <reconciled summary>
- Receipt: <path + sha256, if VERIFIED>
- Missing authority/evidence: <none or exact list>
- Mutation started: NO
```

### Transferee — authority kabulü

```text
EXECUTION_AUTHORITY ACCEPTED (<handoffId>, epoch <N>)
- Commit receipt: <path + sha256>
- Active executor: <host/provider/exact-model/role digests>
- Open actions: <first 3>
- First action: <one action + reason>
- HOLD: <none or exact blocker>
```

## 11. Bakım ve staleness

Bu dizindeki tek canonical handoff prosedürü bu dosyadır. Yön-spesifik `for-*`/`to-*`
kopyaları oluşturulmaz. Provider/model/host örnekleri normative routing'e dönüşemez; runtime
identity ve effective config her devirde yeniden çözülür.

Operating policy, receipt base schema veya repo authority yolları değişirse bu belge aynı
değişiklikte güncellenir ve Alperen'e tek satır staleness raporu verilir. Belge ürün runtime'ında
otomatik fencing, distributed lease veya transactional authority store sevk edilmiş gibi iddia
edemez; böyle bir özellik ayrı owner-admitted product outcome ve production-wiring proof ister.
