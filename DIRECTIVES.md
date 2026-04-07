# DIRECTIVES — Sprint 102: Docker Backend Canlı Test + Betaya Hazırlık Devam

## Durum Özeti (Yeni Oturum İçin)

Sprint 100-101'de yapılanlar:
- ✅ Managed Docs sistemi (CLI + MCP: deckent docs add/remove/list)
- ✅ Decision Trail .deckent/decisions/ taşındı
- ✅ autoApprove: true Deckent standardı (IMMUTABLE)
- ✅ Sprint lock mekanizması (PID-based, stale detection)
- ✅ Result timeout (.timeout marker + synthetic NO_GO)
- ✅ Summary çift sayım fix (CLI + MCP)
- ✅ DockerSpawnBackend implementasyonu (src/orchestra/spawn-backend-docker.ts)
- ✅ MockSpawnBackend + E2E test altyapısı (10 test geçiyor)
- ✅ Dockerfile.worker (node:22-slim + git + claude-code)
- ✅ SpawnBackendFactory: docker → tmux → subprocess fallback chain
- ✅ Dashboard CONFIG_FIELDS güncellendi (worker Sprint 101'de yaptı)
- ✅ Init wizard 15+ alan ile genişletildi (worker Sprint 101'de yaptı)
- ✅ CI tam green (18/18 job)

## Ön Koşullar (WSL2 Docker Setup)

Docker kuruldu (`sudo apt install docker.io`). WSL2 yeniden başlatılması gerekiyor:
1. Windows PowerShell'de: `wsl --shutdown`
2. WSL2'yi tekrar aç
3. `sudo usermod -aG docker $USER` (bir kez yapıldıysa tekrar gerekmez)
4. `docker info` → çalışıyor mu kontrol et
5. `docker build -f Dockerfile.worker -t deckent-worker:latest .` → worker image build et

## Yapılacaklar (Öncelik Sırası)

---

## Task 1: Docker Worker Image Build + Canlı Test
- Model: opus
- Effort: high
- Skills: typescript-expert, docker-expert
- Files: Dockerfile.worker, src/orchestra/spawn-backend-docker.ts
- Scope: ./

### Description
A) Worker image build et:
```bash
docker build -f Dockerfile.worker -t deckent-worker:latest .
```

B) Tek task ile canlı Docker sprint testi:
```bash
# Config'de docker backend seç
npx deckent config set spawn_backend docker

# Basit bir DIRECTIVES ile sprint çalıştır
npx deckent plan --no-confirm
npx deckent start
```

C) Doğrula:
- `docker ps` → deckent-w-* container'ları görünmeli
- `.tasks/*.result` → container'dan result geldi mi
- `.tasks/*.hb` → heartbeat yazılıyor mu
- Container bitince otomatik temizleniyor mu

D) Sorunlar varsa debug et ve düzelt (auth mount, volume permissions, etc.)

**Kanıt:** Docker container'dan .result dosyası başarıyla host'a ulaştı

**Test:** `npx vitest run tests/e2e/` → 0 fail

---

## Task 2: Docker Backend Integration Test (Gerçek Docker ile)
- Model: opus
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: tests/e2e/docker-backend.test.ts
- Scope: tests/e2e/

### Description
Docker mevcut ise gerçek container spawn eden integration test yaz:
```typescript
describe('Docker Backend Integration', () => {
  it.skipIf(!isDockerAvailable())('spawns real container', async () => {
    // docker run hello-world benzeri basit test
  });
});
```

**Test:** Docker varsa test çalışır, yoksa skip

---

## Task 3: E2E Test Suite Genişletme
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/e2e/sprint-lifecycle.test.ts
- Scope: tests/e2e/

### Description
Mevcut E2E testlerine ekle:
- Sprint lock testi (çift start engellemesi)
- RETRO.md doğru yazılıyor mu
- Job output doğru mu
- Cleanup sonrası artifakt kalmıyor mu

---

## Task 4: UX Polish — Init Wizard + Dashboard
- Model: opus
- Effort: high
- Skills: typescript-expert, react-specialist
- Files: src/cli/commands/init.ts, src/dashboard/
- Scope: src/cli/, src/dashboard/

### Description
A) Init wizard Docker backend desteği:
- Docker varsa otomatik `spawn_backend: 'docker'` öner
- `docker build -f Dockerfile.worker -t deckent-worker:latest .` otomatik çalıştır
- Worker image hazır değilse uyar

B) Dashboard sprint live view iyileştirmesi:
- Gerçek zamanlı worker durumu (Docker container status)
- One-click "Start Sprint" butonu

---

## Task 5: Beta Hazırlık — Docs + README Revamp
- Model: opus
- Effort: normal
- Skills: documentation-writer
- Files: README.md, README-TR.md, docs/
- Scope: ./, docs/

### Description
A) README'ye Docker backend bölümü ekle:
```markdown
## Quick Start
npx deckent init
npx deckent plan "Add user authentication"
npx deckent start
```

B) Docker kullanım rehberi (docs/guide/docker-backend.md)

C) Version bump hazırlığı: 0.3.0-beta.3 → 0.4.0-beta.1

---

## Stratejik Hedefler (Betaya Giden Yol)

```
BLOK 1: ✅ Docker Backend kodu yazıldı → Canlı test gerekli (Task 1)
BLOK 2: ✅ E2E test altyapısı hazır → Genişletme gerekli (Task 3)
BLOK 3: ⏳ UX Polish (Task 4)
BLOK 4: ⏳ Beta Launch (Task 5)
```

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- Docker container'dan .result dosyası host'a ulaşmalı
- E2E testler çift sayım olmadığını garanti etmeli
- %100 GO hedefli

## Notlar
- autoApprove: true IMMUTABLE — worker değiştiremez, hiçbir sprint task bunu geri alamaz
- Sprint lock: .deckent/sprint.lock — çift start engellenir
- spawn_backend: 'auto' → Docker varsa Docker, yoksa tmux, yoksa subprocess
- Docker auth: ~/.cache/claude/ mount (session) veya API key env var
