# DIRECTIVES — Sprint 285: REPL Tool-Protokolü God-Level — Kuyruk + Onay + Dürüst-Telemetri

## Goal: Ink-REPL'in `<deckent_tool>` aksiyon-protokolü claude-code kalitesine taşınsın. 2026-06-12 dogfood-bulguları (docs/alperen-analysis/2026-06-12-repl-tool-parser-findings.md): (1) çok-tag'li turda yalnız sonuncu yürüyor, (2) prose-sonu tag yakalanmıyor, (3) atlanan tag'ler sessiz. CC ön-analizi kökleri 5-katmanda haritaladı — parser DOĞRU (chat-session.ts:103-123 tüm-tag exec-loop), motor DOĞRU (chat-native.ts:801-826 for-loop dispatch); baş-şüpheliler: Ink confirm tek-slot çökmesi (run.tsx:64-129), stream-toplama blok-kaybı (chat-session.ts:355-371), turnInput tek-sonuç geri-besleme (chat-session.ts:342-348).

## Ortak kurallar
- **i18n-FIRST:** REPL user-facing string'leri `getMessage(key,lang)` (src/cli/helpers/messages.ts) — en+tr eksiksiz. EMOJI yasak değil (terminal-UI mevcut dilini koru) ama yeni görsel-dil icat etme.
- **Tier-1 Proof-of-Function (ADR-079):** REPL = user-surface; `Smoke:` zorunlu. PTY-doğrulama deseni: `scripts/ink-pty-test.mjs` (mevcut harness — OKU ve deseni izle).
- **Test hermetik** (ADR-087): tmpdir, async-spawn, no-spawnSync; persistent-session testleri mock-spawnFn enjeksiyonuyla (mevcut persistent-wire test deseni).
- **Surgical:** Çalışan akışlar (write+approval ✓, bash-tek ✓, deny ✓ — bulgu-dokümanının regresyon-guard bölümü) BOZULMAZ; mevcut testler yeşil kalır.
- **Regresyon-bilgisi:** `tests/dashboard/` ve ana-suite'te bilinen-kırık YOK — her başarısızlık SENİN değişikliğinle ilişkili kabul edilir (stale-failure bahanesi geçersiz).

---

## Task 1: Enstrümante kök-teşhis — 3 hipotezi ayrıştır + failing-repro
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: docs/reviews/sprint-285/repl-tool-root-cause.md, tests/cli/repl-tool-multi-tag-repro.test.ts
- Scope: docs/reviews/, tests/cli/

