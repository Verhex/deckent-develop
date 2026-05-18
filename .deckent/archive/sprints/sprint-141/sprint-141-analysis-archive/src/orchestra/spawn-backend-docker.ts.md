# Analysis: src/orchestra/spawn-backend-docker.ts
**Task ID:** 141-002 | **LoC:** 492

## 1. Amaci (1-2 cumle)
Worker'ları izole Docker container'larında spawn eder; her worker ayrı bir container'da çalışır. Sprint 139 Docker HB P0 bug fix'ini içerir: atomik fsync, 15 saniyelik SIGTERM grace period ve container sonrası result doğrulama.

## 2. Public API (export listesi)
- `DockerSpawnBackend` (class, SpawnBackend implementasyonu)
  - `spawn(taskId, model, prompt, opts?)` → void
  - `kill(taskId)` → void
  - `list()` → string[]
  - `isAvailable()` → Promise<boolean>
- `isDockerAvailable()` → boolean
- `archivePromptFiles(tasksDir, sprintId, retentionSprints?)` → {archived, cleaned}

## 3. Ic + Dis Bagimliliklar
**Node.js:**
- `node:child_process` — spawnSync, spawn
- `node:fs` — writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, openSync, fsyncSync, closeSync, readdirSync, renameSync, rmdirSync
- `node:path` — join, resolve
- `node:crypto` — randomBytes
- `node:os` — homedir, totalmem

**Core:**
- `../core/types.js` — ModelType
- `../core/constants.js` — TASKS_DIR
- `../core/utils.js` — debugLog
- `./spawn-backend.js` — SpawnBackend, SpawnBackendOptions, SpawnBackendError

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Public metotlar: 4
- Private metotlar: 2 (verifyResultAfterStop, monitorContainer)
- Top-level fonksiyon: 2 (isDockerAvailable, archivePromptFiles)
- Cyclomatic: yüksek (~25) — Docker args oluşturma, WSL2 kontrol, EXIT trap, SIGTERM trap, container monitoring, retention policy

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `JSON.parse(raw) as { selfAssessment?: string }` — tip assert
- `result.stdout?.trim() ?? ''` — güvenli optional chaining
- `@ts-ignore`: yok
- `any`: yok

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-006:** Uyumlu — spawnSync güvenli kullanım, user-controlled input yok
- **ADR-027 (Hybrid Spawn):** Uyumlu — Docker backend ADR-027'nin parçası
- **ADR-037:** Uyumlu — Brain/Spawner aracılığıyla çağrılır
- **ADR-040:** Uyumlu

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/spawn-backend-move.test.ts` — docker backend dahil
- Sprint 139 Task 17-19: Docker E2E test suite
- Doğrudan `spawn-backend-docker.test.ts` var mı? Kontrol edilmeli

## 8. TODO/FIXME/HACK inventory
- Satır 93-95: `// Double-quote the value — allowedTools contains parentheses` — shell quoting workaround
- Satır 396: `// NOTE: .prompt-* files are intentionally NOT deleted here.` — intentional design notu
- WSL2 memory uyarısı: 6GB eşiği hardcoded

## 9. Dead Code Candidates
- `startAuditor` analog yok bu modülde — tüm fonksiyonlar aktif

## 10. Security Findings
- **KRITIK:** `claudeArgs.push('--dangerously-skip-permissions')` — container içinde root ile çalışmama kontrolü var (uid/gid) ama bu flag her zaman set ediliyor
- `promptId = randomBytes(8).toString('hex')` — prompt dosya adı rastgeleliği sağlanmış; iyi
- API anahtarları env var ile geçiyor — güvenli
- Container memory limit: 4g/6g sabit kodlanmış — konfigüre edilmeli

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile doğrudan ilgisiz — Docker container yönetimi
- Eski .md parse yok

## 12. Oneriler (Sprint 142+ input)
1. **Memory Limit Config (P2):** --memory 4g hardcoded → config'e taşı
2. **WSL2 Threshold Config (P2):** 6GB eşiği konfigüre edilebilir olmalı
3. **Security (P2):** --dangerously-skip-permissions kullanım belgesi ve risk değerlendirmesi
4. **Test (P2):** Doğrudan Docker backend unit testleri; docker mock ile

## 13. Verdict: ANALYZED
