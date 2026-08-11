# Terminal Session ve Execution Authority — Guard Disposition, Tenant Isolation ve Break-Glass Handoff (2026-08-06)

> **Karar durumu:** KABUL EDİLDİ — Alperen, 2026-08-06 OWASP Agentic Top 10 bağımsız
> inceleme oturumu, Bulgu 7.
>
> **Implementation durumu:** Bu oturumda production kodu, config, test veya canonical ledger
> değiştirilmedi. Bu belge başka bir Deckent session'ında Goal/Mission/Flow/Run planına alınacak
> implementation authority girdisidir.
>
> **Önceki bulgu hükmü:** **PARTIAL.** `createHttpServer()` artık resolved bind host'u
> `PtySessionManager`'a geçirir; bu nedenle “non-loopback dahil bütün production yollarında host
> default localhost kalıyor” iddiası güncel değildir. Buna karşılık canonical `deckent serve` embedded
> terminali yalnız loopback'te açar ve guard loopback'i açıkça muaf tutar. Daha önemlisi, gerçek UI
> input'u PTY chunk/keystroke biçiminde aktarıldığından regex guard command authority değildir.
>
> **Canonical ledger owners:** assurance parent `SEC-OWASP-ASI-001` (order 4190), disposition owner
> `SEC-ENFORCE-WIRE-001` (4200), authority owners `PRINCIPAL-001` (4010), `TENANT-001` (4020),
> `OPERATION-001` (4030), `CAPABILITY-001` (4040), `APPROVAL-001` (4050),
> `TOOL-AUTHORITY-001` (4060), `API-SECURITY-001` (4130), `TRUST-HANDOFF-001` (4180);
> product owners `TERMINAL-001` (5000), `TERMINAL-TOOLS-001` (5010),
> `TERMINAL-XPLAT-001` (5090), `TERMINAL-CONTEXT-001` (5100).
>
> **Hard architecture dependencies:**
> `docs/audits/provider-neutral-worker-execution-authority-design-2026-08-06.md`,
> `docs/audits/attempt-effect-attribution-authority-design-2026-08-06.md` ve
> `docs/audits/enforcement-module-disposition-authority-design-2026-08-06.md`.

## 1. Sonuç — tek cümle

Deckent, arbitrary PTY byte stream'ini regex ile command-authorize etmeye çalışmayacak; terminal
authentication'ını VerifiedPrincipal resolution'a, bütün session lifecycle işlemlerini tenant/owner-scoped
AuthorizationAuthority'ye, execution'ı provider-neutral containment'a bağlayacak; managed terminali default
yüzey, raw shell'i explicit attended ve time-bounded break-glass capability yapacak; `command-guard` ve
`prompt-guard` blocking authority claim'ini replacement closure sonrası retire edip yalnız bounded risk
telemetry olarak kullanabilecektir.

## 2. Kapsam

Bu karar aşağıdaki production zincirini kapsar:

1. terminal HTTP authentication ve session create/list/kill routes;
2. WebSocket authentication, attach/input/resize/detach bridge'i;
3. `PtySessionManager` session registry ve lifecycle işlemleri;
4. `SessionBackend` spawn boundary'si;
5. `shell`, `ai` ve `deckent` session kind semantics;
6. `command-guard` ve `prompt-guard` disposition'ı;
7. loopback, reverse proxy, Desktop, remote ve enterprise trust ayrımı;
8. tenant/project/principal/session ownership ve IDOR prevention;
9. raw shell break-glass policy'si;
10. managed terminal/Tool Gateway/ApprovalBroker integration'ı;
11. audit, receipt, revocation, recovery, scale ve Every Environment proof'u;
12. mevcut `terminal.allowShellKind` config'inin migration/disposition'ı.

Bu belge şunları **yapmaz**:

- `docs/MASTER-PLAN.md` state, dependency veya evidence alanlarını değiştirmez;
- source/config/test implementation'ı yapmaz;
- raw PTY üzerinde güvenilir command parsing yapılabileceğini varsaymaz;
- loopback veya valid token'ı tek başına authorization saymaz;
- mevcut accepted ADR'yi sessizce yeniden yazmaz; implementation session ADR truth drift'ini typed
  amendment/successor kararıyla çözmelidir.

## 3. Nihai verdict ve enforcement matrisi

| Mekanizma | Bugünkü production gerçeği | Sınıf | Güvenlik notu | Nihai disposition |
|---|---|---|---|---|
| Terminal credential verification | HTTP ve WS bridge öncesinde token/JWKS doğrular; API auth bypass'ından bağımsızdır | **ENFORCED** authentication | Güçlü credential check, principal/authz taşımaz | VerifiedPrincipal üreten AuthenticationAuthority'ye cut over |
| `command-guard` | Yalnız exact `shell` + non-loopback bind + tek chunk'ta altı regex | Dar predicate için **ENFORCED**, boundary olarak **ADVISORY/PARTIAL** | Zayıf | Blocking authority claim'ini retire; optional telemetry'ye absorb |
| `prompt-guard` | Her WS input frame'inde üç regex; match frame'i PTY'ye yazılmaz | Dar predicate için **ENFORCED**, boundary olarak **ADVISORY/PARTIAL** | Zayıf | Blocking authority claim'ini retire; bounded untrusted-input signal olarak absorb |
| `terminal.allowShellKind` | Exact `kind === 'shell'` için blok; default `true`; unknown kind fallback ile bypass | **CONFIG-GATED/PARTIAL** | Zayıf | Versioned session-policy profiles'a migrate; boolean tek başına authority olmayacak |
| AI executable allowlist | `ai` kind için client-supplied tool yalnız claude/gemini/codex | **ENFORCED/PARTIAL** | Orta-dar | Executable identity + artifact provenance + capability profile'a absorb |
| Session max/idle/output controls | max session, idle reap, scrollback ve outbound quota production-wired | **ENFORCED** resource controls | Orta | Tenant/principal/session quotas ve durable policy ile genişlet |
| Session create/list/attach/input/resize/kill authorization | Credential sonrası operation/owner/tenant kararı yok | **UNWIRED** | Kritik gap | Canonical SessionAuthorizationAuthority üret ve bütün ingress'leri cut over et |
| Session owner binding | `SessionMeta` tenant taşır, principal owner taşımaz | **UNWIRED** | Kritik gap | Immutable principal/tenant/project/session grant bağla |
| Execution containment | Local PTY process user yetkisi + inherited `process.env`; scoped fs/network/process envelope yok | **UNWIRED** | Kritik gap | ExecutionEnvironmentAdapter + sandbox + secret profile + Tool Gateway |
| Raw shell approval | `allowShellKind` boolean dışında attended approval/TTL yok | **UNWIRED** | Kritik gap | Break-glass capability + ApprovalBroker + expiry/revoke |

Önceki bulgunun exact hükmü **PARTIAL**, daha geniş “terminal command security boundary güvenilir değil”
hükmü **CONFIRMED**'dır. Ayrıca önceki bulguda bulunmayan iki kritik gap bu karara eklenmiştir:

1. unknown `SessionKind` → shell fallback → config ve guard double bypass;
2. valid credential sahibi için cross-tenant/cross-owner list/attach/kill IDOR.

## 4. Bugünkü code-truth baseline

### 4.1 Canonical CLI terminal yolu loopback-only'dir

`deckent serve` default host'u `127.0.0.1` seçer (`src/cli/commands/serve.ts:72-80`). CLI, host
loopback değilse embedded terminali kapatır ve yalnız loopback'te `LocalPtyBackend` üretir
(`src/cli/commands/serve.ts:91-103`).

Bu davranış remote exposure riskini bugün daraltır; fakat loopback'i owner authorization yapmaz. Aynı host'taki
başka process, reverse proxy, SSH tunnel, port forwarding veya Desktop bridge üzerinden gelen caller yine
loopback listener'a ulaşabilir. Transport topology ile caller authority ayrı eksenlerdir.

Core config default'ları terminali açık, bind'i `127.0.0.1` ve raw shell kind'ını açık tutar:

- `enabled: true` (`src/core/config.ts:255-257`);
- `bind: '127.0.0.1'` (`src/core/config.ts:257`);
- `allowShellKind: true` (`src/core/config.ts:261`).

Dolayısıyla default local product experience, terminal token holder'a raw host-user shell açar; command guard
ise bu exact default yolda loopback muafiyetine düşer.

### 4.2 Önceki host-wiring bug'ı düzeltilmiştir

`createHttpServer()` explicit caller host veya `terminal.bind` config'inden resolved bind host üretir
(`src/api/server.ts:2022-2037`, `:2056-2074`). Aynı `host`:

