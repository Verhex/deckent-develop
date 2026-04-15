# Sprint 140 Acil Durum Değerlendirmesi

**Tarih:** 2026-04-15 (post-kill)
**Sprint:** sprint-140 — "Deckent Self-Analysis Ayna Sprint"
**Durum:** **CATASTROPHIC FAILURE — MANUAL KILL + $42 USD COST EXPLOSION**
**Koordinatör:** Claude Opus 4.6 (CC)
**Karar:** Sprint 140 devam phase'leri (manuel finalize, scorecard, ceremony, Sprint 141 auto-transition) **İPTAL EDİLDİ**. Acil durum değerlendirmesi yapılıyor.

---

## 1. Finansal Zarar — Kırmızı Çizgi

| Metrik | Değer |
|--------|-------|
| **Actual cost (Alperen bildirimi)** | **$42 USD** (14 dakika) |
| Subscription tier | Max (extra usage fazlası) |
| Worker spawn sayısı | 197 |
| Başarılı worker | 0 |
| Analysis rapor yazılan | 0 |
| **Deadweight ratio** | **%100** |
| **$/dakika** | **$3.00/dk** |
| **$/worker** | **$0.21/worker** |
| API key equivalent (tahmini) | $15-30 single sprint |
| Worst case 12h cap | $150-300 single sprint |
| Aylık 30 sprint worst case | **$4500-9000/ay** API user için |

**Kırmızı çizgi:** Bu rakam **Deckent'i ticari olarak kullanılmaz hale getirir**. API kullanıcılar için varoluşsal tehdit. Sprint 141 öncesi çözülmeden Deckent tekrar çalıştırılamaz.

---

## 2. Root Cause — 5 Kritik Katman

Sprint 140 14 dakikada 197 worker × ortalama 2700 input token = 534K input token yakıldı. Hepsi 429 Rate Limit ile reject edildi, hiçbir output yok. Root cause 5 katman:

### Katman 1: No Rate Limit Backoff (P0)

**Worker entrypoint script (`.worker-140-XXX.sh`):**
```sh
timeout 1200 claude -p - --model sonnet --allowedTools "..." < prompt.txt || echo "WORKER_TIMEOUT" > timeout
```

Claude CLI 429 aldığında anında exit. Script retry logic yok, exponential backoff yok. Trap EXIT fallback "Docker worker exited without writing result file" NO_GO yazıyor (yanıltıcı mesaj, 429 değil "exited" diyor).

**Sonuç:** Her worker 429 → 1 saniye içinde fail → trap → Brain yeni worker spawn → tekrar 429 → loop.

### Katman 2: No Circuit Breaker (P0)

Brain N consecutive NO_GO gördüğünde **durmuyor**. Sprint 140'ta 197 worker ardışık NO_GO oldu, Brain hiçbir pause yapmadı, hız sabit ~12 worker/dakika.

**Eksik:** `src/orchestra/result-collector.ts` veya `src/orchestra/result-evaluator.ts` içinde "consecutive NO_GO count" tracker yok.

### Katman 3: No Cost Guard (P0)

`src/core/token-counter.ts` mevcut ama **pre-spawn budget check yapmıyor**. `.deckent/config.json` içinde `sprint_max_cost_usd` config key yok. Sprint planning dry-run cost estimate göstermiyor.

**Eksik:**
- `memory_budget` var ama **cost_budget** yok
- Pre-sprint estimation: 409 task × ~2700 token avg × $3/1M = **~$3.30 Sonnet only** (naive tahmin — retry ve cascade hariç)
- Sprint execute real-time cost tracker yok

### Katman 4: No 429 Differentiation (P0)

Worker trap fallback'ı generic. Claude CLI'nin error code/body fark etmiyor:
- 429 Rate Limited → aynı mesaj
- Prompt too long → aynı mesaj
- Auth error → aynı mesaj
- Network error → aynı mesaj

Hepsi "Docker worker exited without writing result file" oluyor. Brain bu mesajı gördüğünde "transient failure, retry" yorumluyor → cascade loop.

