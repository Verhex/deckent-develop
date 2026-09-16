# Terminal, event ve worker-wrapper contract'ları

## Product-user perspektifi

Deckent'in ilişkili fakat ayrı üç terminal surface'i vardır: native CLI/Ink REPL, HTTP/WebSocket üzerinden embedded web terminal ve bu server contract'ın Desktop client'ı. Product language ve execution authority'yi paylaşırlar; process veya authentication state'i varsayımla paylaşmazlar. [Kanıt: `.deckent/workspace/IDENTITY.md:8-9,16`; `src/cli/repl/app.tsx`; `src/api/terminal/session-manager.ts`; `src/desktop/src/shared/desktop-api.ts`]

### Native REPL interaction contract

Native REPL; line editing, history, queued turn, slash/tool dispatch, approval card, run-flow inbox, live footer ve provider/session control'ü ayrı module'lerle sahiplenir. Tool execution permission classifier ve registered bridge'den geçer; tool adını render etmek execute authority değildir. [Kanıt: `src/cli/repl/line-edit.ts`; `src/cli/repl/input-history.ts`; `src/cli/repl/input-queue.ts`; `src/cli/repl/tool-permissions.ts`; `src/cli/repl/native-tool-registry.ts`]

Input behavior cursor movement, Home/End, deletion, Ctrl binding, history, single-line paste ve width-aware footer rendering için pure seam'lere sahiptir. Bracketed multi-line paste, raw-mode negotiation, terminal-specific escape byte'ları ve Ink'in real resize behavior'ı hâlâ PTY/terminal smoke ister; pure test bunları certify edemez. [Kanıt: `tests/cli/repl/term-compat-matrix.test.ts:1-39,58-224`; `src/cli/repl/input-bar.tsx`; `scripts/repl-smoke-verify.mjs`]

Color'ı kapatmak için `--no-color` veya `NO_COLOR` kullanılır; `FORCE_COLOR` daha yüksek precedence taşır. Truecolor/256-color yalnız explicit force veya dark background güvenle tespit edildiğinde seçilir; diğer durumda output ANSI16'ya degrade olur. Palette feature-local escape code yerine success, error, warning, info, muted ve accent gibi semantic role map eder. [Kanıt: `src/cli/helpers/theme.ts:1-109,119-163`; `src/cli/helpers/generated/palette.ts`]

### Plain risk language

Command discovery dört canonical plain-language class kullanır: `Oku` (read-only), `Değiştir` (local-state modification), `Çalıştır` (execution/process veya daha güçlü confirmation) ve `Otonom` (continuous-loop control). `Otonom`, her `Çalıştır` action'dan linearly daha tehlikeli olduğu iddiası değil, ayrı bir control mode'dur. Registry her cross-surface command'a bir class bağlar; native chat ve term-mode bu metadata'yı confirmation veya mode gate için kullanır. [Kanıt: `src/cli/command-registry.ts:34-38,55-73`; `src/cli/commands/chat-native.ts:666-676`; `src/cli/repl/term-mode.ts:25-38,94-126`]

Deckent; approval risk, Nervous risk, tool risk/trust ve REPL permission gibi domain-specific internal vocabulary'leri korur ve bunlardan `CommandRisk`'e pure, display-only mapping tanımlar. Localized EN/TR label ve description message catalog'da vardır. Renderer'ın kendisinin bugün production importer'ı yoktur; dolayısıyla complete localized ladder henüz live discovery surface değildir. [Kanıt: `src/cli/helpers/risk-language.ts:1-20,31-59,62-173`; `src/cli/helpers/messages.ts:4783-4806`; source import scan, 2026-08-01]

`cleanup` ve `recover` unresolved cross-layer mismatch taşır: command-registry class'ı `Değiştir`, bypass edilemeyen every-call confirmation tier'ının map'i ise `Çalıştır`dır. Test'ler product-authority cevabı seçmek yerine bu farkı explicit olarak korur. Bu nedenle client yalnız registry label'ından approval policy türetmemelidir; gerekli owner kararı OQ-27'dedir. [Kanıt: `src/cli/command-registry.ts:204-207`; `src/cli/repl/tool-permissions.ts:15-35`; `src/cli/helpers/risk-language.ts:65-78`; `tests/cli/risk-language.test.ts:70-92`]

