# Analysis: src/orchestra/heartbeat-daemon.ts
**Task ID:** 142-011 | **Model:** opus | **LoC:** 247 | **Effort:** max

## 1. Amacı
Proaktif codebase sağlık kontrol daemon'ı. `.deckent/HEARTBEAT.md` dosyasından markdown checklist formatında görevleri okuyup (`- [ ] komut`) periyodik olarak çalıştırır. Sonuçları `.brain/heartbeat-log.md`'ye yazar. Daemon modu: setInterval ile belirli aralıklarla (varsayılan 30dk) tekrar eder. PID dosyası ile daemon yönetimi sağlar. CLI'dan `deckent heartbeat` komutu ile kullanılır.

**ÖNEMLİ NOT:** Bu modül, sprint heartbeat (.hb dosyaları) ile KARISTIRILMAMALIDIR. Bu modül codebase-level sağlık kontrolleri (tsc, vitest) için bir daemon — sprint worker heartbeat'leri ile ilgisi yoktur.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `HeartbeatRunResult` | interface | Yok |
| `runHeartbeat()` | `(projectRoot: string) => HeartbeatRunResult` | ✅ "Execute a single heartbeat cycle" |
| `HeartbeatDaemon` | class | ✅ Method-level JSDoc |
| `readDaemonPid()` | `(projectRoot) => number \| null` | ✅ Var |
| `stopDaemonByPid()` | `(projectRoot) => boolean` | ✅ Var |

JSDoc coverage: **~70%** — fonksiyonlar dolu, interface boş.

## 3. İç Bağımlılıklar
- `../core/constants.js` → `DECKENT_DIR`, `BRAIN_DIR`
- `../core/utils.js` → `debugLog`
- **Döngüsel bağımlılık riski:** Yok.

## 4. Dış Bağımlılıklar
- `node:fs` → existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync
- `node:path` → join
- `node:child_process` → **execSync**
- **ADR-010 uyumu:** ✅ Sadece Node.js built-in.

## 5. Complexity
- **Fonksiyon sayısı:** 8 (5 export, 3 private: parseHeartbeatTasks, ensureHeartbeatFile, formatTimestamp)
- **En karmaşık:** `runHeartbeat()` (satır 90-143) — 53 satır, task iteration + execSync + error handling
- **Max cyclomatic complexity:** ~6
- **Genel karmaşıklık:** DÜŞÜK-ORTA

## 6. Type Safety
- **any sayısı:** 0
- **@ts-ignore / @ts-expect-error:** 0
- **as unknown:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** 1 — satır 126: `err as { stdout?: string; stderr?: string; message?: string }` — catch block'ta `unknown` → structured error. Güvenli pattern ama ExecException type daha doğru olurdu.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 (spawnSync) | ⚠️ KISMİ | **execSync kullanıyor** — ADR-006 spawnSync pattern'ini tanımlıyor ama execSync farklı bir API. Amaç aynı (senkron komut çalıştırma) ama shell injection riski farklı |
| ADR-008 (brain import) | ✅ | Sadece core/ import |
| ADR-010 (tek dep) | ✅ | Built-in only |

## 8. Test Coverage
- **Test dosyası:** ❌ **YOK** — `tests/orchestra/heartbeat-daemon.test.ts` mevcut değil
- **Eşleşme:** ❌ EKSIK
- **Severity: P1** — 247 satır kaynak kodu, 0 satır test. execSync gibi potansiyel tehlikeli API için test ZORUNLU.

## 9. TODO/FIXME/HACK Inventory
**Yok.** 0 adet.

## 10. Dead Code
- **Unused exports:** `runHeartbeat` ve `HeartbeatDaemon` sadece `src/cli/commands/heartbeat.ts`'den import ediliyor. `readDaemonPid` ve `stopDaemonByPid` da aynı dosyadan.
- **Unreachable branch:** Yok
- **@deprecated:** Yok
- **Değerlendirme:** Aktif kullanımda ama dar kapsamda.

## 11. Security
### 🔴 KRİTİK GÜVENLİK BULGUSU: execSync COMMAND INJECTION RİSKİ

**Satır 116-119:**
```typescript
output = execSync(task.command, {
  cwd: projectRoot,
  encoding: 'utf-8',
  timeout: 120_000,
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

`task.command` doğrudan HEARTBEAT.md dosyasından okunuyor (satır 59: regex match `^- \[ \] (.+)$`). Bu dosyayı değiştiren herhangi biri **keyfi komut çalıştırabilir**.

**Risk senaryoları:**
- Bir worker `.deckent/HEARTBEAT.md`'yi scope dışında değiştirirse (ADR-037 soft mode bypass)
- Dosya git'te paylaşılıyorsa, kötü niyetli bir katkıcı zararlı komut ekleyebilir
- Dosya şablonu `tsc --noEmit` ve `vitest` gibi masum komutlar içeriyor — ama kontrol yok

**Mevcut hafifletmeler:**
- Dosya `.deckent/` altında — git tracked olabilir
- 120 saniye timeout — sonsuz loop'u engeller
- stdio pipe — output yakalanıyor

**Eksik hafifletmeler:**
- Komut whitelist'i yok — keyfi komut çalıştırılabilir
- Komut sandboxing yok
- Input sanitization yok

**Severity: P1** — eğer HEARTBEAT.md kullanıcı tarafından doğrudan düzenlenmiyorsa risk azalır ama API tasarımı unsafe.

### Diğer güvenlik notları:
- `process.kill(pid, 0)` (satır 218) — process existence check, güvenli
- `process.kill(pid, 'SIGTERM')` (satır 236) — PID file'dan gelen PID — PID spoofing mümkün ama düşük risk

## 12. Memory V2 Uyumu
- N/A — HEARTBEAT.md dosya bazlı, Memory V2 ile ilişkisi yok
- `BRAIN_DIR` constant'ı kullanılıyor (heartbeat-log.md yazımı) — doğru

## 13. i18n
- DEFAULT_HEARTBEAT_TEMPLATE İngilizce (satır 20-23) — internal şablon
- Emoji kullanımı: ✅ ve ❌ — log dosyası için kabul edilebilir
- **Değerlendirme:** i18n gerektirmez ama template konfigüre edilebilir olmalı

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ davranış: Tutarlı
- HeartbeatDaemon constructor'da `intervalMinutes: number = 30` default — belgelenmemiş (P3)

## 15. Performance
- **Sync I/O:** readFileSync(×2), writeFileSync(×2), appendFileSync(×2), existsSync(×2), unlinkSync(×2)
- **execSync:** Her pending task için senkron komut çalıştırma — 120s timeout. Sprint'i bloklar.
- **Hot path:** Değil — daemon interval bazlı (30dk)
- **Gereksiz I/O:** ensureHeartbeatFile her çağrıda existsSync — daemon mode'da tekrarlı (P3)

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| **P1** | **Komut whitelist'i ekle — sadece bilinen komutlar çalıştırılabilsin** (tsc, vitest, npm, node) |
| **P1** | **Test dosyası oluştur — 247 LoC, 0 test kabul edilemez** |
| P2 | execSync yerine execFileSync kullan (shell injection azaltma) |
| P2 | HeartbeatRunResult interface'ine JSDoc ekle |
| P3 | DEFAULT_HEARTBEAT_TEMPLATE konfigüre edilebilir yapılsın |
| P3 | `intervalMinutes` constructor parametresini JSDoc'ta belgele |

## Verdict: ANALYZED
