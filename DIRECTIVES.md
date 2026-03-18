# DIRECTIVES — Sprint 16 (Watch Mode + Worker Logs + Agent Detail)

## Hedef: Sprint sırasında canlı izleme, worker log yakalama, web dashboard'da agent detay görünümü. Sprint 17'de self-run için dogfooding hazırlığı.

---

## Görev 1: `deckent watch` CLI Komutu — Canlı tmux İzleme
- Dosya: src/cli/commands/watch.ts (yeni), src/cli/index.ts, src/orchestra/tmux.ts
- Kapsam: src/cli/, src/orchestra/

### Problem
Sprint başladığında kullanıcı `deckent attach` ile tmux'a bağlanıyor ama düzenli bir görünüm yok. Dashboard ve worker pane'leri karışık. Kullanıcı hangi worker'ın ne yaptığını rahat göremiyordu.

### Çözüm

1. **`deckent watch` komutu** — tmux session'ında düzenli split view oluştur:
   - Sol panel (geniş, %60): `.dashboard` dosyasını `watch -n 2 cat .dashboard` ile izle
   - Sağ panel (dar, %40): Worker'ların listesi, aktif worker'a attach
   - Layout: `tmux split-window -h -p 40` ile yatay bölme
   - `--follow <taskId>` flag: belirli bir worker'ın pane'ine attach ol

2. **tmux.ts'e yeni fonksiyonlar ekle:**
   ```typescript
   export function createWatchLayout(sessionName: string): void {
     // Yeni tmux window: "watch"
     // Sol: dashboard izleme
     // Sağ: worker list veya belirli worker
   }
   
   export function attachToWorkerPane(sessionName: string, taskId: string): void {
     // Belirli worker'ın tmux pane'ine attach
   }
   ```

3. **Sprint aktif değilse** → hata mesajı: "No active sprint. Run `deckent start` first."
   - `.dashboard` dosyasının varlığını kontrol et

### Test
- watch komutu tmux layout oluşturuyor
- --follow flag belirli worker'a attach oluyor
- Sprint aktif değilse hata veriyor
- tmux yoksa graceful error
- 6+ yeni test

---

## Görev 2: Worker Log Capture — tmux pipe-pane
- Dosya: src/orchestra/tmux.ts, src/agents/worker.ts, src/orchestra/brain.ts
- Kapsam: src/orchestra/, src/agents/

### Problem
Worker'ların stdout/stderr çıktıları sadece tmux pane'inde görünüyor. Sprint bittiğinde kayboluyorlar. Debugging ve retro için log gerekiyor.

### Çözüm

1. **`spawnWorker` fonksiyonuna pipe-pane ekle:**
   ```typescript
   // tmux.ts spawnWorker'da, worker spawn edildikten sonra:
   spawnSync('tmux', [
     'pipe-pane', '-t', `${sessionName}:${windowName}`,
     '-o', `cat >> ${logPath}`
   ]);
   ```
   - `logPath = join(tasksDir, \`task-\${taskId}.log\`)`
   - `-o` flag: sadece output (input değil)

