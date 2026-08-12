# Deckent Desktop & Terminal Product Design Strategy

> **Status:** Owner-approved product/design north-star; implementation SSOT değildir.
> **Scope:** Desktop App, Terminal/TUI, Chat, MCP, Provider Connections, Extensions, Cross-Platform Architecture, Design System
> **Preservation:** Alperen'in 2026-08-12 tarihli 55 bölümlük taslak planı başlıkları, kararları, örnekleri ve sıralamasıyla kayıpsız korunmuştur. Yalnız bu authority/preservation üst bilgisi ve repository-relative reconciliation bağlantısı eklenmiştir.
> **Authority:** İş durumu ve teslimat authority'si [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md), implementasyon gerçeği repository kodu ve executable kanıttır. Bu belge mevcut genel ürün vizyonunun yerine geçmez ve kodu kendisine uydurma yetkisi vermez.
> **Repository reconciliation:** [Desktop & Terminal Repository Reconciliation](./DECKENT-DESKTOP-TERMINAL-RECONCILIATION.md)

**Status:** Working Design Direction
**Scope:** Desktop App, Terminal/TUI, Chat, MCP, Provider Connections, Extensions, Cross-Platform Architecture, Design System
**Purpose:** Codex, Fable and human reviewers tarafından repository gerçekliğiyle karşılaştırılacak ürün ve tasarım yönü
**Principle:** Bu doküman repository implementasyonunun source-of-truth'u değildir. Ürün vizyonunu ve değerlendirilmesi gereken tasarım/mimari kararlarını tanımlar.

---

# 1. Executive Summary

Deckent yalnızca bir agent orchestration CLI veya multi-agent framework olarak konumlandırılmamalıdır.

Hedef ürün modeli:

> **Deckent is an extensible agentic computing environment where models, agents, tools, MCP servers and workflows operate through one controlled runtime.**

Kullanıcı açısından daha basit ürün vaadi:

> **Bring your models. Connect your tools. Build your agents.**

Deckent'in mevcut marka prensibi:

> **One mind. Many hands.**

Ürünün temel yapısı tek runtime ve birden fazla istemci üzerine kurulmalıdır:

* Desktop App
* CLI
* Terminal/TUI
* Web Console — gelecekte
* IDE extensions — gelecekte
* SDK/API
* MCP Server
* MCP Client

Ana mimari prensip:

> **Desktop Deckent değildir. Terminal Deckent değildir. Her ikisi de aynı Deckent Runtime'ın istemcileridir.**

Desktop veya terminal kapanması run state'ini, orchestration state'ini veya uzun süren execution'ı bozmayacak şekilde runtime bağımsızlaştırılmalıdır.

---

# 2. Product Positioning

Deckent aşağıdaki kategorilerden herhangi birine indirgenmemelidir:

* ChatGPT clone
* coding assistant
* workflow builder
* generic agent dashboard
* multi-agent wrapper
* yalnızca MCP client
* yalnızca MCP server

Deckent'in hedef kategorisi daha geniştir:

* Agent Runtime
* Agentic Infrastructure
* Agentic Workbench
* Agent Operating Layer
* Agentic Computing Environment
* Execution & Governance Surface

Deckent'in farklılaştırıcı değerleri:

1. Heterojen model/provider çalıştırma
2. Multi-agent orchestration
3. Worker execution
4. Skill ve tool sistemi
5. MCP server + MCP client
6. Verification
7. Checkpoint/resume
8. Cost/token observability
9. Policy/governance
10. Human intervention
11. Extensible capabilities
12. Terminal + Desktop aynı runtime üzerinde çalışma

Deckent UI'ın temel yaklaşımı:

> **AI'ın ne söylediğini değil, sistemin ne yaptığını göstermelidir.**

Chat önemli bir giriş noktasıdır ancak ürünün tamamı değildir.

---

# 3. Primary Product Model

Deckent kullanıcı deneyimi aşağıdaki gelişim çizgisini desteklemelidir:

```text
Chat
  ↓
Agent
  ↓
Orchestrated Run
  ↓
Autonomous Workflow
```

Buna **Progressive Agency** denir.

Aynı zamanda kullanıcı karmaşıklığı aşamalı olarak görmelidir:

```text
First-time User
    ↓
Solo User
    ↓
Power User / Engineer
    ↓
Team
    ↓
Platform Operator
    ↓
Enterprise Administrator
```

Bunun için ayrı ürün fork'ları oluşturmak yerine **progressive disclosure** kullanılmalıdır.

---

# 4. Golden Workflow

Desktop UX tasarımının ilk referans senaryosu Home Dashboard olmamalıdır.

İlk olarak aşağıdaki Golden Workflow kusursuzlaştırılmalıdır:

```text
Launch Deckent
      ↓
Connect Provider
      ↓
Start Conversation
      ↓
Attach Repository / Files / Context
      ↓
Chat identifies larger task
      ↓
Convert conversation into Agent Run
      ↓
Deckent plans execution
      ↓
Workers execute
      ↓
User observes live execution
      ↓
Approval may be requested
      ↓
Verifier validates
      ↓
Result returns to conversation
      ↓
Run remains inspectable and resumable
```

Bu workflow Deckent'in aşağıdaki temel yeteneklerini aynı UX içinde kanıtlamalıdır:

* Chat
* Context
* Providers
* Models
* Agents
* Workers
* Skills
* Tools
* MCP
* Planning
* Execution
* Approval
* Verification
* Cost
* Tokens
* Logs
* Checkpoints
* Resume
* Result

---

# 5. System Architecture Direction

Önerilen mantıksal yapı:

