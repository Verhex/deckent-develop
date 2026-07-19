# Memory — 11 KALICI KANUN (Alperen-seçimi, 2026-07-14; genişletme yalnız Alperen-onayıyla)

> İş-takibi BURADA DEĞİL → SSOT = `docs/MASTER-PLAN.md`. 3-Yasa'nın tam metni + günlük sprint-kuralları = `CLAUDE.md` (tek-yer).
> Eski konu-dosyaları (gotcha/vizyon/tarihçe, ~80): `memory/archive/` — yalnız gerekirse bak, kural-kaynağı DEĞİL.

1. **[Ölçek + MVP-yasağı + agentic-OS](law_scale_no_mvp_agentic_os.md)** — milyon-ölçek/cross-platform baştan; MVP ASLA; hedef-kimlik = AI runtime-ecosystem/agentic-OS (Trinity 3-yüz).
2. **[ADR'ler ihlal edilemez](law_adr_inviolable.md)** — spec/NL yazmadan ÖNCE alan-ADR-recall zorunlu; çelişki = önce amendment-önerisi; ADR bugünü+yarını belgeler.
3. **[Kanıt=çalışan kod + onay-akışı](law_approval_gated_working_code.md)** — test-yeşili kanıt DEĞİL; madde→rapor→Alperen-onayı→sonraki madde; onaysız atlama/erken-zafer YASAK.
4. **[Türkçe + SSOT](law_turkish_and_ssot.md)** — anlatım hep Türkçe (teknik terim EN); tüm iş AYNI GÜN `docs/MASTER-PLAN.md` satırı olur.
5. **[Test ≤16GB](feedback_vitest_16gb_local_cap.md)** — lokal test-koşumu 16GB'ı aşamaz; full-suite tek-process yasak; VITEST_MAX_FORKS=2.
6. **[Fix-döngüsünü kır](feedback_break_sprint_bug_cycle.md)** — yalnız-bug-fix sprint'i yasak; her sprint ≥1 ileri/vizyon işi taşır.
7. **[Terimleri açıkla](feedback_explain_technical_terms.md)** — Alperen'e teknik terimler inline-açıklamalı anlatılır.
8. **[20-40 mikro-task](feedback_scale_up_autonomous.md)** — sprint = 20-40 mikro task + Dependencies grafiği (8 paralel worker); 3-5 yüklü-task ANTİ-PATTERN.
9. **[Proof-of-Function + engel-bildirimi + Brain-karar](law_proof_blockers_brain_eval.md)** — user-surface DONE=gerçek-binary koşu; yönlendirmeden önce blocker'ları söyle; karar Brain+disk-verify.
10. **[0-hardcode](feedback_zero_hardcode_live_data.md)** — model-adı/akış-değeri literal'i kod-yolunda YASAK; tek kaynak registry+config (ADR-G-036 + ratchet).
11. **[Memory-iş ayrımı](law_memory_vs_work_separation.md)** — memory-adayı her kayıtta sor: iş mi (→MASTER-PLAN) kalıcı-durum mu (→memory)? Mutlaka Alperen'e danış.
12. **[Kod+iş-özeti birlikte](feedback_code_plus_business_summary.md)** — her işi/seçeneği/raporu hem kod-detayı hem düz-Türkçe iş-tanımıyla sun; Alperen kodu açmadan karar verebilsin (Alperen 2026-07-16).

> ⏳ **GEÇİCİ** (kanun DEĞİL) — [Sprint prompt-kalite gözetimi](temp_sprint_prompt_quality_watch.md) — her sprintte prompt/persona/maliyet + iş/işçilik analizi sürekli; **3 günde 1 durum-hatırlat (sonraki: 2026-07-20)**; hedef-kalite VEYA iş-done → SİL (Alperen 2026-07-17).
