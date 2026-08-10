# 16 — Dependency-Bound Work Package DAG

## DAG

```text
WP0 Canonical Reconciliation
 └─ WP1 Trust Signal Floor
     ├─ WP2 Runtime Stabilization
     ├─ WP3 Canonical Lifecycle Authority
     │   ├─ WP4 Identity + Approval + Tenant Authority
     │   │   ├─ WP6 Learning / Promotion Governance
     │   │   └─ WP7 Product Surface Cutover
     │   ├─ WP5 Live Goal-v2 Closure
     │   └─ WP8 Provider / Backend Matrix
     └─ WP9 Every Environment + Release Proof Track

WP2 + WP3 + WP9 feed WP10 Runtime/Platform Certification
WP4 + WP5 + WP7 + WP8 feed WP10
WP6 + WP10 feed WP11 Publish/Autonomy Settlement
```

## Paket tanımları

| WP | Outcome | Depends | ROM | Exit gate |
|---|---|---|---:|---|
| WP0 | MASTER current truth ve tek READY critical path | — | 3–6 ew | Zero orphan owner decision; ≥1 READY root |
| WP1 | Test/CI/docs/P6 trust floor | WP0 | 4–8 ew | Repeated clean CI, exact baseline, no hidden jobs |
| WP2 | Scheduler/result/recovery stabilization | WP1 | 8–14 ew | Intervention-free ladder + crash proofs |
| WP3 | Canonical lifecycle + Operation authority/adapters | WP1 | 12–20 ew | End-to-end queryable lineage and migration proof |
| WP4 | Principal/Tenant/Capability/Approval/Budget/Audit | WP3 | 8–14 ew | Every effectful Operation fail-closed policy |
| WP5 | Real Goal-v2 planner/executor/accept/delivery | WP3, WP4 | 8–14 ew | Real provider/binary Goal journey |
| WP6 | Trace→learning→promotion governance | WP4, WP8 | 5–8 ew | minSprints+verify+canary+rollback+receipt |
| WP7 | Shared app service + Terminal/Desktop/Assistant journeys | WP3, WP4, WP5 | 14–24 ew | Surface parity and negative-space matrix |
| WP8 | Provider-general evidence/capacity/backend settlement | WP3, WP5 | 8–14 ew | Required provider/backend matrix green or honest unsupported |
| WP9 | Xplat/Desktop/supply-chain proof track | WP1 | 12–20 ew | Native matrix, signed artifacts, rollback, soak |
| WP10 | HA/scale/tenant/DR certification | WP2–WP5, WP7–WP9 | 16–30 ew | Owner-signed SLO/load/chaos/RPO/RTO evidence |
| WP11 | Publish/autonomy settlement | WP6, WP10 | 3–6 ew | Independent verification + release receipt |

`ew = engineer-week`. ROM'lar overlap içerir ve calendar duration değildir.

## Cross-cutting gates

Her WP aynı acceptance dimensions'ı taşır:

- Dogfood + end-user dual journey
- macOS/Linux/Windows/WSL + adapter status
- Solo + enterprise tenant
- i18n/a11y/security/privacy
- Crash/restart/cancel/rollback
- Real binary/provider evidence
- Documentation/MASTER/receipt update

Bir child failure olduğunda parent capability `COMPLETE` olamaz.
