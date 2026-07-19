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