2. **Log dosyası yaşam döngüsü:**
   - Oluşturma: `spawnWorker` sırasında (pipe-pane başladığında)
   - Sprint sırasında: sürekli append
   - Sprint sonrası: `cleanup` fonksiyonunda `.tasks/*.log` temizle (mevcut cleanup pattern'ini takip et)
   - `.gitignore`'a `.tasks/*.log` ekle (zaten .tasks/*.hb pattern var, aynı yere)

3. **Log okuma utility:**
   ```typescript
   // worker.ts veya yeni src/core/log-reader.ts
   export function readWorkerLog(projectRoot: string, taskId: string): string | null {
     const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
     if (!existsSync(logPath)) return null;
     return readFileSync(logPath, 'utf-8');
   }
   ```

4. **brain.ts cleanup'a `.log` ekle:**
   - Mevcut cleanup fonksiyonu `.hb`, `.signal`, `.output` dosyalarını temizliyor
   - `.log` dosyalarını da temizle

### Test
- spawnWorker pipe-pane çağırıyor
- Log dosyası doğru path'te oluşuyor
- readWorkerLog mevcut log'u okuyor
- readWorkerLog log yoksa null dönüyor
- cleanup .log dosyalarını temizliyor
- .gitignore .tasks/*.log içeriyor
- 8+ yeni test

---

## Görev 3: `deckent start --watch` — Tek Komutla Başlat ve İzle
- Dosya: src/cli/commands/start.ts, src/orchestra/brain.ts
- Kapsam: src/cli/commands/, src/orchestra/

### Problem
Kullanıcı önce `deckent start` sonra ayrı terminalde `deckent watch` yapıyor. Tek komutla hem sprint başlatıp hem izleme modu açılmalı.

### Çözüm

1. **start.ts'e `--watch` flag ekle:**
   ```typescript
   .option('--watch', 'Automatically open watch mode after sprint starts')
   ```

2. **Davranış:**
   - `deckent start --watch` → sprint başlar → SPAWN fazından sonra (worker'lar hazır olduğunda) otomatik olarak `createWatchLayout()` çağır → tmux attach
   - Sprint EXECUTE fazında kullanıcı watch modunda izliyor
   - Sprint bittiğinde tmux watch window kapanır, sonuç gösterilir

3. **Brain'e hook point ekle:**
   - `runSprint` fonksiyonunda SPAWN fazından sonra, EXECUTE'tan önce bir callback/event noktası ekle
   - `onSpawned?: () => void` callback — start.ts'den geçirilir
   - Bu callback `createWatchLayout()` çağırır

4. **--watch + --dry-run kombinasyonu:** dry-run'da watch anlamsız, uyarı ver ve watch'ı atla

### Test
- --watch flag parse ediliyor
- --watch ile start çağrıldığında createWatchLayout çağrılıyor
- --dry-run + --watch kombinasyonunda watch atlanıyor
- watch flag olmadan normal start davranışı korunuyor
- 6+ yeni test

---

## Görev 4: Web Dashboard Agent Detail View + Log API
- Dosya: src/api/server.ts, src/api/routes/ (yeni?), src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/components/AgentDetail.tsx (yeni)
- Kapsam: src/api/, src/dashboard/

### Problem
Web dashboard'da agent kartları var ama tıklanmıyor. Kullanıcı worker'ın ne yaptığını, task bilgisini ve log'unu göremiyordu.

### Çözüm

1. **Yeni API endpoint:**
   ```typescript
   // GET /api/worker/:taskId/log
   // Response: { taskId, log: string | null, task: TaskJSON | null }
   ```
   - `readWorkerLog()` utility'sini kullan (Görev 2'den)
   - Task JSON'u da oku ve döndür (`.tasks/task-{taskId}.json`)
   - Log yoksa `null`, task yoksa `null`

2. **Dashboard AgentDetail component:**
   ```tsx
   // src/dashboard/src/components/AgentDetail.tsx
   // Props: { taskId: string, onClose: () => void }
   // - Task bilgisi: title, status, model, scope
   // - Log viewer: monospace, auto-scroll, max-height with overflow
   // - Fetch: /api/worker/{taskId}/log (poll every 3s while open)
   // - Close button
   ```

3. **DashboardPage entegrasyonu:**
   - Agent kartına `onClick` ekle → `selectedAgent` state
   - `selectedAgent` varsa → `<AgentDetail taskId={selectedAgent} onClose={...} />`
   - Sheet/modal olarak göster (shadcn Sheet component zaten var)

### Test
- API endpoint log döndürüyor
- API endpoint task yoksa 404
- AgentDetail component render oluyor
- Log polling çalışıyor
- 6+ yeni test (API + component)

---

## Görev 5: Dogfooding Hazırlığı — .brain/ State Düzenleme
- Dosya: .brain/sprints/sprint-015.md (yeni), .brain/MEMORY.md, .brain/DECISIONS.md
- Kapsam: .brain/

### Problem
Sprint 17'de `deckent start` ile self-run yapabilmek için .brain/ dosyalarının güncel ve tutarlı olması gerekiyor. Şu an Sprint 15 log'u yok, MEMORY.md güncel değil, ADR eksik.

### Çözüm

1. **`.brain/sprints/sprint-015.md`** oluştur (max 50 satır):
   ```markdown
   # Sprint 015 — Deckent Bağımsızlık + Self-Hosting
   
   **Date:** 2026-03-18
   **Status:** COMPLETE
   **Tasks:** 5 (all GO)
   **Tests:** 938 → 967 (+29)
   **Coverage:** 97.5%
   
   ## Results
   - DECKENT.md single source of truth
   - ensureDeckentImport() shared utility
   - deckent sync CLI + MCP tool
   - deckent://config MCP resource
   - Self-hosting with .deckent/ in git
   - DEBT-002 closed
   - Blueprint-quality rule templates
   
   ## Learnings
   - Additive injection pattern works well — ensureDeckentImport is reusable
   - Config merge pattern (read-merge-write) prevents data loss
   - writeIfNotExists for generated files, ensureDeckentImport for adapter files
   - .gitignore management: track workspace, ignore runtime artifacts
   ```

2. **`.brain/MEMORY.md`** güncelle — Sprint 15 learnings ekle (max 100 satır):
   - `ensureDeckentImport()` pattern: dosya yok → oluştur, var+ref yok → prepend, var+ref var → noop
   - Config merge: `Object.assign(existing, new)` — mevcut alanlar korunur
   - `.gitignore` selective tracking: `.deckent/plugins/*` ignore, `!.gitkeep` exception
   - Rule template pattern: writeIfNotExists ile üzerine yazmama, frontmatter + zengin kurallar
   - MCP tool/resource ekleme: index.ts'e import+register, test mock'a ekleme

3. **`.brain/DECISIONS.md`** güncelle — ADR-013 ekle:
   ```markdown
   ## ADR-013: DECKENT.md Adapter Pattern (Sprint 15)
   
   **Context:** CLAUDE.md'yi init sırasında overwrite etmek kullanıcı değişikliklerini kaybettiriyordu.
   
   **Decision:** DECKENT.md = tek gerçek kaynak. CLAUDE.md ve AGENTS.md adaptör dosyalar — sadece `@DECKENT.md` referansı enjekte edilir (ensureDeckentImport). Asla üzerine yazılmaz.
   
   **Consequences:**
   - Init idempotent ve güvenli
   - Kullanıcının CLAUDE.md özelleştirmeleri korunur
   - Gelecek provider'lar (Codex, Gemini) için adapter pattern genişletilebilir
   - `deckent sync` komutu adapter'ları yeniden senkronize eder
   ```

4. **Sprint numarası doğrulaması:**
   - `getNextSprintId()` → `sprint-016` dönmeli (sprint-015.md oluşturduktan sonra)
   - Bu Sprint 17'de brain'in doğru sprint ID ataması için kritik

### Test
- sprint-015.md 50 satır altında
- MEMORY.md 100 satır altında
- DECISIONS.md ADR-013 içeriyor
- getNextSprintId() → "sprint-016" (sprint-015.md oluşturulduktan sonra)
- parseDebtTable DEBT.md'yi parse edebiliyor
- 5+ test

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — hedef: 998+ test (967 + ~31 yeni)
- Coverage düşmemeli (%97+)
- Circular dependency yok
- Brain→auditor tek yönlü import korunsun
- Mevcut 967 test 0 regresyon
- tmux fonksiyonları: spawnSync array pattern (shell injection koruması)
- Web dashboard: mevcut shadcn/ui component'leri kullan (Sheet, Card, Badge, ScrollArea)
- Log dosyaları .gitignore'da (.tasks/*.log)
- MCP: 10 tool, 5 resource (değişiklik yok)
- CLI: 25→26 komut (watch eklendi)
