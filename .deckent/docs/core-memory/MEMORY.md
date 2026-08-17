# Memory — 15 KALICI KANUN (Alperen-seçimi; genişletme yalnız Alperen-onayıyla)

> Bu repo için canonical dogfood core-memory authority bu dosya ve aynı dizindeki referanslarıdır.
> Provider/host HOME kopyaları yalnız projection'dır; product/user memory değildir.
> İş-takibi BURADA DEĞİL → SSOT = `docs/MASTER-PLAN.md`. 3-Yasa'nın tam metni +
> günlük sprint-kuralları = host instruction adapterı (`AGENTS.md` / `CLAUDE.md`).

1. **[Ölçek + MVP-yasağı + agentic-OS](law_scale_no_mvp_agentic_os.md)** — milyon-ölçek/cross-platform baştan; MVP ASLA; hedef-kimlik = AI runtime-ecosystem/agentic-OS (Trinity 3-yüz).
2. **[ADR'ler ihlal edilemez](law_adr_inviolable.md)** — spec/NL yazmadan ÖNCE alan-ADR-recall zorunlu; çelişki = önce amendment-önerisi; ADR bugünü+yarını belgeler.
3. **[Kanıt=çalışan kod + DAG-sınırı onayı](law_approval_gated_working_code.md)** — test-yeşili kanıt DEĞİL; her madde kanıtıyla raporlanır (rapor seyrelmez); Alperen-onayı approved-DAG sınırında (scope/authority/destructive/external değişince); onaysız atlama/erken-zafer YASAK (amendment 2026-08-17).
4. **[Türkçe + SSOT](law_turkish_and_ssot.md)** — anlatım hep Türkçe (teknik terim EN); yalnız owner-admitted outcome/residual AYNI GÜN `docs/MASTER-PLAN.md` satırı olur; finding otomatik iş değildir (amendment 2026-08-17).
5. **[Test ≤16GB](feedback_vitest_16gb_local_cap.md)** — lokal test-koşumu 16GB'ı aşamaz; full-suite tek-process yasak; VITEST_MAX_FORKS=2.
6. **[Fix-döngüsünü kır](feedback_break_sprint_bug_cycle.md)** — tekrarlayan reaktif fix-döngüsü yasak; incident/release-closure/CI-repair/recovery paketleri yalnız kendi closure'ını taşır (zorla feature yok); forward işi ayrı committed outcome (amendment 2026-08-17).
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

- [Kısır-döngü darboğazlarını bildir](feedback_report_bottleneck_loops.md) — max_workers=1/tek-task/FIX-erişilemez/attribution-döngüsü görülür görülmez Alperen'e raporlanır (2026-08-17).
- [XVerify claim disiplini](feedback_xverify_claim_discipline.md) — verify COMMIT'ten ÖNCE --files+--diff ile; nokta-iddia + eşlik eden target; evrenseller makine-gate işi (2026-08-17).
---

**Referans kararlar (law değil — kalıcı proje-durumu):**
- **[Closure OS sidecar-ledger foundation](project_closure_os_foundation.md)** — Phase-4 foundation COMPLETE (yalnız mekanizma, ürün wiring değil); root-of-trust = reviewed-parent; **HOLD ≠ closure**; mutation yalnız authenticated batch + append-only gate ile; Phase-5 (signer/gerçek receipt) KURULMADI; genesis PR #127 MERGED + owner-verified public anchor main'de (`88637d5d6`); sıra: Paket B (`RUN-POLICY-DELIVERY-001`) → Phase-5 writer → tek approval → append (güncelleme 2026-08-17).
- **[Owner model policy — provider-scoped explicit-active](project_owner_model_policy.md)** — `ModelActivationStore` (v1→v2) provider başına `implicit-active` vs `explicit-active` policy mode taşır; explicit-active'te yeni tespit/katalog modeli havuza ASLA kendiliğinden giremez; **tek authority = ModelActivationStore** (paralel allowlist yok, KANUN 10); `default_model` TERCİH'tir, sert sınır owner active-set'idir; enforcement = bootstrap snapshot injection → registry read-filter tombstone → forceModel + pre-dispatch `MODEL_INACTIVE` typed HOLD (sessiz ikame yok). FAZ-0 kanıtlı `VERIFY` (32+248 yeşil, canary 5/5); FAZ-1 keyless local-llm Terminal + worker + lifecycle CLI ve config-resolved GPU placement zinciri gerçek Qwen ile kanıtlandı (Sprint-533 COMPLETE, worker receipt `worker-execution:e50422ac…`, 29/29 scoped test, build yeşil). Local daemon owner isteğiyle kapalıdır; wiring kalıcıdır (2026-08-16).
- **[Dev operating contract — 2026-08-17 onayları](project_dev_operating_contract.md)** — Alperen dört onay: (a) kanun 3/4/6 amendment (uygulandı), (b) DOGFOOD_MODE=OFF + Paket A→B, (c) Paket B ürün-kodu (487-026 task-carried pattern), (d) landing + dirt disposition. Canonical policy: `docs/governance/deckent-dev-operating-policy.md`; host parity gate: `scripts/lint-operating-policy.mjs`. Çalışma modeli: Brain=Fable-5 max effort, Sonnet/Opus subagent, kritik eleştiride Sol xverify; ON-dönüş = Paket B DONE + canary.
