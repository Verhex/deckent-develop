# CLI & MCP Master Audit — Deckent v1.0 Beta Readiness

> ℹ️ **Historical document — closed-repo development period.** This is a
> point-in-time snapshot (2026-03-25). Counts, versions, and metrics reflect
> that moment and are intentionally **not** updated, to preserve accurate
> development history. For the current state see [README](../../README.md),
> [CHANGELOG](../CHANGELOG.md), and the [docs index](../index.md).

**Tarih:** 2026-03-25
**Kapsam:** 32 CLI komutu, 10 MCP tool, 5 MCP resource, 3 provider adapter, multi-provider uyumluluk
**Kaynak:** cli-deep-analysis.md (158 öneri), Sprint 055-057 learnings, Context7 provider docs

---

## Genel Durum Özeti

| Metrik | Değer |
|--------|-------|
| Toplam CLI komutu | 32 (+ alt komutlar) |
| MCP Tools | 10 |
| MCP Resources | 5 |
| Provider Adapter | 3 (Claude, Codex, Gemini) |
| cli-deep-analysis.md önerileri | ~158 |
| Tamamlanan [DONE] | ~38 (Sprint 055: 22, Sprint 056: 8, Sprint 057: 8) |
| Kalan öneri | ~120 |
| NO_GO kalan task | 2 (Task 12: agent/skill/plugin, Task 13: dashboard/attach/watch) |
| Tech debt ile tamamlanan | 4 (doctor, cleanup, run/test/web, sync/onboard/upgrade) |

---

## I. CLI KOMUT HARİTASI — Tamamlanma Durumu

### A. Core Lifecycle (Kalp + Sinir Sistemi)

| Komut | Durum | Sprint | Kalan Sorunlar |
|-------|-------|--------|----------------|
| `init` | GO_WITH_TECH_DEBT | 056 | deepMerge done, .deck security done, provider wizard done, auto-lang done |
| `plan` | GO_WITH_TECH_DEBT | 056 | async usage done, dry-run done, idempotency done, safeguard done |
| `start` | GO_WITH_TECH_DEBT | 056 | wait timeout done, spawn retry done, zero-config done, phase persistence done |
| `status` | DONE | 057 | Standalone, ETA, NO_COLOR, fs.watch, verbose tamamlandı |
| `finalize` | DONE | 057 | Interactive review, guard, duplicate protection tamamlandı |

### B. Worker Management (Motor Sistemi)

| Komut | Durum | Sprint | Kalan Sorunlar |
|-------|-------|--------|----------------|
| `spawn` | DONE | 055 | Rich prompt, status kontrol, --auto-approve done. **Multi-provider spawn hala tmux-only** |
| `kill` | DONE | 055 | Lock temizliği, status update, --all done. **Subprocess worker kill eksik** |
| `attach` | **NO_GO** | 057 | --list flag, nested tmux, sprint ID kontrolü bekliyor |
| `watch` | **NO_GO** | 057 | fs.watch, cleanup temizleme, follow hata mesajı bekliyor |

### C. Results & Review (Değerlendirme Sistemi)

| Komut | Durum | Sprint | Kalan Sorunlar |
|-------|-------|--------|----------------|
| `retro` | DONE | 057 | Dil desteği, trend, agent/skill perf tamamlandı |
| `review` | DONE | 057 | Interactive, retry→respawn, guard, finalize entegrasyonu done |
| `explain` | DONE | 057 | Dil desteği, --sprint flag done |
| `history` | DONE | 057 | --json, --last, agent/skill, dead code cleanup, numeric sort done |

### D. Maintenance & Config (Bakım Sistemi)

| Komut | Durum | Sprint | Kalan Sorunlar |
|-------|-------|--------|----------------|
| `cleanup` | GO_WITH_TECH_DEBT | 057 | Auto decay, combo mode done. **Lock guard + decay truncation tech debt** |
| `doctor` | GO_WITH_TECH_DEBT | 057 | tmux conditional, .deck check done. **Auth kontrolü + hints tech debt** |
| `config` | DONE | 057 | list/keys, autoMigrate, validation, env var done |
| `usage` | DONE | 057 | Real tokens, race condition fix, live usage, filters done |
| `upgrade` | GO_WITH_TECH_DEBT | 057 | Semver iyileştirme done. **Rollback + install strategy tech debt** |

### E. Onboarding (Karşılama Sistemi)

| Komut | Durum | Sprint | Kalan Sorunlar |
|-------|-------|--------|----------------|
| `onboard` | GO_WITH_TECH_DEBT | 057 | **Wizard→init argüman, api mode, detectProjectStack tech debt** |
| `sync` | GO_WITH_TECH_DEBT | 057 | **Gemini/Cursor adapter sync, git date, --json tech debt** |

