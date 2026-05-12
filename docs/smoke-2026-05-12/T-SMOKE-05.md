# T-SMOKE-05: Docker Worker Spawn Akışı

> Kaynak: `src/orchestra/spawn-backend-docker.ts` · ADR-006 spawnSync Pattern

---

## Genel Bakış

Deckent'in Docker backend'i her worker task'ı için izole bir container oluşturur. Worker'lar host dosya sistemine doğrudan erişemez; yalnızca tanımlı mount noktaları üzerinden haberleşir. Bu yaklaşım ADR-034 (Multi-Project Isolation) gerekliliklerine uygun cross-worker izolasyon sağlar.

---

## 1. Container Oluşturma

Spawn adımı `DockerSpawnBackend.spawn()` metoduyla başlar. Yöntem önce `docker images -q` komutuyla hedef imajın (`deckent-worker:latest`) varlığını doğrular; imaj yoksa anlamlı bir hata mesajıyla `SpawnBackendError` fırlatır.

Container, `docker run -d` komutuyla **detached** modda başlatılır. Container adı `deckent-w-{taskId}` formatındadır. Bellek limiti olarak `--memory 4g / --memory-swap 6g` uygulanır. Worker, host kullanıcısının `uid:gid` kimliğiyle çalışır — Claude CLI `--dangerously-skip-permissions` bayrağını root süreçlerde reddeder.

**ADR-006 spawnSync Pattern:** Tüm `docker` çağrıları `spawnSync()` kullanılarak gerçekleştirilir, `exec()` veya shell interpolation'a başvurulmaz. Bu yaklaşım, kullanıcı girdisi veya task parametrelerinden kaynaklanabilecek komut enjeksiyonunu engeller.

---

## 2. Mount Noktaları

| Host Yolu | Container Yolu | Erişim | Amaç |
|-----------|----------------|--------|------|
| `{projectDir}` | `/workspace` | `rw` | Proje kaynak dosyaları |
| `{projectDir}/.tasks/` | `/workspace/.tasks/` | `rw` | Result, heartbeat, prompt dosyaları |
| `{projectDir}/.locks/` | `/workspace/.locks/` | `rw` | Dosya kilitleme (ADR-037 RBAC) |
| `~/.claude/` | `/tmp/deckent-home/.claude/` | `rw` | Claude auth session (oturum çerezi, cache) |
| `~/.claude.json` | `/tmp/deckent-home/.claude.json` | `rw` | Claude CLI config ve izin ayarları |

Container HOME dizini `/tmp/deckent-home` olarak ayarlanır ve `--tmpfs` ile 100 MB yazılabilir alan oluşturulur. Host HOME dizini (`/home/alperen` gibi) container dosya sisteminde bulunmaz; bu nedenle sabit bir tmpfs yolu kullanılır.

---

## 3. Environment (Çevre Değişkeni) Enjeksiyonu

Container başlatılırken aşağıdaki çevre değişkenleri iletilir:

| Değişken | Değer | Amaç |
|----------|-------|------|
| `HOME` | `/tmp/deckent-home` | Claude CLI için yazılabilir ev dizini |
| `DECKENT_TASK_ID` | `{taskId}` | Worker'ın kendi task kimliği |
| `DECKENT_PROJECT_ROOT` | `/workspace` | SIGTERM handler'ı için proje kökü |
| `TASK_TIMEOUT` | `{saniye}` | `timeout` komutuna iletilen süre sınırı |
| `ANTHROPIC_API_KEY` | `${env}` | Varsa Claude API anahtarı |
| `OPENAI_API_KEY` | `${env}` | Varsa Codex provider anahtarı |
| `GOOGLE_API_KEY` | `${env}` | Varsa Gemini provider anahtarı |
| `DECKENT_DEBUG` | `${env}` | Debug log etkinleştirme |

---

## 4. Claude CLI Bootstrap

Worker script (`.worker-{taskId}.sh`) `.tasks/` volume'a yazılır ve container içinde `sh` ile çalıştırılır. Script şu adımları izler:

```sh
# Claude CLI komutu
claude -p - --model sonnet \
  --allowedTools "..." \
  --dangerously-skip-permissions \
  < /workspace/.tasks/.prompt-{taskId}-{hash}.txt
```

Prompt dosyası (`.prompt-{taskId}-{hash}.txt`) spawn sırasında `.tasks/` dizinine yazılır ve stdin aracılığıyla Claude CLI'ya beslenir. Fix/retry worker'larında dosya adına `-fix` son eki eklenir.

---

## 5. Heartbeat Mekanizması

Container başlar başlamaz iki eylem gerçekleşir:

1. **Host tarafı:** İlk `.hb` dosyası `DockerSpawnBackend` tarafından yazılır (`sequence: 1`).
2. **Container tarafı:** Worker script, arka planda 15 saniyede bir çalışan bir heartbeat döngüsü başlatır:

```sh
( SEQ=2; while true; do
    sleep 15; SEQ=$((SEQ+1));
    echo "{\"workerId\":\"docker-{taskId}\", ...}" > "$HBFILE"
  done ) &
HB_PID=$!
```

Auditor, `.hb` dosyasının son güncelleme zamanını izler. 2 dakikadan eski heartbeat → stale agent uyarısı tetiklenir.

---

## 6. Exit Code Yönetimi

Container bitişinde `monitorContainer()` (`docker wait` ile async izleme) exit code'u alır ve aşağıdaki uzlaşma (reconciliation) mantığını uygular:

| Koşul | Sonuç |
|-------|-------|
| `exitCode == 0` | `DONE` |
| `exitCode != 0` + `.result` var + `selfAssessment == DONE` | `DONE` (reconcile) |
| `exitCode != 0` + `git diff` değişiklik gösteriyor | `TIMEOUT_WITH_WORK` |
| `exitCode == 137` (OOM kill) + `.partial-result` var | `.partial-result` → `.result` olarak terfi |
| `exitCode != 0` + hiç `.result` yok | Host-side fallback `NO_GO` yazılır |

### EXIT Trap (Container İçi)

Worker script, shell `trap on_exit EXIT` ile çıkış anında `on_exit()` fonksiyonunu tetikler. Bu fonksiyon:
- `.result` zaten varsa: `fsync_file` çağırır ve heartbeat döngüsünü sonlandırır.
- Yoksa `git diff --name-only` ile değişen dosyaları tespit eder.
- Değişiklik varsa: `TIMEOUT_WITH_WORK` değerlendirmesiyle `.result` yazar.
- Değişiklik yoksa: `NO_GO` değerlendirmesiyle `.result` yazar.

### SIGTERM Trap

`docker stop --time=15` komutu container'a SIGTERM gönderir. TERM trap anında `.result` ve `.hb` dosyalarını `fsync_file()` ile diske yazar ve temiz çıkış yapar. 15 saniye sonra SIGKILL gelirse veriler zaten disk üzerindedir.

---

## 7. Üretilen Dosyalar

| Dosya | Üretici | İçerik |
|-------|---------|--------|
| `.tasks/task-{id}.json` | Brain (planner) | Task tanımı, scope, model, prompt |
| `.tasks/.prompt-{id}-{hash}.txt` | Host (spawn) | Claude CLI'ya iletilen prompt metni |
| `.tasks/.worker-{id}.sh` | Host (spawn) | Container içinde çalışan bootstrap script |
| `.tasks/task-{id}.hb` | Host + Container | Heartbeat JSON (her 15 saniye güncellenir) |
| `.tasks/task-{id}.plan` | Worker (Claude CLI) | Görev öncesi yürütme planı |
| `.tasks/task-{id}.result` | Worker (Claude CLI) | Nihai değerlendirme: DONE / GO_WITH_TECH_DEBT / NO_GO |
| `.tasks/task-{id}.partial-result` | Worker script başlangıcı | OOM kill güvenlik ağı; normal çıkışta silinir |
| `.tasks/task-{id}.log` | Host monitor | Container stdout + stderr |
| `.tasks/task-{id}.timeout` | Host / Container | Timeout veya başlatma hatası belirteci |

Sprint cleanup aşamasında `.prompt-*.txt` dosyaları `.tasks/archive/sprint-{id}/` altına arşivlenir (`archivePromptFiles()`). `.worker-*.sh` dosyaları çalıştırma sonrasında silinir.

---

## 8. Önemli Mimari Notlar

- **ADR-006 (spawnSync):** Tüm `docker` çağrıları `spawnSync` / `nodeSpawn` kullanır — kabuk yorumlama kaçınılır.
- **ADR-037 (RBAC):** `.locks/` volume mount'u Worker dosya kilitleme protokolünü container içinde de zorlar.
- **Sprint 139 fsync Düzeltmesi:** `dd if=X of=X.fsync bs=4096 conv=fsync` POSIX taşınabilir fsync — Alpine'de Python/Perl bağımlılığı gerektirmez.
- **Sprint 145 TIMEOUT_WITH_WORK:** Kısmen tamamlanmış işi olan timeout worker'ları körü körüne NO_GO yerine Brain'in uzlaşma yardımcısına yönlendirilir.
- **Sprint 151 .partial-result:** OOM kill güvenlik ağı — container başladığı anda yazılır, normal çıkışta temizlenir.
