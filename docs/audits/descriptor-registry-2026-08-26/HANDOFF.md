# Config Descriptor Registry — Faz-A Handoff

## Teslim hükmü

**Faz-A: GO. Faz-B: başlamadı. Product CONFIG-TRUTH-001: NO-GO/HOLD.**

Canonical descriptor registry'nin veri modeli, complex type grammar'ı, generator/equality/cutover
contractı ve acceptance-gated ürünleştirme DAG'ı tamamlandı. Üretim source'u değiştirilmedi.
Content-addressed Faz-A artefakt commit'i
`a5bccc51597d292a3116acdf4569e5f7aceecd3a`dır. Bu receipt ondan sonra eklenmiştir; `headSha`
alanı receipt'in kapsadığı immutable artefakt commit'ini gösterir, settlement commit'ini değil.

## Okunan authority ve kaynaklar

- `LANE-BRIEF.md` ve `docs/governance/parallel-lane-protocol.md` eksiksiz.
- `docs/governance/deckent-dev-operating-policy.md`, `DIRECTIVES.md`,
  `.codex/rules/worker-default.md` execution/scope authority için.
- `src/core/config-types.ts`: imports, `DeckentConfig`, config-adjacent types,
  `ResolvedConfig` ve config metadata types.
- `src/core/config.ts`: validators, named default/resolver family'leri,
  `createDefaultConfig`, `loadConfig` resolved projection, `CONFIG_METADATA`, discovery/reference
  consumers ve `mergeConfigs`.
- `scripts/lint-config-truth.mjs` ve `scripts/script-registry.json` deferred gate kaydı.
- `src/cli/commands/config.ts` metadata-backed list/keys discovery.
- `src/dashboard/src/pages/ConfigPage.tsx` 66-field handwritten catalog ve API projectionı.
- `docs/en/reference/configuration-schema.md` ve TR parity file'ı.
- `docs/MASTER-PLAN.md` satır 470, 471 ve 4210; salt okundu, mutate edilmedi.
- `audit/config-completion-20260825` koruma commit'i `d2e9a1247`: özellikle
  `field-universe.json`, `CONFIG-FIELD-MATRIX.md`, `DRIFT-REGISTER.md`,
  `PRODUCT-COMPLETION-PLAN.md`, schema/default ve product-surface agent reports,
  `VERIFICATION.md`, `MORNING-SUMMARY.md` ve audit validatorı.

Source ve audit artefakt SHA-256'ları `SOURCE-MANIFEST.json` içindedir.

## Sayım reconciliation

| Census | Audit snapshot | Live lane base | Disposition |
|---|---:|---:|---|
| Authored roots | 141 | 142 | Live `evaluation` delta; expected |
| Shallow declaration leaf | 449 | 450 | Type completeness sayımı değil |
| Semantic authored leaf-pattern | 1.002 | yeniden üretilmedi | Compiler P0/P1 acceptance |
| Normalized audit union | 1.146 | yeniden üretilmedi | Full transition reconciliation input |
| Raw default leaf | 180 | 181 | Named strategies ayrıca çözülmeli |
| Runtime-parser leaf | 185 | 186 | Public resolved root sayısı değil |
| Metadata entries | 55 | 55 | Live root'u takip etmedi |
| Dashboard fields | 66 | 66 | Handwritten competing catalog |
| Truth issue | 589 | 592 | Expected-red, defect sayısı değil |

Live issue dağılımı `12 DIVERGENT / 401 MISSING_DEFAULT / 113 MISSING_METADATA /
66 MISSING_RUNTIME`dır. Audit dağılımı `12/400/112/65`tir. 755 optional ve 205 conditional
no-explicit-default alan defect diye sınıflandırılmadı.

## Tasarım sonucu

Registry:

- stable field/type/module identity,
- reusable TypeNode graph,
- authored/resolved ayrı types ve presence,
- altı-sınıflı default taxonomy,
- yedi-sınıflı lifecycle,
- `hot-reload/next-run/restart` impact,
- secret-reference-aware sensitivity,
- raw prose yerine en/tr message keys,
- alias/migration/proof/surface eligibility,
- deterministic canonical IR/census/digest

