# Hermes Agent vs Deckent — Kod Tabanli Kapsamli Analiz

Tarih: 2026-06-29

Kapsam:
- Hermes kaynak kodu: `/home/alperen/.hermes/hermes-agent`
- Deckent kaynak kodu: `/home/alperen/deckent-dev/src`
- Resmi kaynak: kod. README ve diger dokumanlar yalniz urun baglami icin kullanildi.
- Secret/state dosyalari okunmadi: `/home/alperen/.hermes/.env`, `state.db`, credential cache dosyalari disarida birakildi.

## 1. Yonetici Ozeti

Hermes ve Deckent ayni pazarda gorunebilse de kod tabanlari farkli problemlere optimize edilmis:

- **Hermes Agent**: kullaniciya yakin, her yerden erisilen, zengin tool/skill/gateway ekosistemine sahip personal/operational AI assistant platformu. CLI, gateway, messaging, cron, browser/computer-use, memory, tool registry ve setup/installer deneyimi cok guclu.
- **Deckent**: repo ve is uzerinde coklu ajan calistiran orchestrator. Sprint lifecycle, worker spawn, evaluation, fix, retro, MCP, provider registry, process/autonomous runtime ve enterprise policy/audit cekirdegi Hermes'e gore daha "orchestration/control-plane" odakli.

Deckent'in "autonomous AI orchestrator / agentic run ecosystem / god-level enterprise" hedefi icin Hermes'ten alinacak dersler daha cok **urunlestirme, kolay kurulum, tool ecosystem, gateway, scheduled automation ve progressive disclosure** tarafinda. Deckent zaten **multi-agent sprint orchestration, evaluation ve enterprise process envelope** tarafinda daha derin bir cekirdege sahip.

## 2. Karsilastirma Tablosu

| Alan | Hermes kod gercegi | Deckent kod gercegi | Kimin avantaji | Deckent icin sonuc |
|---|---|---|---|---|
| Urun deneyimi | `hermes` ile chat, `hermes setup`, gateway, native Windows install; README ilk kurulum cok net (`README.md:35-65`, `README.md:105-115`) | CLI/dashboard/MCP cok zengin ama ilk deneyim daha karmasik; dashboard ve native REPL mevcut fakat urun akisi daha cok developer-orchestrator | Hermes | Deckent solo launch icin "Open project -> connect provider -> ask task -> review plan -> run" akisi sart |
| Ana agent loop | `AIAgent` tek turn loop, tool calling ve callbacks ile genis (`run_agent.py:334-430`, `run_agent.py:5382-5405`) | Sprint lifecycle fazlari: PLAN -> SPAWN -> EXECUTE -> EVALUATE -> FIX -> RETRO -> DECAY -> CLEANUP (`sprint-controller.ts:925-928`, `1048-1568`) | Farkli alanlar | Hermes conversational assistant; Deckent run orchestration. Deckent chat UX'i guclendirirken sprint motorunu saklamali |
| Tool sistemi | Self-registering registry, AST discovery, TTL availability cache, plugin/MCP mutation generation (`tools/registry.py:57-74`, `207-361`, `393-430`) | MCP catalog canonical 37 tool + 8 resource; readOnly metadata ve writer lease gate (`src/mcp/tools/index.ts:59-100`, `src/mcp/server.ts:129-143`) | Hermes UX/dinamik; Deckent MCP standardi | Deckent tool registry icin Hermes tarzı dynamic availability + progressive disclosure eklemeli |
| Progressive disclosure | MCP/plugin tool'lari `tool_search/tool_describe/tool_call` arkasina aliyor (`model_tools.py:530-558`) | MCP tool catalog sabit ve host tarafina tum yuzey sunuluyor; mcp-client var ama policy/trust katmani kismi | Hermes | Deckent MCP/connector/tool yuzeyinde tool search ve lazy exposure olmali |
| Memory/learning | Completed turn sync, prefetch, session-end extraction, background memory/skill review (`run_agent.py:1468-1490`, `3082-3193`) | MemoryStore FTS5, OutcomeTracker, rule-evolver, promotion pipeline, trace recorder (`memory-store.ts`, `memory-query.ts`, `outcome-tracker.ts`, `rule-evolver.ts`, `trace-recorder.ts`) | Farkli | Hermes user/session memory'de daha urunlesmis; Deckent outcome/routing learning'de daha agentic-run odakli |
| Delegation/parallelism | `delegate_task` background subagent, top-level async, subagent sync (`run_agent.py:3495-3523`, `5291-5321`) | Worker spawn, dependency waves, file locks, evaluation/fix cycle, provider-aware backends | Deckent | Deckent'in parallelism'i daha deterministic ve repo-safe; Hermes'ten background-result UX alinabilir |
| Cron/scheduled automation | Cron tool create/list/update/run, delivery, skills, model override, workdir, context chaining (`cronjob_tools.py:569-1008`) | Autonomous/backlog/process mode var; scheduled-flow ve autonomous cron izleri var, ama solo kullaniciya Hermes kadar sade gorunmuyor | Hermes UX | Deckent "scheduled agentic runs"i solo urunde basitlestirmeli |
| Messaging/gateway | Telegram/Discord/Slack/WhatsApp/Signal/Email hedefi; gateway session continuity, stream events, authz/pairing modulleri | Telegram/Discord/WhatsApp connectors ve bot command altyapisi var, enterprise/process runtime'a baglaniyor | Hermes adoption | Deckent connectorlari "Integration Center" ile kolaylastirmali |
| Windows/native kurulum | Native Windows fully supported mesajı; PowerShell installer uv/Python/Node/rg/ffmpeg/Git Bash kuruyor (`README.md:43-59`, `scripts/install.ps1`) | Windows subprocess backend ve cmd.exe/PATHEXT fixleri var; README halen WSL2 agirlikli | Hermes | Deckent Windows native support urunlestirilmeli; installer/service/doctor profile gerekir |
| Enterprise governance | Gateway authz, slash access, command approvals, sandbox/tool guards var; daha consumer/assistant guvenligi | API auth/OIDC, enterprise endpoints, RBAC, audit, tenant, policy, process/capability runtime var | Deckent cekirdek | Deckent enterprise temeli daha iyi; fakat hard enforcement ve sade admin UX tamamlanmali |
| ERP/process layer | Genel assistant tool platformu; ERP specific control-plane kaniti sinirli | `ExecutionRequest`, capability broker, ERP connector hook, process controller, approval park mantigi var | Deckent | IFS/ERP icin Deckent daha dogru taban; Hermes'ten UX/tooling alinmali |
| Training/fine-tune data | Batch trajectory generation ve trajectory compression urun iddiasi; kodda trajectory save/compressor var | Native trace recorder `.deckent/traces`, outcome tracker, evaluation results | Berabere/farkli | Deckent Brain icin trace schema + redaction + labels bir sonraki kritik adim |

