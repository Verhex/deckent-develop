# Main Drift Delta

## Comparison boundary

- Audit base: `ff48978fb78139ea34b8c5e98fc41532437af9c9`
- Resume-time `main`: `5f9e851b572888e4239a6e2d0e3fa97b40b6db0b`
- Final comparison `main`: `298e8188fadead9b29224be442034816497a99c9`
- Final comparison cutoff: `2026-08-26T01:24:02+03:00`.
- Initial delta: one C-wave commit; incremental deltas: xverify repair, secret-layer/i18n hygiene,
  then docs/flow close-out.
- Policy: audit branch remains pinned; no merge/rebase. Delta findings are evaluated separately.

## Config-relevant changes

| Change | Effect on pinned findings |
|---|---|
| `src/cli/commands/init-steps.ts` now authors a finite worker `execution_budget` and adds `execution_budget.unmetered_backend.action=hold` when init selects subprocess | Improves first-run admission honesty, but expands the CLI-init-specific authoring authority. It does not unify CLI init, MCP init, regenerate, `createDefaultConfig`, metadata or resolver semantics |
| `src/core/live-execution-budget.ts` now emits a typed admission error for unsupported metering | Behavioral error contract improves; config schema/default/resolver drift is unchanged |
| `src/cli/commands/plan.ts` and `src/mcp/tools/plan.ts` close dry-run/write-scope parity | Run planning surface improves; `.deckent/config.json` authority and config tool behavior are unchanged |
| CLI config tests add `renameSync` mocks and update atomic-write assertions | Explains most failures in the pinned config test battery as stale mocks/assertions. It does not change the pinned CLI writer implementation or non-CLI writers |
| C-wave lifecycle, lock and artifact changes | Outside the configuration completion outcome except as consumers of effective settings |

## Findings not invalidated

The delta does not modify `src/core/config-types.ts`, `src/core/config.ts`,
`src/cli/commands/config.ts`, `src/mcp/tools/config.ts`, the `/api/config` handlers or Dashboard
config metadata. Therefore the following remain current at resume-time `main`:

- split `loadConfig`/`mergeConfigs` projections;
- open-world validation and unknown-key success;
- incomplete/stale metadata and Dashboard field/default lists;
- raw/secret-bearing config projections;
- multiple non-atomic/CAS-less writers;
- recovery parse→rename TOCTOU;
- dropped/unreachable security and behavioral fields;
- prompt config fields not threaded to the worker prompt call site;
- divergent migration and authoring entrypoints;
- config truth gate failure and missing required wiring.

## Ledger state at resume-time main

`CONFIG-TRUTH-001` (470), `CONFIG-AUTHORITY-001` (471),
`NERVOUS-CONFIG-EXECUTION-TRUTH-001` (475), `CLI-VOCAB-001` (510),
`CONFIG-AUTHORITY-CONSOLIDATION-001` (4210), `PROVIDER-CONNECTION-001` (6041),
`PLUGIN-SECURITY-CONFIG-AUTHORITY-001` (7034) and `COST-CONFIG-RECONCILIATION-001`
(10061) remain `OPEN`; `CM-01` remains `BLOCKED / CONFIG_CUTOVER_INCOMPLETE`.

Final handoff cutoff'unda `main` HEAD `298e818…` idi; aşağıdaki incremental reconciliation bu
committe kesilir. Daha sonraki commit pinned audit truth'e sessizce dahil edilemez ve yeni
reconciliation girdisidir.

## Interim uncommitted observation — later committed as `0d565b3…`

Final verification sırasında main HEAD hâlâ `5f9e851b…` idi; ancak main worktree başka oturumun
owner-owned tracked/untracked değişikliklerini taşıyordu. Audit bunları kopyalamadı, mutate etmedi
ve pinned evidence'e dahil etmedi.

Config-adjacent read-only name/diff inspection yalnız şu active source/test setini gördü:

```text
scripts/lint-test-hermeticity.mjs
src/cli/commands/xverify.ts
src/orchestra/cross-verify-production-ingress-authority.ts
tests/cli/xverify-evidence-scope.test.ts
tests/orchestra/cross-verify-production-ingress-authority.test.ts
tests/orchestra/xverify-producer-fencing.test.ts
```