- `PtySessionManager` options'a verilir (`src/api/server.ts:2457-2466`);
- gerçek `server.listen()` çağrısında kullanılır (`src/api/server.ts:2754`).

Server-level test de non-loopback bind'de contiguous `rm -rf /` chunk'ının bloklandığını, loopback bind'de aynı
chunk'ın geçtiğini doğrular (`tests/api/terminal/server-command-guard-wire.test.ts:40-71`).

Bu nedenle eski “server host'u hiç plumb etmiyor” kök-nedeni artık geçerli değildir. Ancak manager'a taşınan
değer transport peer değil listener bind'dır; test de gerçek keyboard fragmentation, reverse proxy veya
principal authorization'ı ölçmez.

### 4.3 `command-guard` gerçek davranışı

Guard altı pattern taşır:

1. `rm -rf /` varyantı;
2. `mkfs`;
3. `dd ... of=/dev/...`;
4. fork bomb;
5. SSH key rewrite;
6. `authorized_keys` write.

Kanıt: `src/api/terminal/command-guard.ts:8-36`.

Decision sırası:

- boş input match üretmez (`src/api/terminal/command-guard.ts:38-49`);
- session kind exact `shell` değilse tamamen bypass (`:55`);
- host `127.0.0.1`, `::1` veya `localhost` ise tamamen bypass (`:6`, `:56`);
- kalan durumda yalnız regex match'leri döner (`:57`).

Manager her `write(id, data)` çağrısında yalnız o `data` chunk'ını tarar. Match olursa structured event üretir,
session'ı kill eder ve chunk'ı PTY'ye yazmaz; match yoksa chunk doğrudan backend'e geçer
(`src/api/terminal/session-manager.ts:115-140`).

Test suite de loopback'te `rm -rf /` ve `mkfs` bypass'ını, non-shell AI bypass'ını ve remote exact-pattern
match'lerini contract olarak sabitler (`tests/security/command-guard.test.ts:9-58`). Bu testler bug değil,
mevcut tasarım niyetini doğrular; fakat tasarım niyeti terminal authorization gereksinimini karşılamaz.

### 4.4 PTY fragmentation guard'ı normal kullanımda aşar

WebSocket gateway her JSON message'i ayrı parse eder. `input` mesajının `data` alanı önce `prompt-guard`'a,
sonra manager `write()`'ına tek chunk olarak verilir (`src/api/terminal/ws-gateway.ts:213-260`). Chunk'lar
arasında command state veya shell grammar state tutulmaz.

Gerçek UI producer'ları command-line değil `xterm.onData()` parçaları gönderir:

- Dashboard `term.onData((d) => send(d))` yapar (`src/dashboard/src/components/terminal/TerminalView.tsx:46-48`);
- dashboard socket her `data` parçasını ayrı `{t:'input', data}` frame'ine sarar
  (`src/dashboard/src/components/terminal/useTerminalSocket.ts:48-51`);
- Desktop aynı modeli kullanır (`src/desktop/src/renderer/shell/EngineRoom.tsx:209-211`);
- Desktop frame encoder input'u değiştirmeden tek frame'e koyar
  (`src/desktop/src/renderer/shell/terminal-frames.ts:36-42`).

Normal interaktif yazımda `rm -rf /` tek command string olarak değil karakter veya küçük chunk'lar olarak gelir.
Hiçbir tek chunk regex'i taşımadığında guard match üretmez. Aynı bypass paste segmentation, client-crafted
frames, control sequences ve reconnect boundary'lerinde de vardır.

Bu eksik yalnız buffering ile güvenli biçimde kapatılamaz. Shell line editing, terminal control bytes,
aliases, variables, command substitution, sourced files, functions, child shells, encodings, POSIX shell
farkları, PowerShell, `cmd.exe` ve WSL command semantiğini bir transport gateway'in eksiksiz yeniden
oluşturmasını gerektirir. Böyle bir parser shell'in kendisi olur ve yine filesystem/process side effects'i
authorize edemez.

### 4.5 `prompt-guard` aynı structural sınıra sahiptir

`prompt-guard` üç pattern arar:

- 256+ karakter base64 blob;
- OSC escape başlangıcı;
- `curl ... | shell`.

Kanıt: `src/api/terminal/prompt-guard.ts:5-10`, `:18-40`.

Match tek input frame'inde bulunursa gateway audit sinyali ve `guard_block` response üretir, frame'i manager'a
göndermez (`src/api/terminal/ws-gateway.ts:236-260`). Parçalanmış base64, parçalanmış OSC veya farklı download
tool/shell grammar'ı bu kontrolün coverage'ı dışındadır.

Bu mekanizma untrusted-input/risk telemetry için kullanılabilir; code execution veya prompt injection absence
authority'si değildir.

### 4.6 Yeni kritik bulgu A — unknown `SessionKind` shell fallback

Compile-time type yalnız üç değer tanımlar: `ai | deckent | shell`
(`src/api/terminal/types.ts:1-10`). HTTP ingress bunu runtime'da doğrulamaz:

1. parsed body `kind?: string` olarak cast edilir (`src/api/server.ts:2633-2638`);
2. `terminal.allowShellKind` yalnız exact `kind === 'shell'` değerini bloklar (`:2639-2645`);
3. input, runtime validator olmadan `SessionKind` olarak cast edilir (`:2656-2662`);
4. manager command lookup miss'inde `SHELL_CMD` fallback seçer
   (`src/api/terminal/session-manager.ts:54-72`);
5. session metadata gerçek executable yerine caller'ın bilinmeyen `kind` değerini saklar (`:73-79`);
6. command guard metadata `kind !== 'shell'` gördüğü için bütün input'u muaf tutar
   (`src/api/terminal/command-guard.ts:55`).

Sonuç: `terminal.allowShellKind=false` iken `kind:'other'` gibi bilinmeyen değer raw shell spawn eder; metadata
shell olmadığını iddia eder; remote bind'de bile command guard çalışmaz. Bu fail-open double bypass'tır.

Mevcut config testi yalnız exact `kind:'shell'` denial ve `kind:'ai'` acceptance'ı ölçer
(`tests/api/terminal-config-wire.test.ts:114-133`); unknown-kind negatif contract'ı yoktur.

Bu belge kapsamında test koşturulmamıştır; bulgu doğrudan production control-flow ve type-erasure
code-truth'undan çıkarılmıştır.

### 4.7 Yeni kritik bulgu B — session owner yok, tenant IDOR var

`SessionMeta` yalnız `id`, `kind`, `tenantId`, creation/status/exit bilgisi taşır; `principalId`, `projectId`,
owner, role, capability grant veya policy revision taşımaz (`src/api/terminal/types.ts:13-20`). Manager API'leri
de caller context almaz:

- `list()` bütün map'i döndürür (`src/api/terminal/session-manager.ts:103-109`);
- `replay(id)` yalnız ID ile scrollback verir (`:111-113`);
- `write`, `resize`, `attach`, `detach`, `kill` yalnız ID ile çalışır (`:115-163`).

HTTP terminal auth başarıdan sonra:

- GET bütün session'ları tenant filtresiz listeler (`src/api/server.ts:2679-2684`);
- DELETE caller-supplied ID'yi owner/tenant kontrolü olmadan kill eder (`:2686-2699`).

WebSocket auth başarıdan sonra client:

- herhangi bir string `sessionId` gönderebilir (`src/api/terminal/ws-gateway.ts:221-224`);
- replay buffer'ı authorization olmadan alır (`:224-227`);
- session output listener'ına authorization olmadan attach olur (`:228`);
- sonrasında input ve resize işlemlerini o session üzerinde yapar (`:236-267`).

Gateway caller tenant'ını session authorization için kullanmaz. `tenantOf()` hedef session metadata'sındaki
tenant'ı alır (`src/api/terminal/ws-gateway.ts:153-162`). Bu nedenle saldırgan attach/input olayı audit'te hedef
tenant'ın normal session olayı gibi görünebilir (`:229-235`). Existing test bu davranışı “session real tenant
propagation” olarak doğrular; caller/session tenant mismatch negatif testi yapmaz
(`tests/api/ws-tenant-propagation.test.ts:131-162`).

Enterprise/JWKS veya başka multi-user auth ortamında valid credential sahibi session listesi üzerinden başka
tenant/session ID'sini öğrenebilir, output replay/stream'i okuyabilir, input yazabilir, resize veya kill
uygulayabilir. Bu ASI03 Identity & Privilege Abuse, API IDOR ve cross-tenant confidentiality/integrity breach'tir.