### F. Agent/Skill/Plugin Ekosistemi (Uzuv Sistemi)

| Komut | Durum | Sprint | Kalan Sorunlar |
|-------|-------|--------|----------------|
| `agent` | **NO_GO** | 057 | stats, trigger validation, systemPrompt, model seçimi bekliyor |
| `skill` | **NO_GO** | 057 | git checksum, version pinning, update, --stats bekliyor |
| `plugin` | **NO_GO** | 057 | remove, update, entrypoint validation, conflict detection bekliyor |
| `skill-marketplace` | **NO_GO** | 057 | Registry cache, semver validation bekliyor |
| `archive-debt` | **NO_GO** | 057 | --dry-run, --before, rotation, parser tutarlılık bekliyor |

### G. Advanced Modes (Gelişmiş Yetenekler)

| Komut | Durum | Sprint | Kalan Sorunlar |
|-------|-------|--------|----------------|
| `run` | GO_WITH_TECH_DEBT | 057 | --timeout, --keep done. **Agent/skill injection, multi-provider tech debt** |
| `test-run` | GO_WITH_TECH_DEBT | 057 | --directives, --sandbox done. **CI format, --model tech debt** |
| `web` | GO_WITH_TECH_DEBT | 057 | MIME type genişletme done. **Build check, --dev proxy tech debt** |
| `serve` | DONE | 057 | Rate limit, body size, deepMerge, auth, versioning done |
| `dashboard` | **NO_GO** | 057 | fs.watch, terminal adapt, agent/skill bilgi, usage metriği bekliyor |
| `analyze` | Bekliyor | — | Duplikasyon, git bağımlılık, cache eksik |
| `quick-start` | Stabil | — | Zero-config wrapper, çalışıyor |

---

## II. MCP TOOL & RESOURCE HARİTASI

### MCP Tools (10 adet)

| Tool | CLI Karşılığı | Durum | Eksikler |
|------|--------------|-------|----------|
| `deckent_init` | `deckent init` | Çalışıyor | MCP üzerinden provider wizard desteği yok |
| `deckent_set_directives` | DIRECTIVES.md yaz | Çalışıyor | Validation (Zod schema) MCP tarafında yok |
| `deckent_plan` | `deckent plan` | Çalışıyor | --structured flag MCP'de yok |
| `deckent_start` | `deckent start` | Çalışıyor (background job) | Zero-config MCP'den çalışmıyor |
| `deckent_status` | `deckent status` | Çalışıyor | --verbose bilgisi eksik |
| `deckent_doctor` | `deckent doctor` | Çalışıyor | --profile MCP'de yok |
| `deckent_retro` | `deckent retro` | Çalışıyor | --trend, --compare MCP'de yok |
| `deckent_history` | `deckent history` | Çalışıyor | --last, --agent filter MCP'de yok |
| `deckent_analyze_project` | `deckent analyze` | Çalışıyor | stack-detector kullanılmıyor |
| `deckent_sync` | `deckent sync` | Çalışıyor | --git-only, --adapters-only MCP'de yok |

### Eksik MCP Tools (CLI'da var, MCP'de yok)

| Eksik Tool | Gerekçe | Öncelik |
|-----------|---------|---------|
| `deckent_config` | Config okuma/yazma MCP üzerinden gerekli | **KRİTİK** |
| `deckent_review` | Sprint sonuçlarını MCP'den değerlendirme | YÜKSEK |
| `deckent_finalize` | Sprint kapatma MCP'den yapılabilmeli | ORTA |
| `deckent_cleanup` | MCP client'lar temizlik tetikleyebilmeli | ORTA |
| `deckent_run` | Tek seferlik task MCP üzerinden çalışabilmeli | YÜKSEK |
| `deckent_kill` | Worker yönetimi MCP'den gerekli | ORTA |
| `deckent_agent` | Agent CRUD MCP üzerinden | DÜŞÜK |
| `deckent_skill` | Skill CRUD MCP üzerinden | DÜŞÜK |
| `deckent_explain` | Sprint açıklaması MCP'den faydalı | DÜŞÜK |

### MCP Resources (5 adet)

| Resource | URI | Durum |
|----------|-----|-------|
| Dashboard | `deckent://dashboard` | Çalışıyor |
| Directives | `deckent://directives` | Çalışıyor |
| Memory | `deckent://memory` | Çalışıyor |
| Debt | `deckent://debt` | Çalışıyor |
| Config | `deckent://config` | Çalışıyor |

### Eksik MCP Resources

| Resource | Gerekçe | Öncelik |
|----------|---------|---------|
| `deckent://retro` | Son retrospektif bilgisi | ORTA |
| `deckent://tasks` | Aktif task listesi | YÜKSEK |
| `deckent://agents` | Agent pool bilgisi | DÜŞÜK |
| `deckent://patterns` | Tespit edilen pattern'ler | DÜŞÜK |

