# 07 — Provider, Model, Routing and Admission

## Güçlü yönler

`execution-admission.ts` fail-closed ve exact identity odaklıdır: tenant/run/task/call/attempt, provider/model, reachability, usage/limits ve budget reservation birlikte çözülmeden admission vermez. Provider authority composition missing source/termination/policy durumunda typed HOLD üretir. Model registry ve routing v3 vocabulary sistemi provider-neutral tasarım yönünü destekler.

## Mevcut gap'ler

### Live provider authority dar

Local production bootstrap'ta exact authority source pratikte Claude host subscription ağırlıklıdır. Diğer provider'lar için eşdeğer entitlement/account/reachability/capacity evidence closure kanıtlanmamıştır.

### Observation backend bağımlılığı

Provider execution observation producer Docker spawn backend'inde bulunur. TaskResultSettlement de Docker-specific backend reference taşır. Subprocess/tmux/native/remote/OCI için eşdeğer producer→store→consumer→settlement matrisi yoktur.

### Live DB adoption

Source schema v2 `run_id` ve `retired` alanlarını taşır; live readonly DB v1 ve 53 legacy interval içerir. Migration source'ta tanımlıdır fakat current live DB'ye uygulanmış adoption proof yoktur. Legacy evidence run-owned sayılmamalıdır.

### Capacity ve routing health

Provider concurrency reader kapasiteyi explicit unknown/HOLD tutar. Routing v3 live health/latency signal gate'i hardcoded `false`dır. Outcome cells kullanılabilir; gerçek provider health/capacity/rate-limit signal'ı decision'a girmiyor.

### Config truth

Default config brain/worker provider literal'ları taşır; current dogfood config terminal/run_flow/autonomous/nervous/training gibi bazı flag'leri açmıştır. Default ile local dogfood effective config ayrımı dokümante edilmeli; instruction metni model catalogı olmamalıdır. Global config read/write path asymetrisi ve corrupt-config load sırasında self-heal write davranışı ayrıca authority riskidir.

## Hedef provider matrix

Her provider/backend çifti için aynı gate:

1. Registry identity ve capability evidence
2. Auth/account/entitlement authority
3. Reachability ve live health
4. Usage/limit/capacity
5. Finite budget reservation
6. Exact route/model receipt
7. Provider-runtime observation start/end
8. Settlement ve reconciliation
9. Cross-provider XVerify capability

Eksik satır provider fallback'e dönmemeli; typed `unavailable/HOLD` üretmelidir.
