# GEÇİCİ AKIŞ — TEK AKTİF İMLEÇ

> Bu dosya yalnız kısa-vade yürütme sırasıdır. İş ve closure SSOT'u
> `docs/MASTER-PLAN.md`; authority receipt'leri `docs/execution/handoffs/` altındadır.
> Tüketilen plan bu dosyadan çıkarılır; ayrı tamamlanmış follow-up belgesi tutulmaz.

## Authority ve repository durumu — 2026-08-29

- Execution authority: Codex epoch 4; handoff `ah-2026-08-29-codex-takeover-3` COMMITTED.
- Mode: `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Skill landing commit: `b38b5c3a1b2c407d7daeb2780315a8626c4e36d8`
  (`fix(orchestration): close dogfood re-entry control-plane blockers`). Akış sadeleştirmesi
  ayrı bir dokümantasyon commit'idir.
- Local `main`, `origin/main`den iki commit ileride; push owner talimatı olmadan yapılmaz.
- Aktif sprint/run yok. Kullanıcının MASTER/runtime/generated-doc değişiklikleri unstaged korunur.

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
- MASTER 9034/9035/9036/9037/9053 zaten outcome kimliğini taşır. Owner-authenticated
  projection/settlement töreni dışında elle state/evidence mutation yapılmaz.

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

## Sıradaki outcome adayları — aynı anda yalnız biri admit edilir

### 1. Kernel-tree closure — Dalga 0 sonrası owner karar noktası

Aktif karar taşıyıcısı: `follow-up-works/kernel-tree-closure-map.md`. Owner 2026-08-28'de
Seçenek 2'yi seçti ve Dalga 0 tamamlandı; fresh ölçüm formal turun ağacı küçültmediğini,
yaklaşık 16 non-DONE düğümlü derin DAG kaldığını gösterdi. Sıradaki material seçim: tam kernel
programını Dalga 1-3 ile yayın öncesi sürdürmek veya yayın kapısını replay-kanıt hattına
daraltmak. Owner bu post-Dalga-0 seçimi yapmadan source/run mutation yok. Seçim sonrası sıra:

1. MASTER `DependsOn` ağını fresh disk ölçümüyle yeniden sabitle.
2. Seçilen dalganın exact outcome/capsule, file authority ve verification manifestini yaz.
3. Dependency sırasıyla tek outcome dogfood run'ları yürüt; her dalgayı terminal settle et.
4. Local scoped proof + real-binary proof üret; remote CI advisory/askıda olarak ayrı raporla.
5. Canonical projection/owner receipt töreniyle VERIFY/DONE geçişlerini uygula.
6. Kernel kapısı kapanınca yayın zincirini yeniden ölç; varsayımla flip yapma.

### 2. MASTER 6181 dilim-3

Kernel owner sırasına göre: capability kaydı, Goal-v2 günlük 09:00 Europe/Istanbul schedule,
`deckent intelligence` CLI, EN/TR docs ve gerçek-binary kapanış. Dilim-1/2 landed; retained
`DIRECTIVES.md` dilim-2 metnidir ve yeni run authority'si olarak yeniden kullanılmaz.

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
