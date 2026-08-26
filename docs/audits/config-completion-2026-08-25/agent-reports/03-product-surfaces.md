# Config completion audit — product ve operator yüzeyleri

**Lane:** CLI / init / onboarding / MCP / API / Dashboard / Desktop / docs / feature-truth / approval ve execution authority

**Pinned evidence:** `audit/config-completion-20260825` @ `ff48978fb78139ea34b8c5e98fc41532437af9c9`

**Input:** `evidence/project-config.corrupted-backup.input.json` @ `sha256:34b6a7c25bca9a02ff2901682868e86ad4fc3bead05b2c4e5061cb249a686edb`

**Verdict:** **NO-GO — “config product surface complete” denemez.** Audit lane'i tamamlandı; bu rapor ürün kodunu değiştirmez.

## 1. Sonuç

Deckent'in config contractı type/default/consumer açısından geniş, operator yüzeyleri açısından parçalıdır. Final shared inventory `DeckentConfig` için 1.002 finite/wildcard leaf-pattern ve artifact quarantine sonrası bütün union için 1.146 path gösterir. Default parser 180 raw leaf bulur; bunların ikisi synthetic spread artifact olarak quarantine edilince 178 normalized default path kalır. Runtime parser artifact sayısı ayrıca altıdır. `CONFIG_METADATA` yalnız 55 default-bearing entry üretir; pinned input 197 leaf taşır (`field-universe.json:1`, `CONFIG-FIELD-MATRIX.md:3-21`). Matrix bütün 1.146 satır için declaration, default, validation, effective resolution, behavioral consumer, operator surface, docs, tests ve lifecycle/migration olmak üzere dokuz typed evidence dimension taşır (`CONFIG-FIELD-MATRIX.md:25-29`). Public `deckent config keys/list` yalnız metadata tablosunu dolaştığı için var olan ve çalışan alanları discovery yüzeyinden saklar (`src/cli/commands/config.ts:215-241`, `src/core/config.ts:2821-2895`).

Daha ağır problem, authoring ile consumption'ın aynı semantik gate'i paylaşmamasıdır. Real-binary isolated probe'da:

- `deckent config set routing_v3.explorationBonus 2` başarıyla persist etti; sonraki `get` `Invalid routing_v3 config … <= 1` ile kapandı.
- `deckent config set totally_unknown.foo true` başarıyla persist etti; sonraki `get` `Key not found` verdi.
- Aynı dosyada `config migrate --dry-run` “already up to date” dedi ve `config keys` `routing_v3` alanlarını hiç listelemedi.

Kod zinciri bunu deterministik açıklıyor: CLI arbitrary dot-path'i yazar, yalnız `validatePartialConfig()` çağırır ve success basar (`src/cli/commands/config.ts:119-157`); validator defaultlarla merge edip geniş fakat open-world/manual `validateConfig()` ile yetinir (`src/core/config.ts:724-1682`, `src/core/config.ts:2651-2678`). `routing_v3`'ün strict Zod/range gate'i ancak effective resolver object kurulurken çağrılır (`src/core/config.ts:2498-2502`, `src/core/routing/config.ts:35-48`, `src/core/routing/config.ts:124-165`). Unknown root da validator tarafından reddedilmez ve explicit resolved projection'a dahil edilmediği için `get`te kaybolur (`src/core/config.ts:2363-2530`). Migration yalnız defaults'tan eksik alan/legacy alias/duplicate varlığını inceler; semantic usability veya metadata coverage kontrol etmez (`src/core/config-migration.ts:100-172`, `src/core/config-migration.ts:199-285`). Bu **PS-001 / BLOCKS_CURRENT_DONE**'dır: bir public write path “başarılı” diyerek bir sonraki public read'i zehirleyebilir veya yazdığı değeri görünmez kılabilir.

İkinci blocking authority açığı, secure approval broker ile legacy checkpoint mutation'ın paralel karar protokolleri olmasıdır. `deckent_approvals` bilerek read-only ve MCP self-approval'a kapalıdır (`src/mcp/tools/approvals.ts:13-30`); CLI approval decision canlı TTY re-auth ve authority window ister (`src/cli/commands/approvals.ts:1-11`, `src/cli/commands/approvals.ts:245-291`). Buna karşın `deckent_checkpoint approve/reject` aynı MCP processinden yalnız checkpoint JSON'unu değiştirir; live auth, principal-bound decision envelope veya broker yoktur (`src/mcp/tools/checkpoint.ts:52-74`, `src/mcp/tools/checkpoint.ts:78-148`). CLI checkpoint de doğrudan dosya mutation'ıdır (`src/cli/commands/checkpoint.ts:48-62`, `src/cli/commands/checkpoint.ts:135-173`). Federation'ın authenticated kararı checkpoint formatına yazabilmesi doğru entegrasyon seam'idir (`src/orchestra/approval-decision-federation.ts:590-602`), fakat bypass surface'leri hâlâ açıktır. Bu **PS-010 / BLOCKS_CURRENT_DONE**'dır; çözüm yeni bir bypass flag'i değil, tek decision authority'dir.

Üçüncü blocking açık secret projection/lifecycle zinciridir. Raw ve effective config credential-bearing subtrees taşıyabildiği halde CLI/MCP/API/config-resource/Dashboard browser fetch zincirinde default redaction veya field-scoped capability yoktur. CLI `set` secret value'yu success message içinde echo edebilir; export stdout/file'a plaintext çıkarabilir. Corruption/migration backup'ları da secret-bearing bytes'ı çoğaltır. 2026-08-26 read-only operational probe'unda main workspace canonical config + beş corrupted backup'ın tamamı mode `0644` idi; ayrıca üç diğer config backup da `0644` idi. Value okunmadan yapılan key-path-only scan `notify_connectors.telegram.token` ve `bot_capabilities.mail.smtp.pass` path'lerinin bu retained config ailesinde bulunduğunu doğruladı. Bu **PS-003 / BLOCKS_CURRENT_DONE / CRITICAL**'dır: raw secret hiçbir Terminal/Desktop/API/MCP/Dashboard projectionına varsayılan olarak ulaşmamalı ve backup lifecycle Secret Broker dışında ikinci credential store yaratmamalıdır.

## 2. Yöntem ve kapsam

- Pinned snapshot'ın bütün scalar/array yolları, shared TypeChecker universe, defaults, `CONFIG_METADATA`, generated schema, production reads/writes ve yüzey deklarasyonları karşılaştırıldı.
- CLI `config/init/onboard/export/import/migrate`, MCP config/init/resource ve execution araçları, HTTP config/approval route'ları, Dashboard config projection'ı, Desktop source ağacı, EN/TR/generated docs ve feature manifest ayrı ingress/egress olarak izlendi.
- Bir search hit runtime wiring sayılmadı. Producer → resolver → consumer → ingress zinciri olmayan promise `UNWIRED/HOLD` kabul edildi.
- Approval, plan consent, provider tool permission, lifecycle checkpoint ve one-shot acknowledgement birbirinden ayrıldı. Birinin `approve` kelimesini taşıması diğerinin authority'si olduğu anlamına gelmez.
- Snapshot üzerinde ayrıca index-normalized statik karşılaştırma yapıldı: 207 scalar value, 196 normalized path-pattern. Dashboard'ın 66 hard-coded field'i bunların 47'siyle eşleşiyor; 149 snapshot pattern Dashboard catalogunda yok. Bu ölçüm semantic 1.002-leaf universe sayısının yerine geçmez, yalnız snapshot→Dashboard visibility ölçüsüdür.
- Scoped verification gözlemi: config odaklı 42 file / 803 test çalışmasında 39 file geçti, 3 file kaldı; 789 pass, 13 fail, 1 skip. On bir failure `node:fs` mock'larında yeni `renameSync` exportunun bulunmamasından, iki failure confirmation-output beklentilerinden geldi. Approval/run/confirmation/checkpoint parity bataryası 16 file / 142 test PASS oldu. Yeşil parity bataryası aşağıdaki authority-model açığını geçersiz kılmaz.

