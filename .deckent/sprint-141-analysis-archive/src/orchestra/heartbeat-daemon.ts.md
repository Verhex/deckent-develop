# Analysis: src/orchestra/heartbeat-daemon.ts
**Task ID:** 141-002 | **LoC:** 248

## 1. Amaci (1-2 cumle)
`.deckent/HEARTBEAT.md` dosyasindaki bekleyen gorevleri periyodik olarak calistirir ve sonuclari `.brain/heartbeat-log.md` dosyasina kaydeder. PID dosyasiyla daemon yonetimi saglar.

## 2. Public API (export listesi)
- `HeartbeatRunResult` interface
- `runHeartbeat(projectRoot): HeartbeatRunResult`
- `HeartbeatDaemon` class:
  - `constructor(projectRoot, intervalMinutes?)`
  - `start(): HeartbeatRunResult`
  - `stop(): void`
  - `running` getter
- `readDaemonPid(projectRoot): number | null`
- `stopDaemonByPid(projectRoot): boolean`

## 3. Ic + Dis Bagimliliklar
- **Icsel:** `node:fs`, `node:path`, `node:child_process` (execSync)
- **Dissal:**
  - `../core/constants.js` (DECKENT_DIR, BRAIN_DIR)
  - `../core/utils.js` (debugLog)
- `.deckent/HEARTBEAT.md` okur, `.brain/heartbeat-log.md`e yazar

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- 5 export edilen fonksiyon + 1 class (2 metot)
- `runHeartbeat()`: pending task loop + execSync per task
- `readDaemonPid()`: file okuma + process.kill(pid, 0) varlik kontrolu
- Toplam cyclomatic rough: ~12

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `err as { stdout?: string; stderr?: string; message?: string }` cast — execSync error handling
- Non-null assertion: `pendingMatch[1]`, `doneMatch[1]` — match test sonrasi guvenli
- `@ts-ignore`: yok

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- ADR-006: `execSync` kullanimi — spawnSync daha guvenli olurdu (output kontrolu)
- HEARTBEAT.md'de kullanici tanimli komutlar — injection riski var (execSync + shell=true default davranis)
- ADR-008: sadece core/ — compliant

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/heartbeat-daemon.test.ts` beklenir
- `runHeartbeat` testlenebilir — mock execSync ile

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `DEFAULT_HEARTBEAT_TEMPLATE` sabit — sadece ilk olusturma icin kullaniliyor, nadiren degistirilir

## 10. Security Findings
- **KRITIK:** `execSync(task.command, ...)` — HEARTBEAT.md'deki komutlar shell'de calistirilacak
- HEARTBEAT.md'deki satir formati `- [ ] <command>` seklinde, command dog. kullanici girisi
- Komut injection riski: `- [ ] rm -rf /` gibi bir satir tehlikeli
- Guvenlik onerileri: komut whitelist veya dogrulama eklenmeli

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- `heartbeat-log.md` dogrudan `.brain/` altina yaziliyor — dosya bazli, DB degil
- Memory V2 mimarisinde bu log MemoryStore'a yazilmali
- Kucuk sorun, heartbeat log'lar ADR'ler gibi kritik veri degil

## 12. Oneriler (Sprint 142+ input)
- `execSync` yerine `spawnSync` kullanin ve komut whitelist ekleyin (guvenlik)
- Heartbeat log'lari MemoryStore'a yazma secenegi degerlendirilebilir
- HEARTBEAT.md format belgelenmeli

## 13. Verdict: PARTIAL (execSync security concern mevcut)
