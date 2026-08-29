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

1. `4030 OPERATION-001` kapanış-adayı DEĞİLDİR: güncel ratchet 742 effect site / 2 mediated /
   740 unmediated gösterir. Önce gerçek user action'ları ile onları izleyen internal write/tool
   effect'leri code-truth üzerinden ayrıştır; ortak operation/permission ingress'ine bağlanacak
   parçaları bağımsız owner-admitted child outcome'lara böl ve DAG'ı yetkili biçimde güncelle.
2. Bu child outcome'ları tek tek gerçek product wiring + live proof ile kapat; 4030 ancak bütün
   kabul yüzeyi gerçekten mediated olduğunda authenticated disposition alabilir.
3. `4030` gerçekten terminal olduktan sonra `3010 KERNEL-ONTOLOGY-001`, ardından
   `3020 KERNEL-STATE-001` ayrı dependency-valid dogfood outcome'larıdır.
4. `3030` öncesi `4000 AUTHORITY-001` aggregate kenarını code-truth ile çöz: minimum attempt
   authority ayrı canonical leaf ise authenticated DAG amendment; değilse 4000'in gerçekten
   zorunlu dependency zinciri önce kapanır. Aggregate parent sahte DONE yapılmaz.
5. `3030 KERNEL-ATTEMPT-001`; ardından ölçülmüş Dalga 2 ve Dalga 3 sırası.
6. Her outcome: exact capsule/file authority → Goal/Mission/Flow/Run/Do → terminal settlement →
   local scoped + real-binary proof → authenticated MASTER projection. Remote CI advisory'dir.

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