### 4.8 Authentication güçlü bir temel, fakat authorization değildir

Terminal her server start'ta ayrı random token üretir; global API auth disable terminal auth'ını açmaz
(`src/api/server.ts:2431-2435`). `LocalTokenAuthProvider` token'ı SHA-256 digest üzerinde constant-time compare
ile doğrular ve API bypass flag'ini bilerek yok sayar (`src/api/terminal/auth-provider.ts:41-67`).

WebSocket gateway bridge'i ancak auth başarıdan sonra çağırır; async verifier beklerken socket'i pause eder ve
reject/throw path'ini deny sayar (`src/api/terminal/ws-gateway.ts:75-140`). Bu credential verification için
değerli, fail-closed production controls'dür ve korunmalıdır.

Boşluk `AuthProvider` contract'ındadır: `verify()`/`verifyAsync()` yalnız boolean döndürür; verified principal,
tenant, roles, auth method, assurance veya credential lineage döndürmez
(`src/api/terminal/auth-provider.ts:14-35`). Yalnız optional mTLS seam tenant döndürebilir.

HTTP handler bearer payload'ından principal'ı ayrı decode eder (`src/api/server.ts:2610-2621`).
`deriveRequestPrincipal()` kendi contract'ında JWT payload'ını signature verification yapmadan okuduğunu ve
`authGateVerified:true` yoksa claims'in authorization için trusted sayılmaması gerektiğini açıkça belirtir
(`src/api/auth-me-endpoint.ts:85-130`). Terminal caller bu flag'i vermez.

JWKS verify aynı bearer için daha sonra başarılı olduğunda payload signature pratikte doğrulanmış olsa da bu
gerçek typed principal provenance olarak taşınmaz. Boolean auth sonucu ile ayrı unverified decode arasında
structural split vardır. Doğru authority contract'ı credential verification ve principal resolution'ı tek
atomik sonuçta birleştirmelidir.

### 4.9 Local PTY ambient host authority ile spawn olur

Manager session kind'e göre executable seçer:

- AI: caller tool veya default `claude`;
- Deckent: `deckent` + caller args;
- shell: platform default shell.

Kanıt: `src/api/terminal/session-manager.ts:44-60`.

Manager `cwd` yoksa `process.cwd()` kullanır ve `SessionBackend.spawn()` çağırır
(`src/api/terminal/session-manager.ts:66-99`). `LocalPtyBackend` child environment'ı
`{...process.env, ...spec.env}` ile oluşturur (`src/api/terminal/session-backend.ts:27-39`). Manager bugün
scoped `spec.env` sağlamaz.

Sonuç olarak raw shell ve AI/deckent subprocess'leri daemon kullanıcısının:

- inherited environment/secrets;
- filesystem permissions;
- network reachability;
- process spawning authority;
- credential sockets/files;
- project ve host state erişimi

ile çalışır. Session-specific filesystem/network/process/secret capability envelope yoktur. Authentication
token holder'ın kim olduğunu doğrulasa bile subprocess least privilege değildir.

### 4.10 AI allowlist değerlidir fakat containment değildir

Server `ai` kind için caller-supplied tool'u `claude`, `gemini`, `codex` allowlist'iyle sınırlar
(`src/api/server.ts:135-143`, `:2647-2655`). Bu arbitrary executable-name injection'ı daraltan gerçek runtime
kontroldür ve replacement'a taşınmalıdır.

Ancak allowlisted provider CLI yine ambient host authority ile spawn olur. `command-guard` non-shell kind'i
bilerek muaf tutar (`src/api/terminal/command-guard.ts:55`). Provider'ın daha sonra tool/shell çağırması
terminal input regex'inin authority domain'i değildir; provider-neutral worker execution authority ve Tool
Gateway bu yolu kapsamalıdır.

### 4.11 Resource controls korunacak değerli primitives'tir

Bugünkü terminal subsystem yalnız guard'lardan oluşmaz. Korunması gereken primitives vardır:

- `maxSessions` admission (`src/api/terminal/session-manager.ts:66-69`);
- bounded scrollback ring (`:89-93`);
- idle reaper (`:165-171`, `src/api/server.ts:2746-2751`);
- tenant-keyed outbound byte limiter (`src/api/terminal/ws-gateway.ts:166-191`);
- structured lifecycle audit ve raw PTY output'u audit sink'e yönlendirmeme
  (`src/api/server.ts:2472-2482`).

Bu controls resource safety/forensics primitives'tir. Principal-scoped quota, owner authorization, secret
egress classification veya execution containment yerine geçmezler.

## 5. Tehdit modeli

### 5.1 Korunan varlıklar

- repository source, config, build/release state ve canonical ledger;
- `.brain/memory.db`, `.tasks/*`, credentials ve provider auth state;
- daemon process environment ve host filesystem;
- başka tenant/project/session output ve input stream'leri;
- approval decisions ve execution receipts;
- training/evaluation traces;
- remote execution targets, pods, containers, SSH hosts ve service accounts;
- operator trust ve terminalde görünen provenance/context.

### 5.2 Adversary sınıfları

1. valid local terminal token'ını ele geçiren aynı-host process/user;
2. valid enterprise credential'a sahip düşük-privilege tenant user;
3. reverse proxy/tunnel üzerinden loopback listener'a ulaşan remote caller;
4. indirect prompt injection etkisindeki AI provider session'ı;
5. malicious/compromised project content, MCP/plugin/skill/tool output'u;
6. stale/revoked session grant kullanan reconnect client;
7. compromised or misconfigured remote `SessionBackend`;
8. resource-exhaustion veya audit/auth/authorization outage koşulu;
9. rogue agent'ın meşru session görünümünü kullanarak host effect üretmesi.

### 5.3 Abuse-case matrisi

| Vektör | Bugünkü yol | Beklenen target davranış |
|---|---|---|
| Command'i karakter karakter gönderme | Her chunk regex'ten geçer, full command görünmez | Regex authority claim yok; session capability + sandbox effect'i sınırlar |
| Unknown kind ile shell açma | Exact shell config gate aşılır, manager shell fallback yapar | Runtime enum validator unknown değeri fail-closed reject eder; manager fallback taşımaz |
| Başka tenant session'ını listeleme | GET global map döndürür | Principal/tenant/project-scoped query; unauthorized resource existence sızmaz |
| Başka session'a attach/replay | WS client ID'yi seçer | Attach operation exact owner/share grant + tenant + generation doğrular |
| Başka session'a input/resize/kill | Manager yalnız ID bilir | Her operation session grant, principal ve fence ile authorize edilir |
| Reverse proxy arkasında localhost | Bind loopback olduğu için command guard muaf | Listener bind authority vermez; verified principal ve deployment policy belirler |
| AI session indirect injection | Non-shell command guard muaf; process ambient authority taşır | Provider Tool Gateway ve constrained ExecutionEnvironmentAdapter dışında effect üretemez |
| Raw shell'den secret exfil | Inherited env/network/fs | Break-glass secret profile + sandbox + egress policy + explicit risk/approval |
| Revoked user reconnect | In-memory ID ve valid generic token yeterli olabilir | Attach/input her seferde expiry/revocation/fence doğrular |
| Authorization service outage | Bugünkü ayrı authority yok | Enforce profile fail-closed HOLD; mevcut session capability policy'ye göre suspend/terminate |

## 6. Güven modeli — birbirine karıştırılmayacak kimlikler

Target architecture en az beş farklı identity/scope'u ayrı taşımalıdır:

| Alan | Anlam | Authority üretir mi? |
|---|---|---|
| Listener bind | Server'ın dinlediği interface/address | Hayır; yalnız exposure evidence |
| Transport peer | TCP/proxy/mTLS bağlantı kaynağı ve chain'i | Tek başına hayır; authentication evidence |
| Verified principal | Doğrulanmış human/workload/device identity + assurance | Authorization input'u, tek başına grant değil |
| Session owner/share set | Session'ı oluşturan ve attach/use yetkisi verilen principals | Session authorization input'u |
| Execution target | Local host/container/pod/SSH/WSL environment identity | Capability resource'u; caller identity değildir |

`localhost`, `local`, `api-static`, tenant ID, session ID veya executable name birbirinin yerine authority
taşımamalıdır.

## 7. Target authority architecture

### 7.1 Canonical akış

Her terminal ingress'i aşağıdaki producer→consumer→effect zincirine bağlanmalıdır:

1. **AuthenticationAuthority** credential, peer ve deployment context'i doğrular;
2. immutable **VerifiedPrincipal** üretir;
3. request versioned **OperationCatalog** entry'sine normalize edilir;
4. **SessionAuthorizationAuthority**, principal + tenant/project + resource + operation + policy revision için
   allow/deny/HOLD kararı üretir;