## 3. Hermes'in Guclu Yonleri

### 3.1 Kurulum ve benimsenme deneyimi

Hermes README'si ilk 100 satirda net bir urun hikayesi veriyor: terminal interface, gateway, closed learning loop, scheduled automations, delegation, run-anywhere, research-ready (`README.md:23-30`). Kurulum da platforma gore basit:

- Linux/macOS/WSL2/Termux: curl pipe install (`README.md:37-41`)
- Native Windows: PowerShell one-liner (`README.md:43-51`)
- Installer dependency sorumlulugunu ustleniyor: uv, Python, Node, ripgrep, ffmpeg, portable Git Bash (`README.md:53-59`)

Deckent icin ders:
- Solo launch'ta "npm install / npx / deckent" sonrasi kullanici hemen deger gormeli.
- Doctor/setup mesajlari teknoloji detayi yerine "hazir / eksik / tek tik fix" olmalı.
- Windows native, WSL2 fallback degil first-class profile olmali.

### 3.2 Tool registry mimarisi

Hermes'te tool dosyalari module import time'da registry'ye kendini kaydediyor. Registry:

- tool dosyalarini AST ile buluyor (`tools/registry.py:57-74`)
- `ToolEntry` ile schema/handler/check_fn/toolset metadata tutuyor (`tools/registry.py:77-106`)
- check_fn sonucunu TTL cache'liyor ve transient failure'i bastiriyor (`tools/registry.py:133-197`)
- register/deregister/toolset alias/generation counter ile dinamik MCP/plugin yuzeyine hazir (`tools/registry.py:207-361`)
- schema retrieval sirasinda availability check ve dynamic schema override uyguluyor (`tools/registry.py:393-430`)

Deckent MCP catalog'u canonical ve test edilebilir, bu iyi. Ancak Deckent'in tool/connector/skill yuzeyi buyudukce Hermes'teki su desenler cok degerli:

- tool availability cache
- toolset-level enable/disable
- dynamic schema override
- generation-based memoization
- plugin/MCP tool shadowing icin explicit override policy

### 3.3 Tool Search / progressive disclosure

Hermes buyuk tool yuzeyini modele her zaman komple vermiyor. `get_tool_definitions` sonunda MCP/plugin gibi non-core tool'lari `tool_search/tool_describe/tool_call` arkasina defer ediyor (`model_tools.py:530-558`). Bu, Deckent'in ileride 37 MCP tool + external MCP + connectors + enterprise actions yuzeyi icin kritik.

Deckent icin ders:
- MCP/connector/action catalog buyudukce ilk prompt'a her seyi koymak yerine arama/kesif katmani olmali.
- Simple Mode kullanicisina sadece 5-7 temel komut gosterilmeli.
- Enterprise Mode'da policy'ye gore tool/action exposure yapilmali.

### 3.4 Gateway ve scheduled automation

Hermes sadece local CLI degil; messaging gateway ile kullanicinin oldugu yerlerde yasiyor. Cron tool'u dogal dil otomasyonlarini, delivery hedeflerini, skill'leri, model override'i, workdir'i ve job chaining'i tek tool'da topluyor (`cronjob_tools.py:569-1008`). Bu solo adoption icin cok guclu.

Deckent icin ders:
- "Scheduled Deckent Run" basitlestirilmeli: daily repo health, weekly dependency audit, nightly test-fix attempt, morning sprint summary.
- Connector outputlari sadece notification degil, kullanicinin agent ile konusmaya devam ettigi session continuity haline gelmeli.
- Cron/schedule UX enterprise process monitoring icin de temel olur: procurement anomaly watch, IFS read-only report, finance daily risk brief.

### 3.5 Memory lifecycle ve self-improvement

Hermes completed turn'leri memory provider'a sync ediyor, next-turn prefetch yapiyor ve interrupted turn'leri memory'den disliyor (`run_agent.py:3134-3193`). Session end/rotation lifecycle ayrimi da net (`run_agent.py:3082-3133`). Background memory/skill review thread'i var (`run_agent.py:1468-1490`).

Deckent'te memory ve outcome tracking guclu ama daha run/sprint odakli. Solo assistant deneyiminde Hermes daha insana yakin.

Deckent icin ders:
- "Run memory" ile "user/session memory" ayrilmali.
- Interrupted/failed/incomplete run'lar training data ve memory icin farkli etiketlenmeli.
- Deckent Brain fine-tune icin basarili/yarim/iptal/NO_GO ayrimi kaydedilmeli.

## 4. Deckent'in Guclu Yonleri

### 4.1 Sprint orchestration ve deterministic lifecycle

Deckent'in ana farki Hermes gibi tek conversation agent olmamasi. `runSprint` acikca tam lifecycle calistiriyor: PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP (`src/orchestra/sprint-controller.ts:925-928`). Kodda phase transition'lar ve nervous events var (`1048-1568`).

Bu, Deckent'i "multi-agent coding sprint runtime" yapar:
- plan uretir
- worker spawn eder
- execute wait eder
- evaluate eder
- fix fazi calistirir
- retro ve learning yazar
- cleanup yapar

Hermes delegation'da guclu ama Deckent'in repo-safe, evaluation-backed, phase-based orchestration derinligi daha yuksek.

### 4.2 Provider/runtime abstraction

Deckent provider registry, model registry ve provider adapters tarafinda ciddi yatirim yapmis:

- `ProviderAdapter` ve `ProviderRegistry` soyutlamasi (`src/core/provider.ts:89`, `235`)
- Claude/Codex/Gemini/Ollama/OpenAI-compatible/Bedrock gibi adaptörler (`src/core/provider.ts:968-1218`)
- Windows `.cmd`/PATHEXT guvenli invocation helper (`src/core/provider.ts:406-430`)
- Ollama local-first path (`src/providers/ollama.ts`)
- model registry ve Ollama registration (`src/core/model-registry.ts:460-488`)

Hermes model/provider seciminde cok genis ve kullanici dostu; Deckent ise worker/provider isolation ve sprint-level routing icin daha dogru altyapiya sahip.

### 4.3 MCP ve external host yuzeyi

Deckent MCP server tarafinda canonical catalog olgun:

- 37 tool tek catalog'da (`src/mcp/tools/index.ts:59-100`)
- 8 resource: dashboard, directives, memory, debt, config, retro, tasks, agents (`src/mcp/server.ts:67-74`)
- writer lease gate server'a install ediliyor (`src/mcp/server.ts:129-143`)
- MCP client broker stdio/http destekli (`src/mcp-client/broker.ts:57-164`)

Hermes MCP/plugin tarafinda daha dinamik; Deckent MCP standardi ve host entegrasyonu tarafinda daha net.

### 4.4 Enterprise/process/capability envelope

