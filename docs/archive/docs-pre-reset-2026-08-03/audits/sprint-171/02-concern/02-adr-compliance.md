# ADR Compliance Audit — Audit Raporu (Sprint 171)

> **Kapsam:** 52 ADR (46 accepted, 4 proposed, 1 deprecated, 1 superseded) × kod enforcement.
> **Metot:** `.brain/memory.db` üzerinde read-only `SELECT` ile ADR envanteri, `docs/adr/*.md` filesystem listesi ve `.brain/exports/decisions.md` çıktısı üçlü senkron doğrulaması; ardından her ADR için `src/**` taraması ile enforcement kanıtı (file:line) veya drift tespiti.
> **Cross-cut task:** Bu rapor modül-derin değildir — Kapsam Haritası bölümü yoktur (Worker Contract).

---

## 1. Bulgular (Findings)

### 1.1. CRITICAL Drift — Doc-vs-Code Yanılgıları (OSS GA Blocker)

1. **ADR-045 dependency_pipeline_enabled gerçeği ile doküman iddiası uyumsuz.** Aktif proje konfigürasyonu (`.deckent/config.json:198`) bu bayrağı `false` olarak tutar; oysa hem `DECKENT.md:51` "Sprint 167 flip: `dependency_pipeline_enabled: true` — Wave scheduling goes live" diye ilan eder, hem de `.contracts/api-surface.md:83` "default since Sprint 156, confirmed Sprint 169 H5" iddia eder. Kaynak kod tarafında varsayılan değer (`src/core/config.ts:600`) `true` ama proje config'i bu varsayılanı `false` ile bastırıyor. Sonuç: Sprint 171 DIRECTIVES'i bile "Wave geçişleri Brain manuel" diyerek Kahn topological dispatch'in çalışmadığını kabul ediyor; runtime davranışı legacy FIFO mode. Yeni kullanıcı README/DECKENT.md okuyup "Wave-Based Execution Live" sanırsa, gözleyeceği davranış (manual respawn) belgeyle çelişir.

2. **ADR-008 "Brain merkezi import, tek-yönlü bağımlılık" iddiası kısmen ihlal ediliyor.** ADR-008 "Brain (sprint-controller) is the ONLY module that imports from tmux, auditor, worker" der; gerçek import grafı bu kontratı çok sayıda yerde kırar: `src/orchestra/sprint-lifecycle.ts:60`, `src/orchestra/sprint-spawner.ts:95`, `src/orchestra/debt-manager.ts:15`, `src/orchestra/result-collector.ts:30` ve `src/orchestra/ipc-registry.ts:11-13` doğrudan `../agents/worker.js` veya `../agents/worker-ipc.js` import eder. `src/orchestra/spawn-backend.ts:4`, `src/orchestra/sprint-spawner.ts:42`, `src/orchestra/sprint-utils.ts:31`, `src/orchestra/sprint-lifecycle.ts:54`, `src/orchestra/result-collector.ts:44` ise `./tmux.js`'ten direkt import yapar. CLI ve API tarafı da ekstra ihlaller içerir: `src/api/server.ts:18`, `src/cli/entry.ts:6`, `src/cli/commands/{watch,attach,start,spawn,kill}.ts`. ADR-008 yazılı kontratı kullanıcı/yeni geliştiriciye "tek import noktası" söyler — kod gerçeği "orchestra-içi free-for-all + CLI/API doğrudan tmux çağrısı". Bu CRITICAL çünkü modül boundary kuralı şu an doğrulamadan dağıtılırsa Sprint 172 OSS GA sonrası katkıcılar yanlış mental modelle PR açar.

3. **ADR-040 "Nervous System — Proactive Meta-Orchestrator" runtime'da wire'lı değil.** `src/nervous/observer.ts:58` örnek olarak `new NervousObserver('/path/to/project')` gösterse de, `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-lifecycle.ts` ve `src/orchestra/brain.ts` içinde tek bir `import ... from '../nervous/...'` veya `new NervousObserver(...)` çağrısı yoktur. Yalnızca CLI (`src/cli/index.ts:44-45`, `src/cli/commands/{config-nervous,nervous}.ts`) ve MCP araç katmanı (`src/mcp/tools/nervous.ts:8-10`) konfigürasyon/history okuma için nervous modüllerini import eder. ADR-040 "Proactive Meta-Orchestrator" diye sunulur, fakat sprint çalışırken nervous observer/dispatcher/executor zinciri otomatik olarak tetiklenmez; sprint döngüsünden bağımsız, pasif bir alt sistem olarak duruyor. CRITICAL çünkü mimari dokümanın iddiası ile çalışan sistem arasındaki uçurum kullanıcıyı yanıltır (proaktif gözlem bekleyen kullanıcı, hiçbir şey gözlenmediğini fark etmez).

