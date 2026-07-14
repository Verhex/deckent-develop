# ROUTING-V3 SYSTEM-DEBUG RAPORU (A1-protokolü) — 2026-07-14

> MASTER-PLAN #581. Amaç: yeniden-tasarım ÖNCESİ kanıt-tabanı — misroute-korpusu + sinyal-envanteri
> + yama-tarihçesi + kök-neden taksonomisi. **Tasarım kararı İÇERMEZ** — brainstorm-girdisi (Alperen 2026-07-14:
> "sürekli yama yapıp duruyoruz, V3'e geçme zamanı; system debugging ve brainstorming ile tasarlayalım").
> Yöntem: 3 paralel kanıt-ajanı (envanter/korpus/tarihçe) + Brain birinci-el canlı-probe bataryası.

## §1 · BİRİNCİ-EL KANIT — canlı probe-bataryası (2026-07-14, gerçek pool + gerçek routeTaskV2)

12 temsili görev-şekli gerçek zincirden geçirildi (dist-build `dae88b1f`, F3-sonrası):

| Probe | Intent (classifier) | Seçilen agent | Hüküm |
|---|---|---|---|
| 442-wire ("Wire prompt-evolution into sprint reporter") | implementation@0.65 | implementer@7 | kabul (floor) |
| refactor-worded ("Refactor the config loader into smaller functions") | **implementation@0.56** | implementer@7 | **MISS — refactor kaçtı** |
| test-only ("Add regression tests for memory decay") | **implementation@0.81** | ci-guardian@11 | intent YANLIŞ, agent path-sinyaliyle kurtuldu |
| doc-task | documentation@0.95 | doc-writer@13 | ✅ |
| turkce-impl (TR-dilli) | implementation@0.65 | integration-engineer@8 | kabul |
| turkce-refactor (TR-dilli) | **implementation@0.56** | implementer@7 | **MISS (TR-körlük + refactor-miss bileşik)** |
| bugfix-mixed | bugfix@0.56 | bug-fixer@18 | ✅ |
| security ("Harden the API token check, timing-safe") | **implementation@0.65** | **api-builder@19** | **MISROUTE — security-auditor varken** |
| i18n ("Add missing Turkish messages") | **implementation@0.85** | **terminal-ux-engineer@9** | **MISROUTE — i18n-specialist varken** |
| frontend | design@0.92 | frontend-designer@29 | ✅ |
| perf | performance@0.7 | performance-analyzer@10 | ✅ |
| vague ("Improve the planner") | implementation@0.65 | implementer@7 | ✅ (floor doğru iş) |

**Desen:** Güçlü sözlüksel-domain taşıyan görevler (doc/bugfix/frontend/perf) doğru gidiyor.
Çöküş `implementation` **mega-kovasında**: refactor · security · i18n · test intent'lerini yutuyor;
intent kaçınca DOĞRU UZMAN AGENT VAR OLDUĞU HALDE seçilemiyor (security-auditor, i18n-specialist).
Skorlama-aritmetiği (floor-mıknatıs-değil, domain-bonus, anti-temp) doğru ÇALIŞIYOR — devops@13,
api-builder@19, frontend@29 floor'u eziyor. **Sorun sinyal-üretiminde, aritmetikte değil.**

## §2 · MANŞET-KANIT — non-monotonik sınıflandırma (sınır-deneyi)

Aynı scope (`src/core/config.ts`), yalnız metin değişiyor:

| Vaka | Metin | Sonuç |
|---|---|---|
| A | title="Refactor the config loader", desc boş | **implementation@0.56** |
| B | A + desc="Split it into smaller functions." | **refactor@0.67** ✅ |
| D | title="Refactor…into smaller functions" + desc="Refactor config.ts internals into smaller pure functions with zero functional change." | **implementation@0.56** |
| E | D + desc'e "Behavior preserved, refactor only." | **implementation@0.56** |
| F | title="Restructure…", desc="Reorganize…without changing behavior" | **refactor@0.67** ✅ |

