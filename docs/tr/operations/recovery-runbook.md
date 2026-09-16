# Recovery runbook

## Product-user perspektifi

Recovery authority-sensitive bir workflow'dur. Read-only observation ile başlayın, failure'ı classify edin, exact recovery scope'u preview edin ve yalnız explicit owner authority ile mutation yapın. `.tasks/*` elle silmeyin ve `.brain/memory.db` dosyasını asla silmeyin. [Kanıt: `AGENTS.md:81-94,144-151`]

### 1. Mutation olmadan gözlemle

```bash
deckent status --json
deckent history --json --last 1
deckent review --json
deckent bot status
deckent gateway status
deckent autonomous status
```

Altı command'ın tamamı 2026-08-01'de real binary'de çalıştırıldı. Snapshot idle'dı; provider observation HOLD durumundaydı, review unknown sprint id'li bir pending record içerdi ve service-status command'ları current state'lerini döndürdü. [Kanıt: real-binary output'lar, 2026-08-01]

Ardından exact run'a ait evidence'ı inceleyin: task status, latest checkpoint, run-flow/read-model status, process/container identity, logs ve terminal receipt. Yalnız filename'den ownership çıkarmayın. [Kanıt: `src/core/run-status-authority.ts`; `src/core/run-flow-store.ts`; `src/orchestra/sprint-checkpoint.ts`; `src/core/invocation-receipt-store.ts`]

### 2. Incident'ı classify et

| Condition | Tercih edilen sonraki adım | Yapmayın |
|---|---|---|
| Durable checkpoint ile `PAUSED` | `resume --dry-run` preview; task scope ve provider authority doğrula. [Kanıt: gerçek `resume --help`; `src/cli/commands/resume.ts`] | Task file'larını elle yeniden kurmayın. |
| `ORPHANED`, `STALE` veya interrupted sprint | `recover <sprint-id> --dry-run` preview; exact evidence restore gerektirmedikçe forward recovery seç. [Kanıt: gerçek `recover --help`; `src/cli/commands/recover.ts:170-300`] | `--force`, `--skip-audit` veya `--restore-tasks` default olmasın. |
| Active process fakat güvenilir terminal state yok | PID/container ownership ve heartbeat incele; stop authority'yi owner ile koordine et. [Kanıt: `src/cli/commands/status.ts`; `src/orchestra/sprint-pid-manager.ts`; `AGENTS.md:81-94`] | Onaysız active sprint kill/cleanup yapmayın. |
| Completed attempt fakat inconsistent summary/gate/receipt | Publication'ı HOLD et ve exact logical-task authority'yi reconcile et. [Kanıt: `PAZARTESI.md:54-58`] | Tek projection'dan PASS veya COMPLETE demeyin. |
| Build-source mismatch | Documented host restart/reconnect workflow üzerinden consistent built/source process boundary kur. [Kanıt: `AGENTS.md:88-91,139-143`] | Sprint çalışırken rebuild veya provider auth mutation yapmayın. |
| DB schema drift | Typed HOLD'da dur ve authorized olduğunda owning migration entrypoint kullan. [Kanıt: OQ-07/OQ-08] | SQLite table'larını elle edit etmeyin. |

### 3. Exact operation'ı preview et

Real binary help bu mutation preview'lerini doğrular:

```bash
deckent recover <sprint-id> --dry-run
deckent resume <sprint-id> --dry-run
deckent cleanup --sprint <sprint-id> --dry-run
```

`recover` ayrıca `--resume`, `--restore-tasks`, `--force`, `--skip-audit`, `--auto-approve` ve `--force-scope` sunar. Her biri authority'yi genişletir veya değiştirir ve concrete reason gerektirir; preview desteği final mutation'ı authorize etmez. [Kanıt: gerçek `recover --help`, 2026-08-01]

`cleanup --sprint <id>` exact ownership selector sağlar; `--decay` memory decay ekler. Cleanup runtime artifact silebildiği için dry-run output'unu approval öncesi evidence olarak koruyun. [Kanıt: gerçek `cleanup --help`; `src/cli/commands/cleanup.ts:118-197`]

### 4. Yalnız approval sonrası execute et

Owner, live sprint kill/cleanup işlemini approve etmelidir. Aynı safety boundary, recovery flag audit, interaction veya established scope bypass ediyorsa da geçerlidir. Operating contract direct `.tasks/*` removal'ı yasaklar. [Kanıt: `AGENTS.md:81-94,144-151`]

Approved action sonrasında:

1. Canonical status ve process/container identity'yi yeniden okuyun.
2. Expected task/checkpoint/receipt transition'larını doğrulayın.
3. Scoped disk change'i attempt claim ile karşılaştırın.
4. Gate, summary, task verdict ve terminal receipt'in uyuştuğunu doğrulayın.
5. Çözülmeyen mismatch'i typed HOLD kaydedin; guesswork ile destructive retry yapmayın.

[Kanıt: `src/core/run-status-authority.ts`; `src/orchestra/disk-verify.ts:135-207`; `src/core/invocation-receipt-store.ts`; `PAZARTESI.md:54-58`]

### 5. Finalization cleanup değildir

`finalize --sprint <id>` settlement projection, learning, config, hook ve decay günceller; `--force`, `--skip-hooks`, `--skip-decay` bu davranışı değiştirir. `cleanup` owned runtime artifact'ları işler. Inconsistent run'ı complete görünür yapmak için ikisini de çalıştırmayın. [Kanıt: gerçek `finalize --help`, 2026-08-01; `src/cli/commands/finalize.ts:237-350`; `src/cli/commands/cleanup.ts:118-197`]

## Dogfood / repository gerçeği

| Recovery surface | Durum | Current constraint |
|---|---|---|
| Status/history/service read'leri | ✅ canlı | Real binary read call'ları tamamlandı; dönen veri yine data-quality interpretation gerektirir. |
| `resume --dry-run` | ✅ canlı surface | Registered ve help-verified; bu audit'te action run authorized değildi. |
| `recover --dry-run` | ✅ canlı surface | Canonical recovery preview ve structured JSON destekler; action run authorized değildi. |
| Exact-sprint cleanup preview | ✅ canlı surface | CLI `--sprint` ve `--dry-run` sunar; MCP cleanup aynı exact-sprint input'u taşımaz (OQ-11). |
| Bot graceful stop | ⚠️ kısmi | Identity guard ve stale PID sorunu 2026-08-01 build incident'ında gözlendi. [Kanıt: `PAZARTESI.md:47-50`] |
| Stale projection recovery | ⚠️ kısmi | Audit tarihinde on dokuz projection typed recovery bekliyordu. [Kanıt: `PAZARTESI.md:51`] |
| End-to-end recovery certification | 🔜 roadmap | Malformed-result ve NOT_DISPATCHED recovery henüz certify edilmemiş explicit rung'lardır. [Kanıt: `PAZARTESI.md:54-56`] |

Bu runbook approval gate'lerinde bilinçli olarak durur. Active run recover, resume, finalize, kill veya clean etmek için izin vermez. [Kanıt: owner boundary; `AGENTS.md:81-94`]
