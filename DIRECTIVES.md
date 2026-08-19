# DIRECTIVES — 7089 NATIVE-SESSION-LEDGER: kalıcı session-ledger + yazboz (karatahta) + litter hijyeni

## Goal

MASTER 7089 (owner admission+onay 2026-08-18, mimari owner-onaylı: "CC/Codex nasıl
yönetiyorsa aynısı; ekstra yük almayalım"). Native terminal bugün üç birbirinden
habersiz kayıt yolu taşıyor (training-trace `.deckent/traces` O(n²) tam-kopya ~200MB ·
`.brain/memory.db` chat satırları token'sız · audit event'leri) ve: turn-başı
provider-reported usage diske HİÇ yazılmıyor (native-agent-bridge.ts:770 `onTurnEnd`
token'ları alır, :771 `recordTurn(session.transcript())` token'sız yazar — yan yana,
bağlantısız); native `/resume` transcript'i re-hydrate ETMİYOR (app.tsx:1666-1667
yalnız `activeSessionIdRef` değişir, enqueue edilen `/resume <id>` modele düz turn
gider); scratch-checkpoint `keep-for-recovery` HİÇ silmiyor (scratch-checkpoint.ts:144-145
erken `return`, reaper yok — /tmp'de 12 kalıcı üretim dizini) ve tool-result-broker
content store'un teardown'ı yok (7 dizin). Hedef mimari:
`~/.deckent/projects/<slug>/<session>.jsonl` kalıcı per-turn ledger (mesaj-delta +
model + usage; /resume kaynağı) + `$TMPDIR/deckent/<slug>/<session>/scratchpad/`
uçucu karatahta (system-prompt'a enjekte) + eski kayıtlar dual-read (migrasyon YOK)
+ güvenli litter süpürme. Ortak join anahtarı mevcut: run.tsx:1095 `nativeSessionId`.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint. Tier-1
  gerçek-binary smoke sprint SONRASI Brain tarafından bot-safe build ile koşulur
  ve landing kaydına işlenir.
- Cross-platform (İMMUTABLE LAW 2): tüm path'ler `node:path` + `os.tmpdir()` +
  `os.homedir()` üzerinden; `GLOBAL_DECKENT_DIR` (src/core/constants.ts:9) tek home
  kökü; hiçbir POSIX-literal path gömülmez. Windows-güvenli segment sanitizasyonu
  (scratch-checkpoint.ts:58 `safePart` deseni emsal).
- 0-hardcode: keep/yaş pencereleri ve limitler named-constant + config-resolved
  (default'lu); model/provider adı kod-yoluna gömülmez.
- Ledger her zaman AÇIK (CC/Codex paritesi) — `training_trace.enabled` bayrağından
  BAĞIMSIZ; dosya izinleri 0600, dizinler 0700 (trace-wire.ts:65 emsal).
- Dual-read, migrasyon YOK: eski `.brain/memory.db` chat oturumları ve
  `.deckent/traces` OKUNMAYA devam eder; hiçbir mevcut kayıt taşınmaz/silinmez.
- i18n: user-facing yeni metin YALNIZ `getMessage(key, lang)` (en+tr birlikte);
  messages.ts'e YALNIZ Task 5 yazar. Task 4 mevcut key'lerle yetinemiyorsa
  hardcode etmez, ihtiyacı .result'a raporlar.
- Parallel execution ADMITTED; single-writer chokepoints: ONLY Task 1 writes
  src/core/project-slug.ts + src/cli/repl/session-ledger.ts +
  src/providers/session-usage-store.ts; ONLY Task 2 writes src/agent/*; ONLY
  Task 3 writes src/cli/repl/native-agent-bridge.ts + trace-wire.ts + run.tsx;
  ONLY Task 4 writes src/cli/repl/app.tsx; ONLY Task 5 writes
  src/cli/commands/cleanup.ts + src/cli/helpers/messages.ts.
- Hermetic tmpdir tests (gerçek homedir/tmpdir'e YAZMA YOK — injectable root
  zorunlu); scoped verification only. Echo the policy digest in your .result as
  runPolicyEvidence exactly as the prompt's Result contract instructs.

## Task 1: Canonical proje-slug + session-ledger store (append/read/list)
- Files: src/core/project-slug.ts, src/cli/repl/session-ledger.ts, src/providers/session-usage-store.ts, tests/core/project-slug.test.ts, tests/cli/repl/session-ledger.test.ts, tests/providers/session-usage-store.test.ts
- Scope: src/core/, src/cli/repl/, src/providers/, tests/
- Provider: codex
- Model: gpt-5.6-sol

### Description
1. `src/core/project-slug.ts` (YENİ): `projectSlug(absPath: string): string` —
   CC-paritesi slugifikasyon (non-alnum → '-'; session-usage-store.ts:74-76'daki
   mevcut formülün birebir taşınması, davranış değişmez). Repo'daki üç uyumsuz
   türetimden BU canonical olur; `src/providers/session-usage-store.ts`
   kendi local kopyasını silip buradan import eder (re-export ile mevcut test
   yüzeyi korunur). `attendedExecutionProjectId` (sha256) ve docker projectKey
   BU SPRINTTE DOKUNULMAZ — sayımla raporlanır (ayrı authority'ler).
2. `src/cli/repl/session-ledger.ts` (YENİ): append-only JSONL ledger.
   - Root: `join(GLOBAL_DECKENT_DIR, 'projects', projectSlug(cwd))`; dosya
     `<sessionId>.jsonl` (sessionId sanitize edilir); testlerde injectable
     `rootDir` opsiyonu ZORUNLU (homedir'e yazan test = NO_GO).
   - Satır şeması v1: `{ v:1, sessionId, turnIndex, ts, provider, model,
     messagesDelta: ProviderMessage[], usage: {inputTokens, outputTokens,
     cacheReadTokens?, cacheCreationTokens?} | null }` — DELTA yazılır (tam
     transcript kopyası YASAK); bozuk/yarım satır okuyucuda typed-skip
     (fail-open okuma, crash yok).
   - API: `appendLedgerTurn(...)`, `readLedgerSession(sessionId)` →
     `{messages, lastModel, totals, turnCount}` (re-hydrate için ProviderMessage[]
     birleştirme), `listLedgerSessions(limit)` → `{sessionId, turnCount, lastAt,
     preview}` (mevcut `ChatSessionSummary` şekliyle uyumlu — memory-types.ts:40-49).
   - Dosya 0600 / dizin 0700; append `appendFileSync` atomik-satır disipliniyle.
3. Testler hermetik: roundtrip (N turn append → read birleşik transcript birebir),
   delta-disiplini (dosya boyutu O(n) kanıtı), bozuk-satır toleransı, slug
   birebir CC-parite vektörleri, Windows-ayraç güvenliği (path api ile).

GO: tsc 0; scoped yeşil; usage alanı şemada zorunlu-nullable; injectable root
kanıtlı. NO_GO: gerçek homedir'e yazan test veya tam-transcript kopyası yazımı.

## Task 2: Yazboz (karatahta) — scratch kökü + gerçek reaper + broker teardown + system-prompt enjeksiyonu
- Files: src/agent/scratch-checkpoint.ts, src/agent/tool-result-broker.ts, src/agent/session.ts, src/agent/identity.ts, src/agent/loop.ts, tests/agent/scratch-checkpoint.test.ts, tests/agent/tool-result-broker.test.ts, tests/agent/identity.test.ts, tests/agent/qwen-incident-regression.test.ts, tests/cli/native-agent-scratch-wire.test.ts
- Scope: src/agent/, tests/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
1. Scratch kökü onaylı şekle taşınır: `join(tmpdir(), 'deckent', <slug>, <sessionId>,
   'scratchpad')` (slug Task 1 helper'ından parametre olarak gelir — src/agent
   src/core'a bağımlılığı zaten var, import serbest; mkdtemp yerine deterministik
   `mkdirSync(recursive)` — var olan dizin RECOVERY için yeniden kullanılır).
   Checkpoint dosyaları bu kökün altında kalır; `scratch.info.root` semantiği korunur.
2. `keep-for-recovery` GERÇEK olur: 10-dk pencere KORUNUR (named-constant +
   options-resolved), fakat `openScratchStore` açılışta AYNI slug namespace'i
   altındaki kardeş session dizinlerinden mtime'ı pencereyi aşmış olanları süpürür
   (bounded readdir, fail-open — hijyen hatası oturumu ASLA düşürmez). Eski-önek
   legacy kökler (`deckent-<tenant>-<hash>-<session>-*` mkdtemp artıkları) yaş
   eşiği aşımında aynı süpürmeye girer (strict prefix match).
3. `tool-result-broker.ts` content store teardown kazanır: `ContentWriter`'a
   `close()`; content dizini session scratch kökünün ALTINA taşınır (injectable dir
   parametresi; session.ts kapatırken broker'ı da kapatır) — böylece reaper tek
   namespace süpürür. qwen-incident-regression + tool-result-broker pinleri
   güncellenir (Pin-Taraması: bu iki dosya ContentWriter'ı pinliyor).
4. System-prompt enjeksiyonu: `ComposeOptions`'a `scratchDir?: string`
   (identity.ts:56); compose çıktısına kısa mekanizma bölümü (İngilizce default,
   string-free kural — UI metni değildir): karatahta path'i + "uçucu, oturum-sonu
   süpürülür" sözleşmesi. `loop.ts:120` her-turn compose'una `LoopDeps.scratchDir`
   ile geçirilir; session.ts `scratch.info.root`'u loop deps'e bağlar.
5. Testler: reaper penceresi (taze dizin KALIR, bayat silinir, fail-open),
   deterministik-kök recovery reuse, broker close→dizin süpürülebilir,
   composeSystemPrompt scratchDir'li/siz iki mod (tests/agent/identity.test.ts pini).

GO: tsc 0; scoped yeşil; reaper fail-open kanıtlı; 10-dk semantiği korunmuş.
NO_GO: hijyen hatasının oturumu düşürmesi veya scratch dışı dizin silme riski.

## Task 3: Ledger wiring — turn-başı usage kalıcılaşır + trace O(n²) ölür + hydrate seam
- Files: src/cli/repl/native-agent-bridge.ts, src/cli/repl/trace-wire.ts, src/cli/repl/run.tsx, tests/cli/trace-wire.test.ts, tests/cli/trn2-repl-trace-wire.test.ts
- Scope: src/cli/repl/, tests/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1, Task 2

### Description
1. `native-agent-bridge.ts:770-771` seam'i birleşir: `recordTurn` imzası
   `(messages, meta: {usage, model, provider, turnIndex})` olur; `onTurnEnd`'in
   biriktirdiği `inputTokens/outputTokens` (born-520 `+=` disiplini aynen) artık
   kayıt katmanına AKAR. BG-turn hattı (:792-796) aynı sözleşmeyi taşır.
2. `run.tsx` wiring: Task 1 `session-ledger` composer'ı `buildTurnRecorder`'ın
   YANINA bağlanır — ledger HER ZAMAN yazar (flag'siz); training-trace
   `resolveTraceEnabled` gate'i aynen kalır. Trace'in system alanı lazy getter
   olur (scratchDir session açıldıktan sonra belli — trace-wire.ts:18-23 model
   getter emsal; Task 2'nin compose değişikliğiyle trace/model-facing system
   AYRIŞMAZ).
3. traces O(n²) ölür: `.deckent/traces` tüketicileri grep'lenir (scripts/ + src/)
   ve kanıt .result'a yazılır; per-turn TAM-transcript kopyası yerine dürüst
   delta/epoch stratejisi uygulanır (tercih: meta.turnIndex'li delta satırı;
   tüketici tam-transcript varsayıyorsa kırmadan şema-işaretli geçiş). Ledger
   artık full-fidelity kaynak olduğundan trace yalnız training-amaçlı kalır.
4. Re-hydrate seam: engine/bridge'e `hydrateTranscript(messages: ProviderMessage[])`
   (Task 4'ün app.tsx'ten çağıracağı tek nokta — bridge'e YALNIZ bu sprint'te bu
   task yazar; seam'siz Task 4 native /resume'u kapatamaz).
5. Testler: recordTurn yeni imza + usage'ın ledger satırına ulaştığı uçtan-uca
   (hermetik root), trace-delta O(n) boyut kanıtı, lazy-system trace/compose
   eşitliği, hydrate seam'in transcript'i birebir yüklediği.

GO: tsc 0; scoped yeşil; usage → disk zinciri testle kanıtlı; trace tüketici
grep'i .result'ta. NO_GO: ledger yazımının training_trace bayrağına bağlanması.

## Task 4: Native `/resume` gerçek re-hydration + picker dual-read
- Files: src/cli/repl/app.tsx, tests/cli/repl/app-surface-wire.test.tsx, tests/cli/repl-i18n-flip.test.ts, tests/cli/repl-turn-exception.test.ts, tests/cli/agentic-session.test.ts
- Scope: src/cli/repl/, tests/
- Provider: codex
- Model: gpt-5.6-sol
- Dependencies: Task 1, Task 3

### Description
1. Native yolda `/resume <id>`: bugünkü `queue.enqueue('/resume <id>')` düz-turn
   sızıntısı ÖLÜR (app.tsx:1667-1680). Yeni akış: (a) ledger'da session varsa
   `readLedgerSession` → Task 3 `hydrateTranscript` ile engine transcript'i
   birebir yüklenir; (b) ledger'da yoksa legacy `.brain/memory.db`
   (`getChatHistory`) dual-read fallback — chat satırları ProviderMessage'a
   dönüştürülerek hydrate edilir (migrasyon YOK, eski kayıt yerinde kalır);
   (c) `activeSessionIdRef` + footer sayaçları tutarlı güncellenir.
2. Resume picker dual-read: `listLedgerSessions` + mevcut `listChatSessions` +
   sprint-jobs birleşimi (app.tsx:197/220/256 mevcut merge deseni) — aynı
   sessionId iki kaynakta varsa ledger kazanır (tek satır görünür).
3. Mevcut i18n key'leriyle yetinilir; yeni metin ihtiyacı hardcode EDİLMEZ,
   .result'a raporlanır (messages.ts yazarı Task 5).
4. Pin-Taraması kapsamı: resolveResumeCommand pinleri (app-surface-wire :104/:130,
   repl-i18n-flip), persistTurn/runNativeTurnLoop pinleri (repl-turn-exception,
   agentic-session) kendi dosyalarında güncellenir.
5. Testler: ledger'lı resume → transcript birebir; legacy-only resume → fallback
   dual-read; çakışan id → ledger önceliği; hydrate sonrası yeni turn'ün
   `turnIndex` devamlılığı.

GO: tsc 0; scoped yeşil; her iki kaynaktan resume testle kanıtlı. NO_GO:
`/resume`'un modele düz user-turn olarak gitmeye devam etmesi.

## Task 5: `cleanup --tmp` litter hijyeni + i18n + uçtan-uca battery
- Files: src/cli/commands/cleanup.ts, src/cli/helpers/messages.ts, tests/cli/cleanup-tmp.test.ts, tests/cli/native-session-ledger-battery.test.ts
- Scope: src/cli/, tests/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 2, Task 3, Task 4
- Smoke: node dist/cli/entry.js cleanup --help → `--tmp` opsiyonu listelenir (sprint-sonrası Brain koşar)

### Description
1. `deckent cleanup --tmp`: `os.tmpdir()` altında YALNIZ bilinen deckent
   önekleri (`deckent/` namespace kökü + strict `deckent-*` legacy önek
   allowlist'i) + yaş eşiği (named-constant default, config-resolved override)
   ile güvenli süpürme. Default DRY-RUN (aday listesi + toplam boyut raporu);
   silme YALNIZ `--yes` ile. Aktif oturum/sprint dizinleri (mtime penceresi
   içindekiler) ASLA aday olmaz. /tmp kökünün kendisine veya allowlist-dışı
   herhangi bir path'e dokunmak = NO_GO.
2. i18n: tüm yeni user-facing metin `getMessage` en+tr çifti (TR ürün-sesi);
   Task 4'ün raporladığı key ihtiyacı varsa burada eklenir.
3. Battery (hermetik): (a) ledger append→resume roundtrip gerçek store'la
   (tmpdir root); (b) turn usage'ının JSONL satırında kalıcılaştığı; (c) compose
   edilen system-prompt'ta scratchpad path'i; (d) reaper'ın bayat kardeşi
   süpürüp tazeyi koruduğu; (e) cleanup --tmp dry-run/--yes davranış çifti.
4. Sayımla rapor: bu sprint kapsamı DIŞINDA kalan test-artığı litter üreticileri
   (1489 adet — tests/** mkdtemp cleanup'sızları) .result'a dosya listesiyle
   raporlanır; BU SPRINTTE test dosyaları toplu DEĞİŞTİRİLMEZ (ayrı admission).

GO: her iki yeni test dosyası yeşil; tsc 0; dry-run default kanıtlı; i18n
lint yeşil. NO_GO: allowlist-dışı silme yolu veya default'un destructive olması.