---

## III. MULTI-PROVIDER UYUMLULUK ANALİZİ

### Provider Adapter Durumu

| Provider | Adapter | Spawn | Kill | Usage | Plan | MCP |
|----------|---------|-------|------|-------|------|-----|
| Claude | claude.ts | tmux + subprocess | tmux kill | claude -p /usage | spawnSync | Stabil |
| Codex | codex.ts | subprocess | process.kill | API check | subprocess | Stabil |
| Gemini | gemini.ts | subprocess | process.kill | API check | subprocess | Stabil |

### Komut Bazlı Provider Uyumluluk Matrisi

| Komut | Claude (tmux) | Codex (subprocess) | Gemini (subprocess) | Sorun |
|-------|--------------|--------------------|--------------------|-------|
| `start` | Full | Full | Full | **OK** — task-router mixed sprint destekliyor |
| `plan` | Full | Full | Full | **OK** — provider-aware planner |
| `spawn` | tmux only | **BROKEN** | **BROKEN** | Provider adapter.spawn() kullanılmıyor |
| `kill` | tmux only | **BROKEN** | **BROKEN** | Subprocess kill implementasyonu yok |
| `attach` | tmux only | N/A | N/A | **Subprocess backend'de konsept yok** |
| `watch` | tmux only | **BROKEN** | **BROKEN** | Log file tabanlı alternatif gerekli |
| `run` | tmux only | **BROKEN** | **BROKEN** | Provider adapter kullanılmıyor |
| `status` | Full | Full | Full | **OK** — task file tabanlı |
| `doctor` | tmux required | **FALSE FAIL** | **FALSE FAIL** | tmux check Codex/Gemini'de fail |
| `review` | Full | Full | Full | **OK** — result file tabanlı |
| `serve` | Full | Full | Full | **OK** — HTTP API provider-agnostic |

**KRİTİK: 5 komut (spawn, kill, attach, watch, run) Codex/Gemini ile çalışmıyor.**

### Context7 Provider Entegrasyon Bilgileri

#### OpenAI Codex CLI (Context7: /openai/codex)

**Deckent entegrasyonu için kullanılabilir özellikler:**

1. **AGENTS.md Desteği** — Codex `~/.codex/AGENTS.md` okuyor. Deckent'in `ensureDeckentImport()` Codex AGENTS.md'ye de uygulanmalı.

2. **config.toml Yapısı** — Codex TOML config kullanıyor:
   ```toml
   model = "o4-mini"
   approval_policy = "on-request"  # deckent --auto-approve karşılığı
   sandbox_mode = "workspace-write"  # deckent scope enforcement karşılığı
   ```
   **Eylem:** Deckent config export'una Codex config.toml formatı eklenebilir.

3. **MCP Server Modu** — `codex mcp-server` komutu var. Deckent Codex'i MCP server olarak kullanabilir (subprocess yerine MCP üzerinden iletişim).

4. **Multi-Agent Modu** — `features.multi_agent = true` ile çoklu agent destekliyor. Deckent'in worker spawn'u buna uyarlanabilir.

5. **Sandbox Modu** — `sandbox_mode = "workspace-write"` Deckent'in scope enforcement'ına doğal karşılık.

**Codex Uyumluluk Kontrol Listesi:**
- [ ] `codex --model {model} -p {prompt}` subprocess formatı doğrulanmalı
- [ ] Codex AGENTS.md sync'e dahil edilmeli
- [ ] config.toml export/import desteği
- [ ] MCP bridge modu (codex mcp-server) değerlendirilmeli
- [ ] approval_policy → --auto-approve eşlemesi

#### Google Gemini CLI (Context7: /google-gemini/gemini-cli)

**Deckent entegrasyonu için kullanılabilir özellikler:**

1. **GEMINI.md Context Dosyası** — Gemini `settings.json → context.fileName: ["CONTEXT.md", "GEMINI.md"]` okuyor. Deckent sync'te GEMINI.md güncellenmeli.

2. **Shell Command Tool** — Gemini yerleşik `run_shell_command` aracına sahip:
   ```json
   { "command": "npm test", "dir_path": ".", "is_background": false }
   ```
   **Eylem:** Deckent worker prompt'ları Gemini'nin tool formatına uyarlanabilir.

3. **Tool Allowlist/Blocklist** — Gemini tool erişimini kısıtlayabiliyor:
   ```json
   { "tools": { "core": ["run_shell_command(git)", "run_shell_command(npm)"] } }
   ```
   **Eylem:** Deckent scope enforcement → Gemini tool allowlist dönüşümü.

4. **Model Seçimi** — `gemini -m gemini-2.5-flash` CLI flag'i. Deckent'in model equivalence tablosu kullanılabilir.

