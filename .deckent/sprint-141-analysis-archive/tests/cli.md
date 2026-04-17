# Test Category Analysis: cli
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 126

## 1. Test Dosya Envanteri

### Alt Dizin Dağılımı
| Alt Dizin | Dosya Sayısı |
|-----------|-------------|
| `tests/cli/` (root) | 30 |
| `tests/cli/commands/` | 63 |
| `tests/cli/helpers/` | 33 |
| **TOPLAM** | **126** |

### Describe / It Blok Sayıları
- **describe:** 708
- **it:** 2.745
- **test:** 0 (hepsi `it()` formatında)

### Root-Level Test Dosyaları (30 adet, tam liste)
```
analyze-coverage.test.ts, archive-debt.test.ts, auto-setup.test.ts,
bin-entry-validation.test.ts, commands.test.ts, config-global.test.ts,
dashboard.test.ts, doctor-profile.test.ts, doctor-ux.test.ts,
error-handler.test.ts, helpers.test.ts, hints.test.ts, i18n-errors.test.ts,
index.test.ts, init-published.test.ts, messages.test.ts, npx-compat.test.ts,
onboard.test.ts, quick-start.test.ts, rich-output.test.ts, run.test.ts,
serve.test.ts, sprint-complete.test.ts, start-sandbox.test.ts, sync.test.ts,
test-run.test.ts, version-enhanced.test.ts, watch.test.ts, web.test.ts, wizard.test.ts
```

### Commands/ Test Dosyaları (63 adet, seçilen örnekler)
```
agent-crud.test.ts, agent-display-fix.test.ts, agent-improvements.test.ts,
agent.test.ts, analyze.test.ts, archive-debt.test.ts, attach-overhaul.test.ts,
attach.test.ts, ci-dashboard.test.ts, cleanup-dryrun.test.ts, cleanup.test.ts,
cli-polish.test.ts, config-export.test.ts, config-nested.test.ts,
config-overhaul.test.ts, config.test.ts, dashboard-overhaul.test.ts,
doctor-json.test.ts, doctor-watch-provider.test.ts, doctor.test.ts,
explain-enhanced.test.ts, explain.test.ts, history-agents.test.ts,
history-overhaul.test.ts, history.test.ts, i18n-integration.test.ts,
init.test.ts, kill-enhanced.test.ts, kill.test.ts,
marketplace-improvements.test.ts, multi-provider-spawn-kill-run.test.ts,
onboard.test.ts, output.test.ts, plan.test.ts, plugin-create.test.ts,
plugin-improvements.test.ts, plugin.test.ts, retro-json.test.ts,
retro-parse-fix.test.ts, retro-rich.test.ts, retro.test.ts,
review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts,
review-finalize-overhaul.test.ts, review.test.ts, run-overhaul.test.ts,
run.test.ts, serve-overhaul.test.ts, skill-crud.test.ts,
skill-improvements.test.ts, skill-marketplace.test.ts, skill.test.ts,
small-commands-improvements.test.ts, spawn-enhanced.test.ts, spawn.test.ts,
start.test.ts, status-agents.test.ts, status-mode.test.ts, status.test.ts,
sync-onboard-upgrade-overhaul.test.ts, sync.test.ts, test-run-overhaul.test.ts,
upgrade.test.ts, watch-overhaul.test.ts
```

### Helpers/ Test Dosyaları (33 adet)
```
agent-performance.test.ts, agent-templates.test.ts, change-categorizer.test.ts,
codex-config.test.ts, config-reader.test.ts, cursor-config.test.ts,
error-handler.test.ts, eta-calculator.test.ts, gemini-config.test.ts,
human-status.test.ts, i18n-coverage.test.ts, messages.test.ts,
output-mode.test.ts, output-skills.test.ts, output-status-overhaul.test.ts,
output.test.ts, progress-persistence.test.ts, progress.test.ts, prompt.test.ts,
queue-display.test.ts, recommendations.test.ts, redact-sensitive.test.ts,
review-actions.test.ts, review-summary.test.ts, selective-retry.test.ts,
splash.test.ts, sprint-comparison.test.ts, sprint-summary-rich.test.ts,
sprint-summary.test.ts, terminal-utils.test.ts, theme.test.ts,
wizard-provider.test.ts, worker-status.test.ts
```