5. high-risk operation gerekirse **ApprovalBroker** exact proposal/grant için durable decision verir;
6. **SessionCapabilityGrant** exact profile, target, TTL, quotas ve permissions'i taşır;
7. **ExecutionEnvironmentAdapter** grant'i platform-native sandbox/containment'a çevirir;
8. manager yalnız authorized grant/session generation ile spawn/attach/input/resize/kill yapar;
9. structured **Invocation/Session/Effect Receipts** causal lineage üretir;
10. expiry, revoke, tenant freeze, policy change veya monitoring loss exact typed settlement/suspension üretir.

Hiçbir gateway, UI, provider adapter veya backend kendi local authorization policy engine'ini taşımamalıdır.

### 7.2 AuthenticationAuthority sonucu

Boolean `verify` yerine semantic olarak tek atomik auth sonucu bulunmalıdır. En az şu facts'i taşımalıdır:

- stable `principalId`;
- principal kind: local owner, human, workload, connector/device;
- verified tenant/org memberships;
- roles/claims ve claim provenance;
- auth method: local bootstrap, OIDC/JWKS, mTLS, workload;
- issuer/audience/key/cert lineage;
- authentication assurance level;
- verified-at ve credential expiry;
- transport peer/proxy chain evidence;
- device/session binding varsa exact reference;
- denial/HOLD reason ve retry semantics.

Caller-controlled raw header, unverified JWT payload veya default `'local'` authorization input'u olamaz.
Solo/community experience anonymous bırakılmamalı; explicit `local-owner` principal aynı canonical type ile
çözülmelidir.

### 7.3 Versioned terminal operation catalog

Minimum operation family:

| Operation | Effect class | Normal risk |
|---|---|---|
| `terminal.session.create` | process/session allocation | medium/high profile-dependent |
| `terminal.session.discover` | metadata read | medium cross-tenant-sensitive |
| `terminal.session.attach` | output read + control binding | high |
| `terminal.session.replay` | historical output read | high/confidential |
| `terminal.session.input` | process effect | high |
| `terminal.session.resize` | session control | low/medium |
| `terminal.session.detach` | control release | low |
| `terminal.session.terminate` | destructive process effect | high |
| `terminal.managed.invoke` | structured tool/Deckent operation | catalog-derived |
| `terminal.shell.break_glass` | arbitrary execution | critical |
| `terminal.session.share` | privilege delegation | critical |
| `terminal.session.revoke` | privilege/session revocation | high |

Operation IDs stable/versioned olmalı; HTTP verb, WS frame name veya UI action kendi başına operation
identity olmamalıdır.

### 7.4 SessionCapabilityGrant

Her live session immutable/fenced bir grant'e bağlı olmalıdır. Minimum semantics:

- grant/session/generation/fence ID;
- principal owner ve explicit share principals/groups;
- tenant/org/project/workspace identity;
- session profile ve requested/resolved kind;
- exact execution target identity/adapter;
- executable/artifact identity ve provenance;
- allowed terminal operations;
- allowed tool/Deckent operation seti;
- filesystem read/write/tree/mutation policy;
- process spawn/child/IPC policy;
- network/egress policy;
- secret/environment profile;
- cwd/project-root authority;
- CPU/memory/process/session/output quotas;
- created/valid-from/expires-at/max-idle;
- approval decision ve policy revision reference;
- revocation/freeze/monitoring requirements;
- audit/redaction/retention class;
- sharing/reattach semantics.

Session manager caller-supplied `CreateSessionInput`'ı direct authority saymamalı; authority-produced grant
ve verified principal context'i tüketmelidir.

### 7.5 Session registry ve ownership

Registry en az şu invariants'i enforce etmelidir:

1. session ID global tahmin edilemez olsa bile authorization yerine geçmez;
2. metadata owner principal, tenant, project, grant, generation ve target taşır;
3. list query default olarak principal+tenant+project scope'unda çalışır;
4. shared session yalnız explicit share grant ile görünür/attach edilebilir;
5. attach öncesi authorization tamamlanmadan replay byte'ı çıkmaz;
6. input/resize/detach/kill attached socket'in cached auth sonucuna kör güvenmez; expiry/revoke policy'sine göre
   yeniden doğrular veya valid lease kullanır;
7. reconnect stale generation'a attach olamaz;
8. kill/revoke exactly-once/fenced settlement üretir;
9. unknown/missing session için response IDOR-safe ve audit-visible olur;
10. audit tenant hedef session'dan kopyalanmaz; verified actor ve target ayrı alanlarda tutulur.

PTY process restart-survival desteklenmiyorsa bu dürüstçe declared capability olarak kalabilir; security
metadata/receipt yine durable olmalı ve daemon restart orphan/stale grants'i terminal state'e settle etmelidir.

## 8. Terminal profile modeli

### 8.1 `managed` — default product yüzeyi

Deckent'in day-to-day default terminal experience'i arbitrary raw shell değil, structured operation/tool
yüzeyi olmalıdır:

- progressive disclosure ile task/role için en küçük tool seti;
- Tool Gateway üzerinden typed input/output/effect;
- canonical Operation/Capability/Approval authority;
- project-scoped context;
- attempt/effect/landing receipts;
- content provenance ve untrusted-output boundary;
- cancel/retry/recovery semantics;
- no hidden provider login/auth mutation;
- same contract CLI, native terminal, Desktop, API ve connectors için surface-parity.

Bu full-control'u azaltmaz; unsafe ambient authority yerine consequence-visible, composable ve auditable control
sağlar.

### 8.2 `developer` — scoped interactive environment

Geliştirici use-case'i için interactive shell/tooling gerekebilir. `developer` profile:

- explicit project/workspace capability;
- declared filesystem RW scope;
- host home/secrets/system paths default-deny;
- bounded child process/resource policy;
- resolved network/egress policy;
- filtered environment/secret injection;
- no implicit Docker socket/SSH agent/cloud credential grant;
- provider-neutral sandbox adapter;
- session TTL/idle expiry;
- visible target/project/account/context;
- protected mutations için canonical ApprovalBroker.

Bu profile raw host-user shell ile eş anlamlı değildir; platform-native isolated development environment'dır.

### 8.3 `break-glass` — raw arbitrary shell

Raw PTY command stream yalnız explicit break-glass capability olmalıdır:

- owner/authorized admin request'i;
- exact target/project ve risk summary;
- attended, durable, exact-digest/policy-revision approval;
- kısa max TTL ve idle TTL;
- explicit environment/secret/network/filesystem exposure özeti;
- no silent auto-renew;
- revoke/tenant freeze/monitoring loss'ta suspend/kill policy;
- high-visibility UI state;
- structured create/attach/share/revoke/terminate receipts;
- autonomous agent ve unattended flow'lara default-deny;
- training/compliance evidence'ta ordinary managed execution gibi gösterilmeme;
- remote/enterprise profile'da policy tarafından tamamen disabled olabilme.

Break-glass içinde per-command regex security iddiası yapılmaz. Containment profile izin veriyorsa kullanıcı o
authority içinde arbitrary command çalıştırabilir; izin vermiyorsa effect OS/remote target boundary'sinde
bloklanır.

### 8.4 Profile matrix

| Özellik | Managed | Developer | Break-glass |
|---|---|---|---|
| Default | Evet | Policy/owner opt-in | Hayır |
| Input | Structured operations | Interactive PTY/tooling | Raw PTY |
| Authority | Per operation | Session grant + protected op gates | Critical session grant |
| Filesystem | Exact capability | Scoped project/workspace | Explicit approved exposure |
| Environment | Minimal | Filtered profile | Explicit disclosed profile |
| Network | Tool/operation policy | Scoped policy | Explicit approved policy |
| Approval | Risk-derived | Profile/protected mutation | Always attended initial grant |
| TTL | Session/policy | Bounded | Short, no auto-renew |
| Autonomous agent | Evet, tool-scoped | Policy-dependent | Default-deny |
| Regex guard | Optional signal | Optional signal | Optional signal, never authority |

## 9. Execution containment

### 9.1 ExecutionEnvironmentAdapter contract

Bulgu 4'te kabul edilen provider-neutral worker execution authority bu terminal için de shared dependency'dir.
Terminal ayrı sandbox implementation'ı üretmemelidir. Adapter family en az şunları kapsamalıdır:

- Linux namespace/container/sandbox adapter;
- macOS sandbox/virtualization adapter;
- Windows native Job Object/AppContainer/ACL/process-tree adapter;
- WSL distribution boundary adapter;
- OCI/container/pod exec adapter;
- SSH/remote host adapter;
- honestly unsupported adapter state.

Her adapter resolved grant'in hangi facets'ini enforced/advisory/unsupported uyguladığını typed capability
evidence ile döndürmelidir. Unsupported facet silent host fallback yapamaz.

### 9.2 Filesystem

Default managed/developer execution:

- canonical source root'u explicit policy'ye göre RO veya scoped RW açar;
- staging/worktree/overlay semantics'i Attempt Effect Authority ile paylaşır;
- user home, SSH, cloud config, Deckent memory/task state ve system paths'i default-deny tutar;
- symlink/reparse/junction/hardlink/mount escape'e dayanır;
- child process'lere aynı effective policy'yi miras bırakır;
- requested scope ile observed/landed effects'i bağımsız ölçer.

### 9.3 Environment ve secrets

`process.env` blanket inheritance kaldırılmalıdır. Target model:

- minimal platform-required environment;
- explicit provider/tool credential broker;
- secret handle/lease, mümkünse raw value yerine;
- target/tenant/project-bound secret policy;
- expiry/revoke;
- child-process propagation control;
- logs/audit/output redaction;
- environment evidence'da secret value değil profile/handle identity.

Raw shell break-glass daha geniş environment istiyorsa exact exposure approval'da görünmelidir.

### 9.4 Network, process ve privileged sockets

Policy şu surfaces'i explicit ele almalıdır:

- outbound DNS/HTTP/SSH;
- localhost services;
- Unix sockets/named pipes;
- Docker/container runtime sockets;
- SSH agent;
- browser/desktop IPC;
- parent daemon control socket;
- process tree, daemonization ve detached children;
- signals, ptrace/debug ve credential inheritance.

Terminal session bitince yalnız parent PTY değil grant'e ait process tree/fenced remote execution da settle
olmalıdır.

## 10. Raw PTY input ve guard disposition

### 10.1 Yapılmayacak çözüm

Aşağıdakiler kabul edilmiş çözüm değildir:

- loopback exemption'ını yalnız kaldırmak;
- altı regex'e daha fazla regex eklemek;
- input'u newline'a kadar buffer edip shell parser saymak;
- LLM ile her command'i “safe/unsafe” sınıflamak;
- aliases/substitution/PowerShell için ayrı denylist yazmak;
- valid terminal token'ı raw shell capability saymak;
- command match yokluğunu security receipt üretmek;
- prompt guard'ı prompt injection absence kanıtı saymak.

### 10.2 Korunabilecek detection değeri

Guard primitives replacement sonrası isteğe bağlı detector olarak tutulacaksa:

- adı enforcement çağrıştırmamalı;
- output yalnız `RiskSignal` olmalı;
- false-negative/false-positive coverage açık olmalı;
- raw input veya secret audit sink'e yazılmamalı;
- segmented-frame state yalnız telemetry kalitesini artırabilir, authority üretmemeli;
- signal Approval/Policy Authority'ye input olabilir fakat tek başına karar veremez;
- detector unavailable/throw session capability'yi genişletmemeli;
- telemetry retention/tenant/redaction policy'sine tabi olmalı;
- documentation “constrains what a session can execute” claim'ini bırakmalı.

### 10.3 Retire sırası

1. Current reachability ve callers inventory'si fresh doğrulanır.
2. Unknown-kind fail-closed contract ve session authorization ingress closure sağlanır.
3. Execution containment/profiles production'a bağlanır.
4. Managed/default ve break-glass semantics bütün surfaces'te cut over edilir.
5. Guard output'u tüketen audit/UI/docs/tests detector vocabulary'ye migrate edilir.
6. Blocking authority claim'i ve misleading invariant references kaldırılır/amend edilir.
7. No-old-authority reachability proof üretilir.
8. Duplicate/dead code replacement closure sonrası retire edilir.

## 11. Config ve rollout authority

### 11.1 Bugünkü config gerçeği

`terminal.allowShellKind` boolean ve default `true`dur (`src/core/config-types.ts:71`,
`src/core/config.ts:255-262`). Server raw config'i okur ve exact boolean ise local default'u override eder
(`src/api/server.ts:2399-2402`). Exact `shell` creation'da false değeri 403 üretir
(`src/api/server.ts:2639-2645`). Unknown kind bypass nedeniyle bugün tam enforcement değildir.

### 11.2 Target config semantics

Tek boolean yerine versioned effective policy şu logical alanları çözmelidir:

- enabled session profiles;
- default profile by deployment/surface/principal role;
- raw shell enablement;
- break-glass approval/TTL/renewal policy;
- permitted execution targets/adapters;
- filesystem/network/process/secret profiles;
- tenant/project/session quota policies;
- sharing/reattach policy;
- auth assurance requirements;
- detector/telemetry mode;
- audit/retention/redaction/egress policy;
- outage/monitoring-loss behavior;
- observe/shadow/enforce rollout state.

Exact schema/key names implementation session'da existing config conventions ve migration compatibility
üzerinden kararlaştırılmalıdır; instruction metni ikinci config SSOT'si olmayacaktır.

### 11.3 Observe → shadow → enforce ratchet

Rollout akışı blocking authority'yi regex'e değil canonical session policy'ye taşır:

1. **Inventory:** mevcut create/list/attach/input/kill ve profile usage ölçülür; raw command kaydedilmez.
2. **Observe:** target authorization kararları decision-only üretilir; legacy behavior değişmez; identity/tenant
   unknown oranı görünür olur.
3. **Shadow:** allow/deny/HOLD drift'i, would-block ve cross-tenant probes ölçülür; legacy path authority sayılmaz.
4. **Enforce cohort:** explicit owner/tenant/platform cohorts canonical authority'ye cut over edilir.
5. **Default enforce:** managed profile default, unknown identity/kind/target fail-closed olur.
6. **Legacy retire:** `allowShellKind` compatibility ve blocking guard claim'i no-caller proof sonrası kaldırılır.

Enforce rollout “akışı engellememe” adına authorization failure'ı allow'a çeviremez. Beklenmeyen outage veya
unsupported environment typed HOLD/disabled capability üretir; kullanıcıya dürüst recovery path gösterir.

## 12. ApprovalBroker integration

ApprovalBroker yalnız raw command text'ine onay vermemelidir. Approval subject immutable proposal olmalıdır:

- principal/tenant/project;
- session profile;
- execution target;
- filesystem/network/process/secret exposure;
- executable/artifact identity;
- TTL/idle/renewal;
- share principals;
- policy revision ve capability digest;
- expected high-risk consequences;
- revoke/termination conditions.

Approval exact proposal digest'ine bağlı olmalı; target, scope, profile, secrets veya TTL değişirse yeni decision
gerekmelidir. “Bu session için her şeye evet” persistent global cache olmamalıdır.

Break-glass session içindeki arbitrary bytes tek tek approve edilemeyeceği için initial grant containment'ı
tanımlar. Managed/developer profile içindeki structured protected operations ayrıca per-operation ApprovalBroker
decision'ına gidebilir.

## 13. Audit, receipt ve operator trust

### 13.1 Kaydedilecek facts

Structured audit/receipt en az şunları ayırmalıdır:

- actor VerifiedPrincipal ve auth assurance;
- target tenant/project/session/owner;
- requested/resolved profile;
- operation ve policy decision;
- approval request/decision/expiry/revoke;
- execution adapter/target/artifact identity;
- session generation/fence;
- create/attach/share/detach/revoke/terminate/exit;
- resource quota/suspension/kill;
- effect/settlement references;
- detector signals ve coverage state;
- denial/HOLD reason.

### 13.2 Kaydedilmeyecek content

Raw PTY keystroke, command stream ve raw output default audit trail'e yazılmamalıdır. Bunlar password, token,
PII, source ve customer data taşıyabilir. Existing structured-audit-only invariant korunmalıdır.

Forensics için content capture ayrı, explicit, tenant-policy/retention/legal basis/encryption/consent authority
gerektirir; default terminal audit ile sessizce birleşemez.

### 13.3 Misattribution önleme

Audit event'te:

- actor tenant;
- target tenant;
- session owner;
- attached principal;
- decision authority;
- execution target

ayrı fields olmalıdır. Bugünkü `tenantOf()` gibi target tenant'ı actor tenant yerine kullanmak forbidden'dır.

## 14. Failure ve recovery semantics