**Eksik:** Event stream'de `WORKER→BRAIN:RATE_LIMITED` kanal yok (ADR-035 V1.0'da RATE_LIMITED kanal tanımlı değil, sadece VERIFICATION_RESULT + SCOPE_COLLISION + GATE_COMPUTED vs.)

### Katman 5: No Prompt Cache (HIGH — secondary)

Her worker **%80 aynı boilerplate** gönderiyor:
- Agent system prompt (~2500 bytes)
- Skills content (~900 bytes)
- ADR excerpt (~3500 bytes)
- Worker instructions (~2100 bytes)
- Task-specific content (~1800 bytes, sadece %17)

Sprint 140'ta 197 worker × ~9000 byte duplicate = **1.77 MB tekrar eden content**. Claude Sonnet prompt caching kullanılmıyor (her worker yeni session, cache miss).

**Eksik:**
- `src/orchestra/task-builder.ts` içinde prompt caching entegrasyonu yok
- Anthropic cache_control headers kullanılmıyor
- Deckent `src/orchestra/prompt-token-optimizer.ts` var ama cost-first optimization değil, token-first

---

## 3. Sprint 140 Kanıt (Forensic Disk)

### 3.1 Worker Prompt Analizi

**Sample:** `.prompt-140-001-b339fd4eac11ea74.txt` (10824 bytes / 222 lines / ~2700 tokens)

| Section | Lines | Bytes | % |
|---------|-------|-------|---|
| Agent content (code-reviewer) | 1-39 | ~2500 | 23% |
| Skills (typescript-expert) | 41-55 | ~900 | 8% |
| **ADR excerpt (DECISIONS.md)** | 56-125 | **~3500** | **32%** |
| Task description | 126-162 | ~1800 | 17% |
| Worker boilerplate | 163-223 | ~2100 | 20% |

**%80 duplication across 197 workers.**

### 3.2 Container Canlı Test (Kanıt)

```bash
$ docker exec deckent-w-140-142 sh -c 'echo "hello" | claude -p - --model sonnet'
API Error: Request rejected (429) · Rate limited
```

Minimal prompt bile 429 alıyor. Sprint 140 ilk dakikadan itibaren API limitine çarpmış.

### 3.3 Event Stream Durumu

- **events.jsonl 53 event yazıldı** (plan-time ve ilk spawn)
- 47 event plan-time SCOPE_COLLISION_DETECTED (Sprint 138 Task 4 meta-dogfood)
- 6 event task assign + heartbeat (Task 140-001..003)
- **Execute phase'de event emit sıfır** — worker'lar hook'a ulaşamadan 429 aldı

### 3.4 Worker Self-Assessment Distribution

| Self-assessment | Count |
|-----------------|-------|
| NO_GO | **197** |
| DONE | 0 |
| GO_WITH_TECH_DEBT | 0 |

**197/197 NO_GO** — %100 cascade, 0 kurtarılmış.

### 3.5 Disk Final State

| Artifact | Count |
|----------|-------|
| Task JSON (planned) | 409 |
| Result files | 197 |
| Prompt files | 197 |
| Worker scripts | 32 (cleanup edilmiş) |
| **Analysis sink files** | **0** (Sprint 140 hedef sıfır katkı) |

---

## 4. Koordinatör Response Time Failure

**Timeline:**