5. **JSON Output** — `--output-format json` ve `--output-format stream-json`. Worker result parsing için.

6. **MCP Server Desteği** — `mcpServers` config'i. Deckent MCP server Gemini'ye bağlanabilir.

**Gemini Uyumluluk Kontrol Listesi:**
- [ ] `gemini -p {prompt} -m {model} --output-format json` subprocess formatı
- [ ] GEMINI.md sync güncellenmeli (init'te var, sync'te yok)
- [ ] settings.json context.fileName ayarı otomatik yapılmalı
- [ ] Tool allowlist → scope enforcement mapping
- [ ] Gemini'nin sandbox modu ("docker") değerlendirilmeli

#### Cursor IDE (Context7: /websites/cursor)

**Deckent entegrasyonu için kullanılabilir özellikler:**

1. **MCP Entegrasyonu** — Cursor doğrudan MCP server'ları kullanıyor. Deckent MCP server Cursor'dan erişilebilir:
   ```bash
   # Cursor mcp.json
   { "deckent": { "command": "npx", "args": ["deckent", "mcp"] } }
   ```

2. **Agent CLI Modu** — `agent -p "task description"` komutu. Cursor agent Deckent gibi çalışıyor.

3. **Rules Sistemi** — `.cursor/rules/` dizini Deckent'in `.claude/rules/` ile aynı konsept. Sync'te dahil edilmeli.

4. **MCP Auto-Discovery** — Cursor proje → global → nested config precedence kullanıyor. Deckent MCP server otomatik keşfedilebilir.

**Cursor Uyumluluk Kontrol Listesi:**
- [ ] .cursor/rules/ sync'e dahil edilmeli
- [ ] Cursor mcp.json otomatik konfigürasyon
- [ ] Cursor agent → Deckent worker bridge değerlendirilmeli
- [ ] .cursorignore ile scope enforcement mapping

---

## IV. TUTARSIZLIKLAR VE KRİTİK SORUNLAR

### A. Format Tutarsızlıkları

