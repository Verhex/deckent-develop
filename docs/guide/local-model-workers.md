# Local Model Workers — Ollama Agentic Worker Kılavuzu

deckent, yerel bir Ollama modelini gerçek bir agentic worker olarak çalıştırır: dosya okur/yazar/düzeltir, testleri çalıştırır, yapılandırılmış `.result` üretir. Brain (Claude Opus) görevi planlar; Ollama modeli scope-enforced harness içinde işi gerçekleştirir.

---

## Ollama Kullanım Yolları

Deckent'te Ollama iki farklı bağlamda çalışır:

| Bağlam | Durum | Açıklama |
|--------|-------|----------|
| **REPL / Chat modu** | Tam destekli | `deckent` (argümansız) REPL'de `--provider ollama` ile başlatın. `native-transport.ts` aracılığıyla `OllamaAdapter` devreye girer; gerçek zamanlı streaming yanıtlar üretilir. |
| **Sprint worker** | Tam destekli (derleme gerekli) | Task JSON'daki `- Provider: ollama` ile sprint worker olarak kullanılır. `dist/agents/agentic-worker-entry.js` üzerinden tool-calling döngüsü çalışır. **Gereksinim:** `npm run build` komutuyla proje derlenmiş olmalıdır. |

> **Derleme uyarısı (sprint worker):** Sprint worker, ön-derlenmiş `dist/agents/agentic-worker-entry.js` dosyasına bağımlıdır. Bu dosya kaynak koddan üretilir; `dist/` dizini yoksa worker başlatılamaz. `npm run build` çalıştırın.

---

## 1. Ollama Kurulumu

1. [ollama.com](https://ollama.com) adresinden kurulumu tamamlayın.
2. Terminalde çalıştığını doğrulayın:

```bash
ollama serve   # varsayılan http://localhost:11434 dinler
```

3. İstediğiniz modeli çekin:

```bash
ollama pull qwen3.6:27b
```

Varsa başka modeller de kullanılabilir — Ollama'daki her model `deckent` worker olabilir.

---

## 2. Görev Yapılandırması

Her görevde provider ve model açıkça belirtilir:

```yaml
- Provider: ollama
- Model: qwen3.6:27b
```

**Tam görev örneği:**

```yaml
tasks:
  - id: add-readme-section
    prompt: |
      docs/guide/README.md dosyasına "Local Workers" bölümü ekle.
    scope:
      filesWrite:
        - docs/guide/README.md
    goNogo:
      goCriteria: "Bölüm eklendi ve tsc derlemesi başarılı."
      noGoCriteria: "Dosya bozuldu veya derleme hatası."
```

Runner bunu alır, `http://localhost:11434/api/chat` endpoint'ine gönderir ve tool-calling döngüsünü başlatır.

---

## 3. Agentic Tool-Loop Nasıl Çalışır

Worker, model ile arasında şu beş aracın tanımlandığı bir konuşma döngüsü kurar:

| Aracı | İşlev |
|-------|-------|
| `read_file` | Proje kökündeki bir dosyanın içeriğini okur ve döner. |
| `write_file` | Yeni dosya yazar veya mevcut dosyayı üzerine yazar. **Scope-guarded.** |
| `edit_file` | Mevcut dosyada `old` → `new` metin değiştirme yapar. **Scope-guarded.** |
| `run_bash` | Proje kökünde bir shell komutu çalıştırır, stdout+stderr+exit döner. |
| `task_done` | Döngüyü sonlandırır. `selfAssessment` (`DONE` / `GO_WITH_TECH_DEBT` / `NO_GO`) + `notes` taşır. |

### Döngü Akışı

```
1. POST /api/chat → { model, messages, tools, stream: false }
2. Model tool_calls döner → her biri scope-guard ile kontrol edilir
3. Aracı çalıştırılır, sonuç { role: "tool", content: ... } olarak mesajlara eklenir
4. Adım 1'e dön (en fazla 25 iterasyon)
```

**Terminasyon koşulları:**

- `task_done` aracı çağrıldı → modelin `selfAssessment` değeri kabul edilir.
- Model araç çağırmadan sadece metin döndürdü → dosya değiştiyse `DONE`, yoksa `NO_GO`.
- 25 iterasyona ulaşıldı → dosya değiştiyse `GO_WITH_TECH_DEBT`, yoksa `NO_GO`.
- Ollama API hatası → `NO_GO` + hata nedeni.

---

## 4. Host ve Scope Enforcement

### Çalışma Zamanı

Worker, **subprocess** olarak başlatılır:

```
Brain (Opus) → task-router (provider=ollama)
  → OllamaAdapter.spawn()
    → node dist/agents/agentic-worker-entry.js <taskId> <model> <host>
      → agentic-worker-runner döngüsü
        → POST http://localhost:11434/api/chat
```

- Model **yerelde** çalışır: `localhost:11434`.
- Her araç çağrısı proje kökünde (`cwd`) yürütülür.
- Worker ömrü boyunca heartbeat (`.hb`) ve log dosyası yazılır; zaman aşımında SIGKILL ile kesilir.

### Scope Enforcement (HARD-ENFORCED)

`write_file` ve `edit_file` çağrıları **scope-guard** ile filtrelendir:

```
Allowed write files:  docs/guide/README.md
Allowed directories:  docs/guide/
```

Scope dışı bir yol hedeflenirse, model hata mesajı alır — sessizce atlanmaz:

```
[scope-violation] write_file: path "src/core/unrelated.ts" is outside the assigned task scope.
Choose a path inside the scope or call task_done with NO_GO if no in-scope path is suitable.
```

Model hatayı görür, kendisi düzelir veya `task_done` ile uygun değeri döner.

---

## 5. Sonuç Formatı

Worker tamamlandığında `.tasks/task-{id}.result` dosyası yazılır:

```json
{
  "taskId": "add-readme-section",
  "filesChanged": ["docs/guide/README.md"],
  "testsPassed": true,
  "selfAssessment": "DONE",
  "notes": "Bölüm eklendi. tsc temiz, vitest geçti.",
  "iterations": 6,
  "terminationReason": "task_done",
  "tokenUsage": {
    "inputTokens": 1240,
    "outputTokens": 890,
    "provider": "ollama",
    "cost": 0
  }
}
```

Bu sonuç Brain tarafından değerlendirilir: `GO` / `NO_GO` / `GO_WITH_TECH_DEBT`.

---

## 6. REPL / Chat Modunda Ollama

REPL modunda Ollama modeli sohbet aracı olarak kullanılır — sprint başlatmadan direkt konuşabilirsiniz.

```bash
# Ollama servisini başlat ve model çek
ollama serve &
ollama pull qwen3:latest

# deckent REPL'i Ollama ile başlat
deckent --provider ollama --model qwen3:latest
```

REPL, `src/cli/repl/native-transport.ts` üzerinden `OllamaAdapter`'ı devreye alır ve `localhost:11434/api/chat` üzerinden gerçek zamanlı streaming yanıt üretir. Sprint başlatılmaz; `deckent run` gibi agentic araçlar da bu modda çalışır.

---

## 7. Hızlı Başlangıç Özet

```bash
# 1. Ollama kurulu + çalışıyor
ollama serve &

# 2. Model çek
ollama pull qwen3.6:27b

# 3. Proje derlendi mi kontrol et (sprint worker gerektirir)
npm run build

# 4. deckent görevi tanımla (Provider: ollama)
# DIRECTIVES.md'de: - Provider: ollama, - Model: qwen3.6:27b
deckent start

# 5. Worker localhost:11434'te çalışır, scope-enforced, .result üretir
```
