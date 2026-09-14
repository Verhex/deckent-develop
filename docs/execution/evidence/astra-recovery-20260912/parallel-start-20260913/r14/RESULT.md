# 760 kapanışı ve sonraki onarım

MASTER3178 RECOVERY-DO-DOGFOOD-001 / parent120. Owner 2026-09-14 devam planını onayladı. Outcome OPEN; yalnız test/evidence preparation task terminal DONE.

## Kanıtlanan sonuç
Gerçek `node dist/cli/entry.js start --auto-approve`; do kullanılmadı. Task760-001, attempt026261f0-3f46-8443-8feb-f107ce7a9ab4, codex/gpt-5.6-sol. Worker testi main'e ulaştı: sha256 a9eec57090b1d34f6d9afbac8f17268ec11982d73a668ef7423bcbbe773c3453. Worker declared verification55/55 exit0; supervisor bu analizde yeniden koşmadı. Canonical accepted-result ve worker-result hash eşleşmeleri ölçüldü. Lifecycle COMPLETE,1/1DONE, coordinator absent, conflicts boş; archive ürün tarafından oluşturuldu. CLIexit0. Formal cross-provider closure iddiası yok.

R14 recovery: capture diagnostics + production runner wrapper provenance düzeltmesi beş dosyada.71/71 targeted exit0; isolated/main build exit0, tsc exit0. Gerçek760 production worker doğumu önceki759 pre-mount engelini geçti. Önceki run'a yazılan repo-içi loglar kaynak inventory'sine girmişti;760 gözlemleri /tmp altında tutuldu, kapanıştan sonra buraya arşivlendi.

## Zaman çizelgesi (UTC receipt/event observation)
- CLI başlangıç:07:06:05.635871; RUN_STARTED07:12:52.941 (~6dk47sn admission).
- TASK_ASSIGN07:13:57.978.
- worker-result captured07:18:51.437 (assignment→capture4dk53sn; exact provider compute duration değildir).
- workspace release07:20:26.003.
- finalizer receipt07:21:44.965; task settlement07:21:50.412.
- Sprint journal EXECUTE→EVALUATE07:38:50.199: settlement sonrası yaklaşık17dk.
- GATE_COMPUTED07:39:23.168; EVALUATE→RETRO07:39:23.280.
- RETRO→CLEANUP07:39:33.220; terminal COMPLETE07:42:34.120.
- CLIexit07:42:36.578408; monotonic2240.904876s (37dk21sn). Wall timestamp farkı36dk31sn: clock-domain farkı korunur, süreler karıştırılmaz.
- MaxRSS8309364KiB (~7.92GiB, wrapper child aggregate high-water; worker RSS değildir).

ÖNEMLİ:07:31 FIX checkpoint'i journal07:38 EVALUATE olayıyla sıralı değil. Event emission time, gerçek faz giriş zamanı diye kabul edilmez.17dk farkı belirli fonksiyona atfetmek için call-level evidence eksik. Son33sn tüm evaluation maliyeti diye raporlanamaz.

## Kullanım
Accepted result provider-adapter: fresh input87358, cached input838144, output9935,total935437; reasoning2524 ayrı raporlanmış, tekrar toplama yok. SubscriptionUSD0 quota availability veya maliyetsizlik kanıtı değil. Dashboard97293 fresh+output; total etiketi cache ayrımını belirtmiyor.

## Açık bulgular
1. BLOCKS_CURRENT_DONE: task settlement sonrası supervisor/reconciliation gecikmesi; repeated native traversal olası katkı, toplam gecikme kök nedeni henüz kanıtlanmadı.
2. BLOCKS_CURRENT_DONE: native-history gerçek host-proof profile eksik; runtime repair için exact production proof gerekir.
3. Owner-admitted subsequent surface package: ActivityFeed.tsx:44,66-113 browser-time inferred spawn/writing; first action baseline missing. New attempt olmadan event gösterilebilir.
4. Owner-admitted subsequent surface package: .tasks task EXECUTING kalırken checkpoint DONE; status freshness ve terminal authority projection tutarsız.
5. Owner-admitted subsequent surface package: archive result/usage/log erişimi eksik; canonical .local korunuyor. Süreli .tasks görünümü yalnız read-only projection olmalı; execution input olarak tekrar sayılmamalı.
6. KPI completed ratio1.0% for1/1 + cache metric semantics: owner transcript finding, implementation verification pending.

## Onaylı DAG / uygulama sınırı
A (bu kayıt): evidence/timing closure. B: existing captured logs ve producer call graph üzerinden post-settlement read amplification attribution; clock domains/source freshness ayrımı. C depends B: dedicated native-custody-history host proof profile + operation-scoped reuse implementation, aynı closure DAG. D depends C: real compiled native temporary corpus verification then bounded real start; compare end-to-end/worker/host stages, CPU/RAM,usage,closed settlement. E depends D: result/usage/log projection and dashboard truth package. F depends D+E:8task real start proof;15/30 yok.

C candidate scope: src/core/task-attempt-custody-posix-adapter.ts, src/core/task-attempt-custody-store.ts, src/core/custody-read-snapshot.ts; scripts/production-wiring-host-proof-harness.mjs and exact dedicated profile module/tests. Native binding widening only if operation-lifetime cannot safely be represented and documented bounded dependency requires it. No global cache/raw fd exposure. Preserve final reread, immutable before/after identity, private ownership, tenant/project/attempt/generation, close-on-failure. Across-await reuse forbidden unless explicit lifetime proof. Linux/macOS native fixtures; Windows adapter honest unsupported/HOLD until evidence. No security check removal to hit deadline.

Worker/provider/concurrency config-resolved. No new run until exact registered host-proof contract and task scope fit without borrowing unrelated identities. One bounded changed-evidence attempt; no unchanged retry. No auth mutation, manual runtime/receipt edit, kill/cleanup, commit/push. Notes/docs allowed by owner; code through dogfood or existing explicitly typed recovery seam when required. MASTER disposition unchanged.
