# 08 — Security, Approval and Governance

## Approval coverage haritası

| Yol | Current durum |
|---|---|
| Agentic worker `run_bash` | Gerçek disk-backed gate ve external-decision poll ile wired; shell/git/network sınıfları guard edilir |
| Sprint worker spawn | Approval env/scope taşınır; sprint/task scoped grant kullanılır |
| Terminal approval UI | Production consumer ve cards/channel wiring var |
| MCP writes | Writer lease choke point; non-read-only tools fail-closed |
| Generic core tool dispatch | ApprovalBroker wiring comment'te future work; caller seam'ine bağlı |
| Goal approval | Creator identity eksikliği approval-required item'ları park edebilir |
| Promotion/demotion | Kalıcı agent/skill mutation approval/policy/canary olmadan yapılabilir |
| Connectors | Bazı clients/adapters var; gerçek transport/callback closure düzensiz |

## Creator/principal gap

CLI-created Goal `createdBy` taşımıyor; approval request factory verified owner zorunlu kılıyor. Live Goal açıldıktan sonra risk-tagged work bile owner authority alamayabilir. `Principal` canonical lifecycle'ın required field'ı olmalı; local solo fallback explicit authority ile verilmelidir.

## RBAC ve capability policy

RBAC default disabled olduğunda enforcement no-op; capability broker least-privilege default'u permissive. Role vocabulary'leri farklı katmanlarda ayrışıyor: viewer/operator/admin; brain/auditor/worker; capability role mapping. Enterprise modda canonical principal/role/capability translation ve fail-closed policy gerekir.

## Multi-tenant kritik gap

Memory modelinde global entry ID, nullable tenant ve tenant-scope taşımayan tag/relation/history tabloları vardır. API req yoksa unfiltered search yapabilir; MCP memory resource bütün memory kayıtlarını okur. Bu, enterprise tenant isolation için **High/Critical** product riskidir. Tenant authority yalnız API boundary'de değil store key, index, relation, FTS ve export/resource katmanında zorunlu olmalıdır.

## Promotion governance

Sprint finalizer outcome'ları kaydeder ve PromotionPipeline ile kalıcı agent/skill assets'i değiştirebilir. `minSprints` criterion tanımlı fakat evaluation'da kullanılmıyor. Promotion için staged candidate, independent evaluator, policy/approval, canary traffic, rollback, immutable provenance ve revocation gerekir.

## Güvenlik verdict'i

Security building blocks güçlü, fakat **runtime-wide governance closure yoktur**. ApprovalBroker'ın varlığı tek başına governance-by-construction kanıtı değildir; tüm effectful Operation'ların aynı policy choke point'inden geçtiği producer/consumer trace edilmelidir.
