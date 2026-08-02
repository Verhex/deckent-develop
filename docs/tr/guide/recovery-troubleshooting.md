# Recovery ve troubleshooting

## Product-user perspektifi

Recovery deletion ile değil observation ile başlar. Evidence'ı koruyun, exact run/task/attempt'ı belirleyin, canonical recovery action'ı preview edin, gerekli approval'ı alın ve settlement'ı sonradan doğrulayın. [Kanıt: `AGENTS.md:69-108`; `src/cli/commands/recover.ts:37-116,170-291`; `src/cli/commands/resume.ts:246-580`]

### Read-only triage

1. `deckent status --json` çalıştırın; lifecycle, resumability, authority conflict, provider observation ve pending approval'ları okuyun.
2. Platform/provider/workspace check için `deckent doctor --json` kullanın.
3. Task, settlement ve report projection'larını karşılaştırmak için `deckent review --json`, `retro --json` ve `history --json` kullanın.
4. Exact attempt/backend doğrulandıktan sonra `deckent output <taskId>` veya `watch --follow <taskId>` kullanın.

Listelenen command path'lerin tümü real-binary help ile doğrulandı; ilk üç read path audit'te action-run edildi. [Kanıt: run ledger, 2026-08-01; `src/cli/commands/status.ts`; `src/cli/commands/doctor.ts`; `src/cli/commands/review.ts`; `src/cli/commands/output.ts`; `src/cli/commands/watch.ts`]

### Canonical recovery seçenekleri

| Durum | Preview / action | Contract |
|---|---|---|
| Recoverable checkpoint | `resume <sprintId> --dry-run` | Exact resumable set türetir ve artifact delete/reset öncesi döner |
| Crashed/stuck sprint | `recover <sprint-id> --dry-run` | Canonical cleanup/recovery'yi uygulamadan diagnose eder |
| Recovery üzerinden resume | `recover <sprint-id> --resume --dry-run` | Canonical resume'a fresh process'te yeniden girer |
| Archived task snapshot restore | `recover <sprint-id> --restore-tasks --force` | Explicit destructive rollback path; dry-run/resume ile birleşmez |
| Cleanup preview | `cleanup --dry-run --sprint <id>` | Action öncesi archive/delete target'larını listeler |
| Human checkpoint | `checkpoint list --pending --json` | Approval'ları okur; approve/reject mutation'dır |

[Kanıt: `src/cli/commands/resume.ts:246-492`; `src/cli/commands/recover.ts:170-291`; `src/cli/commands/cleanup.ts:118-196`; `src/cli/commands/checkpoint.ts:65-160`]

Bunlar syntax contract'tır; action-run evidence değildir. Live sprint kill/cleanup öncesi owner approval gerekir. [Kanıt: owner policy `AGENTS.md:69-108`]

### Dry-run neden önemlidir?

Resume canonical disposition hesaplar ve dry-run mode'da task/checkpoint mutation öncesi çıkar. Recovery contradictory flag combination'larını reject eder; task restore ayrıca `--force` ister. Cleanup exact archive/delete category'lerini basar ve dry-run olmadan yeniden çalıştırma gerektiğini söyler. [Kanıt: `src/cli/commands/resume.ts:315-397,455-492`; `src/cli/commands/recover.ts:189-237`; `src/cli/commands/cleanup.ts:118-196`]

Preview yine yalnız authority snapshot kadar güvenilirdir. Status another active sprint, unknown ownership, malformed settlement veya provider observation HOLD bildiriyorsa `.tasks` ya da `.brain` silerek “fix” etmeyin. [Kanıt: `src/cli/commands/resume.ts:529-580`; immutable memory ve cleanup rules `AGENTS.md:69-108`]

### Doctor repair boundary

`doctor --fix`, closed whitelist üzerinde preview-by-default'tur: missing runtime directory, stale shadow permission, missing/corrupt config ve stale worker lock. `--yes` uygular; explicit `--dry-run` kazanır. Docker image rebuild ayrı confirmation path taşır. [Kanıt: `src/cli/commands/doctor.ts:1871-2115,2190-2245`]

## Dogfood / repository gerçeği

2026-08-01 handoff şunları kaydeder:

- build-source mismatch `bot stop`'u bloklayıp OS-level SIGTERM workaround'a zorlayabilir;
- SIGTERM `bot.pid` bırakabilir;
- clean dashboard output'u korurken dashboard builder empty target ister ve `E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY` üretir;
- 19 stale RunFlow/RunJob projection typed recovery bekler;
- malformed result, result/status transaction ve final-gate authority contradiction'ları sürer;
- docs reset sonrası generated reference ve identity registry projection'ları eksikti; owner 2026-08-02'de pipeline-owned input/output'ları restore etti ve iki check de artık green'dir;
- provider observation source schema v2 beklerken live DB v1'dir.

[Kanıt: `PAZARTESI.md:37-58`; read-only PRAGMA ve docs check'leri, 2026-08-01; owner-verified pipeline/gate run'ları, 2026-08-02]

Handoff'taki raw dashboard deletion workaround historical incident evidence'dır; genel yetkili instruction değildir. Exact owner-approved scope olmadan çalıştırmayın. [Kanıt: destructive-action rules; `PAZARTESI.md:50`]

### Certification ladder

Required order: bir successful task; üç-task dependency chain; intentional NO_GO→FIX→DONE; malformed-result recovery; NOT_DISPATCHED recovery; mixed-provider refill; sonra 50-task smoke. Acceptance en az üç consecutive owner-intervention-free `COMPLETE + PASS` run ve sıfır malformed veya task/summary/gate/receipt contradiction ister. [Kanıt: `PAZARTESI.md:55-58`]

Bu evidence oluşana kadar unattended production reliability `⚠️ kısmi` kalır.