## 3. Finding register

| ID | Sınıf | Bulgusu | Ürün sonucu |
|---|---|---|---|
| PS-001 | **BLOCKS_CURRENT_DONE** | Write-time validation, read-time resolution ve migration aynı schema/gate değil | Public success, hemen ardından poison/drop |
| PS-002 | RELATED_BUT_NONBLOCKING | `CONFIG_METADATA`, CLI keys/list ve field universe arasında çok büyük coverage farkı | Discovery/completion iddiası güvenilmez |
| PS-003 | **BLOCKS_CURRENT_DONE / CRITICAL** | Raw/effective config, echo/export/API/MCP/resource/browser ve 0644 backup lifecycle boyunca redaction/capability scope yok | Credential disclosure ve çoğalan plaintext secret store riski |
| PS-004 | RELATED_BUT_NONBLOCKING | CLI atomikleşmişken MCP/API/init write'ları non-atomic; error semantics farklı | Concurrent reader ve crash consistency paritesi yok |
| PS-005 | RELATED_BUT_NONBLOCKING | Dashboard read-only doğru policy, fakat catalog stale ve snapshot'ın çoğunu göstermez | Observability surface gerçeği eksik/yanlış açıklar |
| PS-006 | RELATED_BUT_NONBLOCKING | CLI init, MCP init ve onboard aynı canonical authoring service'i kullanmıyor | Aynı ürün farklı başlangıç config'leri üretir |
| PS-007 | RELATED_BUT_NONBLOCKING | EN/TR/generated/on-init docs ve actual command/default/schema ayrışmış | Kullanıcı nonexistent command ve yanlış default görür |
| PS-008 | RELATED_BUT_NONBLOCKING | Feature manifest curated grep catalog; config/truth completeness authority'si değil | “active/dormant” state yanlış güven üretir |
| PS-009 | RELATED_BUT_NONBLOCKING | ADR emission'a en yakın `auto_docs.tier3` ve auto-draft path'i production-wired değil | `true` promise'i davranışa dönüşmüyor |
| PS-010 | **BLOCKS_CURRENT_DONE** | Secure approval authority yanında unauthenticated checkpoint file mutation var | MCP self-approval yasağı başka tool ile aşılabiliyor |
| PS-011 | RELATED_BUT_NONBLOCKING | CLI/MCP execution defaults ve `approve` kavramları semantik olarak ayrışıyor | Aynı niyet surface'e göre farklı risk posture üretir |
| PS-012 | RELATED_BUT_NONBLOCKING | “Read-only” API approvals GET expiry/policy mutation yapıyor | Read/freshness/state-transition sınırı dürüst değil |
| PS-013 | RELATED_BUT_NONBLOCKING | Config/MCP/API yüzeylerinde message catalog dışı user-facing string'ler var | EN/TR parity ve host-neutral error contract bozuk |
| PS-014 | RELATED_BUT_NONBLOCKING | Desktop'ta config management ingress bulunamadı | “Control Desktop'ta” yönü config için eksik |
| PS-015 | RELATED_BUT_NONBLOCKING | Genel unset/reset, provenance ve secret-safe export yok | Config yaşam döngüsü tek yönlü ve forensic olarak zayıf |

## 4. Surface capability ve authority matrisi

| Yüzey | Read | Write | Discovery / lifecycle | Validation | Auth / approval | Redaction | Durability |
|---|---|---|---|---|---|---|---|
| CLI `config` | raw project (`--raw`) veya effective | arbitrary set, import | keys/list, export, migrate; genel unset/reset yok | partial/manual; PS-001 | local process authority; ayrıca human approval yok | yok | set/import tmp+rename; export target direct |
| MCP `deckent_config` | effective read/get | arbitrary set | list/keys/export/import/migrate/reset yok | aynı incomplete partial validator | writer lease yalnız serialization; human auth değil | yok | direct `writeFileSync` |
| MCP config resource | raw project bytes | yok | dar description/projection | malformed/missing error payload | MCP transport visibility | yok | N/A |
| HTTP API | raw project + canonical defaults ayrı GET | deep-merge POST | keys/schema/provenance/reset yok | `z.record` + partial; unexpected validation error ignored | generic API auth + default-off `api.control_mutations` | yok | direct `writeFileSync` |
| Dashboard | raw + defaults fetch; 66-field hand catalog | **yok (deliberate)** | category viewer; stale/partial | N/A | observability-only | API payloadına bağımlı | N/A |
| Desktop | config ingress bulunamadı | config ingress bulunamadı | yok | yok | primary control promise'i kapanmamış | yok | yok |
| CLI init | minimal authored config + auto detect | merge/overwrite | one-shot | write öncesi canonical validate yok | interactive init flow | yok | direct write |
| MCP init | minimal independent reimplementation | merge veya force overwrite | one-shot | canonical validate yok | explicit `installMissing`; config yazımı writer lease arkasında | yok | direct write |
| CLI onboard | plan/dry-run/diff/readback | apply + revert | reversible report | canonical validate yok | explicit confirm/apply | yok | tmp+rename |

### 4.1 CLI config contract

- `export` comment stripping sonrası yalnız `JSON.parse` eder; semantic validation/redaction yoktur ve output file doğrudan yazılır (`src/cli/commands/config.ts:31-48`).
- `import` incoming parçayı validate eder, malformed existing dosyayı sessizce `{}` sayar, merge edip atomik yazar (`src/cli/commands/config.ts:50-78`). Malformed existing config recovery bu yüzeyde backup/quarantine üretmez.
- Bare `config` raw veya effective değer döndürür; effective read öncesi migration'ı sessizce çalıştırabilir ve migration failure'ını non-fatal yutar (`src/cli/commands/config.ts:80-117`). Bir read'in disk mutation yapabilmesi açık bir confirmation/receipt olmadan gerçekleşir.
- `set/get` PS-001 zinciridir (`src/cli/commands/config.ts:119-177`).
- `list/keys` sadece `CONFIG_METADATA`'dır; schema universe değildir (`src/cli/commands/config.ts:215-241`).
- `migrate` semantic validator değil legacy/default filler'dır (`src/cli/commands/config.ts:243-288`, `src/core/config-migration.ts:100-172`).
- `regenerateConfigSafe()` backup+validation yapabilen core helper'dır fakat production caller yoktur; yalnız definition/test hit'i vardır (`src/core/config.ts:2740-2800`). Genel `unset/reset`, layer-aware `show-origin`, validation-only/diff preview ve redacted export yoktur.

### 4.2 Config layers ve provenance

Canonical loader default → global → project katmanlarını birleştirir (`src/core/config.ts:2150-2180`); corrupted project file'ı timestamped `.corrupted.…bak` olarak saklayıp replacement'ı stage+rename ile kurar (`src/core/config.ts:2182-2244`). Pinned input project configinde `approval` yokken global katman effective `approval.lifecycle.enabled` üretebilir; fakat CLI/MCP effective read her leaf'in hangi layer'dan geldiğini göstermez. API/resource ise raw project değerini gösterir. Sonuç: iki surface aynı “config” kelimesi altında farklı truth döndürür, provenance olmadan bunu kullanıcı açıklayamaz.

Corruption guidance ayrıca olmayan `deckent config read` komutunu önerir (`src/core/config.ts:2235-2238`). Bu stale command init-generated docs'ta da tekrarlanır (§7).

### 4.3 MCP config contract

`deckent_config` yalnız `read|get|set` kabul eder (`src/mcp/tools/config.ts:11-22`). Read/get effective config'i döndürür; bilinmeyen get CLI gibi error üretmek yerine `value: undefined` içeren success response döndürebilir (`src/mcp/tools/config.ts:28-49`). Set doğrudan dosya mutation yapar (`src/mcp/tools/config.ts:52-74`).

