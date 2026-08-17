---
name: feedback-xverify-claim-discipline
description: XVerify claim'i ekli kanıttan yerel-karar-verilebilir nokta-iddia olmalı; verify COMMIT'ten ÖNCE --diff'le koşulur
metadata:
  type: feedback
---

2026-08-17 canlı kanal onarımı sonrası dört Sol koşumu dürüst UNCLEAR verdi ve hepsi
claim/kanıt-yazım hatasıydı: (1) A/B **görüş sorusu** — xverify karar vermez (kanun 14);
(2) `--target` yolları `filesChanged` sayılınca salt-analiz claim'inin evidence-map'i
bozuldu (B6); (3) "hiçbir yerde / tüm string'ler" gibi **evrensel** önermeler excerpt'ten
karar verilemez; (4) landed commit SONRASI `--files`'lı kod-claim'i "changed-without-diff"
sayıldı — working-tree diff boş olduğundan `--diff` kanıt lane'i kapalıydı (receipt
`…e66a3619`).

**Why:** Verifier yalnız ekli host-bound kanıttan hüküm kurar; kapsam = kanıtın kapsamı.

**How to apply:** (a) XVerify'ı **commit'ten ÖNCE** koş: `--files` + `--diff` birlikte —
verify→land sırası. (b) Claim = ekli aralıkta GÖRÜNEN somut yapı/davranış nokta-iddiası;
her iddiaya onu gösteren `--target` eşlik eder. (c) Evrenseller (0-hardcode, tam i18n,
tek-importer) makine-gate'lere (lint/grep/test) kanıtlatılır, xverify'a sorulmaz.
(d) Salt-analiz claim'ine dosya listesi ekleme. Bkz [[feedback-xverify-clarification-option]].
