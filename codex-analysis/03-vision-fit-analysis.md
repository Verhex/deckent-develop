# 03 — Vision Fit Analysis

## Hedef

Vision'ın nihai ürün tanımı tutarlıdır: provider-neutral, local-first Agent OS; Assistant, Worker ve Platform experience tek kernel üzerinde; canonical lifecycle `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`; governance-by-construction; Terminal/Desktop primary ve Dashboard monitoring-only; bütün environment ve ölçek katmanları first-class.

## Capability uyumu

| Capability | Current state | Hüküm |
|---|---|---|
| Provider-neutral local-first | Provider abstractions güçlü; live authority/observation bazı yollar ve Claude/Docker ağırlıklı | PARTIAL |
| Trinity, one kernel | Surface/adapters var; lifecycle authority'leri parçalı | PARTIAL |
| Canonical lifecycle | Goal/Mission ve Flow/Run parçaları var; durable Operation yok | UNWIRED |
| Governance-by-construction | Admission/receipts/approval var; tool/promotion/memory coverage eksik | PARTIAL |
| Terminal/Desktop primary | REPL tool surface ve Desktop var; Goal product closure yok | PARTIAL |
| Dashboard monitoring-only | Mimari yön ve surface tasarımı uyumlu | EVIDENCE-CONFIRMED (doctrine/code intent) |
| Closed learning loop | Outcomes/cells/promotion wired; trace pipeline ve governance kapalı değil | PARTIAL |
| Every Environment | mac/Linux/Windows packed proof; WSL/native adapter completeness ve matrix eksik | PARTIAL/HOLD |
| Million-scale enterprise | Tenant/HA/capacity contracts var; fail-closed isolation ve scale proof yok | PARTIAL/HOLD |
| Assistant daily work | Generic adapters var; canonical journey/outcome planı yok | NOT-STARTED/PARTIAL |
| Business system execution | Connector/capability parçaları var; end-to-end product journey yok | PARTIAL |
| UserMemory/profile/SOUL | Ürün belleği ile dogfood memory ayrımı tanımlı; user journey planı eksik | NOT-STARTED |

## Dual Lens değerlendirmesi

Dogfood lens güçlüdür: sprint lifecycle, workers, memory, nervous, routing ve settlement repository'nin büyük bölümünü oluşturur. End-user lens daha zayıftır: Goal oluşturmanın sonucunu günlük işte alan kullanıcı, non-code business system eylemi, durable delivery receipt, tenant-bounded user memory ve yormayan full-control experience için canonical acceptance journeys eksiktir.

Bu asimetri sürerse ürün, vision'ın açık falsifier'ı olan “coding-only orchestration tool”a daralır. Her kernel work package'ı en az iki acceptance journey taşımalıdır:

- Dogfood: Deckent kendi repository işini aynı authority ile yürütür.
- Product: solo kullanıcı ve enterprise tenant aynı lifecycle'ı surface adapter üzerinden kullanır.

## Vision konusunda öneri

Vision yeniden yazılmamalıdır. Target/current ayrımı korunmalı; capability traceability ve falsification sinyalleri executable assurance gates'e bağlanmalıdır. Plan, vision'ı küçük feature listesine değil, lifecycle closure ve product journeys'e çevirmelidir.
