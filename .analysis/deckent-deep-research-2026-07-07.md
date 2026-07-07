# Deckent — Deep Research Raporu (Dış Kanıt Turu)

> Tarih: 2026-07-07 · Yöntem: deep-research workflow — 109 ajan, 6 arama açısı, 26 kaynak fetch, 129 claim çıkarıldı, 25'i 3-oylu adversarial doğrulamaya girdi → **24 CONFIRMED · 1 REFUTED · 0 unverified** → senteze 10 bulgu (10 ajan-çağrısı bütçe sınırına takıldı).
> İç-kanıt zemini: `.analysis/deckent-objective-audit-2026-07-07.md` (4-ajanlı kod denetimi). Bu rapor yalnız DIŞ (web) kanıt içerir.
> ⚠️ Dürüstlük notu: **Açı-1 (rakip haritası) bu turda doğrulanmış claim üretemedi** — aşağıda "Açık Sorular"da follow-up olarak işaretli. "The only..." konumlandırması o tarama yapılmadan kullanılmamalı.

---

## ÖZET

Dış kanıt, Deckent'in iki kanıtlı differentiator'ının (kural-tabanlı anti-yalan eval + default-on outcome→routing→promotion döngüsü) 2026 ortası itibarıyla shipped ürünlerde **gerçekten nadir** olduğunu gösteriyor. "False success" (ajanın ortam aksini gösterirken görevi bitirdiğini iddia etmesi) akademik olarak ölçülmüş yaygın bir failure mode; LLM-judge'lar bunu yakalayamıyor; hem literatür hem **Anthropic'in kendi mühendislik rehberi** tam Deckent'in yaklaşımını (deterministic grader + claim-vs-artifact doğrulama) best practice ilan ediyor. Routing tarafında shipped ürünler (RouteLLM, Martian, Not Diamond) per-query **model** seçimi katmanında kalıyor; canlı task-outcome'dan beslenen default-on **agent** promotion/demotion döngüsüne shipped örnek bulunamadı. Benimseme tarafında SSO/audit/admin/usage-analytics'in enterprise-procurement kapısı olduğu paketleme kanıtıyla doğrulandı. Veri-ürünleştirme pattern'i piyasada hazır ve 2026-06-29 pivotuyla (terminal=yönetim · dashboard=izleme · NL-managed) birebir hizalı. Fine-tune-fuel tezi desteklendi: az ama **execution-verified** trajectory yetiyor — disk-verify'dan geçen trace'ler tam bu profil.

---

## AÇI 2 — Deckent'in farklılaştırıcıları ne kadar eşsiz? (5 bulgu)

### B1. "False success" gerçek ve yaygın bir failure mode — güven: MEDIUM (3-0)
Tek-kontrollü tau2-bench domain'lerinde hataların **%45-48'i**; açık durum-iddiası içeren başarısız AppWorld coding-agent trajectory'lerinin **%75.8'i** (9.876+1.879 trajectory, 8 model ailesi). Aynı çalışma: 5 judge modeli × 5 prompt stratejisinin **hiçbir** konfigürasyonu AUROC 0.65'i geçemedi (AppWorld API-trace'lerinde 0.54) — judge'lar doğrulanmış state değişimi yerine "kendinden emin kapanış dili" gibi yüzey sinyallerine demirleniyor.
Kaynak: https://arxiv.org/pdf/2606.09863 · bağımsız destek: https://arxiv.org/abs/2606.10315 ("Catching One in Five").
*Caveat: tek-yazarlı, hakemsiz 2026-06 preprint; %75.8 paydası yalnız açık-iddialı başarısız trajectory'ler.*

### B2. Literatürün önerdiği mimari ≈ Deckent'in mimarisi — güven: MEDIUM (3-0)
Aynı çalışmada hafif non-LLM detektörler LLM-judge'ları ezdi (task-disjoint AUROC 0.83/0.95; aynı flag oranında 4-8× daha çok yakalama, 3.300× düşük latency). Production önerisi: hafif detektör = triage, yüksek-stakes için **doğrudan trajectory–environment consistency check** (= disk-verify'ın yaptığı) — LLM-judge asla birincil monitör olmasın.
*Önemli nüans: makaledeki detektörler rule-based değil, supervised (TF-IDF+LogReg/XGBoost; zero-shot cross-domain'de 0.66-0.69'a düşüyor). Deckent'e destek analojik: "hafif non-LLM > LLM-judge" kanıtlandı, kural-tabanlının evrensel üstünlüğü değil.*