Bu değişiklikler daha sonra `0d565b3…` ile commit edildi. `xverify --diff` evidence scope'unu dirty path'lerle bağlama, oversize/non-file
artifactları filtreleme ve producer-settlement fencing normalizasyonunu sıkılaştırır. Canonical
config schema/default/resolver/writer/surface dosyalarını değiştirmez. `cross_verify` mevcut wired
config ailesinin consumer/evidence kalitesini iyileştirebilir; bu auditin config authority,
secret, recovery, prompt, approval ve surface bulgularını kapatmaz.

## Final committed incremental reconciliation: `5f9e851… → 0d565b3…`

Commit:

```text
0d565b361 fix(xverify): repair the adjudication pipe end-to-end — evidence scope,
producer-fence basis, hold detail (overnight, owner-authorized)
```

Config-adjacent production/test changes:

- `src/cli/commands/xverify.ts`: `--diff` changed paths'i evidence requirements/filesChanged
  scope'una bağlıyor; non-file/oversize artifacts evidence broker sınırında filtreleniyor.
- `src/orchestra/cross-verify-production-ingress-authority.ts`: producer settlement result shape
  normalize ediliyor, Brain-authored downstream fields ayrı exception seti taşıyor ve typed hold
  detail'i korunuyor.
- `scripts/lint-test-hermeticity.mjs` ve xverify tests evidence/fencing contractını güçlendiriyor.

Committed delta canonical config authority dosyalarına dokunmuyor:

```text
src/core/config.ts
src/core/config-types.ts
src/cli/commands/config.ts
src/mcp/tools/config.ts
src/api/server.ts config handlers
src/dashboard/src/pages/ConfigPage.tsx
checkpoint/approval decision adapters
```

Disposition: `cross_verify` wired-family proof/consumer quality'si güçlenir. Config schema,
defaults, resolver drops, raw writers, healer TOCTOU, secret custody, prompt/ADR, checkpoint bypass
ve surface completeness bulgularından hiçbiri `VERIFIED_CLOSED` olmaz. Audit branch rebase/merge
edilmedi.

`0d565b3…` interim read sırasında main ayrıca owner-owned uncommitted state taşıyordu; tracked
production source adı yalnız `src/cli/helpers/messages.ts` idi. Bu state o cutoff'a dahil edilmedi;
daha sonra `75fac1b…` ile commit edilen kısmı aşağıdaki final incremental reconciliation kapsar.
Audit hiçbir aşamada bu dosyaları değiştirmedi.

## Final incremental reconciliation: `0d565b3… → 298e818…`

İki commit:

```text
75fac1b91 chore(security+hygiene): deck-secret layer proof, dockerignore pin,
orphan i18n cleanup — probe run PASSED
298e8188f docs(flow): morning report + row 190 live memory-projection evidence
```

Production/test delta yalnız:

```text
src/cli/helpers/messages.ts
scripts/lint-test-hermeticity.mjs
tests/docker/dockerignore-secrets.test.ts
```

- Altı orphan provider-observation message key'i kaldırıldı; config surface stringleri veya config
  i18n contractı değişmedi.
- `.dockerignore`/Docker image-layer secret exclusion proof'u `.deck` ve `.env` build context
  sızıntısını kapatır. Bu olumlu security proof config dosyası/backup mode `0644`, raw secret
  projection, Secret Broker veya healer recovery bulgularını kapatmaz.
- `298e818…` yalnız plan/flow/ledger projections günceller; config authority source'u değiştirmez.

Scoped committed diffte `config.ts`, `config-types.ts`, CLI/MCP/API/Dashboard config surfaces,
writer/recovery, secret projection ve approval/checkpoint authority dosyaları yoktur. Bütün core
audit bulguları aynı kalır. Cutoff anındaki main uncommitted owner-owned runtime/docs state'i ayrıca
gözlendi, okunup audit truth'e katılmadı ve mutate edilmedi.