| Failure | Enforce davranışı |
|---|---|
| Authentication unavailable/invalid | Deny/HOLD; bridge ve replay açılmaz |
| Principal claims unresolved | No synthetic admin/local fallback; typed HOLD |
| Authorization store unavailable | New mutation/input/attach deny/HOLD; policy'ye göre existing session suspend |
| Approval store unavailable | Break-glass create/renew deny/HOLD |
| Execution adapter unsupported | Honest unsupported; local host fallback yok |
| Sandbox setup partial failure | Spawn gerçekleşmez; partial resource cleanup + receipt |
| Audit sink unavailable | Policy risk class'ına göre deny/HOLD/suspend; silent unaudited break-glass yok |
| Revocation received | Bounded latency'de input kesilir, process tree suspend/kill ve settlement olur |
| Daemon restart | Stale grants/generations invalid; orphan targets reconcile edilir |
| WS reconnect | Fresh auth + attach authorization + generation check |
| Quota exceeded | Principal/tenant/session-targeted action; başka tenant session'ı kill edilmez |
| Monitoring loss | Risk/profile policy'ye göre authority suspension; agent-visible monitor tek boundary değildir |

## 15. Multi-tenant ve million-scale model

### 15.1 Isolation

- registry keys tenant/project/session/generation-aware olmalı;
- list/discovery query storage seviyesinde scoped olmalı;
- session ID global UUID olsa da authorization zorunlu kalmalı;
- quotas tenant + principal + project + target + profile düzeyinde uygulanmalı;
- event fan-out tenant authorization'dan geçmeli;
- share grants exact principals/groups ve expiry taşımalı;
- tenant freeze/revoke active sessions'e bounded-latency fan-out yapmalı;
- remote backend credentials tenant-bound lease olmalı;
- noisy tenant başka tenant'ın auth/audit/session capacity'sini tüketmemeli.

### 15.2 Concurrency ve race safety

- concurrent attach/share/revoke CAS/fence ile sıralanmalı;
- revoke ile input race'inde revoked generation effect üretememeli;
- create retry idempotency key'i duplicate process spawn etmemeli;
- kill/exit/reaper/quota/revoke exactly-once terminal settlement üretmeli;
- reconnect eski listener'ı aktif bırakmamalı;
- list snapshot stale grant'i active authority gibi göstermemeli;
- policy revision değişimi active leases için explicit grandfather/suspend rule taşımalı.

### 15.3 Backpressure ve quotas

Mevcut outbound byte limiter session content confidentiality sağlamaz; yine de bounded resource primitive olarak
korunabilir. Target quotas:

- inbound frame/rate/size;
- outbound buffered bytes/rate/daily volume;
- process count/CPU/memory/open files;
- session count per principal/tenant/project/target/profile;
- attach client count;
- replay buffer size;
- audit queue/egress backpressure;
- remote target capacity.

Quota key yalnız `tenantId:'local'` fallback'ına dayanamaz; verified scope üzerinden çözülmelidir.

## 16. Every Environment proof matrix

| Environment | Required proof |
|---|---|
| Linux native | PTY, namespaces/container profile, process-tree kill, symlink/mount escape, env filtering |
| macOS native | PTY, sandbox/virtualization profile, keychain/agent isolation, process-tree settlement |
| Windows native | ConPTY/node-pty, Job Object/process tree, ACL/reparse/junction, PowerShell/cmd semantics |
| WSL | Windows host ↔ distro boundary, path translation, credential/socket exposure, process settlement |
| OCI/container | user/namespace/capabilities/seccomp/mount/network policy; Docker socket default-deny |
| Kubernetes | pod/namespace/service-account/exec target binding, RBAC, revoke and network policy |
| SSH remote | host-key/provenance, principal/account, command/session channel, disconnect/orphan recovery |
| Reverse proxy | forwarded peer trust config, origin/token delivery, no loopback authorization inheritance |
| Desktop | renderer/main/daemon principal and IPC/session binding; no generic local token privilege merge |

Unsupported adapter/facet, platform-generic fallback ile host-user raw shell'e düşemez.

## 17. Workstream/DAG handoff

Bu sıralama task ID değildir; implementation session canonical ledger state'ini okuyup Goal/Mission/Flow DAG'ına
dönüştürmelidir. Her foundation workstream exact consumer/cutover/retire closure'a dependency-bound olmalıdır.

### W1 — Fresh reachability ve contract inventory

- HTTP/WS/Desktop/dashboard/native terminal producers ve consumers;
- auth providers ve deployment profiles;
- session manager/backend callers;
- config resolution/defaults;
- reverse proxy/remote seams;
- guard/audit/tests/docs claims;
- current ledger/ADR truth drift;
- runtime session kind/profile usage evidence.

**Exit:** producer→consumer→ingress→policy→effect graph ve stale-iddaa register.

### W2 — Principal, operation ve decision contracts

- terminal AuthenticationAuthority adapter;
- VerifiedPrincipal integration;
- terminal operation catalog;
- allow/deny/HOLD reason taxonomy;
- session capability grant;
- principal/tenant/project/resource context;
- receipt schemas ve redaction.

**Closure dependency:** W4 ingress cutover olmadan W2 DONE değildir.

### W3 — Session registry, ownership ve fencing

- owner/share/tenant/project/generation metadata;
- scoped query/list;
- attach/replay/input/resize/detach/kill authorization API;
- revoke/expiry/freeze;
- idempotency/CAS/fence;
- restart/orphan reconciliation.

**Closure dependency:** HTTP ve WS production ingress negative IDOR proof'u.

### W4 — HTTP/WS/Desktop ingress cutover

- runtime `SessionKind` validation ve unknown fail-closed;
- boolean auth split'inin kaldırılması;
- create/list/attach/replay/input/resize/detach/kill operation mapping;
- no pre-auth/pre-authz byte/replay;
- caller/session tenant-owner checks;
- UI visible denial/HOLD/recovery semantics;
- all-surface parity.

**Exit:** legacy ID-only manager mutation public production ingress'ten ulaşılamaz.

### W5 — Managed/developer execution profiles

- Tool Gateway integration;
- provider-neutral ExecutionEnvironmentAdapter;
- filesystem/network/process/environment/secret profiles;
- AI/deckent executable/artifact provenance;
- quotas/process-tree settlement;
- protected mutation/effect/landing integration.

**Closure dependency:** real host-effect negative and positive proof.

### W6 — Break-glass raw shell

- explicit capability request;
- attended ApprovalBroker decision;
- exposure summary/digest;
- TTL/idle/no-auto-renew;
- share/revoke/freeze/monitoring behavior;
- high-visibility terminal UX;
- autonomous/default-deny policy;
- remote/enterprise policy controls.

**Exit:** raw shell generic token veya loopback nedeniyle açılamaz.

### W7 — Guard telemetry migration ve retire

- exact caller/consumer inventory;
- detector vocabulary/coverage contract;
- audit/UI/docs migration;
- fragmented-input corpus;
- no enforcement dependency proof;
- command/prompt guard blocking claim retire;
- legacy no-caller/no-duplicate proof.

**Closure dependency:** W4–W6 production closure.

### W8 — Audit, receipts, revocation ve recovery

- actor/target separation;
- no raw content invariant;
- durable session/decision/effect lineage;
- authz/audit outage semantics;
- revoke/freeze fan-out;
- daemon crash/orphan reconcile;
- SIEM/egress optional adapter boundary.

### W9 — Every Environment, scale ve adversarial assurance

- platform matrix;
- concurrency/race/IDOR corpus;
- reverse proxy/tunnel/Desktop paths;
- resource exhaustion/backpressure;
- fragmented/control-sequence/shell-grammar negatives;
- remote target compromise/failure;
- million-tenant/cardinality/retention;
- real-binary end-to-end evidence.

### W10 — Governance closure

- ledger evidence/dependencies/state update;
- accepted ADR truth drift için typed amendment/successor;
- public/internal docs enforcement claim correction;
- old config/API migration/removal;
- assurance-pack evidence index;
- fresh different-provider XVerify;
- unavailable verifier halinde typed HOLD.

## 18. Acceptance checklist

### 18.1 Runtime input ve kind validation

- [ ] HTTP body schema runtime'da exact allowed session kinds'i doğrular.
- [ ] Missing kind için default davranış explicit policy/profile'dan çözülür.
- [ ] Unknown string/object/array/null kind shell'e düşmez.
- [ ] Manager unknown kind için fallback yapmaz; fail-closed typed error üretir.
- [ ] `allowShellKind=false` alias/type confusion/encoding ile aşılamaz.
- [ ] Session metadata requested ve resolved profile/kind'i dürüstçe ayırır.
- [ ] AI tool allowlist type assertion değil runtime artifact/capability decision'dır.
- [ ] Deckent args arbitrary hidden operation authority oluşturmaz.