| Zaman | Olay |
|-------|------|
| 12:13:56 | Sprint 140 start (`deckent_start`) |
| 12:16:04 | PLAN phase done, 409 task JSON canlı, SCOPE_COLLISION_DETECTED event'leri |
| 12:16:05 | İlk worker spawn (w-140-001) |
| 12:17:48 | t+4dk: 22 NO_GO, koordinatör ilk pattern tespit |
| 12:18:55 | Stale alert w-140-039 |
| 12:20:33 | t+7dk: 81 NO_GO, cascade confirmed |
| 12:25:01 | t+12dk: 151 NO_GO, root cause tespit (429 container test) |
| ~15:25 | Alperen "kesin komut anında tamamı kill" direktifi (t+~12dk sonra) |
| 15:26:24 | `deckent_kill --all` → 3 worker killed (but Brain MCP server PID 880995 CANLI) |
| 15:27:00 | Yeni spawn DEVAM ediyor (w-140-176..197 spawn edildi kill SONRASI) |
| ~15:28 | Alperen "hemen kill .prompt üremeye devam ediyor" direktifi |
| 15:28:30 | CC Brain PID 880995 identify + kill -9 |
| 15:28:35 | MCP server disconnect + docker force rm |
| 15:29:00 | Worker 197'de durdu (Alperen confirm) |

**Response time analizi:**