```text
┌──────────────────────────────────────────────────────┐
│                  DECKENT CLIENTS                     │
│                                                      │
│ Desktop       CLI/TUI       Web       SDK / IDE     │
└────────┬──────────┬───────────┬────────────┬─────────┘
         │          │           │            │
         └──────────┴───────────┴────────────┘
                         │
                 Deckent Protocol
                         │
                ┌────────▼─────────┐
                │    deckentd      │
                │ Deckent Daemon   │
                └────────┬─────────┘
                         │
          ┌──────────────▼────────────────┐
          │        Deckent Runtime        │
          │                               │
          │ Orchestrator                  │
          │ Workers                       │
          │ Model Router                  │
          │ MCP Host                      │
          │ MCP Server                    │
          │ Skills                        │
          │ Tools                         │
          │ Policies                      │
          │ Secrets                       │
          │ Memory                        │
          │ Verification                  │
          │ Checkpoints                   │
          │ Run State                     │
          └───────────────────────────────┘
```

Ana prensip:

> Runtime state herhangi bir UI process'ine ait olmamalıdır.

Bu sayede:

* terminalden run başlatılabilir,
* desktop üzerinden inspect edilebilir,
* desktop üzerinden pause yapılabilir,
* CLI üzerinden resume edilebilir,
* başka client'lar aynı run'a bağlanabilir.

Örnek:

```bash
deckent run security-audit
deckent inspect run_7F21
deckent pause run_7F21
deckent resume run_7F21
```

Desktop aynı `run_7F21` kimliğini canlı olarak göstermelidir.

---

# 6. Electron vs Tauri 2 Decision

## 6.1 Current Direction

Deckent Desktop için mevcut Electron yatırımının korunması yönünde güçlü bir tercih vardır.

Bu karar kesin mimari doğruluk olarak değil, repository gerçekliği doğrulandıktan sonra uygulanacak çalışma yönü olarak kabul edilmelidir.

Öneri:

> **Electron'da kal. Runtime'ı Electron'dan ayır. Desktop shell'i replaceable hale getir.**

---

## 6.2 Electron Advantages for Deckent

Deckent'in mevcut teknoloji ekseni Node.js / TypeScript ağırlıklıysa Electron aşağıdaki avantajlara sahiptir:

* Node ecosystem ile doğal entegrasyon
* npm paketlerini doğrudan kullanabilme
* filesystem/process/shell entegrasyonlarının kolaylığı
* terminal emulation
* local CLI process yönetimi
* streaming
* MCP süreçleri
* provider CLI oturumları
* extensions
* Git entegrasyonları
* tek Chromium motoru sayesinde cross-platform rendering determinism
* mevcut React/TypeScript yatırımının doğrudan korunması
* düşük migration maliyeti

Önerilen Electron yapısı:

```text
React Renderer
      │
      │ typed IPC
      ▼
Electron Main
      │
      ▼
Deckent Protocol Client
      │
      ▼
deckentd
```

Electron Main, Deckent Runtime olmamalıdır.

---

## 6.3 Tauri 2 Advantages

Tauri'nin değerlendirilmesi gereken güçlü yanları:

* daha küçük desktop shell
* sistem WebView kullanımı
* daha düşük potansiyel memory footprint
* Rust tabanlı native boundary
* capability/permission modeli
* native shell olarak temiz mimari
* güvenlik yüzeyinin kontrollü tasarlanabilmesi

---

## 6.4 Tauri 2 Costs for Deckent

Deckent Node/TypeScript runtime'ını koruyacaksa Tauri kullanımı şu yapıya dönüşebilir:

```text
React
  ↓
Tauri IPC
  ↓
Rust
  ↓
Node sidecar / Deckent daemon
```

Bu durumda aşağıdaki yeni operasyonel yüzeyler oluşabilir:

* Rust boundary
* Node sidecar lifecycle
* IPC
* packaging
* process recovery
* crash recovery
* version compatibility
* platform-specific testing

Ayrıca platform WebView motorları farklılaşır:

* Windows → WebView2
* macOS → WKWebView
* Linux → WebKitGTK

Deckent'in yoğun UI ihtiyaçlarında:

* terminal
* graph
* canvas
* large logs
* dockable panels
* code views
* syntax highlighting
* virtualized lists
* theme customization

platformlar arası rendering ve davranış farkları daha fazla QA gerektirebilir.

---

## 6.5 Recommended Decision Process

Repository analizinden sonra gerçek ölçüm yapılmalıdır:

```text
Electron

startup
idle RAM
active run RAM
installer size
cold launch
terminal performance
large log rendering
graph rendering
CPU
crash behavior


Tauri prototype

same metrics
```

Migration ancak aşağıdaki şartlarda düşünülmelidir:

1. Runtime UI'dan tamamen ayrılmışsa.
2. Tauri'nin kazancı ölçülebilir durumdaysa.
3. Migration maliyeti kabul edilebilir düzeydeyse.
4. Tauri performans veya güvenlik hedeflerine somut katkı sağlıyorsa.
5. Electron mevcut ürün velocity'sini önemli ölçüde düşürüyorsa.

---

# 7. Cross-Platform Strategy

Hedef platformlar:

```text
Windows
macOS
Linux
```

Deckent'in cross-platform davranışı UI framework'üne bırakılmamalıdır.

Core içinde platform abstraction uygulanmalıdır.

Örnek:

```ts
interface PlatformAdapter {
  filesystem: FileSystemAdapter;
  shell: ShellAdapter;
  process: ProcessAdapter;
  paths: PathAdapter;
  keychain: SecretStore;
  notifications: NotificationAdapter;
}
```

Önerilen yapı:

```text
platform/
├── windows/
├── macos/
└── linux/
```

Amaç:

* platform condition'larının codebase'e dağılmasını engellemek,
* test edilebilir adapter yapısı oluşturmak,
* farklı client'ların aynı platform servislerini kullanabilmesini sağlamak.

---

# 8. Desktop Product Structure

Önerilen ana bilgi mimarisi:

```text
Deckent
├── Chat
├── Workspaces
├── Runs
├── Agents
├── Skills
├── Tools
├── MCP
├── Files / Context
├── Memory
├── Automations
├── Models & Providers
├── Infrastructure
├── Governance
└── Settings
```

Buradaki tüm alanların ilk kullanıcıya aynı anda gösterilmesi zorunlu değildir.

Navigation kullanıcı seviyesi ve aktif capability'lere göre açılmalıdır.

---

# 9. Chat as Entry Surface

Chat Deckent'in en düşük öğrenme maliyetli giriş noktasıdır.

Ama ürün Chat ile sınırlı değildir.

İlk ekran örneği:

```text
┌─────────────────────────────────────────────────────┐
│ Deckent                              Workspace ▾    │
├────────────┬────────────────────────────────────────┤
│            │                                        │
│ New Chat   │       What do you want to do?          │
│            │                                        │
│ Chats      │  ┌──────────────────────────────────┐  │
│ Runs       │  │ Ask, build, analyze...           │  │
│ Projects   │  └──────────────────────────────────┘  │
│ Agents     │                                        │
│ Skills     │  Claude Sonnet ▾   Auto ▾   Context + │
│ MCP        │                                        │
│            │  Chat   Agent   Orchestrate            │
└────────────┴────────────────────────────────────────┘
```

---

# 10. Conversation to Run

Chat conversation büyük bir göreve dönüştüğünde sistem aşağıdaki geçişi sağlamalıdır:

```text
Conversation
    ↓
Plan
    ↓
Agent Run
    ↓
Worker Execution
    ↓
Verification
    ↓
Result
```

Kullanıcı agent mode'a geçtiğinde mümkünse plan ön izlemesi görebilmelidir:

```text
PLAN

1. Discover relevant files
2. Inspect architecture
3. Analyze risks
4. Run targeted validation
5. Produce evidence-backed result

Workers: 4
Estimated budget: ...
Policy: ...
Verifier: ...

[Start]
```

---

# 11. Run Inspector

Deckent Desktop'ın en önemli farklılaştırıcı ekranlarından biridir.

Run Inspector aşağıdakileri göstermelidir:

* execution graph
* timeline
* agents
* workers
* tools
* MCP calls
* context
* prompt/skill references
* token usage
* cost
* latency
* logs
* checkpoints
* approvals
* policy decisions
* verifier status
* final evidence

Örnek graph:

```text
User Task
   │
   ▼
Orchestrator
   ├── Research Worker
   │       └── Web / MCP
   │
   ├── Code Worker
   │       └── GitHub
   │
   └── Test Worker
           └── Shell
   │
   ▼
Verifier
   │
   ├── PASS
   ├── PARTIAL
   └── FAIL
```

Node selection ile detaylar açılmalıdır:

```text
Worker
Model
Connection
Started
Duration
Tokens
Cost
Tools
Skills
Context
Logs
Output
```

---

# 12. Provider & Connection Model

Kullanıcılar kendi provider üyeliklerini veya API erişimlerini Deckent'e bağlayabilmelidir.

Desteklenebilecek connection kategorileri:

## Subscription / CLI

* Claude
* Codex
* Gemini
* diğer CLI tabanlı provider bağlantıları

## API

* Anthropic
* OpenAI
* Google
* DeepSeek
* OpenRouter
* diğer provider API'leri

## Local

* Ollama
* vLLM
* LM Studio
* OpenAI-compatible local endpoints

---

# 13. Provider Data Model

Model abstraction doğrudan `Model` üzerinden yapılmamalıdır.

Önerilen hiyerarşi:

```text
Provider
    ↓
Connection
    ↓
Model
    ↓
Profile
```

Örnek:

```text
Provider
Anthropic

Connection
Personal Claude

Models
├── Sonnet
└── Opus
```

Aynı provider altında:

```text
Connection
Enterprise Anthropic API
```

bulunabilir.

UI gerektiğinde:

```text
Claude Sonnet
via
Enterprise API
```

gösterebilmelidir.

Bu özellikle:

* kişisel kullanım,
* team kullanım,
* enterprise kullanım,
* cost attribution,
* credential isolation

için önemlidir.

---

# 14. MCP Strategy

Deckent aynı anda:

* MCP Client
* MCP Server

olmalıdır.

## Client Mode

Deckent dış MCP server'lara bağlanabilir:

```text
GitHub
PostgreSQL
Filesystem
Slack
Jira
Notion
Browser
Docker
Kubernetes
ERP
Custom MCP
```

## Server Mode

Deckent kendi yeteneklerini dış client'lara açabilir:

```text
Agents
Skills
Tools
Workflows
Verification
Selected Context
Selected Capabilities
```

Böylece diğer MCP client'lar Deckent'i bir execution node olarak kullanabilir.

---

# 15. MCP Hub UI

Önerilen ekran:

```text
MCP

Your Servers

● GitHub
  Connected
  24 tools

● PostgreSQL Production
  Restricted

● Filesystem
  Local

● IFS ERP
  Custom

────────────────────────

Discover

GitHub
PostgreSQL
Slack
Jira
Browser
Filesystem
Docker
Kubernetes

+ Add Custom MCP
```

Custom server ekleme:

```text
Transport

○ STDIO
○ Streamable HTTP

Name
[...]

Command / URL
[...]

Authentication
[...]

[Connect]
```

---

# 16. Deckent as MCP Server

Ayrı yönetim ekranı:

```text
Deckent MCP Server

Status
● Running

Expose

☑ Agents
☑ Skills
☑ Tools
☑ Workflows
☐ Filesystem
☐ Secrets

Clients

● Claude
● VS Code
● Internal Agent
```

Expose edilen capability'ler policy tarafından sınırlandırılmalıdır.

---

# 17. Capability Model

Deckent'in extension modeli klasik plugin listesinden daha güçlü düşünülmelidir.

Kullanıcı açısından kavram:

> **Capability**

Örnek:

```text
Installed

✓ GitHub
✓ Coding
✓ Web Research
✓ PostgreSQL
✓ Docker

Available

○ Kubernetes
○ ERP
○ Salesforce
○ Browser Automation
○ Security Audit
```

Bir capability şunları içerebilir:

```text
Capability
├── MCP servers
├── tools
├── skills
├── agents
├── workflows
├── prompts
├── UI panels
└── permission declarations
```

Bu model future Deckent ecosystem için önemli adaydır.

---

# 18. Extension Architecture

Örnek manifest:

```json
{
  "id": "com.example.erp",
  "name": "ERP Integration",
  "version": "1.0.0",

  "capabilities": {
    "mcp": true,
    "skills": true,
    "agents": true,
    "ui": true
  },

  "ui": {
    "panels": [
      {
        "id": "erp-explorer",
        "location": "sidebar"
      }
    ]
  }
}
```

Extension native runtime'a doğrudan unrestricted erişim almamalıdır.

Sandbox, permission ve capability declaration sistemi uygulanmalıdır.

---

# 19. Customizable Desktop

Customization üç seviyeli olmalıdır.

## Level 1 — Appearance

* Light
* Dark
* System
* Custom Theme
* Accent
* Typography
* Code Font
* Density

Design tokens örneği:

```css
--dk-bg
--dk-surface
--dk-surface-elevated
--dk-border
--dk-text
--dk-text-muted
--dk-accent
--dk-success
--dk-warning
--dk-danger
```

Custom theme import/export desteklenebilir.

---

# 20. Level 2 — Workspace Layout

Kullanıcı workspace layout'u değiştirebilmelidir:

* dock
* split
* resize
* collapse
* tabs
* reorder
* hide
* show
* popout

Örnek:

```text
┌───────────┬─────────────────────┬────────────┐
│ Runs      │                     │ Context    │
│ Agents    │        Chat         │ Tools      │
│           │                     │            │
├───────────┴─────────────────────┴────────────┤
│ Terminal                                     │
└──────────────────────────────────────────────┘
```

Preset'ler:

* Chat
* Developer
* Research
* Operator
* Enterprise
* Custom

---

# 21. Level 3 — Extension UI

Capabilities kendi UI panellerini sağlayabilir.

Örnek:

```text
ERP Capability

Purchase Orders
Invoices
MRP
Projects
Customers
```

veya:

```text
Kubernetes

Clusters
Pods
Logs
Deployments
```

Bu yapı Deckent Desktop'ı genişletilebilir bir workbench'e dönüştürür.

---

# 22. Terminal / TUI Product Direction

Terminal Desktop'ın ikinci sınıf sürümü olmamalıdır.

Aynı runtime'ın uzman kullanım yüzü olmalıdır.

CLI örnekleri:

```bash
deckent ask "analyze this repository"

deckent run security-audit

deckent mcp add github

deckent agents list

deckent workers

deckent costs

deckent inspect run_78af

deckent pause run_78af

deckent resume run_78af

deckent chat --model claude-sonnet
```

---

# 23. TUI Direction

TUI:

```text
╭─ deckent ──────────────────────────────────────────────╮
│ Workspace: verhex             Claude Sonnet   ● Ready │
├─────────────┬──────────────────────────────────────────┤
│ Chats       │                                          │
│ Runs        │ > Analyze this repository                │
│ Agents      │                                          │
│ MCP         │ Deckent                                  │
│ Skills      │ Inspecting repository...                 │
│             │                                          │
│             │ ▸ github.search                          │
│             │ ▸ filesystem.read                        │
│             │                                          │
│             │ Code Worker running                      │
│             │                                          │
├─────────────┴──────────────────────────────────────────┤
│ ctrl+k commands | ctrl+m model | ctrl+r runs | ?     │
╰────────────────────────────────────────────────────────╯
```

TUI'da aşağıdakiler first-class olmalıdır:

* keyboard navigation
* command palette
* run tree
* live logs
* worker state
* cost
* token usage
* approvals
* inspect
* pause
* resume
* verifier state

---

# 24. Security & Secrets

Deckent şu tip secret'ları yönetebilir:

* API keys
* OAuth tokens
* CLI credentials
* MCP credentials
* GitHub credentials
* ERP credentials
* DB credentials
* cloud provider credentials

Bunlar plaintext olarak:

* config
* `.env`
* SQLite
* log

içinde tutulmamalıdır.

Önerilen Secret Broker:

```text
Deckent Secret Broker

Windows
→ native secure storage

macOS
→ Keychain

Linux
→ Secret Service / keyring
```

UI çoğunlukla gerçek secret yerine credential reference görmelidir:

```text
credential_id
```

Worker'lara mümkünse secret değeri doğrudan verilmemeli; execution sırasında broker tarafından kontrollü şekilde inject edilmelidir.

---

# 25. Permission UX

Her tool/MCP/extension capability sistemi permission declaration yapmalıdır.

Örnek:

```text
PostgreSQL Production

Requested

✓ Read database
⚠ Execute SQL
⚠ Modify database

Allow

○ Once
○ Session
○ Always
```

Riskli işlem:

```text
Worker requests

postgres.execute

Database:
ERP_PRODUCTION

Operation:
UPDATE

Risk:
HIGH

[Reject]
[Allow once]
```

Enterprise policy override:

```text
POLICY DENIED

Production databases are read-only
for autonomous workers.
```

---

# 26. User Modes

Farklı ürün fork'ları yerine UI density seviyeleri kullanılmalıdır.

## Simple

* Chat
* basic model selection
* files/context
* simple execution

## Engineer

* workers
* tools
* context
* graph
* checkpoints
* tokens
* cost
* verifier

## Operator

* infrastructure
* queues
* policies
* runtimes
* observability
* audit

Bu modlar personalization/preset olarak düşünülebilir.

---

# 27. Solo → Enterprise Growth Model

Aynı ürün doğal olarak büyümelidir:

```text
DAY 1

Chat
```

```text
SOLO

Chat
+ Files
+ GitHub
+ Local Tools
```

```text
POWER USER

Agents
+ Skills
+ MCP
+ Workflows
```

```text
TEAM

Shared Workspaces
+ Shared Agents
+ Shared MCP
+ Roles
```

```text
ENTERPRISE

Governance
+ SSO
+ Audit
+ Policy
+ Cost Control
+ Remote Runtime
+ Private Models
```

---

# 28. Enterprise UX

Kurumsal ürün tarafında aşağıdakiler consideration scope'a alınmalıdır:

* RBAC
* SSO
* SCIM
* organization structure
* teams
* workspaces
* shared agents
* shared skills
* shared MCP connections
* secrets
* policy engine
* allow/deny
* approval gates
* audit trail
* provider allowlist
* model allowlist
* cost center
* token budgets
* quotas
* environment isolation
* local/remote runtimes
* compliance
* data residency

Bu özelliklerin tamamının ilk sürüme girmesi gerektiği varsayılmamalıdır.

---

# 29. Deckent Design Philosophy

Deckent'in görsel karakteri aşağıdaki alanlardan uzak durmalıdır:

* generic AI gradient UI
* cyberpunk hacker aesthetic
* excessive neon
* generic SaaS dashboard
* ERP grey admin interface
* ChatGPT clone

Hedef karakter:

* technical
* calm
* precise
* powerful
* spatial
* instrument-like
* dense when necessary
* restrained when simple

Temel tasarım metaforu:

> **Dashboard değil, instrument panel.**

Dashboard gözlem için vardır.

Instrument:

* observe
* inspect
* control
* intervene
* verify
* resume
* delegate

işlevlerini destekler.

---

# 30. Design References

İlham alınabilecek ancak kopyalanmaması gereken ürün karakterleri:

* Linear
* Raycast
* VS Code
* Figma
* Grafana
* GitKraken
* Arc
* Ableton
* professional engineering tools
* control systems

Amaç bunların birleşimi değil, Deckent'e özgü bir operating surface oluşturmaktır.

---

# 31. Deckent Design Constitution

Repository'de uzun vadeli tasarım anayasası tutulmalıdır.

Önerilen prensipler:

## Chat is the entrance, not the product.

Chat düşük bariyerli başlangıç yüzeyidir.

## Complexity is earned.

Kullanıcı yalnızca ihtiyaç duyduğu karmaşıklığı görmelidir.

## Execution must be observable.

Agent çalışması görünmez background magic olmamalıdır.

## Autonomy must remain controllable.

Pause, inspect, cancel, approve, resume gibi müdahale noktaları bulunmalıdır.

## Every action must be attributable.

Hangi agent, model, tool ve policy tarafından hangi işlemin yapıldığı izlenebilmelidir.

## Power without visual chaos.

Yüksek bilgi yoğunluğu düzensizlik anlamına gelmemelidir.

## Same runtime, many surfaces.

Desktop, CLI, TUI ve gelecekteki client'lar aynı state'i kullanmalıdır.

---

# 32. Agentic UX States

Normal SaaS component state'leri Deckent için yeterli değildir.

Aşağıdaki execution state'leri tanımlanmalıdır:

```text
idle
thinking
planning
queued
executing
delegating
waiting
blocked
approval-required
verifying
checkpointed
paused
resumable
failed
cancelled
completed
partially-completed
```

State'ler yalnız renk değişimi ile ifade edilmemelidir.

Metin, ikon, hierarchy ve gerektiğinde neden bilgisi sağlanmalıdır.

---

# 33. Agentic Component System

Standart UI primitive'lerine ek olarak Deckent-specific component library oluşturulmalıdır.

## Generic primitives

* Button
* IconButton
* Input
* Select
* Tabs
* Tooltip
* Menu
* Popover
* Dialog
* Drawer
* Table
* Tree
* Badge

## Deckent components

* RunCard
* RunGraph
* WorkerCard
* WorkerNode
* AgentNode
* ToolCall
* MCPCall
* ApprovalGate
* PolicyDecision
* VerificationBadge
* TokenMeter
* CostMeter
* ContextMeter
* ExecutionTimeline
* CheckpointCard
* ProviderConnection
* MCPConnection
* SkillCard
* AgentCard
* TerminalPane
* ArtifactViewer
* LogStream
* EvidencePanel

Bu component'ler Deckent Agentic Design System'in ana farklılaştırıcıları olacaktır.

---

# 34. Design Skill Stack

Deckent'i tasarlayan AI agent'ların tek generic frontend skill ile çalışması önerilmez.

Önerilen skill set:

## 34.1 `deckent-product-design`

Kapsam:

* product philosophy
* personas
* solo → enterprise
* complexity model
* primary journeys
* information architecture
* capability model

## 34.2 `deckent-agentic-ux`

Kapsam:

* runs
* agents
* workers
* tool calls
* MCP calls
* approvals
* verification
* autonomy
* failure
* pause
* resume
* checkpoints
* human intervention

## 34.3 `deckent-visual-language`

Kapsam:

* typography
* colors
* density
* spacing
* hierarchy
* motion
* iconography
* branding
* states

## 34.4 `deckent-design-system`

Kapsam:

* design tokens
* primitives
* agentic components
* component rules
* variants
* accessibility

## 34.5 `deckent-workspace-design`

Kapsam:

* docking
* layout
* tabs
* split panes
* resizing
* sidebars
* inspectors
* custom workspaces
* layouts

## 34.6 `deckent-terminal-design`

Kapsam:

* CLI ergonomics
* TUI hierarchy
* keyboard interaction
* logs
* command palette
* worker tree
* run inspector

## 34.7 `deckent-enterprise-ux`

Kapsam:

* governance
* RBAC
* policies
* audit
* organization
* approvals
* secrets
* cost controls
* environments

## 34.8 `deckent-design-critic`

Bağımsız verifier rolündedir.

Görev:

* design constitution ihlallerini bulmak
* generic AI UI eğilimlerini reddetmek
* unnecessary complexity bulmak
* missing states tespit etmek
* accessibility kontrol etmek
* information hierarchy kontrol etmek
* implementation feasibility kontrol etmek
* Desktop/TUI parity sorunlarını bulmak

Sonuç formatı:

```text
PASS
REVISE
NO-GO
```

ve evidence-backed findings.

---

# 35. Design Repository Structure

Önerilen yapı:

```text
docs/
└── design/
    ├── CONSTITUTION.md
    ├── PRODUCT-MODEL.md
    ├── GOLDEN-WORKFLOW.md
    ├── UX-PRINCIPLES.md
    ├── INFORMATION-ARCHITECTURE.md
    ├── VISUAL-LANGUAGE.md
    ├── AGENTIC-STATES.md
    ├── INTERACTION-PATTERNS.md
    ├── TERMINAL-DESIGN.md
    ├── ENTERPRISE-UX.md
    ├── DESIGN-TOKENS.json
    │
    ├── components/
    │   ├── run-card.md
    │   ├── worker-node.md
    │   ├── tool-call.md
    │   ├── approval-gate.md
    │   └── ...
    │
    ├── layouts/
    │   ├── chat.md
    │   ├── developer.md
    │   ├── research.md
    │   ├── operator.md
    │   └── enterprise.md
    │
    └── references/
```

Gerçek repo yapısına göre konum Codex/Fable tarafından düzeltilmelidir.

---

# 36. AI-Assisted Product Design Workflow

Claude Design veya benzeri visual design agents doğrudan tek prompt ile production UI üretmek için kullanılmamalıdır.

Önerilen süreç:

```text
Product Constitution
        ↓
Design Skills
        ↓
Repository Reality
        ↓
Reference Board
        ↓
Visual Concept Generation
        ↓
Design Critic
        ↓
Direction Selection
        ↓
Design Tokens
        ↓
Core Components
        ↓
Golden Workflow Prototype
        ↓
Implementation
        ↓
Screenshot / Interaction Review
        ↓
Critic
        ↓
Revision
```

Bu süreç bir kere değil iteratif çalışmalıdır.

---

# 37. Codex + Fable Repository Analysis Workflow

Bu dokümanın repository'ye doğrudan uygulanması yasak kabul edilmelidir.

İlk olarak Codex ve Fable bağımsız analiz yapmalıdır.

Amaç:

> Tasarım vizyonunu repo gerçekliğiyle reconcile etmek.

---

# 38. Phase 1 — Repository Discovery

Her iki agent da bağımsız olarak aşağıdakileri çıkarmalıdır:

```text
Current runtime architecture
Desktop technology
CLI architecture
TUI implementation
MCP architecture
Provider abstractions
Worker model
Agent model
Skill system
Plugin system
Settings
Secrets
Persistence
Run state
Checkpoint state
IPC
Daemon/process model
Web/API interfaces
Tests
Build system
Packaging
Platform-specific code
```

Çıktı yalnız dosya listesi olmamalıdır.

Her alan için:

```text
Current state
Evidence path
Key abstractions
Constraints
Design implication
```

yazılmalıdır.

---

# 39. Phase 2 — Current Architecture Map

Agent'lar mevcut sistemi aşağıdaki formatta çıkarmalıdır:

```text
Component
Responsibility
Process
State ownership
Public API
Dependencies
Platform coupling
UI coupling
Risk
```

Ana soru:

> Desktop kapatıldığında Deckent run devam edebilir mi?

Eğer cevap hayır ise bunun nedenleri bulunmalıdır.

---

# 40. Phase 3 — Gap Analysis

Bu dokümandaki hedefler mevcut implementasyonla karşılaştırılmalıdır.

Örnek:

```text
Target:
Desktop is a client of runtime.

Current:
Electron main owns orchestration.

Gap:
Runtime extraction required.

Impact:
HIGH
```

Gap kategorileri:

```text
ALREADY_SUPPORTED
PARTIAL
MISSING
CONFLICTING
UNKNOWN
```

---

# 41. Phase 4 — Electron/Tauri ADR

Codex ve Fable repository gerçekliğine göre ayrı ayrı karar üretmelidir.

Değerlendirilecek sorular:

1. Desktop şu anda Electron'ın hangi API'lerine bağımlı?
2. Node-specific dependency sayısı nedir?
3. Runtime Electron Main'e ne kadar bağlı?
4. Tauri migration hangi dependency'leri etkiler?
5. Kaç native module vardır?
6. Terminal nasıl embed edilmektedir?
7. Auto-update nasıl çalışmaktadır?
8. Packaging nasıl çalışmaktadır?
9. Platform-specific kod ne kadardır?
10. Memory/startup problemi gerçekten var mı?

Karar seçenekleri:

```text
KEEP_ELECTRON
KEEP_ELECTRON_AND_DECOUPLE_RUNTIME
PROTOTYPE_TAURI
MIGRATE_TO_TAURI
INSUFFICIENT_EVIDENCE
```

Şu anki tasarım yönü:

```text
KEEP_ELECTRON_AND_DECOUPLE_RUNTIME
```

ancak repository analizi bunu reddedebilir.

---

# 42. Phase 5 — Product Surface Inventory

Mevcut UI ekranları ve terminal yüzeyi inventory yapılmalıdır.

Her surface için:

```text
Surface
Current purpose
Actual users
Required data
Runtime dependency
Overlap
Missing capabilities
Design debt
```

Özellikle:

* chat
* run
* worker
* MCP
* providers
* skills
* settings
* terminal
* logs

incelenmelidir.

---

# 43. Phase 6 — Golden Workflow Prototype

Repository gerçekliği anlaşıldıktan sonra yalnızca Golden Workflow uygulanmalıdır.

İlk prototype kapsamı:

```text
Connect Provider
→ Chat
→ Add Context
→ Convert to Run
→ Plan
→ Start
→ Observe Workers
→ Approval
→ Verify
→ Result
→ Inspect Run
```

Home dashboard, marketplace, enterprise administration gibi alanlar önce yapılmamalıdır.

---

# 44. Phase 7 — Design System v0

Golden Workflow sırasında tekrar eden pattern'lerden component sistemi çıkarılmalıdır.

Önce component üretip sonra UX'e zorlamak yerine:

```text
Workflow
→ repeated patterns
→ components
→ design system
```

yaklaşımı kullanılmalıdır.

Design System v0 minimum:

```text
tokens
typography
spacing
buttons
inputs
panels
navigation
run status
worker state
tool calls
approval
verification
logs
terminal
```

---

# 45. Phase 8 — Visual Direction Exploration

Claude Design veya başka bir design agent ile minimum üç farklı direction oluşturulmalıdır.

Öneri:

## Direction A — Instrument

Yoğun, profesyonel, technical control surface.

## Direction B — Spatial

Agent execution graph ve workspace spatial composition merkezli.

## Direction C — Minimal Progressive

İlk kullanım son derece sade; complexity context'e göre açılıyor.

Tüm direction'lar aynı Golden Workflow'u çözmelidir.

Ama yalnız renk değiştiren varyantlar olmamalıdır.

---

# 46. Phase 9 — Design Critic

Her direction bağımsız critic tarafından değerlendirilmelidir.

Score alanları:

```text
Product fit
Deckent identity
Complexity control
Agent observability
Human control
Terminal parity
Extensibility
Enterprise scalability
Accessibility
Information density
Implementation feasibility
Performance feasibility
```

Generic SaaS görünümü ciddi negatif puan olmalıdır.

---

# 47. Phase 10 — Implementation Validation

Seçilen direction production componentlere aktarılırken screenshot-driven QA uygulanmalıdır.

Döngü:

```text
Implement
↓
Run
↓
Capture
↓
Compare
↓
Critic
↓
Fix
```

Yalnız source code review görsel uygulama kalitesini doğrulamak için yeterli kabul edilmemelidir.

---

# 48. Open Questions

Repository analizi sırasında aşağıdaki konular kesin cevaplanmalıdır:

## Architecture

* Deckent daemon mevcut mu?
* Runtime state nerede tutuluyor?
* Desktop kapatılırsa run devam ediyor mu?
* CLI ve Desktop aynı execution path'i kullanıyor mu?
* UI-specific duplicate business logic var mı?

## Providers

* provider abstraction mevcut mu?
* subscriptions ile API connections ayrılmış mı?
* credential ownership nasıl modelleniyor?
* model → connection routing nasıl çalışıyor?

## MCP

* MCP client implementation sınırı nedir?
* MCP server implementation sınırı nedir?
* authorization nasıl yapılıyor?
* per-tool permissions var mı?
* multiple MCP connections nasıl yönetiliyor?

## Extensions

* mevcut plugin loader hangi capability'leri destekliyor?
* UI extensions mümkün mü?
* plugin sandbox var mı?
* permission declaration var mı?

## Desktop

* Electron main ne iş yapıyor?
* preload sınırı nasıl?
* renderer hangi yetkilere sahip?
* context isolation/sandbox politikası nedir?
* terminal hangi teknolojiyle çalışıyor?

## State

* runs nasıl persist ediliyor?
* conversation ile run ilişkisi var mı?
* checkpoint lifecycle nasıl?
* resume cross-process çalışıyor mu?

## Security

* secrets nerede tutuluyor?
* logs'a secret düşme riski var mı?
* tool permission modeli mevcut mu?
* policy engine mevcut mu?
* local vs enterprise security boundary nasıl?

---

# 49. Non-Goals

Bu doküman aşağıdaki konularda doğrudan implementation talimatı değildir:

* tüm UI'ı yeniden yazmak
* Electron'dan hemen Tauri'ye geçmek
* mevcut plugin sistemini kaldırmak
* tüm enterprise feature'ları hemen yapmak
* tüm navigasyonu yeniden tasarlamak
* tüm agent architecture'ı değiştirmek

