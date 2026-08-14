# Memory — 15 KALICI KANUN (Alperen-seçimi; genişletme yalnız Alperen-onayıyla)

> Bu repo için canonical dogfood core-memory authority bu dosya ve aynı dizindeki referanslarıdır.
> Provider/host HOME kopyaları yalnız projection'dır; product/user memory değildir.
> İş-takibi BURADA DEĞİL → SSOT = `docs/MASTER-PLAN.md`. 3-Yasa'nın tam metni +
> günlük sprint-kuralları = host instruction adapterı (`AGENTS.md` / `CLAUDE.md`).

1. **[Ölçek + MVP-yasağı + agentic-OS](law_scale_no_mvp_agentic_os.md)** — milyon-ölçek/cross-platform baştan; MVP ASLA; hedef-kimlik = AI runtime-ecosystem/agentic-OS (Trinity 3-yüz).
2. **[ADR'ler ihlal edilemez](law_adr_inviolable.md)** — spec/NL yazmadan ÖNCE alan-ADR-recall zorunlu; çelişki = önce amendment-önerisi; ADR bugünü+yarını belgeler.
3. **[Kanıt=çalışan kod + onay-akışı](law_approval_gated_working_code.md)** — test-yeşili kanıt DEĞİL; madde→rapor→Alperen-onayı→sonraki madde; onaysız atlama/erken-zafer YASAK.
4. **[Türkçe + SSOT](law_turkish_and_ssot.md)** — anlatım hep Türkçe (teknik terim EN); tüm iş AYNI GÜN `docs/MASTER-PLAN.md` satırı olur.
5. **[Test ≤16GB](feedback_vitest_16gb_local_cap.md)** — lokal test-koşumu 16GB'ı aşamaz; full-suite tek-process yasak; VITEST_MAX_FORKS=2.
6. **[Fix-döngüsünü kır](feedback_break_sprint_bug_cycle.md)** — yalnız-bug-fix sprint'i yasak; her sprint ≥1 ileri/vizyon işi taşır.
7. **[Terimleri açıkla](feedback_explain_technical_terms.md)** — Alperen'e teknik terimler inline-açıklamalı anlatılır.
8. **[Mikro-task + dependency DAG](feedback_scale_up_autonomous.md)** — task sayısı ve paralellik
   instruction metninden değil effective config, dependency DAG, collision/resource policy ve
   provider capacity'den çözülür; tek-sorumluluklu mikro-task disiplini korunur.
9. **[Proof-of-Function + engel-bildirimi + Brain-karar](law_proof_blockers_brain_eval.md)** — user-surface DONE=gerçek-binary koşu; yönlendirmeden önce blocker'ları söyle; karar Brain+disk-verify.
10. **[0-hardcode](feedback_zero_hardcode_live_data.md)** — model-adı/akış-değeri literal'i kod-yolunda YASAK; tek kaynak registry+config (ADR-G-036 + ratchet).
11. **[Memory-iş ayrımı](law_memory_vs_work_separation.md)** — memory-adayı her kayıtta sor: iş mi (→MASTER-PLAN) kalıcı-durum mu (→memory)? Mutlaka Alperen'e danış.
12. **[Kod+iş-özeti birlikte](feedback_code_plus_business_summary.md)** — her işi/seçeneği/raporu hem kod-detayı hem düz-Türkçe iş-tanımıyla sun; Alperen kodu açmadan karar verebilsin (Alperen 2026-07-16).
13. **[Alp Discipline = karar-çapası](law_alp_discipline_anchor.md)** — `alp-discipline/ESSENCE.md` karpathy-discipline gibi kalıcı tempo-parçası; negative-space → sınır-içi-alternatif → kayıpta-dur → irtifa-ilanı her karar-sınırında (Alperen 2026-07-21).
14. **[Cross-provider xverify = netleştirme seçeneği + §12.2 production-closure](feedback_xverify_clarification_option.md)** — Codex/Brain ciddi kök-neden veya tasarım belirsizliğinde farklı provider Fable 5 ile ikinci görüş alabilir; sonuç karar/authority devri değildir. Production doğrulama gate'i olarak kapanış tiptedir (verdict+call+usage+closed-settlement+durable-receipt; HOLD/UNCLEAR kapanış değildir, same-provider yasak); Fable→Sol CONFIRMED/ALLOW receipt `…3426cf20` kanıtlandı (2026-08-13, §12.2).
15. **[Disk-kanıt-önce-iddia](feedback_disk_evidence_before_claims.md)** — status/projection çıktısı kanıt DEĞİL; canlılık/ilerleme iddiası ancak hb-mtime + kill-0 + log-tail + result disk doğrulamasıyla; varsayım etiketsiz söylenmez (Alperen 2026-08-11).
