# Platform, isolation ve security

## Product-user perspektifi

Deckent application control'lerini birleştirir; tek bir repository-local control unbypassable administrative boundary olarak sunulmaz. Platform adapter ve deployment policy'yi gerçek trust boundary'ye göre seç: local solo project, shared workstation, CI, container host veya multi-tenant service. [Kanıt: `AGENTS.md`, precedence/enforcement notu; Immutable Law 2]

### Authentication ve transport

- API auth explicit/config/environment token çözer, static token'ları constant time karşılaştırır, configured OIDC JWT verification destekler ve yalnız declared path'leri exempt eder. Query token yalnız SSE gibi explicitly eligible GET/HEAD path'leriyle sınırlıdır. [Kanıt: `src/api/auth.ts:8-54,85-165,195-275`]
- Health exempt'tir; OIDC exchange login bearer olmadan başladığı için ayrı flag-gated exemption taşır. Diğer `/api/*` route'ları dispatch öncesi bearer middleware'den geçer. [Kanıt: `src/api/server.ts:798-831,2196-2205`]
- Terminal session bağımsız token/auth provider kullanır. Desktop token bootstrap loopback-only'dir ve kendisi valid API bearer ister; generic API auth'u kapatmak terminal authority vermez. [Kanıt: `src/api/server.ts:2558-2633`]
- CORS allowed loopback origin'leri ve packaged renderer'ın `Origin: null` değerini reflect eder; disallowed preflight reject edilir. [Kanıt: `src/api/server.ts:292-325,774-797`]

### Tenant isolation ve RBAC

Tenant ID path-safe olmalı ve `<project>/.deckent/tenants/<tenantId>` altına resolve edilmelidir. `AsyncLocalStorage` context tenant identity'yi async iş boyunca taşır. [Kanıt: `src/core/tenant-context.ts:6-30,37-95`]

Role'ler `admin`, `operator` ve `viewer`dır. Permission check valid role, valid tenant ID, enabled policy ve permission-matrix membership ister; permission-string helper explicit wildcard biçimlerini de destekler. [Kanıt: `src/core/rbac.ts:11-63,74-143`]

Enterprise tenant/RBAC/rate write'ları admin-gated ve audit-logged'dur. Mission/flow read'leri tenant'ı verified request principal'dan türetir ve cross-tenant existence leak önlemek için not-found davranışı kullanır. [Kanıt: `src/api/enterprise-endpoint.ts:540-930`; `src/api/missions-route.ts:32-79`; `src/api/run-flow-routes.ts:43-59`]

### Scope, path ve lock control'leri

- Task scope readable/writable path'leri ayırır; disk verification actual Git change'leri authored scope ile karşılaştırır. [Kanıt: `src/core/task-types.ts:283-288`; `src/orchestra/disk-verify.ts:80-255`]
- Tool execution real path resolve eder, resolution failure (E075) ile out-of-scope resolution'ı (E005) ayırır ve dispatch öncesi scope gate uygular. [Kanıt: `src/core/errors.ts:597-620`; `src/core/tool-scope-gate.ts`; `src/core/tool-dispatch.ts:115`]
- Tenant ID, flow ID, worker log ID ve static-file path'lerinde dedicated traversal/segment guard vardır. [Kanıt: `src/core/tenant-context.ts:15-30`; `src/api/run-flow-routes.ts:92-99`; `src/api/server.ts:1100-1125`]
- File/spawn lock, claim fence, registry digest ve recovery receipt iki attempt'ın aynı işi sessizce sahiplenmesini önler. [Kanıt: `src/core/file-lock.ts`; `src/orchestra/autonomous/mission-store/mission-types.ts:129-187`]

### Provider, secrets ve container'lar

Provider seçimi effective config, registry, auth/account, reachability ve limit evidence ile çözülür. Docker preflight absent CLI, unavailable daemon, permission denial, missing image/tool, ownership conflict ve unavailable authority'yi tek failure'a indirmek yerine ayırır. [Kanıt: `src/core/model-registry.ts:568-800`; `src/orchestra/spawn-backend-docker.ts:2447-2461`]

API ve terminal token'ları `.deckent/runtime/` altında, desteklenen yerde owner-only hardening ile saklanır; log raw token yerine path/fingerprint yazar. Windows ACL inability sessizce hardened sayılmaz, raporlanır. [Kanıt: `src/api/server.ts:1899-1995,2079-2150,2438-2460`]

Plugin code hook load öncesi containment, sandbox issue, signature ve publisher authenticity açısından validate edilir. [Kanıt: `src/core/plugin-loader.ts:34-103,105-315,325-460`]

### Rate ve resource control'leri

HTTP server per-IP sliding window kullanır; default maksimum 100 request/minute ve aksi yapılandırılmadıkça loopback exempt'tir. Core tenant limiter ayrıca tenant başına concurrent action izler. Terminal outbound byte ile session count/idle/scrollback ayrı terminal config alanlarıyla bound edilir. [Kanıt: `src/api/server.ts:152-205,1841-1860,2013-2063`; `src/core/rate-limiter.ts:26-91`; `src/core/config.ts:1723`]

## Platform matrix

| Platform | Supported adapter biçimi | Dürüst kısıt |
|---|---|---|
| Linux | Docker, tmux, subprocess; native filesystem/process control | Runtime proof installed backend/provider prerequisite'lerine bağlıdır. |
| macOS | Docker, tmux, subprocess; platform-aware path | Aynı; doctor local tool'ları doğrulamalıdır. |
| Windows native | Subprocess/platform adapter ve Windows-specific ACL handling | POSIX-only varsayım dürüst fail etmeli; terminal/native dependency desteği probe edilmelidir. |
| WSL | Windows-host boundary ile Linux-style runtime | Path, Docker integration ve credential environment-aware çözülmelidir. |
| CI/container/air-gapped | Canonical execution environment modelinde declared | Provider/network capability admit edilmelidir; unsupported capability sessiz fallback yapamaz. |

[Kanıt: `src/core/work-model.ts:30-52`; `.deckent/workspace/IDENTITY.md:15`; `src/api/server.ts:1914-1995`]

## Dogfood / repository gerçeği

- ✅ Auth, OIDC, CORS, tenant, RBAC, rate, scope, lock, plugin ve Docker authority module'ları vardır ve named surface'lere wired'dır.
- ⚠️ Repository hook/execpolicy ile advisory scope check defense-in-depth'dir, managed enterprise enforcement değildir. Repository dışı administrative boundary için managed requirements gerekir. [Kanıt: `AGENTS.md`, precedence/enforcement notu]
- ⚠️ `boundary_enforcement` default true'dur; project contract yine advisory/enforce davranışını effective-policy dependent anlatır. [Kanıt: `src/core/config.ts:1647-1655`; `AGENTS.md`, scope-enforcement gotcha]
- ⚠️ Bu documentation audit container başlatmadı, port açmadı, auth mutate etmedi veya multi-tenant HTTP request çalıştırmadı; environment proof'ları `HOLD` kalır. [Kanıt: task boundary]