Tool annotation `readOnlyHint:false` olduğu için writer-lease gate `set` action'ını serialize eder (`src/mcp/writer-lease-gate.ts:21-35`, `src/mcp/writer-lease-gate.ts:68-95`); gate tool registration'dan önce kurulur (`src/mcp/server.ts:174-203`). Bu lease principal authentication, live consent veya semantic transaction değildir. Üstelik persistent set için `destructiveHint:false` ve `idempotentHint:false` kullanılır (`src/mcp/tools/config.ts:13-18`); risk metadata'sı mutation gerçeğini tam anlatmaz.

MCP set, CLI'nin yeni tmp+rename helper'ını kullanmayıp direct `writeFileSync` yapar (`src/mcp/tools/config.ts:66-74` karşı `src/cli/commands/config.ts:1-8`). Get/set validation failure mesajları da message catalog yerine hard-coded English'tir (`src/mcp/tools/config.ts:37-42`, `src/mcp/tools/config.ts:52-63`).

MCP config resource raw project JSON'u verir ve description yalnız mode/language/projectName/planning yönlendirmesini vaat eder (`src/mcp/resources/config.ts:6-35`). Missing/malformed durumu protocol error yerine JSON content olarak döner; effective/provenance/redaction yoktur.

### 4.4 HTTP API ve secret exposure

API body schema herhangi string key'i kabul eden `z.record`dır (`src/api/server.ts:255-267`). `/api/config` raw dosya, `/api/config/defaults` canonical defaults döndürür (`src/api/server.ts:944-955`). POST deep-merge + partial validation yapar; yalnız `ConfigValidationError`'ı 422'ye çevirir, başka validator exception'ını açıkça ignore edip write'a devam eder ve direct `writeFileSync` kullanır (`src/api/server.ts:1812-1840`). `routing_v3` read-time exception'ı bu ignored sınıfa girebildiği için PS-001 API'de de kapalı değildir.

Bütün `/api/*` route'ları generic auth middleware'den geçer (`src/api/server.ts:844-847`), config POST ayrıca raw ve type dışı `api.control_mutations` flag'iyle default-off'tur (`src/api/server.ts:576-634`). Bu iyi bir authority ratchet'tır, fakat field canonical type/default/metadata/docs'ta olmadığından güvenlik-operasyon ayarı discoverable/auditable değildir. Capability flag kimlik doğrulamanın yerine geçmez.

Raw config secret taşıyabilir: `api_keys.*` (`src/core/config-types.ts:1149-1150`), `api_auth_token` ve `api_oidc.key` (`src/core/config-types.ts:1287-1312`), `dashboard_oidc.client_secret` (`src/core/config-types.ts:1324-1333`). Canonical redactor token/key/password heuristiğine sahiptir (`src/core/redact-sensitive.ts:9-60`) fakat CLI raw/export, API config GET ve MCP raw resource zincirinde çağrılmaz. Authenticated kullanıcıya bile least-disclosure uygulanmadığı için config export/observability contractı secret-safe değildir.

#### PS-003 — full secret projection ve backup lifecycle

| Egress / persistence | Exact path | Mevcut davranış | Required contract |
|---|---|---|---|
| CLI bare/effective ve `--raw` | `src/cli/commands/config.ts:80-117` | resolved veya raw object stdout'a tam basılır | default redacted; explicit field-scoped reveal + audit |
| CLI export | `src/cli/commands/config.ts:31-48` | comment stripping + JSON parse sonrası stdout/file; semantic/redaction yok | secret-free export default; references-only portable format |
| CLI set receipt | `src/cli/commands/config.ts:119-148` | parsed value success message içinde echo edilir | key + redacted classification + resulting digest; value yok |
| MCP read/get/set | `src/mcp/tools/config.ts:28-77` | full resolved config, selected value veya submitted value response'a girer | secret fields deny/redact; separate privileged reveal tool dahi policy-bound |
| MCP resource | `src/mcp/resources/config.ts:6-35` | raw project JSON resource contentidir | secret-free projection, schema/provenance only |
| HTTP GET | `src/api/server.ts:944-949` | raw project object generic API principalına döner | field ACL + redaction + no credential material |
| HTTP POST response | `src/api/server.ts:1812-1835` | merged raw object client'a geri döner | redacted diff/receipt; secret echo yok |
| Dashboard browser | `src/dashboard/src/pages/ConfigPage.tsx:193-215` | UI 66 field gösterse bile browser full raw `/api/config` payloadını alır | server-side projection; hidden field browser'a hiç gönderilmez |
| Corruption recovery | `src/core/config.ts:2182-2244` | authored config backup'a taşınır/kopyalanır; chmod/encryption/secret split yok | secret references only; restrictive permissions; retention/delete receipt |

