# Config Descriptor Registry — Faz-A analiz paketi

<!-- descriptor-registry-counts:v1 currentRoots=142 currentShallowLeaves=450 currentDefaults=181 currentRuntimeLeaves=186 currentMetadata=55 currentDashboard=66 currentTruthIssues=592 auditRoots=141 auditSemanticLeaves=1002 auditUnionPaths=1146 auditTruthIssues=589 -->

## Hüküm

Deckent config truth'ü bugün tek bir üretilebilir contract değildir. Authored/resolved TypeScript
tipleri, `createDefaultConfig()`, named resolver/default family'leri, manual validation,
`CONFIG_METADATA`, CLI discovery, Dashboard `CONFIG_FIELDS`, init/onboarding templates ve en/tr
schema docs birbirinden bağımsız yazılmaktadır. Config-completion audit'inin `G1B` sonucu doğrudur:
ürün kapanışı için tek canonical `ConfigDescriptorRegistry` ve onun TypeChecker/schema-aware
compiler/generator zinciri gerekir.

Önerilen registry düz bir metadata tablosu değildir. Stable field identity, reusable schema-node
graph, authored/resolved projection, default provenance, lifecycle, impact, sensitivity, i18n key,
surface eligibility, alias/migration ve proof disposition'ını aynı canonical graph'ta taşır.
`ACTIVE` bir alanın type veya runtime schema'sı opaque bırakılamaz. Dynamic namespace yalnız açık
key grammar + value schema + owner module ile kabul edilir; global open-world unknown key yoktur.

## Evidence sınırı

Bu paket iki ayrı zaman düzlemini bilerek ayırır:

- Dondurulmuş audit: `audit/config-completion-20260825`, koruma commit'i `d2e9a1247`, code base
  `ff48978fb…`. Sayım authority'si `field-universe.json`dır: 141 authored root, 1.002 semantic
  leaf-pattern, 1.146 normalized union path ve 589 expected-red truth diagnostic.
- Live lane base: `abed38c5…`. Burada `evaluation` root'u eklenmiştir: 142 root, shallow parser
  450 declaration leaf, 181 raw default leaf, 186 runtime-parser leaf, 55 metadata entry ve 592
  expected-red diagnostic. Live semantic 1.002/1.146 sayımı yeniden üretilmiş gibi
  gösterilmemiştir; registry compiler'ın ilk acceptance'ı bu census'i kendi base'inde yeniden
  üretmektir.

`589` veya `592`, defect sayısı değildir. Parser imported alias/mapped type, named defaults,
resolver semantics ve presence grammar'ını kayıpsız çözmediğinden false-positive-heavy'dir.
Audit'teki 755 optional ve 205 parent-present conditional default'suz alan review queue'dur;
missing-default defect'i değildir.

Exact digest ve sayımlar [SOURCE-MANIFEST.json](./SOURCE-MANIFEST.json) içindedir.

## Artefakt haritası

| Artefakt | Amaç |
|---|---|
| `SOURCE-MANIFEST.json` | Pinned audit ile live base'i count/digest düzeyinde ayırır |
| `DRIFT-REGISTER.md` | Canonical registry'nin kapatacağı deduplicated drift ve exact production finding'leri |
| `DESIGN.md` | Registry meta-schema, compiler invariants, complex-type grammar ve generated artifact contractı |
| `PLAN.md` | Gated ürünleştirme DAG'ı, acceptance ölçütleri ve MASTER 470/4210/471 bağları |
| `verify-artifacts.mjs` | Required file, source digest, count marker, receipt ve artifact-set digest kontrolü |
| `HANDOFF.md` | Versioned lane receipt, owner decision input'ları ve admission sınırı |

## Okuma sırası

1. `DRIFT-REGISTER.md`
2. `DESIGN.md`
3. `PLAN.md`
4. `HANDOFF.md`

## Mutation beyanı

Faz-A yalnız `docs/audits/descriptor-registry-2026-08-26/**` ve kapanışta izinli
`LANE-STATUS.md` dosyasını yazar. `src/**`, `tests/**`, `scripts/**`, `package.json`,
`docs/MASTER-PLAN.md`, `docs/en/**`, `docs/tr/**`, `.deckent/**`, `.brain/**` ve
`DIRECTIVES.md` salt okunmuştur. Faz-B `lab/descriptor-registry/**` prototipi bu teslimin parçası
değildir ve Faz-A validator'ı kapanmadan başlatılmaz.
