# GEÇİCİ AKIŞ — TEK AKTİF İMLEÇ

> Bu dosya yalnız kısa-vade yürütme sırasıdır. İş ve closure SSOT'u
> `docs/MASTER-PLAN.md`; authority receipt'leri `docs/execution/handoffs/` altındadır.
> Tüketilen plan bu dosyadan çıkarılır; ayrı tamamlanmış follow-up belgesi tutulmaz.

## Authority ve repository durumu — 2026-08-29

- Execution authority: Codex epoch 4; handoff `ah-2026-08-29-codex-takeover-3` COMMITTED.
- Mode: `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Skill landing commit: `b38b5c3a1b2c407d7daeb2780315a8626c4e36d8`
  (`fix(orchestration): close dogfood re-entry control-plane blockers`); akış sadeleştirmesi
  `2389c2e97`; run-policy recovery `bd65aa340`.
- Local `main`, `origin/main`den ileride; exact ahead sayısı `git branch -vv` ile ölçülür.
  Push owner talimatı olmadan yapılmaz.
- Aktif sprint/run yok; son authority `sprint-708 / ABORTED`, admission readiness `READY`.
  Kullanıcının MASTER/runtime/generated-doc değişiklikleri unstaged korunur.

## Kapanan recovery — RUN-POLICY-HEADER-PARITY

`DOGFOOD_HEALTH=DEGRADED` ilan edilerek ADR-D-007 bounded recovery seam'inde kapatıldı; yeni
ürün outcome'u açılmadı. Deterministik DIRECTIVES generator canonical
`## Execution Contract` başlığını üretir; production resolver heading case'ini authority
sınırı yapmaz. Canonical ve retained lowercase biçim aynı policy digest'ine çözülür.

- Commit: `bd65aa340` (`fix(policy): preserve directives execution contract authority`).
- Scoped proof: 4 suite / 43 test; hermetic gate 157/157; TypeScript 0; build exit 0;
  `lint:directives` 4 task temiz; gerçek compiled producer→consumer authority 4 constraint.
- `lint:gates` recovery alanını geçti; zincir yalnız mevcut unstaged MASTER/SPRINT kaynaklı
  README/README.tr/IDENTITY stats drift'inde durdu. Çalışmayan tail kapıları ayrı koşuldu ve
  yeşil. Recovery sonrasında `DOGFOOD_HEALTH=READY_IDLE`.

## Ayrı ADR-D-007 recovery kaydı — sprint-711 / MASTER 4031

**Observed at:** `2026-08-29T15:35:49+03:00`
**Authority:** Alperen'in canlı force-finalize + elle tamamlama talimatı; ardından
`scripts/lint-test-hermeticity.mjs` fingerprint projectionı, bu ayrı kayıt ve generated-stats
projectionları (`README.md`, `README.tr.md`, `.deckent/workspace/IDENTITY.md`) için verdiği exact
ek write authority. Bu kayıt `sprint-711` geçmişini veya MASTER dispositionını değiştirmez.

- Canonical run truth aynen korunur: `sprint-711 = ABORTED`, generation `6`, logical settlement
  digest `4f10272e5ddaedf889ccf315e743f91f3ac0f8aa3c673278c8ec977e55567b48`;
  `0 COMPLETE / 1 unresolved`. Run hiçbir yerde başarılı gösterilmez.
- Elle ürün kurtarması yalnız 4031'in üç product path'inde yürüdü:
  `scripts/audit-operation-ingress.mjs`, `scripts/operation-ingress-baseline.json`,
  `tests/scripts/audit-operation-ingress.test.ts`. Hermetic source-derived fingerprint değişimi,
  owner'ın ayrı yetkisiyle yalnız `scripts/lint-test-hermeticity.mjs` projectionında rebaseline
  edildi; enforcement/policy gevşetilmedi.