Operational evidence (code-truth pinned base'den ayrı, value-free):

```text
probe: find /home/alperen/deckent-dev/.deckent -maxdepth 1 -type f -name 'config.json*' -printf '%m %f\n'
result: canonical config = 0644; corrupted backups = 5/5 at 0644; other config backups = 3/3 at 0644
probe: JSON key-name walk only; values neither selected nor logged
result paths: bot_capabilities.mail.smtp.pass, notify_connectors.telegram.token
```

Bu bulgu yalnız UNIX file mode problemi değildir. `0600` gerekli defense-in-depth'tir ama tek başına yeterli değildir: backup, terminal scrollback, MCP transcript, HTTP logs/browser memory, export artifacts ve support bundles plaintext secret kopyaları üretmeye devam eder. Completion için config secret **value** taşımamalı; yalnız Secret Broker handle/reference taşımalı. Broker read capability'si principal+tenant+purpose+expiry ile scope edilmeli; config projections yalnız classification ve reference health göstermelidir.

### 4.5 Dashboard ve Desktop

Dashboard config viewer'ın write kapatması deliberate ADR-G-033 policy'siyle uyumludur: state'te save path yok, raw/default GET yapar (`src/dashboard/src/pages/ConfigPage.tsx:185-221`) ve bütün controls disabled'dır (`src/dashboard/src/pages/ConfigPage.tsx:357-397`). Testler de no-save/no-POST ve legacy catalogu pinler (`tests/dashboard/config-page.test.tsx:38-105`). Bu nedenle “Dashboard edit etmiyor” bir eksik değil; **eksik olan doğru ve kapsamlı observability projection'dır**.

Hand-authored catalog (`src/dashboard/src/pages/ConfigPage.tsx:29-142`) şu stale truth'ları taşır:

- provider options yalnız Claude/Codex/Gemini; local/Ollama/OpenRouter/config registry görünmez (`:47-52`);
- `spawn_backend` Docker'ı göstermez (`:55-56`);
- `routing_engine` default `v2`, seçenek `v1|v2`; canonical tek live engine `v3` (`:66`);
- array olan `human_checkpoints` single select olarak modellenir (`:68`);
- `auto_docs.tier3` Blueprint/Architecture üretimi vaat eder (`:83-86`) ama production consumer kapanmaz;
- memory default 900/5'tir (`:88-90`), canonical default 5000/20 iken `CONFIG_METADATA` 600/5 taşır; üç authority birbiriyle uyuşmaz (`src/core/config.ts:1969-1970`, `src/core/config.ts:3105-3115`);
- notify alanları “Planned”dır (`:130-141`) fakat webhook bootstrap production path'i vardır (`src/core/notify-bootstrap.ts:74-84`).

`src/desktop/src` altında config editor/API config ingress'i için yapılan pinned-base taramada production hit bulunmadı. Ürün authority'si Terminal + Desktop control, Dashboard observability dediği için bu bir **Desktop management closure gap**'idir; Dashboard'a write geri açma gerekçesi değildir.

## 5. Pinned snapshot → product visibility

Pinned snapshot'ın bütün top-level/nested kümeleri aşağıda operator yüzeyi açısından sınıflandırılmıştır. “Generic set var” discovery/UX coverage sayılmaz.

### 5.1 Snapshot'taki 63 raw root — eksiksiz disposition

Aşağıdaki tablo input JSON'un insertion order'ını korur ve **63/63 root** içerir; hiçbir value veya secret basılmaz. Kısaltmalar:

- **E:** canonical `loadConfig` effective projection'ında görünür.
- **R:** yalnız raw project configte görünür; CLI `--raw` ve API raw GET gösterebilir.
- **RD:** runtime consumer raw dosyayı doğrudan tekrar okur; canonical provenance/resolver'ı bypass eder.
- **G:** generic arbitrary authoring var (`config set` / MCP set / API POST), fakat field-specific editor/discovery yok.
- **D:** Dashboard hand-authored viewer'da root veya alt alan görünür; disabled/read-only'dir.
- **∅:** o surface'te field-specific/effective görünürlük yok. Desktop sütunu 63 satırın tamamında ∅; pinned source'ta config management ingress'i yoktur.

| # | Raw root | Product disposition | CLI | MCP | API | Desktop | Dashboard | Product consequence |
|---:|---|---|---|---|---|---|---|---|
| 1 | `routing_v3` | effective | G + R + E; keys ∅ | G + E | raw GET/G POST | ∅ | ∅ | Strict gate read-time olduğu için invalid write effective read'i zehirler (PS-001). |
| 2 | `mode` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Çoklu default authority yüzünden init/metadata/runtime seçimi açıklanmaz. |
| 3 | `modes` | effective | G + R + E; aggregate key | G + E | raw/G | ∅ | ∅ | Per-mode worker/model/budget tuning yalnız JSON uzmanına açıktır. |
| 4 | `providers` | effective | G + R + E; discovery eksik | G + E | raw/G | ∅ | ∅ (yalnız flat legacy fields) | Registry/local provider capability ve credential-reference UX'i yoktur. |
| 5 | `cost_optimization` | UI-only / effective-drop | G + R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D | Type/default/UI promise'i runtime resolver'da düşer; toggle no-op'tur. |
| 6 | `spawn_backend` | effective | G + R + E + keys | G + E | raw/G | ∅ | D (options stale) | Docker/auto/platform choices surface'ler arasında ayrışır. |
| 7 | `execution_budget` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Finite-budget admission policy discoverable/explainable değildir. |
| 8 | `auth_mode` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Auth mode capability değildir; account/reachability provenance gösterilmez. |
| 9 | `human_checkpoints` | effective | G + R + E + keys | G + E | raw/G | ∅ | D (yanlış single-select) | Array lifecycle policy UI'da tek değer gibi temsil edilir. |
| 10 | `fix_phase_enabled` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Field görünür; checkpoint/broker authority ayrımı görünmez. |
| 11 | `max_fix_retries` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Retry ile circuit-breaker interaction preview'i yoktur. |
| 12 | `fix_circuit_breaker` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Nested policy görünür ama effective derived thresholds açıklanmaz. |
| 13 | `lifecycle_recovery` | effective | G + R + E + keys | G + E | raw/G | ∅ | ∅ | Termination timing riskleri generic JSON'a bırakılmıştır. |
| 14 | `coverage_threshold` | deprecated-alias, effective mirror | G + R; E normalize | G + E | raw/G | ∅ | D | Legacy value aspirational hedefi seed eder; deprecation/mirror UI'da gizlidir. |
| 15 | `coverage_hard_floor` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Immutable gate floor Dashboard'daki legacy coverage alanından ayırt edilemez. |
| 16 | `coverage_aspirational` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Auto-learn target ve hard floor relationship'i görünmez. |
| 17 | `max_reroutes` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Reroute budget görünür fakat run outcome/cost impact preview'i yoktur. |
| 18 | `reroute_on_tech_debt` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Tech-debt disposition etkisi yalnız prose'dur. |
| 19 | `sprint_timeout_minutes` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | `0=unlimited` enterprise policy/upper bound ile ilişkilendirilmez. |
| 20 | `memory_budget` | effective | G + R + E + keys (default stale) | G + E | raw/G | ∅ | D (başka default) | Runtime/metadata/Dashboard/init dört farklı default authority taşır. |
| 21 | `decay_after_sprints` | deprecated-alias, effective | G + R + E + keys | G + E | raw/G | ∅ | D | `memory.decay_after_sprints` successor'ı ve migration yolu surface'te yoktur. |
| 22 | `patterns_enabled` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Runtime reachability var; DB/export impact'i açıklanmaz. |
| 23 | `project_identity_enabled` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Identity generation/sync side effects için preview yoktur. |
| 24 | `scan_interval` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Scale/resource impact'i boundlarla birlikte gösterilmez. |
| 25 | `heartbeat_timeout` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Interval↔timeout invariant/provenance UI'da yoktur. |
| 26 | `boundary_enforcement` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Governance-critical enforcement generic config mutation'a açıktır. |
| 27 | `lock_stale_threshold` | effective | G + R + E + keys | G + E | raw/G | ∅ | ∅ | Lock cleanup safety threshold operator UI'sında görünmez. |
| 28 | `search_enabled` | UI-only / effective-drop | G + R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D / “Planned” | Toggle runtime'a ulaşmaz; planned label no-op gerçeğini saklar. |
| 29 | `search_provider` | UI-only / effective-drop | G + R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D / “Planned” | Provider selection için registry/capability validation yoktur. |
| 30 | `search_cache_ttl` | UI-only / effective-drop | G + R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D / “Planned” | TTL yazılabilir ama effective consumer contractı yoktur. |
| 31 | `notify_on_complete` | effective | G + R + E + keys | G + E | raw/G | ∅ | D / “Planned” | Enabled flag ulaşır; delivery channel resolver'da düştüğü için outcome garanti etmez. |
| 32 | `notify_outbox_drain_interval_ms` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Delivery freshness knob'u görünmez; stale notification diagnosis zorlaşır. |
| 33 | `notify_channel` | effective-drop | G + R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D / “Planned” | Webhook bootstrap source'u var ama resolved config alanı düşürür; delivery unwired olur. |
| 34 | `notify_url` | **sensitive** + effective-drop | G + raw plaintext; get ∅ | set; effective ∅ | raw plaintext/G | ∅ | D / “Planned” | Secret-like endpoint redaction yoktur ve consumer'a ulaşmaz. |
| 35 | `telemetry_enabled` | UI-only / effective-drop | G + R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D / “Planned” | Consent-looking toggle no-op; bu özellikle güven problemidir. |
| 36 | `telemetry_anonymous` | UI-only / effective-drop | G + R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D / “Planned” | Privacy promise'i runtime authority ile bağlı değildir. |
| 37 | `detected_env` | internal-state / effective-drop | G + R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D | Auto-detection fact'i user config gibi düzenlenebilir; provenance/timestamp yoktur. |
| 38 | `multi_ide_mode` | internal-state / effective-drop | init writes; R; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D / “Planned” | Init artifactı runtime'da düşer; multi-host promise'i davranış üretmez. |
| 39 | `output_splash` | effective-drop | G + R + keys; get ∅ | set mümkün; read/get ∅ | raw/G | ∅ | D | Sprint consumer resolved field bekler, dolayısıyla authored default/override ulaşmaz. |
| 40 | `output_mode` | effective via **RD** | G + R; effective get ∅ | set; effective read/get ∅ | raw/G | ∅ | D | Finalizer raw reread ile çalışır; layer/global/provenance semantics bypass edilir. |
| 41 | `output_theme` | UI-only / effective-drop | G + R; get ∅ | set; read/get ∅ | raw/G | ∅ | D / “Planned” | Theme promise'i runtime renderer'a bağlı değildir. |
| 42 | `rollback_policy` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Policy var; concrete reversible action/receipt projectionı yoktur. |
| 43 | `rubric_max_retries` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Evaluation retry/cost effect'i operator surface'te görünmez. |
| 44 | `acceptance_enforcement` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Observe/enforce governance change'i generic write'a bırakılmıştır. |
| 45 | `adaptive_thresholds` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Learned state/proposed-vs-applied threshold ayrımı yoktur. |
| 46 | `agent_min_score` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Runtime adapted value ile authored baseline provenance'si karışır. |
| 47 | `adaptive_config` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Nested calibration fields var; evidence window/outcome explanation yoktur. |
| 48 | `routing_engine` | effective; legacy ingress normalize | G + R + E + keys | G + E | raw/G | ∅ | D (stale v1/v2) | Dashboard canlı tek seçenek v3'ün tersini gösterir. |
| 49 | `cleanup_delay_ms` | effective | G + R + E + keys | G + E | raw/G | ∅ | D | Destructive cleanup timing'i retention/archive policy'sinden ayrı sunulur. |
| 50 | `dependency_pipeline_enabled` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | DAG scheduling safety toggle'u surface'te görünmez. |
| 51 | `debt_preflight_enabled` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Critical debt admission guard discoverable değildir. |
| 52 | `sprint_checkpoint_interval` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Runtime task checkpoint sıklığı human approval checkpoint'ıyla isimsel olarak karışır. |
| 53 | `token_throttle_ms` | effective / type-exception | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Canonical `DeckentConfig` dışında intersection alias; schema/docs generation kaçırır. |
| 54 | `timeout` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Backend/model/platform timeout matrix'i yalnız raw JSON'dadır. |
| 55 | `observability` | effective-drop | G + R; get ∅ | set; read/get ∅ | raw/G | ∅ | ∅ | Typed/default block resolver'da düşer; rotation promise'i no-op olur. |
| 56 | `sprint_file_retention` | effective via **RD** | G + R; effective get ∅ | set; effective read/get ∅ | raw/G | ∅ | ∅ | Cleanup/finalizer raw reread eder; layer/provenance ve shared validation bypass edilir. |
| 57 | `scheduler_shadow_retention` | effective via **RD** | G + R; effective get ∅ | set; effective read/get ∅ | raw/G | ∅ | ∅ | Finalizer raw reread eder; cross-surface effective truth farklıdır. |
| 58 | `runtime_artifact_retention` | effective | G + R + E; keys ∅ | G + E | raw/G | ∅ | ∅ | Full family/bounds policy schema docs ve viewer'da eksiktir. |
| 59 | `deckent_style` | effective | G + R + E + keys | G + E | raw/G | ∅ | ∅ | Sprint/task/process model seçimi primary surfaces'te görünmez. |
| 60 | `terminal` | effective, security-sensitive subfields | G + R + E + partial keys | G + E | raw/G | ∅ | D (partial; bind yok) | Bind/quota/native-agent güvenlik context'i Dashboard'da eksiktir. |
| 61 | `prompt` | effective, high-impact | G + R + E + partial keys | G + E | raw/G | ∅ | ∅ | Prompt/cache/persona/ADR canary knobs için preview/impact UX yoktur. |
| 62 | `autonomous` | effective | G + R + E; keys ∅ | G + E + subsystem tool | raw/G | ∅ | ∅ | Generic config ile subsystem state/tool protocolü ayrışır; RBAC/risk görünmez. |
| 63 | `nervous_system` | effective | G + R + E + partial keys | G + E + subsystem config | raw/G | ∅ | ∅ | İki ayrı config surface'i ve partial metadata bütünlüğü garanti etmez. |

Disposition count (birincil sınıf, combo etiketlerde soldaki esas alınarak): effective/effective-via-RD/deprecated-effective/type-exception **50**, UI-only **7**, internal-state **2**, effective-drop **3**, sensitive+effective-drop **1** = **63**. “Unknown root” yoktur; `token_throttle_ms` runtime-known fakat canonical type dışı bir type-exception'dır. Bu, unknown-key kabulünün güvenli olduğu anlamına gelmez: snapshot dışındaki `totally_unknown.*` PS-001'de kanıtlandığı gibi yazılıp effective resolution'da düşer.

| Snapshot kümesi | Kod/effective durum | Operator görünürlüğü | Gap |
|---|---|---|---|
| `routing_engine`, `routing_v3.explorationBonus` | typed/resolved; v3 strict validation read-time | generic CLI/MCP set/get; keys ve Dashboard'da yanlış/eksik | PS-001 + discovery drift |
| `modes.{performance,balanced,economic,api}.*` | canonical preset/merge | Dashboard yalnız `mode`; nested mode tuning yok | provenance/preset diff yok |
| `providers.{brain,worker,registry[]}.*`, local provider fields | typed ve registry bootstrap | Dashboard yalnız flat üç provider; schema doc registry satırları eksik | credentials/capability UX yok |
| `execution_budget.*` | typed policy | snapshotta var; Dashboard/metadata/schema docs parçalı | budget admission explainability yok |
| `human_checkpoints`, `lifecycle_recovery.*`, coverage hard/aspirational | runtime consumer var | generic authoring; Dashboard checkpoint array yanlış | lifecycle state + timeout config yok |
| `lock_stale_threshold`, notify drain, rubric retry, acceptance enforcement, pipeline/debt/checkpoint/token throttle | çeşitli runtime consumers | Dashboard yok; metadata/docs seçici | advanced behavior invisible |
| `timeout.*` | default+resolver | Dashboard yok | platform/backend bound UX yok |
| `observability.rotation.*`, sprint/scheduler/runtime artifact retention | ayrı retention contracts | Dashboard/metadata yetersiz; schema runtime artifactı eksik | delete/archive impact preview yok |
| `deckent_style`, `terminal.bind` | typed/consumer | Dashboard bind yok | remote bind güvenlik context'i yok |
| `prompt.*` | prompt assembly/canary settings | Dashboard yok, generated schema eksik | high-risk prompt toggles discoverable değil |
| `autonomous.*` | subsystem MCP/CLI var | config viewer catalogunda yok | config→state/outcome explainability yok |
| `nervous_system.*` | subsystem-specific MCP config var | generic catalog ve Dashboard yok | iki config protocolü ayrışıyor |

Snapshot normalized 196 pattern'ın Dashboard catalogundaki 47 overlap'i, yalnız %24 visibility demektir; kalan 149 pattern generic JSON authoring'e bırakılmıştır. Semantic universe daha geniş olduğu için gerçek product coverage bundan da düşüktür.

## 6. Init ve onboarding tutarlılığı

### 6.1 CLI init

CLI init mode/language/projectName, preset model strategy, detected spawn backend, max worker ve `_auto_detected` bilgisi yazar; canonical full config üretmez ve write öncesi `validatePartialConfig` çağırmaz (`src/cli/commands/init-steps.ts:191-265`). Existing parse fail olduğunda minimal config ile overwrite eder; backup/quarantine yoktur (`:254-264`). Multi-env flag'i ayrıca configi direct write eder ve parse failde yalnız `{multi_ide_mode:true}` üretir (`src/cli/commands/init-steps.ts:358-378`). Provider/image/downgrade akışları da ayrı raw writes kullanır (`src/cli/commands/init.ts:188-237`).

### 6.2 MCP init

MCP init kendi minimal `{mode, language, projectName}` config'ini reimplement eder; merge için `Object.assign`, force için whole-file overwrite ve her iki durumda direct write kullanır (`src/mcp/tools/init.ts:48-64`, `src/mcp/tools/init.ts:90-104`). Canonical CLI init'in capacity/spawn/model/budget semantics'ini paylaşmaz, canonical validation çağırmaz. Aynı “init” eylemi yüzeye göre farklı product state doğurur.

### 6.3 Onboarding

Onboard planı yalnız mode/language/projectName/basic providers/model strategy üretir (`src/cli/helpers/onboarding-wizard.ts:339-385`). Apply katmanı preview/dry-run, atomic write, readback verification ve reversible report sağlar; bunlar doğru transaction davranışlarıdır (`src/cli/helpers/onboarding-apply.ts:74-104`, `src/cli/helpers/onboarding-apply.ts:169-232`). Ancak apply canonical config validator çağırmaz.

Global scope path'te gerçek bug vardır: workspace resolver global seçimde `root = globalPaths.configDir` verir (`src/cli/helpers/onboarding-wizard.ts:270-290`), `planConfigWrite` bunun altına tekrar `.deckent/config.json` ekler (`src/cli/helpers/onboarding-wizard.ts:359-369`). Canonical global resolver ise `configDir/config.json` üretir (`src/core/global-scope-resolver.ts:302-316`). Linux/XDG, macOS ve Windows'ta onboard global write/read path'i bu nedenle canonical loader path'iyle eşleşmeyebilir; **Every Environment** ihlalidir.

## 7. Documentation ve generated truth

- Canonical user docs gerçek CLI surface'i (`config`, `--raw`, set/get/list/keys/export/import/migrate) verir ve metadata/migration'ın partial olduğunu söyler (`docs/en/configuration.md:74-109`; TR eş yapı).
- Init-generated per-project reference nonexistent `deckent config read` önerir ve mode balanced, memory 900, decay 5 gibi stale defaults taşır (`src/cli/commands/init-templates.ts:455-506`, `src/cli/commands/init-templates.ts:508-557`). Bu dosya yalnız yoksa yazıldığı için upgrade ile düzelmez (`src/cli/commands/init-steps.ts:515-520`).
- EN schema “complete 164 leaves” iddiasındadır (`docs/en/reference/configuration-schema.md:9`, `docs/en/reference/configuration-schema.md:203-205`); EN/TR table path'leri kendi aralarında parity gösterse de snapshot normalized 196 pattern'ın 35'i tabloda yoktur. Eksikler: `routing_v3.explorationBonus`; registry entry name/type/baseUrl/apiKeyEnv/authMode/executionCostClass/models; worker default budget turns/tokens ve landing reserve; notify drain; acceptance enforcement; bütün runtime artifact retention; prompt core/channel/suppress/catalog/canary/task-profile alanları; nervous notification pending-age threshold.
- Schema docs `spawn_backend` defaultunu Docker gösterir (`docs/en/reference/configuration-schema.md:55`), canonical default platform-adaptive `auto`dur (`src/core/config.ts:1897-1924`).
- Handwritten MCP docs 49 tool der ve approval inbox gibi yeni yüzeyleri eksik taşır (`docs/en/mcp.md:7-35`); generated reference 51 tool gösterir ama yalnız name/title düzeyindedir ve birçok description boştur (`docs/generated/en/reference/mcp-tools.md:7-62`). Resource docs raw/projection ayrımını dürüstçe belirtir (`docs/en/reference/mcp-resources.md:5-21`).
- API reference `deckent_approvals`ın decision içermediğini doğru söyler fakat `deckent_checkpoint` doğrudan decision bypass'ını authority açıklamasına katmaz (`docs/en/reference/api-surface.md:99`).

## 8. Feature manifest ve truth surface

Feature manifest kendi metadata'sında curated catalog + basename grep heuristic olduğunu açıklar (`.deckent/settings/features-manifest.json:2-23`); full import graph veya config universe değildir. Buna rağmen operator query'leri catalogu product truth gibi döndürür (`src/cli/commands/features.ts:42-63`, `src/cli/commands/features.ts:90-166`; `src/mcp/tools/feature-query.ts:33-141`).

Somut stale kayıtlar:

- autonomous kaydı MCP surface yok der, oysa `src/mcp/tools/autonomous.ts` production tool'dur (`.deckent/settings/features-manifest.json:182-206`);
- approval kaydı yanlış rules path (`.deckent/approvals-rules.json`), yanlış config key (`approval_gate`) ve bulunmayan doc link taşır (`.deckent/settings/features-manifest.json:209-225`); gerçek rules path `.deckent/settings/approval-rules.json` (`src/core/approval-rules.ts:54`), gerçek typed key `approval.gate_enabled`dır (`src/core/config-types.ts:318-325`);
- truth definitions yalnız beş feature ve üç flag path kapsar (`.deckent/settings/features-manifest.json:408-452`). Truth engine sadece bu deklarasyonları effective configten çözer (`src/core/feature-truth.ts:270-331`, `src/mcp/tools/truth.ts:112-137`).

Bu surface feature existence/lifecycle için yararlı curated telemetry'dir; config completeness gate'i olarak kullanılamaz.

## 9. ADR vakası: “ADR basma true” neden davranış üretmiyor?

Pinned base üzerinde exact `update_adr`, `adr_update` ve `auto_adr` key/token taraması production/type/test/docs/manifestte hit vermedi; `git log -S'update_adr'` de history hit'i üretmedi. Bu nedenle belirli bir tarihsel `update_adr:true` field'ını varmış gibi raporlamak doğru değildir: exact historical key **UNKNOWN/HOLD**.

Snapshot'ta ADR ile ilişkili iki prompt alanı vardır: `prompt.adr_min_relevance` ve `prompt.adr_render` (`evidence/project-config.corrupted-backup.input.json:179-220`). Bunlar ADR'nin worker promptuna dahil edilmesini yönetir; yeni ADR emit etme authority'si değildir.

“ADR/docs basma” promise'ine en yakın iki path:

1. `auto_docs.tier3`: type ve Dashboard description Blueprint/Architecture generation vaat eder, fakat field matrix production/test reference sayısını sıfır bulur (`CONFIG-FIELD-MATRIX.md:201`, `src/dashboard/src/pages/ConfigPage.tsx:83-86`). Tier1/tier2 finalizer consumers vardır (`src/orchestra/sprint-finalizer.ts:4266-4270`, `src/orchestra/doc-updaters/changelog.ts:52-60`, `src/orchestra/doc-updaters/sprint-log.ts:125-139`, `src/orchestra/doc-updaters/readme-metrics.ts:5-13`, `src/orchestra/doc-updaters/health-check.ts:7-16`); tier3 branch yoktur.
2. `autoDraftDecisions()` `.brain/DECISIONS.md` için proposed decision üretir (`src/orchestra/sprint-docs-updater.ts:181-255`), fakat definition ve tests dışında production caller yoktur. Identity generator yalnız var olan `docs/adr/*.md` dosyalarını memory DB'ye sync eder (`src/core/identity-generator.ts:512-530`, `src/core/identity-generator.ts:585-618`); ADR yaratmaz.

Sonuç: config `true` olmasına rağmen “artık ADR basmıyor” gözlemi mevcut kodla uyumludur. Fix bir boolean eklemek değil; authored schema → finalizer consumer → deterministic artifact policy → idempotency/conflict → operator preview → test/real-run proof zincirini kapatmaktır.

## 10. Approval, checkpoint, confirmation ve execution semantics

### 10.1 Dört ayrı kavram

| Kavram | Anlam | Persist edilmeli mi? | Mevcut surface |
|---|---|---|---|
| `autoApprove` | provider tool-permission bypass / unattended execution posture | ancak explicit run policy olarak | CLI run default false; MCP run default true |
| plan `approve` | exact plan digest/adoption consent | digest + actor + revision ile | CLI/MCP plan |
| `human_checkpoints` | PLAN/EVALUATE/FIX lifecycle pause seçimi | config + per-instance state | config + checkpoint files |
| broker approval | riskli action için authenticated principal decision | append-only/receipted decision | CLI live TTY, optional fresh OIDC API; MCP inbox read-only |
| acknowledge/force flags | cost/scope/prompt gate için one-shot invocation intent | global config yapılmamalı | CLI/MCP start/plan/run ingress |

Bu ayrım config gap ile deliberate non-configurable behavior'ı ayırır: `acknowledgeCost`, `acknowledgeScopePaths`, `acknowledgePromptGate`, `force` gibi present-tense consent değerleri kalıcı project config olmamalıdır. Eksik olan bunları persistent toggle yapmak değil, her ingress'te aynı typed intent/receipt contractını kullanmaktır.

### 10.2 Secure approval state

Broker state'i `pending → approved|denied|expired|quarantined` olarak görünür. CLI list salt read projection uygular (`src/cli/commands/approvals.ts:127-180`); MCP inbox da sweep/migration/decision yapmadan read model döndürür (`src/mcp/tools/approvals.ts:32-140`). API GET ise commentte monitoring/read-only derken `persistPolicyTransitions()` ve `sweepExpired()` çağırır (`src/api/server.ts:1424-1431`). Freshness sağlamak için GET'in mutation yapması **PS-012**'dir: scheduled lifecycle driver mutation authority olmalı; reads “effective projected” ile “durably settled” farkını açık göstermelidir.

API approval decision ayrı default-off `approval.api_decide`, generic API auth, fresh OIDC bearer, idempotency ve runtime authority ister (`src/api/server.ts:562-574`, `src/api/server.ts:1889-1991`). Field typed'dır (`src/core/config-types.ts:311-339`) fakat config metadata/default/schema/UI'da yoktur. `approval.expiry_sweep_ms` raw API bootstrap knob'u da typed config dışındadır (`src/api/server.ts:2285-2331`). Bunlar güvenlik policy knobs olduğu için generic raw JSON'da gizli kalmamalıdır.

### 10.3 Legacy checkpoint state

Checkpoint state `pending → approved|rejected|timeout`tır. Lifecycle 4h timeout, 30m escalation ve 5s poll hard-code eder; yalnız test seams ile override edilebilir (`src/orchestra/sprint-lifecycle.ts:540-593`). Timeout dosyaya yazılır (`src/orchestra/sprint-lifecycle.ts:678-708`), ancak public CLI/MCP `CheckpointFile` type'ları yalnız pending/approved/rejected tanır (`src/cli/commands/checkpoint.ts:11-16`, `src/mcp/tools/checkpoint.ts:11-16`). Bu state-shape drift, “unknown” state'in failed/rejected gibi yorumlanması riskini taşır.

MCP checkpoint path/status validation yapıyor ama broker/live auth yapmıyor (`src/mcp/tools/checkpoint.ts:52-74`); CLI variant path/pending validationında daha zayıf (`src/cli/commands/checkpoint.ts:48-62`). İki surface de direct non-atomic write kullanır. Completion, file API'yi public decision surface olmaktan çıkarıp secure federation through broker'a bağlamalıdır.

### 10.4 Execution ingress parity

- MCP `deckent_start` `autoApprove:false` defaultu ve one-shot acknowledgements taşır (`src/mcp/tools/start.ts:67-114`, `src/mcp/tools/start.ts:587-606`). `acknowledgePromptGate` runner tarafından gerçekten tüketilir (`src/orchestra/sprint-runner-entry.ts:40-50`, `src/orchestra/sprint-runner-entry.ts:522-532`, `src/orchestra/sprint-runner-entry.ts:604-609`); MCP source commentindeki “known gap” stale'dir.
- CLI start da `autoApprove:false`tır fakat comment MCP'nin true olduğunu söyler (`src/cli/commands/start.ts:1159-1172`). Behavior parity var, comment truth drift eder.
- MCP `deckent_run` `autoApprove:true` defaultlar (`src/mcp/tools/run.ts:38-54`, `src/mcp/tools/run.ts:184-210`); CLI run default false'tır (`src/cli/commands/run.ts:452-479`). Bu güvenlik posture farkı explicit, prominently disclosed operator choice olmadan kabul edilemez.
- MCP plan pinned base'te default `approve:false` olmasına rağmen canonical exact plan/event authority persist eder ve optional approval snapshot üretir (`src/mcp/tools/plan.ts:35-54`, `src/mcp/tools/plan.ts:76-127`). `dryRun` description “never written” derken implementation persistent authority yazdığı için surface contract çelişir.

Writer lease bütün mutation tool'larını serialize edebilir; bu hiçbir yerde human approval, tenant authorization, risk acceptance veya idempotent settlement demek değildir.

## 11. i18n, platform ve scale

### i18n

CLI command descriptions çoğunlukla message catalog kullanır; config metadata descriptions/list headings ve export/import ErrorRegistry message'larının bir kısmı hard-coded English'tir (`src/cli/commands/config.ts:31-48`, `src/cli/commands/config.ts:215-229`). MCP config/checkpoint error payloadları hard-coded English'tir (`src/mcp/tools/config.ts:37-63`, `src/mcp/tools/checkpoint.ts:52-72`, `src/mcp/tools/checkpoint.ts:109-125`). API config errors/logs da hard-coded English ve stale “via dashboard” attribution taşır (`src/api/server.ts:1812-1837`). Dashboard CONFIG_FIELDS labels/descriptions hard-coded fallback'tır (`src/dashboard/src/pages/ConfigPage.tsx:45-142`); i18n keys yoksa English'e düşer (`:196-200`). God-level completion bütün user-facing messages için shared typed catalog gerektirir.

### Platform

- Global onboarding path duplication Linux/XDG, WSL, macOS ve Windows'ta canonical read/write parity'yi kırabilir (§6.3).
- Atomic rename helper CLI set/import'ta var, MCP/API/init/multi-env/checkpointte yok. Windows rename semantics, cross-device/temp placement ve cleanup error path'i tek platform adapterıyla standardize edilmelidir.
- Init backend seçenekleri Dashboard/options/docs ile uyuşmaz; unsupported backend açık typed HOLD üretmeli, sessiz fallback değil.

### Scale / enterprise

- Generic config endpoints secret-aware field ACL veya tenant-scoped provenance sunmaz.
- Config write receipt'lerinde principal, layer, prior/new digest, schema version, redacted diff, idempotency key ve rollback handle yoktur.
- API `z.record` ve arbitrary dot-path multi-tenant policy enforcement için yeterli değildir.
- Approval lifecycle principal/scope/expiry/risk taşırken checkpoint mutation bunların hiçbirini taşımaz.
- Her surface'in kendi metadata/catalog/schema'sını tutması milyonlarca field/project/host matrisinde drift'i kaçınılmaz kılar; generated single authority gerekir.

## 12. Dependency-complete product finish plan

### P0 — yazılabilir configi güvenli hâle getir

1. **Tek authored schema:** TypeScript type, runtime strict parser, defaults, deprecations, secret classification, layer authority, docs metadata ve UI control semantics tek machine-readable authority'den üretilsin. Dynamic maps explicit wildcard schemas taşısın; unknown root default fail-closed, extension namespaces explicit olsun.
2. **Tek transaction service:** `readRaw(layer)`, `resolveWithProvenance`, `validateCandidate`, `diffRedacted`, `set/unset/reset`, `import/export`, `migrate`, `commitAtomic`, `rollback` API'si oluşturulsun. CLI/MCP/API/init/onboard/Desktop yalnız adapter olsun.
3. **PS-001 acceptance:** CLI/MCP/API/transaction service için `routing_v3.explorationBonus=2` write öncesi aynı typed error ile reddedilsin; `totally_unknown.foo` strict unknown error versin; failed write disk digestini değiştirmesin; successful write immediate effective round-trip etsin. Migration usability/schema validationını ayrı “validate” verdictiyle sunsun, “up-to-date” semantic-valid anlamına gelmesin.
4. **Secret-safe projection:** every field `public|sensitive|secret|credential-reference` sınıfı taşısın. Default output redacted; reveal yalnız explicit local authority + audit event ile. Export safe-by-default, secrets için references/env/vault kullanılsın.
5. **Atomicity:** aynı-directory temp + fsync policy + rename + cleanup + Windows adapter bütün writers için zorunlu olsun. Unexpected validator errors fail-closed olsun.

### P1 — decision authority'yi birleştir

6. **Checkpoint broker convergence:** `checkpoint approve/reject` direct writes kaldırılsın; checkpoint requests broker/federation'a principal, tenant, scope, risk, TTL, source ve idempotency ile mirror edilsin. CLI live TTY/fresh OIDC gibi authenticated ingress settlement sonrası legacy poll projection'ı atomik güncellesin. MCP checkpoint mutation kaldırılıp read-only veya authenticated external-decision request haline gelsin.
7. **Lifecycle driver:** expiry/policy transition scheduled authority olsun. CLI/MCP/API reads hiçbir durable state mutate etmesin; projected-vs-settled freshness ayrı alanlarla görünsün. Timeout public unions'a eklensin.
8. **Execution intent SSOT:** autoApprove, plan adoption, checkpoint policy, risk approval ve one-shot acknowledgement farklı types/field names/help text kullansın. CLI/MCP defaults eşitlensin; riskli default provider-permission bypass olmasın. Every invocation receipt actor/origin/digest/policy kararını taşısın.

### P2 — operator product surface'lerini tamamla

9. **CLI:** `config validate`, `show --effective --origin`, `diff`, `unset`, scoped `reset`, redacted `export`, dry-run `import/migrate`, schema-driven `keys/list/search` ve stable JSON contracts eklensin.
10. **MCP:** read/get/list/schema/diff/validate ve config resource aynı application service'i kullansın; write ayrı high-risk tool/annotation + writer lease + authority policy kullansın. CLI ile error/not-found semantics parity sağlansın.
11. **Desktop:** full management surface schema-generated controls, layer/provenance, defaults, redacted diff, validation, rollback, approval card ve platform path'iyle kapatılsın. Dashboard read-only kalsın; yalnız truthful effective/raw/provenance observability ve freshness göstersin.
12. **Init/onboard:** CLI init, MCP init, onboard aynı profile planner + transaction service'i kullansın. Fresh project, brownfield, corrupted, global/project ve every-platform golden tests aynı resolved outcome'u doğrulasın. Global path duplication kapatılsın.

### P3 — generated truth ve ADR closure

13. **Docs/UI generation:** EN/TR schema, CLI/MCP reference, Dashboard/Desktop metadata ve on-init config reference authored schema/command registry'den üretilsin. Generated docs version+schema digest taşısın; stale per-project docs explicit managed update/reconcile görsün.
14. **Feature truth:** curated manifest “catalog evidence” olarak etiketlensin; completeness için schema↔consumer↔surface graph gate'i ayrı olsun. Missing production consumer ve stale path/doc link required failure olsun.
15. **ADR/docs behavior:** owner exact desired semantics'i seçtikten sonra `auto_docs.tier3` ya gerçek artifacts için production-wired olsun ya deprecate edilsin. ADR create/update policy; trigger, relevance, status, numbering, conflict/idempotency, owner review, audit receipt ve memory sync ayrımlarını açık tanımlasın. `prompt.adr_*` render knobs emission'dan isim/namespace olarak ayrılmalı.

### P4 — proof matrix

16. Contract/property tests: canonical leaflerin her biri için declaration/default/validation/resolution/consumer/surface/docs/migration/secret/layer state'i explicit olsun; hiçbir boş hücre sessizce pass sayılmasın.
17. Cross-surface golden tests: CLI/MCP/API/Desktop aynı candidate için aynı accept/reject code, redacted diff ve resulting digest üretmeli; Dashboard aynı effective truth'i read-only göstermeli.
18. Real-binary platform tests: Linux, macOS, Windows native, WSL; fresh/brownfield/corrupt/global/project; concurrent readers/writers; crash injection; secret export; broker expiry; checkpoint auth bypass negative test.
19. Closure gates: lint-config-truth required, generated docs clean, i18n completeness, no hard-coded user string, no unknown accepted path, no raw secret default output, no direct checkpoint decision write, no write/read asymmetry.

## 13. Main drift delta appendix — audit truth'e dahil değildir

Audit base'i `ff48978…` olarak immutable tutuldu. Owner'ın bildirdiği güncel main `0d565b361ea599966cf7e485bef0d4eaade303c8`; branch rebase/merge edilmedi. Read-only `git diff ff48978…..0d565b3…` bu lane'de şu delta'ları gösterdi:

1. `tests/cli/commands/config-export.test.ts`, `tests/cli/commands/config.test.ts` ve `tests/cli/config-global.test.ts` `node:fs` mock'una `renameSync` ekliyor. Bu, pinned-base config bataryasındaki import-time failure sınıfının bir kısmını hedefler; product validation/metadata gap'lerini kapatmaz.
2. `src/cli/commands/init-steps.ts` fresh init için default worker execution budget, landing reserve ve subprocess unmetered `hold` ekliyor. Bu init budget gap'ini değiştirir; MCP init/onboard/canonical validation parity'sini kapatmaz.
3. `src/mcp/tools/plan.ts` default dry-runı gerçek provider preview'a çeviriyor; durable plan/event authority yalnız `dryRun:false` veya `approve:true` olduğunda kuruluyor. Bu §10.4'teki pinned-base “dryRun writes” contradiction'ını **main'de muhtemelen kapatır**. Main üzerinde build/test/real-binary verification bu lane'de yapılmadığı için `VERIFIED_CLOSED` denmedi.
4. `.deckent/settings/features-manifest.json` yalnız generatedAt/sprint window drift'i taşıyor; stale autonomous/approval kayıtlarını değiştirmiyor.
5. `5f9e851… → 0d565b3…` tek follow-up commit'i xverify evidence scope, producer-fence basis ve HOLD detail zincirini onarır (`src/cli/commands/xverify.ts`, `src/orchestra/cross-verify-production-ingress-authority.ts` ve hedefli tests). Bu committe CLI/MCP/API/Dashboard config, secret/recovery veya approval/checkpoint authority production source değişikliği yoktur; dolayısıyla bu raporun config finding disposition'ları değişmez.

Delta appendix yalnız morning reconciliation içindir; finding ve line evidence'in canonical truth'i pinned commit'tir.

## 14. Verification ve sınırlar

- Branch/HEAD: `audit/config-completion-20260825` / `ff48978fb78139ea34b8c5e98fc41532437af9c9`.
- Snapshot SHA-256: `34b6a7c25bca9a02ff2901682868e86ad4fc3bead05b2c4e5061cb249a686edb`.
- Operating policy SHA-256: `a44c27d496e863fd69723e8d1168fce7cb4d6bcc6d687705559c42bb22f68795`.
- Exact historical `update_adr` key bulunamadı; sonuç UNKNOWN/HOLD, benzer promise'ler ayrı kanıtlandı.
- Desktop negative evidence pinned `src/desktop/src` taramasına dayanır; olmayan kodu var sayan inference yapılmadı.
- Dashboard read-only disposition, `deckent-agentic-ux` + `deckent-design-dna` + `deckent-product-design` authority/freshness/progressive-disclosure kontratlarıyla değerlendirildi: write eksikliği değil, truth/provenance eksikliği finding yapıldı.
- Bu lane source/test/run-state/commit/push mutation yapmadı. Yalnız bu rapor ve versioned receipt üretildi.

### Receipt scope digest basis

`scopeDigest`, aşağıdaki UTF-8, no-trailing-newline compact JSON stringinin SHA-256'sıdır; key sırası gösterildiği gibidir:

```json
{"allowedFiles":["docs/audits/config-completion-2026-08-25/agent-reports/03-product-surfaces.md","docs/audits/config-completion-2026-08-25/handoffs/03-product-surfaces.json"],"baseSha":"ff48978fb78139ea34b8c5e98fc41532437af9c9","lane":"product-surfaces","outcomeId":"config-completion-audit-2026-08-25","role":"reviewer"}
```