taşır. Imported alias, mapped type, record, array/tuple, discriminated union ve dynamic namespace
explicit grammar ile çözülür. `ACTIVE` field için opaque external type ve open
`Record<string, unknown>` yasaktır.

## CFG-011 — owner karar matrisi

Aşağıdakiler **öneridir, owner kararı değildir**. Temel öneri competing değerleri “tek default
seç” diye ezmek yerine default taxonomy ile doğru role ayırmaktır.

| Path | Bugünkü authorities | Owner'a exact karar | Önerilen sınıflandırma | Etkilenen yüzey |
|---|---|---|---|---|
| `mode` | create-default `performance`; metadata `balanced` | Absence hangi effective mode'u üretir; starter profile farklı olabilir mi? | `EFFECTIVE_DEFAULT=performance`; `balanced` yalnız owner isterse named `STARTER_VALUE`, aksi halde stale authority | resolver, metadata, init, docs, Dashboard, capacity/model selection |
| `memory_budget` | create-default/constants `5000`; metadata `600`; init/finalizer `900` | Effective budget ve starter policy ayrı değerler mi? | `EFFECTIVE_DEFAULT=5000`; `900` yalnız explicit starter profile kararıyla; `600` retire. Finalizer resolved snapshot tüketmeli | memory store, finalizer fallback, init docs, CLI/Dashboard |
| `decay_after_sprints` | create-default/constants `20`; metadata/init `5` | Effective retention 20 mi 5 mi; starter override var mı? | `EFFECTIVE_DEFAULT=20`; `5` yalnız explicit starter kararı varsa, yoksa retire | memory lifecycle, init, metadata/docs |
| `spawn_backend` | create-default `auto`; metadata unset; regenerate/docs `docker` | `auto` authored sentinel mi, effective backend mi? | Authored absence→`PLATFORM_RESOLVED` requested `auto`; resolved output concrete backend + capability receipt. Fixed Docker default yok | config resolver, spawn, regenerate, docs, Dashboard, platform matrix |
| `docker_timeout` | authored optional/create-default absent; metadata/consumer `1200` | Absence Docker executionında 1200 mü üretir? | Authored `NO_DEFAULT`; applicable Docker resolved strategy `EFFECTIVE_DEFAULT=1200`; metadata effective olarak etiketler | resolver, spawn consumer, CLI/docs |
| `dependency_pipeline_enabled` | create-default `true`; regenerate `false` | Yeni/sparse projectte pipeline enabled mı? | `EFFECTIVE_DEFAULT=true`; regenerate `false` retire. False yalnız explicit user override | resolver, regenerated config, orchestration DAG |

Owner farklı semantic seçerse plan aynı kalır; decision receipt registry provenance'ına bağlanır ve
generated artifacts o karardan birlikte türer. Owner receipt olmadan bu altı field production
cutover'a giremez.

## Diğer açık sorular

1. `prompt.adr_render`: versioned remove/migrate mı, binding-full garantisini zayıflatmayan bounded
   override mı?
2. Her field'ın impact class population authority'si hangi domain ownerları tarafından imzalanır?
3. Legacy plaintext secret fields için migration deadline ve external Secret Broker requirements?
4. Registry-backed dynamic namespaces unavailable olduğunda reject mi, read-only HOLD mı; hangi
   namespaces offline schema cache taşıyabilir?
5. MCP config mutation capability default policy/risk tier'ı nedir? Approval decision authority MCP
   read-only sınırını korur.

Bu sorular compiler/data-model foundationını bloklamaz; ilgili production cutover fields typed HOLD
kalır.

## Findings ve önerilen next action

- `DRIFT-REGISTER.md` 10 deduplicated production finding taşır; hepsi exact source location ve
  ana-şerit önerilen diff'iyle kayıtlıdır.
- Ana-şerit önce `node docs/audits/descriptor-registry-2026-08-26/verify-artifacts.mjs` çalıştırıp
  artifact-set/receipt digest'ini doğrulamalı, sonra protocol §6 admission kararı vermelidir.
