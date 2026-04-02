# DIRECTIVES — Sprint 088: Timeout Reformu + Heartbeat Daemon + Human Checkpoints + Final Polish

## Goal: Sprint timeout sorununu köklü çöz (sınırsız çalışma desteği), heartbeat daemon ile proaktif sistem, human checkpoints ile güvenilir otonomi, README/docs final polish. Perfect beta'ya hazırlık.

---

## Task 1: Sprint Timeout Reformu — Sınırsız Çalışma Desteği
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/result-collector.ts, src/orchestra/sprint-controller.ts, src/core/config-types.ts, src/core/config.ts
- Scope: src/orchestra/, src/core/

### Description
Sprint timeout mekanizmasını yeniden tasarla. Mevcut 30dk hardcoded default çok kısa — kullanıcılar saatlerce çalışan sprintler isteyebilir.

A) config-types.ts'e yeni field:
- `DeckentConfig.sprint_timeout_minutes?: number` (varsayılan 0 = sınırsız)
- `ResolvedConfig.sprint_timeout_minutes: number` (varsayılan 0)
- 0 = sınırsız (timeout yok), pozitif sayı = dakika cinsinden timeout

B) config.ts defaults'a ekle:
- `sprint_timeout_minutes: 0` (varsayılan sınırsız)

C) result-collector.ts'de `waitForResultsImpl()`:
- `const timeout = timeoutMs ?? (config.sprint_timeout_minutes ? config.sprint_timeout_minutes * 60000 : 0);`
- `timeout === 0` → sınırsız bekleme (while döngüsü timeout kontrolünü atla)
- Sınırsız modda bile her 5dk'da bir "Sprint devam ediyor, X/Y task tamamlandı" debug log yaz
- Worker heartbeat DONE olduğunda hemen result dosyasını kontrol et (5s polling yerine anında)

D) sprint-controller.ts'de `runSprint()`:
- `opts.timeoutMs` yerine `config.sprint_timeout_minutes * 60000` kullan (opts override hala çalışsın)
- Sınırsız modda SIGINT ile graceful shutdown hala çalışmalı

E) MCP start tool'da timeout parametresi:
- 0 geçilirse sınırsız
- Geçilmezse config'den oku

**Kanıt:** `grep "sprint_timeout_minutes" src/core/config-types.ts` → 2+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 2: Heartbeat Daemon — Proaktif Görev Sistemi
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/orchestra/heartbeat-daemon.ts, src/cli/commands/heartbeat.ts, src/cli/index.ts
- Scope: src/orchestra/, src/cli/

### Description
OpenClaw'dan esinlenerek heartbeat daemon sistemi oluştur. Sistem periyodik olarak proaktif görevler çalıştırsın.

A) `src/orchestra/heartbeat-daemon.ts` yeni dosya oluştur:
- `HeartbeatDaemon` class'ı:
  - `constructor(projectRoot: string, intervalMinutes: number = 30)`
  - `start()`: setInterval ile periyodik kontrol başlat
  - `stop()`: interval'ı temizle
  - `runHeartbeat()`: tek bir heartbeat döngüsü çalıştır
- `runHeartbeat()` içinde:
  - `.deckent/HEARTBEAT.md` dosyasını oku (yoksa varsayılan oluştur)
  - Her satır bir kontrol görevi: `- [ ] lint check`, `- [ ] test run`, `- [x] done item` (atla)
  - Tamamlanmamış görevleri sırayla çalıştır (shell komutu)
  - Sonuçları `.brain/heartbeat-log.md`'ye append et
  - Hata varsa `debugLog()` ile logla

B) Varsayılan `.deckent/HEARTBEAT.md` şablonu:
```markdown
# Heartbeat Tasks
- [ ] tsc --noEmit
- [ ] npx vitest run --reporter=verbose 2>&1 | tail -5
```