- Güncel ürün kanıtı: 17/17 targeted test; gerçek `--check` PASS; 5.205 semantic site,
  `covered=0`, `unmatched=5205`, `unclassified=0`, diagnostics `0`, digest `59f62753c2a2…`;
  canonical catalog digest `bc6072457740587658d8c17ff3d3ae4dec721ac911cb9599070327afddd7c8db`.
  Schema-2→3 migration comparative gate'i önceki her unmatched siteyi bire bir korudu; iki
  local-interface `callTool` false-positive'ı silinmeyip `UNVERIFIED_TOOL_ORIGIN` dispositionı
  ile ayrı excluded inventoryde taşındı.
- TypeScript (root + Dashboard) PASS; build exit `0`; hermeticity scan 2.972 dosya / 0 confirmed
  violation. Owner-authorized `npm run docs:stats` yalnız üç generated projectionı yeniledi;
  ardından tam `npm run lint` bütün gate'lerle exit `0` verdi. Ürün kontratı
  `LOCAL_VERIFIED`; canonical run truth hâlâ `ABORTED` ve authenticated MASTER dispositionı
  uygulanmadı.
- Runtime quiescent: active sprint/coordinator/worker/container yok; `/tmp/operation-ingress-*`
  fixture kalıntısı yok. `sprint-711` cleanup uygulanmadı ve arşiv/terminal receipt korundu.

4031'e karıştırılmayan, ayrı admission bekleyen engine defect kayıtları:

1. Worker `.result` kanıtı result-acceptance katmanında kayboldu; dört gerçek attempt'ın doğru
   product claim'i terminal settlement'a taşınmadı.
2. Brain/process liveness kararı canlı/bitmiş iş ayrımını yanlış kurarak false-death/NO_GO üretti.
3. Repair zinciri bounded attempt ceiling olmadan dört gerçek FIX'ten sonra geçersiz beşinci
   task kimliği üretti; beşinci attempt hiç dispatch edilmedi ve result taşımıyor.
4. Scope/work-attribution ölçümü gerçek üç-file diff mevcutken `filesChanged=[]`/mismatch benzeri
   çelişkili projectionlar üretti; sentetik ölçüm disk truth'ün yerine kullanılamaz.

Bu dört finding otomatik MASTER admissionı, yeni ürün işi veya 4031 acceptance parçası değildir.
Commit/push, XVerify, cleanup ve authenticated MASTER/Closure OS disposition yapılmadı.

## Kapanan outcome — SKILL_ROUTING_CONTROL_PLANE_P0

**Disposition:** product contract `CLOSED / LOCAL_VERIFIED`; global provider runtime finding'i
ayrı `DEGRADED` kalır. Owner 2026-08-29 canlı kararıyla XVerify bu closure için beklenmez ve
zorunlu değildir; mevcut HOLD receipt'leri saklanır, tekrar çağrı yapılmaz.

Kapanış kanıtı:

- Exact landed diff: 71 dosya, `+6470/-466`,
  `sha256:924cc323f5967852418b431a13f889d6361e1d6192b4bef45de8d025ec390ac2`.
- Land öncesi ve root-main doğrulaması: TypeScript 0; P0 battery 21/21 suite,
  274/274 test; `lint:gates` 24/24; `build:all` exit 0; i18n ve confirmed hermetic ihlal 0.
- Son closure battery: 6/6 suite, 44/44 test — retry/FIX logical projection,
  causal attribution, MCP run parity, 1000-skill + 32-caller determinism.
- Legacy cutover: `READY -> COMMITTED -> ALREADY_APPLIED`; 41 skill ID, 41 history ID,
  356 synergy row, 7 evolved skill rule ve 31 sidecar skill digest-bound quarantine'a taşındı.
  Aktif legacy inventory artık beş alanda da 0.
- Canary `run-1787984570037-0` ve `run-1787984690996-0`: yalnız
  `typescript-expert` assigned+delivered; `python-expert` durable journal'da
  `required-evidence-missing`. Mixed dizindeki sibling `.py`, explicit `.ts` task evidence'ını
  genişletmedi. İki invocation canonical `already-settled / NOT_DISPATCHED`.