| # | Sorun | Konum | Çözüm |
|---|-------|-------|-------|
| 1 | Sprint log header yazma vs okuma farklı | sprint-reporter.ts ↔ history.ts | Header formatlarını sabitle: `\| Total Tasks \|` tutarlı |
| 2 | Agent/skill bilgisi sprint log'a yazılmıyor | sprint-reporter.ts writeSprintLog | writeSprintLog'a agent/skill sütunları ekle |
| 3 | DEBT.md parser 2 ayrı implementasyon | archive-debt.ts vs debt-manager.ts | Shared `parseDebtTable()` util oluştur |
| 4 | Retro dil hardcode İngilizce | sprint-reporter.ts | config.language kontrolü (Sprint 057'de başlandı, verify et) |

### B. Dead Code

| # | Dosya | Sorun | Eylem |
|---|-------|-------|-------|
| 1 | history.ts | `loadLearningData()` — `.brain/learning/` hiçbir yerde oluşturulmuyor | SİL |
| 2 | start.ts | `--sandbox-mode` — "not implemented" mesajı | İmplement et veya kaldır |
| 3 | review.ts | `retry` decision — hiçbir zaman respawn tetiklemiyor | Sprint 057'de retry→respawn implemente edildi mi? Verify |

### C. Provider Kırılma Noktaları

| # | Sorun | Etki | Öncelik |
|---|-------|------|---------|
| 1 | `spawn` komutu sadece tmux | Codex/Gemini worker spawn edilemez | **KRİTİK** |
| 2 | `kill` komutu sadece tmux kill-window | Subprocess worker öldürülemez | **KRİTİK** |
| 3 | `doctor` tmux required=true | Codex-only kurulumda FAIL | **YÜKSEK** |
| 4 | `run` komutu sadece tmux | Codex/Gemini ile run çalışmaz | **YÜKSEK** |
| 5 | `watch` sadece tmux split pane | Subprocess log görüntülemesi yok | ORTA |
| 6 | `attach` tmux session assumption | Subprocess'te konsept yok | ORTA |

### D. Güvenlik Eksikleri

| # | Sorun | Konum | Öncelik |
|---|-------|-------|---------|
| 1 | `.deck` dosyası .gitignore kontrolü | init.ts → doctor.ts'te çağrılmıyor | **KRİTİK** — API key sızıntısı |
| 2 | Body size limit (serve) | server.ts parseBody | Sprint 057'de çözüldü (verify) |
| 3 | Rate limiting (serve) | server.ts | Sprint 057'de çözüldü (verify) |
| 4 | Skill install checksum yok | skill.ts git install | YÜKSEK — supply chain riski |
| 5 | Plugin entrypoint validation | plugin.ts install | ORTA |

### E. Performans Sorunları

| # | Sorun | Konum | Çözüm |
|---|-------|-------|-------|
| 1 | Provider bootstrap her start'ta (5-15s) | start.ts → bootstrapProviders | Cache result in .deckent/provider-cache.json |
| 2 | Analyzer her çağrıda git çalıştırır | analyzer.ts | stack-detector gibi cache ekle |
| 3 | *(Sprint 089'da kaldır��ldı — kullanım takibi)* | — | — |
| 4 | setInterval polling (dashboard, status, run) | Çeşitli | fs.watch'a geçiş (Sprint 057'de status'ta yapıldı) |

---

## V. EKSİK KOMUTLAR VE YENİ ÖZELLİKLER

### Eklenmesi Gereken Yeni CLI Komutları

| Komut | Açıklama | Gerekçe | Öncelik |
|-------|----------|---------|---------|
| `deckent provider` | Provider yönetimi (list, test, switch) | Multi-provider kullanıcı deneyimi | **YÜKSEK** |
| `deckent logs` | Worker log görüntüleme (provider-agnostic) | attach/watch tmux bağımlılığının çözümü | **YÜKSEK** |
| `deckent diff` | Sprint öncesi/sonrası code diff | Review + finalize kalitesi | ORTA |
| `deckent rollback` | Manuel rollback (safety point) | start.ts'teki otomatik rollback'in CLI karşılığı | ORTA |
| `deckent env` | Ortam bilgisi (provider, tools, versions) | doctor'dan bağımsız hızlı bilgi | DÜŞÜK |
| `deckent export` | Sprint/config export (JSON, TOML, YAML) | Multi-tool interop | DÜŞÜK |
| `deckent import` | Dış kaynaklardan config/task import | Migration senaryoları | DÜŞÜK |
| `deckent benchmark` | Provider/model performans karşılaştırma | Model seçim optimizasyonu | DÜŞÜK |

### Eklenmesi Gereken MCP Tools

| Tool | Açıklama | Gerekçe |
|------|----------|---------|
| `deckent_config` | Config okuma/yazma | IDE entegrasyonu için temel |
| `deckent_review` | Sprint review | Otomatik/interaktif review |
| `deckent_run` | Tek seferlik task | MCP üzerinden hızlı task çalıştırma |
| `deckent_kill` | Worker durdurma | Acil müdahale |
| `deckent_cleanup` | Temizlik | Sprint arası temizlik |

### Eklenmesi Gereken MCP Resources

| Resource | URI | Açıklama |
|----------|-----|----------|
| `deckent://tasks` | Aktif task listesi | Dashboard alternatifi |
| `deckent://retro` | Son retrospektif | Sprint bilgisi |
| `deckent://patterns` | Pattern bilgisi | Code quality |

---

## VI. PROVIDER-SPECIFIC ENTEGRASYON PLANI

### A. Codex CLI Entegrasyon Detayları

**Mevcut Durum:** codex.ts adapter subprocess spawn yapıyor.

**Gerekli İyileştirmeler:**

1. **AGENTS.md Sync:**
   ```typescript
   // sync.ts'e ekle
   ensureDeckentImport(join(root, 'AGENTS.md'));  // mevcut
   // YENİ: Codex'in okuduğu dosyayı da sync et
   if (existsSync(join(homeDir, '.codex', 'AGENTS.md'))) {
     ensureDeckentImport(join(homeDir, '.codex', 'AGENTS.md'));
   }
   ```

2. **Config Bridge:**
   - Deckent config → Codex config.toml dönüşümü
   - `approval_policy` ↔ `--auto-approve` eşlemesi
   - `sandbox_mode` ↔ `scope.directories` eşlemesi

3. **MCP Bridge Modu:**
   - Codex `mcp-server` komutu ile Deckent MCP client olarak bağlanabilir
   - Subprocess yerine MCP üzerinden daha güvenli iletişim
   - `codex mcp-server` → Deckent ProviderAdapter.spawn() MCP client

4. **Worker Prompt Uyumluluk:**
   ```
   Codex prompt formatı: stdin pipe + model flag
   codex -m o4-mini -p "task prompt" --approval-policy on-request
   ```

### B. Gemini CLI Entegrasyon Detayları

**Mevcut Durum:** gemini.ts adapter subprocess spawn yapıyor.

**Gerekli İyileştirmeler:**

1. **GEMINI.md Sync:**
   ```typescript
   // sync.ts'e ekle
   syncGeminiContext(root);  // YENİ
   // GEMINI.md'nin context.fileName'de olduğundan emin ol
   ```

2. **Settings Bridge:**
   - Deckent config → Gemini settings.json dönüşümü
   - `context.fileName` otomatik ayar
   - `tools.core` allowlist → scope enforcement

3. **Tool Restriction Mapping:**
   ```json
   // Deckent scope → Gemini tool restriction
   {
     "tools": {
       "core": ["run_shell_command(npm)", "run_shell_command(git)", "run_shell_command(tsc)"],
       "exclude": ["run_shell_command(rm)"]
     }
   }
   ```

4. **JSON Output Parse:**
   ```
   gemini -p "task" -m gemini-2.5-flash --output-format json
   → Result JSON parse → TaskResult dönüşümü
   ```

5. **Sandbox Docker Modu:**
   - Gemini `"sandbox": "docker"` desteği var
   - Deckent `--sandbox-mode` bu özelliği kullanabilir

### C. Cursor IDE Entegrasyon Detayları

**Mevcut Durum:** init.ts .cursor/rules/ oluşturuyor ama sync etmiyor.

**Gerekli İyileştirmeler:**

1. **Rules Sync:**
   ```typescript
   // sync.ts'e ekle
   syncCursorRules(root);  // YENİ
   // .cursor/rules/ dizinini .claude/rules/ ile senkronize tut
   ```

2. **MCP Auto-Config:**
   ```json
   // .cursor/mcp.json otomatik oluştur
   {
     "mcpServers": {
       "deckent": {
         "command": "npx",
         "args": ["deckent", "mcp"]
       }
     }
   }
   ```

3. **Agent Mode Bridge:**
   - Cursor `agent -p "task"` komutu Deckent'in `run` komutuna benziyor
   - Cursor agent → Deckent task dönüşümü mümkün

---

## VII. KOMUT DETAY ANALİZLERİ — KRİTİK DÜZELTMELER

### 1. `spawn` — Multi-Provider Fix (KRİTİK)

**Sorun:** `spawn.ts` sadece `tmux.spawnWorker()` çağırıyor.

**Çözüm:**
```typescript
// spawn.ts — provider-aware spawn
const provider = resolveProvider(task.provider ?? config.worker_provider);
if (provider.name === 'claude' && backendMode === 'tmux') {
  await tmux.spawnWorker(taskId, model, prompt, root, opts);
} else {
  provider.spawn(taskId, model, prompt, { root, autoApprove: opts.autoApprove });
}
```

**Etki:** Codex/Gemini worker'ları CLI'dan spawn edilebilir.

### 2. `kill` — Multi-Provider Fix (KRİTİK)

**Sorun:** `kill.ts` sadece `tmux.killWorker()` çağırıyor.

**Çözüm:**
```typescript
// kill.ts — provider-aware kill
const provider = resolveProviderForTask(task);
provider.kill(taskId);
// + lock cleanup (zaten var)
// + task status update (zaten var)
```

### 3. `doctor` — tmux Conditional (YÜKSEK)

**Sorun:** tmux `required: true` her zaman. Codex/Gemini kullanıcıları false fail alıyor.

**Çözüm:**
```typescript
// doctor.ts — provider-aware tmux check
const isTmuxNeeded = config.worker_provider === 'claude' || !config.worker_provider;
checks.push({
  name: 'tmux',
  required: isTmuxNeeded,  // sadece Claude provider'da required
  ...
});
```

### 4. `run` — Multi-Provider + Agent/Skill Injection (YÜKSEK)

**Sorun:** tmux-only + agent/skill context inject edilmiyor.

**Çözüm:**
```typescript
// run.ts — full provider support
const agent = await resolveAgentPrompt(task, root);
const skills = await resolveSkillPrompts(task, root);
const prompt = buildWorkerPrompt(task, { agentPrompt: agent, skillPrompts: skills });

const provider = resolveProvider(model);
provider.spawn(taskId, model, prompt, { root, autoApprove: opts.autoApprove });
```

### 5. `watch` — Provider-Agnostic Log Viewer (ORTA)

**Sorun:** tmux split pane sadece Claude worker'ları gösterir.

**Çözüm:**
```typescript
// Yeni: log-based watch (provider-agnostic)
// .tasks/task-{id}.log dosyasını tail -f mantığıyla izle
// Tüm provider'lar log yazıyor (pipe-pane veya subprocess stdout redirect)
function watchTaskLog(taskId: string, root: string) {
  const logPath = join(root, '.tasks', `task-${taskId}.log`);
  const watcher = watch(logPath, () => { /* render new content */ });
}
```

---

## VIII. SYNC KOMUTUnda ADAPTER EKSİKLERİ

### Mevcut Sync Kapsamı

| Adapter | init'te oluşturuluyor | sync'te güncelleniyor |
|---------|---------------------|-----------------------|
| CLAUDE.md | Evet | **Evet** |
| AGENTS.md | Evet | **Evet** |
| GEMINI.md | Evet | **HAYIR** — Eksik |
| .cursor/rules/ | Evet | **HAYIR** — Eksik |
| .codex/AGENTS.md | Hayır | **HAYIR** — Yeni gerekli |
| Codex config.toml | Hayır | **HAYIR** — Yeni gerekli |
| Gemini settings.json | Hayır | **HAYIR** — Yeni gerekli |

### Gerekli Sync Genişlemesi

```
sync --adapters-only akışı (genişletilmiş):
1. ensureDeckentImport(CLAUDE.md)       ← mevcut
2. ensureDeckentImport(AGENTS.md)       ← mevcut
3. syncGeminiContext(root)              ← YENİ
4. syncCursorRules(root)               ← YENİ
5. syncCodexAgents(root)               ← YENİ (opsiyonel)
```

---

## IX. TEST COVERAGE DURUMU

### Mevcut Test Dosyaları

| Komut | Test Dosyası | Yeni Overhaul Test | Durum |
|-------|-------------|-------------------|-------|
| status | status.test.ts | status-agents.test.ts + output-status-overhaul.test.ts | Var |
| doctor | doctor.test.ts | — | Sprint 057 GO_WITH_TECH_DEBT |
| retro | retro.test.ts | — | Sprint 057 DONE |
| cleanup | cleanup.test.ts | — | Sprint 057 GO_WITH_TECH_DEBT |
| usage | usage.test.ts | — | Sprint 057 DONE |
| history | history.test.ts | history-overhaul.test.ts | Var |
| config | config.test.ts + config-overhaul.test.ts | — | Sprint 057 DONE |
| review | review.test.ts | review-finalize-overhaul.test.ts | Var |
| serve | server.test.ts | server-security.test.ts | Var |
| run | — | run-overhaul.test.ts | Var |
| test-run | — | test-run-overhaul.test.ts | Var |
| sync | sync.test.ts | sync-onboard-upgrade-overhaul.test.ts | Var |
| agent | — | agent-improvements.test.ts | **NO_GO** |
| skill | — | skill-improvements.test.ts | **NO_GO** |
| plugin | — | plugin-improvements.test.ts | **NO_GO** |
| marketplace | — | marketplace-improvements.test.ts | **NO_GO** |
| dashboard | — | dashboard-overhaul.test.ts | **NO_GO** |
| attach | — | attach-overhaul.test.ts | **NO_GO** |
| watch | — | watch-overhaul.test.ts | **NO_GO** |
| analyzer | — | analyzer-overhaul.test.ts | **NO_GO** |

---

## X. ÖNCELİKLENDİRİLMİŞ EYLEM PLANI

### Tier 1: Beta Blocker (Mutlaka Çözülmeli)

| # | Eylem | Dosyalar | Gerekçe |
|---|-------|---------|---------|
| 1 | Multi-provider spawn/kill/run | spawn.ts, kill.ts, run.ts | 3 provider destekleniyormuş gibi görünüyor ama 5 komut sadece tmux |
| 2 | agent+skill+plugin tamamlama | agent.ts, skill.ts, plugin.ts | NO_GO — ekosistem yönetimi beta'da çalışmalı |
| 3 | .deck güvenlik kontrolü | doctor.ts, init.ts | API key sızıntısı riski |
| 4 | MCP config tool ekleme | mcp/tools/config.ts | IDE entegrasyonu temel gereksinim |

### Tier 2: Yüksek Kalite (Beta Kalitesi)

| # | Eylem | Dosyalar | Gerekçe |
|---|-------|---------|---------|
| 5 | dashboard+watch tamamlama | dashboard.ts, watch.ts | NO_GO — kullanıcı izleme deneyimi |
| 6 | sync genişleme (Gemini/Cursor) | sync.ts | Multi-provider söylüyoruz ama sync etmiyoruz |
| 7 | MCP tool genişleme (+6 tool) | mcp/tools/ | CLI-MCP paritesi |
| 8 | Format tutarlılığı | sprint-reporter.ts, history.ts | Parse↔write uyumsuzlukları |

### Tier 3: Cilalanma (GA Kalitesi)

| # | Eylem | Dosyalar | Gerekçe |
|---|-------|---------|---------|
| 9 | `deckent provider` komutu | provider.ts (yeni) | Provider yönetim UX |
| 10 | `deckent logs` komutu | logs.ts (yeni) | Provider-agnostic log viewer |
| 11 | MCP resource genişleme (+4) | mcp/resources/ | Zengin IDE deneyimi |
| 12 | Config bridge (Codex/Gemini) | config-bridge.ts (yeni) | Cross-tool interop |
| 13 | Skill checksum/version pinning | skill.ts | Supply chain güvenliği |

### Tier 4: İleri Seviye (Post-GA)

| # | Eylem | Dosyalar | Gerekçe |
|---|-------|---------|---------|
| 14 | MCP bridge modu (Codex↔Deckent) | mcp-bridge.ts (yeni) | Codex MCP server üzerinden iletişim |
| 15 | Gemini Docker sandbox | sandbox.ts | Gerçek sandbox modu |
| 16 | `deckent benchmark` | benchmark.ts (yeni) | Provider/model karşılaştırma |
| 17 | `deckent export/import` | export.ts, import.ts (yeni) | TOML/YAML interop |

---

## XI. DOĞRU ÇALIŞMA PRENSİPLERİ — HER KOMUT İÇİN

### Evrensel Prensipler (Tüm Komutlar)

1. **Provider-Agnostic Tasarım:** Her komut `ProviderAdapter` interface'i üzerinden çalışmalı, direkt tmux çağrısı yapmamalı.
2. **Graceful Degradation:** Provider mevcut değilse anlamlı hata mesajı, sessiz fail değil.
3. **NO_COLOR Desteği:** `process.env.NO_COLOR` veya `--no-color` ile ANSI kodları kapatılabilmeli.
4. **--json Flag:** Tüm komutlarda programmatic çıktı desteği.
5. **i18n:** `getMessage()` veya config.language ile dil desteği.
6. **Error Registry:** Tutarlı hata kodları (E001-E099 formatı).
7. **Debug Logging:** `debugLog()` ile `DECKENT_DEBUG=1` ortamında detaylı log.

### Komut-Spesifik Prensipler

| Komut | Doğru Çalışma Prensibi |
|-------|----------------------|
| `init` | İdempotent: tekrar çalıştırma mevcut config'i bozmaz, eksik dosyaları doldurur |
| `plan` | Deterministic: aynı DIRECTIVES + context = aynı task seti (structured modda) |
| `start` | Resilient: crash sonrası kaldığı yerden devam (phase persistence) |
| `status` | Real-time: fs.watch ile anlık güncelleme, .dashboard + task file hybrid |
| `doctor` | Context-aware: provider config'e göre gereksinimleri ayarla |
| `cleanup` | Safe: aktif worker/lock'ları koru, sadece stale olanları temizle |
| `spawn` | Provider-routed: task.provider'a göre tmux/subprocess/MCP seç |
| `kill` | Complete: worker öldür + lock temizle + task status güncelle + log kapat |
| `review` | Actionable: retry decision → respawn, rejected → finalize'da NO_GO |
| `finalize` | Guarded: EXECUTING task varsa reddet, duplicate koruması, idempotent |
| `serve` | Secure: rate limit + body size + auth + CORS + input validation |
| `run` | Self-contained: agent/skill inject + provider-aware + configurable timeout |
| `sync` | Complete: tüm adapter dosyaları (Claude, Codex, Gemini, Cursor) senkronize |
| `agent/skill` | Lifecycle: create→configure→test→deploy→monitor→update→delete |
| `plugin` | Validated: entrypoint check + conflict detection + rollback on install failure |

---

## XII. SONUÇ

### Beta Readiness Skoru

| Kategori | Skor | Detay |
|----------|------|-------|
| Core Lifecycle (init/plan/start/status/finalize) | **85%** | Çalışıyor, tech debt var |
| Worker Management (spawn/kill/attach/watch) | **45%** | Multi-provider broken |
| Review & Retro (retro/review/explain/history) | **90%** | İyi durumda |
| Config & Maintenance (config/doctor/cleanup/usage) | **80%** | Tech debt var |
| Ecosystem (agent/skill/plugin/marketplace) | **35%** | NO_GO — ciddi eksikler |
| Advanced (run/test/serve/web/dashboard) | **65%** | Serve iyi, diğerleri tech debt |
| MCP Integration | **60%** | 10 tool var, 6+ eksik |
| Multi-Provider | **50%** | Adapter'lar var, CLI komutları kısmen uyumlu |
| **GENEL** | **64%** | Beta'ya çıkabilir ama multi-provider + ecosystem ciddi eksik |

### Kritik Mesaj

Deckent'in kalbi (orchestration cycle: plan→spawn→execute→evaluate→retro) sağlam çalışıyor. Ancak:

1. **Multi-provider vaadi kırık**: 3 provider adapter yazılmış ama 5 CLI komutu sadece tmux. Kullanıcı Codex/Gemini seçtiğinde spawn/kill/run/watch çalışmaz.

2. **Ekosistem yönetimi eksik**: agent/skill/plugin komutları NO_GO. Kullanıcı custom agent oluşturamaz, skill install edemez.

3. **MCP-CLI paritesi düşük**: 32 CLI komutu var, 10'u MCP'de. IDE kullanıcıları (Cursor, VS Code) sınırlı deneyim yaşar.

4. **Sync kapsamı dar**: Multi-provider destekleniyormuş gibi görünüyor ama sync sadece CLAUDE.md ve AGENTS.md. GEMINI.md ve .cursor/rules sync dışı.

Bu 4 alanı çözmek Deckent'i OpenHands/CoWork seviyesinde enterprise-grade yapacaktır.