### Embedded terminal security

Terminal session create/list/terminate ile WebSocket gateway, terminal-specific type, session manager, backend ve authentication kullanır. Command/prompt guard session'ın execute edebileceğini sınırlar; outbound limit unbounded client'ın resource authority olmasını engeller. [Kanıt: `src/api/terminal/types.ts`; `src/api/terminal/session-manager.ts`; `src/api/terminal/session-backend.ts`; `src/api/terminal/command-guard.ts`; `src/api/terminal/prompt-guard.ts`; `src/api/terminal/outbound-limiter.ts`]

Bootstrap token endpoint loopback-only'dir ve valid API bearer context ister. WebSocket token terminal auth path'inde validate edilir; generic API-auth bypass yeterli sayılmaz. Terminal audit module'leri action ve integrity evidence'ı ayrı kaydeder. [Kanıt: `src/api/server.ts:2567-2708`; `src/api/terminal/ws-gateway.ts`; `src/api/terminal/auth-provider.ts`; `src/api/terminal/audit.ts`; `src/api/terminal/audit-integrity.ts`]

### Event envelope

Persisted event protocol version `1.0`'dır:

| Alan | Anlam |
|---|---|
| `timestamp` | ISO event time. |
| `sequence` | Run başına monotonic sequence. |
| `protocol_version` | Literal `1.0`. |
| `source`, `target` | Brain, Worker, Auditor, Deckent, user, broadcast veya extension identity. |
| `channel` | Stable channel code. |
| `payload` | Channel-specific structured data. |
| `correlationId`, `causationId` | Optional execution-request lineage. |

[Kanıt: `src/core/event-stream.ts:22-54,67-80`]

Event'ler `.deckent/<run>-events.jsonl`'a append edilir ve ayrı sequence file kullanır. Legacy heartbeat/result artifact'ları compatibility için birlikte yaşar. Run read'leri source, target, channel ve minimum sequence filtreleyebilir; in-process event bus sprint/channel subscription ekler fakat durable log'un yerini almaz. [Kanıt: `src/core/event-stream.ts:1-20,197-215,322-430`; `src/orchestra/event-bus.ts:27-126`]

### Channel family'leri

| Family | Canonical örnekler | Intended consumer |
|---|---|---|
| Brain↔Worker | `TASK_ASSIGN`, `HEARTBEAT`, `RESULT`, `QUESTION`, `ANSWER` | Task coordination ve liveness. |
| Worker/Auditor→Brain | `CODE_VERIFY_REQUEST`, `VERIFICATION_RESULT`, `SCOPE_COLLISION_DETECTED`, `ADR_VIOLATION`, `GATE_COMPUTED` | Independent verification ve gating. |
| Broadcast/progress | `ACTIVITY`, `METRIC_EMITTED`, `SPRINT_PHASE_CHANGE`, `PROGRESS` | CLI watch, MCP watch, terminal/Desktop projection'ları. |
| Recovery | terminalization started/reused/authorized/settled/completed/held | Ordinary phase replay uydurmayan recovery-only sequence. |
| User approval | `NOTIFY`, `NERVOUS_NOTIFICATION`, `NERVOUS_APPROVAL_CONSUMED` | Cross-surface request ve consumption acknowledgement. |
| Safety/failure | authority violation, timeout, never-dispatched, spawn-blocked, dependency-blocked, auth-failed, path-sanitized | Typed diagnosis ve policy response. |

[Kanıt: `src/core/event-stream.ts:83-193`]