- MASTER 9034/9035/9036/9037/9053 zaten outcome kimliğini taşır. Owner'ın 2026-08-29
  canlı yetkisiyle yalnız landed evidence aktarılmıştır; state/truth/priority/dependency
  değiştirilmemiş ve Closure OS disposition/sidecar ledger yüzeyine dokunulmamıştır.

Kapsam-dışı kayıtlar — otomatik implement edilmez:

- Provider dispatch `budget_capability_unsupported`: measured streaming usage taşımayan
  executor provider work'ü spawn öncesi blokluyor. Skill selection/delivery bundan önce
  gerçekleşti; bu, ayrı runtime capability finding'idir.
- Task raw projection `PENDING`, canonical receipt `NOT_DISPATCHED`; `--reproject-status`
  `terminal-conflict` HOLD verdi. Receipt authoritative; projection kusuru ayrı admission ister.
- XVerify: Claude gerçek çağrı `UNCLEAR/HOLD`; Cursor Grok 4.6 xhigh tier-admitted fakat
  `account_authority_hold` nedeniyle çağrı öncesi `unavailable/HOLD`. Owner kararıyla bekletildi.
- Full-suite Tinypool `ERR_IPC_CHANNEL_CLOSED` sonucu `INCONCLUSIVE/RUNNER_CRASH`; scoped
  verification'ı bozmaz ve bu outcome'da tekrar koşulmaz.
- O5 CLI-contract/alias dilimi karantinadadır: contract 64->0 ölçümü gerçek, scoped battery
  terminal yeşil değildir. Ayrı owner-admitted outcome olmadan uygulanmaz.

## Sıradaki outcome sırası — aynı anda yalnız biri admit edilir

### 0. Skill closure canonical projection — tamamlandı

MASTER validator temizdir: 543 satır, 458 aktif, 85 DONE, 13 blocker class; projectionlar
in-sync. Owner'ın 2026-08-29 canlı yetkisiyle landed skill kanıtı exact
9034/9035/9036/9037/9053 satırlarına evidence-only aktarılmıştır. Beş satır dependency'leri
nedeniyle OPEN kalır; state, truth, priority ve `Depends On` alanlarında değişiklik yoktur.
Projection source digest'i
`a607476660334739b4769445cb2b9e6104e761963f49169699c87a0cc25aabc4`'tür. Bu aktarım
terminal disposition, GR receipt veya Closure OS sidecar-ledger mutasyonu değildir.

### 1. Kernel-tree closure — full-product yönü

Aktif karar taşıyıcısı: `follow-up-works/kernel-tree-closure-map.md`. Owner 2026-08-28'de
Seçenek 2'yi seçti ve Dalga 0 tamamlandı; fresh ölçüm formal turun ağacı küçültmediğini,
yaklaşık 16 non-DONE düğümlü derin DAG kaldığını gösterdi. Owner 2026-08-29 canlı yönü:
ürünü tamamlayarak ilerle; release-only daraltma yapılmaz. Faz isimleri dependency authority
değildir: 3010 doğrudan 4030'u, 3030 ise 3020 ve aggregate 4000'i bekler. Yürütme sırası:

1. `4030 OPERATION-001` owner-admitted child DAG'a ayrıldı (Alperen, 2026-08-29). Canlı audit
   742 effect site / 2 syntactically-mediated / 740 unmediated gösterir; iki mediated işaret gerçek
   transaction/permission kanıtı değil, file-level false-positive'dir. 4030 yalnız stable operation
   identity, fail-closed resolution, invocation/transaction context ve causal effect attribution
   üretir. Allow/deny + enforcement `4040 CAPABILITY-001`; approval authority
   `4050 APPROVAL-001` kapsamıdır ve dependency yönü tersine çevrilmez.
