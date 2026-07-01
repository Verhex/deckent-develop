---
name: feedback-ccverify-full-affected-suite
description: "CC-verify (sprint sonrası dogfood-iş commit'lemeden önce) DEĞİŞEN modülü import eden TÜM mevcut test suite'ini koşmalı — yalnız yeni-test'leri değil. Sprint 290'da bu gap gerçek regresyonu push'a kaçırdı."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f6832032-e39d-4c20-8193-c5937c8c86cc
---

**Kural:** Bir sprint'in çıktısını CC-verify edip commit/push ederken, değişen modülleri import eden **mevcut** test dosyalarını da koş — yalnızca sprint'in eklediği yeni test'leri değil.

**Why:** Sprint 290 (F3-008/CORE-UNIFORMITY) `execute-dispatcher.ts` + `process-controller.ts`'i değiştirdi. CC-verify'da yalnız YENİ test'ler (`*-process.test.ts`, `token-usage-enrichment.test.ts`) koşuldu; mevcut `process-controller.test.ts` koşulmadı → "auto-runs reversible task → completed" testi 'failed'a döndü (autonomous task-path artık Brain-Eval'den geçiyor, mevcut mock under-provisioned kaldı) → regresyon commit+**push** edildi. Sonradan (bug-1 investigation'da) yakalandı; `e7bcad17` ile düzeltildi. 7fe780ca-vs-HEAD worktree-diff ile Sprint-290-introduced olduğu kanıtlandı.

**How to apply:**
- Commit öncesi: `git diff --name-only` → değişen src modüllerini bul → onları import eden test'leri de koş (yalnız yeni-eklenenleri değil). Gerekirse `npx vitest run <ilgili-dizin>` (geniş).
- "pre-existing failure" iddiasını **doğrula** (worktree @ base-commit'te koş) — varsayma; Sprint-290'da implementer "pre-existing" dedi ama Sprint-290-introduced'du. (Karşı-örnek: bug-2'deki e2e-failure GERÇEKTEN pre-existing'di — ikisini de worktree/focused-run ile ayırt et.)
- Bir tip/contract genişlemesi (ör. yeni eval-wire) mevcut mock'ları under-provision bırakabilir → değişen-modülün mevcut test'i bunu yakalar.

İlgili: [[feedback_trust_brain_eval_not_worker]] (disk-verify ground-truth), [[feedback_dual_perspective_dogfood_product]].