- **Alperen ilk kill talebi → worker spawn stop:** ~4 dakika
- **Bu 4 dakikada eklenen worker sayısı:** ~50 worker (176..225 arası, 197'de durdu)
- **Ek cost:** ~$10 USD (50 worker × $0.21)
- **Coordinator error:** `deckent_kill` MCP tool sadece worker'ları öldürdü, Brain MCP server process'ini öldürmedi. Brain spawn loop devam etti. CC bunu geç fark etti.

**Ders:** "Sprint kill" tek atomik işlem değil — kill chain gerekli:
1. `deckent_kill --all` → workers
2. Brain MCP server PID kill → spawn loop durur
3. Docker force rm → containers
4. Prompt file growth verification → yeni spawn sıfır

---

## 5. Acil Durum Planı — Sprint 141 Rewrite

Sprint 141 preflight'ta mevcut 18 task planı **geçersiz**. Yeni plan:

### Sprint 141 Tema (REVIZED): "COST GUARD + Kill Chain + Operasyonel Disiplin"

**Öncelik Sırası (hiçbiri atlanamaz):**

### P0-CRITICAL (COST GUARD KATMANI — 6 task, MUTLAK)

**Task 141-001: Worker 429 Detection + Exponential Backoff**
- Worker entrypoint script: Claude CLI exit code 429 için retry
- Backoff: 5s, 30s, 120s, 600s (4 attempt max)
- `WORKER→BRAIN:RATE_LIMITED` event stream kanal ekle
- Trap differentiation: 429 vs timeout vs auth error vs network
- Scope: `src/orchestra/spawn-backend-docker.ts`, `src/agents/worker.ts`, event-stream.ts kanal ekle

**Task 141-002: Brain Circuit Breaker (Cascade Detection)**
- `src/orchestra/result-evaluator.ts` veya yeni `src/orchestra/cascade-detector.ts`
- 5 consecutive NO_GO → Sprint pause + alert
- 3 consecutive RATE_LIMITED event → Sprint halt
- Auto-resume: 10 dk cooldown
- CLI: `deckent resume` ile sprint kaldığı yerden devam

**Task 141-003: Sprint Cost Budget Cap (Hard Limit)**
- Config: `sprint_max_cost_usd: 5` default, `sprint_max_input_tokens: 1_000_000`
- `src/core/token-counter.ts` genişlet: cumulative sprint cost tracker
- Pre-task budget check → exceeded → Sprint halt graceful
- CLI `deckent plan --dry-run` output'a "Estimated cost: $X" ekle
- Live `deckent status` → running cost USD

**Task 141-004: Kill Chain Atomic (Brain + Workers + Containers)**
- `src/mcp/tools/kill.ts` ve `src/cli/commands/kill.ts` tek komutla:
  1. Workers kill (mevcut)
  2. Brain MCP server PID kill (YENİ — sprint-runner PID tracker gerekir)
  3. Docker force rm all sprint containers (YENİ)
  4. Verification loop: yeni spawn sıfır mı
- `deckent_kill --all --force-brain` flag
- Sprint 140 incident lesson: tek kill komutu ile Brain spawn loop durur

**Task 141-005: Pre-Sprint Cost Estimation + Confirmation**
- `deckent plan --dry-run` output zenginleştir:
  - Total task count
  - Estimated total input tokens
  - Estimated cost (model pricing × token count)
  - Warning thresholds: >$5 sarı, >$20 kırmızı, >$50 block
- `deckent start` öncesi confirmation prompt: "Estimated cost: $X. Proceed? (yes/no)"
- Config: `auto_confirm_below_usd: 2` (default)

**Task 141-006: Prompt Size Minimization + Anthropic Cache Integration**
- Worker prompt yeniden yapılandır:
  - Agent content → Anthropic cache_control ephemeral
  - Skills content → cache_control
  - ADR excerpt → **sadece task'a ilgili ADR'ler** (full file değil)
  - Boilerplate instructions → cache_control
- Target: Worker prompt %80 cache hit rate
- `src/orchestra/task-builder.ts` + `src/orchestra/prompt-token-optimizer.ts` genişlet
- Cost hedef: Sprint 140 benzeri workload $42 → **~$3-5** (10x iyileştirme)

### P0-CRITICAL (YAPISAL — 3 task, Sprint 140 öncesi zaten planlı)

**Task 141-007: MCP Disconnect Fix** (orijinal Sprint 140 Task 1 = Sprint 141 Task 7)
- Background sprint-runner-entry.ts detached spawn
- Brain MCP server event loop izolasyonu

**Task 141-008: Layer 4 Runtime Wire Deploy**
- 4-sprint fail streak kır (gate.json + metrics.jsonl + load-report)

**Task 141-009: Task File Restoration Mechanism**
- Git-snapshot journal + `.tasks/backup/`
- Sprint 139 Task 3 catastrophic regression lesson

### HIGH (Sprint 139 debt + Sprint 140 lessons — 6 task)

**Task 141-010: Auto-Archive Live-Sprint Guard (ADR-039 Runtime)**
- Sprint 139 Task 3 dogfood regression prevention

**Task 141-011: Docker HB Shutdown Bug Runtime Deploy (Task 13 cascade)**
- Sprint 139 Task 13 kod canlı ama runtime deploy eksik

**Task 141-012: Event Stream Runtime Emit Enforce (ADR-035 V1.0)**
- 15 kanal wire, `WORKER→BRAIN:RATE_LIMITED` yeni kanal (V1.1 upgrade)

**Task 141-013: ADR-037 Runtime Authority Enforcement Deploy**

**Task 141-014: Sprint-State.json Lifecycle Update Gap Fix**

**Task 141-015: Notification Dispatcher Runtime Deploy**

### NORMAL (3 task)

**Task 141-016: E2E Test Harness Worker-Spawn Guard**
- `.test-e2e-sprint-*` orphan cleanup + VITEST_SKIP env var

**Task 141-017: Sprint 139 + 140 Orphan Cleanup + Archive**
- `.brain/archive/sprint-139-tasks/` + `.brain/archive/sprint-140-cost-disaster/`

**Task 141-018: .deckent/ Directory Groupby + Archive Strategy**

### Sprint 141 Metrikler (YENİ HEDEF)

| Metrik | Hedef |
|--------|-------|
| Task sayısı | **18** (6 P0 cost guard + 3 P0 yapısal + 6 HIGH + 3 NORMAL) |
| **Pre-sprint estimated cost** | **<$3** (cost guard test edildiği için düşük) |
| **Hard cost cap** | **$5** (Sprint 141'in kendisi için budget) |
| Süre hard cap | **8 saat** (Sprint 140'tan daha kısa, cost guard odaklı) |
| Layer 3 skor | ≥13/17 |
| NO_GO rate | ≤%5 |

---

## 6. Mutlak Kurallar (Sprint 140 Sonrası YENİ)

1. **Deckent tekrar çalıştırılmadan ÖNCE** Sprint 141 Task 141-001..006 (cost guard katmanı) **MUTLAKA tamamlanmış olmalı**. Manuel olarak CC tarafında yazılacak, Deckent'in kendisi ile yazılmayacak (chicken-egg paradox: cost guard olmadan sprint çalışmaz).

2. **İlk sprint çalıştırma = Sprint 141 COST GUARD TEST SPRINT**. Sprint 141 kendisi **5-10 task maksimum** (subset), cost guard'ın fiilen çalıştığını kanıtlamak için. Test passed → tam Sprint 141 (18 task) çalıştırılır.

3. **Sprint 141 cost guard test öncesi manuel test:**
   - `npx deckent plan --dry-run` → "Estimated cost: $X" output görünmeli
   - `npx deckent start` öncesi confirmation prompt görünmeli
   - Mock API 429 → worker retry backoff çalışmalı
   - 5 consecutive NO_GO → Brain pause olmalı
   - Budget cap test → Sprint halt olmalı

4. **Sprint 140 artifacts silmeden koruma:** `.tasks/task-140-*`, `.deckent/sprint-140-events.jsonl`, `.tasks/.prompt-140-*.txt` — Sprint 141 forensic kanıt olarak `.brain/archive/sprint-140-cost-disaster/` altına taşınacak (Task 141-017'de).

5. **Cost guard default ON (API user safety mode):**
   - Config: `cost_guard_aggressive: true` default (subscription Max'ta bile)
   - Budget cap: $5 per sprint (config ile override edilebilir ama default low)
   - Circuit breaker threshold: 5 consecutive NO_GO (subscription) / 2 (API key)
   - Pre-sprint cost estimate: zorunlu (confirmation prompt)

---

## 7. Koordinatör İtiraf ve Dersler

**Benim hataları:**

1. **Sprint 140 DIRECTIVES.md tasarım hatası:** Her worker prompt'unda ADR full excerpt injection + boilerplate duplication, prompt cache awareness yok. Her task 2700 token'lık prompt, %80 duplicate. **Ben script ile DIRECTIVES.md üretirken prompt size impact'ini hesaplamadım**, 409 task × 2700 token = 1.1M input base cost'u anlamadım.

2. **Kill response time:** Alperen "kesin kill" dedi, ben `deckent_kill` çağırdım ama Brain MCP server'ın hâlâ canlı olduğunu geç fark ettim. 4 dakika boyunca ~50 worker daha spawn oldu, ~$10 ek cost. **Kill chain atomic olmalıydı** — tek komut Workers + Brain + Containers.

3. **Pre-sprint cost estimation unutuldu:** Sprint 139 ceremony ve Sprint 140 planlama sırasında Alperen'e "Bu sprint tahmini $X" bilgisi vermedim. "A kabul" dediği anda maliyet tahmini yapmalıydım. Sprint 139 $42 ikinci yaşanmamalı.

4. **429 detection atlandı:** Sprint 140 başladıktan ~4 dakika sonra 22 NO_GO gördüm, "Docker HB bug cascade" yorumladım. Gerçek sebebi (429 rate limit) 8 dakika sonra container içine bağlanarak keşfettim. **Log parsing daha erken olmalıydı** — `grep 429 .tasks/*.log` ilk iterasyonda çalıştırılmalıydı.

**Doğru yaptığım:**

1. Sprint 139 panic kill lesson'ı hatırladım, Sprint 140 kill'i Alperen onayı ile yaptım (kuralı ihlal etmedim).
2. Container canlı test yaptım (`docker exec ... claude -p -`), 429 kesin kanıt topladım.
3. Cost explosion memory yazdım anında (`feedback_sprint140_cost_explosion_disaster.md`), kalıcı kayıt altında.
4. Loop'ları stop ettim, observer disiplin devam.

**Sprint 141+ commitment:**

1. **Pre-sprint cost estimation MUTLAK** — her `deckent_start` öncesi CC tarafında manuel cost hesaplaması yapılacak.
2. **Kill chain atomic test edilecek** — Sprint 141 Task 141-004 bitene kadar manuel kill chain pattern'i CC hazır tutacak.
3. **429 early detection** — Sprint 141'de execute phase ilk 2 dakika log parse, 429 pattern varsa anında alert.
4. **Prompt size budget CC tarafında** — DIRECTIVES.md yazarken her task prompt'un tahmini boyutunu hesaplayıp sprint_max_cost'a çarpılacak.

---

## 8. Acil Durum Action Items (Alperen Karar)

### Seçenek A: Sprint 141 Cost Guard Manuel Development (Önerilir)

CC (ben) Sprint 141 Task 141-001..006 cost guard katmanını manuel olarak yazacak (Deckent kullanmadan). Süre: ~4-6 saat CC execution. Sonrasında küçük test sprint (5 task) ile kanıtla, sonra tam Sprint 141 (18 task) execute.

**Risk:** CC context + token kullanımı, ama kontrollü (her task commit + review).
**Ödül:** Cost guard canlı → $42 felaket tekrar olmaz → Deckent kullanılabilir hale gelir.

### Seçenek B: Manuel Rate Limit + Circuit Breaker Minimal Fix

Sprint 141'in tam planı yerine **sadece 3 kritik fix** ile devam:
1. Worker 429 retry backoff
2. Brain circuit breaker (5 consecutive NO_GO halt)
3. Sprint cost budget cap

Sonrasında Sprint 141 normal plan. Süre: ~2-3 saat CC. Minimum viable safety.

### Seçenek C: Deckent'i Geçici Mothball

Sprint 141 Task 141-001..006 tamamlanana kadar **Deckent kullanılmaz**. Diğer projelerle devam. CC Sprint 141 cost guard'ı ayrı bir proje gibi yazabilir (3-5 gün).

**Risk:** Deckent momentum kaybı, ama güvenli.

### Seçenek D: Rollback + Dinlen

Sprint 140 artifacts arşive (CC manuel), Brain budget reset, Sprint 139 state'ine geri dön. Alperen dinlensin, yarın değerlendir.

**Benim önerim:** Seçenek B (Manuel Rate Limit + Circuit Breaker + Budget Cap minimal fix) — ~2-3 saat CC execution, kritik güvenlik sağlar, sonra Sprint 141 normal plan devam edebilir. Alperen onay verirse hemen başlarım.

---

## 9. Referanslar

- `feedback_sprint140_cost_explosion_disaster.md` — kalıcı memory
- `feedback_deckent_kill_approval_required.md` — kill rule (Sprint 139 + 140'ta uygulandı)
- `.deckent/sprint-139-layer3-scorecard.md` — Sprint 139 manuel finalize pattern
- `.tasks/task-140-*.{result,timeout,hb,log}` — 197 worker başarısızlığı kanıt (Task 141-017 cleanup target)
- `.tasks/.prompt-140-*.txt` — prompt structure forensic (Task 141-006 cost optimization input)
- `.tasks/.worker-140-*.sh` — worker entrypoint script (Task 141-001 retry logic ekleme target)
- `.deckent/sprint-140-events.jsonl` — 53 event (execute phase'de 0 emit, ADR-035 V1.0 eksiklik kanıt)

---

## 10. Alperen Karar Noktası

Bu acil durum değerlendirmesi benim tarafımdan yazıldı, loop'lar durduruldu, Sprint 140 devam phase'leri iptal edildi.

**Şu an bekleniyor:**

1. **Seçenek onayı** (A/B/C/D yukarıdaki)
2. **Sprint 141 cost guard spec'i hemen mi başlasın, yarın mı?**
3. **Sprint 140 artifacts immediate archive mi, bekletme mi?**
4. **CC session devam mı (ek token kullanımı), yoksa durdur dinlen mi?**

Loop'lar durdu, yeni sprint çalıştırması yok, fatura yanışı durdu. Sprint 141 COST GUARD olmadan Deckent tekrar çalıştırılmayacak — kural kalıcı memory'de.

---

*Yazan: CC (Claude Opus 4.6) — Sprint 140 post-kill assessment*
*Tarih: 2026-04-15 post-kill*
*Status: Alperen kararı bekleniyor*