### B3. First-party endüstri doğrulaması: Anthropic rehberi — güven: HIGH (3-0)
Anthropic'in resmi mühendislik rehberi (2026-01-09) üç ilkeyi de best practice ilan ediyor: (1) mümkünse **deterministic/code-based grader** ("Fast, Cheap, Objective, Reproducible"), LLM grader yalnız gerekince; (2) ajanın iddiasına değil **ortamdaki gerçek sonuç durumuna** bak (DB kaydı, filesystem, test-suite); (3) grader'ı hack'e karşı sertleştir — Anthropic, Claude'un önceki denemelerin git history'sine bakarak avantaj sağladığı gerçek iç vakayı anlatıyor.
Kaynak: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
*Güvenilirlik yüksek: LLM satıcısının non-LLM grader önermesi kendi ticari çıkarına aykırı. Ekosistem (Braintrust, Arize, OpenAI evals docs) aynı deterministic-first katmanlamada.*

### B4. Model-routing manzarası farklı katmanda — güven: HIGH (3-0)
RouteLLM (LMSYS, 2024, OSS) per-query güçlü/zayıf model seçimi; router'lar **offline**, Chatbot Arena insan-tercihiyle eğitiliyor — sinyal dış insan tercihi, ürünün kendi operasyonel outcome'ları değil. Ticari router'lar shipped (Martian, Unify AI — Unify 2025'te pivot etti; RouterArena benchmark'ı RouteLLM parite iddiasını sorguluyor). Hiçbirinde orchestrator'ın kendi task-outcome'larından beslenen agent promotion/demotion yok.
Kaynaklar: https://www.lmsys.org/blog/2024-07-01-routellm/ · https://arxiv.org/abs/2406.18665 · https://github.com/lm-sys/RouteLLM

### B5. En yakın shipped rakip: Not Diamond — yine de farklı eksende — güven: HIGH (3-0)
Not Diamond kullanıcı outcome verisinden custom **model**-router eğitiyor (shipped, üçüncü-taraf teyitli: OpenRouter, Rootly). AMA eğitim **offline batch** (CSV upload, min 15 örnek, explicit retrain); ayrıca **opt-in** insan-feedback RL personalization var. Geçerli kontrast: **default-on + otomatik-doğrulanmış-outcome-türevli (Deckent) vs opt-in + insan-feedback-türevli (Not Diamond)**. Agent/skill promotion katmanına hiç girmiyor.
Kaynaklar: https://docs.notdiamond.ai/docs/router-training-quickstart · https://docs.notdiamond.ai/docs/real-time-personalization
*"Onlarda canlı öğrenme yok" DENMEZ; eşsizlik iddiası yokluk-kanıtı değil (Açı-1 taraması eksik).*

## AÇI 3 — Enterprise benimseme kapıları (1 bulgu)

### B6. SSO/audit/admin/usage-analytics = procurement-gate (paketleme kanıtı) — güven: HIGH (3-0)
GitHub Copilot (2026-07): bireysel tier'lar $0/$10/$39/**$100** — ama SAML SSO, IP indemnity, user management, usage metrics, "enterprise-grade security" $100'lık Max dahil TÜM bireysel planlarda **Disabled**, yalnız Business/Enterprise'da. Sourcegraph: tek plan — Enterprise, **min $16K** kontrat; SSO/SCIM/audit ayrı kalem bile değil, battaniye "enterprise-grade" ifadesinde.
Kaynaklar: https://github.com/features/copilot/plans · https://github.blog/news-insights/company-news/github-copilot-individual-plans-introducing-flex-allotments-in-pro-and-pro-and-a-new-max-plan/ · https://sourcegraph.com/pricing
*Şeffaflık: "agentic özellikler Pro+/Max upsell'i" iddiası 0-3 REDDEDİLDİ, rapora alınmadı. Genelleme 2 satıcı örnekleminde.*

## AÇI 4 — VERİ-ÜRÜNLEŞTİRME (3 bulgu — Alperen ek-önceliği)