Event stream evidence'dır, sole state authority değildir. Consumer onu canonical store, task/result artifact ve terminal receipt ile reconcile eder; missing event delivery failed veya held attempt'ı success'e çevirmemelidir. [Kanıt: `src/core/run-status-authority.ts`; `src/core/task-settlement-authority.ts`; `src/core/sprint-terminal-publication.ts`]

### Worker wrapper behavior

Worker launcher'ları şu cross-backend invariant'ları korumalıdır:

1. Sonraki shell step exit status'u overwrite etmeden provider/worker exit status'u capture eder. [Kanıt: `src/orchestra/spawn-backend-docker.ts:5570-5597`; `src/orchestra/tmux.ts:250-264`]
2. Timeout marker timeout-pure olmalıdır: yalnız 124/137 gibi TERM-timeout/KILL outcome qualify eder ve mevcut result overwrite edilmez. [Kanıt: `src/orchestra/spawn-backend-docker.ts:5585-5597`; `src/orchestra/tmux.ts:261-263`]
3. Controlled SIGTERM exit 143'e çevrilir ve provider observation outcome korunur. [Kanıt: `src/orchestra/spawn-backend-docker.ts:5570-5597`; `src/agents/worker.ts:465-505`]
4. Heartbeat host liveness check için yeterince durable/atomic tutulur; stale/missing heartbeat process/backend evidence ile yorumlanır. [Kanıt: `src/agents/worker-lifecycle.ts:1-112`; `src/core/worker-heartbeat-authority.ts`; `src/orchestra/sprint-checkpoint.ts:523-566`]
5. Tracked diff untracked file'larla union edilir; yeni file result/disk attribution'dan kaybolmaz. [Kanıt: `src/agents/agentic-worker-entry.ts:190-270`; `src/orchestra/disk-verify.ts:135-207`; `src/orchestra/result-assembler.ts:322-455`]
6. Allowed tool'lar worker-authored veya stale launch text'ten değil, exact persisted task scope/contract'tan yeniden türetilir. [Kanıt: `src/orchestra/spawn-backend-docker.ts:3522-3585,5364-5375`; `src/core/tool-allowlist.ts`]

Exit 137 yalnız SIGKILL anlamına gelir. Docker OOM flag OOM diagnosis'ını güçlendirebilir; false veya unavailable flag memory'nin etkisiz olduğunu kanıtlamaz. Güncel code evidence sebebi seçemediğinde bilinçli olarak undetermined açıklama emit eder. [Kanıt: `src/orchestra/spawn-backend-docker.ts:567-613`]

## Dogfood / repository gerçeği

| Surface | Durum | Güncel kısıt |
|---|---|---|
| Native REPL source | ✅ canlı | Bare interactive entry ve native chat wired'dır; `chat --local` help text implementation'a göre bayattır. |
| Plain risk class'ları | ⚠️ kısmi | Registry metadata selected gate'leri sürer; localized renderer'ın production importer'ı yoktur ve `cleanup`/`recover` registry ile permission katmanında ayrışır (OQ-27). |
| Pure terminal compatibility matrix | ✅ test source | Editing/history/width/color seam'leri covered'dır; bu docs pass testi execute etmedi. |
| Real PTY/platform matrix | ⚠️ HOLD | Multi-line paste, raw mode, escape sequence ve actual resize macOS/Windows/WSL2'de çalıştırılmadı. |
| Embedded terminal server | ✅ canlı source | Auth/session/ws/audit module ve route'ları vardır; burada live server/browser mutation yapılmadı. |
| Event log ve bus | ✅ canlı | Durable JSONL ile in-process subscription birlikte yaşar; long-lived autonomous log bounded threshold'ta rotate eder. [Kanıt: `src/core/event-stream.ts:207-215`] |
| Wrapper invariant'ları | ⚠️ kısmi | Docker/tmux/source ve focused test'ler contract'ı kapsar; full backend×provider×platform certification çalıştırılmadı. |

[Interactive surfaces](../guide/interactive-surfaces.md), [Evidence ve settlement](../operations/evidence-and-settlement.md) ve [Platform security](platform-security.md) belgelerine bakın.
