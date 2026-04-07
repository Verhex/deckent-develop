# DIRECTIVES — Sprint 102: CLI Sprint Güvenilirliği — Singleton, Lock, Evaluate Fix

## Goal: CLI sprint akışını MCP standartlarına yükselt: singleton enforcement, sprint lock, Brain evaluate fix, zombie process koruması, prompt cleanup.

---

## Task 1: Sprint Singleton + Lock Mekanizması
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/cli/commands/start.ts, src/mcp/tools/start.ts
- Scope: src/orchestra/, src/cli/, src/mcp/

### Description
Birden fazla `deckent start` çağrısı aynı anda çalışınca aynı .tasks/ dizinine yazıyorlar, zombie process'ler kalıyor, sprint'ler çakışıyor.

A) Sprint lock dosyası mekanizması ekle:
- Sprint başladığında `.deckent/sprint.lock` oluştur (PID + timestamp + sprintId)
- Sprint bittiğinde (finalize veya cleanup) lock dosyasını sil
- Start çağrıldığında lock kontrolü yap:
  - Lock varsa ve PID hâlâ çalışıyorsa → "Sprint zaten çalışıyor" hatası ver, başlatma
  - Lock varsa ama PID ölmüşse → stale lock, temizle ve devam et

B) CLI start.ts: Sprint başlamadan önce kontrol zinciri:
```
1. tmux ls → deckent session var mı?
2. .deckent/sprint.lock var mı? PID canlı mı?
3. .tasks/ dizininde aktif task dosyaları var mı?
4. Hepsi temizse → sprint başlat
5. Değilse → uyarı ver, --force ile override edilebilir
```

C) MCP start tool'una da aynı lock kontrolü ekle.

**Kanıt:** `grep "sprint.lock" src/orchestra/sprint-controller.ts src/cli/commands/start.ts` → 2+ satır

**Test:** `tsc --noEmit` temiz. İki kez `deckent start` çağır → ikincisi hata vermeli.

---

## Task 2: Brain Evaluate Fix — Result Dosyalarını Doğru Oku
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, src/orchestra/result-collector.ts, src/orchestra/sprint-controller.ts
- Scope: src/orchestra/

### Description
Worker'lar DONE ve GO_WITH_TECH_DEBT result bıraktı ama Brain tüm task'ları NO_GO olarak evaluate etti. RETRO'da "0/6 completed" yazıldı.

A) result-collector.ts waitForResults() debug: Her .result dosyası okunduğunda evaluations map'e ne ekleniyor logla:
```
debugLog('waitForResults:collected', `task=${taskId} assessment=${result.selfAssessment}`);
```

B) sprint-phases.ts runEvaluatePhase(): evaluations map'in populate edildiği noktayı kontrol et. .result dosyasındaki selfAssessment ("DONE" string) ile TaskEvaluation.DONE enum'ı arasında mapping doğru mu?

C) Olası sorun: selfAssessment string "DONE" vs TaskEvaluation enum mismatch. result-evaluator.ts'de selfAssessment → TaskEvaluation dönüşümü kontrol et.

D) sprint-controller.ts finalizeSprint(): evaluations map'in writeRetrospective'e boş ulaşma sorununu (Sprint 098-099'da tespit edildi) tekrar kontrol et.

**Kanıt:** Debug log'larla evaluate akışı doğrulanmış olmalı

**Test:** `tsc --noEmit` temiz. Mock test: DONE result → evaluations map'te TaskEvaluation.DONE

---

## Task 3: Zombie Process Koruması + tmux Cleanup
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/cli/commands/start.ts, src/cli/commands/cleanup.ts
- Scope: src/orchestra/, src/cli/

### Description
Eski sprint'lerden kalan zombie start process'ler yeni sprint'i bozuyor. Eski sprint worker'ları tekrar çalışıp yeni sonuçların üzerine yazıyor.

A) Sprint start pre-flight check'e ekle:
- `ps aux | grep "deckent start"` ile mevcut start process'leri tespit et
- Mevcut process varsa uyarı ver ve --force olmadan başlatma
- `tmux kill-server` ile eski deckent session'ını temizle (sadece deckent session'ı)

B) Cleanup komutuna zombie process temizleme ekle:
- `deckent cleanup` çağrıldığında eski start process'leri de kill et
- tmux deckent session'ını kapat

C) Sprint finalize sonunda: tüm tmux window'ları kapatıldığını doğrula, kalan window varsa kill et.

**Kanıt:** `deckent cleanup` → eski process'ler temizlenmeli

**Test:** `tsc --noEmit` temiz

---

## Task 4: Prompt Dosyası Lifecycle Düzeltme
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/tmux.ts, src/orchestra/sprint-controller.ts
- Scope: src/orchestra/

### Description
Her sprint start'ta yeni .prompt-* dosyaları oluşuyor, eski start'lardan kalanlar temizlenmiyor. Sprint tekrarlanınca prompt dosyaları birikiyor.

A) Sprint plan başlamadan önce eski .prompt-* dosyalarını temizle (plan aşamasında, spawn'dan önce):
```typescript
// cleanupDraftTasks() sonuna ekle:
const promptFiles = readdirSync(tasksDir).filter(f => f.startsWith('.prompt-'));
for (const f of promptFiles) { unlinkSync(join(tasksDir, f)); }
```

B) Worker spawn sonrası prompt dosyasını hemen silme — Claude CLI stdin'den okuyana kadar bekle. Ama sprint finalize/cleanup'ta mutlaka temizle.

**Kanıt:** Sprint plan sonrası eski .prompt-* dosyası kalmamalı

**Test:** `tsc --noEmit` temiz

---

## Task 5: CLI/MCP Start Parity — Davranış Eşitliği
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/cli/commands/start.ts, src/mcp/tools/start.ts
- Scope: src/cli/, src/mcp/

### Description
MCP deckent_start ile CLI deckent start arasında kritik davranış farkları var. Eşitleme:

A) CLI start'a MCP start'taki pre-flight skip'i ekle:
- MCP: `force=true` default (non-interactive context)
- CLI: doctor check yapıyor → yavaşlatıyor. --no-doctor flag ekle veya default skip yap

B) Sprint output format eşitliği:
- MCP: JSON response ile task listesi + status döner
- CLI: Human-readable summary → bu doğru ama eksik bilgi veriyor

C) Timeout default eşitliği:
- MCP: default 1800000ms (30 dk)
- CLI: default undefined → kontrol et, aynı olmalı

**Kanıt:** Her iki start komutu aynı autoApprove, timeout, force default'ları kullanmalı

**Test:** `tsc --noEmit` temiz

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- Sprint lock mekanizması çalışmalı (çift start engellenmeli)
- Brain evaluate DONE result'ı NO_GO olarak değerlendirmemeli
- Zombie process koruması aktif olmalı
- %100 GO hedefli
