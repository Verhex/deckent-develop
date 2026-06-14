# MCP Entegrasyonu — Model Context Protocol Araç Seti

> Claude Code ve MCP uyumlu tüm istemcilere deckent'i 34 araç + 8 kaynak olarak sunan, sıfır-setup stdio tünel.

## Ne işe yarar?

- **34 MCP aracı** — `deckent_init`'ten `deckent_usage`'a kadar tam sprint yaşam döngüsü MCP üzerinden erişilebilir.
- **8 MCP kaynağı** — `dashboard`, `directives`, `memory`, `debt`, `config`, `retro`, `tasks`, `agents` kaynakları `deckent://` URI şemasıyla okunabilir.
- **Stdio transport** — Claude Code (Claude Desktop, claude.ai/code, VS Code, JetBrains) ile tek satır kayıt yeterli; ek sunucu veya port açılmaz.
- **Agentic loop** — Claude, MCP araçlarını zincirleme çağırarak tam bir sprint planlayıp başlatabilir; sonucu `deckent_status` ile izler.
- **Hafıza sorgusu** — `deckent_memory_query` ile ADR / sprint / debt / pattern cross-source arama yapılır.

## Neden önemli?

- **IDE'ye gömülü orkestrasyon** — kullanıcı terminale geçmeden Claude Code sohbeti üzerinden sprint başlatır, izler, sonuçlandırır.
- **Tool sayısı avantajı** — 34 araç, deckent'i en geniş MCP araç setiyle donatılmış açık-kaynak CLI'lardan biri yapar.
- **Kaynak-araç ikilisi** — araçlar durumu değiştirirken kaynaklar anlık Markdown/JSON snapshot sunar; LLM bağlamı temiz kalır.

## Nasıl çalışır?

1. **Kayıt** — `claude mcp add deckent -- npx deckent-mcp` komutu `~/.claude/mcp.json`'a stdio entry ekler.
2. **Process başlatma** — Claude Code her oturumda `npx deckent-mcp` sürecini stdio üzerinden başlatır; `src/mcp/server.ts` MCP SDK sunucusunu ayağa kaldırır.
3. **Tool dispatch** — `src/mcp/tools/index.ts`'teki `registerTools(server)` fonksiyonu 29 tekil araç + 5 nervous aracını (subscribe/accept/reject/status/config) kaydeder; toplam **34 araç**.
4. **Resource erişimi** — `src/mcp/resources/index.ts` 8 kaynağı `deckent://` URI şemasıyla kaydeder; istemci `resources/read` çağrısıyla anlık snapshot alır.

## Komut / Örnek

```bash
# Claude Code'a MCP sunucusunu kaydet (bir kez çalıştır)
claude mcp add deckent -- npx deckent-mcp

# Kayıtlı sunucuları doğrula
claude mcp list
# Beklenen çıktı: deckent  stdio  npx deckent-mcp

# Claude Code sohbetinde örnek araç çağrısı:
# "deckent ile yeni bir sprint planla"
# → Claude: deckent_plan çağırır, task JSON'larını oluşturur
# → Claude: deckent_start çağırır, worker'ları başlatır
# → Claude: deckent_status çağırır, ilerlemeyi gösterir
```

```bash
# Araç ve kaynak listesi (MCP dışı CLI ile de doğrulanabilir)
deckent --help | grep -E "^\s+(init|plan|start|status|memory)"
```

### MCP Araçları (34 adet — kaynak: src/mcp/tools/index.ts)

| Kategori | Araçlar |
|----------|---------|
| Sprint yaşam döngüsü | init, set_directives, plan, start, status, review, retro, cleanup, kill, recover |
| Analiz & izleme | doctor, analyze_project, history, explain, audit, watch |
| Konfigürasyon | config, sync, checkpoint, docs |
| Agent/Skill/Model | agent_list, skill_list, models |
| Hafıza & özellik | memory_query, feature_query |
| Yardım & çalıştırma | help, run, usage |
| Otonom motor | autonomous |
| Nervous System | nervous_subscribe, nervous_accept, nervous_reject, nervous_status, nervous_config |

### MCP Kaynakları (8 adet — kaynak: src/mcp/resources/)

`deckent://dashboard` · `deckent://directives` · `deckent://memory` · `deckent://debt` · `deckent://config` · `deckent://retro` · `deckent://tasks` · `deckent://agents`

## Durum

- Olgunluk: ✅ canlı — stdio transport, Claude Code / VS Code / JetBrains ile doğrulanmış
- İlgili: ADR-017 (MCP-Native Provider Adapters), ADR-022-V2 (CLI/MCP Feature Parity)
- Modül: `src/mcp/server.ts` · `src/mcp/tools/` (32 dosya, 34 araç) · `src/mcp/resources/` (8 kaynak)
- Kaynak: `src/mcp/tools/index.ts` (registerTools — araç sayısının canonical kaynağı)
