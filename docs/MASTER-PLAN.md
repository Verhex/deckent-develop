# Deckent — Canonical Master Plan

**Son uzlaştırma:** 2026-07-26

**Reconciliation base:** `51c68774dfd528d1df7b9649cebc3b22f1092980`

**Önceki planın lossless arşivi:** [`docs/archive/MASTER-PLAN-archived-2026-07-26.md`](archive/MASTER-PLAN-archived-2026-07-26.md)

**Arşiv SHA-256:** `d6a90fc085a5bb7f62804d391840e399f669d4ec4cb67c7214e3480e731333e1`

> **SSOT:** Deckent'in tek yazılabilir iş-planı otoritesi bu dosyadır. `DIRECTIVES.md` yalnız
> seçilen execution slice'ın geçici projection'ıdır. Analysis, handover, specification,
> retrospective, memory ve evidence belgeleri yeni iş saklayamaz; yürütülebilir her residual
> aynı gün burada atomik bir Work ID olarak yer alır.

`scripts/lint-master-plan.mjs` ve `docs/generated/master-plan-active.*` yalnız repository-internal
governance/developer projection'ıdır; product Terminal/Desktop/API yüzeyi değildir.
`docs/.vitepress/config.ts` bu projection'ları public docs build'inden dışlar ve
`tests/docs/vitepress.test.ts` sınırı regression-gate eder. Stable English diagnostic/reader
vocabulary product'a açılmadan `FO-10-I18N` ve `DOCS-I18N-001` message/locale authority'sine
taşınır.

## 1. North Star ve bitiş sözleşmesi

Deckent; solo kullanıcıdan dünyanın en büyük kurumlarına kadar aynı çekirdeği kullanan,
provider-neutral, local-first ve every-environment bir Agent OS'tur.

- **Core:** Goal → Mission → Flow → Run → WorkItem → Attempt → Operation zincirinin tek authority'si.
- **Terminal:** ana yönetim ve kullanım yüzeyi; tool-driven, progressive-disclosure, tam kontrol ve düşük bilişsel yük.
- **Desktop:** aynı application-service authority'sinin birinci sınıf, native operator yüzeyi.
- **API ve connectors:** aynı use-case'lerin versioned, identity-bound adapter'ları.
- **Dashboard:** observability projection; ikinci execution engine veya ikinci state authority değildir.
- **Providers:** host-custodied, policy-bound ve değiştirilebilir execution resources; worker credential taşımaz.
- **Learning:** outcome → evidence → routing → promotion → training trace döngüsü kapalı ve denetlenebilirdir.

Bir program ancak uygulanabilir boyutlarının tamamında aşağıdaki zincir kanıtlandığında `DONE` olur:

`code-present → wired-all-ingresses → enabled-by-policy → hermetic-proven → live-proven → cross-platform-proven → scale-proven`

Deckent için bu planın release-completion koşulları:

1. Açık veya sahipsiz P0/P1 kalmaz; her iş `DONE` ya da Alperen'in gerekçeli `DISPOSED` kararıdır.
2. Silent fallback, silent degradation, unbound authority, credential exposure ve unowned debt sıfırdır.
3. Linux, macOS, Windows native, Windows WSL, Docker ve declared remote/Kubernetes matrisinin her hücresi `SUPPORTED`, `DEGRADED` veya dürüst `UNSUPPORTED` sonucuna sahiptir.
4. Terminal, Desktop, API, CLI, MCP, autonomous, process ve connector yüzeyleri aynı canonical services ve authority'leri tüketir.
5. Her user-facing string i18n authority'sinden gelir; erişilebilirlik ve altı dil doküman sözleşmesi release gate'tir.
6. Security, durability, cancellation, crash recovery, audit, tenancy, SLO ve load/chaos kanıtları vardır.
7. Publish ve global default flip yalnız owner-approved release gate ile yapılır.

Milyar kullanıcıya erişmek bir adoption outcome'udur; bu planın sonlu mühendislik taahhüdü,
o ölçeğe uygun architecture, governance ve measured assurance üretmektir.

## 2. Karar önceliği ve değişmez sınırlar

Çelişkide sıra:

1. Alperen'in en yeni açık kararı.
2. `AGENTS.md` immutable laws ve operating rules.
3. Accepted global ADR'ler.
4. Current code, disk, binary ve provider evidence.
5. Bu MASTER'daki canonical outcome.
6. Handover, analysis ve historical plan iddiaları.

2026-07-26 provider kararı:

- Brain, Worker, chat ve native provider yönü **Codex**.
- Supervisory session **GPT-5.6 Sol**; runtime role-model matrisi exact ID ve live entitlement ile ayrıca kanıtlanır.
- Claude/Gemini bağımsız verifier veya açık fallback adayı olabilir; ana provider değildir.
- Same-provider verification bağımsız kanıt sayılmaz.
- Config flip, code/wire/live proof yerine geçmez.

Destructive ve external-state işlemlerinde eski onay yeni disk şekline taşınmaz:

- `G0 READ` — salt-okunur keşif.
- `G1 FILE` — exact file manifest ve baseline hash owner'a sunulur; fresh owner approval
  alınmadan sprint, agent veya supervisor hiçbir write yapmaz. Hash ya da scope drift'inde onay düşer.
- `G2 DECISION` — agent yalnız proposal ve evidence üretir; superseded, approved-unexecuted
  veya negative-space kararını değiştirmek fresh owner decision receipt gerektirir.
- `G3 DESTRUCTIVE` — `G1` exact manifest/baseline şartlarını da içerir; exact destructive
  target, recovery planı ve fresh owner onayı eklenir.
- `G4 DB` — `G1` exact manifest/baseline şartlarını da içerir; backup hash, exact SQL diff,
  transaction/integrity proof, rollback ve fresh owner onayı eklenir.
- `G5 REMOTE` — branch/worktree/remote ancestry raporu ve fresh owner onayı; accompanying
  local file mutation varsa ayrıca `G1` gerekir.
- `G6 MEMORY-LAW` — kalıcı memory kuralı veya index değişimi için özel owner onayı;
  filesystem/DB mutation'ı sırasıyla `G1`/`G4` şartlarını da taşır.
- `G7 LIVE_PROVIDER_CALL` — her paid veya external live provider attempt'i için ayrı,
  expiring ve single-use owner receipt'i. Provider, surface, binary version, exact model,
  auth/account class, tenant/project/task/attempt, prompt/data class, tools, filesystem/network
  authority, max wall clock, explicit authorization TTL, policy-digest-bound canonical budget
  quantity, fallback policy ve kill/rollback authority bağlanır.

Canlı sprint Alperen onayı olmadan kill/cleanup edilmez. `.brain/memory.db` silinmez.
Shared worktree'de her edit öncesi exact file collision guard, commit öncesi `git branch -vv` zorunludur.

## 3. Ledger contract

### 3.1 State

- `OPEN` — outcome tanımlı; henüz admission almamış.
- `READY` — dependency ve gate'leri sağlanmış; execution slice'a alınabilir.
- `IN_PROGRESS` — owner/agent ve attempt atanmış.
- `BLOCKED` — typed blocker ve remedy kayıtlı.
- `VERIFY` — implementation iddiası var; gereken proof zinciri tamamlanmamış.
- `DONE` — acceptance ve gerekli truth boyutları evidence ile kapanmış.
- `DEFERRED` — gerekçeli ve review tarihli erteleme.
- `DISPOSED` — Alperen'in gerekçeli, tarihli negative-space kararı.

### 3.2 Truth

`Truth` hücresi sırasıyla `C/W/E/H/L/X/S` taşır:

- `C` — code or governed artifact present.
- `W` — all declared ingress/consumer paths wired.
- `E` — policy/config makes it effective.
- `H` — hermetic or provider-free proof passed.
- `L` — real binary/provider/user journey proven.
- `X` — declared cross-platform matrix proven.
- `S` — load/scale/HA threshold proven.

- `1` kanıtlandı.
- `0` yok.
- `~` partial.
- `?` ölçülmedi.
- `-` outcome için uygulanamaz.

Örnek: `1/1/0/?/0/?/?` code-present ve wired, fakat enabled/live değil demektir.

### 3.3 Satır invariants

- Bir satır bir kapanabilir outcome taşır.
- `Updated` real ve validator'ın UTC as-of gününden ileri olmayan `YYYY-MM-DD` tarihidir;
  published registry'ye göre geriye alınamaz. Priority/state/truth/evidence/blocker authority
  eski bir günde değişip `Updated` sabit bırakılamaz; aynı UTC günündeki değişiklikler bu
  date-granularity alanında birlikte review edilir ve commit/audit event sırası ayrı authority'dir.
- `ID` immutable ve tekildir; dependency yalnız ID ile kurulur.
- Generated JSON projection schema-v3 tüm Work identity/state/terminal-closure ve receipt/G7
  attempt kimliklerini authority registry olarak taşır; normal `--check/--write` önceki tracked
  registry'den silme, reorder, definition drift, invalid state transition, terminal proof rewrite
  veya receipt replay'i reddeder. Runtime bootstrap/bypass flag'i yoktur; missing/corrupt registry
  version control'den exact restore edilir. Schema migration yalnız ayrı reviewed code version'ı,
  exact prior digest ve owner receipt'iyle yayımlanır. Bu tracked projection bir runtime
  tamper-evident journal değildir: source+projection'ın aynı patchte rewrite edilmesine karşı
  trust anchor reviewed Git parent/CI protection'dır; signed/append-only runtime settlement
  `KERNEL-SETTLEMENT-001`, `AUDIT-001` ve `RECEIPT-001` kapsamındadır.
- `Parent`, canonical Work ID veya §5'teki `P00`–`P10` program node'udur. Program parent'ı
  yalnız grouping taşır. Canonical Work ID parent'ı child execution'ını bloke etmez fakat
  aggregate closure edge'i üretir: doğrudan child'ların tamamı `DONE`/`DISPOSED` olmadan
  parent `READY`, `DONE` veya `DISPOSED` olamaz.
- `DONE` satırında residual veya “KALAN” bulunamaz; yeni child açılır.
- `DONE` Truth yalnız `1`/`-` taşır, en az bir `1` içerir ve Evidence'ta exact functional
  `` `proof=<stable-id>` `` token'ı bulunur. Mutation işi ayrıca scope-exact ve `consumed` receipt taşır;
  receipt izin provenance'ıdır ve tek başına outcome proof değildir.
- Evidence receipt referansı yalnız exact backticked `` `receipt=GR-YYYY-MM-DD-...` `` token'ıdır.
  Raw GR ID, negated prose veya serbest metin mutation authority üretmez.
- Historical mutation provenance tek token'dır:
  `` `historical-authority=<non-placeholder-id>;historical-gates=<G-list>;proof=<stable-id>` ``.
  `historical-gates`, satırın tüm non-`G0` gate'lerini kapsar; yalnız `VERIFY` revalidation claim'i
  olabilir, yeni write yetkisi veya `DONE` closure üretmez.
- `DEFERRED` Evidence grammar'ı
  tam ve yalnız `reason=<non-empty>;review-date=<real future YYYY-MM-DD>`; `DISPOSED`
  grammar'ı tam ve yalnız
  `owner-approved=<non-empty>;decision-date=<real non-future YYYY-MM-DD>` ile satırı+`G2`yi
  kapsayan tek owner-approved `` `receipt=GR-...` `` token'ıdır. Unknown/unkeyed/contradictory
  segment closure authority'sini geçersiz kılar.
- Evidence, neyi kanıtladığı kadar neyi kanıtlamadığını da belirtir.
- Historical `✅` bugünkü readiness'i otomatik kanıtlamaz.
- Program parent'ı child'ların yerine kapanmaz.
- Gate genişletme değildir; izin yoksa sonuç typed `HOLD` veya `BLOCKED` olur.
- `DependsOn` yalnız canonical ledger'da bulunan gerçek Work ID'leri taşır; `P00`–`P10`
  program etiketleri dependency yerine kullanılamaz.
- Dependency satisfaction yalnız `DONE` ile oluşur. Bir prerequisite `DISPOSED` edilirse
  dependent otomatik ready olmaz; edge için owner-reviewed replan/disposition gerekir.

Canonical satır şeması:

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|

### 3.4 Gate receipt contract

- `G0` salt-okunur iş için receipt gerekmez.
- `READY` veya `IN_PROGRESS` durumundaki mutation işi, Gate hücresindeki her non-`G0`
  gate için current ve scope-exact receipt taşır.
- `VERIFY`, execution admission değildir. Current mutation sonucu `VERIFY`'a alınmışsa
  Evidence ilgili receipt ID'sini taşır; yalnız historical/read-only audit ise yeni write
  yetkisi üretmez.
- `DONE`, scope-exact `consumed` receipt ve standalone functional proof olmadan mutation
  iddiası taşıyamaz; expired/revoked veya historical receipt execution provenance değildir.
- Receipt; Work ID'leri, exact target manifesti, baseline hash'i, owner kararını, kayıt
  zamanını, one-shot/expiry sınırını ve tüketim durumunu bağlar.
- MASTER içindeki bir `active` receipt, kendi receipt satırını veya MASTER mutation'ını
  self-authorize edemez; self-hash fixed point authority değildir. MASTER'ı kapsayan admission
  owner-approved immutable external grant/operation ledger'ından gelmek ve burada yalnız
  projection/settlement olarak görünmek zorundadır. Bu runtime authority
  `APPROVAL-001`, `RECEIPT-001` ve `KERNEL-SETTLEMENT-001` tamamlanana kadar ilgili execution
  `HOLD` kalır.
- Target token yalnız `` `<portable-repository-relative-path>@<raw-byte-SHA-256|ABSENT>` ``
  biçimindedir. Path NFC-normalized, `.`/`..`/empty segment içermeyen, Windows-reserved
  karakter/ad taşımayan ve receipt içinde portable case-fold altında tekil bir yoldur.
  Receipt SHA'sı dosyanın raw byte SHA-256'sıdır; generated view `sourceDigest`i ise yalnız
  checkout LF/CRLF farkını nötralize eden `sha256(normalized-lf-utf8)` algoritmasıdır.
- `Owner decision` canonical grammar'ı
  `owner=<non-placeholder-identity>;decision=APPROVED;scope=<exact-scope>;exclusions=<bounds>`;
  duplicate/empty/rejected alan receipt'i geçersiz kılar. `Recorded` ve `expiresAt` gerçek
  RFC3339 instant'larıdır; future-recorded veya expired receipt admission vermez.
- State yalnız `` `ONE_SHOT|EXPIRING`: active `` veya
  `` `ONE_SHOT|EXPIRING`: consumed|expired|revoked@<RFC3339> `` grammar'ıdır. Negation/prose
  substring'i lifecycle değildir; terminal timestamp `Recorded`, `expiresAt` ve current time ile
  tutarlı olmak zorundadır.
- `G7` receipt'i §2'deki live-call alanlarının tamamını ve exact canary stage claim'ini
  taşır; exactly one Work ID bağlar, `task` bu Work ID'ye eşittir ve ayrı canonical `stage`
  kimliği attempt aşamasını bağlar. Placeholder değer, unbounded
  `maxWallClock`/`authorizationTtl`, unknown/unkeyed segment veya aynı attempt identity'sinin
  tekrarı geçersizdir. External casing'den bağımsız provider/surface/model/auth/account,
  tenant/project/attempt ve policy değerleri lowercase canonical internal ID'ye çevrilmeden
  receipt'e giremez; Work task/stage ise canonical upper-kebab ID'dir.
  `maxWallClock <= authorizationTtl <= 7d` ve
  `expiresAt - Recorded = authorizationTtl` zorunludur. Budget
  `<positive-int64>@<canonical-unit>#<sha256-policy-digest>` grammar'ıyla unit/precision/limit
  registry'sini bağlar; bir stage'in receipt'i başka stage veya retry için kullanılamaz.
- Scope, baseline, Work ID, gate veya owner decision drift'i receipt'i otomatik geçersiz
  kılar. Bir receipt komşu dosyaya, sonraki sprinte, default flip'e, canlı provider çağrısına,
  push'a veya destructive adıma genişletilemez.
- Portable case-fold altında aynı target iki `active` receipt tarafından tutulamaz. Bir Work
  birden çok gate gerektiriyorsa target-overlap ayrı receipt katmanlarıyla değil, exact Work/scope
  için bütün gate'leri taşıyan tek receipt ile authorize edilir; consumed history collision sayılmaz.

Current receipt register:

| Receipt ID | Work IDs | Gate | Exact manifest and baseline | Owner decision | Recorded | State |
|---|---|---|---|---|---|---|
| `GR-2026-07-26-MASTER-01` | SSOT-001, SSOT-002, SOURCE-MANIFEST-001, LEGACY-RESIDUAL-AUDIT-001 | G1 | `docs/MASTER-PLAN.md@d6a90fc085a5bb7f62804d391840e399f669d4ec4cb67c7214e3480e731333e1` → byte-identical `docs/archive/MASTER-PLAN-archived-2026-07-26.md@ABSENT`; rebuild canonical MASTER; commit exactly these two paths | owner=Alperen; decision=APPROVED; scope=exact two-file isolated commit; exclusions=push,sprint,provider-call,destructive-action,other-files | 2026-07-26T16:59:02+03:00 | `ONE_SHOT`: consumed@2026-07-26T17:33:12+03:00 |
| `GR-2026-07-26-SSOT-003-01` | SSOT-003 | G1 | `docs/MASTER-PLAN.md@34d47c6e9adf7ee8a469acd3c152cea5959a8aed18311fb6e6434a55f9142457`; `package.json@0893f1a62582140d64782089197c8975061586bc4f46ee5dab8bcefe28dce067`; `scripts/lint-master-plan.mjs@ABSENT`; `tests/scripts/lint-master-plan.test.ts@ABSENT`; `docs/generated/master-plan-active.md@ABSENT`; `docs/generated/master-plan-active.json@ABSENT`; commit exactly these six paths | owner=Alperen; decision=APPROVED; scope=exact six-file isolated commit and Goal resume; exclusions=other-files,sprint,provider-call,build,push,destructive-action | 2026-07-26T18:12:21+03:00 | `ONE_SHOT`: consumed@2026-07-26T18:13:00+03:00 |
| `GR-2026-07-26-SSOT-003-02` | SSOT-003 | G1 | `docs/.vitepress/config.ts@a229c836a81df9ecf5296ce7e8991a12bc75da50fad0c2a5bcbe11ade4f28bd0`; `tests/docs/vitepress.test.ts@a1724114f27958758bf2e732ff29117a731973f17700fc62537bb0ef33dcc87f`; add both paths to the same isolated SSOT-003 commit as the exact eight-path union | owner=Alperen; decision=APPROVED; scope=exact two-file public-docs boundary expansion and Goal resume; exclusions=other-files,sprint,provider-call,build,push,destructive-action | 2026-07-26T20:22:25+03:00 | `ONE_SHOT`: consumed@2026-07-26T20:23:04+03:00 |
| `GR-2026-07-26-TEST-HERMETIC-01` | TEST-675, TEST-676, TEST-HERMETIC-001 | G1 | `scripts/lint-test-hermeticity.mjs@0d15d631ab62016564bac6288432eee86d900271da71db2b05b4cf62e0d8166c`; `tests/scripts/lint-test-hermeticity.test.ts@391438a85af7f9517e20fb5ddbf5f740174f12024c08909b9d41fba5abeb22f1`; `scripts/clean.mjs@e507db30a4ee6d33ad7452ac9cd5fc1c0cbe0f3dd63d507639638e8c9c6edd83`; `scripts/verify-publish.sh@1ff9be7224154df39e0eb81a121dae86961787a10849c5222a61e99f2f785d99`; `tests/scripts/scripts.test.ts@3ee353df17dc46bd37e09c4e484228b9d63c0e44e7d8fc9e4fb09202f9c8b039`; `tests/providers/openrouter.test.ts@01c01379924dc19b9e3d6aa38481ae32f1d5a43b57584979384c4a313b272977`; `tests/e2e/docker-backend.test.ts@ea45bec029e5e9dc658fb48718d1d646dec540482a69a76392efc7e445400da5`; `vitest.config.ts@cfc1846b90ffe0f32ef4d4beaa27525ed4b59fae277bedb7ea1e51b77de43396`; `vitest.dashboard.config.ts@64192dbbaea284c0133da03dd8bacdbc25b09a14258feb4600c6e09147ad3d82`; `vitest.desktop.config.ts@f76fa5e7380922fd3fdaaaa919d00288e61dfdcdcea5aa2a055a6af2666f6be2`; `docs/MASTER-PLAN.md@bf797236303b502cc2ba2207caae01fcc3fc5df47726891c5f9e41e1b8f84378`; `docs/generated/master-plan-active.json@1727937b7f67e74206854b980dac41be03a1d41296c5237130dcb66884167efb`; `docs/generated/master-plan-active.md@ab86c6c7f8b31f7358685e70beaa3e7bec42c58877c6d5b300d41488e797be94`; `tests/hermeticity/runtime-write-guard.ts@ABSENT`; `tests/hermeticity/worker-setup.ts@ABSENT`; `tests/hermeticity/global-setup.ts@ABSENT`; `tests/hermeticity/runtime-write-guard.test.ts@ABSENT`; `tests/hermeticity/global-setup.test.ts@ABSENT`; `tests/scripts/dist-clean-guard.test.ts@ABSENT`; implement TEST-675/676 hermeticity slice and commit exactly these nineteen paths | owner=Alperen; decision=APPROVED; scope=exact nineteen-file TEST-675/676 hermeticity implementation and isolated commit; exclusions=push,sprint,provider-call,build,destructive-action,other-files | 2026-07-26T22:12:04+03:00 | `ONE_SHOT`: consumed@2026-07-26T22:12:05+03:00 |
| `GR-2026-07-27-TEST-HERMETIC-02` | TEST-675, TEST-676, TEST-HERMETIC-001 | G1 | `scripts/ccverify-affected.mjs@02d8f4d85b796aa90f070f99d8cc20d1f6bdeebc7e8c8539f1f42abf4b9de952`; `scripts/validate-publish.mjs@1a91ec6ffa82e75f8f902b4dc12ff1e6f5502e92537c73803ddfcc422c823b30`; add both canonical direct-run guard fixes to the same isolated TEST-675/676 commit as the exact twenty-one-path union | owner=Alperen; decision=APPROVED; scope=exact two-file canonical direct-run guard expansion into the same isolated exact twenty-one-file commit; exclusions=push,sprint,provider-call,build,destructive-action,other-files | 2026-07-27T06:20:46+03:00 | `ONE_SHOT`: consumed@2026-07-27T06:21:00+03:00 |
| `GR-2026-07-27-TEST-HERMETIC-03` | TEST-675, TEST-HERMETIC-001 | G1 | `scripts/lint-test-hermeticity.mjs@65c303ac7c5c57c4c383d2dd56ccb8f87445dacbdb091ff40be3889f4ede1cda`; `tests/scripts/lint-test-hermeticity.test.ts@f72648ed2a95a88324316d568f10db3b4393fd0c252663acbb4728dc5c529ae3`; `docs/MASTER-PLAN.md@88c559c492bb7708558415503fe8d33bc0d40d580ea011f46500c405ee6d2c6e`; `docs/generated/master-plan-active.json@c14de8158856d20a5367bfb498259a94cb722889e437a447576372114c138b98`; `docs/generated/master-plan-active.md@6827cb3facf6da775d59ca5de43a6f25cab2b2f0756f56f16028515799f80310`; classify only zero-argument unshadowed ambient Map/Set/WeakSet allocations through retained SHA-ratcheted nonwriter contracts and commit exactly these five paths | owner=Alperen; decision=APPROVED; scope=exact five-file unresolved-reduction checkpoint, adversarial proof, MASTER projection and isolated commit; exclusions=push,sprint,provider-call,build,live-Docker,destructive-action,other-files | 2026-07-27T07:43:41+03:00 | `ONE_SHOT`: consumed@2026-07-27T07:43:41+03:00 |
| `GR-2026-07-27-TEST-HERMETIC-04` | TEST-675, TEST-HERMETIC-001 | G1 | `docs/MASTER-PLAN.md@4e77ec23544e8075172df96922aad014a361a38ddd219fb08efdf3e7d0d2b3c4`; `docs/generated/master-plan-active.json@e0162b850d9a79dd5691028e86d0f029287aeb28819a9507d903c004fb85395a`; `docs/generated/master-plan-active.md@473fef7f013ef8ffd6ba128d41569b3f97d14ce79eff7a364ecb7254817f5838`; preserve the consumed approval history, record independent rejection and full code/test rollback, regenerate projections, and commit exactly these three settlement paths | owner=Alperen; decision=APPROVED; scope=exact three-file NO_GO settlement, append-only receipt continuity, generated projections and isolated commit; exclusions=push,sprint,provider-call,build,live-Docker,destructive-action,other-files | 2026-07-27T08:20:57+03:00 | `ONE_SHOT`: consumed@2026-07-27T08:20:57+03:00 |
| `GR-2026-07-27-TEST-CONTAINMENT-01` | TEST-675, TEST-HERMETIC-001, TEST-CONTAINMENT-001 | G1 | `package.json@7e22f0a2b480d150ee679aef918fc5f9f60a2ad7b5dec77df5e3cc0fc161dd13`; `scripts/ci-sim-workspace.mjs@2318db8b0b3d07da053e661c566cb03fccd188a1b8c68ca80749e336add70641`; `scripts/ci-sim-state.mjs@47bc67a1cc58930e43023f2c27b9bedf6934e9a2604b148a249c9b312085bdde`; `scripts/lint-test-hermeticity.mjs@65c303ac7c5c57c4c383d2dd56ccb8f87445dacbdb091ff40be3889f4ede1cda`; `docs/MASTER-PLAN.md@12c120ea15e670df372676193a9ca92ed9810860789f3bb2d83cef70d05473c4`; `docs/generated/master-plan-active.json@82784f6de0de2ad027132f8dfc886db4e2255bfb0ef1bd19014a046d2b355d3f`; `docs/generated/master-plan-active.md@e9dec6e5f3407b2c436366ff7c78c2af9fed3d9b2ea268576453f8143fea0ab7`; `scripts/test-ci-sim-contained.mjs@ABSENT`; `scripts/hermeticity/containment-contract.mjs@ABSENT`; `scripts/hermeticity/containment-authority.mjs@ABSENT`; `scripts/hermeticity/containment-control-plane.mjs@ABSENT`; `scripts/hermeticity/containment-supervisor.mjs@ABSENT`; `scripts/hermeticity/process-bootstrap.mjs@ABSENT`; `scripts/hermeticity/node-permission-plan.mjs@ABSENT`; `scripts/hermeticity/owned-execution.mjs@ABSENT`; `scripts/hermeticity/dependency-projection.mjs@ABSENT`; `scripts/hermeticity/runtime-projection.mjs@ABSENT`; `scripts/hermeticity/adapters/linux-namespace.mjs@ABSENT`; `scripts/hermeticity/adapters/darwin-seatbelt.mjs@ABSENT`; `scripts/hermeticity/adapters/win32-appcontainer.mjs@ABSENT`; `scripts/hermeticity/adapters/wsl.mjs@ABSENT`; `scripts/hermeticity/adapters/oci.mjs@ABSENT`; `tests/scripts/test-contained-ci-sim.test.ts@ABSENT`; `tests/scripts/test-containment-contract.test.ts@ABSENT`; `tests/scripts/test-containment-authority.test.ts@ABSENT`; `tests/scripts/test-containment-bootstrap.test.ts@ABSENT`; `tests/scripts/test-containment-owned-execution.test.ts@ABSENT`; `tests/scripts/test-containment-dependency-projection.test.ts@ABSENT`; `tests/scripts/test-containment-runtime-projection.test.ts@ABSENT`; `tests/scripts/test-containment-adapters.test.ts@ABSENT`; `tests/scripts/test-containment-inventory-ratchet.test.ts@ABSENT`; `tests/e2e/test-containment-canary.test.ts@ABSENT`; implement the process-birth and OS/OCI containment foundation, E0/E1 adversarial proof, projection ratchet and isolated exact thirty-two-path commit | owner=Alperen; decision=APPROVED; scope=exact thirty-two-path containment foundation implementation, E0/E1 proof, dependency/runtime projection, MASTER projection and isolated commit; exclusions=push,sprint,provider-call,build,live-Docker,live-native-adapter,CI-workflow,config-cutover,Map-reduction,destructive-action,other-files | 2026-07-27T09:38:13+03:00 | `ONE_SHOT`: consumed@2026-07-27T09:38:13+03:00 |
| `GR-2026-07-27-TEST-CONTAINMENT-02` | TEST-CONTAINMENT-001 | G1 | `docs/design/test-containment-e2-authority.md@ABSENT`; `scripts/hermeticity/evidence/deterministic-cbor.mjs@ABSENT`; `scripts/hermeticity/evidence/cose-sign1-contract.mjs@ABSENT`; `scripts/hermeticity/evidence/measurement-contract.mjs@ABSENT`; `scripts/hermeticity/evidence/platform-evidence-policy.mjs@ABSENT`; `native/containment/protocol/containment-v2.cddl@ABSENT`; `tests/scripts/test-containment-deterministic-cbor.test.ts@ABSENT`; `tests/scripts/test-containment-cose-sign1-contract.test.ts@ABSENT`; `tests/scripts/test-containment-measurement-contract.test.ts@ABSENT`; `tests/scripts/test-containment-platform-evidence-policy.test.ts@ABSENT`; `tests/scripts/test-containment-protocol-vectors.test.ts@ABSENT`; `scripts/lint-test-hermeticity.mjs@ab9fa757a8c56b77584d17e82555e1d0cb54ea09e3917cbc9a8d6eae55923666`; `tests/scripts/test-containment-inventory-ratchet.test.ts@fc0d5daf679ad4ad2f18c6676f11f2f6cf9a9828652619ea37bde1f659e6ee55`; `docs/MASTER-PLAN.md@15c58a5e34ec39de8dad6468492cd94d8b0d58fc652b838c2d790fc35b0754af`; `docs/generated/master-plan-active.json@e3438e13e74ea04fecd7d3ebd1c6583e85769270d5b2a468dea15234ab1e1939`; `docs/generated/master-plan-active.md@75e62cf868f83cf6022376d9ff1ae11f78e65a4de8abeed1f1f5c52607acdfa3`; freeze the deterministic CBOR and COSE_Sign1 E2 measurement protocol, nine-phase receipt chain, stable HOLD taxonomy, every-environment trust policy, threat model, golden vectors and exact production inventory ratchet; keep production enrollment NOT_BORN | owner=Alperen; decision=APPROVED; scope=exact sixteen-path E2-R00 protocol/trust-policy receipt, Codex-main CLI one-shot dogfood with run-specific `.tasks/task-run-<id>.*` retained, GPT-5.6 Sol root review/manual repair, isolated commit, post-settlement build and Telegram bot stop/start; exclusions=push,live-Docker,live-native-adapter,CI-workflow,default-cutover,destructive-cleanup,other-files | 2026-07-27T13:29:48+03:00 | `ONE_SHOT`: consumed@2026-07-27T13:29:48+03:00 |
| `GR-2026-07-28-FILE-LOCK-01` | KERNEL-STATE-001, KERNEL-ATTEMPT-001 | G1 | `src/core/file-lock.ts@72ef6b0533ab71fffa7c36c61ad0707f09ba5d5c391048a4ecd771ca98acd724`; `tests/core/task-execution-fence.test.ts@36b58af322c2b41a2644d032ba7202038e3493ada4671e1f96a3c7db2d8dd00f`; `docs/MASTER-PLAN.md@7a47d1babce51c40e77acfd4570a351ffd810ca5afd159c4a98954f49ca94877`; `scripts/lint-test-hermeticity.mjs@9fed0f8db4cb850226c3a8553f9a14392a97fab9de6d7bd31734299e540f5139`; `docs/generated/master-plan-active.md@f54674b90b9fad501c7621b5d3ee600e39cd917e07278549b9a884fdc99c955c`; `docs/generated/master-plan-active.json@0c9c394c03febfbb7901abc9802e77dff49cc9ed1ee1c1d113a48503978584fb`; close the file-lock canonical-authority scale gap with bounded keyset reconciliation, O(1) projection lookup, exact ledger settlement and generated projections; commit and push exactly these six paths | owner=Alperen; decision=APPROVED; scope=exact six-file file-lock scale closure, mechanical hermetic ratchet, MASTER projection, isolated commit and origin/main push; exclusions=build,live-provider-call,destructive-action,other-files | 2026-07-28T14:33:28+03:00 | `ONE_SHOT`: consumed@2026-07-28T14:33:28+03:00 |

### 3.5 Typed blocker register

Her `BLOCKED` Work ID aşağıdaki `Work IDs` hücrelerinde tam bir kez bulunur. Remedy kuralındaki
`DependsOn`, ledger satırının exact dependency listesidir; `gate:G#` ise yeni owner receipt'ini
ifade eder. Dependency veya gate çözüldüğünde state otomatik `READY` olmaz: §3.1 ve §3.4
invariants yeniden doğrulanır.