Deckent enterprise hayali icin kritik olan soyutlamalar kodda mevcut:

- `ExecutionRequest` universal envelope (`src/core/work-model.ts:128-144`)
- `CapabilityTarget` ERP/mail/db/http gibi non-code isleri temsil ediyor (`src/core/work-model.ts:86-91`)
- ProcessController safe-by-default policy gate ile auto dispatch veya approval park yapiyor (`src/orchestra/process-controller.ts:4-21`, `95-177`)
- Capability runtime audit ve ERP approval hook ile registry olusturuyor (`src/core/capability-runtime.ts:57-127`)
- Mission dispatch task/sprint/capability/process branch'lerini ortak dispatcher'a indiriyor (`src/orchestra/autonomous/mission-store/mission-dispatch.ts:77-113`)

Bu, IFS/ERP gibi enterprise use case'leri icin Hermes'ten daha uygun bir foundation.

### 4.5 Audit/RBAC/OIDC enterprise temel

Deckent API auth default-deny/OIDC/bearer gate tasiyor (`src/api/auth.ts:157-263`), enterprise endpoints tenant/RBAC/audit/rate yuzeyi veriyor (`src/api/enterprise-endpoint.ts:1-23`, `220-282`, `473-868`). Authority matrix rol/capability map ve `enforce_rbac` soft/hard ayrimina sahip (`src/nervous/authority-matrix.ts:193-197`, `207-217`, `310-365`).

Bu alan Hermes'te consumer assistant guvenligi olarak daha yatay; Deckent'te enterprise control-plane olmaya daha yakin.

## 5. Deckent'in Zayif / Gelistirilecek Yonleri

### 5.1 Ilk deneyim karmasik

Deckent core cok guclu ama urun girisi teknik kavramlarla dolu: providers, backends, MCP, dashboard, autonomous, process, nervous, skills, agents. Hermes ise ilk sayfada "kur ve chat'e basla" diyor.

Oneri:
- `deckent` no-arg Simple Mode: project open, provider connect, first task.
- Dashboard ilk ekran: bos status degil, onboarding + "Run first task".
- Advanced yuzeyler: MCP, nervous, enterprise, policy, skill marketplace arka sekmelerde.

### 5.2 Tool/connector yuzeyi buyudukce prompt sisiyor

Deckent MCP catalog 37 tool. Enterprise connector/action katmani eklenince bu yuzey cok buyuyecek. Hermes'in tool_search bridge'i burada dogrudan uygulanabilir.

Oneri:
- Deckent tool/action registry uzerinde `deckent_tool_search`, `deckent_tool_describe`, `deckent_tool_call` benzeri bridge.
- Core tools ilk turda kalir: status, plan, run/start, review, help, memory query.
- Connector/enterprise actions policy ve search arkasina alinir.

### 5.3 Windows native urunlesme eksik

Deckent kodda Windows icin subprocess ve cmd.exe wrapper fixleri var. Ancak urun pozisyonu onceki analizlerde WSL2 agirlikli gorunuyordu. Hermes burada cok ileride: installer uv/Python/Node/rg/ffmpeg/Git Bash'i ustleniyor.

Oneri:
- `deckent doctor --profile windows-native`
- MSI/Electron installer veya Node-bundled desktop beta
- `%LOCALAPPDATA%/Deckent` ve `%ProgramData%/Deckent` ayrimi
- Windows Service runner
- Provider CLI discovery wizard

### 5.4 User/session memory ile run/outcome memory ayrimi

Deckent memory V2 FTS5 ve outcome tracker guclu. Ancak Hermes'teki gibi kullaniciya yakin memory lifecycle, interrupted turn guard, background review ve next-turn prefetch solo assistant hissini guclendiriyor.

Oneri:
- `RunMemory`: sprint, task, outcome, evaluator, fix, retro
- `UserMemory`: preferences, repeated instructions, project habits
- `TrainingTrace`: redacted, labeled, opt-in

### 5.5 Enterprise enforcement halen parcali

Deckent enterprise endpoint ve policy primitives guclu ama onceki analizde de goruldugu gibi bazi yuzeyler soft/default-off veya config-only:

- `enforce_rbac` soft/hard ayrimi (`authority-matrix.ts`)
- `rbac_roles` GET effective matrix'i degistirmiyor (`enterprise-endpoint.ts:613-614`)
- `rate_rules` live limiter'a bagli degil (`enterprise-endpoint.ts:741`)
- capability least privilege call-site wiring tam sert degil

Oneri:
- Tek Enterprise Policy Gateway
- API/MCP/connector/process/autonomous ayni enforcement'dan gecmeli
- read-only L0/L1 enterprise rollout once; write/execute L3+ onayli ve audit'li

## 6. Hermes'ten Deckent'e Eklenebilir Ozellikler

| Oncelik | Ozellik | Hermes kaniti | Deckent'e uyarlama | Deger |
|---|---|---|---|---|
| P0 | Setup/connection wizard | `hermes setup`, installer staged protocol, README quickstart | `deckent setup` / dashboard connection center | Solo adoption |
| P0 | Progressive tool search | `model_tools.py:530-558` | MCP/connector/action catalog'u lazy expose et | Token ve UX kontrolu |
| P0 | Native Windows installer profili | `README.md:43-59`, `scripts/install.ps1` | Desktop/installer/service runner | Windows kullanici kazanimi |
| P0 | Simple Mode UX | Hermes chat-first CLI (`README.md:107-115`) | `deckent` -> task input -> plan preview -> run | Ilk 10 dk degeri |
| P1 | Cron/scheduled runs | `cronjob_tools.py:569-1008` | daily repo audit, scheduled sprint, enterprise L0/L1 monitors | Solo + enterprise bridge |
| P1 | Gateway continuity | README gateway, `gateway/stream_events.py`, authz/slash modules | Telegram/Discord/Slack/Teams sessions, approval replies | "Deckent everywhere" |
| P1 | Background memory/skill review | `run_agent.py:1468-1490` | post-run learning worker, opt-in memory suggestions | Deckent Brain data |
| P1 | Dynamic tool availability caching | `tools/registry.py:133-197` | provider/MCP/connector availability cache | Runtime stability |
| P2 | Computer-use/browser tool richness | `tools/browser_*`, `tools/computer_use_tool.py` | optional desktop/browser automation pack | Agentic OS story |
| P2 | Trajectory compression/research pipeline | `trajectory_compressor.py`, save trajectories hooks | redacted run traces for Deckent Brain fine-tune | Long-term moat |

## 7. Stratejik Sonuc

Deckent Hermes'i kopyalamamali. Iki urun farkli yerlere guclu:

- Hermes = AI assistant that lives with the user.
- Deckent = AI orchestration/control layer that runs structured work.

Deckent'in kazanacagi sentez:

1. **Solo urunde Hermes kadar kolay basla.**
2. **Core'da Deckent'in sprint/evaluation/orchestration derinligini koru.**
3. **Tool/connector/action yuzeyini Hermes gibi dinamik ve kesfedilebilir yap.**
4. **Gateway/cron/scheduled automation ile Deckent'i sadece terminalde degil, kullanicinin is akisi icinde yasat.**
5. **Enterprise'da Deckent'in process/capability/policy envelope'unu sertlestir; IFS/ERP bu foundation uzerine gelsin.**

Kisa hukum:

Deckent'in "god-level enterprise" hedefi icin en kritik hamle daha cok ajan eklemek degil, Hermes'in basardigi **adoption ergonomisi + tool ecosystem + always-available assistant** hissini Deckent'in mevcut **deterministic orchestration + enterprise policy + evaluation** cekirdegine bindirmek.

## 8. Sohbette Tartisilacak Ozet Tablo

| Baslik | Hermes'ten alinacak ders | Deckent'te korunacak fark | Ilk aksiyon |
|---|---|---|---|
| Launch UX | Tek komut, setup wizard, chat-first | Sprint plan/evaluate/fix kalitesi | Simple Mode + provider wizard |
| Tool yuzeyi | Dynamic registry, availability cache, tool_search | MCP canonical catalog ve writer lease | Tool/action progressive disclosure |
| Automation | Cron + delivery + skills | Autonomous/process runtime | Scheduled Deckent Runs |
| Memory | Session lifecycle, background review | Outcome/rule evolution | UserMemory/RunMemory ayrimi |
| Windows | Native installer, bundled deps | Subprocess backend + provider abstraction | Windows native doctor/install profile |
| Enterprise | Gateway authz/approval ergonomisi | OIDC/RBAC/audit/capability envelope | Tek Enterprise Policy Gateway |
| Future AI | Trajectory/research tooling | Deckent Brain orchestration traces | Redacted trace + label pipeline |

## 9. Terminal / Ink REPL Kiyasi

Bu bolumun amaci Hermes'i kopyalamak degil; terminal yuzeyindeki isleyis farkini anlamak. Deckent'in hedefi daha buyuk: sadece sohbet eden asistan degil, agentic run ecosystem ve enterprise kontrol katmani. Buna ragmen solo benimsenme icin `deckent` komutunun ilk 10 dakikasi Hermes kadar net olmali.

### 9.1 Hermes terminal yuzeyi neden guclu?

Hermes'te terminal deneyimi tek bir "chat loop" degil, urunlesmis bir kabuk:

- `hermes` default interactive chat olarak aciliyor; `hermes_cli/main.py:5-20` kullaniciya ana komut modelini cok erken veriyor.
- Classic REPL `prompt_toolkit` ustune kurulmus; `cli.py:58-70` input, history, layout, keybinding, completion, patch_stdout gibi terminale ozel primitive'leri dogrudan sahipleniyor.
- `HermesCLI` dokumanli olarak rich formatting, command history ve tool execution sunuyor (`cli.py:3430-3434`).
- Slash komutlari kategorili ve kesfedilebilir; `show_help()` komutlari kategori, skill command, bundle, quick command ve ipuclariyla listeliyor (`cli.py:6321-6379`).
- Empty history durumunda kullanici boslukta kalmiyor; recent sessions inline gosterilip `/resume <number|id|title>` oneriliyor (`cli.py:6533-6560`).
- Editor/save, slash dispatch, busy input queue/interrupt gibi edge-case'ler ayni input pipeline'dan geciyor (`cli.py:5752-5803`).
- TUI gateway ayri bir RPC/gateway runtime olarak tasarlanmis: crash log, thread panic hook, async RPC dispatch, long-handler pool ve project tree var (`tui_gateway/server.py:47-85`, `169-218`; `project_tree.py:1-23`).
- Native Windows destek "best effort" degil: UTF-8 bootstrap erken basliyor (`hermes_cli/main.py:46-62`), `pywinpty` ve Windows-only deps base kurulumda var (`pyproject.toml:90-137`), ConPTY bridge dashboard PTY yuzeyini native Windows'a tasiyor (`win_pty_bridge.py:1-13`), gateway service Windows Scheduled Task + Startup fallback ile calisiyor (`gateway_windows.py:1-25`).

Sonuc: Hermes terminali yalnizca komut kabul etmiyor; kullaniciyi bagli provider, oturum, komutlar, tool'lar, path, gateway ve recoverability icinde tasiyor.

### 9.2 Deckent Ink REPL'in mevcut guclu tarafi

Deckent'te Ink REPL zayif degil; hatta bircok temel parca var:

- Bare `deckent`, subcommand yoksa REPL'e gider (`entry.ts:42-99`).
- Interactive TTY'de Ink default olmus; legacy readline sadece `DECKENT_INK=0` ile kaliyor (`entry.ts:500-516`).
- `ReplApp` engine/view ayrimi yapmis; `runChatNativeLoop` engine olarak kaliyor, Ink state/render katmanini ustleniyor (`app.tsx:1-10`, `373-397`).
- InputBar gorunur caret, arrow/Home/End, history, Ctrl-R reverse search ve slash menu sagliyor (`input-bar.tsx:1-7`, `87-164`, `183-210`).
- Slash registry tek katalogdan uretiliyor; Deckent yetenekleri `/status`, `/plan`, `/doctor`, `/mcp`, `/autonomous`, `/audit`, `/provider`, `/approve` gibi komutlarla gorunur (`chat-slash-registry.ts:48-268`).
- Tool permission modeli var: suggest / auto-edit / full-auto ve confirm queue ile "always allow same tool" davranisi kurulmus (`run.tsx:65-89`, `app.tsx:55-104`).
- Tool sonucunu sadece ham JSON olarak degil, change block olarak gosterebiliyor (`app.tsx:106-115`, `215-239`; `run.tsx:94-166`).
- Provider/model runtime switch var (`app.tsx:430-443`; `run.tsx:60-64`).
- MCP REPL wire mevcut: `/mcp list` connect + catalogue, `/mcp call` dispatch + confirm + fail-safe hata donusu (`repl/mcp-bridge.ts:107-200`); testleri de hermetic yazilmis (`tests/cli/repl-mcp-wire.test.ts:1-20`).
- Chat memory ve `/resume` icin proje memory.db best-effort baglaniyor (`run.tsx:46-58`).

Yani sorun "Deckent terminali yok" degil. Sorun: bu parcali guclu yuzey henuz kullaniciya Hermes kadar basit, guven veren ve kendini aciklayan bir urun kabugu gibi hissettirmiyor.

### 9.3 Isleyis farklari tablosu

