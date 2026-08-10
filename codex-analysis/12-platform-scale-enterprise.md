# 12 — Platform, Scale and Enterprise

## Platform matrix

| Context | Current evidence | Verdict |
|---|---|---|
| Linux native | Node 24/26 CI, tmux+subprocess E2E, packed install | En güçlü; current red debt nedeniyle uncertified |
| macOS native | tmux E2E, packed install | Subprocess/Desktop signed package eksik |
| Windows native | Packed install required; limited allow-fail unit subset | Backend/PTY/service/Desktop proof eksik |
| WSL2 | Ayrı leg yok; Ubuntu inference | UNKNOWN/HOLD |
| Docker backend | Opt-in live E2E source'ta | Workflow-required değil; UNKNOWN-LIVE |
| OCI/service/remote | Adapter/plan parçaları | NOT CERTIFIED |
| Offline/airgap/proxy | Init provider CLI network installs yapabilir | NOT PROVEN |
| Multi-node enterprise | HA/load/DR proof yok | NOT-STARTED/PARTIAL contracts |

## Process-local control plane

API job registry, rate limiter, SSE subscribers ve bazı RunFlow states process-local Map/Set yapılarıdır. Enterprise defaults tenancy/RBAC off ve düşük concurrency değerleri taşır. Bu local-first solo mode için meşru olabilir; fakat multi-node/million-scale claim için platform adapter arkasında distributed authority gerekir.

## Scale evidence

Mevcut load tests küçük synthetic claim/result lookups ve bazı mock/inline bench'lerden oluşur. Gerçek tenant/project/connection cardinality, provider outage, cancellation storm, noisy neighbor, backpressure, recovery backlog, storage growth ve cost curves ölçülmemiştir. Synthetic microbench million-scale proof üretmez.

## Enterprise requirements

- Tenant composite keys ve fail-closed isolation her store/resource/export'ta.
- Distributed lease/fence, idempotency ve execution authority.
- Durable event/outbox ve horizontally scalable subscriptions.
- Quota/rate/budget admission global consistency.
- Encryption/key rotation, retention, legal hold, deletion/export proofs.
- RPO/RTO, failover/failback, backup restore drills.
- SLI/SLO/error budgets ve workload classes.
- Load/chaos/DR/noisy-neighbor platform matrix.

## Every Environment ilkesi

Her adapter için status `supported`, `degraded` veya `unsupported` olmalı; silent fallback yoktur. Linux sonucu Windows/WSL/Docker'a inference edilmemelidir. Platform certification işin sonunda eklenen faz değil; her work package'ın definition/acceptance/CI matrix alanıdır.