- Faz-B prototype bu teslimde yoktur. Owner/ana-şerit Faz-A admission veya devam yönlendirmesi
  verdikten sonra yalnız `lab/descriptor-registry/**` allowlist'inde ayrı teslim olarak yürür.

## Versioned receipt

<!-- HANDOFF-RECEIPT:START -->
```json
{
  "schemaVersion": 1,
  "outcomeId": "CONFIG-DESCRIPTOR-REGISTRY-PHASE-A-2026-08-26",
  "role": "implementer",
  "baseSha": "abed38c50f6dda2e48041d9ead2605894a17d0a2",
  "headSha": "a5bccc51597d292a3116acdf4569e5f7aceecd3a",
  "branch": "lane/descriptor-registry-20260826",
  "policyDigest": "sha256:8c10f28c4a5d895848cc12bb20e210544983ab714c0fcca49bc7422a76dc3ff2",
  "scopeDigest": "sha256:8d0f9fe40781082b230fb8dd26522e76e8a9ede76df9bb18328fcefb6d32d723",
  "filesChanged": [
    "docs/audits/descriptor-registry-2026-08-26/DESIGN.md",
    "docs/audits/descriptor-registry-2026-08-26/DRIFT-REGISTER.md",
    "docs/audits/descriptor-registry-2026-08-26/PLAN.md",
    "docs/audits/descriptor-registry-2026-08-26/README.md",
    "docs/audits/descriptor-registry-2026-08-26/SOURCE-MANIFEST.json",
    "docs/audits/descriptor-registry-2026-08-26/verify-artifacts.mjs"
  ],
  "artifactSet": {
    "algorithm": "sha256(sorted path\\0fileSha\\n)",
    "files": [
      "DESIGN.md",
      "DRIFT-REGISTER.md",
      "PLAN.md",
      "README.md",
      "SOURCE-MANIFEST.json",
      "verify-artifacts.mjs"
    ],
    "digest": "sha256:c0fc45abd9d0dc77a77c41f4213e4411ef423995a88ab7f082fbc5b953578bf6"
  },
  "sourceCounts": {
    "audit": {
      "roots": 141,
      "semanticLeaves": 1002,
      "unionPaths": 1146,
      "truthIssues": 589
    },
    "live": {
      "roots": 142,
      "shallowLeaves": 450,
      "defaults": 181,
      "runtimeLeaves": 186,
      "metadata": 55,
      "dashboardFields": 66,
      "truthIssues": 592
    }
  },
  "verification": [
    {
      "command": "node --check docs/audits/descriptor-registry-2026-08-26/verify-artifacts.mjs",
      "result": "PASS"
    },
    {
      "command": "SOURCE-MANIFEST.json JSON parse",
      "result": "PASS"
    },
    {
      "command": "git diff --cached --check",
      "result": "PASS"
    },
    {
      "command": "node docs/audits/descriptor-registry-2026-08-26/verify-artifacts.mjs",
      "result": "PASS"
    }
  ],
  "findings": [
    {
      "class": "RELATED_BUT_NONBLOCKING",
      "reasonCode": "PRODUCT_CONFIG_TRUTH_NO_GO",
      "count": 10
    },
    {
      "class": "RELATED_BUT_NONBLOCKING",
      "reasonCode": "CFG_011_OWNER_DECISION_HOLD",
      "count": 6
    }
  ],
  "openActions": [
    "MAIN_LANE_PHASE_A_ADMISSION",
    "OWNER_DECISION_CFG_011_DEFAULTS",
    "PHASE_B_PROTOTYPE_NOT_STARTED"
  ],
  "recommendedNextAction": "Ana-şerit Faz-A artefaktlarını validator ve digest ile admit eder; owner yönlendirmesiyle Faz-B ayrı teslim olarak başlar.",
  "receiptDigest": "sha256:72fb38f75eedf39a37800233184dbeb0e0eac834ca805db6f26095c2d531225e"
}
```
<!-- HANDOFF-RECEIPT:END -->