---

## 2. Mock Pattern Audit

### vi.mock / vi.spyOn Kullanımı
- **Toplam vi.mock/vi.spyOn satır sayısı:** 2.782
- Kategorinin en yoğun mock kullanan kategorisi — her test dosyası ortalama 22 mock çağrısı.

### Öne Çıkan Mock Desenler

**`vi.mock('node:fs', ...)`** — Filesystem mock:
- `config-global.test.ts`: readFileSync, existsSync mock'ları
- `commands.test.ts`: kapsamlı fs mock zinciri

**`vi.mock('../../src/core/memory-store.js', ...)`** — MemoryStore mock:
- `commands/doctor.test.ts`: `mockMemoryStore.totalCount.mockReturnValue(50)`
- `commands/cleanup.test.ts`: `vi.fn().mockImplementation(() => mockCleanupMemStore)`
- `commands/archive-debt.test.ts`: DB-first mock implementasyonu
- `helpers/output.test.ts`: `MemoryStore: vi.fn().mockImplementation(() => mockOutputMemStore)`
- `commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts`: tam MemoryStore mock

**`vi.mock('../../src/orchestra/brain.js', ...)`** — Brain mock:
- `commands.test.ts`, `start.test.ts`, `run.test.ts` gibi dosyalarda kapsamlı kullanım

**Pattern:** Tüm CLI testleri `vi.mock()` ile izole edilmiş — gerçek implementasyona hiç bağımlılık yok. Bu doğru yaklaşım.

---

## 3. Coverage Mapping

### src/cli/commands/ → tests/cli/commands/ Eşleşmesi

| Src Dosyası | Test Dosyası | Durum |
|-------------|-------------|-------|
| `agent.ts` | `agent.test.ts` | COVERED |
| `analyze.ts` | `analyze.test.ts` | COVERED |
| `archive-debt.ts` | `archive-debt.test.ts` | COVERED |
| `attach.ts` | `attach.test.ts` | COVERED |
| `checkpoint.ts` | — | **MISSING** |
| `cleanup.ts` | `cleanup.test.ts` | COVERED |
| `config.ts` | `config.test.ts` | COVERED |
| `cost.ts` | — | **MISSING** |
| `dashboard.ts` | `dashboard-overhaul.test.ts` | COVERED (indirekt) |
| `docs.ts` | — | **MISSING** |
| `doctor.ts` | `doctor.test.ts` | COVERED |
| `explain.ts` | `explain.test.ts` | COVERED |
| `finalize.ts` | `review-finalize-overhaul.test.ts` | COVERED (kombine) |
| `heartbeat.ts` | — | **MISSING** |
| `history.ts` | `history.test.ts` | COVERED |
| `init.ts` | `init.test.ts` | COVERED |
| `kill.ts` | `kill.test.ts` | COVERED |
| `memory.ts` | — | **MISSING** |
| `onboard.ts` | `onboard.test.ts` | COVERED |
| `output.ts` | `output.test.ts` | COVERED |
| `plan.ts` | `plan.test.ts` | COVERED |
| `plugin.ts` | `plugin.test.ts` | COVERED |
| `quick-start.ts` | `quick-start.test.ts` | COVERED |
| `recall.ts` | — | **MISSING** |
| `remember.ts` | — | **MISSING** |
| `resume.ts` | — | **MISSING** |
| `retro.ts` | `retro.test.ts` | COVERED |
| `review.ts` | `review.test.ts` | COVERED |
| `run.ts` | `run.test.ts` | COVERED |
| `serve.ts` | `serve.test.ts` | COVERED |
| `set-directives.ts` | — | **MISSING** |
| `skill-marketplace.ts` | `skill-marketplace.test.ts` | COVERED |
| `skill.ts` | `skill.test.ts` | COVERED |
| `spawn.ts` | `spawn.test.ts` | COVERED |
| `start.ts` | `start.test.ts` | COVERED |
| `status.ts` | `status.test.ts` | COVERED |
| `sync.ts` | `sync.test.ts` | COVERED |
| `test-run.ts` | `test-run.test.ts` | COVERED |
| `upgrade.ts` | `upgrade.test.ts` | COVERED |
| `watch.ts` | `watch.test.ts` | COVERED |
| `web.ts` | `web.test.ts` | COVERED |