2. Foundation sırası: `4031 COVERAGE-MODEL` → `4032 CATALOG-CONVERGENCE` →
   `4033 INVOCATION-CONTEXT` → `4034 EFFECT-CONTEXT`. Registry binding child'ları 4035–4038,
   ilgili ingress propagation child'ları 4039 ve 4041–4045'tir. Runtime/governance/catalog-support
   effect migrationı file-collision nedeniyle 4046→4047→4048→4049 sırasıyla tek yazıcı yürür.
   `4057 CLOSURE-CONFORMANCE` bütün children terminal olmadan başlayamaz; parent 4030 ancak
   4057 gerçek cross-surface proof ürettikten sonra authenticated disposition adayıdır.
3. Her child: exact capsule/file authority → Goal/Mission/Flow/Run/Do → terminal settlement →
   local scoped + gerekli real-binary proof → tek bağımsız read-only analysis checkpoint →
   authenticated MASTER projection. Remote CI advisory'dir; aynı kanıtla audit tekrarlanmaz.
4. **Owner-approved transition cleanup (2026-08-29):** her terminal child ile sıradaki child
   arasında önce active sprint/worker/settlement olmadığı disk + CLI ground truth ile doğrulanır;
   sonra yalnız resmi `deckent cleanup` yüzeyiyle terminal ve cleanup-eligible `.tasks` state'i
   temizlenir. `rm .tasks/*` kullanılmaz; canlı/belirsiz state, durable receipt/evidence,
   handoff artefaktı ve `.brain/memory.db` korunur. Cleanup sonrası readiness yeniden ölçülür;
   herhangi bir authority/evidence kaybı veya canlı state varsa typed HOLD ile durulur.
5. `4030` gerçekten terminal olduktan sonra `3010 KERNEL-ONTOLOGY-001`, ardından
   `3020 KERNEL-STATE-001` ayrı dependency-valid dogfood outcome'larıdır.
6. `3030` öncesi `4000 AUTHORITY-001` aggregate kenarını code-truth ile çöz: minimum attempt
   authority ayrı canonical leaf ise authenticated DAG amendment; değilse 4000'in gerçekten
   zorunlu dependency zinciri önce kapanır. Aggregate parent sahte DONE yapılmaz.
7. `3030 KERNEL-ATTEMPT-001`; ardından ölçülmüş Dalga 2 ve Dalga 3 sırası.

### 2. MASTER 6181 closure residual

Dilim-1/2 ve sprint-707 dilim-3 landed/HOLD: Goal-v2 schedule, `deckent intelligence` CLI,
EN/TR docs ve fail-closed gerçek-binary yüzey mevcut. Açık tek üretim zinciri,
`interpretSource` seam'inin canonical implementation + capability binding + uçtan uca watch
run kanıtıdır; bu olmadan 6181 DONE olmaz. Retained `DIRECTIVES.md` dilim-2 metnidir ve yeni
run authority'si olarak yeniden kullanılmaz.

### 3. Flip-merdiveni ve yayın zinciri

3302/3304/3299 dependency sırası + 3300/3301 owner receipt töreni. Ardından yalnız ayrı owner
admission ile 3356 P6/P7.

### 4. Ayrı karar taşıyıcıları

- `follow-up-works/cli-surface-reform-karar.md`: açık CLI reform/O5 kararları.
- `follow-up-works/verhex-transition-plan.md`: açık package/repository transition kararları.

## Sabit yürütme contractı

`owner admission -> inventory -> measured DAG -> Deckent Goal/Mission/Flow/Run/Do -> terminal
settlement -> scoped tests/typecheck/gates -> real-binary proof -> canonical MASTER projection`

- Başka outcome finding'i otomatik kapsam genişletmez.
- `.brain/memory.db` silinmez; `.tasks` elle temizlenmez; sprint sırasında build/auth mutation yok.
- Canlı execution owner onayı olmadan kill/cleanup edilmez.
- Commit/push öncesi `git branch -vv`; push/publish yalnız owner talimatıyla.
