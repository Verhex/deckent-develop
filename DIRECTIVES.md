# DIRECTIVES — SPRINT-411: SOL-ANALİZ TURU (gpt-5.6-sol × ultra-effort — 634/635 · 643 · beta-blocker)

## Goal
Alperen-direktifi: gpt-5.6-sol ile derin çapraz-analiz (XVER). Üç tasarım/denetim raporu — hepsi
sonraki kararların ve inşanın DOĞRUDAN girdisi. Kod YAZILMAZ; yalnız analiz-raporu (docs/analysis/).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz (docs/analysis/*.md) · kod-dosyası DEĞİŞTİRME · git stash/reset YASAK · build YASAK · notes TEK STRING · Self DÜRÜST.
- KANIT-DİSİPLİNİ: her iddia dosya:satır referanslı; okuyup doğrulamadığın şeyi İDDİA ETME; belirsizse "doğrulanamadı" de.
- Türkçe yaz (kod/terim EN). Rapor yapısı: Özet → Kanıt-tabanlı analiz → Seçenekler (+trade-off) → Net Öneri → Uygulama-planı (adım+dosya) → Riskler.

## Task 1: SCHEDULER-UNIFY — born-634/635: planDispatch reducer'ını canlı-driver yapma tasarımı
- Model: gpt-5.6-sol | Provider: codex | Effort: high
- Files: docs/analysis/scheduler-unify-design-2026-07-11.md
- Scope: docs/analysis/
- Dependencies: none
### Description
BAĞLAM: born-610 tek-truth SÖZLÜĞÜNÜ birleştirdi (src/orchestra/scheduler-truth.ts) ama dispatch-YÜRÜTMESİ
hâlâ ~6 imperatif closure'da dağınık: dispatchTick / processQueue / maybeRespawn / dispatchReadyTasks /
forceRescanIfIdle / cascadeSkipDeadBlocked (src/orchestra/result-collector.ts + sprint-spawner.ts).
`planDispatch` (result-collector.ts:350) pinned-MODEL ama 0-prod-çağıranlı (dosyanın :297 yorumunu oku —
port edilmesi gereken checkpoint'ler orada). GÖREV: bu birleşimin (ADR-064-W Codex-adım-3) TAM tasarımı:
(1) 6 closure'ın her birinin bugünkü sorumluluk/tetiklenme/yan-etki haritası (dosya:satır); (2) planDispatch
modelinin bugünkü sözleşmesi ve closure'larla örtüşme/boşluk matrisi; (3) birleşim SEÇENEKLERİ (büyük-bang
reducer / kademeli-strangler / event-log+replay) trade-off'larıyla; (4) NET öneri + adım-adım migration-planı
(her adım tek-sprint'lik, geriye-dönüş noktalı, composition-pin test-stratejili); (5) born-635 kalanlarının
(checkpoint-restore MRR-semantiği [610 Alperen-kararı: MRR=terminal-non-satisfying — restore-yolu buna
nasıl uyar?] + FIFO-modu dep-check deliği) bu tasarıma nasıl oturduğu; (6) 610'un cascadeSkipped/fix-gate
muafiyetlerinin ve 476 fix-task-mirasının reducer'da korunma garantisi. Sınıf-riski: scheduler=sprint'lerin
kalbi — yanlış birleşim tüm dogfood'u durdurur; tasarım muhafazakâr ve kanıt-yoğun olmalı.
### goNogo
- goCriteria: rapor var; 6-closure haritası dosya:satır'lı ve TAM; örtüşme-matrisi; ≥3 seçenek trade-off'lu; net-öneri + tek-sprint'lik adımlarla migration-planı; 610/476-koruma garantileri açık.
- nogo: kod değiştirilirse NO_GO; kanıtsız iddia (satır-refsiz mimari-beyan) yoğunsa NO_GO.

## Task 2: TERM-FLOW-UNIFY — born-643: golden-flow vs fiili-native-tool-akışı birleşim tasarımı (Alperen-kararının girdisi)
- Model: gpt-5.6-sol | Provider: codex | Effort: high
- Files: docs/analysis/term-flow-unify-design-2026-07-11.md
- Scope: docs/analysis/
- Dependencies: none
### Description
BAĞLAM (gap-rapor `docs/MASTER-PLAN.md` satır-541 + kaynak): hedef-deneyim "kullanıcı REPL'de NL yazar →
DIRECTIVES üretilir → plan-preview → onay → detached-run → canlı-izleme → sonuç yeni-turn". BUGÜN İKİ AYRI
DÜNYA VAR: (A) tasarlanmış-ama-orphan: golden-flow (src/orchestra/golden-flow.ts, yalnız `deckent do`
CLI'dan; NL-intent placeholder-scaffold; plan-preview REPL'de render edilmiyor; TERM-MODE risk-gate
checkActionAllowed 0-çağıran; startSprint'i senkron stdio:inherit) ↔ (B) fiilen-çalışan: native-agent
tool-bridge (LLM kendisi deckent_set_directives→plan→start[detached]→status tool'larını çağırıyor; onay
generic confirm-modal; 642 bg-turns artık sonucu geri getiriyor). GÖREV: iki dünyanın birleşim tasarımı:
(1) her iki akışın uçtan-uca adım-haritası (dosya:satır) + güçlü/zayıf yanları; (2) SEÇENEKLER: B-resmileşir
(golden-flow parçaları B'ye organ-nakli: plan-preview kartı, risk-gate, DIRECTIVES-builder'ı tool'un içine)
/ A-REPL'e-bağlanır / hibrit; (3) her seçenekte 511 kabul-ölçütünün ("1 gerçek born, CLI-komutu ELLE
yazmadan uçtan-uca") nasıl sağlandığı; (4) NET öneri + uygulama-planı (sprint-dilimli) + hangi parçalar
ölür/organ-nakli olur listesi; (5) DESK-2 blueprint'iyle (`.analysis/desk2-blueprint-2026-07-10.md` —
oku) tutarlılık kontrolü.
### goNogo
- goCriteria: iki-akış haritası dosya:satır'lı; ≥3 seçenek 511-ölçütü karşılaması açık; net-öneri + dilimli-plan + ölü/nakil listesi; DESK-2 tutarlılık bölümü.
- nogo: kod değişirse NO_GO; tek-seçenek dayatması (trade-off'suz) NO_GO.

## Task 3: BETA-BLOCKER-SWEEP — v1.0.0-beta öncesi bütünsel risk-taraması (çapraz-göz)
- Model: gpt-5.6-sol | Provider: codex | Effort: high
- Files: docs/analysis/beta-blocker-sweep-2026-07-11.md
- Scope: docs/analysis/
- Dependencies: none
### Description
BAĞLAM: yayın-zinciri hazırlanıyor (release.yml tek-otorite; validate:publish; builtins-merge sürüyor;
🔒 YAYIN-ŞARTI: desktop-app Alperen-onayı). GÖREV (bağımsız-göz, Anthropic-hattının kör-noktalarını ara):
npm-paketine GİDEN yüzeyin beta-blocker taraması: (1) package.json files/bin/exports/engines gerçeği —
paketlenen-set ile çalışması-gereken-set tutarlı mı (dist/, builtins, assets; `npm pack --dry-run`
zihniyetiyle dosya-listesi analizi); (2) taze-kurulum yolu: `deckent init` bir YABANCI projede ilk 10
dakikada neye çarpar (global-config yokluğu, docker-yokluğu fail-honest mı, auth-yokluğu mesajları,
Windows-yolları); (3) validate:publish kapsam-boşlukları; (4) güvenlik-yüzeyi hızlı-tarama (secrets
default'ları, telemetry, dış-çağrılar); (5) versiyonlama/changelog tutarlılığı. Her bulgu: kanıt
(dosya:satır) + şiddet (BLOCKER/MAJOR/MINOR) + tek-cümle fix-önerisi. BLOCKER'ları ayrı özet-tabloda topla.
Bilinen-açıkları (desktop-gate, 502-merge-sürüyor) tekrar-keşif diye yazma — docs/MASTER-PLAN.md 530-542
satırlarını okuyup düş.
### goNogo
- goCriteria: BLOCKER-özet-tablosu + kanıtlı bulgular (dosya:satır) + şiddet+fix-önerisi; bilinen-açıklar mükerrer-listelenmemiş; paket-yüzeyi analizi somut (files/bin/exports adları).
- nogo: kod değişirse NO_GO; genel-geçer tavsiye listesi (kanıtsız) NO_GO.
