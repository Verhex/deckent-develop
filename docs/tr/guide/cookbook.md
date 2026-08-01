# Cookbook

Aşağıdaki her command form 2026-08-01'de real binary help tree ile doğrulandı. Explicit “run evidence” denilen command'lar ayrıca action-run edildi. Mutating recipe'ler procedure'dür; audit'in bunları çalıştırdığı iddiası değildir. [Kanıt: 212-call help audit ve read-only run ledger]

## Product-user perspektifi

### Checkout'ı değiştirmeden doğrula

```bash
node dist/cli/entry.js --version-json
node dist/cli/entry.js doctor --json
node dist/cli/entry.js onboard --plan-only --json
node dist/cli/entry.js status --json
```

Run evidence: tümü exit 0. Doctor/status payload'larında nonfatal missing check ve typed HOLD'ları okuyun. [Kanıt: actual output'lar, 2026-08-01]

### Connection gap'lerini incele

```bash
node dist/cli/entry.js connect --json
```

Run evidence: valid JSON, bazı provider/MCP target'lar ready olmadığı için exit 1. Dönen step array'lerini install/attach için automatic authority değil proposed remediation sayın. [Kanıt: actual output; `src/cli/commands/connect.ts:198-215`]

### Memory query yap

```bash
node dist/cli/entry.js recall "Goal Mission Flow" --json
node dist/cli/entry.js memory stats
```

Run evidence: beş recall result ve toplam 1.764 entry. [Kanıt: actual output'lar, 2026-08-01]

### Feature truth incele

```bash
node dist/cli/entry.js features --json
node dist/cli/entry.js truth --json
```

Run evidence: 35 manifest feature; bir half-wire candidate içeren beş truth contract. [Kanıt: actual output'lar, 2026-08-01]

### Structured planning preview

```bash
deckent plan --dry-run
```

Dry-run branch structured parsing zorlar, provider istemez ve task file yazmaz. Audit boundary altında action-run edilmedi. [Kanıt: `src/cli/commands/plan.ts:168-205,253-254,458-461`]

### Onboarding change preview

```bash
deckent onboard --dry-run
```

Apply ile aynı config plan ve before/after report'u kullanır; yazmadan döner. Help-verified, action-run değil. [Kanıt: `src/cli/commands/onboard.ts:405-500`]

### Run gözlemle

```bash
deckent status --watch
deckent watch --follow <taskId>
deckent output <taskId>
```

Log follow etmeden exact task/attempt seçin. Help-verified, action-run değil. [Kanıt: `src/cli/commands/status.ts:1024-1040`; `src/cli/commands/watch.ts:134-184`; `src/cli/commands/output.ts`]

### Settlement projection'larını incele

```bash
deckent review --json
deckent retro --json
deckent history --json --last 1
```

Üçü için de run evidence var. Current snapshot'ta review pending unknown-sprint item içerirken retro/history missing ve zero coverage arasında çelişti; tek summary'ye güvenmek yerine projection'ları karşılaştırın. [Kanıt: actual output'lar, 2026-08-01]

### Recovery preview

```bash
deckent resume <sprintId> --dry-run
deckent recover <sprint-id> --dry-run --json
deckent cleanup --dry-run --sprint <id>
```

Help-verified, action-run değil. Task veya memory state'i doğrudan silmeyin; live cleanup/kill owner approval gate altındadır. [Kanıt: `src/cli/commands/resume.ts:246-492`; `src/cli/commands/recover.ts:170-291`; `src/cli/commands/cleanup.ts:118-196`; `AGENTS.md:69-108`]

### Connectors incele

```bash
deckent bot status
deckent gateway status
```

Run evidence: bot running, gateway not running. Bu channel authentication proof'u değildir. [Kanıt: actual output'lar, 2026-08-01]

### Worker backend seç

Önce effective config okuyun; sonra yalnız explicit intent ile project configuration yazın:

```bash
deckent config get spawn_backend
deckent config set spawn_backend docker
```

İki path de help-verified; read config migration tetikleyebilir, write çalıştırılmadı. Docker current fresh-default, subprocess Windows fallback, tmux deprecated'dir. [Kanıt: `src/core/config.ts:1621-1624`; `src/orchestra/spawn-backend.ts:598-636`; `docs/tr/configuration.md`]

### Claim cross-verify et

```bash
deckent xverify "The settlement gate and task authority agree"
```

Help-verified, action-run değil. Verifier farklı provider olmalı veya typed HOLD döndürmelidir. [Kanıt: `AGENTS.md:84-97`; `src/cli/commands/xverify.ts`]

## Dogfood / repository gerçeği

| Recipe class | Durum | Audit boundary |
|---|---|---|
| Read-only version/doctor/status/memory/feature/service read'leri | ✅ action-run | Output'lar built binary'den capture edildi. |
| Connect diagnosis | ✅ dürüst nonzero ile action-run | JSON valid'di; incomplete readiness exit 1 üretti. |
| Plan/onboard/recovery preview'leri | ✅ help/source verified | `onboard --plan-only --json` dışında state-changing preview action çalıştırılmadı. |
| Start/run/autonomous execution | ⚠️ HOLD | Bu audit'te explicit yasaktı (OQ-20). |
| Cross-provider verification | ⚠️ yalnız help/source | Provider call authorize edilmedi. |