Önce mevcut sistem doğrulanmalıdır.

---

# 50. Decision Ledger

## DECISION-01

**Deckent Desktop ayrı bir runtime olmayacak.**

Status: Proposed / Strong Direction

---

## DECISION-02

**Terminal ve Desktop aynı run state ve execution modelini kullanacak.**

Status: Proposed / Strong Direction

---

## DECISION-03

**Chat ürünün giriş yüzeyi olacak ancak ürün Chat'e indirgenmeyecek.**

Status: Accepted Product Direction

---

## DECISION-04

**Agent execution kullanıcı tarafından inspect edilebilir olacak.**

Status: Accepted Product Principle

---

## DECISION-05

**Progressive disclosure kullanılacak.**

Status: Accepted Product Principle

---

## DECISION-06

**Kullanıcı kendi provider subscription/API/local modellerini bağlayabilecek.**

Status: Accepted Product Direction

---

## DECISION-07

**Provider → Connection → Model ayrımı uygulanması değerlendirilecek.**

Status: Proposed Architecture

---

## DECISION-08

**Deckent hem MCP Client hem MCP Server olarak first-class UI desteği alacak.**

Status: Accepted Product Direction

---

## DECISION-09

**Capabilities Deckent extension ecosystem için üst seviye ürün kavramı olarak değerlendirilecek.**

Status: Proposed Product Architecture

---

## DECISION-10

**UI theme'in ötesinde workspace customization destekleyecek.**

Status: Accepted Product Direction

---

## DECISION-11

**Extension'lar gelecekte kendi UI panellerini sağlayabilecek.**

Status: Proposed Architecture

---

## DECISION-12

**Secrets native secure storage / secret broker yaklaşımıyla yönetilecek.**

Status: Strong Security Direction

---

## DECISION-13

**Tool ve MCP erişimleri explicit permission/policy modeline tabi olacak.**

Status: Strong Security Direction

---

## DECISION-14

**Electron şimdilik korunacak.**

Status: Working Decision

Rationale:

* mevcut yatırım,
* Node/TypeScript uyumu,
* rendering determinism,
* daha düşük migration maliyeti.

Condition:

Runtime'ın Electron'dan ayrılması önceliklidir.

---

## DECISION-15

**Tauri migration kararının benchmark ve repository evidence olmadan alınmaması.**

Status: Accepted Decision Principle

---

## DECISION-16

**Deckent Design Constitution oluşturulacak.**

Status: Accepted Design Direction

---

## DECISION-17

**Generic frontend skill yerine Deckent-specific design skill stack oluşturulacak.**

Status: Accepted Design Direction

---

## DECISION-18

**Independent design critic kullanılacak.**

Status: Accepted Design Direction

---

## DECISION-19

**İlk tasarım hedefi dashboard değil Golden Workflow olacak.**

Status: Accepted Design Direction

---

# 51. Recommended Immediate Repository Tasks

Codex ve Fable ilk turda implementation yapmamalıdır.

İlk görev:

```text
READ
ANALYZE
MAP
COMPARE
REPORT
```

Beklenen çıktılar:

```text
01-current-architecture.md
02-desktop-runtime-boundaries.md
03-electron-tauri-assessment.md
04-product-surface-inventory.md
05-mcp-provider-extension-map.md
06-security-boundaries.md
07-design-gap-analysis.md
08-recommended-sequence.md
```

Daha sonra iki agent sonucu adversarial şekilde karşılaştırılmalıdır.

---

# 52. Suggested Execution Sequence

Önerilen sıra:

```text
M0
Repository Reality Map

M1
Runtime / Desktop Boundary

M2
Protocol & Shared State Model

M3
Golden Workflow UX

M4
Provider Connections

M5
MCP Hub

M6
Run Inspector

M7
Design System v0

M8
Workspace Customization

M9
Capability / Extension Model

M10
Team / Enterprise UX

M11
Optional Tauri Benchmark
```

Bu sıralama repository dependency'lerine göre değiştirilebilir.

---

# 53. Success Criteria

Bu ürün yönü başarılı kabul edildiğinde Deckent şunları sağlayabilmelidir:

```text
User opens Deckent
↓
Connects their model/provider
↓
Chats naturally
↓
Adds tools/context/MCP
↓
Escalates task into agent execution
↓
Observes workers
↓
Controls autonomy
↓
Reviews verification
↓
Continues same run from terminal or desktop
↓
Expands Deckent with capabilities
```

Solo kullanıcı bunun yalnızca ilk birkaç adımını kullanabilir.

Enterprise müşterisi bütün sistemi kullanabilir.

İkisi de aynı Deckent'i kullanır.

---

# 54. North Star

Deckent'in tasarım hedefi yalnızca güzel bir desktop application üretmek değildir.

Hedef:

> **Models, agents, tools, people and enterprise systems için ortak, kontrollü ve genişletilebilir bir çalışma ortamı oluşturmak.**

Başka bir ifadeyle:

```text
Not an AI app.

An environment where AI work happens.
```

Deckent'in UI, terminal ve runtime mimarisi bu hedefi desteklemelidir.

---

# 55. Final Working Principle

Repository gerçekliği bu dokümandan üstündür.

Codex ve Fable aşağıdaki sırayla hareket etmelidir:

```text
Evidence
→ Architecture
→ Product Constraints
→ Design
→ Implementation
```

Asla:

```text
Desired UI
→ force repository to fit it
```

şeklinde ilerlenmemelidir.

Bu doküman bir implementation specification değil, **product and design north-star specification** olarak kullanılmalıdır.