4. **ADR DB↔FS↔Export üçlü senkron drift'i mevcut.** memory.db `entries WHERE type='adr'` toplamı 52 satır; `.brain/exports/decisions.md` 52 `## adr-...` başlık; `docs/adr/*.md` 53 dosya. Üç sayım birbirini doğrulamıyor:
   - **FS-only:** `docs/adr/061-aegis-methodology.md` (status: proposed) DB'de **yok** — manuel oluşturulmuş, `syncAdrFilesToDb` post-finalize hook'u Sprint 170 sonrası çalıştırılmamış. ADR-046'nın iddia ettiği "bi-directional hook idempotent" garanti gerçeklenmiyor.
   - **FS-duplicate:** ADR-046 için iki ayrı dosya var: `docs/adr/046-brain-self-update-hook-architecture.md` ve `docs/adr/046-brain-self-update-hook.md`. Aynı ID'ye iki kanonik kaynak — `syncAdrFilesToDb` hangisini DB'ye yansıttıysa diğeri "ghost" kalır.
   - **DB+Export-only:** `adr-022-v2` DB'de ve `.brain/exports/decisions.md`'de bağımsız bir satır, ama `docs/adr/`'de `022-v2-*.md` adıyla ayrı bir dosya yok — orijinal `022-cli-mcp-feature-parity-tek-yap-coklu-ortam-sprint-067.md` dosyasının içine gömülmüş ya da hiç export edilmemiş. ADR-046 (Step Ordering Contract) `adrInsert → ruleRegen` sırasını garanti etse de bu üçlü mismatch hook'un bütünlüğünü çürütüyor.

   Aynı şekilde DIRECTIVES'teki "46+ accepted" iddiası 46 ile tam denk; ama `MEMORY.md` (otomatik) sayımı doğrulanırken `audit_trail.json` veya `entry_history` taraması bu drift'lerden hiçbirini flag etmiyor.

### 1.2. HIGH Drift — Kısmi Enforcement veya Eskimiş İddia

5. **ADR-024 ve ADR-026 "sprint-controller God Object Split" iddiası kısmen geri çekilmiş.** `IDENTITY.md` "sprint-controller.ts Slim 1890→209 LoC (Sprint 136 T-008)" yazar; bugün `src/orchestra/sprint-controller.ts` 780 satır, `src/orchestra/sprint-phases.ts` ise 1310 satır. Split yapıldı ama controller "Slim" değil; ayrıca `sprint-phases.ts` orijinal monolit'in (1890 LoC) çoğunu sığdırarak yeni bir "fat module" haline gelmiş — God Object'in adı değişmiş. ADR-024 ve ADR-026 hala "accepted" durumunda; ya yeniden değerlendirilmeli ya da threshold (LoC sınırı) yazıya eklenmeli.

