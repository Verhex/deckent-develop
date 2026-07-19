# Dogfood sprint-449 (RUN-RENAME dilim-2) — Koşu + Prompt-Kalite Analizi
**Tarih:** 2026-07-18 · **Yürüten:** Fable-CC (goal-loop `deckent do --run --yes`) · **Bağlam:** Alperen direktifi "diğer işlere deckent-dogfood'uyla devam et + prompt kalitesini analiz et" (geçici-gözetim: [temp_sprint_prompt_quality_watch])

## 1. Koşu-özeti (iş)
- **Hedef:** MASTER-PLAN 510 RUN-RENAME dilim-2 — kullanıcı-yüzeyinde sprint→run (CLI inline + MCP description + docs).
- **Sonuç:** Retro 10/14 DONE · 4 NO_GO · 4 TECH_DEBT · 1sa49dk. **Ürün-işi tamamlandı:** envanter (2468 satır, üç yüzey, HARİÇ-listesi genişletilmiş) + CLI/MCP/docs revizyonları + gerçek-binary smoke-testi (`tests/cli/run-rename-smoke.test.ts`, 7/7).
- **Tier-1 kanıt (elle koşuldu):** `deckent history` başlığı **Run** · `deckent status` → "Run 449 (sprint) — completed" / "No active run (sprint)" (geçiş-formatı, alias-korumalı).
- **CC-el tamamlama:** hiçbir -xfix scope'una girmeyen 3 eski/birleşik test-pini (5 assertion) elle güncellendi: `tests/mcp/tools/status-history.test.ts` ×3 · `tests/docs/cli-reference.test.ts` ×1 · `tests/cli/commands.test.ts` ×1 → 190/190 yeşil.
- **Dilim-3 kalıntısı (worker-bulgusu, 449-005):** 378-002'nin BİLEREK kilitlediği key'ler (`status.sprint_active`, `status.no_sprint`, `status.no_active_sprint`) — testler literal 'Sprint' assert ediyor ve o testler her task'ın scope'u DIŞINDA. Çözüm tek-task'ta key+test BİRLİKTE scope'lanarak (dilim-3).

