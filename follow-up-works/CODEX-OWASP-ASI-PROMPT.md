# CODEX GÖREVİ — OWASP Agentic Top 10 Bağımsız Güvenlik Analizi (ANALYSIS-ONLY)

> Ledger bağlamı: `docs/MASTER-PLAN.md` → `SEC-OWASP-ASI-001` (order 4190).
> Bu görev XVERIFY-PROVIDER-SEPARATION kapsamında ikinci-provider bağımsız analizidir:
> önceki analiz Claude (Fable 5) tarafından yapıldı; sen aynı soruyu SIFIRDAN, bağımsız
> incele ve sonda önceki bulguları CONFIRMED / REFUTED / PARTIAL olarak hükme bağla.

## KESİN SINIRLAR
- **HİÇBİR dosya değiştirme, oluşturma, silme YOK.** Salt-okunur analiz. `git` mutation yok,
  `npm install`/build yok, test koşumu yok. Çıktın yalnız yanıt-metnindeki rapordur.
- Kod önerisi isteme/yazma yok — bulgu + kanıt + sınıflandırma + ledger-eşleme istiyoruz.
- Belirsizlikte tahmin yazma: `UNVERIFIED` işaretle ve neden doğrulayamadığını söyle.

## GÖREV
`/home/alperen/deckent-dev` reposunu (src/, scripts/, .claude/settings.json + hooks,
docs/MASTER-PLAN.md güvenlik satırları) kod-gerçeği üzerinden tara ve deckent'i
**OWASP Top 10 for Agentic Applications 2026** risklerine karşı değerlendir.

Her mekanizmayı şu taksonomiyle sınıfla:
- **ENFORCED** — deterministik blok / fail-closed, production'dan çağrılıyor
- **CONFIG-GATED** — enforce yolu var ama flag arkasında (key adını ve default'unu yaz)
- **ADVISORY** — yalnız warn/log/prompt-metni
- **UNWIRED** — kod var, production caller yok (test-only)

## ASI TANIMLARI (web erişimi gerekmez)
| ID | Risk | Öz |
|---|---|---|
| ASI01 | Agent Goal Hijack | Agent'ın okuduğu içerik hedefini/karar yolunu saptırır |
| ASI02 | Tool Misuse & Exploitation | Meşru araçlar aldatıcı girdi/zehirli metadata ile kötüye kullanılır |
| ASI03 | Identity & Privilege Abuse | Ödünç/geniş-scope kimlikler üzerinden yetki devralma |
| ASI04 | Agentic Supply Chain | Framework/connector/plugin/skill/MCP tedarik zinciri kompromisi |
| ASI05 | Unexpected Code Execution | Doğal dil → amaçlanan sınır dışında kod çalıştırma; sandbox kaçışı |
| ASI06 | Memory & Context Poisoning | Agent'ın sonradan "kendi bilgisi" sayacağı yere yanlış bilgi ekme |
| ASI07 | Insecure Inter-Agent Communication | Agent'lar arası mesaj taklidi/aktarımda kurcalama |
| ASI08 | Cascading Failures | Tek kötü kararın bağlı iş akışlarında zincirleme yayılması |
| ASI09 | Human-Agent Trust Exploitation | Onaycının gördüğü bilgiyi kontrol ederek insanı manipüle etme |
| ASI10 | Rogue Agents | Politika dışına çıkıp meşru görünmeye devam eden agent |

## DOĞRULANACAK ÖNCEKİ BULGULAR (bağımsız incele; körü körüne kabul etme)
1. Plugin-hook güvenlik pipeline'ı (`plugin-loader.ts` validatePluginSecurity: path containment
   + AST scan + SHA-256 + Ed25519) sprint yolundan HİÇ çalışmıyor — `sprint-controller.ts:1654`
   opsiyonsuz `loadPluginHooks` → securityConfig undefined; `plugin-hooks.ts:225-238`
   PluginSecurityError'ı stderr'e düşürüyor.
2. `cost_limits.enforce_spend_gate` yalnız uyarı emisyonu açıyor; kümülatif günlük/aylık
   harcama hiçbir yerde bloklanmıyor (`sprint-finalizer.ts:1886-1889`, `start.ts:951`).
3. `AUDIT_HMAC_SECRET` sabit string (`audit-writer.ts:35`) — ana audit zinciri kaynak-sahibi
   adversary'ye karşı sahtelenebilir.
4. Runtime write-scope yalnız claude worker'da (`--allowedTools`); codex/gemini
   `allowedToolsFlag: null` (`provider-command-spec.ts:129,145`); üç provider da kendi
   guardrail'leri kapalı spawn ediliyor; claude'daki `Bash` grant'i path-scoping'i boşa düşürüyor.
5. BOUNDARY_VIOLATION honest-gate worker'ın kendi `filesChanged` beyanına güveniyor
   (`result-evaluator.ts:2380-2430`); auditor git-diff kontrolü alert-only + yanlış-atıf +
   untracked-körü (`auditor.ts:752-791`).
6. Dört enforcement modülü UNWIRED: `tool-scope-gate.ts` · `checkWorkerAuthority(enforceRbac)`
   (`agents/worker.ts:795`) · `enforceSelfModifyingTask` (`self-modifying-detector.ts:203`) ·
   `SkillSandbox.requireSafe`.
7. Terminal command-guard loopback'te inert (`command-guard.ts:54-55`; `session-manager.ts:13`
   host default `localhost`).
8. Klonlanan reponun `.mcp.json`'ı REPL-dışı her caller'da default güvenilir
   (`mcp-client/config.ts:46,57`); üçüncü-parti MCP için imza/consent/provenance yok.
9. Scope gate git-failure'da fail-open (`sprint-controller.ts:1922`).
10. Dosya/web/MCP içeriği için genel content-provenance/taint savunması YOK (prompt'a giren
    ADR/memory/skill/doc/MCP-sonucu güven sınırı işaretsiz).

## ÇIKTI FORMATI (zorunlu)
1. **Yönetici özeti** (≤10 satır, Türkçe, teknik terimler EN).
2. **ASI01–ASI10 tablosu**: her risk için → mevcut mekanizmalar (file:line) → enforcement
   sınıfı → not (Güçlü/Orta/Zayıf) → en kritik gap → ilgili MASTER-PLAN satırı
   (bilmiyorsan `LEDGER-UNKNOWN` yaz, uydurma).
3. **Önceki-bulgu hükümleri**: 10 madde × CONFIRMED / REFUTED / PARTIAL + kendi kanıt satırın.
4. **Yeni bulgular**: önceki analizde OLMAYAN, kendi bulduğun güvenlik açıkları (file:line
   kanıtlı; en değerli bölüm budur).
5. **Sıralı risk listesi**: exploit-olasılığı × etki'ye göre ilk 5.
Rapor dili: Türkçe (teknik terimler İngilizce kalır). Tüm iddialar file:line kanıtlı.
