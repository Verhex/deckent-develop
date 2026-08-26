# Paralel-Şerit Protokolü (Claude ana-şerit × Codex yan-şerit)

> Owner kararı 2026-08-26: deckent gelişirken ikinci bir agent-şeridi paralel çalışabilir;
> kayıpsız merge + yapısal çakışma-engeli + bağımsız denetim + operasyonel kontrollü
> local-merge bu protokole tabidir. Emsal: config-completion audit (izole worktree →
> 79/79 validator → admission-turu → main'e kayıpsız eritme, commit `d2e9a1247` koruma).

## 1. Roller ve tek-yazar kuralları

- **Ana-şerit (Claude + dogfood fabrika):** kernel sıcak-yolu (src/core, src/orchestra,
  src/agents, scripts/lint-*, package.json), MASTER-PLAN, landing/commit/push. MASTER'ın
  ve main'in TEK yazarı ana-şerittir.
- **Yan-şerit (Codex):** kendisine tahsisli konu + tahsisli yazım-alanı. Main'e commit,
  merge, push YAPMAZ; MASTER'a YAZMAZ; bulgu/plan/prototip üretir.
- Bir dosyaya iki şerit asla birlikte yazmaz (aşağıdaki §3). "10 numaralı dosya" problemi
  yapısal olarak imkânsızlaştırılır: çakışan ihtiyaç = finding, edit değil.

## 2. Mekanizma: worktree + branch BİRLİKTE (yaşam-döngüsü owner-kararı 2026-08-26)

- Her yan-şerit işi: yan-şerit KENDİ worktree'sini kendisi açar —
  `git -C /home/alperen/deckent-dev fetch origin && git -C /home/alperen/deckent-dev worktree add /tmp/deckent-lane-<konu> -b lane/<konu>-<tarih> origin/main`.
  Worktree izolasyonu verir (ana çalışma-ağacına dokunamaz); branch kalıcılık verir
  (worktree silinse de iş object-store'da yaşar). Brief'ler main'de
  `docs/governance/lane-briefs/` altında yaşar; yan-şerit taze worktree'sinde brief'ini
  oradan okur.
- Yan-şerit her oturum SONUNDA branch'ini origin'e push'lar (`git push -u origin lane/...`)
  — GitHub daima güncel; makine/worktree kaybı iş kaybetmez.
- **Şişme-kontrolü:** admission tamamlanan işin worktree'si SİLİNİR
  (`git -C /home/alperen/deckent-dev worktree remove /tmp/deckent-lane-<konu>`) — branch
  origin'de/object-store'da yaşamaya devam eder, silme veri kaybetmez. Aynı anda en fazla
  1-2 aktif lane-worktree hedeflenir. Branch'ler kısa-ömürlüdür (hedef ≤1 hafta);
  admission sonrası silinir veya koruma-commit'iyle arşivlenir.

## 3. Çakışma-engeli: yazım-alanı sözleşmesi (yapısal, rica değil)

Her şerit-brief'i bir **WRITE-ALLOWLIST** ilan eder; yan-şerit YALNIZ şunlara yazabilir:

- `docs/audits/<konu>-<tarih>/**` — analiz/plan/kanıt artefaktları (+ kendi validator'ı)
- `lab/<konu>/**` — kod prototipi (greenfield; üretim build/lint zincirine DAHİL DEĞİL,
  kendi test/çalıştırma talimatını içinde taşır)
- Worktree-kökü `LANE-BRIEF.md` / `LANE-STATUS.md`

Yasak (yan-şeritte): `src/**`, `tests/**`, `scripts/**`, `package.json`, `docs/MASTER-PLAN.md`,
`.deckent/**`, `.brain/**`, DIRECTIVES.md, config dosyaları.
**Canlı-vaka sertleştirmesi (2026-08-26, sprint-685 olayı):** yan-şerit ANA-CHECKOUT
dizininde (`/home/alperen/deckent-dev`) HİÇBİR komut koşmaz — bütün çalışması kendi
worktree'sindedir; ana-repo'ya yalnız `git -C … fetch/worktree add` kurulum komutlarıyla
dokunur. Deckent run/flow/sprint mutasyonu (set_directives, plan, start, approve, flow
oluşturma) yan-şeritte KESİN yasaktır — analiz görevi hiçbir yorumla execution'a genişleyemez.
Ana-şerit tarafı simetrik ders: DIRECTIVES'te kendi yazmadığı içerik bulan ana-şerit, owner
açıkça işaret etmedikçe start vermez — tek-satır teyit alır. Ana-şeridin sahipliğindeki bir
dosyada değişiklik GEREKİYORSA yan-şerit bunu FINDING olarak raporlar (exact dosya+satır+
önerilen diff), asla kendisi uygulamaz. Ana-şerit isterse aynı dosyada eşzamanlı çalışır —
tutarsızlık imkânsız çünkü tek yazar var.

## 4. Yan-şerit iş-akışı (analiz-önce)

1. **Faz-A ANALİZ+PLAN:** konu üzerinde salt-okuma analiz; çıktılar: bulgu-kaydı
   (DRIFT-REGISTER tarzı), plan (aşamalı, kabul-ölçütlü), `verify-artifacts.mjs`
   (fail-closed kendi-doğrulayıcısı), versioned handoff-receipt. Faz-A bitmeden koda geçilmez.
2. **Faz-B UYGULAMA (yalnız allowlist-içi):** prototip `lab/<konu>/` altında; her oturum
   sonunda branch push + `LANE-STATUS.md` güncel.
3. **Handoff:** iş bitince yan-şerit son commit + push yapar ve tek-mesajlık teslim özeti
   verir (validator sonucu + digest'ler). Owner ana-şeride "admission" der.

## 5. Senkron kuralı (git/GitHub güncel ↔ local güncel)

- **Yan-şerit her oturum BAŞINDA:** `git fetch origin && git rebase origin/main` — rebase
  çakışırsa (allowlist doğru ayarlıysa çıkmaz) DURUR ve raporlar; kendisi çözmez.
- **Ana-şerit** main'i sık push'lar (mevcut landing ritüeli); yan-şeridin baz aldığı main
  hiçbir zaman 24 saatten bayat olmamalı.
- Uzun-koşulu işlerde ana-şerit, yan-şeridi ilgilendiren bir dosya sahipliği değişirse
  (allowlist revizyonu) bunu brief-güncellemesiyle bildirir; sözleşme değişmeden sahiplik
  değişmez.

## 6. Kayıpsız kontrollü local-merge (yalnız ana-şerit yürütür)

Admission-turu (config-audit emsali) sırası:

1. `git fetch` + yan-branch'in worktree'de doğrulanması: kendi `verify-artifacts.mjs`
   beklenen frozen sonucu verir; handoff-receipt digest'leri yeniden hesaplanır.
2. **Ön-koşul denetimi:** `git diff origin/main...lane/<konu> --name-only` çıktısının
   TAMAMI allowlist-içi olmalı. Tek istisna yoktur; dışına taşan dosya = merge REDDİ +
   finding.
3. **Kayıp-riski sıfırlama:** merge öncesi `git merge-tree` dry-run temiz olmalı
   (allowlist ayrık olduğundan yapısal olarak temizdir); ana çalışma-ağacı temiz olmalı
   (`git status` — kirliyken merge yok); canlı sprint koşarken merge yok.
4. Analiz-artefaktları için: branch'e koruma-commit'i (arşiv) + main'e yalnız kompakt
   value-free memo (`docs/archive/evidence-*/`) + MASTER satır-güçlendirme — büyük
   artefakt main'e taşınmaz (config-audit deseni).
5. Kod-prototipi için: `lab/` içeriği ASLA doğrudan `src/`'ye merge edilmez; ana-şerit
   ürünleştirmeyi kendi fabrika-dalgasıyla (DIRECTIVES-hattı, gates, testler, receipt)
   yapar; lab-branch referans-kanıt olarak kalır. (Alternatif: yalnız `docs/` + `lab/`
   dokunuşlu branch'ler `--no-ff` merge alabilir — §6.2 ön-koşulları sağlanmışsa.)
6. Merge/eritme sonrası: 20-gate lint + scoped testler + `lint:master-plan` + push;
   yan-branch ya silinir ya arşiv-etiketi alır.

## 7. Dürüst beklenti ve sınırlar

- Kazanç hedefi ~1.5x'tir, 2x değil: verify/merge/MASTER bant-genişliği ana-şeritte
  tekleşir. Yan-şeridin en verimli işleri: derin-audit turları, greenfield prototipler,
  docs/design yüzeyleri.
- XVerify provider-ayrımı korunur (yan-şerit çıktısının mühürlenmesi farklı provider'la).
- Bu protokol repo-development mekanizmasıdır (operating-policy tamamlayıcısı), Deckent
  ürün özelliği değildir; değişiklik yetkisi Alperen'dedir.
