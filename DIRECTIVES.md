# DIRECTIVES — SPRINT-357: TOOL-katalog + onay-derinliği + terminal-P1 + borçlar (16 task)

## Goal
TOOL pillar'ının katalog/registry kalanlarını indir (TOOL-CAT→TERM-CAT→TOOL-REG), onay-omurgasını
derinleştir (CKPT-1 köprüsü + ALLOWSCOPE + nervous-bridge), terminal-P1'leri kapat
(resume/busy/config-wire/slash-mode/provider-SSOT), TRN-etiket + TOK-AUT + doctor-dürüstlük +
link-sweep + PKG-SSOT kalanı. DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.
**Not:** Bu sprint fable-Brain deneyidir (brain_model=fable) — retro'da opus-Brain'le fark ölçülecek.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (server.ts YALNIZ Task 9 · chat-mode.ts YALNIZ Task 10 · entry.ts YALNIZ Task 11 ·
  doctor.ts+messages.ts YALNIZ Task 14 · task-mode-runner.ts YALNIZ Task 13 · provider-packages.ts
  YALNIZ Task 16 · **app.tsx HİÇBİR task'ın yazı-listesinde DEĞİL — dokunma**).
- **DISK-VERIFY first**; ADR (D-004 yön: core→orchestra import YASAK!); surgical; YAGNI.
- **Hermetik test** (tmpdir, async spawn); gerçek provider/exec/telegram YOK. **No build/install/login.**
- **npm/yarn/pnpm install-ailesi ASLA** — bağımlılık ihtiyacı doğarsa prompt'undaki
  Dependency-Mutation Advisory kanalını kullan (`.question` + `[NPM-ADVISORY]`).
- **Flag-gated wiring** default-off; flag-off byte-identical (test).
- **Mekanizma modülleri string-free** (label caller-injected, EN default); user-facing metin yalnız
  Task 14'te (getMessage). **Honest result. No haiku.**

---

## Task 1: TOOL-CAT — tool/action katalog veri-modeli + trust-tier
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/tool-catalog.ts, tests/core/tool-catalog.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-25 (TOOL-CAT). Tool/action catalog veri-modeli: tool-registry entry'lerinin üstüne
trust-tier katmanı — `Core | Project | MCP | Enterprise | Danger` (zod-enum) + katalog-kaydı
(id/label-key/trustTier/riskLevel/source/scopes) + `classifyToolTrust(entry)` (kaynak+risk'ten
deterministik tier: builtin core-7→Core, proje-tanımlı→Project, MCP-seed→MCP, riskLevel critical→
Danger clamp). tool-registry.ts'i DEĞİŞTİRME — read-only tüket (D-004 yönüne dikkat: core→core ✓).
### goNogo
- goCriteria: 5-tier zod-enum + classifyToolTrust deterministik (fixture-registry testleri: builtin→
  Core, MCP→MCP, critical→Danger clamp); katalog-kaydı serileşir (JSON round-trip); `tsc` temiz.
- nogo: tool-registry.ts/tool-search.ts değişikliği; UI/render kodu (Task 2'nin işi).

## Task 2: TERM-CAT — katalog render + trust badge (string-free)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/catalog-render.ts, tests/cli/catalog-render.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: Task 1
### Description
MASTER-PLAN Sıra-26 (TERM-CAT). Task 1'in katalog-modelini terminal'e render eden mekanizma-modülü:
`renderCatalog(entries, labels)` — kategori-gruplu liste + trust-badge (tier→badge-char/renk-kodu,
NO_COLOR-duyarlı) + risk-işareti. TÜM görünen metin `labels` parametresinden (string-free mekanizma,
EN default caller'da); emoji YOK (lucide-benzeri char/ANSI). /help-katalog tüketimi follow-up —
burada yalnız saf render.
### goNogo
- goCriteria: fixture-katalogdan deterministik çıktı (snapshot-test); NO_COLOR'da ANSI'siz;
  label-injection çalışır (TR-label fixture'ı ile aynı yapı); `tsc` temiz.
- nogo: hardcoded user-facing string; app.tsx/command dosyası değişikliği.

## Task 3: TOOL-REG — availability-cache (TTL) + toolset enable/disable dilimi
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/tool-availability.ts, tests/core/tool-availability.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-24'ün (TOOL-REG) ilk dilimi: (a) availability-cache — tool-kaynağı probe sonucu
(mcp-server ayakta mı vb.) TTL'li memoize (`checkAvailability(id, probe, {ttlMs})`, injected-clock
testable); (b) toolset enable/disable — `.deckent/settings/toolsets.json`'a persist eden
enable/disable seti (atomic-write tmp+rename, bozuk-dosya fail-soft→hepsi-enabled). Schema-override/
generation-memo/shadow-policy bu dilimde YOK (follow-up).
### goNogo
- goCriteria: TTL içinde probe 1×, TTL sonrası re-probe (fake-clock); disable edilen tool
  isDisabled=true + restart-survive (tmpdir round-trip); bozuk toolsets.json fail-soft; `tsc` temiz.
- nogo: schema-override/memo (dilim-dışı); tool-registry.ts değişikliği.

## Task 4: CKPT-1 — WorkerQuestion → ApprovalBroker köprüsü (gerçek human-checkpoint)
- Model: fable
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/question-approval-bridge.ts, tests/orchestra/question-approval-bridge.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-73 (CKPT-1). Bugün worker soruları Brain'de auto-continue'ya düşüyor (ipc-registry
handleWorkerQuestion) — gerçek insan-checkpoint yok. Köprü-modülü: `bridgeQuestionToApproval(question,
broker, opts)` — WorkerQuestion'ı ApprovalRequestInput'a çevir (scope: 'lifecycle', risk: soru-içeriğinden
heuristik, policy: 'require-approval', maskArgs ile context maskele), broker'a submit et, decision'ı
BrainAnswer'a geri-çevir (allow→suggestedAction-veya-continue, deny→abort, timeout→fallback continue).
Flag `approval.question_bridge` (default-off, config-types'a alan ekle). ipc-registry.ts'e DOKUNMA —
wire follow-up task'ı yapacak; NPM-ADVISORY dalı deterministik kalır (köprüden ASLA geçmez, tasarım-notu yaz).
### goNogo
- goCriteria: fake-broker ile question→submit→decide→answer round-trip (allow/deny/timeout 3 yolu);
  NPM-ADVISORY-işaretli soru köprüye girse bile reddedilip deterministik-yol notu döner; flag-off'ta
  modül import-edilebilir ama hiçbir yerde çağrılmaz (0-caller kanıtı test-notunda); `tsc` temiz.
- nogo: ipc-registry.ts değişikliği; default-on; raw context'in maskesiz taşınması.

## Task 5: APR-ALLOWSCOPE — scoped always-allow (asla global)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, secure-coding
- Files: src/core/approval-allowscope.ts, tests/core/approval-allowscope.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-69 (APR-ALLOWSCOPE). "Always allow" kaydı: (tool/scopeId + ApprovalScope + azami-risk
+ expiry) dörtlüsüne bağlı — ASLA global. `.deckent/settings/approval-allows.json` persist (atomic,
fail-soft→boş-set). API: `grantAllow(rule)`, `revokeAllow(id)`, `matchesAllow(request)` — eşleşme
TAM-scope + risk<=azami + expiry-geçmemiş; süresi-geçen kayıt match-anında temizlenir. approval-policy.ts'i
DEĞİŞTİRME — policy-engine'in ÖNÜNE takılacak lookup olarak tasarla (kompozisyon follow-up).
### goNogo
- goCriteria: scope-dışı/risk-üstü/expired istek match ETMEZ (negatif-testler zengin); grant→match→
  revoke→no-match round-trip; expiry-temizliği; global-wildcard kaydı schema-düzeyinde REDDEDİLİR;
  `tsc` temiz.
- nogo: approval-policy.ts/broker değişikliği; wildcard/global allow; default-on wire.

## Task 6: APPROVE-007b — REPL /nervous köprüsü + handleEdit
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/repl/nervous-bridge.ts, tests/cli/repl/nervous-bridge.test.ts
- Scope: src/cli/, src/nervous/, tests/cli/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-72 (APPROVE-007b). REPL'den nervous kararlarına köprü: pending nervous-önerilerini
listele (accept/reject/edit aksiyon-planı döndür — exec-siz plan-objesi, injected-executor deseni) +
`handleEdit(id, modifiedPayload)` — öneriyi değiştirilmiş-payload ile kabul yolu (nervous accept'in
pending'i silmeme gotcha'sını disk-verify et — edit-accept sonrası pending temizliğini plana dahil et).
Nervous çekirdeğini DEĞİŞTİRME; mevcut nervous API'sini read-only tüket, aksiyonu injected-executor'a delege et.
### goNogo
- goCriteria: fake-nervous-store ile list/accept/reject/edit plan-üretimi; edit-accept planı pending-
  temizlik adımı içerir; executor-inject testli (gerçek-exec yok); `tsc` temiz.
- nogo: src/nervous/ çekirdek değişikliği; gerçek nervous-exec.

## Task 7: TERM-RESUME — recent-session teaser + /resume picker çekirdeği
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/session-resume.ts, tests/cli/session-resume.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-50 (TERM-RESUME). Açılışta "son N oturum" teaser'ı + `/resume` picker'ının veri+seçim
çekirdeği: session-kaynağını disk-verify et (sprint-arşivi/`.deckent` oturum-izleri — ne varsa onu oku),
`listRecentSessions(root, n)` (id/title/tarih/durum; bozuk-kayıt atla) + `pickSession(input, sessions)`
(number/id/title-prefix eşleşme). Degrade-safe: kaynak yoksa boş-liste (teaser hiç görünmez). Render/
Ink-wire follow-up — burada saf veri+seçim mantığı, string-free.
### goNogo
- goCriteria: fixture-oturumlarla listeleme (en-yeni-önce, N-cap); number/id/title-prefix seçimi +
  çakışmada belirsizlik-hatası; kaynak-yok→boş-liste (throw yok); `tsc` temiz.
- nogo: app.tsx/entry.ts wire; hardcoded string.

## Task 8: TERM-BUSY — /queue /interrupt /steer durum-makinesi
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/repl/busy-controls.ts, tests/cli/repl/busy-controls.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-51 (TERM-BUSY). Busy-davranış standardının çekirdeği: koşan-iş varken gelen komutlar
için durum-makinesi — `/queue` (ChatTurnQueue'ya devret — chat-turn-queue.ts'i read-only tüket),
`/interrupt` (kibarca durdur: injected-canceller), `/steer <msg>` (koşan turn'e yönlendirme-notu kuyruğu).
Esc/Ctrl-C eşlemesi için key→aksiyon çözümleme tablosu (Ink-wire follow-up). Yarış-durumları: busy-değilken
interrupt no-op + bilgi-sonucu; çifte-interrupt idempotent.
### goNogo
- goCriteria: busy/idle × queue/interrupt/steer matris-testleri; çifte-interrupt idempotent;
  steer-notları FIFO + turn-bitiminde drain-plan; canceller-inject testli; `tsc` temiz.
- nogo: chat-turn-queue.ts/app.tsx değişikliği; gerçek süreç-öldürme.

## Task 9: TERM-CONFIG-WIRE — TerminalConfig'i runtime'a bağla
- Model: sonnet
- Effort: high
- Skills: api-design, typescript-expert
- Files: src/api/server.ts, tests/api/terminal-config-wire.test.ts
- Scope: src/api/, src/core/, tests/api/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js serve --port 3213 → GET /api/status = 200 (terminal-config değerleri effective)
### Description
MASTER-PLAN Sıra-58 (TERM-CONFIG-WIRE, G-029). `terminal.*` config'i (maxSessions/idleTimeoutMs/
scrollbackBytes/allowShellKind/bind) şu an schema-only — server hardcoded-default kullanıyor. server.ts'te
terminal-session yönetiminin default'larını ResolvedConfig.terminal'den okut (yoksa mevcut default'lar —
davranış-koruma); bind adresi + outboundDailyQuota varsa onları da bağla. DİKKAT: server.ts büyük —
surgical diff, yalnız config-okuma noktaları; mevcut testler yeşil kalmalı.
### goNogo
- goCriteria: config'te maxSessions=2 verilince 3. session reddi (hermetik test, injected/ephemeral —
  gerçek sabit-port değil); config-yok→eski default'lar byte-aynı; idleTimeout config'ten okunur; `tsc` temiz.
- nogo: terminal davranışının config-yokken değişmesi; API-kontrat kırılması.

## Task 10: SLASH-MODE-WIRE — filterRegistryByMode'u /help yoluna bağla
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-mode.ts, tests/cli/slash-mode-wire.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js --help → exit 0 (regresyon)
### Description
MASTER-PLAN Sıra-56 (SLASH-MODE-WIRE, G-034 #3). `filterRegistryByMode` (chat-mode.ts:55) delivered ama
UNWIRED — /help tüm registry'yi basıyor, enterprise-slash user-mode'da gizlenmiyor. DISK-VERIFY: /help
render'ının komut-listesini nereden aldığını bul (grep command-registry tüketicileri). Wire stratejisi:
chat-mode.ts'e mode-aware help-list export'u ekle (`getVisibleCommands(mode)`), /help-tüketicisinin
çağrısını buna çevir — tüketici dosya app.tsx İSE dokunma, bunun yerine export'u hazırla + `.result`
notes'a `docImpact:` + wire-noktasını yaz (follow-up); tüketici chat-mode.ts-içi ya da yazı-listendeki
başka dosyaysa bağla.
### goNogo
- goCriteria: getVisibleCommands(mode) user-mode'da enterprise-komutları filtreler (test); mevcut
  chat-mode testleri yeşil; wire tamamlandıysa /help-path testi, tamamlanamadıysa dürüst notes+plan;
  `tsc` temiz.
- nogo: app.tsx/entry.ts değişikliği; registry çekirdeğine dokunmak.

## Task 11: PROVIDER-SSOT — buildReplProvider → resolveChatAdapter tekleştirme
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/entry.ts, tests/cli/entry-provider-ssot.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js --help → exit 0 (regresyon)
### Description
MASTER-PLAN Sıra-55 (PROVIDER-SSOT, G-034 #1). entry.ts:318 `buildReplProvider` bare-REPL için inline
provider kuruyor; SSOT `resolveChatAdapter` (chat-provider-parity.ts, ADR-083) ile İKİ ayrı yol var —
minor-drift. buildReplProvider'ı resolveChatAdapter'a delege eden ince-adapter'a indir (injected
spawnFn/fetchFn seam'leri KORUNUR — hermetik testler kırılmasın); davranış-fark matrisi çıkar (hangi
env/config kombinasyonunda farklı provider seçiliyor) ve farkları SSOT-lehine kapat; kalan bilinçli-fark
varsa notes'a yaz.
### goNogo
- goCriteria: mevcut entry/bare-REPL testleri yeşil; buildReplProvider artık resolveChatAdapter'ı
  çağırıyor (grep-kanıt + test); seam-injection korunmuş; davranış-fark matrisi notes'ta; `tsc` temiz.
- nogo: chat-provider-parity.ts değişikliği; REPL davranış-regresyonu.

## Task 12: TRN-LABEL — run-outcome etiket taksonomisi
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/trace-labels.ts, tests/core/trace-labels.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-79 (TRN-LABEL, §3.5). Training+memory için run-outcome etiket taksonomisi:
`RunOutcomeLabel = success | partial | cancelled | failed | not_dispatched` (zod) + mapper'lar:
task-evaluation→label (DONE→success, GO_WITH_TECH_DEBT→partial, NO_GO→failed, NOT_DISPATCHED→
not_dispatched), sprint-özeti→label (oran-eşikli). D-004 yönünü disk-verify et: TaskEvaluation enum'u
orchestra'daysa core→orchestra import YASAK — mapper'ı tip-yapısal kur (string-union parametre kabul et).
trace-recorder/pipeline'a wire follow-up — burada saf taksonomi+mapper.
### goNogo
- goCriteria: 5-label zod + iki mapper tam-eşleme testleri (her evaluation değeri kapsanır — exhaustive-
  switch compile-güvencesi); D-004 ihlali yok (import-yön grep-kanıt notes'ta); `tsc` temiz.
- nogo: trace-recorder/pipeline değişikliği; core→orchestra import.

## Task 13: TOK-AUT — autonomous task-mode tokenUsage 0/0/0 fix
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/task-mode-runner.ts, tests/orchestra/task-mode-tokenusage.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-81 (TOK-AUT, WP-4 ailesi). Sprint-yolu result'ları `enrichResultCost`/
`enrichResultTokenUsage` (result-collector.ts:563+) ile dolduruyor; autonomous task-mode yolu
(task-mode-runner.ts) bu enrichment'ı ÇAĞIRMIYOR → tokenUsage 0/0/0 kalıyor. DISK-VERIFY: task-mode-runner'ın
result-üretim noktasını bul, enrichment'ı oraya bağla (result-collector'dan import — orchestra→orchestra ✓);
transcript/log kaynağı task-mode'da farklıysa kaynak-çözümlemeyi task-mode'a uyarla. result-collector.ts'e
DOKUNMA (read-only import).
### goNogo
- goCriteria: fake-transcript'li task-mode koşusunda result.tokenUsage ≠ 0/0/0 (hermetik fixture);
  transcript-yok→0/0/0 + dürüst-fallback korunur; mevcut task-mode testleri yeşil; `tsc` temiz.
- nogo: result-collector.ts değişikliği; sprint-yolu davranış değişikliği.

## Task 14: ONB-HONEST — doctor "hazır/eksik/tek-tık-fix" dürüst mesaj katmanı
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/doctor.ts, src/cli/helpers/messages.ts, tests/cli/doctor-honest.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js doctor → exit 0 + özet-satırında hazır/eksik sayımı
### Description
MASTER-PLAN Sıra-204 (ONB-HONEST, §3.1). Doctor çıktısının sonuna non-teknik dürüst özet: her check
`hazır | eksik | tek-komutla-düzelir` üç-durumuna map'lenir; kapanışta "N hazır · M eksik (K'sı
`deckent doctor --fix` ile düzelir)" + eksikler için tek-satır insan-dili açıklama. TÜM metin
getMessage üzerinden (en+tr çifti, i18n-FIRST); mevcut check-mantığına DOKUNMA — yalnız sunum-katmanı.
--json çıktısına `honestSummary` alanı (yapısal).
### goNogo
- goCriteria: fixture-check-sonuçlarından doğru üç-durum sınıflaması + özet-sayımı; en+tr key-çiftleri
  eksiksiz (test); --json'da honestSummary; mevcut doctor testleri yeşil; `tsc` temiz.
- nogo: check-mantığı değişikliği; hardcoded string (i18n-ihlal).

## Task 15: LINK-SWEEP — eski-ADR linklerinin crosswalk taraması (born-455)
- Model: sonnet
- Effort: normal
- Skills: doc-writing
- Files: docs/
- Scope: docs/
- Dependencies: none
### Description
MASTER-PLAN Sıra-455 (DOC-ADR-LINK-CROSSWALK-SWEEP). 2026-06-30 taksonomi-redesign'ı eski-numaralı ADR
dosyalarını silince docs-genelinde ~20+ link öldü. `npm run lint:link` koş → her kırık eski-ADR linkini
docs/adr dosyalarındaki **Crosswalk:** satırlarından yeni adr-g/d-NNN karşılığına çevir (link-metni
bağlamını koru); crosswalk'ta karşılığı OLMAYAN (gerçekten silinmiş, halefsiz) linkler için çevre-cümleyi
"arşivlendi" diline çevir ya da linki metin-yap. docs/archive/ altındaki tarihî dokümanların İÇERİĞİNE
dokunma (frozen, Tier-4).
### goNogo
- goCriteria: `npm run lint:link` exit 0 (ya da kalan hataların TAMAMI archive-frozen sınıfı — notes'ta
  listele); değişen her link crosswalk-doğru (spot-check listesi notes'ta); ADR gövde-metni değişmedi
  (yalnız link/çevre-cümle).
- nogo: ADR karar-metni değişikliği; docs/MASTER-PLAN.md'ye dokunmak.

## Task 16: PKG-SSOT-REST — install-hint paket-adlarının kalan çağrı-noktaları (207 tamamlama)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/provider-packages.ts
- Scope: src/core/, src/cli/, src/orchestra/, tests/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-207 (PKG-NAME-SSOT) tamamlama. 356-008 SSOT-modülü (`provider-packages.ts`) + kritik-3
çevrimi yaptı, kalan hardcoded install-hint'ler duruyor. DISK-VERIFY: repo'da hardcoded provider-paket-adı
hint'lerini grep'le envanterle (`@anthropic-ai/claude-code`, `@openai/codex`, `@google/gemini-cli`,
`npm install -g` kalıpları; test/fixture hariç); HER kalan çağrı-noktasını SSOT'tan okur hale getir —
dokunduğun her dosyayı `.result` filesChanged'e yaz. DISTINCT-FILE listesindeki dosyalara (server.ts/
chat-mode.ts/entry.ts/doctor.ts/messages.ts/task-mode-runner.ts) DOKUNMA — onlardaki hint varsa notes'a
bırak. **npm install ASLA çalıştırma** — bu task paket-ADLARI metni işidir; bağımlılık ihtiyacı sanrısı
doğarsa Dependency-Mutation Advisory kanalını kullan.
### goNogo
- goCriteria: grep-envanter notes'ta (önce/sonra sayım); kalan hardcode=0 ya da DISTINCT-FILE-korumalı
  istisnalar listeli; SSOT-testleri + dokunulan modül testleri yeşil; `tsc` temiz.
- nogo: DISTINCT-FILE dosyalarına yazmak; npm install/rebuild; paket-adı değiştirmek (yalnız kaynağı SSOT'a çevir).
