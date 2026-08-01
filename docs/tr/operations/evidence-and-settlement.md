# Evidence ve settlement

## Product-user perspektifi

Deckent, worker claim'i ile orchestrator-owned proof'u ayırır. Kullanılabilir bir result dört soruyu cevaplar: hangi attempt koştu, kendi authority'si içinde ne değişti, hangi verification koştu ve hangi terminal authority sonucu kabul veya reddetti. [Kanıt: `src/core/task-result-schema.ts:205-300`; `src/core/task-settlement-authority.ts`; `src/core/invocation-receipt.ts`]

### Evidence layer'ları

| Layer | Kaydettiği şey | Authority boundary |
|---|---|---|
| Task scope | İzinli read/write directory ve exact file'lar. | Declared write scope attribution ve boundary check'i sınırlar. [Kanıt: `src/core/task-types.ts`; `src/orchestra/disk-verify.ts:151-207`] |
| Attempt receipt | Role, purpose, provider/model, transport/backend, timing, disposition, reason, evidence state. | Receipt exact invocation'ı tanımlar; tek başına istenen output'u kanıtlamaz. [Kanıt: `src/core/invocation-receipt.ts:3-148`] |
| Worker result | Changed-file claim, token/cost, tests, TypeScript check, self-assessment, criteria, honesty, cross-verify ve production-wiring evidence. | Zod `TaskResultV1`, versioned structural contract'tır. [Kanıt: `src/core/task-result-schema.ts:205-300`] |
| Host disk evidence | Scoped tracked diff ve untracked file'lar. | Orchestrator attribution'ı task'ın kendi write path'lerinden Git ile hesaplar. [Kanıt: `src/orchestra/disk-verify.ts:135-207`] |
| Brain evaluation | GO/NO_GO, reason ve rubric result. | Worker self-assessment'tan ayrı kalmalıdır. [Kanıt: `src/core/task-result-schema.ts:277-288`; `src/orchestra/result-evaluator.ts`] |
| Auditor/gate | Validation record ve whole-run self-audit outcome. | Gate run'ı constrain edebilir fakat canonical logical progress ile uyuşmalıdır. [Kanıt: `src/core/task-result-schema.ts:220-229,294-296`; `src/orchestra/sprint-finalizer.ts:3036-3185`] |
| Terminal receipt | Outcome-shaping gate'ler settle olduktan sonra fenced publication. | Bir receipt için exact bir terminal publication claim edilir. [Kanıt: `src/orchestra/sprint-controller.ts:2900-2938`; `src/orchestra/sprint-finalizer.ts:3036-3185`] |

### Result'ı güvenli okuma

Bir run diagnose ederken şu sırayı kullanın:

1. `taskId`, `sprintId`, `attempt`, `workerId`, provider, model ve timestamp'leri eşleyin. [Kanıt: `src/core/task-result-schema.ts:238-259`]
2. Declared scope'u `filesChanged`, `boundaryViolations`, `workAttribution` ve host disk diff ile karşılaştırın. [Kanıt: `src/core/task-result-schema.ts:261-269`; `src/orchestra/disk-verify.ts:135-207`]
3. Actual test/tsc evidence ve her GO criterion'ı inceleyin; textual self-assessment yeterli değildir. [Kanıt: `src/core/task-result-schema.ts:274-288`]
4. Task gerektiriyorsa honest-gate, cross-provider verification ve production-wiring evidence kontrol edin. [Kanıt: `src/core/task-result-schema.ts:283-291`; `AGENTS.md:42-55,72-80`]
5. Run completion kabul etmeden task state, summary, gate ve terminal receipt'i uzlaştırın. [Kanıt: `PAZARTESI.md:54-60`]

### Disk truth ve sınırı

`computeScopedDiskChanges`, tracked change'leri `git diff --numstat HEAD`, untracked path'leri `git ls-files --others --exclude-standard` ile task write authority içinde okur. Böylece shared read directory'deki sibling work yanlış worker'a attribute edilmez. [Kanıt: `src/orchestra/disk-verify.ts:135-207`]

Eski synthetic-NO_GO probe fail-open'dır: Git/read error evidence üretmez; infrastructure failure sessizce false GO'ya dönmez. Bu yüzden “disk evidence yok” diagnostic context gerektirir; hiçbir work olmadığına dair evrensel kanıt değildir. [Kanıt: `src/orchestra/disk-verify.ts:67-106`]

### Cross-verification

XVerify gerektiğinde verifier, producer'dan farklı provider kullanmalı; effective config, registry, capability, reachability, entitlement ve budget evidence'dan çözülmelidir. Fresh second-provider authority yoksa result typed `unavailable/HOLD` olur; same-provider self-verification yasaktır. [Kanıt: `AGENTS.md:66-80`; `src/core/task-result-schema.ts:283-291`]

### Settlement ve retention

`finalizeSprint` attempt result'larını aggregate eder, lifecycle event'leri emit eder, self-audit gate koşar, gate projection yazar, learning/decay uygular ve terminal evidence yayınlar. Comment'leri, hand-written identity file yerine managed identity projection kaynağı olarak `memory.db`'yi gösterir. [Kanıt: `src/orchestra/sprint-finalizer.ts:2185-2240,3036-3185`]

Cleanup terminal-receipt publication sonrasında gelir; configured olduğunda skip veya delay edilebilir. Scan state'i temizler ve artifact cleanup/tool-inventory cleanup'a delege eder. [Kanıt: `src/orchestra/sprint-controller.ts:2900-2938`; `src/orchestra/sprint-phases.ts:4170-4207`]

## Dogfood / repository gerçeği

| Kontrol | Durum | Current finding |
|---|---|---|
| Versioned result schema | ✅ canlı | `TaskResultV1` tek Zod schema'dan infer edilir ve explicit evidence field'ları içerir. |
| Scoped disk attribution | ✅ canlı | Host-side tracked/untracked calculation vardır ve write-scope limited'dır. |
| Invocation receipt validation | ✅ canlı | Stored receipt'ler kabul öncesi schema, role ve structured reason field'larına göre validate edilir. [Kanıt: `src/core/invocation-receipt-store.ts:500-660`] |
| Atomic result collection | ⚠️ kısmi | PAZARTESI üç malformed result vakası ve gerekli atomic-write/recovery closure kaydeder. [Kanıt: `PAZARTESI.md:39-44`] |
| Collect→evaluate→status transaction | ⚠️ kısmi | Valid result varken task EXECUTING kalabilir; closure açıkça pending'dir. [Kanıt: `PAZARTESI.md:43-45`] |
| Gate/summary/task/receipt agreement | ⚠️ kısmi | Sprint 476/478/481'de tüm root task'lar NO_GO iken final gate PASS oldu. [Kanıt: `PAZARTESI.md:54-58`] |
| Unattended settlement certification | 🔜 roadmap | Required ladder üç ardışık intervention-free COMPLETE+PASS run ve consistency condition'larıyla biter; certify edilmemiştir. [Kanıt: `PAZARTESI.md:54-60`] |

Bu gap'ler kapanana kadar individual evidence component'leri canlı olsa da repository truth, publish-grade autonomous settlement için `HOLD`'dur. [Kanıt: `PAZARTESI.md:36-60`]
