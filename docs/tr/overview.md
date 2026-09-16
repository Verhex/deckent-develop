# Genel bakış

## Product-user perspektifi

### Deckent nedir?

Deckent, provider-neutral ve local-first bir Agent OS ile AI runtime ecosystem ürünüdür. Product layer; agentic execution, governance, memory, learning, provider selection ve birden çok control surface'i tek authority model altında birleştirir. [Kanıt: `.deckent/workspace/IDENTITY.md:2-5`]

Trinity yapısı **Assistant · Worker · Platform**'dur: bireysel kullanıcıdan multi-tenant enterprise ortama kadar tek kernel, tek policy system, tek evidence chain ve tek learning loop kullanılır. [Kanıt: `.deckent/workspace/IDENTITY.md:5-7`]

- **Assistant**, intent'i governed ve incelenebilir işe dönüştürür.
- **Worker**, admitted work'ü scope, provider, budget ve evidence sınırları içinde yürütür.
- **Platform**, durable orchestration, memory, approvals, routing, recovery, audit ve adapter'ları sağlar.

Bunlar identity contract'tan türeyen product role'lerdir; üç bağımsız runtime değildir. [Kanıt: `.deckent/workspace/IDENTITY.md:4-10`]

### Product direction

Terminal ve Desktop primary control surface'lerdir. API, CLI, MCP, autonomous/process girişleri ve connectors aynı application-service authority üzerindeki adapter'lardır. Dashboard bir observability projection'dır; execution engine veya state authority değildir. [Kanıt: `.deckent/workspace/IDENTITY.md:8-9,16`]

Execution authority vocabulary şöyledir:

`Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`

Bu zincir zorunlu product model'dir. Güncel kaynak, zincirin bazı halkaları için durable model'ler içerir; ancak tek ve normalize edilmiş uçtan uca type graph henüz sunmaz. Bu implementation gap fark raporunda kayıtlıdır. [Kanıt: `.deckent/workspace/IDENTITY.md:7`; `src/orchestra/autonomous/mission-store/mission-types.ts:12-19,76-104,134-147`; `src/core/run-flow-contract.ts:37-88`; `src/core/sprint-types.ts:62-90`; `src/core/task-lineage.ts:218-254`; `src/core/work-model.ts:1-12`]

Provider ve model seçimi effective configuration, runtime model registry ve live authority evidence birlikte değerlendirilerek çözülür. Hiçbir provider Deckent product identity'sinin parçası değildir. [Kanıt: `.deckent/workspace/IDENTITY.md:10`; `src/core/config.ts:1978-2021`; `src/core/model-registry.ts`]

### Üç Immutable Law

1. **Dual Lens + Scale.** Her karar aynı anda Deckent orchestration kalitesine ve end-user experience'a hizmet eder; ölçek tek kişiden milyonlarca kullanıcı, proje, tenant ve environment'a uzanır. [Kanıt: `AGENTS.md:13-20`]
2. **Every Environment.** Design daha baştan cross-platform, cross-language, multi-tenant ve million-scale kurulur; unsupported platform açıkça fail eder. [Kanıt: `AGENTS.md:21-27`]
3. **Never MVP.** İş expert-grade ve enterprise-grade olur; bilerek geçici veya eksik product design completion sayılmaz. [Kanıt: `AGENTS.md:28-35`]

### Bu yeniden-yazımda doğrulanan runtime baseline

Repository; TypeScript ESM, Node.js 24 veya üstü, `tsc` ve Vitest bildirir. [Kanıt: `.deckent/workspace/IDENTITY.md:11-15`; `package.json` içindeki `type`, `engines` ve scripts]

Owner `npm run build:all` çalıştırdıktan sonra `node dist/cli/entry.js --version-json`; `0.100.0`, Node `v24.15.0` ve Linux döndürdü. Bu sonuç incelenen binary identity'yi kanıtlar; ürünün yalnız bu host'u desteklediği anlamına gelmez. [Kanıt: command output, 2026-08-14 (0.100.0 rebaseline re-observation)]

Bildirilen platform matrix; macOS, Linux, Windows native ve WSL2'dir. [Kanıt: `.deckent/workspace/IDENTITY.md:15`]

## Dogfood / repository gerçeği

| Alan | Durum | Current evidence |
|---|---|---|
| Identity ve Trinity | ✅ canlı | Repository identity provider-neutral Agent OS, Trinity, surface, platform matrix ve authority chain'i tanımlar. [Kanıt: `.deckent/workspace/IDENTITY.md:2-18`] |
| Built CLI identity | ✅ canlı | Owner build sonrasında gerçek `--version-json`; `0.100.0`, Node `v24.15.0`, Linux döndürdü. |
| Unified Goal→Operation implementation | ⚠️ kısmi | Durable contract'lar vardır fakat normalized work-model consumer adoption ve canonical Operation OQ-05/OQ-06'dır. |
| Primary Terminal/Desktop yönü | ⚠️ kısmi | Native chat/REPL, web-terminal API ve desktop source surface'leri vardır; bu audit interactive/platform matrix'i çalıştırmadı. [Kanıt: `src/cli/commands/chat.ts`; `src/api/terminal/session-manager.ts`; `src/desktop/`] |
| Publish-grade autonomous execution | ⚠️ HOLD | Kabul edilen audit, stabilization/certification bekleyen 0/31 intervention-free end-to-end success raporlar. [Kanıt: `PAZARTESI.md:36-60`] |

Vision authoritative direction'dır; yukarıdaki status label'ları her end-to-end path certify olmuş gibi okunmasını önler. Yönün kendisi — konumlandırma, kitle aralığı, moat, yüzey doktrini, non-goal'ler ve onu yanlışlayacak sinyaller — [Vizyon](./vision.md) dosyasında yazılıdır.
