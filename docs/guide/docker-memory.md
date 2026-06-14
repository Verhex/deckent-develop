# Docker Worker Memory Budgeting

> Sprint 191 T-001 — Bu rehber, Docker spawn backend ile çalıştırılan worker
> container'larının bellek bütçesini nasıl planlayacağınızı anlatır. Özellikle
> WSL2 üzerinde çalışıyorsanız mutlaka okuyun. Sprint 189+190 dogfood'unda 6
> paralel worker × 8GB allocation kombinasyonu, WSL2 host RAM havuzunu aştığı
> için kernel OOM-killer worker container'larını `exit 137 (SIGKILL)` ile
> sonlandırdı. Bu rehber aynı senaryonun tekrar yaşanmaması için kalibre
> edilmiştir.

## Hızlı Formül

```
host_required_ram = (max_workers × worker_memory_limit) + 2 GB overhead
```

`max_workers` ve `worker_memory_limit` değerleri `.deckent/config.json`'da
tutulur. `2 GB overhead` ise host işletim sistemi + Docker daemon + Brain
süreci için ayrılan tampondur.

### Örnek hesaplar (Deckent varsayılanları, Sprint 191)

| Mode        | max_workers | worker_memory_limit | Toplam talep |
|-------------|-------------|---------------------|--------------|
| performance | 8           | 4 GB                | 34 GB        |
| balanced    | 5           | 4 GB                | 22 GB        |
| economic    | 3           | 4 GB                | 14 GB        |
| api         | 10          | 4 GB                | 42 GB        |

> Sprint 191 öncesi (8 GB hardcoded + 6 worker): **50 GB** istenirdi. Tipik bir
> 16 GB WSL2 host'ta bu doğrudan OOM-kill demek.

## Tavsiye Edilen Limitler