**Coverage Oranı:** 31/41 komut = **%75.6** (doğrudan eşleşme)

---

## 4. Orphan Test Tespiti

### Src Karşılığı Olmayan Testler
Aşağıdaki test dosyaları kendi başına bir src dosyasıyla doğrudan eşleşmez — bunlar kombine veya regression testlerdir:

- `commands/agent-crud.test.ts` — agent CRUD UI, `agent.ts`'yi test eder
- `commands/agent-display-fix.test.ts` — görsel iyileştirme regression testi
- `commands/agent-improvements.test.ts` — regression
- `commands/attach-overhaul.test.ts` — `attach.ts` overhaul regression
- `commands/cleanup-dryrun.test.ts` — `cleanup.ts` dry-run modu
- `commands/cli-polish.test.ts` — genel CLI polish regression
- `commands/dashboard-overhaul.test.ts` — `dashboard.ts` overhaul
- `commands/history-agents.test.ts` — history + agent entegrasyonu
- `commands/kill-enhanced.test.ts` — `kill.ts` enhanced scenarios
- `commands/marketplace-improvements.test.ts` — marketplace improvements
- `commands/multi-provider-spawn-kill-run.test.ts` — multi-provider senaryoları
- `commands/output.test.ts` — output komut testi (`output.ts`)
- `commands/plugin-create.test.ts` — plugin creation subcommand
- `commands/plugin-improvements.test.ts` — plugin improvements
- `commands/retro-json.test.ts`, `retro-parse-fix.test.ts`, `retro-rich.test.ts` — retro variants
- `commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts` — mega kombine test
- `commands/run-overhaul.test.ts` — `run.ts` overhaul
- `commands/serve-overhaul.test.ts` — `serve.ts` overhaul
- `commands/small-commands-improvements.test.ts` — küçük komut iyileştirmeleri
- `commands/spawn-enhanced.test.ts` — `spawn.ts` enhanced
- `commands/status-agents.test.ts`, `commands/status-mode.test.ts` — status variants
- `commands/sync-onboard-upgrade-overhaul.test.ts` — sync + onboard + upgrade kombine
- `commands/test-run-overhaul.test.ts` — `test-run.ts` overhaul
- `commands/watch-overhaul.test.ts` — `watch.ts` overhaul

**Gerçek Orphan:** Teknik olarak orphan yok — tüm kombine testler bir src dosyasına hizmet eder.

---

## 5. Flaky Candidate İşaretleri

### Tespit Edilen Riskler

| Dosya | Risk Türü | Detay |
|-------|-----------|-------|
| `serve.test.ts` | setTimeout | `setTimeout(r, 10)` — 2 adet gerçek bekleme |
| `helpers/output.test.ts` | Date.now() | Timestamp karşılaştırması (3 yerde) |
| `helpers/progress-persistence.test.ts` | Date.now() | `Date.now() - 15 * 60 * 1000` |
| `helpers/worker-status.test.ts` | Date.now() | `Date.now() - 300000` stale tespiti |
| `commands/agent-display-fix.test.ts` | Date.now() | tmpdir isimde kullanım |
| `commands/skill-crud.test.ts` | Date.now() | tmpdir isimde kullanım |
| `commands/skill-improvements.test.ts` | Date.now() | 3 adet tmpdir oluşturma |
| `commands/cleanup-dryrun.test.ts` | Math.random() | tmpdir rastgele isim |
| `commands/kill-enhanced.test.ts` | Math.random() | tmpdir rastgele isim |

**Yorum:** `Date.now()` tmpdir oluşturma için kullanımlar Flaky değil — sadece unique path için. Gerçek flaky risk: `serve.test.ts` içindeki `setTimeout(r, 10)` bekleme — CI'da yavaş sistemlerde başarısız olabilir.

---

## 6. Memory V2 Mock Uyumu

### countBrainLines Kalıntıları (KRİTİK SORUN)

**countBrainLines utils.ts'den KALDIRILMIŞ** (grep 0 sonuç döndürdü). Ancak aşağıdaki CLI testleri hala import veya mock etmeye çalışıyor:

| Dosya | Tip | Durum |
|-------|-----|-------|
| `tests/cli/commands.test.ts:48` | `vi.mock` mock objede | Stale mock (kaynak silinmiş) |
| `tests/cli/commands.test.ts:117` | `import { countBrainLines }` | **BROKEN IMPORT** |
| `tests/cli/commands.test.ts:234,916` | `vi.mocked(countBrainLines).mockReturnValue()` | Stale usage |
| `tests/cli/sync.test.ts:28` | `vi.mock` içinde countBrainLines | Stale mock |
| `tests/cli/commands/ci-dashboard.test.ts:22` | `vi.mock` içinde countBrainLines | Stale mock |
| `tests/cli/commands/sync.test.ts:23` | `vi.mock` içinde countBrainLines | Stale mock |
| `tests/cli/commands/sync-onboard-upgrade-overhaul.test.ts:25` | `vi.mock` içinde | Stale mock |
| `tests/cli/doctor-profile.test.ts:19` | `vi.mock` içinde | Stale mock |
| `tests/cli/watch.test.ts:18` | `vi.mock` içinde | Stale mock |

**Neden Testler Hala Geçiyor?** `vi.mock('../../src/core/utils.js', () => ({...}))` çağrıları modülü tamamen mock'luyor. Modülde artık `countBrainLines` olmasa bile, mock factory fonksiyonu bu isimde bir property içeriyorsa, Vitest uyarı vermeden geçirir. Bu gerçek bir bug değil — ama stale mock temizliği gerekiyor.

### parseDebtTable / generateDebtTable
- `commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts` — `parseDebtTable` ve `generateDebtTable` import ediliyor ve test ediliyor. **utils.ts'de hala mevcut (exported)** — sorun yok.

### MemoryStore Mocks (DB-First — Doğru)
Aşağıdaki CLI testleri MemoryStore'u doğru şekilde mock'luyor:
- `commands/doctor.test.ts` — `getMemoryEntryCount` via MemoryStore mock ✓
- `commands/cleanup.test.ts` — MemoryStore mock ✓ (`countBrainLines removed` yorumuyla)
- `commands/archive-debt.test.ts` — MemoryStore mock ✓
- `helpers/output.test.ts` — MemoryStore mock ✓ (`countBrainLines removed` yorumuyla)

### Memory V2 CLI Komutları Test Eksikliği
Aşağıdaki Memory V2 CLI komutlarının **hiç test dosyası yok:**
- `src/cli/commands/recall.ts` — **0 test**
- `src/cli/commands/remember.ts` — **0 test**
- `src/cli/commands/memory.ts` — **0 test**

Bu, Sprint 139'da eklenen 3 yeni CLI komutunun test coverage'ının sıfır olduğu anlamına gelir.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 72/100 (**B**)

### Güçlü Yönler
- 126 test dosyası, 2.745 `it()` bloğu — kapsamlı test yoğunluğu
- MemoryStore mock geçişi büyük ölçüde tamamlanmış (doctor, cleanup, archive-debt, output)
- `vi.mock()` izolasyon stratejisi tutarlı uygulanmış
- Overhaul test dosyaları (attach-overhaul, run-overhaul vb.) regression koruması sağlıyor

### Zayıf Yönler / Sprint 142+ Öneriler
1. **P0 — Stale countBrainLines imports:** `commands.test.ts` satır 117'de `import { countBrainLines }` var ama utils.ts'de bu fonksiyon yok. Bu bir broken import — ancak vi.mock hoisting nedeniyle çalışıyor gibi görünüyor. Temizlenmeli.
2. **P0 — Memory V2 CLI Test Eksikliği:** `recall.ts`, `remember.ts`, `memory.ts` için test yazılmalı (3 dosya × ortalama 10 test = 30 test).
3. **P1 — Checkpoint/Docs/Resume/Set-Directives Testleri:** 4 CLI komutu hala testsiz.
4. **P1 — Cost/Heartbeat Testleri:** `cost.ts` ve `heartbeat.ts` için test yok.
5. **P2 — serve.test.ts setTimeout:** CI'da flaky olabilir — `vi.useFakeTimers()` ile stabilize edilmeli.
6. **P2 — Stale mock cleanup:** 8 dosyada `countBrainLines` mock kalıntısı, yanıltıcı ama zararsız.