6. **ADR-019 "Language-Agnostic Worker Verify" kod-tarafı kanıtı bulunamadı.** `src/` ağacında `verifySync`, `verifyAsync`, "languageAgnostic" ya da benzer ek tanımlama yok (sadece `src/core/signature.ts:76`'da kriptografik `ed.verifyAsync`, bu konuyla ilgisiz). ADR-019 worker verify döngüsünün TypeScript dışı dillere taşınabilirliğini söz veriyor; runtime tarafında bu vaadi gerçekleştiren bir adapter ya da config kancası yok. Doc-only ADR.

7. **ADR-014 ".deck Secret File System" runtime'da yok.** `.deck` dizini repository'de mevcut değil; `src/cli/commands/deck*` adında bir komut yok; `src/core/secret-*` modülü yok. ADR-014 Sprint 044'te kabul edildi ancak Sprint 171 itibariyle hayata geçirilmemiş bir tasarım dokümanı olarak duruyor. Worker prompt'larında ".deck secret system" referansı çıkarsa kullanıcı yanılır.

8. **ADR-038 "Dead Code Disposition" kod düzeyinde formal bir mekanizma değil.** `src/` içinde `dispose disposition`, `deadCodeDispose`, `removeUnused` adlı bir API/util yok. Sprint 139 audit sonucu yazılı bir karar olarak ADR'ye dönüştürülmüş ama Sprint 171 Task 171-015 (Dead Code + ESM Hygiene Audit) ayrıca açılması bile, dispose disposition'ın kod düzeyinde gerekli kontrol noktası olmadan tek tek raporlandığını gösteriyor.

9. **ADR-044 "Sprint State Observability Contract" yapısal enum/tip kontratı eksik.** `src/orchestra/sprint-controller.ts:378` "Sprint starting" log mesajında `sprintPhase: 'INIT'` string literal geçer; ama `src/core/`'da `type SprintPhase` ya da `SPRINT_PHASES` const enum tanımı `grep -r "type SprintPhase\|export.*SPRINT_PHASES"` ile bulunamadı. ADR-044 sözleşmesi yazılı ama TypeScript tip sistemine bağlanmış değil — herhangi bir worker `sprintPhase: "FOO"` yazsa derleme geçer.

10. **Proposed ADR-053 "TaskType Taxonomy" iki ayrı uygulamaya bölünmüş.** `src/orchestra/rubric-registry.ts:21`'de `type TaskType = 'audit' | 'document-write' | 'code-development'` tanımlanıyor ve `detectTaskType` orada (`:166`) implemente; ama `src/orchestra/task-router.ts:90`'da aynı isimli ikinci bir `detectTaskType` fonksiyonu yaşıyor. `src/orchestra/sprint-phases.ts:113` ve `:236-240` rubric-registry'den import ederken, başka bir tarafta task-router'dan farklı bir taksonomi türetilebilir. Proposed olduğu için technically OK ama dual-implement Sprint 172'de promote ediliyorsa birleştirme gerekir.

11. **Proposed ADR-055 "Hybrid Scoring 5-Layer Pipeline" sadece 1 katman implement.** `rubricScores` field'ı `result-evaluator.ts:988-1032`, `mid-sprint-adapter.ts:486-490`, `debt-manager.ts:270-284`'te yaşıyor — ama "Schema / Gates / Quality / Outcome / Auditor" 5 katmanından sadece "Rubric Scoring" (Quality katmanı) aktif. `grep -r "schemaGate\|gatesLayer\|outcomeLayer\|auditorLayer\|hybridPipeline"` boş döner. Promote etmeden önce kalan 4 katman ya yazılmalı ya da ADR scope daraltılmalı.

12. **Proposed ADR-060 "Self-Awareness Propagation 5-Channel" hiç implement değil.** `selfAwareness`, `5-channel`, `contextEnrichment` adlarıyla `src/`'de hiçbir export yok. Pure design doc.

13. **Proposed ADR-061 "AEGIS Methodology" DB'de yok, FS'de tek başına.** `docs/adr/061-aegis-methodology.md` Sprint 170/171 sırasında elle eklenmiş (status: proposed). DB tarafında `entries WHERE id='adr-061'` boş döner. Bu hem ADR-046 hook idempotency'sinin kanıtlanamamış bir başarısızlığı, hem de ADR-036 "ADR Governance Integration"'ın canlı validator'ı (`scripts/adr-validator.mjs`) bu durumu sessiz geçirmiş olabilir.

### 1.3. MEDIUM Drift — Belge/Kod Tutarsızlığı (Düşük Risk)

14. **ADR-022 "superseded" ama yazı satırı geçişi karmaşık.** memory.db'de `adr-022` status=superseded, `adr-022-v2` status=accepted, relations tablosunda `('adr-022-v2','supersedes','adr-022')` mevcut (DB tarafı tutarlı). Ancak `docs/adr/`'de yalnızca `022-cli-mcp-feature-parity-tek-yap-coklu-ortam-sprint-067.md` dosyası var (eski v1); v2 için ayrı FS dosyası yok. ADR-046 forward sync hook'u v2'yi DB'ye nasıl koymuş — sprint backfill script'i (`scripts/sprint-166-memory-backfill.mjs:51`) ile manuel insert edilmiş olmalı. Kullanıcı `docs/adr/`'yi açan yeni geliştirici "v2 nerede?" sorusuna doğrudan yanıt bulamaz.

15. **ADR-023 "Plan Tier Generalizasyonu" enforce ediliyor ama doküman tutarsız.** `src/core/cost-config-loader.ts:23` ve `src/core/model-registry.ts:12` `'economy' | 'standard' | 'premium' | 'premium_plus'` taksonomisini standart hâle getiriyor. Ama DECKENT.md "premium_plus" örneklerinde tier listesi 4 katman; `.contracts/api-surface.md`'de tier kelimesi geçmiyor. Doc'lar tier'ı tutarlı işlemiyor.

16. **ADR-021 "Kraken ASCII Brand Identity" yalnızca splash'ta.** `src/cli/helpers/splash.ts:2-19` Kraken ASCII art içerir; başka bir yerde Kraken brand'ı ile karşılaşan kullanıcı görsel yok (README markası ayrı, dashboard görseli ayrı). Mimari risk düşük; ama branding tutarlılığı için doc/asset stratejisi netleştirilmeli.

### 1.4. LOW Drift — Yalnızca İsimlendirme/Konvansiyon

17. **ADR-018 "Multi-Environment Config Generation" sadece read tarafı.** `src/core/config.ts:709,922`'de `GLOBAL_CONFIG_PATH` üzerinden global config okunur (3-layer merge, ADR-004); ancak "Multi-Environment Config Generation" başlığında ima edilen ortam-üretici (claude/cursor/gemini rule dosyalarını generate eden) iş akışı kod tarafında yok — sadece manuel oluşturulmuş `.claude/rules`, `.cursor/rules`, `.gemini/rules` (varsa) var. ADR'nin başlığı "Generation" diyor, kod sadece "Reading" yapıyor. Doc-only kısım, düşük risk.

18. **ADR-013 DECKENT.md Adapter Pattern kanıtı parçalı.** `DECKENT.md` mevcut, `.cursor/rules/{brain,auditor,worker-default}.md` mevcut; ama `.gemini/GEMINI.md` görünmüyor (3 ortam adapter'ından biri eksik). Düşük risk, yalnızca multi-environment vaat doğrulanmıyor.

### 1.5. ENFORCED — Kod Kanıtlı ADR'lar

Aşağıdaki ADR'lar kod-tarafı somut kanıtla doğrulandı (bkz. §3 Kanıt). Bunlar üzerinde drift gözlenmedi: ADR-001, 002, 003, 004, 006, 007, 010, 011, 012, 015, 016, 017, 022-v2, 025, 027, 028, 029, 030, 031, 032, 034, 035, 036, 037, 039, 041 (proxy: pool dosyaları mevcut), 043, 046 (mekanizma mevcut ama §1.1/3'teki drift'i tetikleyen), 047 (Sprint 171 DIRECTIVES seviyesinde aktif protokol), 048.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| 1 | ADR-045 dependency_pipeline_enabled config-vs-doc drift | CRITICAL | OSS GA blocker: yeni kullanıcı README/DECKENT.md okur, "Wave live" sanır, gerçek runtime davranışı manual respawn |
| 2 | ADR-008 import tek-yön ihlali (orchestra-içi + CLI/API) | CRITICAL | Modül boundary kontratı kod gerçeği ile çelişiyor; katkıcılar yanlış mental modelle PR açar |
| 3 | ADR-040 Nervous System wire eksik | CRITICAL | "Proactive Meta-Orchestrator" iddiası sprint döngüsünde tetiklenmiyor; pasif alt-sistem |
| 4 | ADR DB↔FS↔Export 3'lü drift (adr-061 FS-only, adr-046 duplicate, adr-022-v2 DB-only) | CRITICAL | ADR-046 bi-directional hook idempotency garantisi kanıtlanmıyor; governance kontratı çatlak |
| 5 | ADR-024/026 sprint-controller "Slim" iddiası bayatlamış (780/1310 LoC) | HIGH | God Object isim değiştirip yer değiştirmiş; LoC eşiği ADR'de yok |
| 6 | ADR-019 Language-Agnostic Verify implement değil | HIGH | Doc-only vaat; runtime kanıt yok |
| 7 | ADR-014 .deck Secret File System tamamen yazıya kalmış | HIGH | Sprint 044'ten beri kodlanmamış; user-facing vaat bozuk |
| 8 | ADR-038 dispose disposition formal mekanizma değil | HIGH | Dead-code dispose her sprint manuel — Sprint 171 Task 015 bunun kanıtı |
| 9 | ADR-044 SprintPhase tip kontratı yok | HIGH | String literal log; type-safety yok, refactor riski yüksek |
| 10 | ADR-053 detectTaskType dual-implementation | HIGH | rubric-registry + task-router iki ayrı yer; promote öncesi birleştirme |
| 11 | ADR-055 Hybrid 5-Layer sadece 1 katman | HIGH | Schema/Gates/Outcome/Auditor katmanları yok; proposed kalmasının nedeni budur — ama ADR scope ekspanse |
| 12 | ADR-060 Self-Awareness 5-Channel implement yok | MEDIUM | Pure design doc; proposed; OSS GA'da kullanıcı görmemeli |
| 13 | ADR-061 AEGIS FS-only, DB'de yok | HIGH | ADR-046 hook canlı kanıtı; sync çalıştırılmamış |
| 14 | ADR-022 supersession FS izi yok | MEDIUM | Yeni geliştirici "v2 dosyası nerede?" karmaşası |
| 15 | ADR-023 tier doc tutarsızlığı | MEDIUM | Kod doğru; doc parçalı |
| 16 | ADR-021 Kraken brand sadece splash | LOW | Branding kapsamı dar; teknik risk yok |
| 17 | ADR-018 Multi-Env "Generation" sadece read | LOW | Doc başlığı abartılı; kod sadece "merge" |
| 18 | ADR-013 .gemini adapter eksik | LOW | Multi-env vaat 3'ten 2'ye düşmüş |

> **CRITICAL toplam:** 4 (1, 2, 3, 4) — **Sprint 172 OSS GA blocker**, public flip öncesi tamamı kapanmalı veya ADR statüsü revize edilmeli.

---

## 3. Kanıt (Evidence)

### 3.1. CRITICAL Drift Kanıtları

**Bulgu 1 (ADR-045 config-vs-doc):**
- Proje config gerçek değeri: `.deckent/config.json:198` → `"dependency_pipeline_enabled": false`
- Kod varsayılan: `src/core/config.ts:600` → `dependency_pipeline_enabled: true,`
- Doküman iddia 1: `DECKENT.md:51` → ``"**Sprint 167 flip:** `dependency_pipeline_enabled: true` — Wave scheduling goes live"``
- Doküman iddia 2: `.contracts/api-surface.md:83` → ``"When `dependency_pipeline_enabled: true` (default since Sprint 156, confirmed Sprint 169 H5), tasks are sorted into dependency waves"``
- Sprint 171 DIRECTIVES itirafı: `DIRECTIVES.md` "Brain Planning Instructions" bölümü → ``"`dependency_pipeline_enabled: false` olduğundan Wave geçişleri + Task 29 synthesis dispatch Brain manuel"``

**Bulgu 2 (ADR-008 import yönü):**
- `src/orchestra/sprint-lifecycle.ts:60` → `import { releaseAllLocks } from '../agents/worker.js';`
- `src/orchestra/sprint-spawner.ts:95` → `} from '../agents/worker.js';`
- `src/orchestra/debt-manager.ts:15` → `import { updateTaskStatus, releaseAllLocks } from '../agents/worker.js';`
- `src/orchestra/result-collector.ts:30` → `import type { ChannelRegistry } from '../agents/worker-ipc.js';`
- `src/orchestra/ipc-registry.ts:11-13` → 3 ayrı worker-ipc import.
- `src/orchestra/spawn-backend.ts:4` → `import { ensureSession, ... } from './tmux.js';`
- `src/orchestra/sprint-spawner.ts:42` → `import { ensureSession, spawnWorker } from './tmux.js';`
- `src/api/server.ts:18` → `import { killWorker } from '../orchestra/tmux.js';`
- `src/cli/entry.ts:6` → `import { killAllSessions } from '../orchestra/tmux.js';`
- `src/cli/commands/{watch,attach,start,spawn,kill}.ts` → 5 ayrı CLI komutu tmux'tan direkt import.
- `src/providers/claude.ts:15` → tmux import.
- ADR iddiası: `.contracts/api-surface.md` "Module Import Rules (ADR-008)" → ``"Brain (sprint-controller) is the ONLY module that imports from tmux, auditor, worker"`` — yukarıdaki listede 15+ ihlal var.

**Bulgu 3 (ADR-040 Nervous wire eksik):**
- Aramalar: `grep -rn "from '.*nervous\|new NervousObserver" /workspace/src/orchestra/` → boş.
- Sadece sonuç: `src/nervous/observer.ts:58` → `*   const observer = new NervousObserver('/path/to/project');` (yorum içinde örnek, code path değil).
- CLI/MCP tarafı: `src/cli/index.ts:44-45` register commands; `src/mcp/tools/nervous.ts:8-10` tool import; ancak sprint döngüsü tarafında otomatik tetik yok.
- Karşılaştırma: `src/orchestra/sprint-controller.ts` ve `src/orchestra/sprint-lifecycle.ts` içinde `nervous` kelimesi geçmez (`grep -n "nervous" src/orchestra/sprint-controller.ts src/orchestra/sprint-lifecycle.ts src/orchestra/brain.ts` → çıktı yok).

**Bulgu 4 (3'lü DB↔FS↔Export drift):**
- DB sayım: `SELECT COUNT(*) FROM entries WHERE type='adr'` → 52 (status breakdown: 46 accepted, 1 deprecated `adr-005`, 1 superseded `adr-022`, 4 proposed `adr-042/053/055/060`).
- Export sayım: `grep -c "^## adr-" .brain/exports/decisions.md` → 52 (51 unique ID + adr-022-v2).
- FS sayım: `ls docs/adr/*.md | wc -l` → 53.
- Anomali 1 (FS-only): `docs/adr/061-aegis-methodology.md` — Read; `SELECT id FROM entries WHERE id='adr-061'` → 0 satır.
- Anomali 2 (FS duplicate): `docs/adr/046-brain-self-update-hook-architecture.md` ve `docs/adr/046-brain-self-update-hook.md` — ikisi de "# ADR-046: Brain Self-Update Hook Architecture" başlığını taşır.
- Anomali 3 (DB+Export-only): `adr-022-v2` DB'de status=accepted; `.brain/exports/decisions.md:546` satırında "## adr-022-v2: CLI/MCP Feature Parity ..." başlığı var; `docs/adr/`'de `022-v2-*.md` adıyla bir dosya yok.
- Hook kodu: `src/core/adr-file-sync.ts:158` `syncAdrFilesToDb` fonksiyonu; `src/core/identity-generator.ts:407-419` post-finalize'da çağrı — ama Sprint 170 sonrası finalize tetiklendiyse yine adr-061 import etmemiş; idempotency davranışında bir bug var.

### 3.2. HIGH Drift Kanıtları

**Bulgu 5 (sprint-controller LoC):**
- `wc -l src/orchestra/sprint-controller.ts` → 780.
- `wc -l src/orchestra/sprint-phases.ts` → 1310.
- IDENTITY.md iddiası: ``"sprint-controller.ts Slim 1890→209 LoC (Sprint 136 T-008)"``.

**Bulgu 6 (ADR-019 language-agnostic):**
- `grep -rn "verifySync\|languageAgnostic\|verify.*lang" src/` → 0 anlamlı sonuç (`src/core/signature.ts:76` kriptografi).

**Bulgu 7 (ADR-014 .deck):**
- `ls /workspace/.deck` → boş; `ls /workspace/src/cli/commands/deck*` → boş.

**Bulgu 8 (ADR-038 dispose):**
- `grep -rn "dispose disposition\|deadCodeDispose\|removeUnused" src/` → 0.
- Sprint 171 Task 171-015 ayrı bir audit olarak Dead Code'u manuel listeliyor → mekanizma yok.

**Bulgu 9 (ADR-044 SprintPhase tip):**
- `grep -rn "type SprintPhase\|export.*SPRINT_PHASES" src/core/ src/orchestra/` → 0.
- `src/orchestra/sprint-controller.ts:378` → `structuredLog('info', 'Sprint starting', { sprintPhase: 'INIT' });` (string literal).

**Bulgu 10 (ADR-053 dual detectTaskType):**
- `src/orchestra/rubric-registry.ts:21` → `export type TaskType = 'audit' | 'document-write' | 'code-development';`
- `src/orchestra/rubric-registry.ts:166` → `export function detectTaskType(task: Task): TaskType {`
- `src/orchestra/task-router.ts:90` → `export function detectTaskType(task: Task): TaskType {` (ikinci ayrı tanım).
- `src/orchestra/sprint-phases.ts:113,236-240` rubric-registry'den import eder.

**Bulgu 11 (ADR-055 5-layer 1-of-5):**
- `grep -rn "schemaGate\|gatesLayer\|outcomeLayer\|auditorLayer\|hybridPipeline" src/` → 0.
- Tek mevcut: rubricScores (Quality katmanı) — `src/orchestra/result-evaluator.ts:988,1004,1025,1032`, `src/orchestra/mid-sprint-adapter.ts:486-490`, `src/orchestra/debt-manager.ts:270-284`.

**Bulgu 12 (ADR-060 self-awareness):**
- `grep -rn "selfAwareness\|5-channel\|contextEnrichment" src/` → 0.

**Bulgu 13 (ADR-061 FS-only):**
- `head -3 docs/adr/061-aegis-methodology.md` → `# ADR-061: AEGIS — Agentic Effect-Governed Iterative Stewardship Methodology / **Status:** proposed`.
- `SELECT id FROM entries WHERE id='adr-061'` → 0 satır.

### 3.3. MEDIUM/LOW Drift Kanıtları

**Bulgu 14 (ADR-022 supersession FS izi):**
- `ls docs/adr/022*` → tek dosya `022-cli-mcp-feature-parity-tek-yap-coklu-ortam-sprint-067.md`.
- DB rel: `SELECT * FROM relations WHERE from_id='adr-022-v2' AND rel_type='supersedes'` → `('adr-022-v2','supersedes','adr-022')` mevcut (DB ilişki tutarlı, FS sadece geriden kalmış).

**Bulgu 15 (ADR-023 tier doc):**
- `src/core/cost-config-loader.ts:23` ve `src/core/model-registry.ts:12,80,141` → tier taksonomisi tutarlı.
- `.contracts/api-surface.md` "tier" kelimesi → ilk `grep` boş döner (doc'a yansımamış).

**Bulgu 16 (ADR-021 Kraken):**
- `src/cli/helpers/splash.ts:2-19` → Kraken ASCII + renkler. Başka kullanım: dashboard/README incelemediği için bu rapor başka kanal raporlamaz.

**Bulgu 17 (ADR-018 Multi-Env "Generation"):**
- `src/core/config.ts:709,922` → `GLOBAL_CONFIG_PATH` okuma.
- "Generate" adında bir fonksiyon yok; tek aday `scripts/install/initialize-environment-rules.mjs` (varsa) — bu rapor `scripts/` denetimini Task 171-014'e bırakır.

**Bulgu 18 (ADR-013 .gemini adapter):**
- `ls .claude/rules .cursor/rules .gemini/GEMINI.md` → `.claude/rules` ve `.cursor/rules` mevcut, `.gemini` yok.

### 3.4. ENFORCED ADR'lar Kanıt Özeti

| ADR | Kanıt (file:line) |
|---|---|
| 001 (ESM) | `package.json` `"type": "module"` |
| 002 (Node16) | `tsconfig.json` `"moduleResolution": "Node16"` |
| 003 (vitest) | `package.json` 2× vitest reference |
| 004 (3-layer config) | `src/core/config.ts:680-694` `loadConfig` |
| 006 (spawnSync array-arg) | `src/orchestra/{tmux,spawn-backend,spawn-backend-docker}.ts` — array-arg pattern her çağrıda |
| 007 (SpawnOptions interface) | `src/orchestra/tmux.ts:17-94` `export interface SpawnOptions` |
| 010 (commander) | `package.json` 1× commander dep |
| 011 (readline/promises) | `src/cli/helpers/prompt.ts:1`, `src/cli/commands/config-nervous.ts:9` |
| 012 (register pattern) | `src/cli/commands/*` 5+ `registerX(program)` örneği |
| 015 (TaskRouter modülü) | `src/orchestra/task-router.ts` var |
| 016 (Connector modülü) | `src/orchestra/connector.ts` var |
| 017 (MCP-Native providers) | `src/providers/{claude,codex,gemini}.ts` |
| 022-v2 (CLI/MCP parity) | `src/mcp/tools/*.ts` 27 tool, CLI komutlarıyla eşit |
| 025 (SIGINT graceful) | `src/cli/entry.ts:34` `process.on('SIGINT', ...)` |
| 027 (Hybrid Spawn) | `src/orchestra/spawn-backend{,-docker,-mock}.ts` üçü mevcut |
| 028 (Routing v2) | `src/orchestra/mid-sprint-adapter.ts:151` `routeTaskV2` çağrısı |
| 029 (Managed-Docs) | `src/orchestra/sprint-docs-updater.ts:115` `runManagedDocUpdates(ctx)` |
| 030 (Template Engine plugin) | `src/orchestra/managed-docs/{template-renderer,plugin-loader,section-updater}.ts` |
| 031 (Content Hash Cache) | `src/orchestra/managed-docs/managed-doc-runner.ts:61-67` `contentHash` |
| 032 (i18n) | `src/orchestra/managed-docs/content-generators.ts:17-66,145` `i18n(ctx)` |
| 034 (Multi-Project Isolation) | `src/core/config.ts:687-694` `projectRoot` parametre tabanlı |
| 035 (Verification Protocol) | `src/monitor/auditor.ts:1721-1809` `verifyFunctional`/`validateTechDebt`/`verifyWorkerResult` |
| 036 (ADR Governance) | `scripts/adr-validator.mjs` mevcut; `src/core/adr-file-sync.ts` hook |
| 037 (RBAC Authority Matrix) | `src/nervous/runtime-scope-check.ts:16-30` `assertBrainScope`, `src/agents/worker.ts:412-485` `isWithinScope`, `src/orchestra/result-evaluator.ts:1720-1725` boundary detection, `src/orchestra/authority-enforcer.ts:48-296` `isSelfModifyingSprint` |
| 039 (Self-Modifying detect) | `src/orchestra/self-modifying-detector.ts` modülü, `src/orchestra/authority-enforcer.ts:48,293-296` runtime kullanım |
| 043 (Crash Recovery) | `src/cli/commands/recover.ts` mevcut, `src/core/file-lock.ts:255` lock recovery |
| 046 (Self-Update hook) | `src/core/adr-file-sync.ts:158` `syncAdrFilesToDb`, `src/core/identity-generator.ts:407-419` post-finalize çağrı — **AMA bkz. Bulgu 4 drift'i** |
| 048 (Prompt Lifecycle) | `src/core/active-workers.ts:67` `getActiveWorkerIds`, `src/providers/claude.ts:17,150` selective cleanup |

---

## 4. Öneriler (Recommendations)

Tüm öneriler Sprint 172 OSS GA backlog'una hazırdır. Aksiyon sözcükleri net: **Düzelt / Sil / Birleştir / Tamamla / Koru / Statü-revize**.

### 4.1. CRITICAL Aksiyonlar (Sprint 172 Public Flip Öncesi Şart)

1. **ADR-045 dependency_pipeline_enabled — TEK GERÇEK SEÇİLMELİ.** İki seçenek var; Alperen'e karar sorulmalı: (a) Wave scheduling production'a alınsın → `.deckent/config.json:198`'i `true` yap, DECKENT.md/api-surface.md iddiası kalsın, runtime'da kalan manuel wave dispatch'leri sil; **veya** (b) Sprint 167 flip henüz hazır değil → `DECKENT.md:51` ve `.contracts/api-surface.md:83` satırlarını "Sprint 172 itibariyle henüz `false`, dogfood sonrası flip" olarak düzelt, ADR-045 status'ünü "accepted (runtime kısmi)" ile annotate et. Hangi yönde olursa olsun **drift yazılı olarak kapanmalı**.
2. **ADR-008 import grafı — kontratı kod gerçeğine hizala.** Üç seçenek: (a) ADR-008'i revize et — "orchestra-içi modüller tmux/worker'a serbest erişebilir, sadece nervous/agents/monitor → orchestra tek-yön" gibi gerçekçi kontrat yaz; (b) `eslint-plugin-import` veya `dependency-cruiser` ile boundary rule'u yazılı hâle getirip kod-tarafı enforcement ekle; (c) Mevcut ihlalleri tek tek temizle (CLI komutları için cancel-fast facade ekle). Sprint 172 katkıcı belgesinin doğrulanabilirliği için (a) + (b) kombinasyonu önerilir.
3. **ADR-040 Nervous System — wire ya da statü-revize.** Önerilen: `src/orchestra/sprint-controller.ts` içinden bir kez `NervousObserver` instantiate edilip event bus üzerinden dinleyici olarak bağlanmalı; aksi takdirde ADR-040 status'ünü "deferred" veya "proposed" geri çevir. CRITICAL çünkü dokümante edilmiş "proactive" özellik kullanıcıyı yanıltıyor.
4. **DB↔FS↔Export 3'lü senkronu otomatize et.** (a) `scripts/adr-validator.mjs` 3'lü saymayı runtime'da assert etmeli (DB count == export count == FS count, mismatch'leri exit 1 ile flag etmeli); (b) `docs/adr/046-brain-self-update-hook.md` duplicate dosyasını sil (FS'de tek dosya kalsın, "architecture" sürümü kanonik); (c) `adr-061` için `npm run build && npx deckent memory rebuild` çalıştırıp DB'ye al, ya da elle `store.insert` ile ekle; (d) `adr-022-v2` için FS'de ayrı bir `022-v2-cli-mcp-parameter-sync-sprint-085.md` dosyası oluştur (governance audit trail). Sprint 172 GA'dan önce hepsi kapanmalı.

### 4.2. HIGH Aksiyonlar (Sprint 172 İlk Hafta Backlog)

5. **ADR-024/026 — LoC eşiği eklenmiş yeni revizyon.** "Sprint Slim 209 LoC" iddiasını ADR'de güncelle; mevcut `sprint-controller.ts` 780 LoC ve `sprint-phases.ts` 1310 LoC durumunu belgele. İdeal: `sprint-phases.ts`'i 3-4 daha küçük modüle (PLAN/SPAWN/EXECUTE/EVALUATE faz handler'ları) böl.
6. **ADR-019 — Statü düş veya kanıt ekle.** Language-agnostic verify implement edilmediği için status="proposed" veya "deprecated" yap; aksi takdirde Sprint 172'de minimal kanıt katmanı (örneğin `verify.json` task contract) ekle.
7. **ADR-014 — Statü düş.** `.deck` Secret File System Sprint 044'ten beri uygulanmamış; status="proposed" veya "rejected" yap. ADR iddiası kalkana kadar worker prompt'larında referans verilmemeli.
8. **ADR-038 — Formal dispose API ekle veya statü-düş.** Eğer "dead code dispose" kalıcı bir disiplin olacaksa `src/orchestra/code-dispose.ts` gibi bir util + ADR-038'e referans veren bir lint rule ekle; aksi takdirde "doc-only" annotation ile statü revize et.
9. **ADR-044 — `SprintPhase` tip enum ekle.** `src/core/sprint-types.ts`'e `export type SprintPhase = 'PLAN' | 'SPAWN' | 'EXECUTE' | 'EVALUATE' | 'FIX' | 'RETRO' | 'DECAY' | 'CLEANUP';` ekle, tüm `sprintPhase: '...'` string literal yerlerini bu tip ile değiştir. (Bu aksiyon Task 171-019 type-safety raporu ile çakışırsa orada referans verilmeli.)
10. **ADR-053 — `detectTaskType` tek noktaya birleştir.** `src/orchestra/task-router.ts:90` ve `src/orchestra/rubric-registry.ts:166` ikinci tanımı sil, tek kaynak rubric-registry olsun. Promote etmeden önce zorunlu birleştirme.
11. **ADR-055 — Scope'u 5'ten 1'e düşür veya 4 katmanı tamamla.** Aksi takdirde "5-Layer" iddiası kullanıcıyı yanıltır. Sprint 172'ye girerken proposed kalmalı veya scope daralt.
12. **ADR-060/061 — Sprint 175+ ertelenmiş olarak markala.** ADR-061 FS-only durumdan çıkarılırken ya DB'ye al (sync hook) ya da `proposed` annotation ile `Sprint 175-200 implementation` notu netleştir.

### 4.3. MEDIUM/LOW Aksiyonlar

13. **ADR-022 supersession FS izi** — `022-v2-*.md` ayrı dosya oluşturmak veya v1 dosyasına "Superseded by ADR-022-v2 (see DB)" başlığı eklemek. Düşük teknik risk, governance temizlik.
14. **ADR-023 tier doc** — `.contracts/api-surface.md`'ye 4-tier taksonomi tablosu ekle (DECKENT.md zaten içeriyor).
15. **ADR-021 Kraken** — README'de Kraken ASCII'yi (veya görselini) tutarlı kullan; branding-strategy doc'una bağla.
16. **ADR-018 başlık** — "Multi-Environment Config **Reading**" olarak revize et veya generation kısmını `scripts/`'ten taşıyarak runtime'a çek.
17. **ADR-013 .gemini adapter** — Ya `.gemini/GEMINI.md` oluştur ya da ADR-013'ten Gemini referansını sil.

### 4.4. Proses Önerisi

18. **ADR governance otomasyonu**: `scripts/adr-validator.mjs` her sprint sonu CI'da çalıştırılmalı; aşağıdaki kontroller eklenmeli:
   - DB count == Export count == FS count (uyumsuzluk = exit 1).
   - Her FS dosyasının DB'de karşılığı var mı (`adr-NNN` ID match).
   - Her DB ADR için relations grafından kopuk düğüm var mı (orphan supersession).
   - "accepted" statüsündeki bir ADR'nin `src/`'de en az 1 kanıt grep'i (heuristic — false positive olabilir, ama "kanıt yok" warning üretsin).

Bu otomasyon Sprint 172 GA'dan önce devreye alınırsa bu raporun bulgularının regresyon riski sıfırlanır.

---

> **Audit-only invariant teyidi:** Bu rapor yalnızca `docs/audits/sprint-171/adr-compliance.md` dosyasını yazdı. `memory.db` üzerinde yalnızca `SELECT` çalıştırıldı (yazma/DROP/rebuild yok). `src/`, `tests/`, `scripts/`, `.brain/exports/` dokunulmadı.
