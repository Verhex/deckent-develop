# Native Agentic REPL — Konuşan Deckent

> `deckent` komutunu argümansız çalıştırdığınızda bir CLI açılır; doğal dille konuşun, deckent araçları çağırır, sonuçları gerçek zamanlı akışla yanıtlar.

## Ne işe yarar?
- Argümansız `deckent` → interaktif agentic REPL moduna girer.
- Türkçe ve İngilizce doğal dil komutlarını anlayarak ilgili MCP araçlarını çağırır.
- Streaming: model yanıtı kelime kelime terminale akar (ADR-082, Sprint 220).
- Oturum geçmişi SQLite `memory.db`'ye kaydedilir; bir sonraki başlatmada kaldığı yerden devam eder.
- `/exit`, `/quit`, `/clear` slash komutları; çok satırlı giriş için satır sonu `\`.
- Ctrl-C ile akışı iptal et; ikinci Ctrl-C ile çık — kaybolmuş oturum yok.

## Neden önemli?
- Sprint durumu, hafıza sorgusu veya plan başlatmak için ayrı CLI komutu ezberlemek gerekmez.
- Oturum kalıcılığı: konuşma bağlamı sprint'ler arasında korunur (ADR-085).
- Provider-agnostic: Claude (varsayılan), Codex, Gemini aynı REPL arayüzünden erişilebilir.

## Nasıl çalışır?

```
Kullanıcı girdisi
      ↓
classifyAgenticIntent()     ← TR/EN kural tablosu, LLM gerektirmez
      ↓
MCP tool dispatch           ← deckent_status / deckent_memory_query / deckent_plan …
      ↓
Streaming yanıt             ← kelime kelime terminal çıktısı
      ↓
persistTurn() → memory.db   ← oturum geçmişi
```

- Intent sınıflandırıcı hızlı okuma aksiyonları için doğrudan MCP aracı çağırır (LLM round-trip yok).
- Karmaşık veya tanınmayan girişler LLM'ye yönlendirilir; araç-kullanım döngüsü (tool-use loop) devreye girer.
- Geçmiş komutlar yukarı/aşağı ok ile gezilir (ring buffer, F11-003 canlı).

## Komut / Örnek

```bash
# REPL'i başlat
deckent

# Örnek REPL oturumu:
# > sprint durumu nedir?
# [deckent_status çağrısı → canlı yanıt]
#
# > son 3 sprinti listele
# [deckent_history çağrısı → özet]
#
# > docker heartbeat ile ilgili ne biliyoruz?
# [deckent_memory_query çağrısı → ADR + öğrenim sonuçları]
#
# > /clear       (ekranı temizle)
# > /exit        (çık)

# Önceki oturumu sürdür (chat komutu üzerinden)
deckent chat --resume <session-id>
```

## Durum
- Olgunluk: ✅ canlı — streaming, session persist, MCP dispatch (Sprint 219–224)
- 🔜 Stabilizasyonda: Ink REPL pivotu (F11-016, Sprint 224) — çok satırlı layout, UTF-8 denetimi
- 🔜 Roadmap: tam multi-provider parity (Codex/Gemini streaming eşitliği)
- İlgili: ADR-081 · ADR-082 · ADR-083 · ADR-085 · ADR-086
- Modüller: `src/cli/commands/chat-repl-ux.ts` · `src/cli/commands/chat-agentic-dispatch.ts` · `src/cli/commands/agentic-session.ts`
