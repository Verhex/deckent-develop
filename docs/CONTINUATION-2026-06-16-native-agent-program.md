# DEVAM PROMPTU — Deckent Native-Agent Program (resume handoff)

> Yeni/resume session'a YAPIŞTIR. Hedef: aşağıdaki bağlamı yükleyip kaldığımız yerden kesintisiz devam.
> Tarih: 2026-06-12 hazırlandı · resume hedefi: Pazartesi 20:00 sonrası.

---

## 0. KİM + NASIL (değişmez)
- Alperen ile **HER ZAMAN Türkçe** konuş (teknik terim İngilizce serbest).
- Proje: **deckent** (`/home/alperen/deckent-dev`), AI agent orchestration CLI, TS/ESM, Node24+, vitest.
- Bağlayıcı kurallar: **MVP/basit-iş YASAK, her zaman god-level** · **sprint kill/cleanup Alperen onayı olmadan YASAK** · **build (`npm run build*`) + /mcp restart Alperen yapar, sprint çalışırken build YASAK** · i18n-first (getMessage/dashboard-i18n, en+tr) · dashboard EMOJI yok (lucide) · **haiku ASLA kod/tsx'e verilmez (yalnız doc)** · md+memory.db eş-zaman · disk-verify ground-truth (worker .result ipucu).

## 1. EN GÜNCEL YÖN (bu session'ın büyük pivotu)
deckent terminali (`deckent` REPL) bugün **claude CLI'ı sarmalıyor** + `<deckent_tool>` tag-parse hack'i → son 10 günün fix→regresyon döngüsünün KÖKÜ. **Mevcut REPL/Ink engine KABUL EDİLMEDİ.** Karar: deckent kendi **native-agent**'ına geçecek (kendi loop + gerçek native tool_use + kendi izin/kimlik/tool). 2 katman: **orkestratör (Brain+worker) subs+API hibrit DEĞİŞMEZ; yalnız terminal native olur.**

## 2. İLK OKU (rehidrasyon — bu sırayla)
- `docs/superpowers/specs/2026-06-12-deckent-native-agent-program-roadmap.md` ← **ANA ROADMAP (6 sub-proje)**
- Memory (MEMORY.md index'ten auto-yüklenir ama açıkça oku):
  - `project_deckent_native_terminal_agent` (native-agent kararları)
  - `project_deckent_core_model_and_provider` (Deckent Core LLM + provider vizyonu)
  - `project_clean_repo_migration_and_training_data` (SP-6 + eğitim-verisi)
  - `project_repl_architectural_root_cause` (kök-sebep)
  - `feedback_cross_check_anthropic_openai` (cross-check kuralı)
  - `feedback_haiku_doc_only_no_code`, `feedback_masterplan_lossless_consolidation`
- `docs/MASTER-PLAN.md` §15 (123-madde öncelik-haritası) + §16 (native-agent program)

## 3. KİLİTLİ KARARLAR (tekrar tartışma — onaylı)
- Native tool_use (Anthropic tool_use / OpenAI fn-call / Ollama / vLLM tool-parser), **tag-parse DEĞİL**.
- Transport: **API veya Ollama** (subscription terminalde yok, orkestratörde kalır).
- Provider-adapter **OpenAI-uyumlu-öncelikli** (OpenAI/OpenRouter/vLLM-Deckent-Core/Ollama tek arayüz).
- Model-determinizmi: API-pinned ID (Fable auto-downgrade yok); güvenlik-atlatma YOK.
- Mimari **yaklaşım A**: greenfield `src/agent/` core + mevcut Ink view KORUNUR.
- Cross-check (bir süre bağlayıcı): Anthropic↔OpenAI task-modu denetim.
- Hermes/Nous playbook doğrulandı: vLLM OpenAI-uyumlu + tool-parser → self-host = BYO/Ollama ile aynı kod-yolu.

## 4. SIRADAKİ İŞ (kaldığımız yer)
**Brainstorm skill SP-1'de YARIDA** (HARD-GATE: tasarım onaylanmadan implementasyon YOK). SP-1 = native-terminal-agent core. Kalan brainstorm-bölümleri:
1. **İzin-modeli** (mevcut `.deckent/settings.local.json` always-allow sızıntısı → katmanlı/görünür/sıfırlanabilir yeni model),
2. **deckent-agent kimliği/kuralları** ("kendi kuralları işlevleri"),
3. **Tool-set kapsamı** (yalnız coding mi + deckent-orkestrasyon tool'ları mı),
4. **Ink-view↔core arayüz sözleşmesi** + mevcut `chat-tool-exec`/`chat-tool-bridge` yeniden-kullanımı,
5. **Test/migrasyon** (claude-CLI spawn nasıl kesilir).
→ Bunlar netleşince **SP-1 spec'i** yaz (`docs/superpowers/specs/`) → writing-plans skill → implementasyon.
**Alternatif başlangıç:** SP-6 geçiş-hazırlığı istersen ÖNCE veri-arşivle (aşağı bak).

## 5. 🔴 KRİTİK KISIT (geri-dönülmez)
**SP-6 (temiz repo geçişi: kod→`deckent` repo, /docs hariç + doc-bağımlı testsiz, public→private)** , **SP-2 eğitim-madenini** (`.claude/projects`, `.brain/archive`+`memory.db`, `.deckent`, `.tasks/archive` — json/result/plan/transcript) **GERİDE bırakır.** → **Repo'yu private/clean yapmadan ÖNCE bu veriyi güvenle export/arşivle**, yoksa Deckent Core'un (SP-2) tek kaynağı KAYBOLUR. Tek sert-sıralama: SP-2-veri-arşivi → SP-6-geçiş.
SP-6 geçiş-öncesi diğer kararlar: git-history (clean-slate mi koru mu), doc-bağımlı test envanteri, managed-docs auto-generation geleceği (ADR-029/013-W = doc-debt kökü).

## 6. GİT DURUMU (bu session sonu)
- Branch: `main`, push'lı. Son commit: `29887945` (SP-6 + SP-2 data-sourcing roadmap).
- Bu session'da yapılan büyük işler: Sprint 282-285 (Chat/Dashboard product + gerçek-zamanlı dashboard 153ms + REPL-tool god-level + REPL-TOOL-DEBT-1/2 deny-dürüstlük fix), ADR governance-reset 3-faz (78 ADR + kod-analizi + MASTER-PLAN §15 konsolidasyon), NERV-W1 fix, ve bu native-agent program-roadmap'i.
- Çalışan durum: tsc temiz, dashboard-suite 1040, REPL cli-suite 36, PTY-harness 4/4.

## 7. AÇIK PROGRAM-HARİTASI (özet)
SP-1 native-core [İLK] → SP-2 Deckent Core fine-tune → SP-3 hosted-provider+SDK → SP-4 opt-in telemetri (🔴 gizlilik-kritik: default-off+anonim+şeffaf) → SP-5 MCP writer-lease (bağımsız) → SP-6 temiz-repo+docs-from-scratch (🔴 SP-2-arşiv-sonrası).

## 8. İLK MESAJ ÖNERİSİ (resume'da yaz)
> "Native-agent program roadmap'ini ve ilgili memory'leri oku. SP-1 brainstorm'una kaldığımız yerden devam: izin-modeli sorusundan başla."
