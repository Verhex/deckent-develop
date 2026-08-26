# CI Repair + Test Slim Faz-A Handoff — 2026-08-26

## Sonuç

Faz-A `READY_FOR_OWNER_REVIEW` durumundadır. Windows checkout ve non-Linux fresh-build
workflow onarımları branch'te commitlidir; workflow sözleşme testleri `54/54 PASS`tir.
Secret Scan fixture'ı test-freeze nedeniyle değiştirilmemiş, exact Faz-B diff'i
`CI-ROOT-REGISTER.md` içinde mühürlenmiştir.

Bu teslim “CI yeşil” iddiası değildir. İncelenen main snapshot'ındaki üç teşhisli kökün
yanında 70 benzersiz kırmızı test dosyası vardır; branch workflow'ları henüz gerçek remote
admission koşusu görmemiştir. Faz-B lease `INACTIVE`tir ve hiçbir test/src/script dosyası
değişmemiştir.

<!-- HANDOFF-JSON
{
  "schemaVersion": 1,
  "receiptId": "ci-repair-test-slim-phase-a-2026-08-26-v1",
  "lane": "lane/ci-repair-20260826",
  "baseSha": "5fd085737e4e2b918bf3c601f29c61d9d521b229",
  "headSha": "210b2fc5fed0f5c66d97f5098a2855ca76501ede",
  "status": "READY_FOR_OWNER_REVIEW",
  "phase": "A",
  "phaseBLease": "INACTIVE",
  "scope": "workflow-repair-plus-test-load-analysis",
  "writeAllowlist": [
    ".github/workflows/**",
    "docs/audits/ci-repair-2026-08-26/**",
    "LANE-STATUS.md"
  ],
  "commits": {
    "workflow": "84ae1fab2",
    "auditContent": "9eb6326f5"
  },
  "workflowFilesChanged": 2,
  "testFilesChanged": 0,
  "srcFilesChanged": 0,
  "proposalCounts": {
    "inventoryFiles": 2923,
    "inventoryLines": 718051,
    "staticCalls": 37791,
    "retirementRows": 7,
    "mergeRows": 18,
    "wireRawFiles": 117,
    "wirePilotEligibleFiles": 115,
    "targetFileReduction": 62
  },
  "ciRuns": {
    "ci": {
      "id": 32956544242,
      "status": "failure"
    },
    "crossPlatformE2E": {
      "id": 32956544218,
      "status": "failure"
    },
    "secretScan": {
      "id": 32956544285,
      "status": "failure"
    },
    "branchAdmission": "NOT_RUN"
  },
  "findingCounts": {
    "total": 3,
    "critical": 2,
    "high": 1
  },
  "artifactDigests": {
    "CI-ROOT-REGISTER.md": "32ee6ac384637cea91a20cd10ca3c94449e5650c5bbef8046730d6ef0e1570c4",
    "TEST-SLIM-PROPOSAL.md": "24614d817dbe0260ba3a6c6510a05557433d39bb7d3ab1c4e91abfe644f3410e",
    "FINDINGS.md": "e06fa0dff1321c70bdd1c7c29ef96da315a5ae99ec4df891fb9f40dc4f9e83b8",
    "verify-artifacts.mjs": "19b34b687812d000722754b8eff857b6c90ae2eecfe4c6ba7b00f9f47c52a87c"
  },
  "verification": {
    "workflowContracts": "54/54 PASS",
    "artifactValidator": "RUN_AT_SEAL",
    "diffCheck": "PASS",
    "localFullSuite": "NOT_RUN_PHASE_A_TEST_FREEZE",
    "remoteAdmission": "PENDING_MAIN_LANE"
  },
  "openActions": [
    "owner_decide_TSR_001_through_007",
    "owner_decide_TSM_001_through_018",
    "main_lane_close_70_file_regression_or_supply_green_rebaseline",
    "main_lane_declare_phase_b_lease_active",
    "main_lane_run_remote_admission"
  ]
}
HANDOFF-JSON -->

`headSha`, dört digest'li audit artefaktının içerik commit'idir. Bu HANDOFF ve
`LANE-STATUS.md` onu tüketen ayrı settlement commit'inde kapanır; admission verifier'ı
`headSha`nın final branch HEAD'inin ancestor'ı olduğunu fail-closed doğrular.

## CI durumu

| Sınıf | Run | Sonuç | Dürüst yorum |
|---|---|---|---|
| CI | [32956544242](https://github.com/VerhexIO/deckent-develop/actions/runs/32956544242) | `failure` | Windows checkout kökü workflow'da onarıldı; 70-file bağımsız regression açık. |
| Cross-Platform E2E | [32956544218](https://github.com/VerhexIO/deckent-develop/actions/runs/32956544218) | `failure` | Windows longpaths + macOS fresh cleanless build branch'te; remote admission bekliyor. |
| Secret Scan | [32956544285](https://github.com/VerhexIO/deckent-develop/actions/runs/32956544285) | `failure` | Exact fixture diff'i hazır; test-freeze/lease nedeniyle uygulanmadı. |
| Local scoped | workflow contracts | `54/54 PASS` | `LOCAL_VERIFIED`; remote veya repo-green yerine geçmez. |

## Test-yükü karar yüzeyi

- Exact inventory: `2.923 dosya / 718.051 satır / 37.791 statik call`.
- Owner satırları: `TSR-001..007` — 2 raw retire + 5 assertion taşımalı retire.
- Assertion-preserving merge: `TSM-001..018` — `36 → 18` dosya.
- Wire profiling: raw 117; parity/öncelik ayrımından sonra 115; ilk hedef `≤78`.
- Toplam acceptance hedefi: `2.923 → ≤2.861` (`−62`, `−%2,12`).
- Runtime hedefi: yalnız green üç-run median sonrası critical path `−%15`; kırmızı
  12,20 dakika snapshot'ı kazanım kanıtı değildir.
- Byte-identical ve normalize-identical dosya sayısı `0`; assertion weakening veya
  basename'e bakarak toplu silme kabul edilmez.

## FINDING özeti

1. `CI-F001` CRITICAL — Darwin native execution-authority primitive'leri var, fakat
   `src/core/file-lock.ts` ve `scripts/clean.mjs` consumer wiring'i eksik.
2. `CI-F002` HIGH — 295 karakterlik v1 receipt path'i; dual-read, v2-write kısa şema
   önerisi yaklaşık 142 karakter.
3. `CI-F003` CRITICAL — üç workflow kökünden bağımsız 70-file CI regression paketi;
   slimming ile maskelenemez.

## Phase-B admission kilidi

Phase-B ancak iki koşul birlikte sağlandığında açılır:

1. Alperen `TSR`/`TSM` satırlarını exact ID bazında `approve/hold/deny` eder.
2. Ana-şerit açıkça `lease-aktif` der.

Bu iki koşuldan önce `tests/**`, `vitest.config.ts` ve
`scripts/security/secret-baseline*` değiştirilemez. Landing ayrıca tam lokal full-suite ve
20 named gate yeşili ister.
