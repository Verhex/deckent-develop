<!-- DECKENT:WORKSPACE id="boot" schema="1" authority="managed" provenance="workspace-artifact-registry" -->
# Boot

## Boot Sequence
<!-- DECKENT:CONTRACT id="boot" schema="1" sha256="b565fec667fd2633588f3d520ec708a5b3c39d16a1f5080acb8c4b66e2447b9e" -->
1. **Authority yükle** — Brain `DIRECTIVES.md`, effective config ve `.brain/memory.db` kaynaklarını okur; generated projectionlar policy üretmez.
2. **Planla ve admit et** — exact DAG, provider/model/auth/budget/reachability ve write scope dispatch öncesi çözülür.
3. **Spawn** — yapılandırılmış platform adapterı yalnız admitted workerları başlatır.
4. **Execute** — workerlar host-observed heartbeat, activity ve result-ingress artefaktlarını yayımlar.
5. **Evaluate** — Brain disk truth, test, scope, cost ve policy kanıtını GO, FIX veya typed HOLD/NO_GO kararına uzlaştırır.
6. **Fix** — uygun hatalar bounded FIX DAG’a girer; `processQueue` dependency completion uydurmaz.
7. **Finalize ve archive** — canonical retention çalışmadan önce terminal settlement, Retrospective, memory, trace ve projectionlar yayımlanır.

### Engine completion truth

A spawn call returning is not completion evidence. Docker spawn completion is observed through `DockerSpawnBackend.lastSpawnCompletion`.

A worker result settles through the attempt-bound execution-landing proposal and execution-landing coordinator chain. Only the host-coordinated durable settlement is completion truth.
<!-- DECKENT:CONTRACT:END id="boot" -->

## Manual Recovery Chain
<!-- DECKENT:CONTRACT id="boot" schema="1" sha256="6d02c5c3a67033513b0d8522559ff4d038142a5b9da01fb6f8d6a1ce2cf721a6" -->
Recovery diagnostics-first ve fail-closed çalışır. Asla kill veya cleanup ile başlama.

```bash
# 1. Mutation yapmadan incele
deckent status --json
deckent doctor

# 2. Canonical recovery operationı önizle
deckent recover <sprint-id> --dry-run

# 3. Yalnız canonical PAUSED/ORPHANED runı sürdür
deckent recover <sprint-id> --resume

# 4. Mutating recoveryyi ancak exact owner onayı sonrası çalıştır
deckent recover <sprint-id>

# 5. Yeni bir one-shot açıklama çalıştır; bu historical task-id replay değildir
deckent run "<description>"
```

MCP paritesi: önce `deckent_status {}`, sonra `deckent_recover { sprintId, dryRun: true }`. Mutating MCP recovery ayrıca exact identity/generation/fence-bound `approval` ister. `deckent_run` `{ description }` kabul eder; `{ taskId }` kabul etmez. `kill` ve `cleanup` ayrı destructive operationlardır ve kendi canlı owner kararlarını gerektirir.
<!-- DECKENT:CONTRACT:END id="boot" -->