| Alan | Hermes isleyisi | Deckent mevcut isleyisi | Fark / risk | Deckent icin dogru yon |
|---|---|---|---|---|
| Ilk acilis | `hermes` direkt chat; setup/status/doctor komutlari cok gorunur | `deckent` Ink REPL'e gider, provider config zinciriyle adapter kurar | Kullanici provider/MCP/izin durumunu baslangicta net goremeyebilir | First-run connection center: provider, auth, MCP, workspace, mode tek ekranda |
| Input primitive | `prompt_toolkit` terminal primitive'lerini sahiplenir | Ink + custom reducer; visible caret, history, slash menu var | Ink guclu ama terminal edge-case maliyeti bize ait | Ink'i koru; terminal compatibility matrix ve screenshot/PTY smoke test ekle |
| Komut kesfi | Kategorili help + skill/bundle/quick commands | Tek slash catalog + menu; `renderHelp` sade liste | Deckent komut sayisi arttikca menu bilgi mimarisi zayiflar | Slashlari kategori, risk, scope, enterprise/core etiketiyle grupla |
| Oturum devam | Empty history'de recent sessions inline; resume number/id/title | Memory varsa `/resume` var; memory yoksa degrade | Ilk kullanici "onceki oturumu nasil bulurum?" sorusuna daha az cevap alir | REPL acilista recent session teaser + `/resume` picker |
| Tool gosterimi | Tool progress display configurable; dynamic registry + toolsets | Tool blocks var, MCP list/call var, native registry var | Internal tool / external MCP / Deckent action ayrimi kullaniciya flu | "Actions" paneli: Core, Project, MCP, Enterprise, Dangerous |
| Busy davranisi | interrupt/queue/steer modlari config'lenebilir | Queue preview ve `/cancel` var | Mid-run steering ve explicit interrupt modeli daha az belirgin | `Esc/Ctrl-C` davranis standardi + `/queue`, `/interrupt`, `/steer` |
| Provider degisimi | model/provider commands + setup flows | `/provider`, `/model`, switchable proxy var | Switch basarisi/aktif model/credential failure startup'ta az gorunur | Status footer'a provider health ve auth state ekle |
| MCP | Hermes MCP/security/startup commands genis | Deckent MCP broker ve `/mcp` wire yeni ama mantikli | Kullanici baglantiyi "kurulum sonrasi deckent komutunda" anlamiyor | `/connect mcp` wizard + auto-detect + health badge |
| Windows native | pywinpty, service fallback, UTF-8 bootstrap, Windows deps | Node/Ink path var; Windows native urunlesme henuz requirement seviyesinde | WSL disinda corporate Windows kazanimi zorlasir | Node single-binary/installer + Windows service/PTY + PowerShell profile |
| Gateway/TUI | TUI gateway ayri RPC runtime, project tree/git lanes | Ink local REPL merkezde | Deckent terminal ile dashboard/gateway story ayrik kalabilir | REPL, desktop/dashboard ve enterprise gateway ayni session/action protocolunu paylassin |

### 9.4 Deckent icin terminal stratejisi

Deckent Hermes'i birebir kopyalamamali. Deckent'in terminal kabugu su role oturmali:

**Deckent Shell = chat + action console + policy-aware run control.**

Bu shell uc modla acilmali:

1. **Ask Mode**: soru sor, repo/kurulum/status anla, read-only tool'lar.
2. **Run Mode**: plan preview -> approval -> sprint/run -> live progress -> evaluation.
3. **Control Mode**: MCP/provider/agent/enterprise process/approval/audit yonetimi.

Bugunku Ink REPL bu hedef icin iyi foundation. Ancak urunlesme eksigi su katmanlarda:

- First-run wizard yoksa kullanici dogrudan REPL'e dusuyor ama "Deckent hazir mi?" sorusu cevaplanmiyor.
- `/help` ve slash menu command listesi var ama kategori/risk/scope anlatimi zayif.
- Provider, model, MCP, memory, approval mode ve cwd ayni footer'da var; fakat "health" ve "next best action" yok.
- Enterprise hedef icin policy/risk onaylari var ama solo kullanici icin daha basit bir dil lazim: "Oku", "Degistir", "Calistir", "Otonom".
- Windows native icin terminal sadece Ink meselesi degil; installer, shell integration, PTY, service runner, logs, autostart, PATH ve antivirus/locked-down corporate makineler gerekiyor.

### 9.5 Oncelikli aksiyon listesi

| Oncelik | Aksiyon | Beklenen etki | Kodda dayanak |
|---|---|---|---|
| P0 | `deckent` acilisinda health snapshot: provider, model, auth, MCP, memory, cwd, approval mode | Kullanici "hazir miyim?" sorusuna cevap alir | `entry.ts:481-516`, `run.tsx:40-64`, `app.tsx:514-520` |
| P0 | First-run/setup overlay: provider sec, auth rehberi, local/sub/API secimi, MCP bagla | Solo benimsenme artar | `resolveReplProviderForCwd`, provider registry, `mcp-bridge.ts` |
| P0 | Slash menu kategorileri: Core, Run, Memory, MCP, Enterprise, Danger | Komut kalabaligi azalir | `chat-slash-registry.ts:57-268`, `input-bar.tsx:183-205` |
| P0 | `/connect` komutu: provider/MCP/IDE/Windows shell baglama wizard'i | Kurulum sonrasi "deckent komutuyla aktiflesiyor ama basarisiz" hissi azalir | mevcut provider/MCP config primitives |
| P0 | "Simple task" flow: natural prompt -> plan preview -> approve -> run -> evaluate | Deckent'in asil farki terminalde gorunur | sprint controller + chat agentic dispatch |
| P1 | Recent sessions acilis teaser ve interactive `/resume` picker | Continuity artar | `MemoryStore`, `/resume`, Hermes `_show_recent_sessions` modeli |
| P1 | Tool/action catalog: local Deckent actions + external MCP + enterprise process farkli rozetlerle | Kullanici tool guvenini anlar | `TOOL_CATALOG`, `McpToolRegistry`, permission tiers |
| P1 | Windows-native profile: `deckent doctor --windows-native`, PowerShell installer, PATH, service, logs, PTY smoke | WSL disi Windows kullanicilari kazanilir | Hermes `win_pty_bridge.py`, `gateway_windows.py` dersleri |
| P1 | REPL compatibility tests: Linux/macOS/Windows Terminal/PowerShell/Git Bash, resize, paste, arrow, subprocess-return raw-mode | Ink regression azalir | mevcut `repl-input-terminal`, `repl-mcp-wire` test pattern'i |
| P2 | Dashboard/desktop/gateway ile ortak session/action protocol | Enterprise ve solo yuzeyler ayni davranir | Deckent API + REPL + future desktop |

Kisa hukum: Deckent Ink REPL'i atmak gerekmiyor; aksine foundation dogru. Eksik olan, bu foundation'in **Deckent Shell** olarak urunlesmesi: ilk acilista hazirlik kontrolu, baglanti sihirbazi, kategorili komut kesfi, aksiyon risk dili, MCP/provider health ve Windows-native operasyon standardi.