### Description
Üç hipotezi KANITLA/ÇÜRÜT (yalnız rapor+test yaz — src'ye DOKUNMA, fix'ler T2-T4'ün):
**(H1) Ink confirm tek-slot çökmesi:** `src/cli/repl/run.tsx:64-129` `askConfirm` + `src/cli/repl/app.tsx` ConfirmTrigger zincirini OKU — motor `for(const call of toolCalls)` ile 4 ardışık confirm tetiklediğinde Ink state'i ne yapıyor? Pending-confirm üzerine yeni confirm gelirse ezilme/auto-resolve var mı? Unit-repro: mock-ConfirmTrigger ile 3 ardışık askConfirm — kaçı kullanıcıya ulaşıyor?
**(H2) Stream-toplama blok-kaybı:** `parseStreamJsonLine` (chat-session.ts) hangi stream-json event-tiplerinden text topluyor? Fable/claude CLI'ın `--include-partial-messages` çıktısında çok-blok/prose-sonu-tag senaryosunda `collected`'a girmeyen blok var mı? Repro: mock-spawnFn ile çok-bloklu stream-json besle (text-delta + ayrı content-block + result-event kombinasyonları), `parseDeckentToolCalls(collected)` kaç tag buluyor?
**(H3) turnInput tek-sonuç kaybı:** chat-session.ts:342-348 — 4 tool-sonucu push'lanmışken modele kaçı gidiyor? (Kod-okumayla net; repro-testi yaz.)
Rapor: `docs/reviews/sprint-285/repl-tool-root-cause.md` — her hipotez için VERDICT + file:line + hangi fix-task'ın kapsayacağı. Failing-repro'lar `it.fails`/skip-guard'la suite-yeşil tutulur (282-001 deseni).

**Smoke:** `npx vitest run tests/cli/repl-tool-multi-tag-repro.test.ts` → yeşil (it.fails-pin'ler dahil), exit 0.
**Kanıt:** `test -s docs/reviews/sprint-285/repl-tool-root-cause.md && grep -cE "H1|H2|H3" docs/reviews/sprint-285/repl-tool-root-cause.md` ≥ 6 (3 hipotez × verdict+kanıt). **Test:** 3+ repro.

---

## Task 2: Tur-içi tool-KUYRUĞU + per-tool sıralı onay (Ink)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: frontend-designer
- Skills: react-specialist, typescript-expert
- Files: src/cli/repl/app.tsx, src/cli/repl/run.tsx, src/cli/helpers/messages.ts, tests/cli/repl-confirm-queue.test.tsx
- Scope: src/cli/repl/, src/cli/helpers/messages.ts, tests/cli/
- Dependencies: 285-001

### Description
Bulgu-#1+#3'ün fix'i (T1'in H1-verdiktine göre): Ink confirm-akışını **kuyruğa** çevir — N tool-çağrısı = N sıralı onay-kartı; pending-confirm varken gelen yeni confirm EZMEZ, kuyruğa girer; her kartta `[i/N]` göstergesi (i18n); **deny-birini-geç-diğerine** (bir aksiyonun reddi kuyruğu iptal ETMEZ — kalanlar sorulmaya devam eder; mevcut deny-sinyali `[deckent] iptal edildi: <tool>` korunur); `a`(always) kararı aynı-tool kuyruk-kalanına da uygulanır. Motor-tarafı (chat-native.ts:815 for-loop) zaten sıralı — değişiklik YALNIZ Ink view-katmanında (engine'e dokunma). approvalMode etkileşimi (suggest/auto-edit/full-auto) korunur.

**Smoke:** `npm run build:all` → `node scripts/ink-pty-test.mjs` PASS + PTY'de 2-tool'lu sahte-turda 2 ayrı onay-kartı görünür (harness'e senaryo ekle ya da yeni mini-harness scripts/ altında — scope-dışıysa T5'e bırak, smoke'u unit+harness-mevcut-senaryolarıyla ver).
**Kanıt:** `grep -cE "queue|kuyru" src/cli/repl/app.tsx` ≥2 + T1'in H1-repro'su yeşile döner. **Test:** 4+ (3-confirm-sıralı, pending-ezilmez, deny-geç-devam, always-kuyruk-uygulanır).

---

## Task 3: Stream-toplama sağlamlığı — prose-konum bağımsızlığı
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-session.ts, tests/cli/chat-session-stream-collect.test.ts
- Scope: src/cli/commands/chat-session.ts, tests/cli/
- Dependencies: 285-001

### Description
Bulgu-#2'nin fix'i (T1'in H2-verdiktine göre): `parseStreamJsonLine` + `runTurn`-toplama (chat-session.ts:355-371) TÜM text-taşıyan stream-json blok-tiplerini `collected`'a katacak şekilde sağlamlaştır (text-delta, content-block, result-text — done-sonrası gelen kuyruk-text dahil edilip edilmeyeceğini T1-raporuna göre kararlaştır). Test-matrisi: tag {çıplak, uzun-prose-sonu, prose-ortası, iki-tag-arası-prose, code-fence-içi} × {tek-blok, çok-blok-stream} → `parseDeckentToolCalls(collected)` hepsinde doğru sayıyı bulur. `DECKENT_AGENTIC_SYSTEM_PROMPT`'taki "AÇIKLAMA YAPMA" kısıtı (chat-session.ts:89 — kırılganlık-semptomu) bu fix sonrası YUMUŞATILIR: "kısa bir açıklamadan sonra etiket(ler)i üretebilirsin" (model-doğal davranışla uyum).

**Smoke:** `npx vitest run tests/cli/chat-session-stream-collect.test.ts` 10+ matris-case yeşil + mevcut persistent-wire suite yeşil.
**Kanıt:** T1'in H2-repro'su yeşile döner + `grep -c "AÇIKLAMA YAPMA" src/cli/commands/chat-session.ts` = 0. **Test:** 10+ (matris).

---

## Task 4: Çoklu tool-sonucu geri-beslemesi — model HEPSİNİ görür
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-session.ts, tests/cli/chat-session-multi-result.test.ts
- Scope: src/cli/commands/chat-session.ts, tests/cli/
- Dependencies: 285-003

### Description
CC-ek-bulgusunun fix'i: `turnInput` (chat-session.ts:342-348) yalnız SON mesaja bakıyor — N tool yürüdüğünde modele 1 sonuç gidiyor. FIX: transcript-kuyruğundaki ARDIŞIK tool-mesajlarının TÜMÜ tek `[deckent tool sonuçları]` bloğunda (sıra+tool-adı etiketli) modele beslenir; tek-tool davranışı bit-uyumlu korunur (mevcut format tek-sonuçta değişmez — geriye-uyum testi). chat-session.ts'e T3 de dokunuyor → Dependencies sıralı.

**Smoke:** `npx vitest run tests/cli/chat-session-multi-result.test.ts` yeşil + persistent-wire suite yeşil.
**Kanıt:** 3-tool-sonuçlu transcript'te turnInput çıktısı 3 sonucu da içerir (test-assert). **Test:** 3+ (çoklu-blok, tekli-geriye-uyum, sıra-korunumu).

---

## Task 5: Dürüst-telemetri + PTY regresyon-guard
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: src/cli/commands/chat-session.ts, src/cli/repl/run.tsx, src/cli/helpers/messages.ts, scripts/ink-pty-tool-verify.mjs, package.json, tests/cli/tool-telemetry.test.ts
- Scope: src/cli/, scripts/, package.json, tests/cli/
- Dependencies: 285-002, 285-004

### Description
Bulgu-#3'ün fix'i + kalıcı-kanıt: (1) **parsed-vs-executed sayacı** — tur sonunda `parseDeckentToolCalls` kaç tag buldu / kaçı dispatch edildi / kaçı malformed-skip; uyuşmazlıkta kullanıcıya görünür i18n-uyarı (`[deckent] uyarı: N aksiyon-etiketi bulundu, M yürütüldü — ...`); malformed-JSON sessiz-skip'i (chat-session.ts:118) uyarıya bağlanır (sessiz-düşürme BİTER). (2) **PTY-regresyon-harness:** `scripts/ink-pty-tool-verify.mjs` (ink-pty-test.mjs deseni) — gerçek-PTY'de: write+approval ✓, bash-tek ✓, deny ✓ (bulgu-dokümanının çalışan-akışları) + ÇOK-TAG senaryosu (2 onay-kartı→2 yürütme). `package.json`'a `verify:repl-tools`. (3) `parseToolCallFromText` (chat-native.ts:357, tek-tag `<tool_use>` legacy-parser) — T1-raporuna göre konsolide/disposition notu (sil ya da yorumla işaretle; kapsam-dışıysa rapora yaz).

**Smoke:** `npm run build:all` → `node scripts/ink-pty-tool-verify.mjs` → "PASS" + exit 0 (4 senaryo).
**Kanıt:** `grep -n "verify:repl-tools" package.json` ≥1 + telemetri-uyarısı i18n-key'li (en+tr). **Test:** 3+ (sayaç-uyumlu-sessiz, uyuşmazlık-uyarısı, malformed-uyarısı).

---

**Beklenen:** 5 task; W1={1} → W2={2,3} → W3={4} → W4={5}. Model: opus 2 (1,2) · sonnet 3 — haiku YOK (kod-işi kuralı). chat-session.ts zinciri 3→4→5 sıralı; repl/ zinciri 2→5 sıralı. Sprint-sonu CC: PTY gerçek-koşu + bulgu-dokümanına kapanış-notu + MASTER-PLAN işaretleme (ARC-C/F11 ailesi REPL-TOOL maddesi olarak).
