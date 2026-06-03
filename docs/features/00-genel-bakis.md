# deckent — Genel Bakış

> Makinende çalışan, sprinti senin adına koşturan, hiçbir şeye bağlanmayan AI agent orkestratörü.

## Ne işe yarar?

- **Otonom sprint yönetimi** — DIRECTIVES.md yaz, `deckent start` koş; Brain planlar, Worker'lar yazar, Auditor denetler.
- **Multi-agent paralel çalışma** — 15 built-in agent + 21 skill, bağımsız görevler aynı anda çalışır.
- **Üç yüz, tek motor** — geliştirici sprint modu, şirket süreç modu, bireysel sohbet modu.
- **Provider-özgür** — Claude, Codex, Gemini veya yerel Ollama; API anahtarı zorunlu değil.
- **Sürekli öğrenen** — her sprint sonunda Brain kendi retrosunu okur, routing kararları gelecek sprintleri besler.
- **MIT, tamamen ücretsiz** — pro/team/enterprise yok; aynı kod bir kişide de 10.000 kişilik şirkette de çalışır.

## Neden önemli?

- **Tek ürün, tam güç** — AI orchestration + enterprise katmanı tek bir CLI'da; başka tool'a gerek yok.
- **Evrimsel mimari** — agent/skill seçimi, prompt-evolution ve adaptive-agent döngüsü zamanla kaliteyi kendi kendine artırır; bu, tek bir özellikten daha güçlü bir farklılaştırıcıdır.
- **"Open source for open world"** — MIT lisansı, never-calls-home, yerel veritabanı (SQLite); veriler senin makinende kalır.

## Nasıl çalışır?

1. **DIRECTIVES.md** — sprint hedeflerini ve task'ları tanımlarsın.
2. **Brain** — DIRECTIVES'i okur, `.tasks/*.json` task dosyaları oluşturur, Worker'ları spawn eder.
3. **Workers** — scope sınırları içinde görevleri yürütür, heartbeat + result yazar.
4. **Auditor** — 30s döngüde heartbeat/boundary/lock izler; ihlalleri Brain'e raporlar.
5. **Retro + Decay** — Sprint sonu öğrenmeler `memory.db`'ye, eski veriler budanır; bir sonraki sprint daha akıllı başlar.

## Komut / Örnek

```bash
# Projeyi başlat
deckent init

# Sprint hedeflerini yaz (interaktif veya manuel DIRECTIVES.md düzenle)
deckent set-directives

# Planla + çalıştır
deckent plan --structured
deckent start

# Durumu izle
deckent status --watch

# Retrospektif
deckent retro
```

## Durum

- Olgunluk: ✅ canlı (v1.0.0-beta.1, Sprint 224+, 190+ dogfood sprint geçmişi)
- İlgili: ADR-033 · ADR-081 · `src/orchestra/sprint-controller.ts`

---

## İçindekiler — Sunum Dosyaları

| # | Dosya | Konu |
|---|-------|------|
| 01 | [01-mimari.md](./01-mimari.md) | Brain / Worker / Auditor trinity + ADR-008 |
| 02 | [02-sprint-yasam-dongusu.md](./02-sprint-yasam-dongusu.md) | 8-faz sprint lifecycle |
| 03 | [03-task-routing.md](./03-task-routing.md) | Routing Engine V2 — intent-based atama |
| 04 | [04-model-registry-multi-provider.md](./04-model-registry-multi-provider.md) | ModelRegistry + 3 provider tier eşdeğerliği |
| 05 | [05-memory-v2.md](./05-memory-v2.md) | Memory V2 — SQLite FTS5, Türkçe normalize |
| 06 | [06-agents.md](./06-agents.md) | 15 built-in agent, aktivasyon anahtarları |
| 07 | [07-skills.md](./07-skills.md) | 21 built-in skill, AST sandbox |
| 08 | [08-spawn-backends.md](./08-spawn-backends.md) | 3 backend: tmux / docker / subprocess |
| 09 | [09-dependency-waves.md](./09-dependency-waves.md) | Kahn topological wave scheduler |
| 10 | [10-result-evaluation.md](./10-result-evaluation.md) | GO / NO_GO / GO_WITH_TECH_DEBT rubric |
| 11 | [11-auditor-rbac.md](./11-auditor-rbac.md) | Auditor 30s loop + ADR-037 RBAC |
| 12 | [12-event-stream-observability.md](./12-event-stream-observability.md) | Event stream + 15-kanal protokol |
| 13 | [13-native-repl-agentic.md](./13-native-repl-agentic.md) | Native agentic REPL (`deckent` argümansız) |
| 14 | [14-dashboard-control-plane.md](./14-dashboard-control-plane.md) | Web dashboard React+Vite+Tailwind |
| 15 | [15-mcp-integration.md](./15-mcp-integration.md) | MCP 31+ araç + 8 resource |
| 16 | [16-cli-commands.md](./16-cli-commands.md) | 49+ CLI komut, CLI/MCP parity |
| 17 | [17-evolution-pipeline.md](./17-evolution-pipeline.md) | Agent/Skill evolution + promotion pipeline |
| 18 | [18-nervous-system.md](./18-nervous-system.md) | Nervous System proaktif meta-orkestratör |
| 19 | [19-vizyon-yol-haritasi.md](./19-vizyon-yol-haritasi.md) | Trinity vizyon + yol haritası |