## 10. Deckent Shell / Dashboard Urun Konumlandirmasi

Konusmadaki netlesme:

- **Terminal / Deckent Shell**: is yaptiran, sprint/autonomous/mission/flow yurutmeyi baslatan ve yoneten ana yuzey.
- **Dashboard**: izleme, gorsel analiz, trace, timeline, audit ve outcome aciklama yuzeyi.
- **Website**: ilk asamada landing/docs/download/community; daha sonra cloud/app/enterprise kapisi.
- **Enterprise App / Console**: daha sonra dashboard'un uzerine users, policy, connector, ERP/IFS, tenant, billing, approval delegation eklenince dogar.

Bu ayrim Deckent icin stratejik olarak dogru. Cunku Deckent'in gucu "butonlu dashboard" degil; run orchestration, evaluation, policy, audit, memory ve agentic control layer. Dashboard bu akisi aciklamali, ana feature karmasasini tasimamali.

### 10.1 Terminal ne gostermeli?

Terminal ana aksiyon yuzeyi olarak kalmali ama detay coplugu olmamali. Sprint, autonomous, mission ve flow calisirken kullanici 1-5 satirda sistemin durumunu gormeli:

```text
deckent
provider ready · mcp 3 connected · approval suggest

Sprint 100 running
PLAN done · SPAWN done · EXECUTE 42/100 · EVALUATE waiting

autonomous
mission: reduce build failures
flow: repo-health -> test-run -> fix-plan
next: worker-7 reviewing failed tests

›
```

Terminalin ana sorulari:

1. Ne calisiyor?
2. Nerede kaldi?
3. Benden onay bekliyor mu?
4. Sonraki adim ne?
5. Riskli bir aksiyon var mi?

Terminalin tasimamasi gerekenler:

- uzun timeline grafikleri
- tum task tree / DAG detaylari
- tum audit history
- raw trace ve memory diff
- her feature icin dashboard gibi panel/buton karmasasi

### 10.2 Dashboard ne olmali?

Dashboard baslangicta **observability / visual analysis surface** olarak yeniden konumlanmali.

Dashboard'a ait yuzeyler:

- sprint timeline
- task DAG / worker dagilimi
- autonomous mission flow
- live run trace
- approval/audit history
- provider/token/cost grafikleri
- memory/outcome/rule evolution
- enterprise process state
- ileride IFS/ERP flow izleme

Dashboard'a ait olmayan veya geciktirilmesi gereken yuzeyler:

- ana workflow baslatma karmasasi
- terminal komutlarinin buton kopyalari
- provider/MCP setup'in ana kopyasi
- feature-by-feature kontrol paneli

Dashboard'dan terminal acilabilmesi iyi bir avantaj. Ama product mental model su olmali:

```text
Terminal runs.
Dashboard explains.
```

Bu, gelistirmeyi de sade yapar. Dashboard'a yeni feature eklemek yerine, mevcut event/audit/run/memory verilerini iyi gorsellestirmek yeterli olur.

### 10.3 Urun evrimi

| Faz | Terminal / Shell | Dashboard | Website / App |
|---|---|---|---|
| Publish oncesi | `deckent` ile basla, provider/MCP health, sprint/run start, approval | run timeline, task progress, trace, audit, memory/outcome | docs, install, examples |
| Solo adoption | Simple task -> plan preview -> approve -> run -> evaluate | project health, agent trace, cost/token, outcome evolution | community, templates, videos |
| Pro | scheduled runs, autonomous mission, local connectors | long-running observability, reports, export | hosted account optional |
| Enterprise | policy-aware shell, delegated approval, connector ops | org dashboard, users/policy/audit/connectors/IFS flows | enterprise console/cloud/app |

Kisa karar:

Deckent Dashboard su an "ana urun" olmak zorunda degil. Baslangicta sadece terminalde olan seyi daha iyi gosteren analiz penceresi olmali. Ana urun hissi `deckent` terminal shell'den gelmeli.

## 11. Ana Terminale Canli Onay Tasima Problemi

Konusmada kritik eksik netlesti:

Deckent'te onay kontrolleri, policy primitive'leri ve permission mantigi var; fakat long-running sprint/autonomous/mission/flow calisirken bir worker/docker/subprocess onay istediginde, bu istek ana terminale canli olarak geri donmuyor.

Bu problem "onay sistemi yok" problemi degil. Problem:

```text
terminal -> sprint baslatir
worker/docker/subprocess -> isi yurutur
worker -> riskli aksiyon icin onay ister
ama worker ana terminalin stdin/stdout sahibi degildir
onay sorusu terminalde gorunmez
```

Claude Code / Codex / Gemini benzeri araclarin basardigi davranis genelde su modelle kurulur:

```text
worker/tool approval ister
        ↓
central approval broker / event bus
        ↓
aktif terminal session approval_request event'i alir
        ↓
terminal modal/card soruyu gosterir
        ↓
kullanici y/n/a/detail secer
        ↓
approval response bekleyen worker'a geri gider
```

### 11.1 Temel mimari karar

**Approval = stdin sorusu degil, runtime event'i.**

Worker veya tool dogrudan terminale soru sormamali. Worker sadece structured approval request olusturmali ve broker uzerinden cevap beklemeli. Terminal ise Deckent runtime'a bagli bir **interactive control client** olmali.

Dogru akim:

```text
Sprint / Autonomous / Mission / Flow
        ↓
ApprovalRequest olusturur
        ↓
ApprovalBroker'a yazar
        ↓
ApprovalEvent yayinlanir
        ↓
Deckent Shell event stream'i dinler
        ↓
Ink REPL altinda approval card gosterir
        ↓
user y / n / a / d secer
        ↓
ApprovalBroker.resolve(id, decision)
        ↓
worker devam eder veya aksiyon reddedilir
```

### 11.2 ApprovalRequest kontrati

Minimum request alani:

| Alan | Amac |
|---|---|
| `id` | stable approval id |
| `scope` | sprint / autonomous / mission / flow / process / mcp / connector |
| `scopeId` | sprintId, missionId, flowId vb. |
| `requester` | worker, agent, tool, connector |
| `action` | calistirilmak istenen aksiyon |
| `summary` | terminalde 1 satirlik insan okunur ozet |
| `details` | dashboard/detail view icin uzun aciklama |
| `riskLevel` | read / write / execute / destructive / external |
| `policy` | require approval, allow once, allow for sprint, deny by default |
| `timeoutMs` | kullanici cevaplamazsa ne olacak |
| `defaultDecision` | deny / allow / pause / escalate |
| `createdAt` | audit |
| `requestedByTenant/User` | enterprise audit/RBAC |

Terminalde gorunum:

```text
Sprint 100 running · EXECUTE 42/100

approval required
worker-7 wants to run: docker compose down -v
risk: destructive
[y] allow once  [a] always for this sprint  [n] deny  [d] details

›
```

### 11.3 Gerekli bilesenler

| Bilesen | Gorev |
|---|---|
| `ApprovalBroker` | request olusturur, persist eder, resolve eder, pending state tutar |
| `ApprovalStore` | pending/approved/denied/expired eventlerini kaydeder |
| `ApprovalEventStream` | terminal/dashboard/API/Slack/Teams gibi client'lara yayin yapar |
| `ShellApprovalClient` | Ink REPL icinde approval card/modal gosterir |
| `WorkerApprovalGate` | riskli tool/action oncesi broker'dan karar bekler |
| `ApprovalPolicy` | risk, role, tenant, scope ve timeout kararlarini uygular |
| `FallbackResolver` | terminal yoksa dashboard/API/timeout/default/escalation uygular |

Bu yapi sadece terminal icin degil, enterprise icin de kritik:

- dashboard ayni pending approval'lari gosterir
- Slack/Teams ileride ayni approval event'lerine cevap verebilir
- API ile delegated approval yapilabilir
- audit trail dogal olarak olusur
- RBAC/policy tek yerden uygulanir
- IFS/ERP write action'lari ayni mekanizmayla guvenli hale gelir

### 11.4 Terminal entegrasyonu

Deckent Shell su iki stream'i ayni anda dinlemeli:

1. **Run status stream**: sprint/autonomous/mission/flow progress.
2. **Approval stream**: pending approval request'leri.

Normal durum:

```text
Sprint 100 running
EXECUTE 42/100 · workers 8 active · next evaluate
```

Onay bekleyen durum:

```text
Sprint 100 paused · approval required
worker-7 wants: edit docker-compose.yml
risk: write
[y] allow once  [a] allow for sprint  [n] deny  [d] details
```

Birden fazla onay varsa Ink REPL'deki mevcut confirm queue mantigi dogru fikir; fakat bu queue sadece local tool confirm icin degil, runtime-wide approval request icin genisletilmeli.

### 11.5 Dashboard entegrasyonu

Dashboard sadece izleme araci olarak konumlansa bile approval state'i gostermeli:

- pending approvals listesi
- hangi sprint/mission/flow blocked
- requester/worker/action/risk
- approved/denied/expired history
- policy sonucu
- detay trace linki

Dashboard baslangicta approval vermese bile gormeli. Sonra enterprise/pro modda dashboard/API/Slack approval client olarak eklenebilir.

### 11.6 P0/P1 implementation plani

| Oncelik | Is | Hedef |
|---|---|---|
| P0 | ApprovalRequest schema ve store | onay istekleri kaybolmasin, audit baslasin |
| P0 | ApprovalBroker `request()` / `resolve()` / `waitForDecision()` | worker bekleyebilsin |
| P0 | Shell event subscription | ana terminal pending approval'i canli gorsun |
| P0 | Ink approval card | y/n/a/d ile cevap verilebilsin |
| P0 | WorkerApprovalGate'i sprint/tool execution path'e bagla | docker/subprocess/tool riskleri terminale gelsin |
| P0 | Timeout/default decision | terminal kapaliysa run sonsuza kadar takilmasin |
| P1 | Dashboard pending approval viewer | gorsel izleme ve debug |
| P1 | Approval history + audit report | enterprise foundation |
| P1 | Scope-level "always allow for sprint/mission" | tekrar eden onay azalir |
| P1 | Slack/Teams/API approval client | enterprise workflow |

### 11.7 Tasarim uyarilari

- Worker terminale direkt prompt basmamali.
- Docker/subprocess stdin'e approval sormak anti-pattern; control plane event'i olmali.
- Approval cevabi persist edilmeli; sadece memory promise olursa terminal restart'ta kaybolur.
- "Always allow" global olmamali; en azindan tool + scope + risk + expiry ile sinirlanmali.
- Dashboard approval verecekse RBAC/policy terminalle ayni broker'dan gecmeli.
- Terminal kapaliysa fallback policy net olmali: deny, pause, timeout veya dashboard/API escalation.
- Approval request raw command'u ve masked/redacted arg'lari ayri tutmali; secret leakage onlenmeli.

Kisa hukum:

Deckent Shell'in yonetim penceresi olabilmesi icin ana eksik **runtime-wide ApprovalBroker + terminal event subscription**. Bu cozulmeden terminal sadece sprint baslatan pencere olur. Bu cozulurse terminal gercek control plane'e donusur; dashboard da ayni event'leri gorsellestiren observability penceresi haline gelir.

## 12. Codex Opinion — Yikilacak / Korunacak / Yeniden Paketlenecek Alanlar

Bu bolum yorumdur; kaynak siniri yine kod ve mevcut plan gercegidir. Deckent 340+ sprintte cok kisa surede sifirdan dogup dogfood ile buyumus bir sistem. Bu, iki seyi ayni anda dogurmus:

1. Cekirdek orkestrasyon kapasitesi gercek ve degerli.
2. Urun yuzeyinde biriken deneysel katmanlar artik sade bir product shape'e indirilmeli.

Bu nedenle dogru strateji "her seyi bitir" degil; **dogru seyi koru, yanlis yuzeyi yik, guclu cekirdegi daha basit bir urune paketle**.

### 12.1 Yikilip yeniden yapilmasi gerekenler

| Alan | Neden yikilmali | Yeni yon |
|---|---|---|
| Dashboard'un ana urun gibi konumlanmasi | Dashboard'a feature ekledikce urun karmasiklasiyor; terminal/run control zihinsel modeli bulaniyor | Dashboard = observability, timeline, trace, audit, outcome, approval viewer |
| REPL/terminalde parcali komut deneyimi | Slash, provider, MCP, approval, autonomous ve sprint yuzeyleri var ama tek product shell gibi hissettirmiyor | Deckent Shell = health snapshot + simple task + run control + approval |
| Local confirm queue ile runtime approval'in karismasi | Local tool confirm ana terminalde calisir, ama worker/docker/subprocess approval'i ayni mekanizma degil | Runtime-wide ApprovalBroker + ShellApprovalClient |
| Feature-by-feature dashboard kontrol paneli | Her ozelligi dashboard'a koymak development'i ve UX'i sisiriyor | Dashboard sadece calisan runtime'i aciklar; aksiyon terminal/shell ve ileride app'ten |
| Kurulum sonrasi belirsiz provider/MCP/auth akisi | Kullanici "deckent calisti ama neye bagli, hazir mi?" sorusunda kaliyor | First-run Connection Center: provider, auth, MCP, local model, workspace, approval mode |
| Static/kalabalik tool exposure | MCP/connector/enterprise action sayisi buyudukce model ve kullanici yuzeyi sisiyor | Progressive tool/action discovery: search, describe, call; policy/risk rozetleri |
| Legacy plan dokumani sekli | MASTER-PLAN artik tarihsel ledger + backlog dump; yeni sprint karari icin agir | Archive + yeni short product master plan + old-ID crosswalk |
| Config/doctor/output no-op veya misleading yuzeyleri | Kullanici guveni kirilir; "ayar var ama calismiyor" hissi urunu oldurur | Dürüst ayar ilkesi: ya gercek etkili ya UI/docs/schema'dan sil |