- **"Refactor" kelimesini EKLEMEK sınıfı refactor'DAN UZAKLAŞTIRIYOR** (B→D): açıklamadaki ikinci
  "Refactor" + "functions/functional" kelimeleri implementation-kovasını daha çok besliyor —
  kelime-sayısı-yarışında niyet-kelimesi kendi eş-dizimlilerine yeniliyor.
- "refactor only" + "behavior preserved" AÇIK ibaresi bile (E) kurtarmıyor.
- Eşanlamlılar (restructure/reorganize/split) çalışırken kelimenin KENDİSİ çalışmıyor —
  keyword-tablo-kapsamı değil, **kova-yarışı aritmetiği** kırık. Bu, keyword-skorlamanın yapısal
  tavanı: tablo genişletmek (yama) yarışı kazandırmaz, yarışın kendisi yanlış model.
- G/H/I: security@—, i18n@—, test@— kovaları ya yok ya cılız → hepsi implementation'a akıyor
  (H i18n-vakası **0.85 güvenle** yanlış — güven-skoru yanlışlığın habercisi bile değil).

## §3 · BUGÜNÜN İKİNCİL KANITI — tüketici-karmaşıklığı (F3 kapanışından)

F3 (implementer-era) canlıya alınırken routing-davranışını belirleyen **üç ayrı, birbirinden habersiz
kaynak** bulundu: (1) builtin `agent.json` manifest'i, (2) `.deckent/agents/` shadow-manifest'i
(öncelikli!), (3) `agent-pool.ts` load-time enjeksiyonu (`BUILTIN_IMPLEMENTATION_INTENT_RULES`,
Sprint-204 kalıntısı). Manifest'te yapılan demote, shadow + enjeksiyon yüzünden canlıda GÖRÜNMEZDİ.
V3-tasarımı için ders: **aktivasyon-kuralının tek-kaynağı ve görünür-önceliği** tasarım-gereksinimi
(bugünkü üçlü katman, her yamanın "nerede etki eder" sorusunu belirsizleştiriyor).

## §4 · SİNYAL-ENVANTERİ (kanıt-ajanı; kod-satırı-referanslı tam envanter ajan-çıktısında, burada damıtım)

**Zincir-sırası (routeTaskV2):** classifyIntent → test-dominant tespiti → override-çözümü → skill-bütçesi →
**skill'ler AGENT'TAN ÖNCE seçilir** → agent-seçimi (write-denied HARD-exclude → aktivasyon-kuralları →
bonus-toplamı → minScore-5 eşiği → skor-sıralı, beraberlik=learning-bonus) → fallback-zinciri → contextFit.

**Intent-aritmetiği (çekirdek):** text = title+description (goNogo-soyulmuş, lowercase); kova-başına
**+2/keyword** (containsWord) + scope-regex sinyalleri (+1-4) + default-impl-boost(+3, yalnız başka kova <3 ise)
+ testWriteRatio≥0.5→impl+2 (!) + docRatio≥0.5→doc+3. Güven = aritmetik-artefakt
(`0.3 + gap-oranı×0.5 + top×0.03` biçimli — kalibre DEĞİL). İki yapısal demotion: doc-yazımı<%50 →
implementation'a; **uzman-kova güven<0.5 → implementation'a** (GENERIC_INTENTS-demotion — uzmanı sistematik siler).

