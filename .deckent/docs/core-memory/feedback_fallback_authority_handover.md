# Fallback yetki-devri + codex-ağırlık (Alperen, 2026-08-21)

Anthropic limitleri dolduğunda: (1) worker'lar AĞIRLIKLI OLARAK codex modellerine
atanır; (2) gerekirse EXECUTION_AUTHORITY anlık olarak Fable→gpt-5.6-sol'a
devredilir. Devir-prosedürü KALICI dokümanlardadır:
- `fallback-rules/for-codex.md` — Codex tek-okumayla çalışma-mentaline girer,
  durum-tespiti yapar, kaldığı yerden sürdürür.
- `fallback-rules/to-claude.md` — geri-devir 9-bölümlük paket-şeması (simetrik;
  Fable→Codex bırakışında da aynı şema) + Fable'ın doğrulama-prosedürü.

**Why:** Fabrika limit-pencerelerinde durmamalı; devir profesyonel ve anlık
olmalı ("owner mesaj-taşıyıcısı değildir" — handoff receipt ilkesi).

**How to apply:** Dalga-planlamasında Model satırları codex-öncelikli seçilir
(kritik → gpt-5.6-sol); xverify hakemi same-provider yasağı gereği
claude/cursor'a döner. Dokümanlar bayatlarsa güncelleyen taraf Alperen'e
tek-satır raporlar.