### B7. NL control-plane pattern'i major-vendor ölçeğinde shipped — güven: HIGH (3-0)
**Datadog Bits Chat GA**: tüm Datadog verisi üzerinde doğal dille arama/görselleştirme/**aksiyon** (web, mobil, Slack); NL soru → **çalışan dashboard/notebook artifact'i** (aksiyonlar RBAC-gated). **Grafana Assistant**: "toxicity arttı" sayfası gelince Assistant'a konuşmayı inceletip runbook okutup remediation önertme (public preview).
"Chat-with-your-ops / NL-managed observability" vizyon değil, iki büyük incumbent'ta **shipped pattern** — "doğal dille yönetilebilir + izlenebilir" hedefi pazar-doğrulanmış.
Kaynaklar: https://www.datadoghq.com/blog/introducing-bits-assistant/ · https://docs.datadoghq.com/bits_ai/bits_chat/ · https://grafana.com/blog/ai-observability-for-agents-in-grafana-cloud/

### B8. Agent-telemetri de facto view-set'i — güven: HIGH (3-0)
Grafana **AI Observability** (2026-04 public preview, OTel-tabanlı): otomatik yakalanan şema = **generations/conversations · model+provider metadata · tool usage · latency+token · cost sinyalleri**. LangSmith/Langfuse/Datadog LLM Observability ile örtüşen de facto view-set → Deckent'in zaten topladığı per-task outcome + cost/usage ledger + audit verisinin hangi görünümlerle satıldığının şablonu.
Kaynaklar: https://grafana.com/blog/ai-observability-for-agents-in-grafana-cloud/ · https://grafana.com/press/2026/04/21/ · https://grafana.com/docs/grafana-cloud/machine-learning/ai-observability/

### B9. Hibrit TUI+web pattern'i shipped (küçük ama canlı örnek) — güven: MEDIUM (3-0)
**pi-agent-dashboard**: pi coding-agent'ın TUI'sini değiştirmeyip **koekziste eden** web dashboard ("Coexists with pi's TUI — doesn't replace it"; "One browser tab to command an army of pi agents") — çoklu terminal-agent oturumunun üstünde aggregation/oversight katmanı; per-session token/cost/model/thinking-level/context-bar + folder/branch bazlı canlı cross-session cost. MIT, npm, macOS/Linux/Windows.
Kaynaklar: https://github.com/BlackBeltTechnology/pi-agent-dashboard · https://pi-dashboard.dev
*Tek küçük OSS proje (~183 yıldız): pattern'in varlığını kanıtlar, pazar büyüklüğünü değil; NL-management ayağını kapsamıyor.*

## AÇI 5 — Fine-tune fuel viability (1 bulgu)

### B10. Az ama execution-verified trajectory yetiyor — güven: HIGH (3-0)
**SWE-Gym** (ICLR 2025, Apple ML + Berkeley): 2.438 gerçek Python task instance (çalıştırılabilir runtime + unit test); sadece **491 trajectory** ile 32B Qwen-2.5-coder fine-tune → SWE-Bench Lite/Verified'da **+12.3/+13.6 puan** mutlak kazanım, yayın anında open-weight SOTA. Çıkarım: devasa hacim değil, **execution-verified** küçük-orta hacim yeterli — disk-verify honesty-gate'inden geçmiş Deckent trace'leri tam bu profil; **doğrulama altyapısının kendisi veri-kalite moat'ının üreticisi**.
Kaynaklar: https://arxiv.org/abs/2412.21139 · https://openreview.net/pdf?id=lpFFpTbi9s
*Lisans/ToS/gizlilik ayağı bu turda DOĞRULANMADI (açık soru).*

## AÇI 1 — Rakip haritası: BU TURDA BOŞ
Claude Code (subagents/teams), Devin, OpenHands, CrewAI, LangGraph, AutoGen/AG2, Aider/Goose sınıfı için hiçbir claim 3-oylu doğrulamadan geçmedi. Konumlandırma "the only..." cümlesine dönüşmeden önce **hedefli negatif-alan taraması** şart.

---

## Reddedilen İddia (şeffaflık)
- "Copilot agentic özellikleri (cloud agent, PR code review, 3rd-party agent delegation) Pro+/Max upsell'i olarak paketliyor" — **0-3 REFUTED** (kaynak: github.com/features/copilot/plans). Enterprise-gate bulgusu (B6) paketlemeyle ilgili, agent-özellik kademelendirmesiyle değil.

## Caveat'ler (özet)
1. Açı-2 çekirdek sayıları tek hakemsiz preprint'e dayanıyor (kısmi bağımsız destekle).
2. "Hafif detektör" kanıtı supervised sınıflandırıcı — Deckent'e destek analojik.
3. Not Diamond kontrastı: doğru eksen "default-on/otomatik-outcome" vs "opt-in/insan-feedback".
4. Promotion/demotion eşsizliği yokluk-kanıtı değil (Açı-1 eksik).
5. LangSmith/Langfuse/Braintrust/W&B Weave fiyat+şikayet ayağı ve Cursor/Claude-Code-enterprise paketleme ayağı doğrulanmadı.
6. Zaman hassasiyeti: Copilot fiyatları 2026-07 snapshot; Grafana AI Obs preview (GA değil); Unify pivot; RouterArena RouteLLM paritesini sorguluyor.
7. Datadog/Grafana anlatıları vendor birincil kaynağı — varlık için yeterli, kalite/memnuniyet için değil.
8. Fine-tune hukuki/ToS riski tamamen açık.

## Açık Sorular (follow-up research adayları)
1. **Rakip negatif-alan taraması:** hangi shipped orchestrator'da outcome-learning veya doğrulama-gate'i var? ("the only" öncesi zorunlu.)
2. Default-on canlı-outcome agent promotion/demotion yapan başka shipped ürün var mı?
3. LangSmith/Langfuse/Braintrust/W&B Weave/AgentOps fiyat + view/workflow + kullanıcı övgü/şikayet haritası (telemetri yüzeyini paketlemek için).
4. Claude/Codex/Gemini CLI ToS'ları trajectory'lerin 3.-taraf fine-tune'unda kullanımına izin veriyor mu; trace'lerde kod/secret sızıntısı yönetimi?

---

## DECKENT İÇİN ÇIKARIMLAR

**Konumlandırma adayı (temkinli form):** *"The orchestrator that verifies agent claims against ground truth — and learns from it."* ("the only" versiyonu Açı-1 negatif-alan taraması bitene dek kullanılmamalı.) Kanıt zinciri: false-success yaygın (B1) → LLM-judge yakalayamıyor (B1) → non-LLM doğrulama üstün (B2) → Anthropic bile bunu best practice ilan ediyor (B3) → Deckent bunu shipped + default-on yapıyor (iç denetim) → ve üstüne öğreniyor (B4/B5: shipped dünyada eşi bulunamadı).

**Veri-ürünleştirme fırsatı (pivot pillarlarına eşleme):**
- **TERM (P0):** NL control-plane pattern'i pazar-doğrulanmış (B7). Datadog Bits modeli birebir hedef: NL soru → çalışan artifact (dashboard/report), aksiyonlar RBAC-gated. Deckent'te karşılığı: terminal chat'ten `deckent recall`/KPI/cost sorguları → canlı görünüm üretimi.
- **DASH (izleme-only, P1):** Grafana AI Observability view-set'i (B8) dashboard'un şablonu olsun: generations · model+provider · tool usage · latency+token · cost. Deckent bu verinin HEPSİNİ zaten topluyor (outcome, ledger, audit, KPI) — eksik olan veri değil, görünüm-paketi.
- **TUI+web koekzistensi:** pi-agent-dashboard (B9) küçük ama canlı kanıt: TUI'yi değiştirme, üstüne oversight-web koy — "one browser tab to command an army" cümlesi Deckent'in çok-worker sprint'ine birebir oturuyor.
- **TRN (P0):** B10 trace-wire P0'ını dışarıdan doğruluyor: disk-verify'dan geçen trace'ler execution-verified fine-tune yakıtı; 491-trajectory örneği "önce hacim biriktir" bahanesini geçersiz kılıyor — wire etmek yeterli başlangıç. Hukuki ayak (ToS) araştırılmadan dış-model trace'i kullanılmamalı.
- **ENT:** SSO + audit-trail + user-management + usage-metrics tek "enterprise paketi" olarak planlanmalı (B6) — bunlar fiyatlandırma kapısı, feature listesi değil.

**Önce kapatılacak benimseme açıkları (dış kanıt sırasıyla):** (1) NL-managed telemetri yüzeyi (TERM+DASH birleşimi — pazar penceresi açık, incumbent'lar generic-ops'ta, agent-orchestration'a özel NL-yönetim boşlukta), (2) SSO/audit enterprise paketi, (3) TRN wire (fine-tune fuel), (4) Açı-1 follow-up taraması → konumlandırma cümlesinin finalizasyonu.