Buradaki "yikmak" kodu toptan silmek anlamina gelmez. Bir cok parca once **feature flag / hidden advanced / archive** seviyesine alinabilir. Ama kullaniciya sunulan product shape yeniden kurulmalidir.

### 12.2 Korunmasi gereken cekirdekler

| Alan | Neden korunmali | Yapilacak is |
|---|---|---|
| Sprint lifecycle | Deckent'in Hermes/Cursor/Claude Code'dan ayrildigi ana guc: plan, spawn, evaluate, fix, retro | UX basitlestir; lifecycle'i saklama |
| Worker orchestration + dependency waves | Multi-agent dogfooding'in gercek motoru | Merge/race/reliability fixleriyle sertlestir |
| Evaluation/FIX/retro sistemi | "Agentic run ecosystem" iddiasinin kaniti | False NO_GO, eval-vs-disk, result consistency sorunlarini kapat |
| Provider registry/model registry | Provider-neutral gelecek icin dogru temel | Live capability detection + model policy engine ekle |
| Memory/outcome/evolution altyapisi | Deckent AI fine-tune ve routing evolution icin veri omurgasi | UserMemory/RunMemory/TrainingTrace ayrimi yap |
| MCP server/catalog | External host ve tool ekosistemi icin degerli | Progressive exposure + trust/approval gate ile sadeleştir |
| Process/capability/ERP envelope | Enterprise ve IFS hedefi icin dogru foundation | Solo publish'i bloke etmeden read-first enterprise track'e koy |
| Native-agent core | Terminali kendi agent loop'una tasima stratejisi dogru | Default flip'i publish gate'e degil, provable stabilization gate'e bagla |

### 12.3 Elden gecirilmesi gerekenler

| Alan | Sorun | Netlestirme |
|---|---|---|
| `deckent` default acilisi | REPL var ama ilk 10 dakika yeterince rehberli degil | Ilk ekran: ready state, provider, model, auth, MCP, next action |
| `/help` ve slash menu | Komut listesi buyudukce urun bilgi mimarisi zayiflar | Kategori: Ask, Run, Control, Memory, MCP, Enterprise, Danger |
| Provider/model/effort routing | Mevcut sistem deterministik ama "akilli model secimi" gibi sunulmamali | ModelPolicyEngine: cost, latency, risk, task kind, provider health, outcome history |
| Windows native | Kodda destek parcali; product promise net degil | Windows profile: installer, PATH, service/logs, doctor, provider auth, PTY smoke |
| Dashboard terminal dock | Kullanissiz degil ama mental model bulanik | "Open shell" opsiyonel; dashboard'un ana rolu izleme |
| Enterprise yuzeyi | Cok guclu hedefler var ama solo launch'i bogabilir | Enterprise'i Layer 4/5 olarak tut; solo UI bitmeden main product'a tasima |
| Docs | Cok dokuman var ama publish kullanicisi icin fazla | Docs-from-code: install, quickstart, first run, provider setup, troubleshooting |

### 12.4 Dogfooding ile 5x hiz varsayimi

Deckent'in bugune kadar 3 ayda 340+ sprintle bu seviyeye gelmesi onemli bir veri. Bu, dogfooding'in hiz kazandirdigini gosteriyor. Ancak ayni veri bir riski de gosteriyor: cok hizli dogfood, bazen **product shape yerine sistem genisligi** uretir.

Bu nedenle 5x hiz ancak su kosullarda guvenli olur:

- Sprint'ler product layer'a gore kisitlanir; her sprint yeni feature degil, kullanici akisi kapatir.
- Her sprint sonunda "ilk kullanici bunu daha kolay kullanir mi?" sorusu zorunlu gate olur.
- Dashboard'a yeni ozellik eklemek default cevap olmaz; once terminal/shell ve event modeli dogrulanir.
- Kapanmis gibi gorunen feature'lar smoke degil, first-run path uzerinde canli denenir.
- Worktree merge race, orphan process, config/doctor yalanlari gibi guven kirici bug'lar P0 kabul edilir.

### 12.5 Publish oncesi yikim/sadelestirme sirasi

| Sira | Is | Hedef |
|---|---|---|
| 1 | MASTER-PLAN archive + yeni short Product Plan | Karar ve sprint uretimi sadeleşir |
| 2 | First-run path dondur: `deckent` -> health -> connect -> first task | Solo adoption omurgasi |
| 3 | Dashboard scope freeze | Dashboard yeni feature degil, observability uzerine odaklanir |
| 4 | ApprovalBroker P0 slice | Long-running run'larda ana terminal gercek control plane olur |
| 5 | Provider/Auth/Image/Doctor sade fixleri | Kurulum ve ilk hata deneyimi toparlanir |
| 6 | Routing/model policy v0 | "hangi model bu isi yapar" karari explainable olur |
| 7 | Docs/npm/package polish | Public beta guvenilir gorunur |

### 12.6 Yeni Master Plan icin onerilen cekirdek cumle

Yeni plan su cumle etrafinda kurulabilir:

> Deckent is a local-first AI orchestration shell: terminal runs, dashboard explains, core orchestrates, enterprise governs.

Bu cumle master plan icin pratik karar filtresi verir:

- Terminalde run/control/approval yoksa publish UX eksiktir.
- Dashboard calisan seyi aciklamiyorsa gereksizdir.
- Core orchestration'a hizmet etmeyen feature post-publish'e gider.
- Enterprise policy solo kullanimi zorlastiriyorsa katman ayrimina cekilir.

### 12.7 Son karar

Deckent'in yikilmasi gereken kismi cekirdek degil; **urun yuzeyinin daginikligi**. Sprint motoru, provider registry, memory/evolution, MCP, process/capability ve enterprise envelope korunmali. Yikilacak olan sey, bunlarin kullaniciya ayni anda ve esit agirlikta sunulmasi.

Publish oncesi hedef:

```text
deckent acilir
hazirlik durumunu soyler
kullanici ilk isi verir
Deckent planlar
kullanici onaylar
run ilerler
gerektiginde ayni terminal onay ister
dashboard bunu sade ve guvenilir gosterir
```

Bu akış kusursuz hissetmeden enterprise katmanina agirlik vermek erken olur. Solo urun benimsenirse enterprise icin hem veri, hem guven, hem topluluk, hem de Deckent AI fine-tune yakiti dogar.