## 2. Koşuya girmeden ölen 3 deneme — motor-bulguları (hepsi gerçek)
| # | Bulgu | Durum |
|---|---|---|
| B1 | **Scope-gate onay-SONRASI ölümü:** `do`-gate GEÇTİ dedikten sonra PLAN-fazı scope-gate'i detached-runner'ı öldürüyor; `runs` yüzeyi "başarısız (süreç öldü)" basıyor — dürüst gate-mesajı yalnız `recently-works/` logunda. `do` akışında `--force-scope`/acknowledge YOK → kullanıcı çıkışsız. | AÇIK (tasarım-işi) |
| B2 | **Ayna-adlı yeni test dosyası = sahte-typo:** `tests/cli/commands/history.test.ts` varken yeni `tests/mcp/tools/history.test.ts` wrong-dir sanılıp öldürüldü (2 koşu). | ✅ CC-el fix (2-tur): muafiyet = test/spec-basename + ebeveyn-dizin-tracked **+ task-local-evidence** (aynı task eş-stem'li KAYNAK-modülü de yazıyor — `src/mcp/tools/history.ts` yazan task'ın `history.test.ts`'i modülün-testidir). İlk geniş-muafiyet 397-007 auto-replace onarımını yutuyordu (ci-sim yakaladı) → keskinleştirildi; 573/518 + 397-007 pinleri yeşil |
| B3 | **Glob-scope = sahte-typo:** planner 3. planda `src/cli/**/*.ts` deseni üretti; gate glob'u literal sanıp 7 yolu birden öldürdü. | ✅ CC-el fix: glob-farkındalık (≥1 tracked-eşleşme → confirmed; 0-eşleşme → suspect kalır); +5 pin |
| B4 | **Planner belirsizliği:** aynı goal, 3 koşuda 3 farklı plan-şekli (somut-doğru / somut-hatalı / glob) — scope-türetimi NL-direktifi dinlemiyor. | AÇIK (ROUTING-V3/PCOMP malzemesi) |

## 3. Koşu-içi motor-bulguları
| # | Bulgu | Etki |
|---|---|---|
| B5 | **Debt-manager bayat-sevki:** sprint-445 debt'i CC-el `deckent sync` ile koşu ÖNCESİ kapatılmıştı; buna rağmen 3× sonnet-high implementer'a yeniden sevk edildi. Her üçü de "borç zaten kapalı" doğrulaması yazdı (filesChanged:0). | ~5 task-koşusu israf (001/001-fix/002/003/003-fix) |
| B6 | **Evaluator coverage-tuzağı (445'te BELGELİ, hâlâ canlı):** `evaluateWithRubric` şema-önkontrolü, implementer+kod-görevi+`coverage`-alansız sonucu rubrik'e girmeden `NO_GO totalScore:0` basıyor. 449-001/003'ün DÜRÜST "borç-kapalı, dosya-değişikliği-yok" DONE'ları bu yüzden NO_GO oldu → gereksiz FIX-turu. | Sahte-NO_GO + fix-cascade maliyeti; 5-NO_GO=pause riskine yaklaştırıyor |
| B7 | **EXIT_WITHOUT_RESULT:** 449-008 worker'ı işini DİSKE yazmış (326-satır smoke-testi, doğru) ama .result yazamadan öldü (exitCode=0, wrapper) — muhtemel neden dist-bayatlığı/bütçe; -fix turu işi satır-satır doğrulayıp kurtardı. | 1 tur gecikme; işin kendisi kurtuldu |
| B8 | **Worker mid-sprint `npm run build` koştu** (008 doğrulama-zinciri) — "sprint sırasında build yasak" kuralı motor-tarafında zorlanmıyor; `deckent` binary'si saniyelik kayboldu (clean-penceresi), 005-xfix'in bulduğu dist-bayatlığı zincirini de bu tetikledi. | Kural yalnız insan-disiplini; yarış-pencereleri |
| B9 | **Status/inbox sayaç-matematiği:** fix/xfix-sonrası "14/6 (%233)", flow-satırı "completed (6/14)". | Görüntü-hatası, güven zedeler |
| B10 | Minör: `runs` başlığı oturum-içi TR→EN değişti (efektif config=en; eski-dist TR basıyordu — dil-çözümü tutarlılığı izlenecek); `.tasks/`te bayat `task-test-docker-*.hb`; memory-budget OVER (1571/600) uyarısı sürekli. | İzleme |

## 4. Prompt-kalite değerlendirmesi (temp-gözetim gereği)
**Güçlü (planner/U-serisi meyveleri görünür):**
- Task-gövdeleri zengin ve talimat-sadık: NL-direktifin i18n-FIRST / HARİÇ-listesi / alias-koruması / Tier-1-smoke şartları her task'a doğru yayıldı.
- goNogo çiftleri task-özel ve ölçülebilir (örn. 004: "üç yüzey için file:line tablo + HARİÇ bölümü şart; kategorisiz düz grep = NO_GO").
- Routing-gerekçeleri dürüst ve kurallara uygun: haiku YALNIZ docs-task'ında; 004 için "user-visible/iç-ayrım yargı ister — haiku'ya fazla risk" gerekçesi isabetli.
- Worker-çıktı disiplini yüksek: 005'in "MAJOR PLANNING FINDING"i (378-002 kilitleri), 005-xfix'in kök-neden analizi (008-ölümünün 005-hatası OLMADIĞINI kanıtlaması), 008-fix'in 81-kırmızıyı 3 kovaya ayrıştırması (git-guard/ENOSPC/gerçek-5) — hepsi kanıt-temelli, irtifa-doğru.
**Zayıf:**
- **Debt-taşıma prompt'ları şişkin:** 449-001/002/003 gövdeleri önceki sonuç-notlarının ham dökümü (6-7KB); derlenmiş-özet yok (PCOMP-6'nın "derlenen-prompt" hedefinin tam kanıtı).
- prompt-lint `mentioned-file-outside-write-authority` uyarısı örnek/oku-referanslarını da sayıyor (004'te `sprint-summary.ts` "rename ETME örneği" olarak anılmıştı) — sinyal/gürültü ayrımı yok.
- Envanter-kapsam açığı: 004 birleşik/eski test-dosyalarını (status-history, commands.test, cli-reference) kataloglamadı → 5 regresyon ancak 008-fix'te yakalandı (yine de sistem SONUNDA yakaladı — savunma-derinliği çalıştı).
- Task-sayısı 8 (kanun-8 hedefi 20-40 mikro); bu iş için makul ama planner'ın range-config'i küçük-hedefte alt-banda yapışıyor — izlenecek.
**Maliyet-gözlemi:** israfın ana kaynağı prompt değil SÜREÇ (B5+B6): ~5 gereksiz task-koşusu + 1 gereksiz fix-turu ≈ sprintin ~%40 task-hacmi.

## 5. Önerilen sıradaki işler (Alperen-onayına)
1. **B6 evaluator-fix (küçük, yüksek-getiri):** `coverageOptional`'a "sonuç dosya-değiştirmiyor (filesChanged boş) ⇒ coverage şartı düşer" muafiyeti — dürüst borç-doğrulama DONE'ları artık NO_GO olmaz.
2. **B5 debt-önkontrol:** debt-sevki öncesi debt'in kanıt-komutunu (varsa test/lint) host-side koştur; yeşilse debt'i otomatik-kapat, task üretme.
3. **B1 do-akışı çıkışı:** scope-gate reddi PLAN'da patlamak yerine `do` önizlemesine taşınsın + `do --force-scope` geçişi.
4. **510 dilim-3:** kilitli 3 key + kilitleyen 4 test tek-task'ta birlikte scope'lanır.

## 6. Kapanış — B6+B5+B1 ✅ CC-el (2026-07-19, Alperen "öneri kabul edildi devam")
- **B6:** `src/orchestra/rubric-registry.ts` `coverageOptional` → açık-boş `filesChanged` dizisi = "hiçbir şey değişmedi" beyanı ⇒ coverage+testsPassed şema-şartı düşer (eksik-`filesChanged` hâlâ ayrı şema-hatası — muafiyet tembel-sonucu maskelemez). +4 pin `tests/orchestra/evaluator-schema.test.ts`; 449-şekilli sonuç artık şema-NO_GO değil.
- **B5:** YENİ `src/orchestra/debt-preflight.ts` + `planSprint` bağlantısı + `debt_preflight_enabled` config (default-true). Konjonktif kapama: tamamlanma-iddiası + allowlist-komutlar (tsc/lint/vitest, shell:false) hepsi-yeşil → auto-resolve; kırmızı → "debt REAL, şu komuttan başla" annotation'ı; kanıt-yolu-diskte-yok → `stale-evidence` "RE-POINT" (445-013/017'nin `tests/core/routing3/` vakası). Koşum-memo: aynı komut sprint-önkontrolünde 1× koşar. **Canlı read-only kanıt:** 433-001-fix (15-sprint zombi) → verified-resolved; 445-çifti → stale-evidence. 19 pin.
- **B1:** `run-flow-controller.proposeRun` scope-gate aynası (`PlanPreview.scopeGateResult/scopeGateMessage/scopeGateOverridden`, CAS-nötr) + `do --force-scope` (ön-kapı reddi `do.scope_gate_blocked` i18n'iyle; child-argv'ye `--force-scope`; dry-run önizlemede FAIL + çıkış-yolu görünür). 8 pin + gerçek-binary `do --help` smoke.
- Bekleyen: B4 (planner-belirsizliği, ROUTING-V3/PCOMP malzemesi) · B8 (build-ban motor-zorlaması) · B7/B9/B10 (izleme).

## 7. Sprint-450 canlı-doğrulama + Routing-V3 karar-denetimi (2026-07-19)
**Koşu:** dilim-3 goal'ü (`deckent do --run --yes`) → 6/6 DONE · 0 NO_GO · 1 dürüst-DEBT · 22dk. Kıyas 449: 10/14 · 4 NO_GO · 1sa49dk — B6+B1 fix'lerinin ilk canlı meyvesi.
- **B6 canlı-kanıt:** 450-001/002 (445-çifti debt-doğrulaması, filesChanged:0) şema-NO_GO OLMADAN verification-fast-path'ten DONE/100 geçti — 449'da aynı sınıf sonuç NO_GO+fix-cascade üretmişti.
- **B1 canlı-kanıt:** scope-gate ön-kapı aynası GEÇTİ dedi, detached-child aynı kararla yaşadı (449'daki 3 sessiz-ölüm sınıfı görülmedi).
- **B5 düzeltme-turu:** ilk bağlantı `!dryRun` guard'ı yüzünden run_flow_v2 yolunda hiç koşmamıştı (generatePlanPreview her zaman dryRun:true; plan==başlatılan-plan) — guard kaldırıldı + spawn'sız regresyon-pini; canlı-kanıt bilinçli SONRAKI koşuya bırakıldı (450-006'nın dist-bayat debt'i tam-aday: not tamamlanma-iddiası + `npx vitest run tests/cli/run-rename-smoke.test.ts` içeriyor, host-side 7/7 yeşil → preflight auto-close bekleniyor).

**Routing-V3 karar-denetimi (Alperen: "implementer çok baskın, doğru mu?"):** journal (`.deckent/routing/decisions/sprint-450.jsonl`) kanıtıyla — baskınlık-hissinin kökü debt-yeniden-sevk döngüsüydü (449'da implementer 8/16'nın çoğu debt/fix; 450'de 2/6, ikisi debt). Ama 2 gerçek misroute bulundu, elle fix'lendi:
- **B11 ✅ verify→document misroute:** 450-006 (işi: vitest+gerçek-binary smoke KOŞMAK; teslimatı: .md-rapor) `workType=document/doc:1` sayılıp doc-writer'a gitti. Fix: `requirement-vector.ts` yapısal review-imzası — doc-tek-teslimat + okuma-tarafı (directories+filesRead) test-lokasyonu payı ≥0.5 ⇒ `review` (prose-körlük yasakları [spec §3] aynen korunur; 'test' kelimesi prose'da hâlâ etkisiz). Kayıtlı-katalog yeniden-koşumu: doc-writer:0.78 → **ci-guardian:0.78** (doc-writer ilk-4-dışı). +7 pin.
- **B12 ✅ i18n yüzey-sızıntısı:** i18n domain'i `surfaces:['cli','frontend']` deklare ediyordu → salt-CLI messages-flip'ine 'frontend' yüzeyi sızdı, frontend-designer(opus-pref):0.78 kazandı. Fix: i18n konum-nötr (`surfaces:[]`; yüzey eş-eşleşen konum-domain'inden gelir). Yeniden-koşum: **terminal-ux-engineer:0.76** (implementer 0.75; frontend-designer 0.73'e düştü). +2 pin.
- **B13 AÇIK (581-devri):** eskalasyonlar (low-confidence/tie) journal+notify'a düşüyor ama karar-üstü yargıç (config `governanceMode:'ai'` sözü) inşa edilmemiş — 6 kararın 5'i low-conf (0.45-0.50), skor-ayrışması zayıf (0.78/0.76/0.75). Vocabulary/axis-kalibrasyon + adjudicator = 581 ROUTING-V3 dilimi; ön-sprint el-fix kapsamı DIŞINDA bırakıldı (tasarım/ADR işi).