| Blocker code | Work IDs | Remedy IDs / authority |
|---|---|---|
| `BASELINE_CONFLICT` | `TRUTH-BASELINE-001` | `TEST-675`, `TEST-676`, `TEST-HERMETIC-001` |
| `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | `STATE-PRUNE-001`, `DOCS-ARCHIVE-001`, `REPO-CLEANUP-APPLY-001`, `SCRIPT-RETIRE-001`, `TEST-ORPHAN-001`, `HOST-STATE-APPLY-001`, `GIT-MAINT-APPLY-001`, `P02-653` | exact `DependsOn` + `gate:G3` receipt |
| `FRESH_DB_APPROVAL_REQUIRED` | `MEMORY-DB-001` | exact `DependsOn` + `gate:G4` receipt |
| `FRESH_REMOTE_APPROVAL_REQUIRED` | `OPS-RETIRE-001`, `REPO-MIGRATION-001` | exact `DependsOn` + `gate:G5` receipt |
| `PROVIDER_INGRESS_HOLD` | `XVERIFY-WIRE-001`, `CODEX-ADMISSION-001`, `PROVIDER-INGRESS-001` | exact `DependsOn`; canonical composition must produce scoped `ALLOW` |
| `CODEX_ATTENDED_LANDING_BOUNDARY_ABSENT` | `FO-07` | exact `DependsOn`; unattended path remains typed `HOLD` |
| `CODEX_INCREMENTAL_CONTROL_ABSENT` | `IM-04` | exact `DependsOn`; next provider request preventable or typed `UNSUPPORTED` |
| `CODEX_DRIVER_INCOMPLETE` | `P02-642` | exact `DependsOn`; PAEP Worker Bridge/lease/settlement driver |
| `CONFIG_CUTOVER_INCOMPLETE` | `CODEX-MAIN-001`, `CM-01` | exact `DependsOn`; resolved all-ingress runtime truth |
| `OWNER_DECISION_REQUIRED` | `HUB-001` | exact `DependsOn` + `gate:G2` key-custody decision |
| `DEPENDENCY_UNSATISFIED` | `MEMORY-TRUTH-001`, `XVERIFY-TRUTH-001`, `DOC-IMPACT-001`, `DEBT-GOVERNANCE-001`, `HOST-STATE-001`, `GIT-MAINT-REPORT-001`, `IM-05`, `IM-06`, `IM-07`, `CODEX-CANARY-001`, `P01-TRUTH-GATE`, `CODEX-C0`, `CODEX-C1`, `CODEX-C2`, `CODEX-C3`, `CODEX-C4`, `CODEX-C5`, `CODEX-C6`, `CODEX-C7`, `CODEX-C8`, `CODEX-C9`, `CODEX-C10`, `P02-630`, `P02-648`, `P02-648-CODEX`, `P02-648-CLAUDE`, `P02-648-GEMINI`, `P02-651`, `P02-651B`, `P02-656`, `KERNEL-001`, `GOAL-CANARY-001`, `DO-CUTOVER-001`, `AUTONOMY-CUTOVER-001`, `SURFACE-CUTOVER-001`, `PLANNER-001`, `RESULT-INGEST-001`, `API-SECURITY-001`, `APPROVAL-QOL-001`, `TERMINAL-001`, `TERMINAL-AUTH-001`, `NATIVE-DEV-001`, `SURFACES-001`, `SURFACE-PARITY-001`, `ORPHAN-WIRE-001`, `DOCS-PRODUCT-001`, `RELEASE-001` | exact ledger `DependsOn` IDs |

## 4. Kaynak disposition kataloğu

| Kaynak | Rol | Current disposition | Supersession veya sınır |
|---|---|---|---|
| `docs/HANDOVER-CODEX.md` | Session-local untracked handover ve live evidence | `historical-source-ingested` | Codex Brain ve Claude Worker rol kararı 2026-07-26 Brain ve Worker Codex kararıyla superseded; source owner session tarafından ayrıca track edilmedikçe fresh clone authority değildir |
| [`.analysis/deckent-code-truth-audit-2026-07-26.md`](../.analysis/deckent-code-truth-audit-2026-07-26.md) | Current code-truth audit | `active-evidence` | Program P00–P10 gap setini besler; tracker değildir |
| [`PROVIDER-AUTHORITY-EXECUTION-PLAN.md`](../PROVIDER-AUTHORITY-EXECUTION-PLAN.md) | PAEP architecture ve execution specification | `canonical-spec` | P02 ledger'ı burada; specification status authority değildir |
| `docs/alperen-analysis/*` | Karar ve analiz geçmişi | `mixed-source; file manifest §4.1` | Delivered, approved-unexecuted, revalidate ve superseded ayrımı P00'da yönetilir |
| `.deckent/docs/core-memory/*.md` | Kalıcı user law ve feedback mirror'ı | `memory-authority-input; file manifest §4.2` | Work tracker değildir; provider-neutral authority P00-MEMORY altında kurulacak |
| [`docs/archive/MASTER-PLAN-archived-2026-07-26.md`](archive/MASTER-PLAN-archived-2026-07-26.md) | 324 legacy satır ve tüm chronology | `lossless-history` | Bu dosyadaki canonical ledger tarafından superseded; silinmez veya geriye dönük düzeltilmez |
| `.brain/memory.db` | Accepted ADR ve Brain knowledge | `db-authority` | Credential store veya work tracker değildir |

Reconciliation snapshot SHA-256:

- `docs/HANDOVER-CODEX.md` — `c49ad7885da95d174028b5228b26032bea89778a9236bf6cd0e91f9643c70e05`
  (`untracked`; digest ingestion authority verir, tracking authority vermez).
- `.analysis/deckent-code-truth-audit-2026-07-26.md` —
  `2f057c61ea32ccfdc4af2bcba4b23f42a3ae59d4506b99729056132f2885dfef`.
- `PROVIDER-AUTHORITY-EXECUTION-PLAN.md` —
  `3dfc6e5768d6d0d532ab8284fc60dd007777a5699860a9c11dcbef9c53805b7b`.
- `docs/archive/MASTER-PLAN-archived-2026-07-26.md` —
  `d6a90fc085a5bb7f62804d391840e399f669d4ec4cb67c7214e3480e731333e1`.
- `.brain/memory.db` mutable DB authority olduğu için file digest ile dondurulmaz; her claim
  revision/ADR/query evidence'ı ile okunur ve herhangi bir mutation `G4` gerektirir.

Historical classification:

- `historical-delivered` — commit ve current proof vardır; yeni iş açılmaz.
- `approved-unexecuted` — karar korunur, execution için current gate gerekir.
- `revalidate` — kaynak değerlidir; disk ve consumer graph yeniden ölçülür.
- `superseded` — uygulanmaz; replacement ID kayıtlıdır.
- `rejected-negative-space` — aynı hatanın yeniden önerilmesini önler.

### 4.1 Alperen-analysis source manifest

| Path | SHA-256 | Disposition | Canonical owners |
|---|---|---|---|
| `2026-06-19-dashboard-dead-area-inventory.md` | `2ab6cc4eac47fe2d2ad722ad579ac709a506f99058e7886b1b8ee72054a493cb` | `historical-delivered plus residual-revalidate` | DASHBOARD-OBS-001 |
| `2026-06-19-overnight-autonomous-report.md` | `f4999917b9110071562d236368eda26e1559dff521a59766a3466898f96bdd15` | `historical-delivered plus residual-revalidate` | LEGACY-RESIDUAL-AUDIT-001, AUTONOMY-CUTOVER-001, ROUTING-001 |
| `2026-07-21-analysis-arsiv-is-plani.md` | `b1656f110b925ce9a5c45256834e4399f95c2fee83b6144e0b7e956797b51500` | `approved-unexecuted; revalidate` | DOCS-TOPOLOGY-001, DOCS-ARCHIVE-001 |
| `2026-07-21-deckent-dizini-analiz.md` | `4f9aca0f743820db9390bb56cb84d31c8c48db1463bc5422c25948bb96bec1de` | `approved-unexecuted; remeasure` | STATE-RETENTION-001, STATE-PRUNE-001, TASK-RETENTION-001 |
| `2026-07-21-docs1-zorunlu-yol-sozlesmesi.md` | `6a3f8e95a382fd6b5009dca9656a2f15e9dc676059d90a71b3776e24ecb57374` | `revalidate; rename not presumed` | DOCS-TOPOLOGY-001, DOCS-PRODUCT-001 |
| `2026-07-21-dokuman-temizlik-karar-tablosu.md` | `58495ae5be6cf83e6f74916c227bbc9320071a30f3da8048bc33eb8beefb95e1` | `mixed decision source` | SSOT-002, REPO-CLEANUP-001, DOCS-I18N-001 |
| `2026-07-21-proje-kok-karar.md` | `edb31370d0305dee90b3ca0071385f8460b7d4533674c54dde5e599003cf2e64` | `approved-unexecuted; revalidate` | REPO-CLEANUP-001 |
| `2026-07-21-routing-v3-durum-ve-temizlik-analizi.md` | `03564a4864797a9951397a7e698abc3da644ed997d6dc03c08a44922f3383c22` | `partially-superseded` | ROUTING-001 |
| `2026-07-21-scripts-analiz.md` | `b8f2682205fb7104669fc361967924b950f2464a6f1faa3084b0439e59786c6f` | `revalidate` | SCRIPT-LIFECYCLE-001, SCRIPT-RETIRE-001 |
| `2026-07-21-tests-analiz.md` | `e78d66e045d2b05aeff7918fab1966a1f5674ffa0d9b8c2fb865888b4fc81eda` | `active evidence; counts drift-open` | TEST-HERMETIC-001, TEST-SPAWN-001, TEST-PLATFORM-001 |
| `2026-07-22-cevre-ve-kucukler-analizi.md` | `8e9c606c818d67e974fcca27ef1b0f2df2a466b67e30a63173ace0b128b4e52f` | `mixed; revalidate` | OPS-BRANCH-001, REPO-MIGRATION-001, RELEASE-001 |
| `2026-07-22-temizlik-gunu-plani.md` | `b957add1390ba0cde85715ee69332923293666cc68ce0100568948feccb3c4bd` | `approved-unexecuted; fresh gates required` | REPO-CLEANUP-001, STATE-PRUNE-001, MEMORY-DB-001, OPS-RETIRE-001 |

### 4.2 Core-memory source manifest

These files are memory inputs, not backlog rows. Any permanent change still requires `G6`.

| Path | SHA-256 | Disposition | Canonical owners |
|---|---|---|---|
| `MEMORY.md` | `e37bf190951d7ece509f7d4c9bf49f3e7c7939b1f2f97814d3a754acff11076e` | `index-drift; active input` | MEMORY-AUTHORITY-001, MEMORY-TRUTH-001 |
| `feedback_break_sprint_bug_cycle.md` | `015cfea19728ed830ebf3e85c636bc27e25a32d08fd8498122101d39af7ef24a` | `active law input` | DEBT-GOVERNANCE-001 |
| `feedback_code_plus_business_summary.md` | `ef318ef9fde18ef459e1fbc8f487cb4cc1009a33b45af2e610e3aaff98c66441` | `active law input` | MEMORY-AUTHORITY-001 |
| `feedback_explain_technical_terms.md` | `386d6fb53786e323ee5505cfde7256b6725f4f6f2b047b833d2d8159c3ddc952` | `active law input` | TERMINAL-ONBOARD-001, DOCS-PRODUCT-001 |
| `feedback_scale_up_autonomous.md` | `ae7528c68b36c3e6568544b113b17dccf9cdf937fdc339904f770716b5bfcbf5` | `capacity-drift; active input` | MEMORY-TRUTH-001, AUTONOMY-CUTOVER-001 |
| `feedback_vitest_16gb_local_cap.md` | `0cc239270c5c955dfce6cffd42a7ff4d0a03e208dbe890ffc91959cb8b2f3b8e` | `active law input` | TEST-HERMETIC-001, TRUTH-BASELINE-001 |
| `feedback_zero_hardcode_live_data.md` | `52bae43adeef55ffa43811178ed50c9b89cdf9c9502ce1026f31266bde54e0f3` | `active law input` | ZERO-HARDCODE-PROVIDER-001, ZERO-HARDCODE-FLOW-001 |
| `law_adr_inviolable.md` | `2cda894f28d4ab97baa8a8bc2cf66bd68c35a84faa4249d526e428b8de0012d6` | `active law input` | DOCS-ADR-SYNC-001, MEMORY-SYNC-001 |
| `law_alp_discipline_anchor.md` | `065531a9caf7529dab4dd544a5769fd7c147c539963d5065c84aca3759d3888a` | `active input; source file concurrently dirty` | ALP-RUNTIME-001 |
| `law_approval_gated_working_code.md` | `a78177a77235f776d44a62eabe946fe00f7daf0efea6a37465e2819973ec310c` | `active law input` | APPROVAL-001, EVALUATION-001 |
| `law_memory_vs_work_separation.md` | `a693fe858a8835535deae02adef6b0fb701bae50dad2cf7cbf1daa3af90d3f75` | `active law input` | MEMORY-AUTHORITY-001, SSOT-002 |
| `law_proof_blockers_brain_eval.md` | `3e0f1973e67525fb6e3eb861768c4c801a59e2ac4a71b042ccbac1ec078bfee1` | `active law input` | EVALUATION-001, DEBT-GOVERNANCE-001 |
| `law_scale_no_mvp_agentic_os.md` | `2d3bcb4abb93262b24b2aa76325eb25d7610722993cbaf4018523ff2605cfcaf` | `active law input` | SSOT-002, EVERY-ENV-001, SCALE-001 |
| `law_turkish_and_ssot.md` | `c6b7d80a8e9d16d449588b144dd38d6be93bfccac960e33962dab8bad238a0b9` | `active law input` | SSOT-002, DOCS-I18N-001 |
| `temp_sprint_prompt_quality_watch.md` | `4f84dd5ddde4b24ae49c212dbccb0bf4b9458b45d0395dffface660bc0b8ba15` | `expired-watch; owner disposition needed` | MEMORY-TRUTH-001, PROMPT-001 |

## 5. Program DAG

| Program | Outcome | Hard dependencies | Exit gate |
|---|---|---|---|
| `P00 TRUTH` | SSOT, baseline, test/repo/docs/memory truth ve safe worktree discipline | — | Canonical ledger valid; red truth blockers contained |
| `P01 CODEX-CUTOVER` | Codex-main resolved runtime, bounded compatibility ve safe dogfood ladder | P00, P04 authority floor | Attended canary, sonra bounded sprint; no silent fallback |
| `P02 PAEP` | Host-custodied provider session ve credential-less Worker Bridge | P00, P01 truth gates | PAEP 631–656 conformance ve rollout |
| `P03 EXECUTION-KERNEL` | Goal→Mission→Flow→Run→WorkItem→Attempt→Operation tek lifecycle | P00, P01 safe execution, P04 | Canonical durability, recovery ve all-surface cutover |
| `P04 RUNTIME-AUTHORITY` | Principal, tenant, operation, capability, approval, budget ve audit authority | P00 | Bypass-free runtime-wide enforcement |
| `P05 TERMINAL` | Ana product/operator surface | P03, P04 | Native development ve end-user journeys live-proven |
| `P06 DESKTOP-API` | Shared application services, Desktop, API, connectors ve dashboard projection | P03, P04 | Surface parity, security ve native delivery proof |
| `P07 ECOSYSTEM-TRUST` | Agent, skill, plugin, tool ve outgoing MCP supply-chain trust | P02, P03, P04 | Signed provenance, sandbox, quarantine ve conformance |
| `P08 EVERY-ENV-RELEASE` | Platform adapters, packaging, onboarding, docs ve release | P00; surface certification waits P05, P06, P07 | Full platform matrix ve owner release gate |
| `P09 LEARNING` | Training trace ve closed outcome→routing→promotion loop | P03 telemetry starts at first canary | Eval-backed promotion, rollback ve drift proof |
| `P10 SCALE-ASSURANCE` | Durable multi-tenant persistence, HA, SLO, load, chaos ve enterprise depth | P00; component gates are explicit per child | Million-scale assurance pack |

Every-environment, i18n, tenancy, audit, security and scale are cross-cutting acceptance gates;
P08 veya P10'a ertelenmiş “sonra ekleriz” işleri değildir.

## 6. Immediate execution train

Deckent sprinti şu anda başlatılmaz. Codex Worker iki ayrı hard blocker taşır:

1. Usage capability: current adapter incremental measured-stream bildirmiyor.
2. Landing capability: current adapter unattended remote execution için checkpoint-stop bildirmiyor.

İlk safe train:

1. `SSOT-001`, `SOURCE-MANIFEST-001`, `LEGACY-RESIDUAL-AUDIT-001`, `SSOT-002`
   ve `SSOT-003` — archive, lossless reconciliation ve fail-closed validator.
2. `TEST-675`, `TEST-676` ve `TEST-HERMETIC-001` — live `.tasks`, `dist` ve HOME
   side-effect'lerini kapatıp reference proof tabanını kur.
3. `PRINCIPAL-001` → `TENANT-001`/`OPERATION-001` → `CAPABILITY-001` →
   `APPROVAL-001`; paralelde `RECEIPT-001` → `REACHABILITY-001` → `LIMIT-001`;
   ardından `ATTENDED-STOP-001` — provider ingress'ten önce runtime authority floor.
4. `CM-01`–`CM-05` ve `CODEX-COMPAT-POLICY-001` — exact Codex runtime,
   entitlement, fallback, ingress ve official policy truth.
5. `PA-662` → `PROVIDER-INGRESS-001` → `CODEX-ADMISSION-001` — keyring proof,
   canonical execution `ALLOW` ve exact attended canary admission.
6. `FO-01`–`FO-11`, `CODEX-C0`, `CODEX-C1` ve `P01-TRUTH-GATE` — paid call
   yapmadan truthful compatibility/fault containment.
7. `P02-631`–`P02-640`, `P02-642` ve `P02-647` — PAEP core, Worker Bridge,
   Codex host driver ve provider-free conformance.
8. `FO-12` için exact single-use policy + fresh `G7`; ardından `CODEX-C2`.
9. `CODEX-C3` → `CODEX-C4` → `CODEX-C5`; C5 promotion'ı bağımsız
   `XVERIFY-WIRE-001` olmadan `HOLD`.
10. `P02-649`, `P02-650`, `P02-651A` ve `FO-07B`; sonra
    `P02-648-CODEX` → `P02-651B-CODEX` → `CODEX-C6`.
11. `IM-01`–`IM-07` incremental promotion mümkünse; mümkün değilse typed
    `UNSUPPORTED`, asla sahte parity değil.
12. `CODEX-C7` two-worker, `CODEX-C8` bounded full sprint, sonra platform ve
    staged rollout.
13. Güvenli dogfood sonrası P03 execution kernel ve P05/P06 product trains.

Dogfood control loop:

`preflight → collision guard → DIRECTIVES projection → owner start gate → live monitor → disk-truth review → approved manual repair → targeted and binary proof → review/retro → MASTER update → next dependency slice`

Her normal sprint 20–40 atomik microtask hedefler; gerçek concurrency config, dependency DAG,
provider capacity ve collision topology'den türetilir. Sayı uğruna bağımsız olmayan işler paralelleştirilmez.

## 7. Canonical execution ledger

### P00 — Truth, SSOT, test, repo, docs ve memory governance

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | SSOT-001 | P00 | TRUTH | 2026-07-26 legacy MASTER'ı byte-identical archive et | P0 | — | G1 | VERIFY | 1/1/1/1/0/-/- | Archive SHA-256 source hash ile aynı ve tracked fresh-clone proof'u var | `receipt=GR-2026-07-26-MASTER-01`; archive hash doğrulandı; commit/fresh-clone evidence bekliyor | 2026-07-26 |
| 20 | SSOT-002 | P00 | TRUTH | Tüm kaynakları canonical, atomik ve dependency'li ledger'a uzlaştır | P0 | SSOT-001, SOURCE-MANIFEST-001, LEGACY-RESIDUAL-AUDIT-001 | G1 | VERIFY | 1/1/1/1/0/-/- | File-level source catalog, 125 alias exactly-once total mapping, completed residual audit, supersession and finish contract complete | `receipt=GR-2026-07-26-MASTER-01`; all reconciliation manifests present; isolated commit proof pending | 2026-07-26 |
| 30 | SSOT-003 | P00 | TRUTH | MASTER schema validator ve generated active views | P0 | SSOT-001 | G1 | VERIFY | 1/1/1/1/1/?/- | Column count, unique ID/order, enum, dependency and aggregate-parent closure integrity, gate receipts, blocker register, DONE evidence and pipe lint CI'da fail-closed | `receipt=GR-2026-07-26-SSOT-003-01`; `receipt=GR-2026-07-26-SSOT-003-02`; dependency-free validator, deterministic Markdown/JSON projections, 67-case validator suite, 38-case VitePress boundary suite, hermetic matrix and real CLI check; public-docs exclusion is enforced; cross-platform CI, authenticated historical authority, external immutable/self-hosting-safe grant ledger, commit-bound settlement and Git trust-anchor evidence pending under APPROVAL-001, RECEIPT-001, KERNEL-SETTLEMENT-001, AUDIT-001 | 2026-07-26 |
| 40 | TRUTH-BASELINE-001 | P00 | TRUTH | Current HEAD için tek reference test, build, binary ve environment baseline | P0 | TEST-675, TEST-676, TEST-HERMETIC-001 | G1 | BLOCKED | 0/0/0/?/0/?/? | Hermetic suite, build artifacts stable, binary proofs ayrı provenance ile kaydedilir | Handover ve legacy baseline'ları çelişkili | 2026-07-26 |
| 50 | TEST-675 | P00 | TRUTH | Testlerin live `.tasks` alanına yazmasını kaldır ve writer discovery ratchet'i kur | P0 | — | G1 | OPEN | 1/1/~/~/0/?/? | Dynamic ve static scan; tüm writers tmpdir; root-write gate fail-loud | `receipt=GR-2026-07-26-TEST-HERMETIC-01`; `receipt=GR-2026-07-27-TEST-HERMETIC-02`; `receipt=GR-2026-07-27-TEST-HERMETIC-03`; `receipt=GR-2026-07-27-TEST-HERMETIC-04`; `receipt=GR-2026-07-27-TEST-CONTAINMENT-01`; clean-index source-derived static/eager writer registry scans 2,443 files with 0 confirmed violations; full SHA-256 ratchets bind `8939:350bb34cd2a9517f9a1a1b0a2098e5180b8448592d2449a4fee488d3810bbb5a` unresolved effects and `1134:1abcdc8d8c35a01116bc5d605ca054279b72e1f09398745145feac19c06199c8` production inventory, including the exact nineteen-module containment inventory; dirty shared-worktree scans are intentionally ineligible to advance either ratchet; changed containment scope contributes zero unresolved effects; the approved 97-event ambient-allocation reduction was independently rejected and fully rolled back because writable global bindings plus missing catch/class-expression binding coverage made `proven-nonwriter` unsound; exact `import.meta.main` recognition changes existing callsite positions without reducing or accepting unresolved debt; default gate exits 0 and strict mode fails with `E_HERMETIC_UNRESOLVED_STRICT`; runtime guard blocks post-setup project, `.tasks` and `dist` writes across canonical root/dashboard/desktop Vitest surfaces; authenticated live measurement, native adapter execution, inherited/pre-opened descriptor closure and OS-level canary remain open under TEST-CONTAINMENT-001 | 2026-07-27 |
| 60 | TEST-676 | P00 | TRUTH | Test koşumunda `dist` clean çağrısının fail-loud root cause'unu bul ve kapat | P0 | — | G1 | OPEN | 1/1/~/~/0/?/? | Caller trace, deterministic reproduction, forbid-clean guard ve stable binary proof | `receipt=GR-2026-07-26-TEST-HERMETIC-01`; `receipt=GR-2026-07-27-TEST-HERMETIC-02`; clean authority is bound to the physical script root, rejects symlink/boundary ambiguity and validates all preserved entries before deletion; publish validation no longer build/cleans and uses `npm pack --dry-run --json --ignore-scripts`; async bounded process-tree tests cover POSIX and injected Windows failure paths; combined provider-free proof is 413 pass/10 opt-in live-Docker skip, but real binary/build and native Windows cleanup proof remain absent | 2026-07-27 |
| 70 | TEST-HERMETIC-001 | P00 | TRUTH | Project root, HOME, `.tasks` ve tracked-file test writer discovery/migration | P0 | TEST-675 | G1 | OPEN | 1/~/~/~/0/?/? | Source-derived writer registry ve zero unauthorized write ratchet | `receipt=GR-2026-07-26-TEST-HERMETIC-01`; `receipt=GR-2026-07-27-TEST-HERMETIC-02`; `receipt=GR-2026-07-27-TEST-HERMETIC-03`; `receipt=GR-2026-07-27-TEST-HERMETIC-04`; `receipt=GR-2026-07-27-TEST-CONTAINMENT-01`; runtime guard, worker setup and bounded global snapshot protect canonical root/dashboard/desktop Vitest surfaces; the attempted 97-event proof contract did not settle, the clean-index ratchet contains 8,939 unresolved effects without accepting false evidence and the previously observed 9,034 dirty-worktree count is ineligible to advance authority; clean-index containment provider-free matrix passes 15 files/159 tests and shared-worktree legacy CI-sim regression passes 35/35; root 413 pass/10 skip, dashboard 49/49, desktop 13/13 and earlier TypeScript proof remain prior-slice evidence; `src/dashboard/vitest.config.ts` remains an unapproved noncanonical uncovered config; authenticated native execution, real Docker/native Windows, Node-version CI matrix, cross-platform and scale proofs remain open under TEST-CONTAINMENT-001 | 2026-07-27 |
| 75 | TEST-CONTAINMENT-001 | P00 | TRUTH | Process-birth, descendant ownership ve OS/OCI test containment authority foundation'ı | P0 | TEST-675 | G1 | VERIFY | 1/~/0/1/0/0/0 | Candidate birth durable claim'den önce imkânsız; enforce mode eksik facet'te typed HOLD; authenticated finality olmadan cleanup ve PASS yok; source/dependency RO, host HOME hidden, scratch-only RW; dependency/runtime projection ve adapter planları fail-closed | `receipt=GR-2026-07-27-TEST-CONTAINMENT-01`; `receipt=GR-2026-07-27-TEST-CONTAINMENT-02`; opt-in `test:ci-sim:contained` wrapper, authority/session, supervisor, process bootstrap, owned execution, dependency/runtime projections and Linux/macOS/Windows/WSL/OCI plan adapters are code-present and partially wired without default or CI cutover; bounded RFC 8949 §4.2.1 deterministic CBOR and generic-evidence COSE_Sign1 structural contracts reject species/proxy/SAB/resource amplification, expose defensive snapshots, require RFC 9864 fully-specified algorithms and never claim signature verification; the E2 nine-envelope authority binds the full tenant/project/workspace and Goal→Mission→Flow→Run→WorkItem→Attempt→Operation journal, trusted challenge/epochs, exact-one `root-trust`, parent-signed non-root enrollment credentials, full previous outer-envelope digests, receipt measurement sets and stable authority graph; admission is authorized only after committed sequence 3 and consumed at 4, cleanup only after committed sequence 7 and committed at 8, with exact prior-envelope/resource/target/fencing bindings and control-plane/cleanup-authority issuers; Linux, signed/virtualized macOS, Windows, WSL2 and rootless OCI require ordered exact role tuples, matching platform and distinct multi-role authorities; generic macOS terminal is typed unsupported; deterministic CDDL/golden/runtime vectors are frozen while parser-backed cross-language conformance and all production enrollment remain `NOT_BORN`; clean-index provider-free matrix passes 15 files/159 tests; shared-worktree legacy CI-sim passes 35/35, root/dashboard TypeScript no-emit and touched MJS syntax pass; clean-index repository-wide TypeScript closure remains blocked by pre-existing `cross-verify-runner`→`execution-budget-policy` HEAD drift outside this grant; real probe exits 2 with `E_CONTAINMENT_HOLD_PROBE_ONLY` and explicit live request exits 2 with `E_CONTAINMENT_HOLD_LIVE_EVIDENCE_AUTHORITY_REQUIRED`, both `NOT_BORN`; durable prepare-before-birth, HMAC claim/receipt binding, finality cleanup capability, terminal prebirth/finality cleanup CAS, opaque one-shot leases, retry/forgery/replay and 128-bit new-workspace prefix are proven hermetically; clean-index static gate scans 2,443 files with 0 violations, `8939:350bb34cd2a9517f9a1a1b0a2098e5180b8448592d2449a4fee488d3810bbb5a` unresolved debt, zero scoped unresolved effects and `1134:1abcdc8d8c35a01116bc5d605ca054279b72e1f09398745145feac19c06199c8` inventory; dirty shared-worktree state is excluded from ratchet advancement; synthetic signatures/facets are structural protocol proof only, not authenticated native measurement; live key enrollment/signature verification, media-type registration/deployment policy, authenticated scanner/host observations, native prepare/terminate adapters, crash-rehydratable cleanup authority, stale-lock/high-water recovery, native handle-based hostile-host deletion, actual tmp-workspace projection integration, required CI, cross-platform native and scale/HA proof remain explicit blockers; live Docker/native/provider calls and build remain outside the E2 proof boundary | 2026-07-27 |
| 80 | TEST-SPAWN-001 | P00 | TRUTH | Test `spawnSync` policy ve async migration | P1 | TEST-HERMETIC-001 | G2,G1 | OPEN | 0/0/0/?/0/?/? | Capability-classified bounded exceptions; remaining calls ratcheted | 2026-07-21 tests/scripts analyses | 2026-07-26 |
| 90 | TEST-PLATFORM-001 | P00 | TRUTH | `tests/PLATFORM.md` ve enforcement'ı source-derived platform registry'ye bağla | P1 | SSOT-003 | G1 | OPEN | 0/0/0/?/0/0/- | Linux, macOS, Windows native ve WSL tags generated ve enforced | Stale `tests/PLATFORM.md` evidence | 2026-07-26 |
| 100 | REPO-DECK-001 | P00 | TRUTH | `.deck` secret'ını Docker context ve image layers'dan dışla | P0 | — | G1 | OPEN | 0/0/0/?/0/?/? | `.dockerignore`, build-context negative test ve image-layer proof | 2026-07-21 decision; current `.dockerignore` gap | 2026-07-26 |
| 110 | HEARTBEAT-001 | P00 | TRUTH | Default heartbeat template ile metachar guard çelişkisini gider | P1 | — | G1 | OPEN | 1/0/0/?/0/?/? | Empty-success ve exit semantics; real-binary proof; no unsafe shell widening | `heartbeat-daemon.ts` current evidence | 2026-07-26 |
| 120 | STATE-RETENTION-001 | P00 | TRUTH | Runtime state/log retention, rotation, legal hold ve crash recovery contract | P1 | SSOT-002 | G2,G1 | OPEN | 0/0/0/?/0/?/? | Tenant-aware age/count/size policies; bounded readers; atomic rotation | 2026-07-21 `.deckent` analysis; current files remeasured | 2026-07-26 |
| 130 | STATE-PRUNE-001 | P00 | TRUTH | Exact dry-run state prune manifest ve recoverable apply flow | P2 | STATE-RETENTION-001 | G3 | BLOCKED | 0/0/0/?/0/?/? | Fresh manifest hash, no active sprint, backup/receipt; only approved targets | Historical cleanup approval expired by drift | 2026-07-26 |
| 140 | DOCS-TOPOLOGY-001 | P00 | TRUTH | `docs`, `docs1`, `.analysis` ve generated-doc topology kararını current consumer graph ile yeniden ver | P1 | SSOT-002 | G2 | OPEN | 0/0/0/?/0/?/? | Code, tests, CI, runtime writers, site and inbound refs fully mapped | 2026-07-21 docs analyses are revalidate sources | 2026-07-26 |
| 150 | DOCS-ARCHIVE-001 | P00 | TRUTH | Approved exact archive/git-mv manifestini uygulayıp links ve writers'ı güncelle | P2 | DOCS-TOPOLOGY-001 | G3 | BLOCKED | 0/0/0/?/0/?/? | Manifest hash stable; lint/link and clean-clone proof | Fresh destructive approval required | 2026-07-26 |
| 160 | DOCS-ADR-SYNC-001 | P00 | TRUTH | Accepted ADR DB↔filesystem full-content/digest parity gate | P1 | SSOT-003 | G1 | OPEN | 0/0/0/?/0/?/? | No missing, divergent or stale accepted ADR projection | 2026-07-21 decision table | 2026-07-26 |
| 170 | DOCS-RELEASE-TRUTH-001 | P00 | TRUTH | Generated stats, references and release-doc truth authority | P1 | DOCS-TOPOLOGY-001, SSOT-003 | G1 | OPEN | 0/0/0/?/0/?/? | One generator registry; CI and release gate enforce exact counts/links | Cleanup plan and legacy 489,495,507 | 2026-07-26 |
| 180 | DOCS-I18N-001 | P00 | TRUTH | Documentation i18n contract for en, tr, zh-Hans, es, ja and hi | P1 | DOCS-TOPOLOGY-001, DOCS-RELEASE-TRUTH-001 | G2,G1 | OPEN | 0/0/0/?/0/0/? | Source locale, translation memory, code invariants, freshness and quality gate | 2026-07-21 Alperen decision | 2026-07-26 |
| 190 | MEMORY-AUTHORITY-001 | P00 | TRUTH | Repo-local provider-neutral canonical memory; provider HOME surfaces projections only | P0 | SSOT-002 | G2,G6 | OPEN | 0/0/0/?/0/?/? | Revision/hash conflict journal; no silent delete; Claude, Codex, Gemini parity | `sync-core-memory.mjs` currently Claude-authoritative | 2026-07-26 |
| 200 | MEMORY-TRUTH-001 | P00 | TRUTH | Memory index count, stale watch, task-capacity and phantom ledger drift'lerini hükme bağla | P1 | MEMORY-AUTHORITY-001 | G2,G6 | BLOCKED | 1/0/0/?/0/?/? | 13-record truth; watch renew/promote/close; capacity config-derived; MASTER sole tracker | Core-memory read-only audit | 2026-07-26 |
| 210 | REPO-CLEANUP-001 | P00 | TRUTH | Repository filesystem, tracked-ephemeral and orphan disposition manifest | P2 | SSOT-002 | G0,G2 | OPEN | 0/0/0/?/0/?/? | Each repo path wire, retain, archive or delete; exact consumer graph, hash and recovery | Branch, HOME, DB and runtime state are separate authorities | 2026-07-26 |
| 220 | REPO-CLEANUP-APPLY-001 | P00 | TRUTH | Apply approved repository-filesystem cleanup manifest | P2 | REPO-CLEANUP-001 | G3 | BLOCKED | 0/0/0/?/0/?/? | Exact unchanged path manifest, recoverable moves, link/tests and clean-clone proof | Filesystem-only fresh approval | 2026-07-26 |
| 230 | MEMORY-SYNC-001 | P00 | TRUTH | Provider-neutral revisioned memory sync and projections | P0 | MEMORY-AUTHORITY-001 | G1 | OPEN | 0/0/0/?/0/0/? | Hash/revision conflict journal, no silent delete, dry-run, backup/restore and platform adapters | Current script mirrors Claude HOME destructively | 2026-07-26 |
| 240 | MEMORY-DB-001 | P00 | TRUTH | Memory DB maintenance manifest and transactional apply | P2 | MEMORY-AUTHORITY-001 | G4 | BLOCKED | 0/0/0/?/0/?/? | Read-only before/after SQL plan, backup hash, exact transaction and integrity proof | No DB mutation in this plan rewrite | 2026-07-26 |
| 250 | ZERO-HARDCODE-PROVIDER-001 | P00 | TRUTH | Provider identity literal registry and lint ratchet | P1 | CM-01 | G1 | OPEN | 1/~/0/?/0/?/? | Runtime provider values originate in canonical config/registry; legitimate protocol constants allowlisted | Memory rule and legacy 565 residual | 2026-07-26 |
| 260 | ZERO-HARDCODE-FLOW-001 | P00 | TRUTH | Flow/state/action literal schema and lint ratchet | P1 | KERNEL-ONTOLOGY-001 | G1 | OPEN | 1/~/0/?/0/?/? | Canonical discriminants generated/typed; user-facing labels i18n-injected | Memory rule and legacy 565 residual | 2026-07-26 |
| 270 | SCRIPT-LIFECYCLE-001 | P00 | TRUTH | Script lifecycle and proof-harness registry | P1 | SSOT-002 | G2,G1 | OPEN | 0/0/0/?/0/?/? | gate, recurring proof, admin migration, one-shot and retired classes with owner/input/output/expiry | 2026-07-21 scripts analysis | 2026-07-26 |
| 280 | SCRIPT-RETIRE-001 | P00 | TRUTH | Exact replacement-proven script/test retirement | P2 | SCRIPT-LIFECYCLE-001 | G3 | BLOCKED | 0/0/0/?/0/?/? | Current proof tools promoted; only approved retired manifest removed; affected gates green | Old 14-script list requires revalidation | 2026-07-26 |
| 290 | TEST-ORPHAN-001 | P00 | TRUTH | Orphan benchmark, skips and test naming disposition | P2 | TEST-HERMETIC-001 | G2,G3 | BLOCKED | 0/0/0/?/0/?/? | Wire, retain, replace or delete per exact manifest; runner coverage preserved | 2026-07-21 tests analysis | 2026-07-26 |
| 300 | TASK-RETENTION-001 | P00 | TRUTH | Task artifacts and archive retention coverage | P1 | STATE-RETENTION-001 | G1 | OPEN | 1/~/0/?/0/?/? | Numeric/nonnumeric tasks, patch, evidence, cleanup and active-run exclusions covered | `.deckent` analysis | 2026-07-26 |
| 310 | ERROR-SEVERITY-001 | P00 | TRUTH | Operational breadcrumb and error forensic severity truth | P2 | STATE-RETENTION-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | INFO is not reported as ERROR; forensic capacity and retention preserved | Cleanup analysis | 2026-07-26 |
| 320 | OPS-BRANCH-001 | P00 | TRUTH | Branch, worktree, remote and unpushed-commit authority inventory | P1 | SSOT-001 | G0 | OPEN | 1/0/0/?/0/?/? | Merge-base, owner session and active worktree before any retirement | Current multiple worktrees observed | 2026-07-26 |
| 330 | OPS-RETIRE-001 | P00 | TRUTH | Approved branch and remote retirement | P2 | OPS-BRANCH-001 | G5 | BLOCKED | 0/0/0/?/0/?/? | Exact branch/remote manifest, no active worktree, ancestry and recovery receipt | Historical cleanup approval is insufficient | 2026-07-26 |
| 340 | XVERIFY-UX-001 | P00 | TRUTH | Xverify optional evidence, bounded path/range/symbol targeting and actionable preflight | P1 | SSOT-003 | G1 | OPEN | 1/~/0/?/0/?/? | `--files` contract honest; empty evidence has remedy; large files target exact range/symbol without operator prompt hacks | Legacy 673 and 660(b) | 2026-07-26 |
| 350 | XVERIFY-TRUTH-001 | P00 | TRUTH | Dispatch rejection, verifier abstention and semantic `UNCLEAR` remain distinct | P0 | EVALUATION-001, RECEIPT-001 | G1 | BLOCKED | 1/~/0/?/0/?/? | Provider/model rejection never masquerades as verifier judgment; structured cause survives all surfaces | Legacy 671 | 2026-07-26 |
| 360 | LEGACY-RESIDUAL-AUDIT-001 | P00 | TRUTH | Audit all 199 historical closed claims for hidden residual work | P0 | SSOT-001 | G0,G1 | VERIFY | 1/1/1/1/-/-/- | Every legacy closed row has no residual or maps each residual to exact canonical Work ID with reason | `receipt=GR-2026-07-26-MASTER-01`; §8.2 partitions 157+36+6 and promotes all six hidden residuals | 2026-07-26 |
| 370 | DOC-IMPACT-001 | P00 | TRUTH | Finalization surfaces Worker `docImpact` as governed follow-up | P1 | KERNEL-SETTLEMENT-001, DOCS-RELEASE-TRUTH-001 | G1 | BLOCKED | 1/0/0/?/0/?/? | Exact doc impact appears in result/finalize and creates no unauthorized worker doc write | Residual from historical closed 440 | 2026-07-26 |
| 380 | DEBT-GOVERNANCE-001 | P00 | TRUTH | Technical/product/operational debt ingestion, ownership and closure authority | P0 | SSOT-003, KERNEL-SETTLEMENT-001 | G2,G1 | BLOCKED | 1/~/0/?/0/?/? | Every debt has owner, severity, affected outcomes, acceptance, evidence and no silent closure; no fix-only endless loop | Finish contract requires zero unowned debt | 2026-07-26 |
| 390 | SOURCE-MANIFEST-001 | P00 | TRUTH | File-level digest and disposition manifest for all reconciliation sources | P0 | SSOT-001 | G1 | VERIFY | 1/1/1/1/0/-/- | Handover, code audit, PAEP, archive, 12 alperen-analysis and 15 core-memory sources have digest, class and canonical owner; untracked source marked | `receipt=GR-2026-07-26-MASTER-01`; §4 snapshot and manifests | 2026-07-26 |
| 400 | HOST-STATE-001 | P00 | OPS | Provider HOME cache/session/history retention manifest | P2 | MEMORY-AUTHORITY-001 | G2 | BLOCKED | 0/0/0/?/0/?/? | Age, size, active-session and credential exclusions; no mutation | Separate from repo and DB cleanup | 2026-07-26 |
| 410 | HOST-STATE-APPLY-001 | P00 | OPS | Apply approved recoverable HOME-state prune | P2 | HOST-STATE-001 | G3 | BLOCKED | 0/0/0/?/0/?/? | Exact unchanged manifest, trash/backup first, credentials and active sessions immutable | Fresh owner approval required | 2026-07-26 |
| 420 | GIT-MAINT-REPORT-001 | P00 | OPS | Read-only git object and pack health report | P2 | OPS-BRANCH-001 | G0 | BLOCKED | 0/0/0/?/0/?/? | Reachable/unreachable and largest objects measured; no mutation | Separate from remote retirement | 2026-07-26 |
| 430 | GIT-MAINT-APPLY-001 | P00 | OPS | Approved local repository maintenance and repack | P2 | GIT-MAINT-REPORT-001 | G3 | BLOCKED | 0/0/0/?/0/?/? | Exact command, recovery and before/after evidence; aggressive repack separately approved | No implicit gc or remote-ref mutation | 2026-07-26 |

### P01 — Codex-main cutover ve safe dogfood

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 1000 | CODEX-MAIN-001 | P01 | CODEX | Codex-main transition parent | P0 | SSOT-003, TEST-675, TEST-676, APPROVAL-001, RECEIPT-001, LIMIT-001 | G1,G2 | BLOCKED | ~/~/~/?/0/?/? | CM, PA, FO, canary and independent verification children complete | Config-only transition currently insufficient | 2026-07-26 |
| 1010 | CM-01 | CODEX-MAIN-001 | CODEX | Canonical resolved provider/model contract across every ingress | P0 | SSOT-003 | G1 | BLOCKED | ~/~/~/?/0/?/? | Brain, Worker, Auditor, chat and native exact IDs; foreign Anthropic requirement removed; invalid provider typed HOLD | Config and `config.ts` audit | 2026-07-26 |
| 1020 | CM-02 | CODEX-MAIN-001 | CODEX | Sol, Terra and Luna entitlement evidence matrix | P0 | CM-01 | G1,G7 | OPEN | ~/0/0/?/~/0/- | Exact surface/version/auth/account, expiry and separately receipted live probe; registry presence is not entitlement | Sol live evidence exists; handover records one Terra call on a narrower/undigested scope; Luna unproven | 2026-07-26 |
| 1030 | CM-03 | CODEX-MAIN-001 | CODEX | No-silent provider, model, surface, billing or data-boundary fallback | P0 | CM-01 | G2,G1 | OPEN | ~/~/0/?/0/?/? | Registration-order fallback removed or authority-bound; first canary fallback absent | Legacy 607 and 671 residual | 2026-07-26 |
| 1040 | CM-04 | CODEX-MAIN-001 | CODEX | Cross-verify provider independence | P0 | CM-01 | G2,G1 | OPEN | ~/~/0/?/0/?/? | Codex-authored result uses Claude/Gemini or typed HOLD; same-provider is not independent | Current priority starts with Codex | 2026-07-26 |
| 1050 | CM-05 | CODEX-MAIN-001 | CODEX | Provider authority inventory and cutover for all execution ingress paths | P0 | CM-01 | G1 | OPEN | ~/~/0/?/0/?/? | Sprint, Goal, do, mission, flow, run, autonomous, process, CLI, MCP, API, terminal and desktop have no bypass | Code-truth audit | 2026-07-26 |
| 1055 | XVERIFY-WIRE-001 | CODEX-MAIN-001 | CODEX | Sprint and manual xverify share independent provider authority and bounded dispatch | P0 | CM-04, PROVIDER-INGRESS-001, XVERIFY-UX-001 | G1,G7 | BLOCKED | 1/~/0/?/0/?/? | Exact verifier candidate, max-per-sprint, evidence targeting, refusal truth, usage and settlement are one path; live verification uses an independent G7 receipt | Legacy 657,659,609 residuals | 2026-07-26 |
| 1057 | CODEX-COMPAT-POLICY-001 | CODEX-MAIN-001 | CODEX | Scoped Codex compatibility and integration policy evidence | P0 | CM-01 | G2,G1 | OPEN | 0/0/0/?/0/?/? | Exact surface/auth/account/use-mode, official source digest, owner decision, reviewBy, data/tool boundaries and allowed/blocked conditions; later ingested by P02-649 | Born from 2026-07-26 provider safety review | 2026-07-26 |
| 1060 | PA-662 | CODEX-MAIN-001 | CODEX | Provider authority keyring provisioning, rotation and doctor proof | P0 | CM-01 | G1 | VERIFY | 1/1/?/?/0/?/- | CLI status/init/rotate and doctor targeted plus real-binary proof; owner key custody preserved | `historical-authority=legacy-662;historical-gates=G1;proof=current-keyring-disk`; no new write authority | 2026-07-26 |
| 1070 | CODEX-ADMISSION-001 | CODEX-MAIN-001 | CODEX | Exact attended Codex canary admission projection | P0 | PROVIDER-INGRESS-001, ATTENDED-STOP-001, PA-662 | G1 | BLOCKED | 1/1/0/?/0/?/? | One exact canary attempt receives candidate, reachability, reservation, route lock, termination and receipt authority; no general bypass | Legacy 663 becomes scoped verification, not a second ingress | 2026-07-26 |
| 1080 | FO-01 | CODEX-MAIN-001 | CODEX | Usage capability contract | P0 | CM-02 | G1 | OPEN | ~/0/0/?/0/?/? | unknown, none, final-authoritative, incremental-observed and incremental-enforceable are distinct | Current adapter lacks live support declaration | 2026-07-26 |
| 1090 | FO-02 | CODEX-MAIN-001 | CODEX | Per-budget enforcement projection | P0 | FO-01 | G1 | OPEN | 0/0/0/?/0/?/? | Pre-dispatch-hard, inflight-hard, posthoc-only and unsupported truth visible per field | ADR-G-037 | 2026-07-26 |
| 1100 | FO-03 | CODEX-MAIN-001 | CODEX | Final-only policy provenance in immutable execution snapshot | P0 | FO-02 | G1 | OPEN | ~/0/0/?/0/?/? | Owner policy and digest reach host plan; worker-writable task data never grants authority | Current grant is not projected to Worker plan | 2026-07-26 |
| 1110 | FO-04 | CODEX-MAIN-001 | CODEX | Exact single-use containment grant | P0 | FO-03, CM-05 | G1 | OPEN | 0/0/0/?/0/?/? | Tenant through deadline bindings; expiry, replay and mutation fail-closed | Provider authority design | 2026-07-26 |
| 1120 | FO-05 | CODEX-MAIN-001 | CODEX | Common final-only dispatch wiring | P0 | FO-04 | G1 | OPEN | 0/0/0/?/0/?/? | Scheduler, continuation, retry, FIX, autonomous, process and xverify use one verified grant | Current Worker dispatch omits grant | 2026-07-26 |
| 1130 | FO-06 | CODEX-MAIN-001 | CODEX | Host wall-clock and process-tree containment | P0 | FO-04 | G1 | OPEN | ~/0/0/?/0/0/- | Timer pre-spawn; minimum timeout; POSIX group and Windows Job Object or honest unsupported | Docker has a partial analogue | 2026-07-26 |
| 1140 | FO-07 | CODEX-MAIN-001 | CODEX | Codex attended landing and hard-stop boundary | P0 | FO-05, FO-06, CODEX-ADMISSION-001, ATTENDED-STOP-001 | G2,G1 | BLOCKED | 0/0/0/?/0/0/- | Attended attempt has exact ApprovalBroker deadline/process-tree hard stop; unattended path remains typed `HOLD` with no checkpoint or recovery claim | Adapter attended landing boundary absent | 2026-07-26 |
| 1145 | FO-07B | CODEX-MAIN-001 | CODEX | Codex unattended checkpoint-stop and terminal landing capability | P0 | FO-09, P02-642, P02-647, P02-651A | G1 | OPEN | 0/0/0/?/0/0/- | Durable checkpoint journal, verified process-tree teardown, terminal settlement and restart recovery exist before unattended admission | Separate from attended FO-07; no semantic closure cycle | 2026-07-26 |
| 1150 | FO-08 | CODEX-MAIN-001 | CODEX | Final usage exactly-once settlement through canonical receipt authority | P0 | FO-05, FO-06, RECEIPT-001 | G1 | OPEN | ~/0/0/?/0/?/? | Missing, malformed, duplicate or breached final usage cannot settle success or auto-retry; no second result authority | Existing final usage is not Worker-authority wired | 2026-07-26 |
| 1160 | FO-09 | CODEX-MAIN-001 | CODEX | Provider attempt crash recovery | P0 | FO-07, FO-08 | G1 | OPEN | ~/0/0/?/0/?/? | Durable pre-spawn journal; restart re-arms deadline or kills orphan; unknown outcome never auto-replays | Cross-surface recovery residuals | 2026-07-26 |
| 1170 | FO-10 | CODEX-MAIN-001 | CODEX | Redacted final-only authority audit | P0 | FO-09 | G1 | OPEN | ~/0/0/?/0/?/? | Grant, projection, kill and settlement visible without secret, prompt or raw auth paths | Quality bar and PAEP audit | 2026-07-26 |
| 1175 | FO-10-I18N | CODEX-MAIN-001 | CODEX | Runtime i18n for containment, landing and settlement states | P0 | FO-09 | G1 | OPEN | ~/0/0/?/0/?/? | All user-facing states use message authority; locale negotiation, missing key and every-surface parity tested | Quality bar | 2026-07-26 |
| 1180 | FO-11 | CODEX-MAIN-001 | CODEX | Real-process final-only conformance harness | P0 | FO-10, FO-10-I18N | G1 | OPEN | 0/0/0/?/0/0/- | Normal, hang, child fork, missing/malformed/duplicate final, replay and crash matrix; zero orphan | Required before any paid canary | 2026-07-26 |
| 1185 | FO-12 | CODEX-MAIN-001 | CODEX | Final-only Worker canary enablement | P0 | FO-11, CODEX-C1, CM-01, CODEX-COMPAT-POLICY-001, CODEX-ADMISSION-001, ATTENDED-STOP-001 | G1,G2,G7 | OPEN | 0/0/0/?/0/?/? | Exact Codex canary attempt/task-kind only; expiring single-use, wall-clock bounded, fallback absent, token/cache/turn caps explicitly post-hoc and automatic revoke after terminal settlement; never global Worker-role enablement | Current config authorizes final-only only for Auditor | 2026-07-26 |
| 1190 | IM-01 | CODEX-MAIN-001 | CODEX | Codex surface protocol probe | P1 | P02-634, P02-642 | G1 | OPEN | ~/0/0/?/0/?/? | `codex exec`, App Server and API separately versioned and behavior-probed | Legacy 658 | 2026-07-26 |
| 1200 | IM-02 | CODEX-MAIN-001 | CODEX | Canonical incremental usage event contract | P1 | IM-01 | G1 | OPEN | 0/0/0/?/0/?/? | Attempt/turn/call binding, monotonic cumulative-to-delta, cache/reasoning tokens, reset and dedupe | Legacy 658 | 2026-07-26 |
| 1210 | IM-03 | CODEX-MAIN-001 | CODEX | Real-time host usage stream | P1 | IM-02 | G1 | OPEN | 0/0/0/?/0/?/? | Events reach host guard before completion with bounded backpressure and durable cursor | Post-run log parsing is not live | 2026-07-26 |
| 1220 | IM-04 | CODEX-MAIN-001 | CODEX | Incremental in-flight enforcement | P1 | IM-03, FO-07B | G1 | BLOCKED | 0/0/0/?/0/?/? | Next provider request is preventable or exact owner-approved overshoot is bounded | Observed-only stream cannot pass | 2026-07-26 |
| 1221 | IM-05 | CODEX-MAIN-001 | CODEX | Restart-safe live guard counters and landing reserve | P1 | IM-04 | G1 | BLOCKED | 0/0/0/?/0/?/? | Reconnect/restart causes no lost or double count; reserve semantics preserved | Incremental recovery gate | 2026-07-26 |
| 1222 | IM-06 | CODEX-MAIN-001 | CODEX | Incremental-to-final authoritative reconciliation | P1 | IM-05, FO-08, P02-648-CODEX | G1,G7 | BLOCKED | 0/0/0/?/0/?/? | Exact or owner-documented field tolerance; mismatch quarantines exact surface | Final settlement remains canonical | 2026-07-26 |
| 1223 | IM-07 | CODEX-MAIN-001 | CODEX | Signed scoped capability promotion and final-only exception retirement | P1 | IM-06, P02-647, P02-649, P02-650, P02-651A, P02-651B-CODEX, P02-652, P02-655 | G2,G1 | BLOCKED | 0/0/0/?/0/?/? | Exact surface/version/platform promotion; config exception removed; unknown version regresses safely | Codex promotion does not wait unrelated provider live calls | 2026-07-26 |
| 1230 | CODEX-CANARY-001 | CODEX-MAIN-001 | CODEX | C0–C10 dogfood canary ladder | P0 | FO-11, CM-03, CM-04 | G2,G1 | BLOCKED | 0/0/0/?/0/0/0 | Zero secret, mismatch, fallback, replay, orphan and duplicate settlement at every promotion | Canary contract below | 2026-07-26 |
| 1235 | P01-TRUTH-GATE | CODEX-MAIN-001 | CODEX | PAEP entry milestone for Codex runtime truth and compatibility containment | P0 | CM-01, CM-02, CM-03, CM-04, CM-05, CODEX-COMPAT-POLICY-001, PA-662, FO-01, FO-02, FO-03, FO-04, FO-05, FO-06, FO-07, FO-08, FO-09, FO-10, FO-11, CODEX-C0, CODEX-C1 | G1 | BLOCKED | 0/0/0/?/0/?/? | Every dependency DONE; unattended remains HOLD and no paid call is required beyond separately receipted entitlement evidence | Separates P01 truth gate from full Codex rollout | 2026-07-26 |
| 1240 | CODEX-C0 | CODEX-CANARY-001 | CODEX | Static no-call preflight | P0 | CM-01, CM-02, CM-03, CM-04, CM-05, CODEX-COMPAT-POLICY-001 | G0 | BLOCKED | 0/0/0/?/0/-/- | Exact config/model/surface/version/auth/policy/exposure/budget; fallback absent; rollback ready | No provider call | 2026-07-26 |
| 1250 | CODEX-C1 | CODEX-CANARY-001 | CODEX | Fake real-process fault matrix | P0 | FO-11 | G1 | BLOCKED | 0/0/0/?/0/0/- | Normal, hang, fork, malformed, replay and crash; zero orphan; exactly-one settlement | Provider-free real process | 2026-07-26 |
| 1260 | CODEX-C2 | CODEX-CANARY-001 | CODEX | Live no-authorized-side-effect canary | P0 | CODEX-C0, CODEX-C1, CODEX-COMPAT-POLICY-001, CODEX-ADMISSION-001, FO-07, FO-08, FO-12 | G2,G1,G7 | BLOCKED | 0/0/0/?/0/?/- | Built-in tools disabled or OS-enforced read-only/no-side-effect sandbox; zero tool event; exact nonce/model/final usage; no secret | Paid/live disposable project; exact single-use receipt | 2026-07-26 |
| 1270 | CODEX-C3 | CODEX-CANARY-001 | CODEX | Live finite tool round-trip through Worker Bridge | P0 | CODEX-C2, TOOL-AUTHORITY-001, P02-640, P02-642 | G2,G1,G7 | BLOCKED | 0/0/0/?/0/?/- | Deterministic read/write/exec through actual enforcement; allowlist and ApprovalBroker cannot be bypassed | Current Codex adapter full-auto is not sufficient | 2026-07-26 |
| 1280 | CODEX-C4 | CODEX-CANARY-001 | CODEX | Live cancellation and terminal settlement | P0 | CODEX-C3, FO-09 | G2,G1,G7 | BLOCKED | 0/0/0/?/0/?/- | Cancel kills process tree, settles once and never retries silently | Disposable project | 2026-07-26 |
| 1290 | CODEX-C5 | CODEX-CANARY-001 | CODEX | Attended isolated Deckent microtask | P0 | CODEX-C4, TEST-675, TEST-676, FO-12, XVERIFY-WIRE-001 | G2,G1,G7 | BLOCKED | 0/0/0/?/0/?/- | One narrow task in isolated worktree with explicit compatibility approval and zero shared-tree write; independent verifier unavailable means promotion `HOLD` | First Deckent dogfood promotion | 2026-07-26 |
| 1300 | CODEX-C6 | CODEX-CANARY-001 | CODEX | Unattended single-task canary | P0 | CODEX-C5, FO-07B, P02-638, P02-639, P02-640, P02-642, P02-647, P02-648-CODEX, P02-651B-CODEX | G2,G1,G7 | BLOCKED | 0/0/0/?/0/?/- | Checkpoint-stop, lease, bridge, recovery and Codex-scoped quarantine proven before human leaves loop | No attendance assertion without authority | 2026-07-26 |
| 1310 | CODEX-C7 | CODEX-CANARY-001 | CODEX | Two-worker concurrency canary | P0 | CODEX-C6, KERNEL-ATTEMPT-001, WORKER-REGISTRY-001 | G2,G1,G7 | BLOCKED | 0/0/0/?/0/?/? | Separate worktrees/scopes, exact reservations, no cross-write, duplicate or budget bleed | Bounded concurrency | 2026-07-26 |
| 1320 | CODEX-C8 | CODEX-CANARY-001 | CODEX | Bounded full lifecycle micro-sprint | P0 | CODEX-C7, KERNEL-SETTLEMENT-001, SPRINT-HONESTY-001 | G2,G1,G7 | BLOCKED | 0/0/0/?/0/?/? | PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO; receipts complete; cleanup still owner-gated | 20–40 tasks only after this gate | 2026-07-26 |
| 1330 | CODEX-C9 | CODEX-CANARY-001 | CODEX | Platform canary matrix | P0 | CODEX-C8, ENV-ADAPTER-001 | G2,G1,G7 | BLOCKED | 0/0/0/?/0/0/? | Linux, macOS, Windows native, WSL and Docker each produce explicit support state | Every-environment gate | 2026-07-26 |
| 1340 | CODEX-C10 | CODEX-CANARY-001 | CODEX | Exact Codex surface/model/platform default rollout and rollback rehearsal | P0 | CODEX-C9, P02-656, IM-07, SLO-001 | G2,G5,G7 | BLOCKED | 0/0/0/?/0/0/0 | Owner-signed thresholds, quarantine, rollback and progressive product default flip | IM unsupported means global unattended default remains HOLD | 2026-07-26 |

### P02 — Provider Authority and Execution Plane

PAEP satırları [`PROVIDER-AUTHORITY-EXECUTION-PLAN.md`](../PROVIDER-AUTHORITY-EXECUTION-PLAN.md)
specification'ını execute eder. Legacy provider adapter'ının varlığı PAEP driver completion sayılmaz.

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 2000 | P02-630 | P02 | PAEP | Provider Authority and Execution Control Plane parent | P0 | P01-TRUTH-GATE | G2,G1 | BLOCKED | ~/~/0/?/0/0/0 | P02-631–656 complete; zero-worker-exposure and rollback live-proven | PAEP spec; legacy 630 | 2026-07-26 |
| 2010 | P02-631 | P02-630 | PAEP | Accepted PAEP ADR and ownership boundaries | P0 | P01-TRUTH-GATE | G2,G6,G4 | OPEN | 0/0/0/?/0/-/- | Custody, lease, protocol, policy, fallback, migration and lifecycle authority accepted and DB/filesystem projections transactionally consistent | Legacy 631; accepted ADR DB mutation is separately gated | 2026-07-26 |
| 2020 | P02-632 | P02-630 | PAEP | Broker denial fail-closed on every backend | P0 | CM-05 | G1 | VERIFY | 1/~/0/?/0/?/? | Subprocess, Docker, tmux and host adapter real-child matrix; no secret fallback | `historical-authority=current-disk-P02-632;historical-gates=G1;proof=subprocess-hermetic-slice`; no new write authority; full/live absent | 2026-07-26 |
| 2030 | P02-633 | P02-630 | PAEP | Runtime-visible credential exposure taxonomy | P0 | P02-632 | G2,G1 | OPEN | 0/0/0/?/0/?/? | Host-only, env, tmpfs-copy, persistent-copy and enterprise custody honestly classified | Current Docker Codex auth copy is not zero-exposure | 2026-07-26 |
| 2040 | P02-634 | P02-630 | PAEP | Versioned provider surface registry | P0 | P02-631, CAPABILITY-001 | G1 | OPEN | ~/0/0/?/0/?/? | CLI, app-server, API and gateway surfaces carry tested version envelopes | Generic model registry is insufficient | 2026-07-26 |
| 2050 | P02-635 | P02-630 | PAEP | Auth strategy registry | P0 | P02-631, P02-634 | G1 | OPEN | 0/0/0/?/0/?/? | Native session, API key, OAuth, ADC/WIF and workload identity have explicit custody/exposure/billing contracts | Legacy 635 | 2026-07-26 |
| 2060 | P02-636 | P02-630 | PAEP | Versioned provider policy decision registry | P0 | P02-631, P02-634 | G1 | OPEN | 0/0/0/?/0/?/? | Technical capability is separate from reviewed policy decision and expiry | Legacy 636 | 2026-07-26 |
| 2070 | P02-637 | P02-630 | PAEP | Secret-free Provider Adapter SPI and canonical events | P0 | P02-634, P02-635, P02-636 | G1 | OPEN | ~/0/0/?/0/?/? | discover, health, session, execute, usage and revoke without returning raw credentials | Existing adapters are not this SPI | 2026-07-26 |
| 2080 | P02-638 | P02-630 | PAEP | Signed opaque ProviderSessionLease | P0 | P02-631, P02-637, RECEIPT-001 | G1 | OPEN | 0/0/0/?/0/?/? | Exact scope, TTL, nonce, audience, budget and policy digest; replay/revocation fail-closed | Legacy 638 | 2026-07-26 |
| 2090 | P02-639 | P02-630 | PAEP | Versioned credential-less Worker Execution Protocol | P0 | P02-637, P02-638, OPERATION-001 | G1 | OPEN | 0/0/0/?/0/?/? | Read, write, patch, exec, progress, cancellation, approval and backpressure semantics | Legacy 639 | 2026-07-26 |
| 2100 | P02-640 | P02-630 | PAEP | Worker MCP Bridge and provider translations | P0 | P02-638, P02-639, TOOL-AUTHORITY-001 | G1 | OPEN | ~/0/0/?/0/?/? | Provider schemas map to one internal protocol with typed errors, cancellation and streaming | Existing MCP surfaces are not full bridge | 2026-07-26 |
| 2110 | P02-641 | P02-630 | PAEP | Claude host driver under PAEP | P0 | P02-637, P02-638, P02-639, P02-640 | G1 | OPEN | ~/~/0/?/0/?/? | Host custody, exact tool authority, lease, usage, cancellation and settlement | Legacy Claude adapter only foundation | 2026-07-26 |
| 2120 | P02-642 | P02-630 | PAEP | Codex host driver under PAEP | P0 | P02-637, P02-638, P02-639, P02-640, FO-11, CM-02 | G1 | BLOCKED | 1/~/0/?/0/?/? | Secretless lease/bridge, exact attempt settlement, version envelope and no surface fallback | Legacy CodexAdapter plus final-only gaps | 2026-07-26 |
| 2130 | P02-643 | P02-630 | PAEP | Gemini personal, AI Studio and Vertex policy drivers | P0 | P02-635, P02-636, P02-637, P02-639, P02-640 | G1 | OPEN | ~/0/0/?/0/?/? | Each surface/auth route independently classified and proven | Legacy Gemini adapter is not policy driver | 2026-07-26 |
| 2140 | P02-644 | P02-630 | PAEP | Cross-platform host credential custody adapters | P0 | P02-631, P02-635, P02-637 | G2,G1 | OPEN | ~/0/0/?/0/0/? | Linux keyring/file, macOS Keychain, Windows Credential Manager, WSL realm, vault/WIF | Legacy 644 | 2026-07-26 |
| 2150 | P02-645 | P02-630 | PAEP | Secure Worker Bridge transport matrix | P0 | P02-638, P02-639, P02-644 | G1 | OPEN | 0/0/0/?/0/0/? | UDS, Named Pipe ACL, ephemeral mTLS, WSL and Kubernetes transports with identity and cleanup | Legacy 645 | 2026-07-26 |
| 2160 | P02-646 | P02-630 | PAEP | Full provider fallback boundary authority | P0 | P02-634, P02-635, P02-636, P02-637, CM-03 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Account, billing, model, data, residency, exposure, approval, tools and budget jointly gated | Role fallback foundation is partial | 2026-07-26 |
| 2170 | P02-647 | P02-630 | PAEP | Recorded-fixture and real-process conformance kit | P0 | P02-637, P02-638, P02-639, P02-640, FO-11 | G1 | OPEN | ~/0/0/?/0/0/- | Adapter, protocol, bridge, replay, revocation, backpressure and secret-negative matrix | Legacy 647 | 2026-07-26 |
| 2180 | P02-648 | P02-630 | PAEP | Provider-scoped permissioned live behavioral canary parent | P0 | P02-648-CODEX, P02-648-CLAUDE, P02-648-GEMINI | G2,G1 | BLOCKED | 0/0/0/?/0/0/- | Each declared provider surface has independent canary and quarantine evidence | Live is distinct from hermetic CI | 2026-07-26 |
| 2181 | P02-648-CODEX | P02-648 | PAEP | Codex-scoped live behavioral canary | P0 | P02-642, P02-645, P02-647, P02-649, P02-651A, CODEX-C4 | G2,G1,G7 | BLOCKED | 0/0/0/?/0/0/- | Version, bridge, usage, cancellation and quarantine on exact Codex surface | No dependency on unrelated provider drivers | 2026-07-26 |
| 2182 | P02-648-CLAUDE | P02-648 | PAEP | Claude-scoped live behavioral canary | P0 | P02-641, P02-645, P02-647, P02-649, P02-651A | G2,G1,G7 | BLOCKED | 0/0/0/?/0/0/- | Version, bridge, usage, cancellation and quarantine on exact Claude surface | Independent provider canary | 2026-07-26 |
| 2183 | P02-648-GEMINI | P02-648 | PAEP | Gemini-scoped live behavioral canary | P0 | P02-643, P02-645, P02-647, P02-649, P02-651A | G2,G1,G7 | BLOCKED | 0/0/0/?/0/0/- | Version, bridge, usage, cancellation and quarantine on exact Gemini surface | Independent provider canary | 2026-07-26 |
| 2190 | P02-649 | P02-630 | PAEP | Reviewed provider policy evidence pipeline | P0 | P02-636, CODEX-COMPAT-POLICY-001 | G2,G1 | OPEN | ~/0/0/?/0/?/? | Official source digest, semantic diff, human review, signed decision, reviewBy and rollout scope; scoped compatibility evidence ingested without widening | Existing policy evidence foundation is not PAEP-wide | 2026-07-26 |
| 2200 | P02-650 | P02-630 | PAEP | Signed declarative policy packs and adapter supply chain | P1 | P02-636, P02-649 | G2,G1 | OPEN | 0/0/0/?/0/?/? | No executable policy payload; adapter digest, SBOM, signature and rollback | Legacy 650 | 2026-07-26 |
| 2210 | P02-651 | P02-630 | PAEP | Provider quarantine and emergency control plane parent | P0 | P02-651A, P02-651B | G2,G1 | BLOCKED | 0/0/0/?/0/?/? | Safety floor and every declared provider's scoped proof or owner-approved `DISPOSED` status complete | Legacy 651 | 2026-07-26 |
| 2211 | P02-651A | P02-651 | PAEP | Hermetic canary safety floor | P0 | P02-649, P02-650 | G1 | OPEN | 0/0/0/?/0/?/? | New-session stop, scoped kill switch, drain/cancel and quarantine work before any live canary | Required pre-live control plane | 2026-07-26 |
| 2212 | P02-651B | P02-651 | PAEP | Provider-scoped live quarantine proof aggregate | P0 | P02-651B-CODEX, P02-651B-CLAUDE, P02-651B-GEMINI | G2,G1 | BLOCKED | 0/0/0/?/0/?/? | Each declared provider is `DONE` or owner-approved `DISPOSED`; no cross-provider promotion coupling | Post-live aggregate; no provider call itself | 2026-07-26 |
| 2213 | P02-651B-CODEX | P02-651B | PAEP | Codex-scoped live quarantine and rollback proof | P0 | P02-648-CODEX, P02-650 | G2,G1,G7 | OPEN | 0/0/0/?/0/?/? | Failed Codex canary quarantines exact surface and rollback restores last-known-good | Policy-blocked/undeclared surface may become owner `DISPOSED` without a live call | 2026-07-26 |
| 2214 | P02-651B-CLAUDE | P02-651B | PAEP | Claude-scoped live quarantine and rollback proof | P0 | P02-648-CLAUDE, P02-650 | G2,G1,G7 | OPEN | 0/0/0/?/0/?/? | Failed Claude canary quarantines exact surface and rollback restores last-known-good | Policy-blocked/undeclared surface may become owner `DISPOSED` without a live call | 2026-07-26 |
| 2215 | P02-651B-GEMINI | P02-651B | PAEP | Gemini-scoped live quarantine and rollback proof | P0 | P02-648-GEMINI, P02-650 | G2,G1,G7 | OPEN | 0/0/0/?/0/?/? | Failed Gemini canary quarantines exact surface and rollback restores last-known-good | Policy-blocked/undeclared surface may become owner `DISPOSED` without a live call | 2026-07-26 |
| 2220 | P02-652 | P02-630 | PAEP | Provider protocol fidelity and performance evidence | P1 | P02-640, P02-642, P02-647, P02-648-CODEX | G2,G1,G7 | OPEN | ~/0/0/?/0/0/0 | Latency, throughput, cache/context overhead, cancellation and native fidelity with owner thresholds | Live baseline must precede threshold | 2026-07-26 |
| 2230 | P02-653 | P02-630 | PAEP | Credential exposure migration ladder | P0 | P02-632, P02-633, P02-642, P02-644 | G2,G3 | BLOCKED | 0/0/0/?/0/0/- | No credential deletion or login mutation; explicit compatibility warning and rollback | Fresh owner gate per credential surface | 2026-07-26 |
| 2240 | P02-654 | P02-630 | PAEP | Enterprise identity, region and policy adapters | P1 | P02-637, P02-644, P02-645, P02-649 | G2,G1 | OPEN | 0/0/0/?/0/0/0 | Vault/KMS, WIF, SPIFFE, tenant/region/residency and air-gapped governance | Legacy 654 | 2026-07-26 |
| 2250 | P02-655 | P02-630 | PAEP | Redacted provider-attempt audit | P0 | P02-638, P02-646, P02-649, P02-651 | G1 | OPEN | ~/0/0/?/0/?/? | Full authority provenance; schema rejects secrets, raw account IDs, prompt and response | Legacy 655 | 2026-07-26 |
| 2260 | P02-656 | P02-630 | PAEP | PAEP rollout readiness and legacy authority retirement | P0 | P02-648, P02-651, P02-652, P02-653, P02-654, P02-655, CODEX-C9 | G2,G5 | BLOCKED | 0/0/0/?/0/0/0 | Cross-platform canaries, migration rehearsal, quarantine, rollback and retirement receipt; product default flip remains CODEX-C10 | Legacy 656 | 2026-07-26 |

### P03 — Canonical execution kernel

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 3000 | KERNEL-001 | P03 | KERNEL | Goal→Mission→Flow→Run→WorkItem→Attempt→Operation canonical kernel parent | P0 | SSOT-003, TEST-675, TEST-676, CODEX-C5, APPROVAL-001, RECEIPT-001, LIMIT-001 | G2,G1 | BLOCKED | ~/~/~/?/0/?/? | One lifecycle, one state authority, one evidence chain and all-surface cutover | 2026-07-27 code-truth: Goal Mission doğrudan WorkItem üretir; RunFlow Mission/WorkItem ownership taşımaz; ScheduledFlow ayrı queue kavramıdır; Attempt claim-local, canonical Operation catalog absent; legacy 598,544 | 2026-07-27 |
| 3010 | KERNEL-ONTOLOGY-001 | KERNEL-001 | KERNEL | Canonical entity identities, ownership, transitions and invariants | P0 | SSOT-003, OPERATION-001 | G2,G1 | OPEN | ~/0/0/?/0/?/? | IDs and state machines are versioned; no competing nouns or implicit conversion | 2026-07-27 code-truth: `Flow` ScheduledFlow, RunFlow lifecycle ve autonomous trace için üç ayrı anlamda kullanılıyor; current entities arasında causal ownership yok | 2026-07-27 |
| 3020 | KERNEL-STATE-001 | KERNEL-001 | KERNEL | Durable event, snapshot and projection authority | P0 | KERNEL-ONTOLOGY-001 | G1 | OPEN | 1/~/~/?/0/?/? | CAS, transactions, schema migration, bounded reconciliation and no file RMW race | `receipt=GR-2026-07-28-FILE-LOCK-01`; execution-lock v3 uses project/lock-directory generation anchors, SQLite `BEGIN IMMEDIATE`, monotonic fencing, exact projection compensation/reconciliation, atomic v2 quarantine migration and 256-row keyset pages for active, migration, live quarantine and audit scans; projection ownership lookup is O(1), four focused migration/concurrency/release/scale regressions pass and root/dashboard TypeScript compile; this proves the Linux/WSL file-lock authority slice only—Goal-v2, RunFlow, CLI/REPL, sprint and ScheduledFlow remain competing authorities, native macOS/Windows adapters and live/HA scale evidence remain open; Claude Fable 5 XVerify emitted `require is not defined`, exceeded its 300s timeout and was interrupted, therefore cross-provider verification remains unavailable and is not claimed | 2026-07-28 |
| 3030 | KERNEL-ATTEMPT-001 | KERNEL-001 | KERNEL | Claim, lease, fencing, retry, cancellation and idempotency contract | P0 | KERNEL-STATE-001, AUTHORITY-001 | G1 | OPEN | 1/~/~/?/0/?/? | Duplicate effect impossible; unknown settlement never auto-replays | `receipt=GR-2026-07-28-FILE-LOCK-01`; exact-generation acquire/renew/release, liveness-aware stale retirement, irreversible boundary quarantine, terminal audit and completed-outcome preservation are code-present with cross-process and crash/reconciliation proof in the file-lock slice; whole-kernel closure remains open because v2 stop propagation, Mission cancel ingress, detached API RunFlow cancellation, tenant-wide idempotency and native macOS/Windows authority adapters are not yet proven | 2026-07-28 |
| 3040 | KERNEL-SETTLEMENT-001 | KERNEL-001 | KERNEL | Canonical result, evidence, acceptance and terminal settlement | P0 | KERNEL-ATTEMPT-001, RECEIPT-001 | G1 | OPEN | ~/~/0/?/0/?/? | Exactly-one terminal result, criterion evidence, usage and causal lineage | 2026-07-27 live forensic: pre-provider Codex budget rejectioni `run-1785148266632-0` artifact'ını process/log/result olmadan `PENDING` bıraktı; sprint `COMPLETE` cleanup/finalizer truth'ından önce yayınlanabiliyor | 2026-07-27 |
| 3050 | MISSION-KIND-001 | KERNEL-001 | KERNEL | First-class task, sprint, capability and process runners | P0 | KERNEL-ONTOLOGY-001, KERNEL-ATTEMPT-001 | G1 | OPEN | 1/~/0/?/0/?/? | Each kind has versioned admission, execute, recover and settle contract | 2026-07-27 code-truth: production registry yalnız `task`; v2 task executor koşulsuz HOLD; sprint/capability/process dispatch code-present fakat production registry'ye unwired; legacy 661/602 | 2026-07-27 |
| 3060 | GOAL-DAG-001 | KERNEL-001 | KERNEL | Normalized Goal dependency DAG and bounded reconciliation | P0 | KERNEL-STATE-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Indexed graph authority; self, missing, foreign and cycle fail-loud; migration explicit | ADR-G-038; legacy 600,628 | 2026-07-26 |
| 3070 | GOAL-POLICY-001 | KERNEL-001 | KERNEL | Runtime ApprovalBroker gate before claim | P0 | GOAL-DAG-001, APPROVAL-001 | G1 | OPEN | 1/~/0/?/0/?/? | Exactly-once request/decision, hydrate on restart, denial propagates | 2026-07-27 code-truth: CLI mission ingress `createdBy` üretmediğinden riskli v2 mission approval request fail-closed park eder; v1 API/MCP unknown decision ID'yi doğrulamadan yazabilir | 2026-07-27 |
| 3080 | GOAL-ACCEPTANCE-001 | KERNEL-001 | KERNEL | Criterion-level Goal acceptance evidence | P0 | KERNEL-SETTLEMENT-001 | G1 | OPEN | 1/~/0/?/0/?/? | Exact `--accept` reaches prompts, result evidence and durable evaluator receipt | Legacy 601 | 2026-07-26 |
| 3090 | GOAL-PROVIDER-001 | KERNEL-001 | KERNEL | Model, reachability, budget and receipt authority in Goal paths | P0 | CM-05, RECEIPT-001, LIMIT-001 | G1 | OPEN | ~/~/0/?/0/?/? | Author, accepter and item dispatch share canonical resolver and HOLD semantics | 2026-07-27 code-truth: v2 Goal author/accept ready authorityyi HOLD'a çevirirken one-shot `autonomous plan` provider'ı authority chain dışında çağırıyor; legacy 603 | 2026-07-27 |
| 3100 | GOAL-CRASH-001 | KERNEL-001 | KERNEL | Goal claim/effect/settlement crash idempotency | P0 | KERNEL-ATTEMPT-001 | G1 | OPEN | 1/~/0/?/0/?/? | Multi-process and tenant caps survive restart without duplicate side effect | 2026-07-27 code-truth: SQLite lease/CAS foundation var; Mission/WorkItem PK'leri tenant-composite değil, per-tenant pool cap absent ve ScheduledFlow cursor restart-durable değil | 2026-07-27 |
| 3110 | GOAL-CUTOVER-001 | KERNEL-001 | KERNEL | Autonomous plan and legacy backlog migration into canonical missions | P0 | GOAL-DAG-001, MISSION-KIND-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Transactional enqueue, explicit migration, no stranded mission or dual-write | 2026-07-27 code-truth: engine v2 config açıkken CLI/MCP/API status, backlog ve approval v1 store'u yönetiyor; explicit migration/retirement yok | 2026-07-27 |
| 3120 | GOAL-CANARY-001 | KERNEL-001 | KERNEL | Goal-v2 approval, dependency, receipt and recovery canaries | P0 | GOAL-POLICY-001, GOAL-ACCEPTANCE-001, GOAL-PROVIDER-001, GOAL-CRASH-001, GOAL-CUTOVER-001 | G2,G1 | BLOCKED | 0/0/0/?/0/0/- | Isolated read-only and docs-only real-binary runs before pool widening | 2026-07-27 live-state: active/pending v2 Mission, engine lease ve loop PID yok; executor/provider/surface/cancel gates kapanmadan autonomous/Flow provider canary başlatılmaz | 2026-07-27 |
| 3130 | RUNFLOW-001 | KERNEL-001 | KERNEL | Durable RunFlow coordinator as sole proposal/approval/run authority | P0 | KERNEL-STATE-001, KERNEL-SETTLEMENT-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | `do`, run, API, terminal and Desktop consume one service; legacy stores migrated | 2026-07-27 code-truth: CLI/REPL in-memory controller event log yazmıyor, API/Desktop durable coordinator kullanıyor; child completion empty log'da swallow, cancel execution'a ulaşmıyor, false-start mümkün | 2026-07-27 |
| 3140 | SCHEDULER-001 | KERNEL-001 | KERNEL | Pure reducer and typed effect executor scheduler cutover | P0 | KERNEL-ATTEMPT-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Shadow differential, rollback, checkpoint semantics and all dispatch sites | 2026-07-27 code-truth: reducer enabled fakat tüm typed effects/call sites tek authority değil; ScheduledFlow ilk tick'i epoch nedeniyle hemen due, cursor RAM-only ve durable occurrence/drain yok | 2026-07-27 |
| 3150 | RUNNER-PROTOCOL-001 | KERNEL-001 | KERNEL | SpawnBackend protocol v2 | P0 | KERNEL-ATTEMPT-001, FO-06 | G1 | OPEN | 1/~/0/?/0/0/? | Typed handle, lifecycle events, kill/adopt/settle, tmux exit/timeout parity and platform adapters | Legacy 584; residual from historical closed 466 | 2026-07-26 |
| 3160 | RECOVERY-001 | KERNEL-001 | KERNEL | Cross-surface recovery leadership and orphan containment | P0 | KERNEL-ATTEMPT-001, RUNNER-PROTOCOL-001 | G1 | OPEN | 1/~/0/?/0/0/? | Single leader per project/process realm; exact adoption or kill; no duplicate call | 2026-07-27 code-truth: automatic sprint recovery `complete` yolu evaluation→cleanup/finalizer'ı atlayabilir; CLI resume ayrı implementation; v2 stop marker ve stale one-shot settlement unwired | 2026-07-27 |
| 3170 | BUDGET-CONTINUATION-001 | KERNEL-001 | KERNEL | Landing, continuation reserve, task-kind budget sizing, timeout and measured termination contract | P0 | LIMIT-001, RUNNER-PROTOCOL-001 | G1 | OPEN | 1/~/0/?/0/?/? | Measured protocol-turn baseline sizes each task kind; no landing deadlock; timeout enforces; partial result settles honestly | 2026-07-27 live forensic: configured Codex budget, adapter live-usage capability absent olduğu için provider öncesi fail-closed; configured Docker/unmetered reroute ordinary one-shot'a uygulanmadı ve task terminalize olmadı | 2026-07-27 |
| 3180 | DO-CUTOVER-001 | KERNEL-001 | KERNEL | `do` becomes canonical intent→preview→approval→run journey | P0 | RUNFLOW-001, PLANNER-001 | G2,G1 | BLOCKED | 1/~/~/?/0/?/? | Golden-flow compatibility retired by evidence; interactive and non-interactive approval exact | 2026-07-27 code-truth: CLI prompt/topology/scope fail'lerini bloklarken Terminal card/controller yalnız topology gate ediyor; preview dry-run Brain debt state'ini mutate edebilir; execution canonical proof değil | 2026-07-27 |
| 3190 | AUTONOMY-CUTOVER-001 | KERNEL-001 | KERNEL | Autonomous and Nervous execution through canonical kernel | P0 | GOAL-CANARY-001, RECOVERY-001 | G2,G1 | BLOCKED | 1/~/~/?/0/?/? | Triggers create governed missions; no alternate backlog/effect engine; bounded safety canary | 2026-07-27 code/live truth: config `enabled=true, engine=v2`; v2 executor/provider authority HOLD, loop fiilen yok; CLI/MCP/API v1 control plane ve Flow bridge yalnız disabled v1 yolunda | 2026-07-27 |
| 3200 | PROCESS-CUTOVER-001 | KERNEL-001 | KERNEL | Process mode through canonical WorkItem and Attempt authority | P1 | MISSION-KIND-001, RECOVERY-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Sequential, parallel, rollback and compensation semantics explicit; all surfaces parity | Legacy process mode is partial | 2026-07-26 |
| 3210 | SURFACE-CUTOVER-001 | KERNEL-001 | KERNEL | CLI, MCP, API, terminal, Desktop and connector adapters share use cases | P0 | DO-CUTOVER-001, AUTONOMY-CUTOVER-001, PROCESS-CUTOVER-001 | G2,G1 | BLOCKED | ~/~/0/?/0/?/? | No surface-owned execution/state engine; parity and contract tests | 2026-07-27 code-truth: RunFlow coordinator, approval gates, autonomous status/approve, cancel, review/finalize/cleanup ve recovery semantics surface bazında ayrışıyor; dashboard read-only kalması intentional | 2026-07-27 |
| 3220 | PLANNER-001 | KERNEL-001 | KERNEL | Canonical planner authority and fail-loud structured parsing | P0 | KERNEL-ONTOLOGY-001, AUTHORITY-001 | G1 | BLOCKED | 1/~/0/?/0/?/? | Unknown headings never fall through to prose tasks; scope paths remain qualified; preview topology exact | Waits canonical ontology and authority | 2026-07-26 |
| 3230 | WORKER-REGISTRY-001 | KERNEL-001 | KERNEL | Durable Worker identity, claim, heartbeat, capability and settlement registry | P0 | KERNEL-ATTEMPT-001, PRINCIPAL-001 | G1 | OPEN | ~/~/0/?/0/?/? | Single authoritative worker/attempt state; no file-only split brain; recovery and tenancy proof | Code-truth audit | 2026-07-26 |
| 3240 | SPRINT-HONESTY-001 | KERNEL-001 | KERNEL | Sprint completion metrics, linger and partial-result truth | P0 | KERNEL-SETTLEMENT-001, WORKER-REGISTRY-001 | G1 | OPEN | 1/~/0/?/0/?/? | Summary includes pre-EVALUATE results; teardown linger root cause measured; no `0/N` false report | 2026-07-27 code-truth: `CLEANUP` phase enum'da yok; finalizer decay/COMPLETE/PID-checkpoint temizliğini delayed cleanup'tan önce yapıyor; finalizer failure marker'ı success'e dönebiliyor | 2026-07-27 |
| 3250 | WORKER-DISCOVERY-001 | KERNEL-001 | KERNEL | Bounded discovery and scope-aware Worker prompt contract | P1 | PLANNER-001, PROMPT-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Repo-wide scans require explicit scope; task-local discovery remains sufficient; violation evidence typed | Legacy 668 | 2026-07-26 |
| 3260 | RESULT-INGEST-001 | KERNEL-001 | KERNEL | Result identity normalization, quarantine and missing-trace root-cause closure | P0 | KERNEL-SETTLEMENT-001 | G1 | BLOCKED | 1/~/0/?/0/?/? | Expected task ID normalized/validated; malformed result quarantined; third missing-trace cause proven and fixed | Residual from historical closed 550 | 2026-07-26 |

### P04 — Runtime-wide authority and security

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 4000 | AUTHORITY-001 | P04 | AUTHORITY | Unified runtime authority parent | P0 | SSOT-003 | G2,G1 | OPEN | ~/~/~/?/0/?/? | Every operation binds principal, tenant, capability, approval, budget, receipt and audit | Code-truth audit | 2026-07-26 |
| 4010 | PRINCIPAL-001 | AUTHORITY-001 | AUTHORITY | VerifiedPrincipal across local, OIDC, workload and connector identities | P0 | SSOT-003 | G2,G1 | OPEN | ~/~/0/?/0/?/? | No header-derived or synthetic identity reaches authorization; provenance and assurance explicit | 2026-07-27 code-truth: CLI mission ingress `createdBy` üretmiyor; DO local/synthetic actor ile surface-specific coordinator'a giriyor; Terminal/API identity audit açık | 2026-07-27 |
| 4020 | TENANT-001 | AUTHORITY-001 | AUTHORITY | Canonical tenant/project/session scope enforcement | P0 | PRINCIPAL-001 | G1 | OPEN | 1/~/0/?/0/?/? | Read, write, event, memory, run, flow and admin paths share fail-closed scope; IDOR tests | 2026-07-27 code-truth: Flow raw tenant/id'yi path'e katıyor, iki store layout var, registry/scheduler yalnız flow.id ile key ediyor; Mission/WorkItem IDs global ve API strict tenant composition unwired | 2026-07-27 |
| 4030 | OPERATION-001 | AUTHORITY-001 | AUTHORITY | Versioned canonical operation catalog | P0 | PRINCIPAL-001 | G2,G1 | OPEN | 0/0/0/?/0/?/? | Every mutation/read/tool action maps to stable operation ID, risk and effect class | Code-truth audit found no canonical catalog | 2026-07-26 |
| 4040 | CAPABILITY-001 | AUTHORITY-001 | AUTHORITY | Capability authority and progressive disclosure contract | P0 | OPERATION-001, PRINCIPAL-001 | G2,G1 | OPEN | ~/0/0/?/0/?/? | Principal, tenant, operation, resource and environment resolve one scoped capability decision | Existing catalogs are fragmented | 2026-07-26 |
| 4050 | APPROVAL-001 | AUTHORITY-001 | AUTHORITY | Runtime-wide durable ApprovalBroker | P0 | PRINCIPAL-001, TENANT-001, OPERATION-001, CAPABILITY-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | CLI, terminal, Desktop, API, connectors, Worker and Nervous share CAS, expiry, relay and audit | 2026-07-27 code-truth: v2 request actor eksikliğinde park; v1 adapter unknown ID decision yazabiliyor ve API/MCP ingress bunu validate etmiyor; DO gate/revision semantics yüzeyler arasında drift | 2026-07-27 |
| 4060 | TOOL-AUTHORITY-001 | AUTHORITY-001 | AUTHORITY | Task/operation-scoped tool and MCP allowlist | P0 | CAPABILITY-001, APPROVAL-001 | G1 | OPEN | 1/~/0/?/0/?/? | Least privilege, progressive disclosure, explicit escape hatch and no hidden full surface | Legacy 559; terminal tool foundations | 2026-07-26 |
| 4070 | RECEIPT-001 | AUTHORITY-001 | AUTHORITY | Immutable InvocationReceipt for every provider call | P0 | PRINCIPAL-001, TENANT-001 | G1 | OPEN | 1/~/0/?/0/?/? | Requested/resolved/called identity, authority, fallback, usage and settlement provenance | Legacy 594 | 2026-07-26 |
| 4080 | REACHABILITY-001 | AUTHORITY-001 | AUTHORITY | Capability and account-scoped reachability truth | P0 | RECEIPT-001 | G1 | OPEN | 1/~/0/?/0/?/? | known, unknown, stale and unavailable with TTL and evidence; catalog is not reachability | Legacy 595 | 2026-07-26 |
| 4090 | LIMIT-001 | AUTHORITY-001 | AUTHORITY | Unified provider/account/tenant/project budget and limit ledger | P0 | RECEIPT-001, REACHABILITY-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | One host authority for admission, reservation, usage, landing and settlement | Legacy 577 absorbed by 597 | 2026-07-26 |
| 4100 | PROVIDER-INGRESS-001 | AUTHORITY-001 | AUTHORITY | Provider authority composition for all production ingress | P0 | RECEIPT-001, REACHABILITY-001, LIMIT-001 | G1 | BLOCKED | 1/1/0/?/0/?/? | Exact candidate, reservation, route lock, termination and receipt; no hold-only composition | 2026-07-27 code/live truth: provider wrapper yalnız run/start/do/xverify; resume dışarıda; ordinary Codex adapter route configured Docker/reroute'u bypass edip budget capability HOLD üretti; autonomous plan direct provider bypass açık | 2026-07-27 |
| 4110 | ATTENDED-STOP-001 | AUTHORITY-001 | AUTHORITY | Exact attended hard-stop approval authority | P0 | APPROVAL-001, LIMIT-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | No self-granted attendance; deadline and process-tree containment bound to attempt | Legacy 618; FO-07 consumer | 2026-07-26 |
| 4120 | AUDIT-001 | AUTHORITY-001 | AUTHORITY | Tamper-evident, tenant-scoped causal audit | P0 | RECEIPT-001, OPERATION-001 | G1 | OPEN | 1/~/0/?/0/?/? | Every decision/effect/settlement traceable; redaction schema and bounded retention | Existing audit systems fragmented | 2026-07-26 |
| 4130 | API-SECURITY-001 | AUTHORITY-001 | AUTHORITY | API authentication, authorization and config-secret containment | P0 | PRINCIPAL-001, TENANT-001, APPROVAL-001 | G1 | BLOCKED | 1/~/~/?/0/?/? | No raw config disclosure, IDOR, query-token persistence or unscoped admin action | 2026-07-27 code-truth: autonomous strict-tenant option composition root'a geçmiyor; v1 approval API unknown ID doğrulamıyor; identity/tenancy/approval authority closure bekleniyor | 2026-07-27 |
| 4140 | ENTERPRISE-AUTH-001 | AUTHORITY-001 | AUTHORITY | Community-safe and enterprise fail-closed profiles | P0 | TENANT-001, CAPABILITY-001, APPROVAL-001, AUDIT-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Advisory vs enforced is explicit; RBAC, least privilege and org freeze use same core | Legacy 534,570,497 | 2026-07-26 |
| 4150 | ALP-RUNTIME-001 | AUTHORITY-001 | AUTHORITY | Alp Discipline decision anchor in runtime agents and planners | P1 | OPERATION-001, APPROVAL-001 | G2,G6,G1 | OPEN | 1/0/0/?/0/?/? | Negative-space, authority stop and counterproposal are enforced and evidence-bearing | ESSENCE and memory exist; runtime wire absent | 2026-07-26 |
| 4160 | MCP-LEASE-001 | AUTHORITY-001 | AUTHORITY | Multi-window MCP writer lease and authority-safe read/write split | P1 | PRINCIPAL-001, OPERATION-001 | G1 | VERIFY | 1/~/~/?/0/?/? | Per-project single writer, graceful denial, process recovery and real multi-window proof | `historical-authority=legacy-578;historical-gates=G1;proof=delivery-claim`; delivered claim conflicts with current reverify need; no new write authority | 2026-07-26 |
| 4170 | APPROVAL-QOL-001 | AUTHORITY-001 | AUTHORITY | Approval classifier, cross-process expiry and notification dedupe closure | P1 | APPROVAL-001, MCP-LEASE-001 | G1 | BLOCKED | 1/~/0/?/0/?/? | Requests classify risk/action, expired decisions terminate loops across processes, notifications dedupe durably | Residual from historical closed 523 | 2026-07-26 |

### P05 — Terminal product and native development

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 5000 | TERMINAL-001 | P05 | TERMINAL | Terminal as canonical management and usage surface | P0 | KERNEL-001, AUTHORITY-001 | G2,G1 | BLOCKED | 1/~/~/?/0/?/? | Solo through enterprise journeys complete without CLI knowledge; full control and low cognitive load | Active direction; terminal code substantial | 2026-07-26 |
| 5010 | TERMINAL-TOOLS-001 | TERMINAL-001 | TERMINAL | Role-model tool surface and progressive disclosure | P0 | TOOL-AUTHORITY-001, SURFACE-CUTOVER-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Intent shows the smallest safe tool set; catalog/help explain capability and consequence | Existing registry and disclosure partial | 2026-07-26 |
| 5020 | TERMINAL-DEV-001 | TERMINAL-001 | TERMINAL | Full codebase development loop inside Deckent terminal | P0 | DO-CUTOVER-001, TERMINAL-TOOLS-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Inspect, plan, approve, edit, test, diff, review, commit handoff and resume journeys | Legacy 511 and 541 | 2026-07-26 |
| 5030 | TERMINAL-LIVE-001 | TERMINAL-001 | TERMINAL | Live Worker explanations, logs, progress and drill-down | P0 | WORKER-REGISTRY-001, KERNEL-SETTLEMENT-001 | G1 | OPEN | 1/~/0/?/0/?/? | Short human trace plus click-through detail, backpressure, resume and redaction | Legacy 582 | 2026-07-26 |
| 5040 | TERMINAL-REPL-001 | TERMINAL-001 | TERMINAL | REPL cursor, queue, streaming, cancellation and context stability | P1 | TERMINAL-LIVE-001 | G1 | OPEN | 1/~/~/?/0/?/? | Long-session soak, Unicode, resize, pipe/EPIPE, cancellation and recovery | Legacy F11-016 | 2026-07-26 |
| 5050 | TERMINAL-REF-001 | TERMINAL-001 | TERMINAL | `@` references for files, resources, agents and skills | P1 | TERMINAL-TOOLS-001 | G1 | OPEN | 0/0/0/?/0/?/? | Fuzzy discovery, bounded injection, multiple refs, permissions and i18n | Legacy 508 | 2026-07-26 |
| 5060 | TERMINAL-ONBOARD-001 | TERMINAL-001 | TERMINAL | Conversational setup, doctor and capability discovery | P0 | CM-01, PRINCIPAL-001 | G2,G1 | OPEN | 1/~/~/?/0/0/? | Safe enablement, auth status, global/project scope, honest unsupported states | Legacy 202,203 | 2026-07-26 |
| 5070 | TERMINAL-AUTH-001 | TERMINAL-001 | TERMINAL | Provider login/session binding and real auth probes | P0 | P02-635, P02-644 | G2,G1 | BLOCKED | 1/~/0/?/0/0/? | No hidden login mutation; exact account authority, expiry, revoke and doctor proof | Legacy 206,576 | 2026-07-26 |
| 5080 | NATIVE-DEV-001 | TERMINAL-001 | TERMINAL | Deckent terminal plus Desktop as Deckent's own primary development environment | P0 | TERMINAL-DEV-001, DESKTOP-001 | G2,G1 | BLOCKED | ~/~/0/?/0/0/? | Five-day real dogfood, recovery, performance, accessibility and fallback evidence | Legacy 583; no premature VS Code removal | 2026-07-26 |
| 5090 | TERMINAL-XPLAT-001 | TERMINAL-001 | TERMINAL | Native terminal platform and accessibility certification | P0 | TERMINAL-REPL-001, ENV-ADAPTER-001 | G1 | OPEN | ~/~/~/?/0/0/? | Linux/macOS/Win-native/WSL shells, screen readers, keyboard, contrast and locale | Every-environment law | 2026-07-26 |
| 5100 | TERMINAL-CONTEXT-001 | TERMINAL-001 | TERMINAL | Multi-project, multi-session, local/remote and attach/detach context management | P0 | TERMINAL-REPL-001, PRINCIPAL-001, TENANT-001 | G2,G1 | OPEN | 1/~/~/?/0/0/? | Context always visible; project/account/provider mix-ups impossible; crash-safe resume and handoff | Solo and enterprise dual lens | 2026-07-26 |
| 5110 | TERMINAL-COLLAB-001 | TERMINAL-001 | TERMINAL | Solo, team and enterprise collaboration without operator overload | P1 | TERMINAL-CONTEXT-001, APPROVAL-001, AUDIT-001 | G2,G1 | OPEN | ~/0/0/?/0/0/? | Presence, ownership, approvals, handoff, review and policy are role-aware and progressively disclosed | Million-user product requirement | 2026-07-26 |

### P06 — Shared application services, Desktop, API, connectors and dashboard

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 6000 | SURFACES-001 | P06 | PRODUCT | Shared product surfaces parent | P0 | KERNEL-001, AUTHORITY-001 | G2,G1 | BLOCKED | ~/~/~/?/0/?/? | Desktop, API, connectors and dashboard consume common services and identity | Legacy SURF train and code-truth audit | 2026-07-26 |
| 6010 | APP-SERVICE-001 | SURFACES-001 | PRODUCT | Typed application-service layer | P0 | SURFACE-CUTOVER-001 | G2,G1 | OPEN | ~/0/0/?/0/?/? | Propose, approve, start, cancel, inspect and settle use cases independent of transport/UI | 2026-07-27 code-truth: CLI/REPL RunFlow controller, API coordinator, autonomous v1/v2 control ve Flow queue ayrı services; cancel/settle/status canonical use case değil | 2026-07-27 |
| 6020 | SURFACE-CONTRACT-001 | SURFACES-001 | PRODUCT | Versioned surface capability and truth receipts | P0 | APP-SERVICE-001, RECEIPT-001 | G1 | OPEN | 1/~/0/?/0/?/? | Every response/event carries identity, flow/run/attempt IDs, capability and evidence provenance | Legacy 566,569 | 2026-07-26 |
| 6030 | DESKTOP-001 | SURFACES-001 | DESKTOP | First-class Desktop architecture and product foundation | P0 | APP-SERVICE-001, ENV-ADAPTER-001 | G2,G1 | OPEN | 1/~/~/?/0/0/? | Electron security, IPC tiers, theme/i18n/accessibility and shared service authority | Legacy 496,536 | 2026-07-26 |
| 6040 | DESKTOP-RUNTIME-001 | DESKTOP-001 | DESKTOP | Managed-local, attach-local and remote managed runtime profiles | P0 | APP-SERVICE-001, ENV-ADAPTER-001, RUNNER-PROTOCOL-001 | G2,G1 | OPEN | 1/~/0/?/0/0/? | No Node/PATH burden in managed-local; version handshake, upgrade, rollback and honest unsupported | Legacy 585 | 2026-07-26 |
| 6050 | DESKTOP-SECURITY-001 | DESKTOP-001 | DESKTOP | Desktop session, IPC, deep-link, update and event-stream security | P0 | PRINCIPAL-001, API-SECURITY-001 | G1 | OPEN | 1/~/~/?/0/0/? | No persistent token in URL; origin/session binding; signed update and renderer isolation | Legacy 586 and code audit | 2026-07-26 |
| 6060 | DESKTOP-ENTERPRISE-001 | DESKTOP-001 | DESKTOP | Enterprise Desktop governance and fleet operation | P1 | DESKTOP-RUNTIME-001, DESKTOP-SECURITY-001, ENTERPRISE-AUTH-001 | G2,G1 | OPEN | 0/0/0/?/0/0/0 | Policy, identity, tenancy, audit, deployment, support bundle and admin controls | Legacy 588 | 2026-07-26 |
| 6070 | DESKTOP-REBORN-001 | DESKTOP-001 | DESKTOP | Unique, accessible and function-complete Desktop experience | P0 | DESKTOP-RUNTIME-001, DESKTOP-SECURITY-001, SURFACE-CONTRACT-001 | G2,G1 | OPEN | 1/~/~/?/0/0/? | Product journeys and visual system approved; no dashboard wrapper; function parity and soak | Legacy 589 supersedes visual direction of 536 | 2026-07-26 |
| 6080 | API-CONTRACT-001 | SURFACES-001 | API | Versioned public/internal API and event contracts | P0 | APP-SERVICE-001, SURFACE-CONTRACT-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Schema compatibility, idempotency, pagination, SSE/WebSocket resume, errors and SDK generation | API surface audit | 2026-07-26 |
| 6090 | API-IDENTITY-001 | SURFACES-001 | API | OIDC, workload identity, tenant authorization and rate enforcement | P0 | PRINCIPAL-001, TENANT-001, API-SECURITY-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Browser, service and enterprise identities share VerifiedPrincipal; no raw-header trust | Dashboard/API OIDC and IDOR gaps | 2026-07-26 |
| 6100 | CONNECTOR-IDENTITY-001 | SURFACES-001 | CONNECTOR | Gateway and connector session identity, pairing and approval authority | P0 | PRINCIPAL-001, APPROVAL-001, APP-SERVICE-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Telegram, Discord, WhatsApp and future adapters bind tenant/project/session/user and replay protection | Code-truth audit | 2026-07-26 |
| 6110 | DASHBOARD-OBS-001 | SURFACES-001 | DASHBOARD | Dashboard as honest, read-oriented observability projection | P1 | SURFACE-CONTRACT-001, AUDIT-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | No fake/proxy metrics or second execution engine; freshness, empty/error states and tenant scope | 2026-06 delivered items preserved; residuals revalidate | 2026-07-26 |
| 6120 | SURFACE-PARITY-001 | SURFACES-001 | PRODUCT | Capability-by-capability parity and intentional negative-space matrix | P0 | DESKTOP-REBORN-001, API-CONTRACT-001, CONNECTOR-IDENTITY-001, DASHBOARD-OBS-001 | G2,G1 | BLOCKED | 0/0/0/?/0/0/? | Each use case names canonical service, supported surfaces and reasoned exclusions | 2026-07-27 code-truth: start/approve/cancel/status/review/finalize/cleanup/resume semantics CLI, MCP, API, Terminal ve Desktop arasında farklı; dashboard read-only intentional negative-space | 2026-07-27 |
| 6130 | API-EVENT-001 | SURFACES-001 | API | Durable asynchronous jobs, event streams, webhooks and outbox delivery | P0 | API-CONTRACT-001, KERNEL-SETTLEMENT-001, STORAGE-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Resume cursors, ordering, dedupe, retry/dead-letter, signing, backpressure and tenant isolation | God-level API requirement | 2026-07-26 |
| 6140 | API-DEVELOPER-001 | SURFACES-001 | API | OpenAPI, generated SDKs, CLI/MCP parity and compatibility lifecycle | P1 | API-CONTRACT-001, SURFACE-PARITY-001 | G2,G1 | OPEN | ~/0/0/?/0/0/? | Stable schemas, typed clients, examples, deprecation windows, contract tests and migration guides | Every-language developer surface | 2026-07-26 |
| 6150 | API-OPERATIONS-001 | SURFACES-001 | API | Quotas, pagination, bulk operations, idempotency and regional operations | P0 | API-IDENTITY-001, LIMIT-001, API-EVENT-001 | G2,G1 | OPEN | 1/~/0/?/0/0/0 | Fairness, abuse controls, tenant limits, request tracing, admin audit and scale tests | Solo-to-enterprise API requirement | 2026-07-26 |
| 6160 | SURFACE-ADAPTER-001 | SURFACES-001 | PRODUCT | Web, mobile, voice, chat, IDE, CI and ERP thin-adapter expansion | P1 | APP-SERVICE-001, SURFACE-CONTRACT-001, CAPABILITY-001 | G2,G1 | OPEN | ~/0/0/?/0/0/? | Each adapter is capability-declared, identity-bound, accessible and contains no alternate core | “Every surface” product target | 2026-07-26 |

### P07 — Ecosystem and supply-chain trust

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 7000 | ECOSYSTEM-001 | P07 | ECOSYSTEM | Governed agent, skill, plugin, tool, MCP and extension ecosystem | P0 | P02-647, SURFACE-CUTOVER-001, CAPABILITY-001, AUDIT-001 | G2,G1 | OPEN | ~/~/~/?/0/?/? | Provenance, install, permissions, sandbox, update, revoke and quarantine are one trust plane | Code-truth audit | 2026-07-26 |
| 7010 | AGENT-SKILL-001 | ECOSYSTEM-001 | ECOSYSTEM | Role/capability-complete agent and skill catalog | P1 | CAPABILITY-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Manifests versioned; task role/skill selection measured; no catalog inflation or dead entries | Legacy 85 | 2026-07-26 |
| 7020 | SUPPLY-CHAIN-001 | ECOSYSTEM-001 | SECURITY | Signed agent, skill and plugin provenance | P0 | AGENT-SKILL-001, P02-650 | G2,G1 | OPEN | ~/0/0/?/0/?/? | Publisher identity, digest, SBOM, permissions, review, update and revoke chain | Code-truth audit P0 | 2026-07-26 |
| 7030 | PLUGIN-SANDBOX-001 | ECOSYSTEM-001 | SECURITY | Plugin/skill runtime sandbox and capability enforcement | P0 | SUPPLY-CHAIN-001, TOOL-AUTHORITY-001 | G2,G1 | OPEN | ~/0/0/?/0/0/? | Filesystem, network, secret, process and tenant permissions fail-closed across platforms | Existing compile/audit controls insufficient | 2026-07-26 |
| 7040 | MCP-TRUST-001 | ECOSYSTEM-001 | SECURITY | Outgoing MCP trust, identity and data-boundary authority | P0 | PRINCIPAL-001, CAPABILITY-001, SUPPLY-CHAIN-001 | G2,G1 | OPEN | ~/0/0/?/0/?/? | Server provenance, tool risk, user consent, egress policy, schema/version and revoke | Code-truth audit P0 | 2026-07-26 |
| 7050 | HUB-001 | ECOSYSTEM-001 | ECOSYSTEM | Production-ready Deckent Hub and signed distribution | P1 | SUPPLY-CHAIN-001, PLUGIN-SANDBOX-001 | G2,G5 | BLOCKED | ~/~/0/?/0/?/? | Real key custody, package signing, verification, tenancy, moderation and rollback | Legacy 503; owner key decision required | 2026-07-26 |
| 7060 | TOOL-COMPUTER-001 | ECOSYSTEM-001 | TOOL | Optional computer-use/browser automation pack | P2 | TOOL-AUTHORITY-001, PLUGIN-SANDBOX-001 | G2,G1 | OPEN | 1/~/0/?/0/0/? | Explicit install/approval, isolated permissions, replay-resistant audit and platform truth | Legacy 83 | 2026-07-26 |
| 7070 | PROVIDER-EXTENSION-001 | ECOSYSTEM-001 | PROVIDER | OpenRouter and future provider extensions through PAEP | P1 | P02-637, P02-646, P02-647 | G2,G1 | OPEN | 1/~/0/?/0/?/? | No bespoke bypass; exact model/reachability/usage/policy conformance | Legacy 477 | 2026-07-26 |
| 7080 | IDE-ADAPTER-001 | ECOSYSTEM-001 | SURFACE | VS Code, JetBrains and future IDE adapters as non-canonical clients | P2 | APP-SERVICE-001, SURFACE-CONTRACT-001 | G2,G1 | OPEN | 1/~/0/?/0/0/? | Thin adapters, no second engine; capability matrix and honest support lifecycle | Legacy 64; native Deckent remains primary | 2026-07-26 |
| 7090 | ORPHAN-WIRE-001 | ECOSYSTEM-001 | TRUTH | Production import graph orphan disposition and wiring | P0 | REPO-CLEANUP-001, SURFACE-CUTOVER-001 | G2,G1 | BLOCKED | 1/~/0/?/0/?/? | Each deliverable wired, intentionally public or owner-disposed; fresh-clone reachability proof | Waits cleanup manifest and surface cutover | 2026-07-26 |

### P08 — Every environment, distribution, documentation and release

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 8000 | EVERY-ENV-001 | P08 | XPLAT | Every-environment architecture and release parent | P0 | SSOT-003, TEST-PLATFORM-001 | G2,G1 | OPEN | ~/~/~/?/0/0/0 | Supported/degraded/unsupported matrix for every declared component and surface | Immutable law 2 | 2026-07-26 |
| 8010 | ENV-ADAPTER-001 | EVERY-ENV-001 | XPLAT | PlatformAdapter contracts for process, paths, locks, IPC, credentials, terminal and services | P0 | KERNEL-001, AUTHORITY-001 | G2,G1 | OPEN | 1/~/~/?/0/0/? | No platform branch outside adapter boundary; unsupported fails honestly | Code-truth audit Docker/Desktop gaps | 2026-07-26 |
| 8020 | INSTALL-SCOPE-001 | EVERY-ENV-001 | ONBOARDING | Global install plus project-scoped state and learning | P0 | ENV-ADAPTER-001, MEMORY-AUTHORITY-001 | G2,G1 | OPEN | 1/~/~/?/0/0/? | npm/package/app installers, state dirs, multi-project isolation, upgrades and rollback | Active direction and legacy onboarding | 2026-07-26 |
| 8030 | PLATFORM-PROOF-001 | EVERY-ENV-001 | XPLAT | Cross-platform CI, real-binary and hardware/OS certification | P0 | ENV-ADAPTER-001, TEST-PLATFORM-001 | G1 | OPEN | ~/~/0/?/0/0/? | Linux, macOS, Windows native, WSL, Docker and declared remote matrix with artifacts | No single-host inference | 2026-07-26 |
| 8040 | PACKAGING-001 | EVERY-ENV-001 | RELEASE | CLI, daemon, Desktop, service and container packaging supply chain | P0 | INSTALL-SCOPE-001, SUPPLY-CHAIN-001 | G2,G1 | OPEN | 1/~/0/?/0/0/? | Reproducible signed artifacts, SBOM, provenance, update channels and rollback | Current npm/release state requires rebaseline | 2026-07-26 |
| 8050 | DOCS-PRODUCT-001 | EVERY-ENV-001 | DOCS | Current code-truth architecture, guide, reference and operations docs | P0 | DOCS-ADR-SYNC-001, DOCS-I18N-001, SURFACE-PARITY-001 | G1 | BLOCKED | ~/~/0/?/0/0/? | Six-language, generated where safe, examples executable, stale counts absent | Legacy 489,495,507 | 2026-07-26 |
| 8060 | RELEASE-001 | EVERY-ENV-001 | RELEASE | Unified validate, soak, publish and rollback gate | P0 | TRUTH-BASELINE-001, PLATFORM-PROOF-001, PACKAGING-001, DOCS-PRODUCT-001 | G2,G5 | BLOCKED | ~/~/0/?/0/0/0 | 72h declared-platform soak, zero release blocker, signed artifacts, owner publish approval | Legacy 535 | 2026-07-26 |
| 8070 | REPO-MIGRATION-001 | EVERY-ENV-001 | REPO | Rebaseline and execute repository cutover | P1 | REPO-CLEANUP-APPLY-001, DOCS-TOPOLOGY-001, MEMORY-AUTHORITY-001 | G2,G5 | BLOCKED | 0/0/0/?/0/?/? | Current target, source set, history, remotes, docs, memory, rollback and read-only transition approved | Legacy 488 schedule expired unexecuted | 2026-07-26 |
| 8080 | OPERATIONS-PACK-001 | EVERY-ENV-001 | OPS | Install, backup, restore, diagnostics, support bundle and disaster recovery | P1 | PACKAGING-001, STATE-RETENTION-001, AUDIT-001 | G2,G1 | OPEN | ~/~/0/?/0/0/? | Solo one-command and enterprise managed paths; encrypted/redacted support; recovery drills | Scale and every-environment requirement | 2026-07-26 |

### P09 — Learning, routing, prompting and evolution

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 9000 | LEARNING-001 | P09 | LEARNING | Closed, governed learning and evolution parent | P0 | KERNEL-001, AUDIT-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Outcome evidence changes routing/promotion only through eval, canary, rollback and owner policy | Existing loop partial; training trace unwired | 2026-07-26 |
| 9010 | TRAINING-TRACE-001 | LEARNING-001 | LEARNING | Training trace wired from attempt to accepted outcome | P0 | KERNEL-SETTLEMENT-001, RECEIPT-001 | G1 | OPEN | 1/0/0/?/0/?/? | Prompt/config/tools/evidence/verdict lineage, consent, redaction and retention | Active direction; current trace unwired | 2026-07-26 |
| 9020 | PROMPT-001 | LEARNING-001 | PROMPT | Compiled prompt contract and conflict-free task instructions | P0 | KERNEL-ONTOLOGY-001, ALP-RUNTIME-001 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Canonical acceptance, authority, context budget and role sections; no append-only contradiction; representative 10-task golden set | Legacy 573/580; residual from historical closed 442 | 2026-07-26 |
| 9030 | ROUTING-001 | LEARNING-001 | ROUTING | Routing V3 quality, diversity and evidence-driven adaptation | P0 | PROMPT-001, AGENT-SKILL-001, REACHABILITY-001 | G2,G1 | OPEN | 1/1/~/?/0/?/? | Intent, role, skills, model, cost, capability and anti-collapse decisions measured; all fallback chains avoid role/tool mismatch; rollbackable | Legacy 581; residual from historical closed 537; routing_engine removal superseded | 2026-07-26 |
| 9040 | EVALUATION-001 | LEARNING-001 | EVAL | Canonical evaluator, adversarial verification and proof boundary | P0 | KERNEL-SETTLEMENT-001, CM-04 | G2,G1 | OPEN | 1/~/~/?/0/?/? | Code, live, user and independent-verifier evidence never conflated; false GO/NO_GO calibrated | Xverify and Brain evaluation residuals | 2026-07-26 |
| 9050 | PROMOTION-001 | LEARNING-001 | EVOLUTION | Outcome→routing→agent/skill/model promotion and rollback | P0 | TRAINING-TRACE-001, ROUTING-001, EVALUATION-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Statistical confidence, tenant isolation, shadow/canary, human policy and automatic rollback | Closed-loop claim not fully wired | 2026-07-26 |
| 9060 | LEARNING-DOGFOOD-001 | LEARNING-001 | LEARNING | Historical dogfood findings atomized and regression-proofed | P1 | PROMPT-001, ROUTING-001, KERNEL-001 | G1 | OPEN | 1/~/0/?/0/?/? | Legacy 591 findings routed to owning IDs; no composite residual remains | `.analysis/dogfood-449-*` | 2026-07-26 |
| 9070 | FINE-TUNE-001 | LEARNING-001 | LEARNING | Deckent-core fine-tune only after trace/data/governance readiness | P2 | TRAINING-TRACE-001, PROMOTION-001, DATA-GOV-001 | G2,G6 | OPEN | 0/0/0/?/0/?/? | Dataset rights, privacy, eval uplift, rollback and serving economics proven before scheduling | Legacy SP2-FT; dependency-gated, not date-deferred | 2026-07-26 |

### P10 — Durability, million-scale assurance and enterprise operations

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth C/W/E/H/L/X/S | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 10000 | SCALE-001 | P10 | SCALE | Million-scale assurance parent | P0 | SSOT-003, TRUTH-BASELINE-001 | G2,G1 | OPEN | ~/~/0/?/0/0/0 | Capacity, reliability, security, data, cost and operations thresholds owner-signed and proven | Immutable laws; code-truth audit | 2026-07-26 |
| 10010 | STORAGE-001 | SCALE-001 | DURABILITY | Transactional durable state backend and migration strategy | P0 | KERNEL-STATE-001, TENANT-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | SQLite single-node and enterprise distributed adapter boundaries; no unsafe full-file RMW | Code-truth audit persistence P0 | 2026-07-26 |
| 10020 | DATA-GOV-001 | SCALE-001 | DATA | Tenant data lifecycle, retention, encryption, residency and deletion authority | P0 | TENANT-001, STORAGE-001, STATE-RETENTION-001 | G2,G1 | OPEN | ~/~/0/?/0/0/0 | Classification, legal hold, key rotation, export/delete and audit across all stores | Enterprise and privacy requirement | 2026-07-26 |
| 10030 | HA-001 | SCALE-001 | RESILIENCE | Multi-node coordination, HA, failover and disaster recovery | P0 | STORAGE-001, KERNEL-ATTEMPT-001 | G2,G1 | OPEN | 0/0/0/?/0/0/0 | Leader/fencing, regional failure, backup/restore and RPO/RTO drills | File/process-local authorities are current limit | 2026-07-26 |
| 10040 | SLO-001 | SCALE-001 | OBS | Product and platform SLI/SLO/error-budget contract | P0 | SURFACE-CONTRACT-001, AUDIT-001 | G2,G1 | OPEN | ~/0/0/?/0/?/? | Availability, latency, correctness, queue, settlement and recovery SLOs baseline-derived | Legacy 569; thresholds not guessed | 2026-07-26 |
| 10050 | LOAD-CHAOS-001 | SCALE-001 | ASSURANCE | Load, soak, fault, chaos and noisy-neighbor certification | P0 | HA-001, SLO-001, PLATFORM-PROOF-001 | G2,G1 | OPEN | 0/0/0/?/0/0/0 | Solo to enterprise scenarios, million-project model, cancellation storms, provider outage and recovery | No synthetic scale claim without evidence | 2026-07-26 |
| 10060 | COST-001 | SCALE-001 | COST | Provider, compute, storage and operator cost authority | P1 | LIMIT-001, SLO-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Actual billed/estimated split, cache/context/turn attribution, tenant budgets and forecast accuracy | Legacy 529,554,577 | 2026-07-26 |
| 10070 | ENTERPRISE-MODULARITY-001 | SCALE-001 | ENTERPRISE | Solo/community/enterprise module boundaries without core forks | P0 | ENTERPRISE-AUTH-001, STORAGE-001 | G2,G1 | OPEN | 1/~/0/?/0/?/? | Same core contracts; enterprise adds governance depth; license/deploy boundaries explicit | Legacy 497,534,570 | 2026-07-26 |
| 10080 | ASSURANCE-PACK-001 | SCALE-001 | ASSURANCE | Security, privacy, reliability, performance and compliance evidence pack | P0 | DATA-GOV-001, LOAD-CHAOS-001, P02-655 | G2,G1 | OPEN | 0/0/0/?/0/0/0 | Reproducible evidence, independent review, threat models, incident drills and customer-facing claims | Required before god-level completion claim | 2026-07-26 |

## 8. Legacy reconciliation manifest

Source archive has exactly 324 work rows:

- 125 active/partial/deferred/research claims.
- 199 historical completion claims.
- Active-ID sorted manifest SHA-256: `264b248f79c6ff17d2ca47a6bb603172df00f35870c9f976281f2440fa070b19`.
- Completed-ID sorted manifest SHA-256: `95e481012d23a33e682f63d8bff679986141b8e40511ef5ef85f2ca38df6b310`.
- Digest serialization: exact legacy IDs bytewise ascending, UTF-8, joined by `\n`,
  with one final `\n`, then SHA-256.

### 8.1 Active alias reconciliation

All 125 active aliases are assigned exactly once:

```text
P00 TRUTH [10]
TEST-SUITE-WIPES-DIST-MIDRUN
TEST-SUITE-WRITES-LIVE-TASKS
XVERIFY-CLI-FILES-SILENT-REQUIREMENT
XVERIFY-DISPATCH-REJECTION-MISCLASS
SPRINT-CLOSE-HONESTY + LINGER-PROBE
PLANNER-SILENT-FALLBACK + XVER-EVIDENCE-TARGETING
DOCS-GROUNDTRUTH-P0
W4-DOCS-TRUTH
RECLASSIFY-191-196-FOLLOWUP
DOCS-CLI-REF-CONSOLIDATE

P01 CODEX-CUTOVER [8]
XVER-SPRINT-WIRE
XVER-CODEX-INCREMENTAL-METERING
XVER-CODEX-VERIFIER-ENABLEMENT
PROVIDER-TRUTH
ROLE-AWARE-PROVIDER-FALLBACK
CANONICAL-MODEL-API-ID
XVERIFY-TOOL
MODEL-ROLE-POLICY

P02 PAEP [29]
PROVIDER-AUTHORITY-KEYRING-PROVISIONING
EXEC-PLANE-ALLOW-PATH-ABSENT
PROVIDER-AUTHORITY-PLANE
PAEP-ADR
AUTH-FAIL-CLOSED
AUTH-EXPOSURE-CLASS
PROVIDER-SURFACE-REGISTRY
AUTH-STRATEGY-REGISTRY
PROVIDER-POLICY-REGISTRY
PROVIDER-ADAPTER-SPI
PROVIDER-SESSION-LEASE
WORKER-EXEC-PROTOCOL
WORKER-MCP-BRIDGE
CLAUDE-HOST-DRIVER
CODEX-HOST-DRIVER
GEMINI-POLICY-DRIVER
AUTH-CUSTODY-PLATFORM
PAEP-TRANSPORT-MATRIX
PAEP-FALLBACK-BOUNDARY
PAEP-CONTRACT-CONFORMANCE
PAEP-LIVE-CANARY
PAEP-POLICY-EVIDENCE
PAEP-SIGNED-POLICY-PACK
PAEP-QUARANTINE
PAEP-PERF-FIDELITY
PAEP-MIGRATION
PAEP-ENTERPRISE-IDENTITY
PAEP-AUDIT-REDACTION
PAEP-ROLLOUT

P03 EXECUTION-KERNEL [21]
WORKER-BOUNDED-DISCOVERY
BUDGET-PROFILE-RESIZE + SPRINT-TIMEOUT-INERT
LANDING-CONTINUATION-DEADLOCK
MISSION-KIND-COMPLETENESS
GOAL-V2-NORMALIZED-DAG-DECISION
CROSS-SURFACE-DOCKER-RECOVERY-LEADERSHIP
GRACEFUL-BUDGET-LANDING
SCHED-REDUCER
SCHED-610-REMAINDERS
TERM-RUNFLOW
RUNNER-PROTO-V2
GOAL-V2-HARDENING
GOAL-V2-POLICY-APPROVAL
GOAL-V2-DEPENDENCY-DAG
GOAL-V2-ACCEPTANCE-EVIDENCE
GOAL-V2-KIND-SNAPSHOT
GOAL-V2-MODEL-LIMIT-RECEIPT
GOAL-V2-CRASH-IDEMPOTENCY
GOAL-V2-PLAN-CUTOVER
GOAL-V2-CANARY
RUNFLOW-COLLISION-TOPOLOGY-TRUTH

P04 RUNTIME-AUTHORITY [15]
XVER-PRODUCTION-INGRESS-COMPOSITION
API-CHAT-PROVIDER-AUTHORITY
XVER-STRICT-RUNTIME-AUTHORITY
ATTENDED-HARD-STOP-APPROVAL-AUTHORITY
PROVIDER-LIMIT-AUTHORITY-ENVELOPE
PROVIDER-AUTHORITY-RUNTIME-COMPOSITION
SUBSCRIPTION-COST-PREFLIGHT-TRUTH
METERING-TRUTH
LIMIT-LEDGER-P2P3
MCP-WRITER-LEASE
INVOCATION-RECEIPT
CAPABILITY-REACHABILITY-TRUTH
XVER-CAPABILITY-EQUIVALENCE
UNIFIED-LIMIT-LEDGER
PROMPT-READONLY-XVERIFY-BUDGET

P05 TERMINAL [7]
TERM-DEV-LOOP-GAPS
REPL-DECK-KEY-VERIFY
F11-016
ONB-CHAT
PSL-6
W1-EXPERIENCE-ON
TERM-AT-REF

P06 DESKTOP-API [10]
DESK-2
SURF-TRENİ
WORKER-LIVE-LOG
NATIVE-DEV-ENV
DESK-MANAGED-RUNTIME
SSE-AUTH-V2
APP-SVC-LAYER-OTEL
DESKTOP-ENT
DESKTOP-REBORN
DESK-1

P07 ECOSYSTEM-TRUST [10]
TOOL-ALLOWLIST
ANTHROPIC-CREDIT-HEDGE
CHAT-IDE
TOOL-CU
AGSK-1
OPENROUTER-PROVIDER
ORPHAN-WIRE
W2-WIRE
HUB-P0
DEADCODE-AUDIT-DYNAMIC-SCAN

P08 EVERY-ENV-RELEASE [4]
RELEASE-UNIFY
ONB-2
REPO-MIGRATION
W7-REPO-CLEANUP

P09 LEARNING [6]
PCOMP-6
PCOMP-8
ROUTING-V3
DOGFOOD-449-BULGULAR
ALP-DISCIPLINE
SP2-FT

P10 SCALE-ASSURANCE [5]
COST-10X
ENT-FAILCLOSED
OBS-EVIDENCE-LEDGER
ENT-TRUTH-0
MODULARIZE
```

Exact active alias mapping:

```text
TEST-SUITE-WIPES-DIST-MIDRUN -> TEST-676 -> direct residual
TEST-SUITE-WRITES-LIVE-TASKS -> TEST-675,TEST-HERMETIC-001 -> split writer fix and general ratchet
XVERIFY-CLI-FILES-SILENT-REQUIREMENT -> XVERIFY-UX-001 -> direct UX contract
XVERIFY-DISPATCH-REJECTION-MISCLASS -> XVERIFY-TRUTH-001,CM-03,CM-04,P02-646 -> rejection semantics plus entitlement-aware independent fallback boundary
SPRINT-CLOSE-HONESTY + LINGER-PROBE -> SPRINT-HONESTY-001 -> merged closure truth
PLANNER-SILENT-FALLBACK + XVER-EVIDENCE-TARGETING -> PLANNER-001,XVERIFY-UX-001 -> split by authority
DOCS-GROUNDTRUTH-P0 -> DOCS-RELEASE-TRUTH-001,DOCS-PRODUCT-001 -> split generator and product docs
W4-DOCS-TRUTH -> DOCS-RELEASE-TRUTH-001,DOCS-PRODUCT-001 -> normalized parent outcomes
RECLASSIFY-191-196-FOLLOWUP -> REPO-CLEANUP-001,ORPHAN-WIRE-001 -> revalidate then wire/dispose
DOCS-CLI-REF-CONSOLIDATE -> DOCS-RELEASE-TRUTH-001,DOCS-PRODUCT-001 -> generator authority
XVER-SPRINT-WIRE -> XVERIFY-WIRE-001 -> direct all-sprint ingress
XVER-CODEX-INCREMENTAL-METERING -> IM-01,IM-02,IM-03,IM-04,IM-05,IM-06,IM-07 -> seven-stage promotion
XVER-CODEX-VERIFIER-ENABLEMENT -> CM-04,FO-01,FO-02,FO-03,FO-04,FO-05,FO-06,FO-07,FO-08,FO-09,FO-10,FO-10-I18N,FO-11,XVERIFY-WIRE-001 -> compatibility split
PROVIDER-TRUTH -> CM-01,CM-02,CM-05 -> runtime, entitlement and ingress truth
ROLE-AWARE-PROVIDER-FALLBACK -> CM-03,P02-646 -> no-silence plus permanent authority
CANONICAL-MODEL-API-ID -> CM-01 -> canonical resolver
XVERIFY-TOOL -> CM-04,XVERIFY-WIRE-001,EVALUATION-001 -> independence, wiring and semantics
MODEL-ROLE-POLICY -> CM-01,CM-02,ROUTING-001 -> exact identity and routing
PROVIDER-AUTHORITY-KEYRING-PROVISIONING -> PA-662 -> direct projection
EXEC-PLANE-ALLOW-PATH-ABSENT -> CODEX-ADMISSION-001,PROVIDER-INGRESS-001 -> scoped canary plus canonical ingress
PROVIDER-AUTHORITY-PLANE -> P02-630 -> direct parent
PAEP-ADR -> P02-631 -> direct
AUTH-FAIL-CLOSED -> P02-632 -> direct
AUTH-EXPOSURE-CLASS -> P02-633 -> direct
PROVIDER-SURFACE-REGISTRY -> P02-634 -> direct
AUTH-STRATEGY-REGISTRY -> P02-635 -> direct
PROVIDER-POLICY-REGISTRY -> P02-636 -> direct
PROVIDER-ADAPTER-SPI -> P02-637 -> direct
PROVIDER-SESSION-LEASE -> P02-638 -> direct
WORKER-EXEC-PROTOCOL -> P02-639 -> direct
WORKER-MCP-BRIDGE -> P02-640 -> direct
CLAUDE-HOST-DRIVER -> P02-641 -> direct
CODEX-HOST-DRIVER -> P02-642 -> direct
GEMINI-POLICY-DRIVER -> P02-643 -> direct
AUTH-CUSTODY-PLATFORM -> P02-644 -> direct
PAEP-TRANSPORT-MATRIX -> P02-645 -> direct
PAEP-FALLBACK-BOUNDARY -> P02-646 -> direct
PAEP-CONTRACT-CONFORMANCE -> P02-647 -> direct
PAEP-LIVE-CANARY -> P02-648,P02-648-CODEX,P02-648-CLAUDE,P02-648-GEMINI -> provider-scoped split
PAEP-POLICY-EVIDENCE -> P02-649 -> direct
PAEP-SIGNED-POLICY-PACK -> P02-650 -> direct
PAEP-QUARANTINE -> P02-651,P02-651A,P02-651B -> safety-floor and live-proof split
PAEP-PERF-FIDELITY -> P02-652 -> direct
PAEP-MIGRATION -> P02-653 -> direct
PAEP-ENTERPRISE-IDENTITY -> P02-654 -> direct
PAEP-AUDIT-REDACTION -> P02-655 -> direct
PAEP-ROLLOUT -> P02-656 -> readiness; product flip remains CODEX-C10
WORKER-BOUNDED-DISCOVERY -> WORKER-DISCOVERY-001 -> direct
BUDGET-PROFILE-RESIZE + SPRINT-TIMEOUT-INERT -> BUDGET-CONTINUATION-001,WORKER-DISCOVERY-001 -> timeout enforcement plus task-kind sizing
LANDING-CONTINUATION-DEADLOCK -> BUDGET-CONTINUATION-001 -> live residual
MISSION-KIND-COMPLETENESS -> MISSION-KIND-001 -> superseding residual
GOAL-V2-NORMALIZED-DAG-DECISION -> GOAL-DAG-001 -> direct ADR projection
CROSS-SURFACE-DOCKER-RECOVERY-LEADERSHIP -> RECOVERY-001 -> direct
GRACEFUL-BUDGET-LANDING -> BUDGET-CONTINUATION-001 -> foundation
SCHED-REDUCER -> SCHEDULER-001 -> direct parent
SCHED-610-REMAINDERS -> SCHEDULER-001 -> residual
TERM-RUNFLOW -> RUNFLOW-001,DO-CUTOVER-001 -> coordinator plus user journey
RUNNER-PROTO-V2 -> RUNNER-PROTOCOL-001 -> direct
GOAL-V2-HARDENING -> KERNEL-001,GOAL-DAG-001,GOAL-POLICY-001,GOAL-ACCEPTANCE-001,GOAL-PROVIDER-001,GOAL-CRASH-001,GOAL-CUTOVER-001,GOAL-CANARY-001 -> atomized parent
GOAL-V2-POLICY-APPROVAL -> GOAL-POLICY-001 -> direct
GOAL-V2-DEPENDENCY-DAG -> GOAL-DAG-001 -> direct
GOAL-V2-ACCEPTANCE-EVIDENCE -> GOAL-ACCEPTANCE-001 -> direct
GOAL-V2-KIND-SNAPSHOT -> MISSION-KIND-001 -> merged with 661
GOAL-V2-MODEL-LIMIT-RECEIPT -> GOAL-PROVIDER-001 -> direct
GOAL-V2-CRASH-IDEMPOTENCY -> GOAL-CRASH-001 -> direct
GOAL-V2-PLAN-CUTOVER -> GOAL-CUTOVER-001 -> direct
GOAL-V2-CANARY -> GOAL-CANARY-001 -> direct
RUNFLOW-COLLISION-TOPOLOGY-TRUTH -> RUNFLOW-001,KERNEL-ATTEMPT-001 -> topology and collision authority
XVER-PRODUCTION-INGRESS-COMPOSITION -> PROVIDER-INGRESS-001 -> superseding composition
API-CHAT-PROVIDER-AUTHORITY -> CM-05,PROVIDER-INGRESS-001,RECEIPT-001 -> all-ingress authority
XVER-STRICT-RUNTIME-AUTHORITY -> PROVIDER-INGRESS-001 -> absorbed by canonical ingress
ATTENDED-HARD-STOP-APPROVAL-AUTHORITY -> ATTENDED-STOP-001 -> direct
PROVIDER-LIMIT-AUTHORITY-ENVELOPE -> LIMIT-001,PROVIDER-INGRESS-001 -> ledger plus ingress binding
PROVIDER-AUTHORITY-RUNTIME-COMPOSITION -> PROVIDER-INGRESS-001 -> direct
SUBSCRIPTION-COST-PREFLIGHT-TRUTH -> LIMIT-001,COST-001 -> admission and accounting
METERING-TRUTH -> LIMIT-001,COST-001 -> authority and cost truth
LIMIT-LEDGER-P2P3 -> LIMIT-001 -> absorbed residual
MCP-WRITER-LEASE -> MCP-LEASE-001 -> direct revalidation
INVOCATION-RECEIPT -> RECEIPT-001 -> direct
CAPABILITY-REACHABILITY-TRUTH -> REACHABILITY-001 -> direct
XVER-CAPABILITY-EQUIVALENCE -> CM-04,P02-646 -> independent equivalent fallback
UNIFIED-LIMIT-LEDGER -> LIMIT-001 -> direct
PROMPT-READONLY-XVERIFY-BUDGET -> TOOL-AUTHORITY-001,LIMIT-001,XVERIFY-WIRE-001 -> split by authority
TERM-DEV-LOOP-GAPS -> TERMINAL-DEV-001,DO-CUTOVER-001 -> product loop and kernel
REPL-DECK-KEY-VERIFY -> TERMINAL-AUTH-001 -> auth-bound verification
F11-016 -> TERMINAL-REPL-001 -> direct
ONB-CHAT -> TERMINAL-ONBOARD-001 -> direct
PSL-6 -> TERMINAL-AUTH-001 -> direct
W1-EXPERIENCE-ON -> TERMINAL-001,TERMINAL-TOOLS-001 -> normalized product gate
TERM-AT-REF -> TERMINAL-REF-001 -> direct
DESK-2 -> DESKTOP-001,DESKTOP-REBORN-001 -> foundation plus current experience
SURF-TRENİ -> SURFACES-001,SURFACE-CONTRACT-001,SURFACE-PARITY-001 -> normalized surface program
WORKER-LIVE-LOG -> TERMINAL-LIVE-001 -> canonical consumer
NATIVE-DEV-ENV -> NATIVE-DEV-001 -> direct
DESK-MANAGED-RUNTIME -> DESKTOP-RUNTIME-001 -> direct
SSE-AUTH-V2 -> DESKTOP-SECURITY-001,API-CONTRACT-001 -> transport and API contract
APP-SVC-LAYER-OTEL -> APP-SERVICE-001,SURFACE-CONTRACT-001 -> service and telemetry split
DESKTOP-ENT -> DESKTOP-ENTERPRISE-001 -> direct
DESKTOP-REBORN -> DESKTOP-REBORN-001 -> direct
DESK-1 -> DESKTOP-001 -> foundation
TOOL-ALLOWLIST -> TOOL-AUTHORITY-001 -> direct
ANTHROPIC-CREDIT-HEDGE -> CM-03,P02-646 -> governed fallback, no standalone hedge engine
CHAT-IDE -> IDE-ADAPTER-001 -> thin adapter
TOOL-CU -> TOOL-COMPUTER-001 -> direct
AGSK-1 -> AGENT-SKILL-001,SUPPLY-CHAIN-001 -> catalog plus trust
OPENROUTER-PROVIDER -> PROVIDER-EXTENSION-001 -> PAEP extension
ORPHAN-WIRE -> ORPHAN-WIRE-001 -> direct
W2-WIRE -> ORPHAN-WIRE-001,SURFACE-CUTOVER-001 -> wiring plus canonical services
HUB-P0 -> HUB-001 -> direct
DEADCODE-AUDIT-DYNAMIC-SCAN -> REPO-CLEANUP-001,ORPHAN-WIRE-001 -> graph-driven disposition
RELEASE-UNIFY -> RELEASE-001 -> direct
ONB-2 -> TERMINAL-ONBOARD-001,INSTALL-SCOPE-001 -> product and distribution
REPO-MIGRATION -> REPO-MIGRATION-001 -> rebaseline before execute
W7-REPO-CLEANUP -> REPO-CLEANUP-001,REPO-CLEANUP-APPLY-001 -> manifest plus apply
PCOMP-6 -> PROMPT-001 -> residual carried into current prompt contract
PCOMP-8 -> PROMPT-001 -> superseding prompt design
ROUTING-V3 -> ROUTING-001 -> direct
DOGFOOD-449-BULGULAR -> LEARNING-DOGFOOD-001,ROUTING-001,BUDGET-CONTINUATION-001 -> split by owner
ALP-DISCIPLINE -> ALP-RUNTIME-001 -> runtime enforcement
SP2-FT -> FINE-TUNE-001 -> dependency-gated future outcome
COST-10X -> COST-001 -> direct
ENT-FAILCLOSED -> ENTERPRISE-AUTH-001 -> direct
OBS-EVIDENCE-LEDGER -> SLO-001,SURFACE-CONTRACT-001 -> metrics and evidence
ENT-TRUTH-0 -> ENTERPRISE-AUTH-001,ENTERPRISE-MODULARITY-001 -> assurance and architecture
MODULARIZE -> ENTERPRISE-MODULARITY-001 -> direct
```

### 8.2 Historical completion residual audit

The 199 completed aliases remain byte-preserved in the archive as `historical-closed-claim`.
They are not copied into the forward ledger because their long chronology was the primary
machine-readability failure. The read-only audit partitions the exact 199-ID set into three
disjoint classes; digests use §8 serialization:

| Class | Count | Sorted-ID SHA-256 | Disposition |
|---|---:|---|---|
| No residual assertion in source row | 157 | `9b41d6a6d61441a935dd7df15a84a1e463a5825d1fa15cc03453552c443b9335` | Historical claim preserved; current readiness is never inferred |
| Chronology marker self-resolved or already forward-owned | 36 | `a60c9412f251de94aafe31b1b1ae31abaaaf68140e9a337fa664f9abc75db3e8` | Later evidence in the row closes it, or the exact active/canonical owner below carries it |
| Hidden residual promoted to canonical outcome | 6 | `50302809a341fcbda754c2524d9969470311b278af8a90ebed2a0083c8cb92b5` | Exact mapping below; historical row is not rewritten |

The 36 chronology-marker aliases are:

```text
XVERIFY-REFUSAL-IDENTITY-UNSTRUCTURED
MODEL-TIER-REGISTRATION-ORDER
WORKER-MEMORY-CONFIG-WIRING
WORKTREE-DOGFOOD-BINARY-AUTHORITY
TOOL-ENGINE-PARITY
SCHED-TRUTH
TRACE-CONTENT
NESTED-DISPATCH-HONESTY
RC-TRAIN
HOST-LIFECYCLE
REDACT-PREFIX
DEP-BUMP-TRAIN
TT555-WIRE
ZERO-HARDCODE-MODEL
APPROVAL-EXPIRY
TERM-CAT
TERM-RESUME
TERM-BUSY
PROVIDER-SSOT
F11-014
TERM-NAT
F7-004
APR-ALLOWSCOPE
APPROVE-007b
CKPT-1
DEFER-001
TRN-3
TOOL-REG
TOOL-4
ONB-HONEST
PKG-NAME-SSOT
MOAT-2
SPAWN-THROW-HANG
EVAL-DEBT-CEILING
LIMIT-PREFLIGHT
BUILTINS-RECONCILE
```

Forward-owned marker families resolve as follows; the remaining names in the 36-ID set close
later in their own source row or in the explicitly named historical successor:

| Historical marker family | Current owner |
|---|---|
| `MODEL-TIER-REGISTRATION-ORDER` | CM-02, CM-03, CM-04 |
| `WORKTREE-DOGFOOD-BINARY-AUTHORITY` | OPS-BRANCH-001, PACKAGING-001, RELEASE-001 |
| `SCHED-TRUTH` | SCHEDULER-001 |
| `TRACE-CONTENT`, `TRN-3` | TRAINING-TRACE-001 |
| `RC-TRAIN` | RELEASE-001 |
| `ZERO-HARDCODE-MODEL` | ZERO-HARDCODE-PROVIDER-001, ZERO-HARDCODE-FLOW-001 |
| `PROVIDER-SSOT` | CM-05 |
| `TERM-NAT` | TERMINAL-REPL-001, ORPHAN-WIRE-001 |
| `EVAL-DEBT-CEILING` | EVALUATION-001, DEBT-GOVERNANCE-001 |

The six hidden residuals are promoted exactly once:

| Historical closed alias | Canonical owner | Preserved residual |
|---|---|---|
| `PCOMP-W2-DOC-STEP-CONTRADICTION` (440) | DOC-IMPACT-001 | Finalizer must surface governed `docImpact` |
| `PCOMP-W4-TIERED-INJECTION` (442) | PROMPT-001 | Representative ten-task golden regression set |
| `WRAPPER-EXITCODE-MASK` (466) | RUNNER-PROTOCOL-001 | tmux exit/timeout parity |
| `APPROVAL-QOL` (523) | APPROVAL-QOL-001 | Classifier, cross-process expiry and notification dedupe |
| `FALLBACK-WRITE-DENIED` (537) | ROUTING-001 | Every fallback chain avoids role/tool mismatch |
| `RESULT-INGEST-IDNORM` (550) | RESULT-INGEST-001 | Identity normalization and third missing-trace cause |

This audit closes source-reconciliation coverage, not present-day implementation truth. Current
code/live regressions remain governed by the canonical ledger and code-truth baseline.

## 9. Supersession and deduplication register

| Source claim | Canonical disposition | Reason |
|---|---|---|
| Handover Codex Brain plus Claude Worker | `superseded-by: CODEX-MAIN-001` | New owner decision makes Brain, Worker, chat and native Codex |
| Handover Codex-first xverify priority | `superseded-by: CM-04` | Codex-authored work requires independent provider verification |
| Legacy 661 and 602 | `merged-into: MISSION-KIND-001` | Same four WorkItemKind outcomes; 661 is residual, not a second engine |
| Legacy 671 candidate choice, 596 and 607 | `merged-into: XVERIFY-TRUTH-001, CM-03, CM-04, P02-646` | Rejection truth and entitlement-aware ordered candidate fallthrough must not duplicate fallback logic |
| Legacy 673 and 660 evidence targeting | `split-into: XVERIFY-UX-001, PLANNER-001` | Optional-files contract, bounded targeting and planner truth are distinct acceptance criteria |
| Legacy 664 and 613 | `residual-of: BUDGET-CONTINUATION-001` | Live deadlock residual after graceful-landing foundation |
| Legacy 665 | `split-into: BUDGET-CONTINUATION-001, WORKER-DISCOVERY-001` | Timeout enforcement and task sizing have different owners |
| Legacy 619 and 629 | `superseded-by: PROVIDER-INGRESS-001` | 629 is composition continuation; no parallel ingress implementation |
| Legacy 577 and 597 | `merged-into: LIMIT-001` | One unified ledger authority |
| Legacy 527 and 528 | `merged-into: SCHEDULER-001` | 528 is reducer train residual |
| Legacy 573 and 580 | `merged-into: PROMPT-001` | PCOMP-8 supersedes design; open residuals survive |
| Legacy 591 | `split-into: LEARNING-DOGFOOD-001, ROUTING-001, BUDGET-CONTINUATION-001` | Dogfood reconciliation, routing and timeout/continuation have exact owners |
| Legacy 496, 536, 566, 588 and 589 | `normalized-under: DESKTOP-001, SURFACES-001` | Foundation, shared surface, enterprise and current product/visual direction are one DAG |
| Legacy 489, 495 and 507 | `normalized-under: DOCS-RELEASE-TRUTH-001, DOCS-PRODUCT-001` | Parent/child docs truth, not parallel backlogs |
| Legacy 534, 570 and 497 | `normalized-under: ENTERPRISE-AUTH-001, ENTERPRISE-MODULARITY-001` | Enforcement, product truth and architecture remain distinct children |
| Legacy 579 | `absorbed-by: CM-03, P02-646` | Provider hedge is the governed fallback boundary, not a standalone speculative implementation |
| 2026-07-21 “remove routing_engine” | `superseded-by: ROUTING-001` | Current code/legacy 581 proves routing_engine fields remain live |
| 2026-06 dashboard RBAC/rate/dead-bar gaps | `historical-delivered` | Same-night report and current history record delivery |
| Remaining old dashboard mutations | `revalidate-under: DASHBOARD-OBS-001` | Dashboard is observability after Terminal/Desktop pivot |
| 2026-07-21 docs→docs1 decision | `revalidate-under: DOCS-TOPOLOGY-001` | Consumer graph and live specs changed materially |
| 2026-07-21 script deletions | `revalidate-under: SCRIPT-LIFECYCLE-001` | Several scripts are current proof harnesses |
| 2026-07-22 cleanup/prune actions | `approved-unexecuted; gated-by: G3–G6` | Exact targets and shared worktree state drifted |
| 2026-07-26 repository migration date | `expired-schedule; gated-by: REPO-MIGRATION-001` | Origin, archive remote, docs and memory migration did not occur |

## 10. Current stop lines

| Stop line | Current truth | Remedy owner |
|---|---|---|
| Shared worktree drift | Multiple dirty files/worktrees and concurrent sessions exist | P00 collision protocol |
| Config/runtime policy drift | Owner-approved local config now uses Sol Brain in every mode, hard worker ceiling 6 and Claude→Codex verifier priority; gitignored projection and all-ingress runtime truth remain unproven | CM-01, CM-05 |
| Test side effects | Suite writes live `.tasks` and has observed `dist` wipe | TEST-675, TEST-676 |
| Provider ingress | Production composition is HOLD-only; no real ALLOW | PA-662, CODEX-ADMISSION-001, PROVIDER-INGRESS-001 |
| Codex usage | Worker adapter has no enforceable incremental metering | FO chain, then IM chain |
| Codex landing | Adapter has no unattended checkpoint-stop capability | FO-07B |
| Final-only Worker policy | Current scoped authorization covers Auditor, not Worker | FO-12 |
| Live provider authority | No current `G7` receipt exists; every paid/external stage is HOLD | Exact per-stage G7 receipt, never this plan receipt |
| Credential isolation | Docker copies Codex auth into worker-private HOME | P02-632, P02-633, P02-642, P02-653 |
| Independent verification | Local config and pure selector now reject same-provider verification; exact Fable/Sol authority, all-ingress wiring and live settlement remain unproven | CM-04, XVERIFY-WIRE-001 |
| Execution ontology | Goal, mission, autonomous, flow, run, process and sprint remain partially separate | KERNEL-001 |
| Persistent goal lifecycle | Owner resumed the existing detailed goal, but the session API still reports `blocked` and exposes no truthful active transition; false `complete` is forbidden | KERNEL-STATE-001, GOAL-CRASH-001 |
| Product surfaces | Terminal/Desktop/API have substantial code but not one application-service cutover | P05, P06 |

No sprint is promoted past its applicable stop line. Bypass, budget removal, fake capability
declaration or silent fallback is not an accepted remedy.

## 11. Persistent goal

> Deckent'i Codex-main, dogfood-first, provider-neutral ve every-environment bir Agent OS
> olarak; canonical Goal→Mission→Flow→Run→WorkItem→Attempt→Operation execution kernelinden
> Terminal, Desktop, API ve diğer yüzeylere kadar tek authority üzerinde güvenli, durable,
> multi-tenant, i18n-clean ve scale-proven hâle getirmek; MASTER-PLAN'daki her atomik işi
> code-present→wired→enabled→hermetic-proven→live-proven→cross-platform-proven→scale-proven
> evidence ile `DONE` veya
> owner-approved `DISPOSED` durumuna taşımak.

**Goal lifecycle truth:** persistent session goal aynı objective ve thread kimliğiyle mevcuttur.
Owner 2026-07-27'de açıkça resume etmiştir; session API'nin `blocked` projection'ı current owner
intent'i temsil etmez ve goal'ın tamamlandığı anlamına gelmez. API aktif transition sunana kadar
aynı objective bu MASTER addendum'u ve current execution plan ile sürdürülür; goal sahte biçimde
`complete` yapılmaz ve ayrıntısı azaltılmış yeni goal ile değiştirilmez.

**Token budget:** owner tarafından ayrıca verilmedi; artificial token-stop yoktur.

### 11.1 Owner-approved execution addendum — 2026-07-27

1. **Dogfood mandatory.** Her implementation slice Deckent'in kendi
   Goal/Mission/Flow/Run/Autonomous/Do yüzeyleriyle planlanır, yürütülür, değerlendirilir ve
   settlement'a taşınır. Manuel müdahale yalnız typed ve kayda alınmış bootstrap/recovery/düzeltme
   seam'idir; ilk güvenli sınırda yeniden dogfood'a dönmek zorundadır.
2. **Sol Brain supervision.** GPT-5.6 Sol PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP
   lifecycle'ının status, heartbeat, usage/limit, Nervous, disk diff, result ve settlement
   kanıtlarını izler. Sentetik agent verdict'ü disk truth olmadan promotion authority değildir.
3. **Heterojen six-worker ceiling.** Codex ve Claude worker'lar birlikte kullanılır; hard parallel
   ceiling 6'dır. Claude Sonnet 5 genel implementation, Opus 5 seçili yüksek-risk inceleme;
   Codex Terra genel worker ve Sol derin kernel/Brain işi taşır. Slot sayısı hedef değil üst
   sınırdır: dependency, collision, entitlement, reachability veya finite budget uygun değilse
   dispatch edilmez.
4. **Strict provider separation.** XVerify çıktıyı üreten provider'dan farklı provider'da yapılır.
   Codex/Sol çıktısının default exact verifier'ı Claude Fable 5, seçili derin incelemede Opus 5;
   Claude çıktısının verifier'ı tier-uygun Codex Terra/Sol'dur. Same-provider self-verify ve sessiz
   fallback yasaktır; fresh ikinci-provider authority yoksa typed `unavailable/HOLD` üretilir.
5. **Usage-aware control.** Her provider dispatch'i exact model, auth/account, reachability,
   limit, finite budget ve settlement authority'sine bağlıdır. Brain kendi ve Claude usage
   kapasitesini sprint admission'ında ve canlı izleme sırasında değerlendirir; limit zorlanmaz.
6. **Proof ladder.** Dogfood sonucu ancak
   code-present→wired→enabled→hermetic-proven→live-proven→cross-platform-proven→scale-proven
   zinciri ve exact evidence ile promotion alır. Manuel düzeltme veya tek test yeşili `DONE`
   üretmez.

**Execution method:** bounded Deckent dogfood sprints + GPT-5.6 Sol supervision + disk-truth review +
strict cross-provider XVerify + exact-file-approved typed manual recovery.

**Completion reporting:** “bitti” yalnız §1 finish contract'ı ve ledger closure report'u ile söylenir.

## 12. Update protocol

Her implementation slice için:

1. Başlangıç HEAD, branch, worktree ve target hashes kaydedilir.
2. Exact Work ID'ler `DIRECTIVES.md` projection'ına atomik task DAG olarak çıkarılır.
3. Alperen start gate'i olmadan sprint başlatılmaz.
4. Supervisor canlı status, heartbeat, budget, logs, diffs ve provider truth'u izler.
   Parallel worker hard ceiling 6'dır; daha düşük safe concurrency normaldir.
5. Brain verdict disk truth ile karşılaştırılır; sentetik GO/NO_GO tek başına authority değildir.
   XVerify provider'ı task producer provider'ından farklı olmak zorundadır.
6. Sprint, agent veya manual repair fark etmeksizin her write exact `G1 FILE` approval'ına bağlıdır.
7. Targeted, affected, binary, live ve platform proofs ayrı provenance ile çalıştırılır.
8. Residual aynı gün yeni child olur; `DONE` hücresine gömülmez.
9. MASTER update, review, retro ve yalnız istenmişse commit/push yapılır.
10. Bir sonraki slice yalnız dependency ve promotion gate'leri gerçekten sağlandıysa seçilir.