**Kritik envanter-bulguları:**
1. **`testing` intent'i SAHİPSİZ** — test-writer agent'ı sprint-148'de arşivlenmiş (`.deckent/agents/archive/test-writer-removed-sprint-148`); testWriteRatio≥0.5 IMPLEMENTATION'a +2 veriyor (test-görevi impl-kovasını BESLİYOR!); ci-guardian manifest'i implementation'ı exclude ediyor → born-594/440-002 bypass-bonusları + suppressRefactorerTestCatchAll yamaları bu deliği kapatmaya çalışıyor.
2. **Bonus-ormanı:** 10+ toplamsal bonus/ceza (domain+3 · surface+8 · test-ownership+8 · ciGuardian+3 · affinity+3 · learning±3 · role−3 · kind±3/−2 · lang−1/−6) — her biri bir yama-izi; 4'ü flag-gated default-OFF (skillAgentAffinity, kindAffinity, languagePenalty, agentCache = fiilen ölü); etkileşimleri öngörülemez, beraberlik-çözümü keyfî.
3. **Öğrenme-döngüsü fiilen kırık:** (a) planSprint TÜM görevlere `tasks[0]`'ın DNA'sıyla hesaplanan bonusu uyguluyor (semantik bug, SP:603); (b) canlı agent-stats'lar sıfırlanmış; (c) tek-görev `run` yollarında learningData=[] (ölü); (d) hayalet-skill (`api-design`: manifest-stub, içerik yok) %100-başarı sinyaliyle döngüyü besliyor.
4. **Aktivasyon-kuralının 4 kaynağı var** (builtin-manifest → shadow-manifest [öncelikli] → load-time enjeksiyon → evolved-rules in-memory) — bugünkü F3-vakası bu katmanlılığın maliyetinin canlı kanıtı; `activation.minScore` alanı doğrulanıyor ama SKORLAMADA UYGULANMIYOR.
5. **Ölü-yollar:** @deprecated selectAgent/selectSkills (0 üretim-çağrısı, born-699) · ROUTE-1 B4 floor (441'de söküldü) · options.effort (hiçbir çağıran geçmiyor) · OpenRouter doc-route (default-off).
6. Tablo-ekonomisi: ~25 hardcoded eşleme-tablosu (12 intent-kova · 44 keyword→intent · 14 domain→agent · 12-halkalı fallback-zinciri…) — davranış bu tabloların kesişiminde, hiçbir tek-yerde görünmüyor.

## §5 · MİSROUTE-KORPUSU (kanıt-ajanı, arşiv: jobs + routingMeta.taskDNA + TASK_ASSIGN eventleri; spot-check Brain-doğrulandı)

**Sprint-başına tek-agent tahakkümü (n≥3 sprint'lerde):**
- **427: bug-fixer 24/24 (%100)** · 428: %92 · 429: 11/11 · 426: 3/3 — bug-fixer-çağı
- 430: refactorer %75 · 431: 4/4 · 435: 3/3 · **438-441: refactorer 16/16 (%100, dört ardışık sprint)** · **443: 21/26 (%81)** — refactorer-çağı
- 433: terminal-ux 3/3 · 437: ci-guardian %60 · 442: devops %75 (misroute-kaynaklı)
- Eski timestamp-çağı: test-writer %95 (n=22) · doc-writer %95-100 (üç sprint) · temp-react %52 (n=27)
- **444 (F3-sonrası ilk sprint): refactorer %43'e düştü** — yama işledi ama sınıf duruyor.
- **Desen: catch-all ÇAĞDAN ÇAĞA GÖÇÜYOR** (test-writer→doc-writer→bug-fixer→refactorer→devops) — manifest-drift hangi agent'ı "lavabo" yapacağını belirliyor; tek-agent-tahakkümü mekanizmanın değişmezi.

**DOĞAL DENEY (tek en güçlü kanıt — sprint-443, Brain spot-check ✅):** 20 YAPISAL-ÖZDEŞ görev
("U4 guidance content — <agent-adı>"), hepsi aynı iş. Yönlendirme SADECE başlıktaki agent-adının
intent-keyword içerip içermemesine göre 4 farklı yola ayrıldı: `devops-engineer`→devops@0.56 ✅ ·
`doc-writer`→documentation@0.80 ✅ · `security-auditor`→security@0.90 ✅ · **kalan 17'si
implementation@0.56→refactorer**. Aynı iş, substring-şansıyla 4 farklı rota.

**Seçilmiş vakalar (25-vaka'lık tam liste ajan-raporunda):**
- 440-003 "test-yazarlığı" KELİMESİ BAŞLIKTA → implementation@**0.95**→refactorer → **NO_GO**
- 440-001 intent-classifier'ı DÜZELTEN görev, classifier'ın catch-all'uyla refactorer'a gitti (ironi)
- 438-003/004 · 439-003/004 · 441-004: test-authoring→refactorer; **NO_GO'lar tam bu misroute'larda kümeleniyor — misroute↔başarısızlık korelasyonu kanıtlı**
- 442-004: devops@**0.42** güvenle devops-engineer'a — güven-tabanı YOK, 0.36'da bile rota veriliyor
- sinav2-task4 / sinav3-task5: çıktı-dosyası `.md` olan CI-doğrulama görevleri documentation'a — **dosya-uzantısı intent'i sürüyor**
- Bayat-audit istatistikleri: architect **350 kullanım** (Write-YASAKLI danışman!) · api-builder avgCoverage **2.99/100** (phantom-dilution) · accessibility-auditor **0 kullanım** (erişilemez kural) · generic typescript-expert tüm skill-trafiğinin **~%48'i**

**Güven-semantiği bulgusu:** güven bimodal ve çoğu zaman YÜKSEK-AMA-YANLIŞ (0.92-0.95'te misroute'lar);
0.5-altı hiçbir eşik reddetmiyor. Güven-skoru bugün yanlışlığın habercisi bile değil.

## §6 · YAMA-TARİHÇESİ (kanıt-ajanı, git-arkeolojisi: 5 routing-dosyası + scar-yorumları + MASTER-PLAN/ADR)

**Toplam: ~22 ayrık yama-kampanyası / ~30 commit, 3,5 ayda** (2026-03-27 → 2026-07-14), v2-mekanizmasının üstüne.

Kronolojik özet (tam tablo ajan-raporunda; buraya damıtılmış):

| # | Kampanya | Ne yamandı | Hangi çuvallamaya |
|---|---|---|---|
| 1-3 | S-069 · S-124 · S-197 | precision/skill-budget · context-aware · persona-threshold | erken ayar-turu |
| 4-5 | S-204 · S-205 | builtin impl-candidacy enjeksiyonu (refactorer@7/architect@6) + anti-temp guard | her impl-görevi scope-kör temp-react'e düşüyordu |
| 6-8 | S-209 (ADR-072) · S-210 (ADR-073) · S-212 | domain-match bonusu(+3) · diversity-guard · skill→agent affinity(+3) | refactorer impl@7 HER domain-uzmanını eziyordu; bir sprint'te %75 refactorer |
| 9-10 | S-216/218 · WM-7 | USER_SURFACE_BONUS(+8) · dil-uyumsuzluk cezası | yüzey-sahibi kazanamıyor; TS-uzmanı Go-projesine |
| 11 | ROUTE-1 B1-B4 (8 commit, tek gün) | comment-sweep→refactor · surface-gate · kind-gated skor · skill-floor | doc-editini api-builder kaçırıyordu (path-proxy) |
| 12 | PCOMP-W5/W5b/W5C | role-ekseni + role-mismatch(−3) | review-persona (security-auditor) implementation-görevine atanıyordu; "Sprint-211 refactorer-nüksü" |
| 13-14 | born-470 · R-1b | curated scope→domain (önce OFF, sonra ON-flip + terminal-ui map) | REPL/Ink görevi path-parçasıyla api-builder'a; **aynı mekanizma iki kez yamandı** |
| 15 | born-589/590/591 | domain-ALIAS · zod-validation · dilution-fix | detectDomains ile kural-vokabüleri FARKLI → ölü-kurallar hiç ateşlemiyordu; bozuk manifest sessiz düşüyordu |
| 16 | born-594 | test-dominant bonus(+8) | test-sweep'ler implementation sınıflanıyor; sprint-391'de 9/9 overrideWarning |
| 17 | born-622/638/641 | karar-jurnali · Write-capable fallback · routing-collapse el-fix | **born-641 (P0): bozuk skill-manifest'i V2-routing'i ~10 GÜN her görevde sessizce çökertti** (yutulmuş exception → atamalar ikinci-yoldan) |
| 18-19 | PCOMP-6 D3 (S-440) · D4 (S-441) | çifte-sayım söküldü · **ROUTE-1 B4 skill-floor'u SÖKÜLDÜ** | double-count skew; floor "relevance-inversion" üretiyordu — **yama yamayı geri aldı** |
| 20-21 | PCOMP-8 U1 (S-442) · F2 (S-443) | containsWord kelime-sınırı + G1b demotion · classifier PROSE-only | 'ci' Türkçe "içindeki"nin içinde eşleşiyordu (4/4 task devops'a); goNogo-metni sınıflandırmaya sızıp 21/26 refactorer |
| 22 | S-444 F3 | implementer-era + S-204 enjeksiyon-kazısı | refactorer generic-impl'i default kazanıyordu (P4) |

**Hata-sınıfı × tekrar-sayısı (nüks = iddianın kanıtı):**
- catch-all-skew: **6 yama** (209→210→212→W5C→440→444) — en çok yamalanan sınıf
- domain-körlüğü/path-proxy: **6 yama** (124, 216, WM-7, born-470, R-1b, born-589)
- temp-agent-skew: 3 (069, 204, 205 — anti-temp guard 444'te YENİDEN korunmak zorunda kaldı)
- confidence-semantiği: ~4 (197, ROUTE-1 B4, 441-inversion, G1b) — B4 floor'u sonradan zararlı diye söküldü
- keyword-çakışması: ~3 · test-sinyali: 3 · goNogo-bulaşması: 2 · mekanizma-bütünlüğü: ~5 (born-590/622/638/641/591)

**Alt-çizgi:** 8 hata-sınıfının 7'si nüksetti (6'sı ≥3 kez); yamalar birbirini geri aldı/yeniden-korudu
(B4-floor 441'de söküldü · 205-guard 444'te yeniden · born-470 R-1b'de yeniden-flip); born-641'de
mekanizma 10 gün boyunca her görevde sessizce çökmüş, kimse görmemişti. "Sürekli yama yapıp
duruyoruz" iddiası NİCEL olarak doğrulandı.

## §7 · KÖK-NEDEN TAKSONOMİSİ (sentez)

Beş kök-neden; her yama-sınıfı bunlardan birinin semptomu:

**K1 · Görev-modeli yoksul — "görev = düzyazı-kelime-torbası".** Sınıflandırıcı title+description
kelime-yarışıyla intent seçiyor; scope/ops/deliverable-tipi ikincil-cılız. Sonuçları: doğal-deney
(agent-adı-substring'i rotayı belirliyor) · non-monotoniklik (§2: "Refactor" ekleyince refactor'dan
uzaklaşma) · uzantı-sürüşü (.md→documentation) · TR-körlük.

**K2 · Intent-taksonomisi kırık — mega-kova + sahipsiz-niyetler.** `implementation` hem default hem
boost-hedefi hem floor; `testing` intent'i agent'sız (test-writer sprint-148'de ölmüş, sinyali impl'i
besliyor); i18n/accessibility/a11y kovası yok; GENERIC-demotion zayıf-uzman-sinyalini implementation'a
katliyor. Catch-all'un çağdan-çağa göçü (test-writer→doc-writer→bug-fixer→refactorer) bu kırığın
manifest-drift'le çarpımı.

**K3 · Agent-kimliği = keyword-listesi, capability DEĞİL.** Agent'ın ne YAPABİLDİĞİ (Write-izni, rol,
yüzey-sahipliği, dil/stack) skorlamaya sonradan-eklenmiş bonus/ceza yamalarıyla sızıyor (write-denied
hard-exclude · role−3 · surface+8 · lang−1) — birinci-sınıf model yok. Kanıt: Write-yasaklı architect
350 kullanım; fallback-zinciri Write-denied'a düşebiliyordu (born-638).

**K4 · Öğrenme-döngüsü kapanmıyor.** tasks[0]-DNA bug'ı · sıfırlanmış stats · hayalet-skill %100-başarı
· run-yollarında ölü · phantom-coverage 2.99/100. "Outcome→routing→promotion kapalı-döngü" vizyonu
(korunacak-çekirdek!) bugün fiilen açık-devre.

**K5 · Davranışın tek-kaynağı yok.** ~25 hardcoded tablo + 4 aktivasyon-kaynağı + 10+ bonus + 4 ölü-flag;
hiçbir yerde "bu görev neden bu agent'a gitti"nin tam-izahı üretilmiyor (born-622 jurnali skor-dökümü
yazıyor ama karar-öyküsü değil). Her yama bu belirsizliğe bir katman daha ekledi (~22 kampanya, §6).

**Korunacaklar (MASTER-PLAN mercek-bloğu + kanıt):** deterministik orchestration · anti-temp garantisi ·
domain-uzmanı-önceliği (aritmetik doğru çalışıyor, §1) · honest-empty sözleşmesi · karar-jurnali ·
floor-mıknatıs-değil davranışı.

## §8 · BRAINSTORM-GÜNDEMİ (karar DEĞİL — Alperen-oturumu için aday-eksenler + sorular)

**Aday-eksen A — Capability-matrix (K3):** agent.json v3'te birinci-sınıf `capabilities` (yazma-yetkisi,
rol, yüzeyler, diller/stack, deliverable-tipleri) ↔ görevden türetilen `requirements`. Eşleşme =
kesişim-testi (eleme) + tercih-skoru (sıralama). Bugünkü bonus-ormanının çoğu bu matrise katlanır.

**Aday-eksen B — Yapısal görev-modeli (K1):** birincil-sinyaller scope/filesWrite-tipi/ops/deliverable
(davranışsal, yalan söylemez); düzyazı yalnız kırılamayan-beraberlikte. §1-kanıtı destekliyor: güçlü
yapısal-sinyalli görevler bugün bile doğru gidiyor.

**Aday-eksen C — Intent-taksonomisi yeniden (K2):** testing/i18n/security/accessibility'ye gerçek-sahip;
`implementation` yalnız AÇIK-floor (default-sınıf değil); kalibre-güven + güven-tabanı (altında dürüst-floor,
sahte-uzman değil).

**Aday-eksen D — LLM-destekli atama (K1/K2'ye alternatif/tamamlayıcı):** planner zaten LLM — plan-anında
görev→agent atamasını LLM yapıp deterministik-doğrulayıcı (capability-kesişim + anti-temp + yetki)
onaylasın. Maliyet/determinizm takası Alperen-kararı.

**Aday-eksen E — Öğrenme-döngüsü onarımı (K4):** görev-başına DNA · gerçek-stats · hayalet-temizliği ·
outcome→capability-tercih-skoruna kapalı-akış (promotion-pipeline'la hizalı).

**Aday-eksen F — Tek-kaynak aktivasyon + karar-öyküsü (K5):** çözümlenmiş-aktivasyon tablosu tek-yerde
(provenance'lı: manifest/shadow/evolved) + her karar için insan-okur "neden" öyküsü (doctor + terminal-UI
+ WORKER-LIVE-LOG tüketicisine hazır).

**Alperen'e sorular:**
1. Routing'de LLM kabul mü (eksen-D; maliyet ~1 planner-çağrısı-içi), yoksa V3 saf-deterministik mi?
2. Capability-matrix agent.json-v3 şeması olarak SSOT mu (custom-agent yazarları için de sözleşme — dual-lens)?
3. Intent-taksonomisi: hangi niyetler birinci-sınıf? testing geri gelsin mi (test-writer'ı diriltmek vs
   ci-guardian'a sahiplik)?
4. Geçiş-stratejisi: V3 shadow-mode'da V2'yle yan-yana koşup (jurnal-karşılaştırma, sinav-korpusu regresyon)
   kanıtla flip mi — yoksa doğrudan kesim mi?
5. 0.5-altı güvende dürüst-floor davranışı: implementer'a mı, yoksa Brain'e "belirsiz — sen seç" eskalasyonu mu?
