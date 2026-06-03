# Spawn Backend'ler — Worker'ları Nasıl Başlatır?
> Deckent, worker'ları Docker container'larında, tmux penceresinde veya doğrudan subprocess olarak çalıştırabilir — ortama göre doğru backend otomatik seçilir.

## Ne işe yarar?
- Her sprint task'ı için bir worker process spawn eder.
- Üç backend arasında `spawn_backend` config anahtarıyla geçiş yapılır.
- `auto` değeri her zaman `docker` backend'e yönlendirir (Sprint 177'den itibaren).
- Spawn, kill ve list işlemleri `SpawnBackend` arayüzü üzerinden soyutlanmıştır.
- `SpawnBackendFactory.create()` tek çağrıyla doğru backend örneğini döner.

## Neden önemli?
- **İzolasyon:** Docker backend her worker'ı ayrı bir container namespace'inde çalıştırır — birbirinin dosya sistemine dokunamaz.
- **Platform esnekliği:** Tmux olmayan ortamlarda (Windows, CI-sız) subprocess backend devreye girer.
- **Graceful shutdown:** Docker backend SIGTERM → 15 saniyelik grace → SIGKILL zinciri uygular; yarım kalan çalışma kaybolmaz.

## Nasıl çalışır?

```
Brain
 └─ SpawnBackendFactory.create({ backend: 'docker' | 'subprocess' | 'tmux' })
       │
       ├─ DockerSpawnBackend   → docker run deckent-worker:latest
       │    ├─ .tasks/ dizini /workspace üzerinden volume mount
       │    ├─ 4g bellek / 6g swap (WSL2-güvenli)
       │    └─ SIGTERM → 15s grace → SIGKILL
       │
       ├─ SubprocessBackend    → Node.js child_process.spawn
       │    └─ Tmux gerektirmez; Windows ve CI ortamlarında çalışır
       │
       └─ TmuxBackend (⚠️ deprecated)
            └─ tmux new-window ile worker pencereleri açar
```

Her backend aynı `SpawnBackend` arayüzünü uygular: `spawn()`, `kill()`, `list()`, `isAvailable()`.

## Komut / Örnek

```bash
# Kullanılan backend'i sorgula
deckent config read | grep spawn_backend
# → "spawn_backend": "docker"

# Backend'i değiştir (subprocess fallback)
deckent config set spawn_backend subprocess

# Aktif worker'ları listele
deckent status
# → Workers: 4 active (docker)

# Belirli bir worker'ı durdur
deckent kill --worker w-225-003
```

```bash
# Config referansı (.deckent/config.json)
{
  "spawn_backend": "docker",           // önerilen
  "docker_graceful_timeout": 15,       // saniye
  "worker_memory_limit": "4g",
  "worker_memory_swap": "6g"
}
```

## Durum
- Olgunluk: ✅ canlı — Docker/subprocess aktif (manifest: `docker-backend`, `subprocess-backend`)
- ⚠️ **Tmux:** Sprint 177'den itibaren deprecated, Sprint 178'de kaldırılması planlandı. Varsa `spawn_backend: "docker"` veya `"subprocess"` kullan.
- İlgili: ADR-027 · `src/orchestra/spawn-backend.ts` · `src/orchestra/spawn-backend-docker.ts` · `src/orchestra/tmux.ts`