C) `src/cli/commands/heartbeat.ts` CLI komutu:
- `deckent heartbeat` — tek seferlik heartbeat çalıştır
- `deckent heartbeat --daemon` — daemon modunda başlat (arka planda)
- `deckent heartbeat --interval 15` — interval dakika ayarla
- `deckent heartbeat --stop` — çalışan daemon'u durdur

D) `src/cli/index.ts`'de komutu kaydet

**Kanıt:** `ls src/orchestra/heartbeat-daemon.ts src/cli/commands/heartbeat.ts` → dosyalar var

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 3: Human Checkpoints — Sprint Fazlarında Onay Noktaları
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/core/config-types.ts, src/core/config.ts
- Scope: src/orchestra/, src/core/

### Description
Sprint lifecycle'a configurable human checkpoint'ler ekle. Cowork modelinden esinlenerek.

A) config-types.ts'e:
- `DeckentConfig.human_checkpoints?: string[]` (varsayılan [])
- Geçerli değerler: `'plan'`, `'evaluate'`, `'fix'`
- Boş dizi = checkpoint yok (tam otonom)

B) sprint-controller.ts'de checkpoint mekanizması:
- `async function waitForHumanApproval(phase: string, summary: string): Promise<boolean>`
- `.deckent/checkpoints/` dizinine `checkpoint-{sprintId}-{phase}.json` yaz:
  ```json
  { "phase": "plan", "summary": "4 task planlandı...", "status": "pending", "createdAt": "..." }
  ```
- Status dosyasını her 5 saniyede kontrol et
- Status `"approved"` → devam et, `"rejected"` → sprint durdur
- CLI/MCP/Dashboard'dan approve edilebilir

C) runSprint() içinde checkpoint noktaları:
- Plan fazından sonra: `if (config.human_checkpoints?.includes('plan'))` → waitForHumanApproval
- Evaluate fazından sonra: `if (config.human_checkpoints?.includes('evaluate'))` → waitForHumanApproval
- Fix fazından önce: `if (config.human_checkpoints?.includes('fix'))` → waitForHumanApproval

D) MCP tool ekleme (basit):
- Mevcut `deckent_config` tool'u ile `human_checkpoints` ayarlanabilir
- Checkpoint approve/reject için `.deckent/checkpoints/` dosyasına yazma yeterli

**Kanıt:** `grep "human_checkpoints\|waitForHumanApproval" src/orchestra/sprint-controller.ts` → 3+

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 4: README + IDENTITY + Docs Final Polish
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: README.md, README-TR.md, .deckent/workspace/IDENTITY.md, .brain/PROJECT-IDENTITY.md
- Scope: ./, .deckent/, .brain/

### Description
Perfect beta için tüm kullanıcıya dönük dokümanları güncelleyelim.

A) README.md güncelle:
- Badge'lar: tests 12,239+, sprints 87+, version v0.3.0-beta.3
- Key Features'a ekle: "Heartbeat Daemon", "Human Checkpoints", "Configurable Sprint Timeout"
- Comparison table'a: "Heartbeat/proactive tasks" satırı
- CLI commands'a: `deckent heartbeat` komutu

B) README-TR.md'yi aynı şekilde güncelle

C) IDENTITY.md güncellemeleri:
- Sprint sayısı: 87+
- Yeni özellikler listesi
- Test sayısı güncelleme

D) PROJECT-IDENTITY.md güncellemeleri:
- Sprint 087-088 achievements
- Self-improvement durumu: "Faz 0+1 tamamlandı, Faz 2 devam ediyor"

**Kanıt:** `grep "heartbeat\|Heartbeat" README.md` → var

**Test:** `tsc --noEmit` temiz.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail (pre-existing hariç)
- Sprint timeout 0 = sınırsız çalışmalı
- Heartbeat daemon CLI'dan başlatılabilmeli
- Human checkpoint dosya bazlı approve/reject çalışmalı
- README/docs güncel ve tutarlı
- %100 GO hedefli