### 18.2 Authentication ve principal

- [ ] HTTP ve WS aynı AuthenticationAuthority sonucunu kullanır.
- [ ] Auth success VerifiedPrincipal + assurance + expiry taşır.
- [ ] Unverified JWT/header claims authorization'a ulaşmaz.
- [ ] Opaque local token explicit local-owner/device/session binding üretir.
- [ ] Missing/unknown role enforce profile'da allow-all değildir.
- [ ] mTLS, JWKS ve local auth actor/tenant semantics'i parity taşır.
- [ ] Credential expiry/revoke active socket/session policy'sine ulaşır.
- [ ] Reverse proxy peer trust explicit deployment config ve evidence'a bağlıdır.

### 18.3 Tenant, owner ve IDOR

- [ ] Session owner principal ve tenant/project immutable metadata'da bulunur.
- [ ] GET/list yalnız authorized sessions döndürür.
- [ ] Unauthorized session existence response/latency/audit ile gereksiz sızmaz.
- [ ] Attach öncesi owner/share/tenant/project/generation authorize edilir.
- [ ] Replay byte'ı authorization tamamlanmadan gönderilmez.
- [ ] Input/resize/detach/kill exact operation authorization'dan geçer.
- [ ] Cross-tenant valid credential negative corpus'u bütün operations'i kapsar.
- [ ] Cross-owner same-tenant negative corpus'u vardır.
- [ ] Share grant exact principal/group/TTL/scope taşır.
- [ ] Revoked share/socket sonraki input/output alamaz.
- [ ] Audit actor tenant ile target tenant'ı ayrı kaydeder.

### 18.4 Profiles ve approval

- [ ] Managed profile default product yüzeyidir.
- [ ] Developer profile explicit project/workspace capability taşır.
- [ ] Raw shell yalnız break-glass capability ile açılır.
- [ ] Break-glass initial grant attended ApprovalBroker decision'ına bağlıdır.
- [ ] Approval exact profile/target/scope/secrets/network/TTL digest'ine bağlıdır.
- [ ] Proposal drift yeni approval gerektirir.
- [ ] No global “always allow raw shell” hidden cache vardır.
- [ ] Break-glass TTL kısa, no-auto-renew ve revocable'dır.
- [ ] Autonomous/unattended callers raw shell'e default-deny'dır.
- [ ] Terminal UI current profile, target, tenant/project/account ve expiry'yi görünür kılar.

### 18.5 Execution containment

- [ ] `process.env` blanket inheritance yoktur.
- [ ] Secret injection explicit profile/lease/handle ile yapılır.
- [ ] Filesystem read/write policy platform adapter tarafından enforce edilir.
- [ ] Symlink/reparse/junction/mount escape negatif proof'u vardır.
- [ ] Network/localhost/socket access policy-controlled'dür.
- [ ] Docker socket, SSH agent ve daemon IPC default grant değildir.
- [ ] Child processes aynı effective containment'ı miras alır.
- [ ] Session terminate/revoke grant process tree'sini settle eder.
- [ ] Unsupported platform facet host-user fallback üretmez.
- [ ] AI/deckent/raw-shell execution aynı canonical adapter contractını kullanır.
- [ ] Requested scope ile observed/landed effects causal receipts ile bağlanır.

### 18.6 Guard disposition

- [ ] Fragmented keyboard input exact dangerous command'i detector'dan kaçırsa da containment korunur.
- [ ] Regex match yokluğu authorization receipt değildir.
- [ ] Prompt/command detector output yalnız typed risk signal'dır.
- [ ] Detector raw input/secrets audit'e yazmaz.
- [ ] Detector unavailable session capability'yi genişletmez.
- [ ] Blocking guard dependency production graph'tan kaldırılmıştır.
- [ ] Misleading `default-deny`/“execution constrained” docs claim'i düzeltilmiştir.
- [ ] Legacy guard code replacement closure sonrası no-caller proof ile retire edilir veya açıkça telemetry adıyla kalır.

### 18.7 Audit, recovery ve scale

- [ ] Create/attach/share/input-authority/revoke/kill/exit structured receipts üretir.
- [ ] Raw PTY keystroke/output default audit'te tutulmaz.
- [ ] Authz/audit/approval outage fail-open değildir.
- [ ] Reconnect fresh auth + attach authz + generation check yapar.
- [ ] Daemon restart stale grants'i active saymaz.
- [ ] Concurrent attach/revoke/input race fenced'dir.
- [ ] Duplicate create retry ikinci process spawn etmez.
- [ ] Quotas principal/tenant/project/target/profile scope'ludur.
- [ ] Noisy tenant isolation ve backpressure proof'u vardır.
- [ ] Revocation/freeze bounded latency'de active sessions'e ulaşır.
- [ ] Linux/macOS/Windows native/WSL/OCI/remote declared matrix real evidence taşır.
- [ ] Fresh different-provider XVerify vardır veya closure typed HOLD kalır.

## 19. Adversarial proof catalog

Implementation assurance en az şu negatives'i real production call graph üzerinde taşımalıdır:

1. `kind:'other'`, object, array, whitespace/case variant ve malformed body shell spawn etmez;
2. `allowShellKind=false` bütün unknown-kind inputs'ta fail-closed kalır;
3. valid tenant-A principal tenant-B session listesinde metadata görmez;
4. tenant-A principal known tenant-B session ID ile replay/attach/input/resize/kill yapamaz;
5. same-tenant non-owner explicit share olmadan attach olamaz;
6. revoked share mevcut socket'te input/output'u keser;
7. stale generation reconnect attach olamaz;
8. reverse proxy üzerinden loopback bind caller otomatik owner olmaz;
9. SSH tunnel/local malicious process valid principal/capability olmadan session açamaz;
10. `rm -rf /` karakter karakter/paste/control-sequence ile gönderildiğinde regex kaçsa bile sandbox scope dışı
    effect oluşmaz;
11. alias, variable, command substitution, sourced script ve alternate shell containment'ı aşmaz;
12. AI provider indirect injection ile Tool Gateway dışı effect üretemez;
13. child daemon/process session revoke sonrası yaşamaz;
14. environment dump undeclared secrets'i göstermez;
15. Docker/SSH/cloud credential sockets explicit grant olmadan erişilemez;
16. auth/authorization/audit/approval outage raw shell'i açmaz;
17. duplicate create retry tek live process/session üretir;
18. quota action başka tenant session'ını yanlış kill etmez;
19. audit actor/target attribution saldırganı kurban tenant gibi göstermez;
20. unsupported platform adapter local raw shell fallback yapmaz.

## 20. Non-goals ve yanlış `COMPLETE` iddiaları

### 20.1 Non-goals

- Raw shell'in bütün command semantiğini Deckent gateway'de parse etmek.
- Local-solo kullanıcıyı enterprise SSO'ya zorlamak.
- Full-control product experience'i yalnız read-only dashboarda indirgemek.
- Break-glass'i tamamen yok saymak; gerektiğinde açık ve kontrollü sunmak.
- Raw terminal content'i varsayılan olarak kaydetmek.
- Her platformda aynı sandbox implementation'ını zorlamak; aynı contract/fail semantics'i adapter'larla sağlamak.
- Mevcut değerli auth/resource/audit primitives'ini sırf eksik diye silmek.
- Modelin “command safe” verdict'ini authorization evidence saymak.

### 20.2 Aşağıdakiler `COMPLETE` değildir

- Yalnız server bind host'u manager'a geçirmek.
- Loopback muafiyetini kaldırmak.
- Denylist'e yeni regex'ler eklemek.
- Input'u newline'a kadar buffer etmek.
- Unknown-kind validation ekleyip owner/tenant IDOR'u bırakmak.
- `allowShellKind` default'unu false yapıp `ai`/`deckent` ambient authority'yi bırakmak.
- AuthProvider boolean verify'ı koruyup caller claims'ini ayrı decode etmek.
- SessionMeta'ya yalnız tenant ekleyip principal owner/share grant eklememek.
- GET list'i filtreleyip WS attach/replay/input'u ID-only bırakmak.
- Attach'te bir kez authorize edip revoke/expiry/generation race'ini yok saymak.
- Valid token'ı bütün terminal operations için blanket capability saymak.
- Raw shell'i “localhost trusted” gerekçesiyle approval/containment dışında bırakmak.
- AI executable allowlist'i provider-neutral tool containment saymak.
- `process.env` blanket inheritance'ı korumak.
- Parent PTY'yi kill edip child process tree/remote target'ı orphan bırakmak.
- Audit event'e hedef tenant'ı actor tenant gibi yazmak.
- Only unit tests ile reverse proxy/multi-tenant/every-environment claim yapmak.
- Managed profile foundation'ı üretip production ingress cutover'u ertelemek.
- Replacement caller closure olmadan guard code'yu silmek.
- Same-provider self-verify ile assurance settlement vermek.