| Worker bütçesi   | Önerilen kullanım                                            |
|------------------|--------------------------------------------------------------|
| `2g` / `3g`      | Küçük doc / refactor task'ları, low-effort Haiku worker'ları |
| `4g` (default)   | Çoğu Sonnet/Opus worker'ı için yeterli                       |
| `6g`             | Heavy AI mode (büyük context + tool use'lar)                 |
| `8g+`            | Sadece dedicated host / cloud VM, WSL2 için tavsiye edilmez  |

`--memory-swap` her zaman `--memory` ≤ değer olmalıdır. Deckent default'u limit
+ ~50% headroom verir (4g → 6g). Daha az: daha hızlı OOM. Daha çok: GC
gecikmeleri.

## `.wslconfig` ile Host RAM Artırma (Windows)

WSL2 default olarak hostun %50'sini veya 8 GB'ı (hangisi küçükse) kullanır. 16
GB+ veriyseniz dahi explicit ayarlama lazım. Komut satırında:

```powershell
notepad $env:USERPROFILE\.wslconfig
```

İçeriği aşağıdaki gibi yazın (kendi host RAM'inize göre):

```ini
[wsl2]
memory=24GB              # Host RAM'inizin %75'i kadar
processors=8             # Mantıksal çekirdek sayısı kadar veya altı
swap=8GB                 # WSL2 swap (memory'nin ~1/3'ü)
swapFile=C:\\wsl-swap.vhdx
```

Sonra PowerShell'i admin olarak açıp WSL'i restart edin:

```powershell
wsl --shutdown
```

Sonraki `wsl` çağrısı yeni RAM bütçesi ile gelir. `free -h` ile teyit:

```bash
free -h
# Mem:  24Gi  ...
```

## Linux (Native) ve macOS

* **Native Linux:** Host RAM doğrudan görünür, ayar gerekmez. `docker stats`
  ile canlı izleyin.
* **macOS (Docker Desktop):** Docker Desktop → Settings → Resources → Memory.
  Default 8 GB; 16 GB'a çıkarın.

## Canlı İzleme

Sprint sırasında her worker'ın memory tüketimini görmek için:

```bash
docker stats --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'
```

Output:

```
NAME                      MEM USAGE / LIMIT     MEM %
deckent-w-191-001         2.1GiB / 4GiB         52.5%
deckent-w-191-002         3.8GiB / 4GiB         95.0%
deckent-w-191-003         1.4GiB / 4GiB         35.0%
```

%95+ MEM% bir worker'da görüyorsanız OOM-kill yakın. `worker_memory_limit`'i
artırın veya `max_workers`'ı düşürün.

## Hata Tanıma — `exit 137 (SIGKILL)`

Worker container'ı `exit 137` ile öldüyse iki olası neden:

1. **OOM-killer** — kernel container'ı bellek aşımı nedeniyle öldürdü. WSL2'de
   en sık görülen. Çözüm: `worker_memory_limit` artır veya `max_workers` düşür.
2. **Manual SIGKILL** — `docker kill <id>` ya da `kill -9 <pid>` çağrıldı.
   Çözüm: Sprint kill chain'ini gözden geçir.

Forensic için:

```bash
# Container exit reason
docker inspect <container> --format '{{.State.OOMKilled}} {{.State.ExitCode}}'
# Output: "true 137" → OOM kill confirmed

# Kernel log
dmesg | grep -i 'killed process'
```

Eğer `OOMKilled: true` görüyorsanız, host RAM bütçesi yetersiz; bu rehberin
formülünü uygulayın.

## Override Yöntemleri (öncelik sırası)

`DockerSpawnBackend` constructor opts > config dosyası > default.

```typescript
// Programmatik override (entegrasyon testlerinde):
new DockerSpawnBackend(projectDir, {
  memoryLimit: '6g',
  memorySwap: '9g',
});
```

`.deckent/config.json` üzerinden (önerilen kullanıcı yolu):

```json
{
  "spawn_backend": "docker",
  "worker_memory_limit": "4g",
  "worker_memory_swap": "6g"
}
```

`spawn-backend-docker.ts` default sabitleri: `DEFAULT_WORKER_MEMORY_LIMIT = '4g'`,
`DEFAULT_WORKER_MEMORY_SWAP = '6g'`. **Not:** Bu flat anahtarlar doctor/resources tarafından RAM-raporlama/uyarı için okunur; standart spawn-factory yolunda container `--memory` bayrağına henüz bağlanmamıştır (container'lar yerleşik 4g/6g kullanır). Per-task-kind ince ayar için `worker_memory_limit_by_kind` kullanın.

## Sprint 189+190 Vakası (Tarihsel Kayıt)

Sprint 189+190 dogfood'da gözlemlenen davranış:

* `max_workers: 6` × `--memory 8g` = 48 GB talep
* WSL2 host: 16 GB
* Sonuç: 6 worker / sprint exit 137 (OOM)
* False NO_GO oranı: ~%85 (gerçekte iş yapılmıştı, container OOM-kill ile
  result yazamadan öldü)

Sprint 191 T-001 düzeltmesi:

* `max_workers` default 6 → 3 (deckent-dev profili)
* `worker_memory_limit` default 8g → 4g (hardcoded'tan config-driven'a)
* `--memory-swap` default 12g → 6g (limit + 50% headroom)
* Yan koruma: `reconcileSpuriousNoGo` wire (sprint-191 P191-1 hotfix)

Bu kombinasyonla 3 worker × 4g + 2 GB overhead = 14 GB ≤ 16 GB host bütçesi.

## Sık Sorulan Sorular

**S: `worker_memory_limit`'i artırırsam `max_workers`'ı da düşürmem gerekir mi?**
C: Evet. Formülü uygulayın. `8g × 3 = 24 GB + 2 = 26 GB host gerekir`. WSL2'de
hostunuz buna yetiyor mu kontrol edin.

**S: `--memory-swap`'ı `--memory`'ye eşit yapabilir miyim?**
C: Evet, ama swap kullanımı kapalı olur. Worker peak memory'sini aşan tek bir
operation anında OOM-kill yaşar. Default %50 headroom (4g → 6g) güvenlidir.

**S: Local LLM (Ollama) kullanıyorum, ek bütçe ister mi?**
C: Evet. Ollama daemon ayrı bellek kullanır (model boyutuna göre 4-8 GB).
Worker bütçesinden ayrı tutun.

---

## Heartbeat Core Fix — `atomicWriteFileSync`

Docker containers running workers kan be killed with SIGKILL (OOM, timeout). A plain
`writeFileSync` call may leave data in the OS buffer cache — if SIGKILL arrives before
the kernel flushes the buffer, the heartbeat file is **silently lost**.

`atomicWriteFileSync` (Sprint 139 HB Core Fix, `src/agents/worker-lifecycle.ts`) closes
this gap with a three-step pattern:

```
1. writeFileSync("<path>.tmp", data)   ← write to temp file (original untouched if crash here)
2. fsyncSync(fd)                        ← force OS buffer → disk (survives SIGKILL after this)
3. renameSync("<path>.tmp", "<path>")   ← POSIX atomic rename (readers see complete file or none)
```

This means `.tasks/task-{id}.hb` is **durable on disk** before `atomicWriteFileSync`
returns. Even if SIGKILL fires immediately after, the last-written heartbeat is readable by
the Auditor and Brain.

### SIGTERM Handler

The `registerSigtermHandler()` function (`src/agents/worker-lifecycle.ts`) is called once
per worker process and registers a `process.on('SIGTERM', ...)` handler. When Docker sends
SIGTERM (via `docker stop`), the handler:

1. Fsyncs the `.result` file if it already exists on disk.
2. Writes a finalized `.hb` with `note: 'Finalized on SIGTERM'` using `atomicWriteFileSync`.
3. Exits the process so the container exits within the 15s grace window.

This complements the shell-level `fsync_file` in the container's EXIT trap
(see `docs/guide/docker-backend.md` §5.5 Graceful Shutdown).

### Why This Matters on OOM-Kill

When the kernel OOM-killer fires (`exit 137`), SIGTERM is NOT sent — the process is
terminated immediately with SIGKILL. In this case:

- The shell EXIT trap in the container **does not run** (SIGKILL cannot be caught).
- The host-side `monitorContainer()` detects exit code 137 and writes a fallback
  `EXIT_WITHOUT_RESULT` marker with `workPresent` set from `git diff`.
- Any `.hb` written with `atomicWriteFileSync` **before** the OOM event is safe on disk
  because `fsync` was called. Plain `writeFileSync` data may have been lost.

**Practical implication:** If a sprint logs OOM-kill events, increase
`worker_memory_limit` (see Hızlı Formül above) or reduce `max_workers`. The HB core
fix ensures clean diagnosis (Auditor can read the last heartbeat) but does not prevent
the OOM itself.

---

> İlgili ADR: ADR-027 (Hybrid Spawn Backend). Sprint 191 master plan:
> `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` P191-2.
