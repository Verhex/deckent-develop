# deckent_start — MCP Tool Referansı

## Genel Bakış

`deckent_start`, bir Deckent sprint'ini arka planda başlatan MCP aracıdır. Çağrıldığında tam sprint yaşam döngüsünü başlatır: **PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP**. Araç, sprint tamamlanmadan önce hemen bir `jobId` dönerek MCP stdio transport'u serbest bırakır; sprint ayrı bir detached süreç olarak çalışmaya devam eder.

**Ön koşullar:** `deckent_init` ve `deckent_set_directives` araçları önceden çalıştırılmış olmalıdır. Aksi hâlde sprint planlanamaz.

---

## Parametreler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|-----------|---------|
| `autoApprove` | `boolean` | `true` | Worker tool çağrılarını `--dangerously-skip-permissions` ile otomatik onaylar. Worker'ların tam yazma iznine sahip olması zorunludur. Yalnızca hata ayıklama için `false` olarak ayarlanabilir; ancak pratikte değeri değiştirmez — kaynak kodda immutable `true` olarak bağlanmıştır. |
| `dryRun` | `boolean` | `false` | Worker spawn etmeden sprint'i planlar. DIRECTIVES.md okunur, task JSON'ları oluşturulur, ancak hiçbir worker başlatılmaz ve hiçbir dosya değiştirilmez. Gerçek sprint öncesi planlı task listesini incelemek için kullanılır. |
| `force` | `boolean` | `false` | Ön kontrol (pre-flight) sağlık denetimlerini atlar. Normalde `deckent_start`, worker'ları başlatmadan önce sprint kilidini kontrol eder. `force=true` bu kilidi bypass eder. Ortamın hazır olduğundan emin olunduğunda kullanılır. |
| `timeout` | `number` | `1800000` (30dk) | Sprint'in maksimum süresi (milisaniye). Worker'lar bu süre içinde tamamlanmazsa sprint `TIMEOUT` olarak işaretlenir. Uzun sprintler için artırılabilir. |
| `sandbox` | `boolean` | `false` | Sandbox modunda sprint çalıştırır. Worker'lar spawn edilmeden önce yerel git değişiklikleri stash'lenir; sprint tamamlandıktan (veya başarısız olduktan) sonra geri yüklenir. Kalıcı değişiklik olmadan güvenli denemeler yapılmasını sağlar. |

---

## Nasıl Çalışır?

### 1. Orphan Temizliği

Araç önce önceki sprint çalıştırmalarından kalan ölü IPC dizinlerini temizler. Canlı PID kontrolü yaparak aktif sprint dizinlerine dokunmaz.

### 2. Sprint Kilidi Kontrolü

`force=false` ise `isSprintLocked()` ile aktif sprint kontrolü yapılır. Başka bir sprint zaten çalışıyorsa hata döner:
```
Sprint already running (PID 12345, env: tmux, sprint: sprint-155, started: ...).
Use force=true to override.
```

### 3. Dry-Run Modu

`dryRun=true` ise:
- Provider kayıt defteri başlatılır (`bootstrapProviders`)
- `planSprint()` çalışır, task'lar oluşturulur
- Task listesi `{ id, title, model, effort, assignedAgent }` formatında döner
- Hiçbir worker başlatılmaz

### 4. Gerçek Sprint Başlatma

`dryRun=false` ise:
1. Benzersiz bir `jobId` üretilir (`sprint-<timestamp>` formatında)
2. IPC dizini oluşturulur (`getIpcDir(root, jobId)`)
3. Sprint konfigürasyonu IPC dizinine yazılır (`SprintRunnerConfig`)
4. `sprint-runner-entry.js` detached child process olarak `fork()` edilir
5. `stdio: 'ignore'` — MCP transport'u bloke etmemesi için
6. `child.unref()` — MCP server, sprint tamamlanmadan önce çıkabilir
7. Hemen `{ success: true, jobId, status: "RUNNING" }` döner

### 5. IPC Dizin Yönetimi

Child process exit olduğunda:
- `code === 0` → IPC dizini her zaman silinir (sonuçlar tüketildi)
- `code !== 0` → Yalnızca config-only dizinlerse silinir; debug verisi içeriyorsa korunur

---

## Yanıt Formatı

### Başarılı Başlatma

```json
{
  "success": true,
  "jobId": "sprint-1747000000000",
  "status": "RUNNING",
  "message": "Sprint started in background. Use deckent_status to track progress.",
  "activeWorkers": 0,
  "queuedTasks": 0,
  "estimatedDuration": "~10-30 minutes"
}
```

### Dry-Run Yanıtı

```json
{
  "success": true,
  "dryRun": true,
  "sprintId": "sprint-155",
  "taskCount": 10,
  "tasks": [
    { "id": "155-001", "title": "...", "model": "sonnet", "effort": "low", "assignedAgent": "doc-writer" }
  ],
  "message": "Dry-run complete. No workers spawned. Review tasks, then call deckent_start without dryRun to execute."
}
```

### Hata Yanıtı

```json
{
  "error": true,
  "success": false,
  "message": "Sprint already running (PID 12345 ...). Use force=true to override."
}
```

---

## Kullanım Örnekleri

### Standart Sprint Başlatma

```json
{
  "tool": "deckent_start",
  "arguments": {}
}
```

### Önce Planı İncele (Dry-Run)

```json
{
  "tool": "deckent_start",
  "arguments": { "dryRun": true }
}
```

### Sandbox Modunda Güvenli Sprint

```json
{
  "tool": "deckent_start",
  "arguments": { "sandbox": true, "timeout": 3600000 }
}
```

### Kilit Bypass ile Zorla Başlat

```json
{
  "tool": "deckent_start",
  "arguments": { "force": true }
}
```

---

## Sonraki Adımlar

Sprint başlatıldıktan sonra:
- **`deckent_status`** — Aktif worker'ları ve ilerlemeyi izler
- **`deckent_review`** — Sprint sonucunu GO / NO_GO / GO_WITH_TECH_DEBT olarak değerlendirir
- **`deckent_retro`** — Sprint retrospektifini okur
- **`deckent_cleanup`** — Task dosyalarını arşivler, sprint'i kapatır
