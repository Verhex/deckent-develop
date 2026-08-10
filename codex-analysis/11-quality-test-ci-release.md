# 11 — Quality, Test, CI and Release

## Test truth

Current failure ratchet, test koşmadan okunabilen en güncel canonical sayı olarak 115 dosyada 591 failure taşır. PAZARTESI'nin 564 sayısı aynı günün daha eski snapshot'ıdır. Bu fark plan/evidence staleness örneğidir; “P6 kapandı” commit'i baseline'ı değiştirmiş olsa da bütün suite'in yeşil olduğu anlamına gelmez.

Root Vitest kapsamı yaklaşık 2,530 test dosyasıdır; Dashboard ve Desktop ayrı config'ler taşır. Static/runtime hermeticity mekanizmalarına ciddi yatırım vardır. Fakat conditional skips, dist-dependent real-binary smokes ve KPI smoke'daki skip paths yanlış yeşil riskini taşır.

## CI riskleri

- Önceki Type Check failure'ı dependent jobs'ı gizleyerek yüzlerce failure'ın görünmesini geciktirmiştir.
- Docs/scripts job'larında `continue-on-error` alanları vardır.
- Windows native CI allow-failure/limited subset'tir.
- Dashboard dependency install'in bazı yolları fail-soft'tur.
- Desktop typecheck/test/build/package root CI/release gate'inde yoktur.
- Docker live E2E opt-in koşulludur ve workflow'da zorunlu kanıt değildir.

## Cross-platform güçlü kanıt

`cross-platform-e2e.yml` macOS/Linux backend tests ve macOS/Linux/Windows packed global install smoke taşır. Packed smoke gerçek `npm pack → isolated global install → init → doctor` yolunu çalıştırır. Bu korunması gereken güçlü proof-of-function örneğidir.

Buna rağmen ayrı WSL leg yoktur; Ubuntu parity inference kullanılır. macOS subprocess excluded, Windows backend/Electron/ConPTY/service proof yok, Docker/OCI/offline/proxy matrix zorunlu değildir.

## Release truth

Release workflow tek npm publish authority, exact-SHA CI+xplat success, dependency audit, OIDC trusted publishing ve provenance kullanır. Bu iyi bir supply-chain foundation'dır.

Gap'ler:

- `build:all` Desktop içermez.
- `prepublishOnly` plain `build` kullanır; release workflow `--ignore-scripts` ile bu farklılığı bypass eder.
- Desktop/service/container artifacts unified release train'de değildir.
- SBOM, signature verification, reproducible build, update/rollback channel ve full platform soak yoktur.
- Doctor Node >=18'i pass sayarken package/Identity >=24 ister.

## Quality gate sırası

1. Failure baseline'ın yeni failure kabul etmeyen ratchet olarak korunması.
2. Package-by-package red debt reduction; her paket production slice ile dependency-bound.
3. Fail-soft CI ve untyped skip'lerin reason/owner/expiry ledger'ı.
4. Repeated clean-checkout CI; no hidden dependent jobs.
5. Real-binary, crash, platform ve release proof gates.
6. Baseline sıfırlanana kadar autonomy/release readiness `HOLD`.