## 21. ADR ve documentation truth reconciliation

`docs/adr/adr-g-029-embedded-web-terminal.md` command/prompt guard'ı delivered security guard ve RCE modelinin
parçası olarak tanımlar (`docs/adr/adr-g-029-embedded-web-terminal.md:19-37`, `:115-119`). Aynı ADR dashboardu
secondary/remote PTY surface olarak çerçeveler ve sub-project #3 multi-tenant/remote isolation'ı geleceğe bırakır
(`:7`, `:85-92`, `:107-111`). Current code'da bazı eski ADR gap'leri sonradan wired olmuş olsa da command
authority ve tenant isolation iddiaları code-truth ile uyumlu değildir.

Implementation session:

1. accepted/immutable ADR'yi sessiz in-place history rewrite yapmamalı;
2. mevcut ADR governance contract'ına göre amendment veya successor üretmeli;
3. bypass-independent terminal authentication ve no-raw-output invariants'ini korumalı;
4. command/prompt guard enforcement claim'ini corrected disposition ile değiştirmeli;
5. managed/developer/break-glass ve SessionAuthorizationAuthority modelini canonical karara bağlamalı;
6. English/Turkish terminal reference docs parity'sini düzeltmeli;
7. docs claim'lerini production reachability/evidence'a bağlamalıdır.

## 22. MASTER-PLAN eşleme

| Ledger | Rol | Bu kararın etkisi |
|---|---|---|
| `SEC-OWASP-ASI-001` (4190) | Assurance parent | ASI02/03/05/08/09/10 terminal gap ve closure evidence |
| `SEC-ENFORCE-WIRE-001` (4200) | Disposition owner | “loopback-inert” notunu corrected PARTIAL verdict'e; guard'ı retire/telemetry disposition'a taşır |
| `PRINCIPAL-001` (4010) | Identity owner | HTTP/WS/local/OIDC/mTLS VerifiedPrincipal |
| `TENANT-001` (4020) | Scope owner | Session list/attach/replay/input/kill IDOR closure |
| `OPERATION-001` (4030) | Operation owner | Versioned terminal lifecycle and break-glass operations |
| `CAPABILITY-001` (4040) | Grant owner | Session profile, resource, target, TTL ve share capability |
| `APPROVAL-001` (4050) | Approval owner | Durable attended break-glass ve protected operation decisions |
| `TOOL-AUTHORITY-001` (4060) | Managed execution owner | Progressive disclosure ve Tool Gateway |
| `API-SECURITY-001` (4130) | HTTP security owner | Terminal HTTP auth/principal/IDOR closure |
| `TRUST-HANDOFF-001` (4180) | Host-effect owner | PTY/provider output'tan sandboxed effect/settlement trust transfer |
| `TERMINAL-001` (5000) | Product parent | Canonical terminal full-control + low cognitive load under authority |
| `TERMINAL-TOOLS-001` (5010) | Managed surface owner | Structured default tool/operation experience |
| `TERMINAL-XPLAT-001` (5090) | Platform proof owner | POSIX/Windows/WSL/remote adapter evidence |
| `TERMINAL-CONTEXT-001` (5100) | Session context owner | Principal/tenant/project/account/target/owner binding and reattach |

Mevcut ledger authority dependencies'i taşır; fakat bu closure birden fazla parent'a dağıldığı için exact
terminal session/execution authority outcome child'ı açılması gerekebilir. Bu belge ID uydurmaz. Implementation
session güncel ledger schema/order/dependency graph'ını okuyup yeni exact child gerekip gerekmediğini owner'a
sunmalıdır.

Bu belge `docs/MASTER-PLAN.md` üzerinde mutation yapmaz.

## 23. Başka session'a doğrudan iş-planı girdisi

1. Bu belgeyi ve header'daki üç hard dependency audit belgesini tamamen oku.
2. `DIRECTIVES.md`, ilgili role rules, current live-run state ve canonical ledger satırlarını fresh doğrula.
3. W1 reachability inventory'sini mevcut production graph üzerinden yeniden çıkar; bu belgedeki line numbers ve
   absence iddialarını stale olabilecek evidence olarak doğrula.
4. Exact terminal authority child ledger satırı gerekiyorsa outcome/acceptance/dependencies ile Alperen onayına
   sun; ID/order'ı canonical ledger kurallarıyla çöz.
5. W2–W10'u dependency-bound Goal/Mission/Flow/Run DAG'ına dönüştür; hiçbir foundation task'ını production
   ingress/effect/retire closure'dan orphan bırakma.
6. Effective config, identity/auth method, provider/model, execution adapter, worker/concurrency, finite budget
   ve admission'ı runtime config/registry/policy'den çöz.
7. Implementation'ı Deckent'in dogfood Goal/Mission/Flow/Run/Autonomous/Do yüzeyleriyle yürüt; manual seam yalnız
   typed bootstrap/recovery evidence olsun ve ilk güvenli sınırda dogfood'a dön.
8. İlk security closure runtime enum fail-closed + principal/session authorization graph'ını birlikte kapsasın;
   yalnız regex veya boolean default değişimi bağımsız DONE olmasın.
9. Managed/developer/break-glass profiles execution containment ile atomik tasarlansın; raw shell UX kararı host
   effect authority'den ayrılmasın.
10. HTTP/WS/Desktop/dashboard/native surfaces aynı application service/operation authority'yi kullansın; wrapper
    local policy taşınmasın.
11. Observe→shadow→enforce rollout metrics/receipts/redaction ile ilerlesin; enforcement outage silent allow
    üretmesin.
12. Guard retire ancak replacement production closure, docs/tests migration ve no-caller proof sonrası yapılsın.
13. Her slice için producer→consumer→entrypoint→policy/config→effect→settlement evidence üretilsin.
14. Cross-tenant IDOR, fragmented input, reverse proxy, revoked reconnect, env/socket escape ve process-tree
    adversarial corpus'u real call graph üzerinde çalışsın.
15. Every Environment declared adapters real-binary proof taşısın; unsupported state typed ve honest olsun.
16. Final assurance farklı fresh provider ile XVerify edilsin; unavailable ise typed HOLD bırakılsın.

## 24. Definition of Done

Bu çalışma ancak aşağıdakilerin tamamıyla DONE'dır:

- terminal authentication atomik VerifiedPrincipal üretir;
- raw/unverified claims authorization'a ulaşmaz;
- listener bind/transport peer/principal/session owner/execution target ayrı facts'tir;
- unknown/malformed session kind fail-closed'dur ve shell fallback yoktur;
- session create/discover/attach/replay/input/resize/detach/terminate/share/revoke canonical operations'tır;
- bütün HTTP/WS/Desktop/native ingress'ler aynı SessionAuthorizationAuthority'yi tüketir;
- session registry owner/tenant/project/grant/generation/fence taşır;
- cross-tenant ve cross-owner IDOR bütün lifecycle operations'ta kapanmıştır;
- reconnect, expiry, revoke, share ve tenant freeze race-safe/fenced'dir;
- managed terminal default ve Tool Gateway/Approval/Effect authority'lerine production-wired'dır;
- developer profile scoped, secret-filtered ve platform-contained'dır;
- raw shell yalnız explicit attended time-bounded break-glass capability'dir;
- loopback, valid token veya executable allowlist blanket execution grant değildir;
- `shell`, `ai` ve `deckent` paths provider-neutral ExecutionEnvironmentAdapter'a bağlıdır;
- `process.env` blanket inheritance ve undeclared privileged sockets kaldırılmıştır;
- process tree/remote target revoke/terminate/settlement closure taşır;
- command/prompt regex'leri enforcement authority değildir; optional bounded telemetry veya retired'dır;
- no-old-authority/no-duplicate production reachability evidence vardır;
- structured audit actor/target/grant/decision/effect lineage taşır ve raw PTY content saklamaz;
- authorization/audit/approval/adapter outage fail-open değildir;
- Every Environment, reverse proxy, concurrency, scale, crash, revocation ve adversarial proof'lar artifact-bound'dır;
- ADR/reference/config truth production code ile reconcile edilmiştir;
- ledger evidence/dependencies/state canonical olarak güncellenmiştir;
- independent different-provider verdict vardır veya typed HOLD açık kalır.
