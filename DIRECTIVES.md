# DIRECTIVES — Sprint 103: Docker Backend Dokümantasyon + Test Doğrulama

## Goal: Docker backend canlı test sonuçlarını dokümante etmek ve integration test yazmak.

---

## Task 1: Docker Backend Integration Test
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/e2e/docker-backend.test.ts
- Scope: tests/e2e/

### Description
Docker mevcut ise gerçek container spawn eden integration test yaz. Docker yoksa skip etmeli.

```typescript
import { isDockerAvailable } from '../../src/orchestra/spawn-backend-docker.js';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';

describe('Docker Backend Integration', () => {
  const skipIfNoDocker = !isDockerAvailable();

  it.skipIf(skipIfNoDocker)('spawns real container and gets result', async () => {
    // DockerSpawnBackend ile basit bir task spawn et
    // .tasks/task-test-docker.result dosyasının oluştuğunu doğrula
    // Container otomatik temizlendiğini doğrula
  });

  it.skipIf(skipIfNoDocker)('heartbeat file is written correctly', async () => {
    // .hb dosyasının backend: docker içerdiğini doğrula
  });

  it.skipIf(skipIfNoDocker)('container cleanup after exit', async () => {
    // docker ps ile container kalmadığını doğrula
  });
});
```

Test dosyasını yaz, `npx vitest run tests/e2e/docker-backend.test.ts` ile çalıştır ve geçtiğini doğrula.

**Kanıt:** `npx vitest run tests/e2e/docker-backend.test.ts` → tüm testler geçiyor (veya Docker yoksa skip)

**Test:** 3+ test (spawn, heartbeat, cleanup)

---

## Task 2: Docker Backend Kullanım Rehberi
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/guide/docker-backend.md
- Scope: docs/

### Description
Docker backend kullanım rehberi oluştur. İçerik:

A) Gereksinimler:
- Docker Engine kurulumu (Ubuntu/macOS/WSL2)
- deckent-worker image build

B) Hızlı Başlangıç:
```bash
# 1. Docker kur
sudo apt install docker.io  # Ubuntu/WSL2
# 2. Worker image build et
docker build -f Dockerfile.worker -t deckent-worker:latest .
# 3. Config ayarla
npx deckent config set spawn_backend docker
# 4. Sprint çalıştır
npx deckent start
```

C) Mimari açıklama:
- Volume mount stratejisi (ro proje, rw .tasks/)
- Auth: ~/.claude/ mount
- Non-root çalışma (--user uid:gid)
- Container lifecycle (spawn → monitor → cleanup)

D) Troubleshooting:
- "dangerously-skip-permissions cannot be used with root" hatası
- "Not logged in" hatası
- Container timeout sorunları

**Kanıt:** `cat docs/guide/docker-backend.md` → kapsamlı rehber mevcut

**Test:** Dosya var ve en az 50 satır
