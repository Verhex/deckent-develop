# CLI Referansı

> **Canonical CLI contract ve canlı Commander tree üzerinden otomatik üretilir. Elle düzenlemeyin.**
> Bu belgeyi yeniden üretmek için `npm run docs:generate-cli` çalıştırın.

Bu referans her public command path, option, positional argument, effect, default execution, authority, output mode, platform contract ve alias bilgisini kapsar.

## Komut dizini

| Komut | Açıklama | Etki | Varsayılan yürütme | Yetki | Çıktı |
|---|---|---|---|---|---|
| [`deckent init`](#deckent-init) | Yeni bir Deckent projesi başlatın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent start`](#deckent-start) | Yeni bir sprint başlatın (zero-config mod için isteğe bağlı tek satırlık açıklamayla) | Process kontrolü | Uygula | Operator | Stream |
| [`deckent plan`](#deckent-plan) | Bir sprint'i çalıştırmadan planlayın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent status`](#deckent-status) | Güncel run dashboard'ını göster | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent inspect`](#deckent-inspect) | Canonical run veya görev ayrıntısını incele | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent attach`](#deckent-attach) | tmux orchestra oturumuna bağlanın | Process kontrolü | Uygula | Operator | Metin |
| [`deckent spawn`](#deckent-spawn) | Bir görev için elle worker başlatın (docker backend'inde worker çıkana kadar BLOKLAR; tmux/subprocess'te fire-and-forget) | Process kontrolü | Uygula | Operator | Metin |
| [`deckent kill`](#deckent-kill) | Çalışan bir worker'ı sonlandırın | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent retro`](#deckent-retro) | En son sprint retrospektifini gösterin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent cleanup`](#deckent-cleanup) | Sprint sonrası temizlik yapın | Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON |
| [`deckent doctor`](#deckent-doctor) | Sistem bağımlılıklarını ve sağlığını kontrol edin | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin ve JSON |
| [`deckent config`](#deckent-config) | Proje yapılandırmasını görüntüleyin veya değiştirin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent config set`](#deckent-config-set) | Bir yapılandırma değeri atayın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent config get`](#deckent-config-get) | Anahtara göre bir yapılandırma değeri okuyun (nokta gösterimini destekler) | Salt-okunur | Oku | Açık | Metin |
| [`deckent config export`](#deckent-config-export) | Config'i stdout'a veya bir dosyaya aktarın | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin |
| [`deckent config import`](#deckent-config-import) | Config'i bir JSON dosyasından içe aktarın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent config list`](#deckent-config-list) | Tüm config parametrelerini kategoriye göre gruplu listeleyin | Salt-okunur | Oku | Açık | Metin |
| [`deckent config keys`](#deckent-config-keys) | Tüm config parametre anahtarlarını listeleyin | Salt-okunur | Oku | Açık | Metin |
| [`deckent config migrate`](#deckent-config-migrate) | config.json'ı en güncel tam formata taşıyın (eksik alanları varsayılanlarla ekler) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent config nervous`](#deckent-config-nervous) | Nervous System yetki modunu ve aksiyon override'larını yapılandırın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent config nervous set`](#deckent-config-nervous-set) | Bir nervous system yapılandırma değeri atayın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent config nervous override`](#deckent-config-nervous-override) | Aksiyon bazlı bir policy override'ı atayın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent config nervous list`](#deckent-config-nervous-list) | Mevcut yetki matrisini tüm preset'lerle gösterin | Salt-okunur | Oku | Açık | Metin |
| [`deckent config nervous reset`](#deckent-config-nervous-reset) | Tüm aksiyon override'larını preset varsayılanlarına sıfırlayın | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent history`](#deckent-history) | Run geçmişini göster | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent plugin`](#deckent-plugin) | Plugin'leri yönetin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent plugin install`](#deckent-plugin-install) | npm, git URL veya yerel yoldan bir plugin kurun | Yerel yazma | Uygula | Operator | Metin |
| [`deckent plugin remove`](#deckent-plugin-remove) | Kurulu bir plugin'i kaldırın | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent plugin update`](#deckent-plugin-update) | Bir plugin'i güncelleyin (mevcudu kaldırıp kaynağından yeniden kurar) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent plugin list`](#deckent-plugin-list) | Kurulu plugin'leri listeleyin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent plugin info`](#deckent-plugin-info) | Plugin bilgisini gösterin (mutlak veya göreli yol kabul eder) | Salt-okunur | Oku | Açık | Metin |
| [`deckent plugin test`](#deckent-plugin-test) | Bir plugin'i test edin: manifest ve entrypoint doğrulanır, varsa hook'lar çalıştırılır | Yerel yazma | Uygula | Operator | Metin |
| [`deckent plugin create`](#deckent-plugin-create) | Yeni bir plugin iskeleti oluşturun | Yerel yazma | Uygula | Operator | Metin |
| [`deckent upgrade`](#deckent-upgrade) | deckent'i kendi kendine güncelleyin | Process kontrolü | Uygula | Operator | Metin |
| [`deckent onboard`](#deckent-onboard) | Onboarding sihirbazını çalıştırın | Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON |
| [`deckent analyze`](#deckent-analyze) | Proje stack'ini, boyutunu ve önerilen metodolojiyi analiz edin | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin ve JSON |
| [`deckent archive-debt`](#deckent-archive-debt) | Teknik borç durumunu raporlayın (DB-first; çözülen borç memory.db içinde otomatik yönetilir) | Salt-okunur | Oku | Açık | Metin |
| [`deckent archive`](#deckent-archive) | Canonical sprint kanıt arşivlerini inceleyin, uzlaştırın ve doğrulayın | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent archive inspect`](#deckent-archive-inspect) | Arşiv durumunu değiştirmeden salt-okunur envanter oluşturun | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent archive reconcile`](#deckent-archive-reconcile) | Dağınık kanıtları canonical sprint arşivlerinde uzlaştırın (varsayılan dry-run) | Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON |
| [`deckent archive verify`](#deckent-archive-verify) | Manifest kapsamını ve arşivlenen her artifact digest’ini doğrulayın | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent archive terminal-inspect`](#deckent-archive-terminal-inspect) | Durumu değiştirmeden canonical hot/archive journal eşliğini inceleyin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent archive terminal-verify`](#deckent-archive-terminal-verify) | Durumu değiştirmeden terminal receipt, arşiv bütünlüğü ve Brain adoption doğrulayın | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent archive terminal-repair`](#deckent-archive-terminal-repair) | Kanıtlanmış tek strict-prefix terminal journal’ı receipt-bound authority ile onarın | Yerel yazma | Uygula | Operator | Metin ve JSON |
| [`deckent dashboard`](#deckent-dashboard) | Terminal dashboard'u otomatik yenilemeyle gösterin (ayrıca bkz. deckent status --watch) | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent serve`](#deckent-serve) | HTTP API sunucusunu SSE desteğiyle başlatın | Process kontrolü | Uygula | Operator | Metin |
| [`deckent sync`](#deckent-sync) | Adapter dosyalarını eşitleyin ve son sprint'ten bu yana oluşan dış değişiklikleri tespit edin | Yerel yazma | Uygula | Operator | Metin ve JSON |
| [`deckent watch`](#deckent-watch) | Canlı bir worker'ı --follow <taskId> ile takip edin (docker logs / tmux pane / subprocess log) veya tmux dashboard split'ini açın | Salt-okunur | Oku | Açık | Stream |
| [`deckent run`](#deckent-run) | Sprint döngüsü olmadan tek seferlik bir görev çalıştırın | Process kontrolü | Uygula | Operator | Metin |
| [`deckent run start`](#deckent-run-start) | Not: 'run start\|status\|retro\|history', üst-düzey 'deckent start\|status\|retro\|history' komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. 'sprint' terimi 'run' olarak yeniden adlandırılıyor. | Process kontrolü | Uygula | Operator | Metin |
| [`deckent run status`](#deckent-run-status) | Not: 'run start\|status\|retro\|history', üst-düzey 'deckent start\|status\|retro\|history' komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. 'sprint' terimi 'run' olarak yeniden adlandırılıyor. | Salt-okunur | Oku | Açık | Metin |
| [`deckent run retro`](#deckent-run-retro) | Not: 'run start\|status\|retro\|history', üst-düzey 'deckent start\|status\|retro\|history' komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. 'sprint' terimi 'run' olarak yeniden adlandırılıyor. | Salt-okunur | Oku | Açık | Metin |
| [`deckent run history`](#deckent-run-history) | Not: 'run start\|status\|retro\|history', üst-düzey 'deckent start\|status\|retro\|history' komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. 'sprint' terimi 'run' olarak yeniden adlandırılıyor. | Salt-okunur | Oku | Açık | Metin |
| [`deckent runs`](#deckent-runs) | Run-flow'ları listeleyin (çoklu-flow gelen kutusu) — ayrıca run bazında karar: --approve/--reject/--retire/--start | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin |
| [`deckent process`](#deckent-process) | Process-mode execution yüzeyi — görev/yetenek gönderin ve durumlarını yoklayın | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent process submit`](#deckent-process-submit) | Bir ExecutionRequest gönderin (policy-gated: salt-okunur olanlar otomatik çalışır, yan etkili olanlar onay için park edilir) | Process kontrolü | Uygula | Operator | Metin |
| [`deckent process status`](#deckent-process-status) | Önceki bir gönderimin durumunu executionId ile yoklayın | Salt-okunur | Oku | Açık | Metin |
| [`deckent process result`](#deckent-process-result) | Bir gönderimin tam sonucunu gösterin (status + lastResult) | Salt-okunur | Oku | Açık | Metin |
| [`deckent test`](#deckent-test) | Test sprint'i çalıştırın (retro yok, memory güncellemesi yok, decay yok) | Process kontrolü | Uygula | Operator | Metin |
| [`deckent agent`](#deckent-agent) | Agent havuzunu yönetin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent agent lint`](#deckent-agent-lint) | Agent kataloğunu denetleyin: erişilebilirlik, kapsam boşlukları, yetenek çakışmaları (V3) | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent agent list`](#deckent-agent-list) | Havuzdaki tüm agent'ları listeleyin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent agent create`](#deckent-agent-create) | Özel bir agent oluştur (--prompt/--description ile yönlendirmeli kurulum) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent agent stats`](#deckent-agent-stats) | Bir agent'ın sprint bazında performansını gösterin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent agent enable`](#deckent-agent-enable) | Bir agent'ı etkinleştirin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent agent disable`](#deckent-agent-disable) | Bir agent'ı devre dışı bırakın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent agent delete`](#deckent-agent-delete) | Bir agent'ı havuzdan silin | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent agent edit`](#deckent-agent-edit) | Bir agent yapılandırmasını düzenleyin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent agent reclassify`](#deckent-agent-reclassify) | Kayıtlı bir görev sonucunu yeniden sınıflandırın (agent/skill istatistiklerine delta uygular) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent agent info`](#deckent-agent-info) | Ayrıntılı agent bilgisini gösterin | Salt-okunur | Oku | Açık | Metin |
| [`deckent skill`](#deckent-skill) | Skill havuzunu yönetin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent skill list`](#deckent-skill-list) | Tüm skill'leri listeleyin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent skill create`](#deckent-skill-create) | Özel bir skill oluşturun | Yerel yazma | Uygula | Operator | Metin |
| [`deckent skill install`](#deckent-skill-install) | Yerel yoldan veya git URL'den bir skill kurun (sürüm sabitlemeyi destekler: url#tag) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent skill update`](#deckent-skill-update) | Kurulu bir skill'i orijinal kaynağından güncelleyin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent skill enable`](#deckent-skill-enable) | Bir skill'i etkinleştirin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent skill disable`](#deckent-skill-disable) | Bir skill'i devre dışı bırakın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent skill delete`](#deckent-skill-delete) | Bir skill'i silin | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent skill info`](#deckent-skill-info) | Skill ayrıntılarını gösterin | Salt-okunur | Oku | Açık | Metin |
| [`deckent skill search`](#deckent-skill-search) | Marketplace kayıt defterinde skill arayın | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent skill publish`](#deckent-skill-publish) | Bir skill'i doğrulayın, imzalayın (Ed25519) ve marketplace'e yayınlayın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent review`](#deckent-review) | Sprint görevlerini değerlendirmeleriyle birlikte gözden geçirin | Yerel yazma | Uygula | Operator | Metin ve JSON |
| [`deckent finalize`](#deckent-finalize) | Bir sprinti sonlandır: MEMORY.md, RETRO.md, IDENTITY.md, config ve run decay güncelle | Yerel yazma | Uygula | Operator | Metin |
| [`deckent explain`](#deckent-explain) | Son sprint'in ne yaptığını insan diliyle açıklayın | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent set-directives`](#deckent-set-directives) | Sprint hedeflerini DIRECTIVES.md dosyasına yazın (içerik, dosya veya stdin) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent connect`](#deckent-connect) | Provider/MCP/IDE/shell bağlantı durumunu teşhis edin (salt-okunur — hiçbir değişiklik yapılmaz) | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent plan-nl`](#deckent-plan-nl) | Serbest biçimli bir hedefi DIRECTIVES.md iskeletine dönüştürün (tek-görev şablonu; varsayılan önizleme) | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin |
| [`deckent do`](#deckent-do) | Golden-flow: bir hedefi sprint planına dönüştürün (varsayılan dry-run önizleme; gerçekten başlatmak için --run) | Process kontrolü | Önizleme; explicit apply gerekir | Operator | Metin |
| [`deckent heartbeat`](#deckent-heartbeat) | .deckent/HEARTBEAT.md içindeki proaktif heartbeat görevlerini çalıştırın | Process kontrolü | Uygula | Operator | Metin |
| [`deckent chat`](#deckent-chat) | Deckent ile sohbet oturumu başlatın. Kurulu AI CLI'ınızı kullanır. | Process kontrolü | Uygula | Operator | Metin |
| [`deckent checkpoint`](#deckent-checkpoint) | İnsan checkpoint'lerini yönetin — bekleyenleri listeleyin, onaylayın veya reddedin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent checkpoint list`](#deckent-checkpoint-list) | Tüm checkpoint'leri listeleyin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent checkpoint approve`](#deckent-checkpoint-approve) | Bekleyen bir checkpoint'i onaylayın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent checkpoint reject`](#deckent-checkpoint-reject) | Bekleyen bir checkpoint'i reddedin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent docs`](#deckent-docs) | Kullanıcı tanımlı dokümanları yönetin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent docs add`](#deckent-docs-add) | Yönetilen dokümanlara bir doküman ekleyin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent docs remove`](#deckent-docs-remove) | Yönetilen dokümanlardan bir dokümanı kaldırın | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent docs list`](#deckent-docs-list) | Tüm yönetilen dokümanları listeleyin | Salt-okunur | Oku | Açık | Metin |
| [`deckent docs update`](#deckent-docs-update) | Mevcut bir yönetilen dokümanın kurallarını güncelleyin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent docs run`](#deckent-docs-run) | Yönetilen doküman güncellemelerini sprint olmadan çalıştırın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent docs track`](#deckent-docs-track) | Doküman tazeliğini izleyin (hash + DCR + stale) | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent docs track scan`](#deckent-docs-track-scan) | Tüm dokümanları hash'leyin, zaman damgalayın ve sıralayın; front-matter yazın; memory.db'yi eşitleyin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent docs track status`](#deckent-docs-track-status) | İzlenen dokümanları rank ve stale durumuna göre raporlayın | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent docs track sync`](#deckent-docs-track-sync) | Yalnız memory.db'yi güncelleyin (front-matter yazılmaz) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent output`](#deckent-output) | Belirli bir worker görevi için yakalanan çıktıyı gösterin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent task`](#deckent-task) | Tek seferlik görevlerin değişmez settlement kanıtını incele ve uzlaştır | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent task settle`](#deckent-task-settle) | Görev settlement planını incele; yalnız açık operatör beyanıyla uygula | Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON |
| [`deckent cost`](#deckent-cost) | User Safety Shield — maliyet yönetimi ve tahmini | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent cost show`](#deckent-cost-show) | Model fiyatlandırmasını gösterin (salt-okunur) | Salt-okunur | Oku | Açık | Metin |
| [`deckent cost update`](#deckent-cost-update) | En güncel fiyatlandırmayı LiteLLM + OpenRouter'dan çekin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent cost budget`](#deckent-cost-budget) | Maliyet bütçelerini görüntüleyin veya ayarlayın | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin |
| [`deckent recall`](#deckent-recall) | Proje belleğinde arayın — ADR'ler, sprint öğrenimleri, pattern'ler, borç | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent remember`](#deckent-remember) | Proje belleğine bir not kaydedin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent memory`](#deckent-memory) | Memory V2 yönetimi | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent memory rebuild`](#deckent-memory-rebuild) | memory.db'yi .brain/exports/*.md dosyalarından yeniden oluşturun | Yerel yazma | Uygula | Operator | Metin |
| [`deckent memory export`](#deckent-memory-export) | memory.db'yi .brain/exports/*.md olarak dışa aktarın | Yerel yazma | Uygula | Operator | Metin |
| [`deckent memory stats`](#deckent-memory-stats) | memory.db istatistiklerini gösterin | Salt-okunur | Oku | Açık | Metin |
| [`deckent memory backup`](#deckent-memory-backup) | memory.db dosyasının WAL-güvenli yedeğini oluştur | Yerel yazma | Uygula | Operator | Metin |
| [`deckent memory relations`](#deckent-memory-relations) | Memory ilişkilerini yönetin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent memory relations list`](#deckent-memory-relations-list) | memory.db içindeki tüm ilişkileri listeleyin | Salt-okunur | Oku | Açık | Metin |
| [`deckent memory relations review`](#deckent-memory-relations-review) | Backfill önizlemesinden gelen bekleyen ilişkileri gözden geçirin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent trace`](#deckent-trace) | Trace çıkarma, immutable migration ve yönetişimli eğitim-korpusu araçları | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent trace extract`](#deckent-trace-extract) | Claude Code oturum transkript(ler)inden aligned + general eğitim örnekleri çıkar | Yerel yazma | Uygula | Operator | Metin |
| [`deckent trace migrate`](#deckent-trace-migrate) | Geçmiş JSONL trace kayıtlarını canonical immutable projection ile uzlaştır (varsayılan dry-run) | Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON |
| [`deckent trace corpus`](#deckent-trace-corpus) | Manifest-authorized Deckent eğitim korpuslarını üret ve denetle | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent trace corpus build`](#deckent-trace-corpus-build) | Doğrulanmış migration'dan fail-closed ShareGPT korpusu üret | Yerel yazma | Uygula | Operator | Metin ve JSON |
| [`deckent trace corpus lint`](#deckent-trace-corpus-lint) | Korpus şeması, provenance, causality, secret, duplicate ve manifest uzlaşmasını doğrula | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent resume`](#deckent-resume) | Bir sprint'i son checkpoint'inden devam ettirin | Process kontrolü | Uygula | Operator | Metin |
| [`deckent nervous`](#deckent-nervous) | Nervous System panosu — proaktif önerileri izleyin, kabul edin, reddedin | Salt-okunur | Oku | Açık | Metin |
| [`deckent nervous enable`](#deckent-nervous-enable) | Nervous System'i etkinleştirin (tek komut; varsayılan OFF kalır, insan onayı korunur) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent nervous accept`](#deckent-nervous-accept) | Bekleyen bir nervous system önerisini kabul edin | Yerel yazma | Uygula | Owner | Metin |
| [`deckent nervous reject`](#deckent-nervous-reject) | Bekleyen bir nervous system önerisini reddedin | Yerel yazma | Uygula | Owner | Metin |
| [`deckent nervous edit`](#deckent-nervous-edit) | Bekleyen bir öneriyi değiştirip kabul edin | Yerel yazma | Uygula | Owner | Metin |
| [`deckent nervous undo`](#deckent-nervous-undo) | Yakın zamanda yapılmış geri alınabilir bir aksiyonu geri alın | Yerel yazma | Uygula | Owner | Metin |
| [`deckent nervous history`](#deckent-nervous-history) | Nervous system aksiyon geçmişini görüntüleyin | Salt-okunur | Oku | Owner | Metin |
| [`deckent nervous recommendations`](#deckent-nervous-recommendations) | Brain gelen kutusunu görüntüleyin — karar bekleyen nervous önerileri | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Owner | Metin |
| [`deckent nervous log`](#deckent-nervous-log) | Ham nervous system log'unu görüntüleyin | Salt-okunur | Oku | Açık | Stream |
| [`deckent nervous accept-panic`](#deckent-nervous-accept-panic) | PanicGuard tarafından engellenmiş bir worker kill'ini onaylayın (IPC marker yazar) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent nervous baseline-refresh`](#deckent-nervous-baseline-refresh) | directives_protection baseline'ını güncel DIRECTIVES.md içeriğine yenileyin | Yerel yazma | Uygula | Owner | Metin |
| [`deckent mode`](#deckent-mode) | deckent_style al/ayarla (run (sprint) \| task \| process) | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent mode show`](#deckent-mode-show) | Mevcut modu göster | Salt-okunur | Oku | Açık | Metin |
| [`deckent mode sprint`](#deckent-mode-sprint) | Sprint moduna geç | Yerel yazma | Uygula | Operator | Metin |
| [`deckent mode run`](#deckent-mode-run) | Run moduna geç (köprü-alias — deckent_style: "sprint" olarak saklanır) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent mode task`](#deckent-mode-task) | Task moduna geç | Yerel yazma | Uygula | Operator | Metin |
| [`deckent mode process`](#deckent-mode-process) | Process moduna geç (sürekli istek-işleme — ERP / otomasyon, MCP + REST üzerinden) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent mode auto`](#deckent-mode-auto) | Bağlamdan modu otomatik algıla | Yerel yazma | Uygula | Operator | Metin |
| [`deckent mode global`](#deckent-mode-global) | Genel varsayılanı ayarla (sprint\|task\|process) | Yerel yazma | Uygula | Operator | Metin |
| [`deckent features`](#deckent-features) | .deckent/settings/features-manifest.json içindeki özellikleri kategoriye göre listeleyin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent truth`](#deckent-truth) | Manifest truth-block'ları için 4 seviyeli feature truth-chain'i çözün (code → wired → enabled → proof) | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin ve JSON |
| [`deckent audit`](#deckent-audit) | Bir sprint için Brain Self-Audit Gate çalıştırın veya audit log olaylarını sorgulayın/dışa aktarın/saklayın (query \| compliance \| forward \| retention) | Process kontrolü | Önizleme; explicit apply gerekir | Operator | Metin ve JSON |
| [`deckent audit-verify`](#deckent-audit-verify) | Kurcalama kanıtı için audit log HMAC zincirini doğrulayın | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent recover`](#deckent-recover) | Çökmüş veya takılmış bir sprinti canonical recovery operation ile kurtar | Yerel yazma | Uygula | Operator | Metin ve JSON |
| [`deckent models`](#deckent-models) | Model kataloğunu yönetin ve gezinin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent models list`](#deckent-models-list) | Katalogdaki kullanılabilir modelleri listeleyin | Salt-okunur | Oku | Owner | Metin |
| [`deckent models activate`](#deckent-models-activate) | Tespit edilen bir modelin routing havuzuna girmesine izin verin | Yerel yazma | Uygula | Owner | Metin |
| [`deckent models deactivate`](#deckent-models-deactivate) | Bir modeli routing havuzundan çıkarın (tespit onu görmeye devam eder) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent models activation`](#deckent-models-activation) | Kayıtlı model aktivasyon kararlarını gösterin (kayıtsız = aktif) | Salt-okunur | Oku | Açık | Metin |
| [`deckent models policy`](#deckent-models-policy) | Bir provider aktivasyon policy'sini gösterin veya ayarlayın (implicit-active \| explicit-active) | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Owner | Metin |
| [`deckent models active-set`](#deckent-models-active-set) | Çözümlenmiş owner aktif execution set'ini + snapshot digest'ini gösterin | Salt-okunur | Oku | Açık | Metin |
| [`deckent models refresh`](#deckent-models-refresh) | Model kataloğunu zorla yenileyin (24 saatlik cache'i geçersiz kılar) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent models tier`](#deckent-models-tier) | Belirli bir modelin tier'ını ID veya API ID ile sorgulayın | Yerel yazma | Uygula | Owner | Metin |
| [`deckent flow`](#deckent-flow) | Zamanlanmış flow'ları yönetin (process modu) | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent flow list`](#deckent-flow-list) | Tüm zamanlanmış flow'ları listeleyin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent flow add`](#deckent-flow-add) | Yeni bir zamanlanmış flow ekleyin (cron: 5 alanlı ifade, örn. "* * * * *") | Process kontrolü | Uygula | Operator | Metin |
| [`deckent flow run`](#deckent-flow-run) | Flow-runtime tick'ini bir kez çalıştırın (--once) veya daemon'ı başlatın | Process kontrolü | Uygula | Operator | Metin |
| [`deckent flow approve`](#deckent-flow-approve) | Bekleyen event-tetikli bir flow dispatch'ini onaylayın ki ilerleyebilsin | Process kontrolü | Uygula | Operator | Metin |
| [`deckent rbac`](#deckent-rbac) | Rol tabanlı erişim denetimi — izinleri kontrol edin ve rolleri listeleyin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent rbac check`](#deckent-rbac-check) | Bir rolün bir aksiyonu gerçekleştirme iznine sahip olup olmadığını kontrol edin | Salt-okunur | Oku | Owner | Metin |
| [`deckent rbac roles`](#deckent-rbac-roles) | Tüm rolleri ve etkin izinlerini listeleyin | Salt-okunur | Oku | Açık | Metin |
| [`deckent rbac grant`](#deckent-rbac-grant) | Bir kullanıcıya rol atayın | Yerel yazma | Uygula | Owner | Metin |
| [`deckent rbac revoke`](#deckent-rbac-revoke) | Bir kullanıcının rol atamasını kaldırın | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent evolve`](#deckent-evolve) | Evrim analizi — sprint'ler arası eğilimler ve prompt önerileri | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent evolve report`](#deckent-evolve-report) | Sprint'ler arası agent/skill eğilim raporunu gösterin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent autonomous`](#deckent-autonomous) | Autonomous runtime — yetki sınırlı sürekli döngü | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent autonomous enable`](#deckent-autonomous-enable) | Autonomous modu etkinleştirin (config düzenlemek yerine tek komut; varsayılan OFF kalır) | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous start`](#deckent-autonomous-start) | Autonomous döngüyü başlatın (default-deny + insan onayı kapısı) | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous plan`](#deckent-autonomous-plan) | Üst düzey bir hedefi bekleyen autonomous backlog kalemlerine ayrıştırın | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous status`](#deckent-autonomous-status) | Autonomous runtime özetini gösterin (bekleyenler + son audit olayları) | Salt-okunur | Oku | Owner | Metin |
| [`deckent autonomous stop`](#deckent-autonomous-stop) | Autonomous döngüye temiz şekilde durma sinyali gönderin | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous cleanup`](#deckent-autonomous-cleanup) | Başıboş autonomous run-artifact'larını (task-run-*, _*.pid) .tasks/ içinden temizleyin | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous pending`](#deckent-autonomous-pending) | İnsan kabul/ret kararı bekleyen park edilmiş onayları listeleyin | Salt-okunur | Oku | Açık | Metin |
| [`deckent autonomous approve`](#deckent-autonomous-approve) | Park edilmiş bir tetikleyiciyi onaylayın — çalışan döngünün kapısını çözer | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous reject`](#deckent-autonomous-reject) | Park edilmiş bir tetikleyiciyi reddedin — çalışan döngünün kapısını çözer | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous backlog`](#deckent-autonomous-backlog) | Autonomous backlog'u yönetin (kayıt ekleyin / listeleyin / kaldırın) | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent autonomous backlog add`](#deckent-autonomous-backlog-add) | Autonomous backlog'a yeni bir kayıt ekleyin | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous backlog list`](#deckent-autonomous-backlog-list) | Autonomous backlog kayıtlarını listeleyin | Salt-okunur | Oku | Owner | Metin |
| [`deckent autonomous backlog remove`](#deckent-autonomous-backlog-remove) | Autonomous backlog'dan bir kaydı kaldırın (konumsal id veya --id) | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous-mission`](#deckent-autonomous-mission) | İş listelerinden veya hedeflerden oluşturulan autonomous mission'ları yönetin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent autonomous-mission create-list`](#deckent-autonomous-mission-create-list) | Bir veya daha fazla iş kaleminden autonomous mission oluşturun | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous-mission create-goal`](#deckent-autonomous-mission-create-goal) | Hedefine ulaşılana kadar çalışan autonomous mission oluşturun | Autonomous loop kontrolü | Uygula | Owner | Metin |
| [`deckent autonomous-mission list`](#deckent-autonomous-mission-list) | Tüm mission'ları listeleyin (özet tablo) | Salt-okunur | Oku | Owner | Metin ve JSON |
| [`deckent bot`](#deckent-bot) | Mesaj-connector botu — gelen approve/reject için listen/start/stop/status | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent bot listen`](#deckent-bot-listen) | Mesaj connector'larından gelen approve/reject komutlarını dinle | Process kontrolü | Uygula | Owner | Metin |
| [`deckent bot start`](#deckent-bot-start) | Bot dinleyicisini arka plan daemon'ı olarak çalıştır | Process kontrolü | Uygula | Owner | Metin |
| [`deckent bot stop`](#deckent-bot-stop) | Bot daemon'ını durdur | Process kontrolü | Uygula | Owner | Metin |
| [`deckent bot status`](#deckent-bot-status) | Bot daemon'ının çalışıp çalışmadığını göster | Salt-okunur | Oku | Owner | Metin |
| [`deckent gateway`](#deckent-gateway) | Proje kapsamlı mesajlaşma gateway oturumlarını ve eşleştirmeyi yönetin | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent gateway listen`](#deckent-gateway-listen) | Gateway dinleyicisini ön planda çalıştırın (eşleşmiş tüm connector'lara bağlanır) | Process kontrolü | Uygula | Owner | Metin |
| [`deckent gateway start`](#deckent-gateway-start) | Gateway daemon'ını arka planda başlatın | Process kontrolü | Uygula | Owner | Metin |
| [`deckent gateway stop`](#deckent-gateway-stop) | Çalışan gateway daemon'ını durdurun | Process kontrolü | Uygula | Owner | Metin |
| [`deckent gateway status`](#deckent-gateway-status) | Gateway daemon'ının çalışıp çalışmadığını gösterin | Salt-okunur | Oku | Owner | Metin |
| [`deckent gateway pair`](#deckent-gateway-pair) | Cihaz eşleştirme isteklerini inceler ve sonuçlandırır: bir operatör bekleyen kodları listeler, ardından birini bir projeye onaylar veya reddeder. | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent gateway pair list`](#deckent-gateway-pair-list) | Bekleyen eşleşme isteklerini listeleyin | Salt-okunur | Oku | Owner | Metin |
| [`deckent gateway pair approve`](#deckent-gateway-pair-approve) | Bir eşleşme isteğini onaylayın ve bir projeye bağlayın | Process kontrolü | Uygula | Owner | Metin |
| [`deckent gateway pair reject`](#deckent-gateway-pair-reject) | Bekleyen bir eşleşme isteğini reddedin | Process kontrolü | Uygula | Owner | Metin |
| [`deckent mcp`](#deckent-mcp) | Model Context Protocol sunucularını yönetin — MCP destekleyen her host arasında taşınabilir açık bir standart | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent mcp add`](#deckent-mcp-add) | Bir MCP sunucusu ekleyin (stdio veya http) — scope'a göre .mcp.json dosyasına yazar | Yerel yazma | Uygula | Operator | Metin |
| [`deckent mcp list`](#deckent-mcp-list) | Kayıtlı MCP sunucularını listeleyin (birleşik: local > project > user) | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent mcp remove`](#deckent-mcp-remove) | Bir MCP sunucusunu kaldırın (--scope verilmezse tüm scope'larda arar) | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent mcp get`](#deckent-mcp-get) | Bir MCP sunucusunun ayrıntılarını gösterin (birleşik görünümden) | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent resources`](#deckent-resources) | Canlı docker worker kaynak kullanımını gösterin veya kaynak log'unu analiz edin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent usage`](#deckent-usage) | Claude Code transcript'lerinden token/limit tüketimini gösterin | Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin ve JSON |
| [`deckent kpi`](#deckent-kpi) | Mevcut (veya belirtilen) sprint için KPI karnesini gösterin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent image`](#deckent-image) | Worker Docker imajı yönetimi | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent image build`](#deckent-image-build) | deckent-worker Docker imajını paketlenmiş Dockerfile.worker'dan derleyin | Yerel yazma | Uygula | Operator | Metin |
| [`deckent limits`](#deckent-limits) | Canlı abonelik-penceresi kullanımını (oturum/hafta) ve yapılandırılmış start-gate eşiklerini kontrol edin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent openrouter-probe`](#deckent-openrouter-probe) | OpenRouter ücretsiz modellerini $DECK:OPENROUTER_API_KEY ile canlı yoklayın ve yerel cache'i yenileyin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent xverify`](#deckent-xverify) | Bir iddiayı FARKLI sağlayıcıda çapraz doğrula; ALLOW/NO-GO/HOLD kararını typed kanıttan host üretir | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent approvals`](#deckent-approvals) | Runtime-genelinde onay kutusu — bekleyen istekleri listele ve canlı-doğrulamalı local-terminal kanalından karara bağla | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent approvals list`](#deckent-approvals-list) | Bekleyen onay isteklerini listele | Salt-okunur | Oku | Owner | Metin |
| [`deckent approvals decide`](#deckent-approvals-decide) | Bekleyen bir onay isteğini karara bağla; interaktif TTY yeniden-doğrulaması gerektirir | Yerel yazma | Uygula | Owner | Metin |
| [`deckent approvals rules`](#deckent-approvals-rules) | Kalıcı onay kuralları (approval-rules.json) — listele, devre-dışı bırak, etkinleştir, sil | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent approvals rules list`](#deckent-approvals-rules-list) | Kuralları durumlarıyla listele | Salt-okunur | Oku | Owner | Metin |
| [`deckent approvals rules apply`](#deckent-approvals-rules-apply) | Aktif kuralları bekleyen kutuya uygula (yalnız routine-seviye otomatikleştirilebilir türler) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent approvals rules disable`](#deckent-approvals-rules-disable) | Kuralı devre-dışı bırak (denetim için saklanır; her an yeniden etkinleştirilebilir) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent approvals rules enable`](#deckent-approvals-rules-enable) | Devre-dışı kuralı yeniden etkinleştir | Yerel yazma | Uygula | Owner | Metin |
| [`deckent approvals rules remove`](#deckent-approvals-rules-remove) | Kuralı kalıcı olarak sil | Yıkıcı process kontrolü | Uygula | Owner | Metin |
| [`deckent confirmations`](#deckent-confirmations) | Custom-confirmation kutusu — bekleyen kabul-matrisi yönlendirmeleri (llm/insan/kod adapterları) | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent confirmations list`](#deckent-confirmations-list) | Bekleyen confirmation isteklerini listele | Salt-okunur | Oku | Owner | Metin |
| [`deckent confirmations decide`](#deckent-confirmations-decide) | Bir INSAN-adapter confirmation kararı ver (interaktif terminal, tek atış) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent confirmations run`](#deckent-confirmations-run) | Bekleyen LLM-adapter confirmation isteklerini çapraz-sağlayıcı hakemlikten geçir (xverify runtime) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent provider-authority`](#deckent-provider-authority) | Host kapsamlı provider authority keyring'ini incele ve sağla (sahip yetkisinde) | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent provider-authority keyring`](#deckent-provider-authority-keyring) | Provider authority keyring — status / init / rotate | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent provider-authority keyring status`](#deckent-provider-authority-keyring-status) | Keyring konumunu ve revizyon durumunu göster (anahtar materyali asla yazılmaz) | Salt-okunur | Oku | Owner | Metin |
| [`deckent provider-authority keyring init`](#deckent-provider-authority-keyring-init) | Keyring genesis revizyonunu sağla (sahip işlemi; varsa reddeder) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent provider-authority keyring rotate`](#deckent-provider-authority-keyring-rotate) | Aktif authority anahtarını döndür (--expect-revision gerekir) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent provider-authority limits`](#deckent-provider-authority-limits) | Provider-limit authority — `provider_limits` politikasını canlı provider gerçeğinden yaz | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent provider-authority limits init`](#deckent-provider-authority-limits-init) | Tek bir kesin provider kapsamı için global `provider_limits` bloğunu türet ve yaz (sahip onaylı) | Yerel yazma | Uygula | Owner | Metin |
| [`deckent provider-observations`](#deckent-provider-observations) | Kalıcı provider-execution gözlem deposunu inceler ve taşır: şemasını ve sayımlarını okur, ileriye taşır, dış bir ön görüntüyü devralır veya kayıtlı çalışmaları uzlaştırır. | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent provider-observations inspect`](#deckent-provider-observations-inspect) | Gözlem deposunu okur; şema sürümünü ve kayıt sayımlarını bildirir. Salt okunur: asla taşımaz, devralmaz veya yazmaz. | Salt-okunur | Oku | Owner | Metin ve JSON |
| [`deckent provider-observations migrate`](#deckent-provider-observations-migrate) | Gözlem deposunu geçerli şema sürümüne taşır. Varsayılan olarak taşımayı planlar ve yazdırır; --apply bunu bir onay altında uygular. | Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON |
| [`deckent provider-observations adopt`](#deckent-provider-observations-adopt) | Dış bir gözlem ön görüntüsünü kalıcı kayıtlar olarak depoya devralır. Varsayılan olarak planlar; --apply devralmayı uygular. | Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON |
| [`deckent provider-observations adopt-runtime`](#deckent-provider-observations-adopt-runtime) | Çalışma zamanının ürettiği bir gözlem ön görüntüsünü, çalışma zamanının kendi yürütme kimliğini koruyarak devralır. Varsayılan olarak planlar; --apply devralmayı uygular. | Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON |
| [`deckent provider-observations reconcile`](#deckent-provider-observations-reconcile) | Kayıtlı gözlemleri iddia ettikleri çalışmalarla karşılaştırır ve her uyuşmazlığı bildirir. Varsayılan olarak planlar; --apply uzlaştırmayı yazar. | Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON |
| [`deckent execution-authority`](#deckent-execution-authority) | Proje execution authority bağlarını incele ve uzlaştır | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent execution-authority mount-adopt`](#deckent-execution-authority-mount-adopt) | Execution authority'yi değiştirmeden namespace-local Linux/WSL mount metadata'sını uzlaştır | Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON |
| [`deckent cu-status`](#deckent-cu-status) | Computer-use yapılandırmasını ve her yeteneğin kullanılabilirliğini gösterin | Salt-okunur | Oku | Açık | Metin ve JSON |
| [`deckent local-llm`](#deckent-local-llm) | Proje kapsamlı local LLM runtime'ını yönet | Komut grubu (yalnız help) | Oku | Açık | Metin |
| [`deckent local-llm start`](#deckent-local-llm-start) | Yapılandırılmış local LLM sunucusunu başlat | Process kontrolü | Uygula | Operator | Metin |
| [`deckent local-llm status`](#deckent-local-llm-status) | Local LLM sağlığını ve sunduğu modelleri incele | Salt-okunur | Oku | Açık | Metin |
| [`deckent local-llm stop`](#deckent-local-llm-stop) | Proje kapsamlı local LLM sunucusunu durdur | Process kontrolü | Uygula | Operator | Metin |
| [`deckent help-info`](#deckent-help-info) | Hızlı başvuru yardımını gösterin (yerelleştirilmiş) | Salt-okunur | Oku | Açık | Metin |

---

<a id="deckent-init"></a>
## `deckent init`

Yeni bir Deckent projesi başlatın

**Usage:** `deckent init`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--auto` | Öneri üretmek için sistemi, aboneliği ve projeyi otomatik algıla |
| `--manual` | Otomatik algılamayı atla, yalnızca etkileşimli soruları kullan |
| `--cursor` | Cursor IDE ortamı için yapılandır |
| `--claude-code` | Claude Code ortamı için yapılandır (varsayılan) |
| `--env <envs>` | Yapılandırılacak ortamlar, virgülle ayrılmış (codex,cursor,gemini,vscode,shell) |
| `--all-envs` | TÜM ortam yapılandırmalarını hazırla |
| `--upgrade` | Kullanıcı özelleştirmelerini koruyarak mevcut dosyaları güncelle (birleştirme stratejisi) |
| `--force` | Mevcut ortam dosyalarını uyarmadan zorla üzerine yaz |
| `--repair` | Hangi init adımlarının başarısız olduğunu ve nasıl düzeltileceğini göster |
| `-y, --yes` | Etkileşimsiz varsayılanları kullan; eksik önkoşulları asla kurma |
| `--install` | Desteklenen eksik önkoşulları açık yetkiyle ve sormadan kur |
| `--no-install` | Eksik önkoşulları algıla ancak asla kurma |
| `--no-image` | Opsiyonel worker Docker imajı derleme teklifini atla (soru sorulmaz) |

---

<a id="deckent-start"></a>
## `deckent start`

Yeni bir sprint başlatın (zero-config mod için isteğe bağlı tek satırlık açıklamayla)

**Usage:** `deckent start [description]`

### Ayrıntılar

Yeni işi planlar veya açıkça onaylanmış bir RunFlow’u tüketir, yapılandırılmış admission check’lerini uygular ve worker’ları seçili backend üzerinden dispatch eder. Dry-run dispatch yapmadan planlar; gizli exact-start capability’leri coordinator’a aittir ve elle girilmez.

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Stream | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--auto-approve` | Worker eylemlerini otomatik onayla (--dangerously-skip-permissions) |
| `--sandbox-mode` | Sandbox modunda çalıştır (git stash + geri yükleme) |
| `--sandbox` | Sandbox spawn backend’ini kullan (bellek sınırı + yol hapsi yalıtımı, Docker gerekmez) |
| `--dry-run` | Worker başlatmadan sprint’i planla |
| `--force` | Doctor ön uçuş kontrollerini atla |
| `--force-scope` | Spawn öncesi kapsam kapısını atla (var olmayan / yazım hatası gibi görünen yazma yollarına izin ver) |
| `--force-prompt-gate` | Plan zamanı prompt-gate BLOCK kararını atla (persona-yetenek uyuşmazlığı) |
| `--force-replan` | Onaylı-flow korumasını bilinçli olarak atla: onaylanmış ve henüz çalıştırılmamış bir RunFlow anlık görüntüsü olsa bile sıfırdan planla |
| `--consume-approved <flowId>` | Onaylanmış ve henüz çalıştırılmamış belirli bir RunFlow anlık görüntüsünü canonical run-flow mekanizmasıyla tüket (yalnızca birden çok onaylı flow varsa gerekir) |
| `--watch` | Sprint worker’ları başlattıktan sonra izleme modunu otomatik aç |
| `--timeout <ms>` | Milisaniye cinsinden sprint zaman aşımı (varsayılan: 30 dakika) |
| `--force-directives` | Zero-config modda mevcut DIRECTIVES.md dosyasını geçersiz kıl |
| `--flow-id <id>` | Sıfırdan planlamak yerine onaylı bir RunFlow anlık görüntüsünü tüket — --revision, --plan-digest ve config.terminal.run_flow_v2=true gerektirir |
| `--revision <n>` | Onaylı anlık görüntüye karşı CAS ile doğrulanacak RunFlow öneri revizyonu (--flow-id ile kullanılır) |
| `--plan-digest <digest>` | Onaylı anlık görüntüye karşı CAS ile doğrulanacak RunFlow planDigest değeri (--flow-id ile kullanılır) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[description]` | Zero-config mod için tek satırlık sprint açıklaması; DIRECTIVES.md üzerinden planlamak için boş bırakın | Hayır | Hayır |

---

<a id="deckent-plan"></a>
## `deckent plan`

Bir sprint'i çalıştırmadan planlayın

**Usage:** `deckent plan`

### Ayrıntılar

Etkin directives üzerinden canonical task planını kurar. Dry-run task file yazmadan gösterir; normal execution plan artifact’larını persist etmeden önce komutun approval ve exact-projection check’lerini uygular.

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--no-confirm` | Onayı atla, planı otomatik onayla |
| `-y, --yes` | Etkileşimsiz: planı soru sormadan otomatik onayla (DRAFT → PENDING) |
| `--structured` | Yapısal ayrıştırmayı zorla (AI’ı atla) |
| `--dry-run` | Görev dosyalarını diske yazmadan planı göster |
| `--interrogate` | Planlamadan önce direktifleri yapısal sorularla sorgula |
| `--force-prompt-gate` | Plan zamanı prompt-gate BLOCK kararını atla (persona-yetenek uyuşmazlığı) |
| `--force-scope` | Bu exact plan için şüpheli kapsam yollarını açıkça kabul et |
| `--write-allowlist <paths...>` | Exact planı mevcut dosyalardan oluşan kapalı write allowlist’e bağla; option sonrasında path’leri sıralayın |
| `--adopt-existing <sprintId>` | Mevcut legacy Sprint projection’ını bu exact planla açıkça reconcile et |
| `--expected-plan-digest <sha256>` | Adoption için gerekli, owner tarafından gözlemlenmiş V4 execution-plan digest’i |
| `--expected-projection-digest <sha256>` | Adoption için gerekli, owner tarafından gözlemlenmiş legacy task-projection digest’i |
| `--expected-canonical-projection-digest <sha256>` | Adoption için gerekli, owner tarafından gözlemlenmiş reconciliation-sonrası task-projection digest’i |
| `--adoption-actor <actorId>` | Projection adoption’ını yetkilendiren kalıcı owner/principal kimliği |
| `--adoption-justification <text>` | Tek seferlik projection adoption için bağlanan operator gerekçesi |

---

<a id="deckent-status"></a>
## `deckent status`

Güncel run dashboard'ını göster

**Usage:** `deckent status`

### Ayrıntılar

Geçerli run lifecycle, logical task progress, worker evidence ve alert projeksiyonunu üretir. Metin görünümleri operator içindir; --json makine-okur read model üretir, --watch ve --follow ise terminali bağlı tutar.

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--watch` | Kesilene kadar render edilmiş status snapshot’ını iki saniyede bir yeniler. |
| `-f, --follow` | Geçerli snapshot’ı yazdırır, ardından yeni eklenen run event’lerini stream eder. |
| `--json` | Canonical status read modelini render edilmiş dashboard yerine JSON olarak yazar. |
| `--raw` | Compatibility için eski ham dashboard projeksiyonunu render eder. |
| `--verbose` | Ayrıntılı agent, skill ve assignment kanıtını dahil eder. |
| `--no-color` | Render edilmiş metin çıktısında ANSI rengini devre dışı bırakır. |
| `--graph` | Etkin run dependency graph’ını Mermaid metni olarak render eder. |
| `--mode <mode>` | Handler’ın şu anda kabul ettiği render identifier’ını seçer: explainatory (açıklamalı görünüm), standart (standard görünüm), verbose veya json. |

---

<a id="deckent-inspect"></a>
## `deckent inspect`

Canonical run veya görev ayrıntısını incele

**Usage:** `deckent inspect [taskId]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Makine tarafından okunabilir JSON çıktısı üret |
| `--follow` | Canlı inspector revizyonlarını takip et |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[taskId]` | İncelenecek görev; canonical run listesini incelemek için boş bırakın | Hayır | Hayır |

---

<a id="deckent-attach"></a>
## `deckent attach`

tmux orchestra oturumuna bağlanın

**Usage:** `deckent attach`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--list` | Hiçbir oturuma bağlanmadan tüm tmux pencerelerini listele |

---

<a id="deckent-spawn"></a>
## `deckent spawn`

Bir görev için elle worker başlatın (docker backend'inde worker çıkana kadar BLOKLAR; tmux/subprocess'te fire-and-forget)

**Usage:** `deckent spawn <taskId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--force` | Görev DONE veya NO_GO olsa bile yeniden başlatmayı zorla |
| `--auto-approve` | Worker için auto-approve modunu etkinleştir |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<taskId>` | Worker’ın başlatılacağı görev | Evet | Hayır |

---

<a id="deckent-kill"></a>
## `deckent kill`

Çalışan bir worker'ı sonlandırın

**Usage:** `deckent kill [taskId]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--all` | Tüm etkin worker’ları sonlandır |
| `--force` | Zorla sonlandır (panik korumasını atla) |
| `--user-explicit` | Panik sonlandırma geçersiz kılma için açık kullanıcı onayı |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[taskId]` | Sonlandırılacak worker görevi; her etkin worker’ı sonlandırmak için --all ile birlikte boş bırakın | Hayır | Hayır |

---

<a id="deckent-retro"></a>
## `deckent retro`

En son sprint retrospektifini gösterin

**Usage:** `deckent retro`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--raw` | Render edilmiş projeksiyon yerine kayıtlı RETRO.md kaynağını yazdır |
| `--compare` | Önceki sprint entry’sine karşı bir delta projeksiyonu ekle |
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |
| `--perf` | Agent ve skill performans projeksiyonlarını ekle |
| `--trend [n]` | Son N sprint entry’si boyunca başarı oranı trend projeksiyonu ekle (varsayılan: 5) |

---

<a id="deckent-cleanup"></a>
## `deckent cleanup`

Sprint sonrası temizlik yapın

**Usage:** `deckent cleanup`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--decay` | Cleanup sırasında yapılandırılmış bellek ve debt decay geçişini zorlar; yönetilen Brain projeksiyonları yeniden yazılabilir. |
| `--dry-run` | Cleanup işleminin kaldıracağı task, lock, prompt ve session artifact’larını önizler; hiçbir şey yazmaz. |
| `--history` | Sınırlı runtime-history saklama planı üretir; --apply verilmedikçe komut dry-run olarak kalır. |
| `--apply` | --plan-digest ile tanımlanan runtime-history planını uygular. |
| `--plan-digest <digest>` | --apply için gereken runtime-history planının exact digest’i; değişmiş authority reddedilir. |
| `--json` | Yol içermeyen runtime-history planını veya receipt’i tek bir JSON belgesi olarak yazar. |
| `--sprint <id>` | Yalnız exact sprint ID tarafından owned artifaktları temizle |

---

<a id="deckent-doctor"></a>
## `deckent doctor`

Sistem bağımlılıklarını ve sağlığını kontrol edin

**Usage:** `deckent doctor`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--profile` | Algılanan host, runtime ve platform-adapter profilini gösterir. |
| `--legacy` | Geçerli tanılama görünümü yerine compatibility çıktı biçimini üretir. |
| `--json` | Doctor check’lerini ve kanıtlarını tek bir makine-okur JSON belgesi olarak yazar. |
| `--pre-flight` | Worker dispatch öncesinde kullanılan daha sıkı sağlık gate’lerini çalıştırır; dispatch bekletilmeliyse sıfırdan farklı çıkar. |
| `--providers` | Doctor tarafından desteklenen provider adapter’ları için binary, version, reachability ve authentication kanıtını gösterir. |
| `--memory` | Algılanan host RAM’i, kanıt kaynağını ve bundan türetilen max_workers önerisini gösterir. |
| `--ram-experiment` | Yapılandırılmış altı worker ve worker başına 2 GiB senaryosunu algılanan host RAM’e karşı değerlendirir. |
| `--fix-image` | Doctor worker image’ını eksik veya bayat bulduğunda interactive onaydan sonra image’ı yeniden oluşturur. |
| `--fix` | Güvenli yerel onarımların kapalı whitelist’ini önizler. Canlı veri silmez ve provider login yapmaz; uygulamak için --yes kullanın. |
| `-y, --yes` | --fix tarafından listelenen onarımları uygular; --fix olmadan etkisizdir. |
| `--dry-run` | --fix işlemini yazmasız önizleme olarak zorlar; --yes de verilmişse üstün gelir. |

---

<a id="deckent-config"></a>
## `deckent config`

Proje yapılandırmasını görüntüleyin veya değiştirin

**Usage:** `deckent config`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--raw` | Varsayılanlarla birleştirmeden ham proje config’ini göster |

---

<a id="deckent-config-set"></a>
## `deckent config set`

Bir yapılandırma değeri atayın

**Usage:** `deckent config set <key> <value>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<key>` | Yapılandırma anahtarı (nokta gösterimi, örn. terminal.run_flow_v2) | Evet | Hayır |
| `<value>` | Yeni değer; JSON değişmezleri ayrıştırılır, diğer her şey metin olarak saklanır | Evet | Hayır |

---

<a id="deckent-config-get"></a>
## `deckent config get`

Anahtara göre bir yapılandırma değeri okuyun (nokta gösterimini destekler)

**Usage:** `deckent config get <key>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<key>` | Yapılandırma anahtarı (nokta gösterimi, örn. terminal.run_flow_v2) | Evet | Hayır |

---

<a id="deckent-config-export"></a>
## `deckent config export`

Config'i stdout'a veya bir dosyaya aktarın

**Usage:** `deckent config export [file]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[file]` | Hedef dosya; dışa aktarımı stdout’a yazmak için boş bırakın | Hayır | Hayır |

---

<a id="deckent-config-import"></a>
## `deckent config import`

Config'i bir JSON dosyasından içe aktarın

**Usage:** `deckent config import <file>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<file>` | Proje yapılandırmasının içe aktarılacağı JSON dosyası | Evet | Hayır |

---

<a id="deckent-config-list"></a>
## `deckent config list`

Tüm config parametrelerini kategoriye göre gruplu listeleyin

**Usage:** `deckent config list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-config-keys"></a>
## `deckent config keys`

Tüm config parametre anahtarlarını listeleyin

**Usage:** `deckent config keys`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-config-migrate"></a>
## `deckent config migrate`

config.json'ı en güncel tam formata taşıyın (eksik alanları varsayılanlarla ekler)

**Usage:** `deckent config migrate`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--dry-run` | Hiçbir dosyayı değiştirmeden neyin değişeceğini göster |

---

<a id="deckent-config-nervous"></a>
## `deckent config nervous`

Nervous System yetki modunu ve aksiyon override'larını yapılandırın

**Usage:** `deckent config nervous`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-config-nervous-set"></a>
## `deckent config nervous set`

Bir nervous system yapılandırma değeri atayın

**Usage:** `deckent config nervous set <key> <value>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<key>` | Ayarlanacak yapılandırma anahtarı; örneğin mode. | Evet | Hayır |
| `<value>` | Verilen yapılandırma anahtarı altında saklanacak değer. | Evet | Hayır |

---

<a id="deckent-config-nervous-override"></a>
## `deckent config nervous override`

Aksiyon bazlı bir policy override'ı atayın

**Usage:** `deckent config nervous override <actionId> <policy>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<actionId>` | Policy override’ı değiştirilecek Nervous action kimliği. | Evet | Hayır |
| `<policy>` | Seçilen action’a atanacak override policy. | Evet | Hayır |

---

<a id="deckent-config-nervous-list"></a>
## `deckent config nervous list`

Mevcut yetki matrisini tüm preset'lerle gösterin

**Usage:** `deckent config nervous list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-config-nervous-reset"></a>
## `deckent config nervous reset`

Tüm aksiyon override'larını preset varsayılanlarına sıfırlayın

**Usage:** `deckent config nervous reset`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-history"></a>
## `deckent history`

Run geçmişini göster

**Usage:** `deckent history`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--agent <name>` | Projeksiyonu bu agent için kaydedilen entry’lere kısıtla |
| `--skill <name>` | Projeksiyonu bu skill için kaydedilen entry’lere kısıtla |
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |
| `--last <n>` | Yalnızca son N run'ı göster |
| `--trend` | Son 5 run için başarı oranı/kapsam trend analizini göster |

---

<a id="deckent-plugin"></a>
## `deckent plugin`

Plugin'leri yönetin

**Usage:** `deckent plugin`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-plugin-install"></a>
## `deckent plugin install`

npm, git URL veya yerel yoldan bir plugin kurun

**Usage:** `deckent plugin install <source>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--force` | Hata vermek yerine mevcut plugin entry’sinin üzerine yaz |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<source>` | Kurulum kaynağı: yerel bir yol ya da uzak bir plugin referansı | Evet | Hayır |

---

<a id="deckent-plugin-remove"></a>
## `deckent plugin remove`

Kurulu bir plugin'i kaldırın

**Usage:** `deckent plugin remove <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Plugin entry’sinde kayıtlı olduğu şekliyle plugin adı | Evet | Hayır |

---

<a id="deckent-plugin-update"></a>
## `deckent plugin update`

Bir plugin'i güncelleyin (mevcudu kaldırıp kaynağından yeniden kurar)

**Usage:** `deckent plugin update <source>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<source>` | Kurulum kaynağı: yerel bir yol ya da uzak bir plugin referansı | Evet | Hayır |

---

<a id="deckent-plugin-list"></a>
## `deckent plugin list`

Kurulu plugin'leri listeleyin

**Usage:** `deckent plugin list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |

---

<a id="deckent-plugin-info"></a>
## `deckent plugin info`

Plugin bilgisini gösterin (mutlak veya göreli yol kabul eder)

**Usage:** `deckent plugin info <dir>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<dir>` | İncelenecek plugin dizini | Evet | Hayır |

---

<a id="deckent-plugin-test"></a>
## `deckent plugin test`

Bir plugin'i test edin: manifest ve entrypoint doğrulanır, varsa hook'lar çalıştırılır

**Usage:** `deckent plugin test <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Plugin entry’sinde kayıtlı olduğu şekliyle plugin adı | Evet | Hayır |

---

<a id="deckent-plugin-create"></a>
## `deckent plugin create`

Yeni bir plugin iskeleti oluşturun

**Usage:** `deckent plugin create <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Yeni plugin entry’si için ad | Evet | Hayır |

---

<a id="deckent-upgrade"></a>
## `deckent upgrade`

deckent'i kendi kendine güncelleyin

**Usage:** `deckent upgrade`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--check` | Yalnızca güncelleme olup olmadığını denetle, kurma |
| `--changelog` | En son sürümün değişiklik günlüğünü göster ve çık |
| `--canary` | Canary kanalından kur (ön sürüm) |
| `--beta` | Beta kanalından kur (ön sürüm) |
| `--rollback` | Önceki sürüme geri dön |
| `--local <path>` | Yerel bir .tgz dosyasından kur (beta geliştirme) |

---

<a id="deckent-onboard"></a>
## `deckent onboard`

Onboarding sihirbazını çalıştırın

**Usage:** `deckent onboard`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--non-interactive` | Etkileşimli soruları atla, varsayılanları kullan |
| `--force` | Zaten başlatılmış olsa bile onboarding’i yeniden çalıştır |
| `--plan-only` | Soru sormadan onboarding planını yazdır (etkileşimsiz, CI/test yolu) |
| `--json` | --plan-only raporunu JSON olarak yazdır |
| `--apply` | Onboarding config planını uygula: plan önizleme -> onay -> yazma (proje kapsamı) |
| `--dry-run` | Hiçbir şey yazmadan onboarding uygulamasını önizle (--apply anlamına gelir) |
| `-y, --yes` | Uygulama onay sorusunu atla (--apply anlamına gelir) |

---

<a id="deckent-analyze"></a>
## `deckent analyze`

Proje stack'ini, boyutunu ve önerilen metodolojiyi analiz edin

**Usage:** `deckent analyze`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | `analyze-project` |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Ham JSON çıktısı ver |
| `--bootstrap-vocabulary` | Proje routing-vocabulary katmanını türet ve yaz (.deckent/routing/vocabulary.json) |

---

<a id="deckent-archive-debt"></a>
## `deckent archive-debt`

Teknik borç durumunu raporlayın (DB-first; çözülen borç memory.db içinde otomatik yönetilir)

**Usage:** `deckent archive-debt`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--count` | Tek tek entry’leri değil, yalnızca açık/çözülmüş sayılarını projekte et |
| `--before <sprint>` | Bu sprint ID’sinden önce ortaya çıkan çözülmüş entry’leri de projekte et |

---

<a id="deckent-archive"></a>
## `deckent archive`

Canonical sprint kanıt arşivlerini inceleyin, uzlaştırın ve doğrulayın

**Usage:** `deckent archive`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-archive-inspect"></a>
## `deckent archive inspect`

Arşiv durumunu değiştirmeden salt-okunur envanter oluşturun

**Usage:** `deckent archive inspect`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Tek bir sprint ID seçin |
| `--all` | Bulunan tüm sprintleri seçin |
| `--json` | Kararlı JSON çıktısı üretin |

---

<a id="deckent-archive-reconcile"></a>
## `deckent archive reconcile`

Dağınık kanıtları canonical sprint arşivlerinde uzlaştırın (varsayılan dry-run)

**Usage:** `deckent archive reconcile`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Tek bir sprint ID seçin |
| `--all` | Bulunan tüm sprintleri seçin |
| `--apply` | Uzlaştırma planını uygulayın |
| `--retire-legacy` | Canonical yayın sonrası doğrulanmış legacy kopyaları emekliye ayırın |
| `--json` | Kararlı JSON çıktısı üretin |

---

<a id="deckent-archive-verify"></a>
## `deckent archive verify`

Manifest kapsamını ve arşivlenen her artifact digest’ini doğrulayın

**Usage:** `deckent archive verify`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Tek bir sprint ID seçin |
| `--all` | Bulunan tüm sprintleri seçin |
| `--json` | Kararlı JSON çıktısı üretin |

---

<a id="deckent-archive-terminal-inspect"></a>
## `deckent archive terminal-inspect`

Durumu değiştirmeden canonical hot/archive journal eşliğini inceleyin

**Usage:** `deckent archive terminal-inspect`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Tam olarak bir sprint ID seçin |
| `--hot-journal <path>` | Bu tam hot journal yolunu kullanın |
| `--json` | Kararlı JSON çıktısı üretin |

---

<a id="deckent-archive-terminal-verify"></a>
## `deckent archive terminal-verify`

Durumu değiştirmeden terminal receipt, arşiv bütünlüğü ve Brain adoption doğrulayın

**Usage:** `deckent archive terminal-verify`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Tam olarak bir sprint ID seçin |
| `--hot-journal <path>` | Bu tam hot journal yolunu kullanın |
| `--json` | Kararlı JSON çıktısı üretin |

---

<a id="deckent-archive-terminal-repair"></a>
## `deckent archive terminal-repair`

Kanıtlanmış tek strict-prefix terminal journal’ı receipt-bound authority ile onarın

**Usage:** `deckent archive terminal-repair`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Tam olarak bir sprint ID seçin |
| `--hot-journal <path>` | Bu tam hot journal yolunu kullanın |
| `--receipt <path>` | Bu tam terminal receipt kimliğini kullanın |
| `--final-sequence <n>` | Bu final event sequence değerini zorunlu tutun |
| `--final-digest <sha256>` | Bu final event SHA-256 değerini zorunlu tutun |
| `--expected-archive-digest <sha256>` | Bu arşivlenmiş preimage SHA-256 değerini zorunlu tutun |
| `--expected-hot-digest <sha256>` | Bu hot journal SHA-256 değerini zorunlu tutun |
| `--reason <text>` | Operatör onarım nedenini kaydedin |
| `--json` | Kararlı JSON çıktısı üretin |

---

<a id="deckent-dashboard"></a>
## `deckent dashboard`

Terminal dashboard'u otomatik yenilemeyle gösterin (ayrıca bkz. deckent status --watch)

**Usage:** `deckent dashboard`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--interval <ms>` | Milisaniye cinsinden yenileme aralığı (fs.watch kullanılamadığında yedek olarak kullanılır) |
| `--no-color` | ANSI renklerini kapat (NO_COLOR ortam değişkenine de uyar) |
| `--json` | Dashboard durumunu ham JSON olarak yazdırıp çık (deckent status --raw ile aynı format) |

---

<a id="deckent-serve"></a>
## `deckent serve`

HTTP API sunucusunu SSE desteğiyle başlatın

**Usage:** `deckent serve`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--port <number>` | Kontrol paneli sunucusunun dinlediği TCP portu. |
| `--dev` | Varlık isteklerini derlenmiş paket yerine çalışan bir Vite geliştirme sunucusuna yönlendirir. |
| `--dev-port <number>` | --dev kullanıldığında Vite geliştirme sunucusunun beklendiği port. |
| `--host <addr>` | Sunucunun bağlandığı adres; geri döngü varsayılanı onu ağdan uzak tutar. |
| `--no-terminal` | Kontrol panelini gömülü web terminali olmadan sunar. |

---

<a id="deckent-sync"></a>
## `deckent sync`

Adapter dosyalarını eşitleyin ve son sprint'ten bu yana oluşan dış değişiklikleri tespit edin

**Usage:** `deckent sync`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--git-only` | Yalnızca git değişikliklerini tespit et (adapter dosya eşitlemesini atla) |
| `--adapters-only` | Yalnızca adapter dosyalarını eşitle (git değişiklik tespitini atla) |
| `--dry-run` | Hiçbir şey yazmadan değişiklikleri önizle |
| `--json` | Sonucu JSON olarak yazdır |

---

<a id="deckent-watch"></a>
## `deckent watch`

Canlı bir worker'ı --follow <taskId> ile takip edin (docker logs / tmux pane / subprocess log) veya tmux dashboard split'ini açın

**Usage:** `deckent watch`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Stream | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--follow <taskId>` | Belirli bir worker’ı canlı takip et — docker logs -f (docker backend), tmux paneli veya alt süreç logu |

---

<a id="deckent-run"></a>
## `deckent run`

Sprint döngüsü olmadan tek seferlik bir görev çalıştırın

**Usage:** `deckent run <description>`

### Ayrıntılar

Provider-backed tek bir task çalıştırır ve kayıtlı sonucunu bekler; full sprint lifecycle yürütmez. Ayrılmış start, status, retro ve history ilk kelimeleri bunun yerine compatibility subcommand seçer.

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--model <model>` | Kullanılacak model — tam sağlayıcı model kimliği (örn. claude-sonnet-5, gpt-5.6-sol). Yapılandırılmış varsayılanı kullanmak için boş bırakın. Hareketli/eski takma adlar (sonnet/opus/haiku/gpt-5/gpt-5.6) reddedilir. |
| `--provider <name>` | Açık sağlayıcı sahipliği (claude\|codex\|gemini\|cursor\|ollama\|openrouter\|local-llm) — görülmemiş sürümlü bir model kimliğini kaydetmek için gereklidir; kanonik registry'ye karşı doğrulanır. |
| `--model-effort <level>` | Yerel model muhakeme-eforu (claude: low\|medium\|high\|xhigh\|max, codex: minimal\|low\|medium\|high). Opt-in; desteklenmeyen veya geçersiz seviyeler yok sayılır |
| `--scope <dir>` | Worker kapsam dizini (varsayılan: ./) |
| `--timeout <ms>` | Milisaniye cinsinden azami bekleme süresi (varsayılan: 300000) |
| `--keep` | Tamamlandıktan sonra görev dosyalarını koru (temizliği atla) |
| `--auto-approve` | Worker’a auto-approve bayrağını geçir |
| `--verbose` | Worker log çıktısını gerçek zamanlı olarak stdout’a akıt |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<description>` | Tek seferlik görevin ne yapması gerektiği. İlk kelime start, status, retro veya history olamaz — bunlar ayrılmış alt-komut adlarıdır. | Evet | Hayır |

---

<a id="deckent-run-start"></a>
## `deckent run start`

Not: 'run start|status|retro|history', üst-düzey 'deckent start|status|retro|history' komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. 'sprint' terimi 'run' olarak yeniden adlandırılıyor.

**Usage:** `deckent run start [args...]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[args...]` | Bu takma adın devrettiği üst-düzey komuta birebir iletilen argümanlar | Hayır | Evet |

---

<a id="deckent-run-status"></a>
## `deckent run status`

Not: 'run start|status|retro|history', üst-düzey 'deckent start|status|retro|history' komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. 'sprint' terimi 'run' olarak yeniden adlandırılıyor.

**Usage:** `deckent run status [args...]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[args...]` | Bu takma adın devrettiği üst-düzey komuta birebir iletilen argümanlar | Hayır | Evet |

---

<a id="deckent-run-retro"></a>
## `deckent run retro`

Not: 'run start|status|retro|history', üst-düzey 'deckent start|status|retro|history' komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. 'sprint' terimi 'run' olarak yeniden adlandırılıyor.

**Usage:** `deckent run retro [args...]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[args...]` | Bu takma adın devrettiği üst-düzey komuta birebir iletilen argümanlar | Hayır | Evet |

---

<a id="deckent-run-history"></a>
## `deckent run history`

Not: 'run start|status|retro|history', üst-düzey 'deckent start|status|retro|history' komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. 'sprint' terimi 'run' olarak yeniden adlandırılıyor.

**Usage:** `deckent run history [args...]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[args...]` | Bu takma adın devrettiği üst-düzey komuta birebir iletilen argümanlar | Hayır | Evet |

---

<a id="deckent-runs"></a>
## `deckent runs`

Run-flow'ları listeleyin (çoklu-flow gelen kutusu) — ayrıca run bazında karar: --approve/--reject/--retire/--start

**Usage:** `deckent runs [n]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--limit <n>` | En fazla n gelen kutusu satırı göster (varsayılan: son pencere; flow-id öneki her zaman tüm flow’lar arasında çözülür) |
| `--close-stale` | Bayatlamış run’ları sınıflandır (ölü süreç / doğrulanamaz kayıt); --yes verilmedikçe dry-run |
| `--retire-superseded` | Aynı kaynak üzerine gelen daha yeni bir planın yerini aldığı onay bekleyen run’ları sınıflandır; --yes verilmedikçe dry-run |
| `--yes` | --close-stale/--retire-superseded ile: kapanışları kalıcı olarak yaz |
| `--approve` | Run #n’i onayla (YAVAŞ İLERİ; TAM YOL İLERİ için --start ekleyin) |
| `--reject` | Run #n’i reddet (DUR) |
| `--retire` | Başlatılmamış onaylı run #n’i emekliye ayır (İPTAL EDİLDİ) |
| `--reason <text>` | --reject ile birlikte kaydedilen gerekçe |
| `--start` | Onaylı run #n’i ayrık arka plan run’ı olarak başlat |
| `--diff` | Run #n’in gerçek ayak izini birleşik diff olarak göster |
| `--commit` | Run #n’in değişikliklerini önce incele sonra commit et (öneriyi gösterir, --yes verilmedikçe sorar) |
| `--message <text>` | --commit ile: önerilen mesaj yerine bu commit mesajını kullan |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[n]` | Hedeflenecek run: liste numarası veya (karar bayrakları için) benzersiz bir flowId öneki | Hayır | Hayır |

---

<a id="deckent-process"></a>
## `deckent process`

Process-mode execution yüzeyi — görev/yetenek gönderin ve durumlarını yoklayın

**Usage:** `deckent process`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-process-submit"></a>
## `deckent process submit`

Bir ExecutionRequest gönderin (policy-gated: salt-okunur olanlar otomatik çalışır, yan etkili olanlar onay için park edilir)

**Usage:** `deckent process submit <description>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--kind <kind>` | Yürütme türü: task (varsayılan), sprint, capability |
| `--scope-dir <dir>` | Kod görevi için kapsam dizini (risk sınıflandırmasını belirler) |
| `--provider <provider>` | Provider geçersiz kılma |
| `--model <model>` | Model geçersiz kılma |
| `--root <path>` | Proje kökü geçersiz kılma |
| `--lang <code>` | Dil geçersiz kılma (en\|tr) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<description>` | Gönderilen yürütmenin ne başarması gerektiği | Evet | Hayır |

---

<a id="deckent-process-status"></a>
## `deckent process status`

Önceki bir gönderimin durumunu executionId ile yoklayın

**Usage:** `deckent process status <executionId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje kökü geçersiz kılma |
| `--lang <code>` | Dil geçersiz kılma (en\|tr) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<executionId>` | `process submit` tarafından döndürülen yürütme kimliği | Evet | Hayır |

---

<a id="deckent-process-result"></a>
## `deckent process result`

Bir gönderimin tam sonucunu gösterin (status + lastResult)

**Usage:** `deckent process result <executionId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje kökü geçersiz kılma |
| `--lang <code>` | Dil geçersiz kılma (en\|tr) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<executionId>` | `process submit` tarafından döndürülen yürütme kimliği | Evet | Hayır |

---

<a id="deckent-test"></a>
## `deckent test`

Test sprint'i çalıştırın (retro yok, memory güncellemesi yok, decay yok)

**Usage:** `deckent test`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--keep` | Temizliği atla — görev dosyalarını yerinde bırak |
| `--timeout <ms>` | Milisaniye cinsinden azami sprint süresi |
| `--directives <file>` | Özel bir direktif dosyasının yolu (DIRECTIVES.md yerine geçer) |
| `--sandbox` | Çalıştırmadan önce çalışma ağacı değişikliklerini stash’le, sonra geri yükle (git stash) |
| `--model <model>` | Tüm görevleri belirli bir modeli kullanmaya zorla |
| `--reporter <format>` | Çıktı biçimi: default, junit, tap |
| `--min-coverage <percent>` | Kapsam bu yüzdenin altına düşerse başarısız say (0-100) |

---

<a id="deckent-agent"></a>
## `deckent agent`

Agent havuzunu yönetin

**Usage:** `deckent agent`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-agent-lint"></a>
## `deckent agent lint`

Agent kataloğunu denetleyin: erişilebilirlik, kapsam boşlukları, yetenek çakışmaları (V3)

**Usage:** `deckent agent lint`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |

---

<a id="deckent-agent-list"></a>
## `deckent agent list`

Havuzdaki tüm agent'ları listeleyin

**Usage:** `deckent agent list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |

---

<a id="deckent-agent-create"></a>
## `deckent agent create`

Özel bir agent oluştur (--prompt/--description ile yönlendirmeli kurulum)

**Usage:** `deckent agent create <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--model <model>` | Canonical provider API model kimliği (varsayılan: aktif config) |
| `--triggers <triggers...>` | Task routing için tetikleyici anahtar kelimeler |
| `--prompt <text>` | Agent system prompt içeriğini doğrudan ayarla (PROMPT.md dosyasına yazılır) |
| `--description <desc>` | Agent açıklamasını ayarla |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Yeni agent entry’si için ad | Evet | Hayır |

---

<a id="deckent-agent-stats"></a>
## `deckent agent stats`

Bir agent'ın sprint bazında performansını gösterin

**Usage:** `deckent agent stats <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Agent entry’sinde kayıtlı olduğu şekliyle agent adı | Evet | Hayır |

---

<a id="deckent-agent-enable"></a>
## `deckent agent enable`

Bir agent'ı etkinleştirin

**Usage:** `deckent agent enable <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Agent entry’sinde kayıtlı olduğu şekliyle agent adı | Evet | Hayır |

---

<a id="deckent-agent-disable"></a>
## `deckent agent disable`

Bir agent'ı devre dışı bırakın

**Usage:** `deckent agent disable <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Agent entry’sinde kayıtlı olduğu şekliyle agent adı | Evet | Hayır |

---

<a id="deckent-agent-delete"></a>
## `deckent agent delete`

Bir agent'ı havuzdan silin

**Usage:** `deckent agent delete <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--force` | Etkileşimli onay istemi olmadan sil |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Agent entry’sinde kayıtlı olduğu şekliyle agent adı | Evet | Hayır |

---

<a id="deckent-agent-edit"></a>
## `deckent agent edit`

Bir agent yapılandırmasını düzenleyin

**Usage:** `deckent agent edit <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--model <model>` | Agent entry’sine yeni bir model yaz |
| `--description <desc>` | Agent entry’sine yeni bir açıklama yaz |
| `--enable` | Agent entry’sini etkin olarak işaretle |
| `--disable` | Agent entry’sini devre dışı olarak işaretle |
| `--triggers <triggers...>` | Agent entry’sindeki tetikleyici anahtar kelimeleri değiştir |
| `--sync-prompt` | PROMPT.md dosyasını yeniden okuyup entry’ye systemPrompt olarak geri yaz |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Agent entry’sinde kayıtlı olduğu şekliyle agent adı | Evet | Hayır |

---

<a id="deckent-agent-reclassify"></a>
## `deckent agent reclassify`

Kayıtlı bir görev sonucunu yeniden sınıflandırın (agent/skill istatistiklerine delta uygular)

**Usage:** `deckent agent reclassify`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Kayıtlı task entry’si yeniden sınıflandırılan sprint ID |
| `--task <id>` | O sprint içindeki task ID |
| `--decision <decision>` | Yerine yazılacak değerlendirme: DONE \| GO_WITH_TECH_DEBT \| NO_GO |
| `--reason <text>` | Audit-trail entry’sine kaydedilen serbest biçimli gerekçe |
| `--no-audit` | Audit-trail entry’sini bellek deposuna yazma |

---

<a id="deckent-agent-info"></a>
## `deckent agent info`

Ayrıntılı agent bilgisini gösterin

**Usage:** `deckent agent info <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Agent entry’sinde kayıtlı olduğu şekliyle agent adı | Evet | Hayır |

---

<a id="deckent-skill"></a>
## `deckent skill`

Skill havuzunu yönetin

**Usage:** `deckent skill`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-skill-list"></a>
## `deckent skill list`

Tüm skill'leri listeleyin

**Usage:** `deckent skill list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |
| `--category <cat>` | Projeksiyonu tek bir kategoriye kısıtla |

---

<a id="deckent-skill-create"></a>
## `deckent skill create`

Özel bir skill oluşturun

**Usage:** `deckent skill create <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Yeni skill entry’si için ad | Evet | Hayır |

---

<a id="deckent-skill-install"></a>
## `deckent skill install`

Yerel yoldan veya git URL'den bir skill kurun (sürüm sabitlemeyi destekler: url#tag)

**Usage:** `deckent skill install <source>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--force` | Hata vermek yerine mevcut entry’nin üzerine yaz |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<source>` | Kurulum kaynağı: yerel bir yol ya da bir marketplace/registry referansı | Evet | Hayır |

---

<a id="deckent-skill-update"></a>
## `deckent skill update`

Kurulu bir skill'i orijinal kaynağından güncelleyin

**Usage:** `deckent skill update <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Skill entry’sinde kayıtlı olduğu şekliyle skill adı | Evet | Hayır |

---

<a id="deckent-skill-enable"></a>
## `deckent skill enable`

Bir skill'i etkinleştirin

**Usage:** `deckent skill enable <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Skill entry’sinde kayıtlı olduğu şekliyle skill adı | Evet | Hayır |

---

<a id="deckent-skill-disable"></a>
## `deckent skill disable`

Bir skill'i devre dışı bırakın

**Usage:** `deckent skill disable <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Skill entry’sinde kayıtlı olduğu şekliyle skill adı | Evet | Hayır |

---

<a id="deckent-skill-delete"></a>
## `deckent skill delete`

Bir skill'i silin

**Usage:** `deckent skill delete <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Skill entry’sinde kayıtlı olduğu şekliyle skill adı | Evet | Hayır |

---

<a id="deckent-skill-info"></a>
## `deckent skill info`

Skill ayrıntılarını gösterin

**Usage:** `deckent skill info <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--stats` | Kaydedilmiş kullanım istatistiklerini projeksiyona ekle |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Skill entry’sinde kayıtlı olduğu şekliyle skill adı | Evet | Hayır |

---

<a id="deckent-skill-search"></a>
## `deckent skill search`

Marketplace kayıt defterinde skill arayın

**Usage:** `deckent skill search <query>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--category <cat>` | Registry sonuçlarını tek bir kategoriye kısıtla |
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |
| `--limit <n>` | Sayfa başına maksimum registry sonucu |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<query>` | Yayımlanmış registry entry’lerine karşı eşleştirilen arama sorgusu | Evet | Hayır |

---

<a id="deckent-skill-publish"></a>
## `deckent skill publish`

Bir skill'i doğrulayın, imzalayın (Ed25519) ve marketplace'e yayınlayın

**Usage:** `deckent skill publish <skillPath>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--dry-run` | Registry’ye yüklemeden yerel olarak doğrula ve imzala |
| `--key-dir <dir>` | Anahtar çifti dizini (varsayılan: ~/.deckent/keys) |
| `--no-sign` | Ed25519 imzalamayı atla ve registry’ye imzasız yükle |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<skillPath>` | İmzalanıp yayımlanacak skill’in yerel yolu | Evet | Hayır |

---

<a id="deckent-review"></a>
## `deckent review`

Sprint görevlerini değerlendirmeleriyle birlikte gözden geçirin

**Usage:** `deckent review`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--auto` | Görev sonuçlarına göre otomatik onayla/reddet |
| `--json` | İnceleme durumunu JSON olarak yazdır |
| `--approve-all` | Bekleyen tüm görevleri onayla |
| `--reject-all` | Bekleyen tüm görevleri reddet |

---

<a id="deckent-finalize"></a>
## `deckent finalize`

Bir sprinti sonlandır: MEMORY.md, RETRO.md, IDENTITY.md, config ve run decay güncelle

**Usage:** `deckent finalize`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Sonlandırılacak belirli sprint kimliği (örn. sprint-063); varsayılan görevlerden otomatik algılamadır |
| `--skip-decay` | Memory/debt decay aşamasını atla |
| `--skip-hooks` | Plugin afterSprint hooklarını atla |
| `--force` | Görevler sürüyorsa veya sprint zaten sonlandıysa da sonlandır |

---

<a id="deckent-explain"></a>
## `deckent explain`

Son sprint'in ne yaptığını insan diliyle açıklayın

**Usage:** `deckent explain`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Sprint ID’si ile tek bir kayıtlı sprint entry’sini projekte et |
| `--task <taskId>` | Tek bir task ID için kayıtlı routing-decision günlüğünü projekte et |
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |
| `--verbose` | Kayıtlı tüm öğrenimleri ve tam task detayını projekte et (varsayılan öğrenimleri 3 ile sınırlar) |

---

<a id="deckent-set-directives"></a>
## `deckent set-directives`

Sprint hedeflerini DIRECTIVES.md dosyasına yazın (içerik, dosya veya stdin)

**Usage:** `deckent set-directives`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--content <string>` | Doğrudan yazılacak direktif içeriği |
| `--file <path>` | İçeriği bir dosyadan oku |

---

<a id="deckent-connect"></a>
## `deckent connect`

Provider/MCP/IDE/shell bağlantı durumunu teşhis edin (salt-okunur — hiçbir değişiklik yapılmaz)

**Usage:** `deckent connect`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--provider <name>` | Raporu tek bir provider ile sınırla (claude\|codex\|gemini) |
| `--json` | Raporu JSON olarak yazdır |

---

<a id="deckent-plan-nl"></a>
## `deckent plan-nl`

Serbest biçimli bir hedefi DIRECTIVES.md iskeletine dönüştürün (tek-görev şablonu; varsayılan önizleme)

**Usage:** `deckent plan-nl <goal>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--write` | İskeleti DIRECTIVES.md dosyasına yaz (mevcut dosya önce yedeklenir) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<goal>` | Sprint’in ne başarması gerektiğinin serbest biçimli açıklaması | Evet | Hayır |

---

<a id="deckent-do"></a>
## `deckent do`

Golden-flow: bir hedefi sprint planına dönüştürün (varsayılan dry-run önizleme; gerçekten başlatmak için --run)

**Usage:** `deckent do <goal>`

### Ayrıntılar

Tek bir goal’ü governed golden-flow önizlemesine dönüştürür. Varsayılan yazmasız önizlemedir; --run execution admission’ı açar, explicit confirmation veya --yes geçişi kontrol eder.

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Önizleme; explicit apply gerekir | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--run` | Sprint’i gerçekten onayla ve başlat (varsayılan yalnızca dry-run önizlemedir) |
| `--yes` | RunFlow (terminal.run_flow_v2) etkinken etkileşimsiz onay — gerçekten başlatmak için --run ile birlikte gereklidir; aksi hâlde dürüst bir ret döner (etkileşimli soru sorulmaz) |
| `--force-scope` | Spawn öncesi kapsam kapısını atla (ön-kapı aynası VE ayrık alt süreç) — `deckent start --force-scope` ile aynı rıza |
| `--write-allowlist <paths...>` | Exact planı mevcut dosyalardan oluşan kapalı write allowlist’e bağla; option sonrasında path’leri sıralayın |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<goal>` | Sprint’in ulaşması gereken sonuç, tek cümleyle | Evet | Hayır |

---

<a id="deckent-heartbeat"></a>
## `deckent heartbeat`

.deckent/HEARTBEAT.md içindeki proaktif heartbeat görevlerini çalıştırın

**Usage:** `deckent heartbeat`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--daemon` | Daemon modunda çalış (ön planda çalışmayı sürdürür) |
| `--interval <minutes>` | Dakika cinsinden heartbeat aralığı (varsayılan: 30) |
| `--stop` | Çalışan bir heartbeat daemon’ını durdur |

---

<a id="deckent-chat"></a>
## `deckent chat`

Deckent ile sohbet oturumu başlatın. Kurulu AI CLI'ınızı kullanır.

**Usage:** `deckent chat`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--tool <name>` | Bu oturum için başlatılacak ana AI CLI (claude \| codex \| gemini). |
| `--local` | Oturumu uzak bir sağlayıcı yerine yerel olarak barındırılan bir modele yönlendirir. Henüz kullanılabilir değil — komut bunu bildirir ve sıfırdan farklı çıkış kodu döner. |
| `--check-mcp` | Başlatmadan önce Deckent MCP sunucusunun bağlı olduğunu doğrular ve bağlı değilse başlatmayı reddeder. |
| `--resume <sessionId>` | Verilen oturum kimliğini sürdürür; oturum bağlanmadan önce son turlarını yazdırır. |
| `--resume-limit <n>` | --resume bağlanmadan önce yazdırılacak önceki tur sayısı (varsayılan: 10). |
| `--native` | Bir ana AI CLI başlatmak yerine yerleşik araç kullanım döngüsünü bu süreçte çalıştırır. |
| `--once` | Etkileşimli bir oturum tutmak yerine tek bir tur gönderip çıkar. |
| `--message <text>` | Tek turlu mod için mesaj metni; verilmesi --native --once anlamına gelir. |

---

<a id="deckent-checkpoint"></a>
## `deckent checkpoint`

İnsan checkpoint'lerini yönetin — bekleyenleri listeleyin, onaylayın veya reddedin

**Usage:** `deckent checkpoint`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-checkpoint-list"></a>
## `deckent checkpoint list`

Tüm checkpoint'leri listeleyin

**Usage:** `deckent checkpoint list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--pending` | Sadece bekleyen checkpoint'leri göster |
| `--json` | JSON olarak çıktıla |
| `--lang <code>` | Dil geçersiz kılma değeri (en\|tr) |

---

<a id="deckent-checkpoint-approve"></a>
## `deckent checkpoint approve`

Bekleyen bir checkpoint'i onaylayın

**Usage:** `deckent checkpoint approve <sprintId> <phase>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Dil geçersiz kılma değeri (en\|tr) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<sprintId>` | Checkpoint’in ait olduğu sprint | Evet | Hayır |
| `<phase>` | Checkpoint’in oluşturulduğu sprint aşaması | Evet | Hayır |

---

<a id="deckent-checkpoint-reject"></a>
## `deckent checkpoint reject`

Bekleyen bir checkpoint'i reddedin

**Usage:** `deckent checkpoint reject <sprintId> <phase>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Dil geçersiz kılma değeri (en\|tr) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<sprintId>` | Checkpoint’in ait olduğu sprint | Evet | Hayır |
| `<phase>` | Checkpoint’in oluşturulduğu sprint aşaması | Evet | Hayır |

---

<a id="deckent-docs"></a>
## `deckent docs`

Kullanıcı tanımlı dokümanları yönetin

**Usage:** `deckent docs`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-docs-add"></a>
## `deckent docs add`

Yönetilen dokümanlara bir doküman ekleyin

**Usage:** `deckent docs add <path>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--auto <sections>` | Doc runner’ın yeniden yazabileceği, virgülle ayrılmış bölüm başlıkları |
| `--protect <sections>` | Doc runner’ın asla dokunmaması gereken, virgülle ayrılmış bölüm başlıkları |
| `--skills <skills>` | Doc entry’sine iliştirilen, virgülle ayrılmış skill ID’leri |
| `--max-lines <n>` | Otomatik güncellenen bölümler için satır üst sınırı |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<path>` | Doc entry olarak takip edilecek dokümanın yolu | Evet | Hayır |

---

<a id="deckent-docs-remove"></a>
## `deckent docs remove`

Yönetilen dokümanlardan bir dokümanı kaldırın

**Usage:** `deckent docs remove <pathOrId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<pathOrId>` | Takip edilen doküman yolu veya doc entry ID’si | Evet | Hayır |

---

<a id="deckent-docs-list"></a>
## `deckent docs list`

Tüm yönetilen dokümanları listeleyin

**Usage:** `deckent docs list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-docs-update"></a>
## `deckent docs update`

Mevcut bir yönetilen dokümanın kurallarını güncelleyin

**Usage:** `deckent docs update <pathOrId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--add-auto <sections>` | Entry’ye otomatik güncellenen bölümler ekle (virgülle ayrılmış) |
| `--add-protect <sections>` | Entry’ye korumalı bölümler ekle (virgülle ayrılmış) |
| `--remove-auto <sections>` | Entry’den otomatik güncellenen bölümleri kaldır (virgülle ayrılmış) |
| `--max-lines <n>` | Otomatik güncellenen bölümler için satır üst sınırını değiştir |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<pathOrId>` | Takip edilen doküman yolu veya doc entry ID’si | Evet | Hayır |

---

<a id="deckent-docs-run"></a>
## `deckent docs run`

Yönetilen doküman güncellemelerini sprint olmadan çalıştırın

**Usage:** `deckent docs run`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--no-cache` | Çalıştırmadan önce doc önbelleğini temizle |

---

<a id="deckent-docs-track"></a>
## `deckent docs track`

Doküman tazeliğini izleyin (hash + DCR + stale)

**Usage:** `deckent docs track`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-docs-track-scan"></a>
## `deckent docs track scan`

Tüm dokümanları hash'leyin, zaman damgalayın ve sıralayın; front-matter yazın; memory.db'yi eşitleyin

**Usage:** `deckent docs track scan`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--no-write` | Tarama sonuçlarını yalnızca depoya kaydet; doküman front-matter’ına dokunma |
| `--prune` | Dokümanı artık var olmayan doc entry’lerini sil |
| `--check` | Tarama sonrasında CRITICAL_STALE bir doc entry kalırsa sıfırdan farklı çık (CI kapısı) |
| `--max-rank <n>` | --check ile birlikte, yalnızca doc_rank değeri en fazla n olan entry’lerde kapı uygula |

---

<a id="deckent-docs-track-status"></a>
## `deckent docs track status`

İzlenen dokümanları rank ve stale durumuna göre raporlayın

**Usage:** `deckent docs track status`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--stale` | Projeksiyonu DRIFT, STALE ve CRITICAL_STALE entry’lerine kısıtla |
| `--rank <n>` | Projeksiyonu doc_rank değeri en fazla n olan entry’lere kısıtla |
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |

---

<a id="deckent-docs-track-sync"></a>
## `deckent docs track sync`

Yalnız memory.db'yi güncelleyin (front-matter yazılmaz)

**Usage:** `deckent docs track sync`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-output"></a>
## `deckent output`

Belirli bir worker görevi için yakalanan çıktıyı gösterin

**Usage:** `deckent output <taskId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--tail <n>` | Kalıcı worker çıktısının son N satırını göster (varsayılan: 50) |
| `--follow` | Kalıcı çıktı dosyasını her 2 saniyede yeniden oku (yoklama; canlı sürece bağlanma değil) |
| `--sprint-id <sprintId>` | Kalıcı kanıtın okunacağı sprint (varsayılan: geçerli sprint) |
| `--json` | Ham JSON çıktısı ver |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<taskId>` | Kalıcı çıktı kanıtı okunacak worker görevi | Evet | Hayır |

---

<a id="deckent-task"></a>
## `deckent task`

Tek seferlik görevlerin değişmez settlement kanıtını incele ve uzlaştır

**Usage:** `deckent task`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-task-settle"></a>
## `deckent task settle`

Görev settlement planını incele; yalnız açık operatör beyanıyla uygula

**Usage:** `deckent task settle <taskId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--apply` | Kanıtça uygun bir uzlaştırmayı uygula (varsayılan: dry-run) |
| `--attestation-reason <text>` | Uzlaştırma için operatörün yazdığı gerekçe (--apply ile zorunlu) |
| `--operator <id>` | Sabit operatör kimliği; yalnız hash-bound opak referansı kalıcılaştırılır (--apply ile zorunlu) |
| `--reason-code <code>` | Bildirilen eventless receipt için tipli pre-dispatch nedeni (no_provider\|budget_capability_unsupported\|provider_authority_rejected\|execution_admission_rejected\|command_build_failed\|fallback_unreachable\|fallback_limit_hold\|fallback_exhausted) |
| `--json` | Kararlı makine-okunur settlement DTO çıktısı üret |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<taskId>` | Settlement kanıtı incelenecek tek seferlik görev | Evet | Hayır |

---

<a id="deckent-cost"></a>
## `deckent cost`

User Safety Shield — maliyet yönetimi ve tahmini

**Usage:** `deckent cost`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-cost-show"></a>
## `deckent cost show`

Model fiyatlandırmasını gösterin (salt-okunur)

**Usage:** `deckent cost show`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--provider <name>` | Fiyatlandırma projeksiyonunu tek bir provider ile sınırla (anthropic, openai, google) |
| `--model <id>` | Tek bir model ID için detay görünümünü projekte et |

---

<a id="deckent-cost-update"></a>
## `deckent cost update`

En güncel fiyatlandırmayı LiteLLM + OpenRouter'dan çekin

**Usage:** `deckent cost update`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--provider <name>` | Yalnızca bu provider için kayıtlı fiyatlandırmayı yenile |
| `--dry-run` | Fiyatlandırma deltasını geri yazmadan projekte et |
| `--skip-validation` | Yazmadan önceki OpenRouter delta çapraz kontrolünü atla |

---

<a id="deckent-cost-budget"></a>
## `deckent cost budget`

Maliyet bütçelerini görüntüleyin veya ayarlayın

**Usage:** `deckent cost budget`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--set <usd>` | Sprint başına maksimum bütçeyi USD olarak yaz |
| `--daily <usd>` | Günlük maksimum bütçeyi USD olarak yaz |
| `--monthly <usd>` | Aylık maksimum bütçeyi USD olarak yaz |

---

<a id="deckent-recall"></a>
## `deckent recall`

Proje belleğinde arayın — ADR'ler, sprint öğrenimleri, pattern'ler, borç

**Usage:** `deckent recall <query>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `-t, --type <types>` | Yalnızca bu entry tiplerine kısıtla, virgülle ayrılmış: adr, memory, sprint, debt, pattern |
| `-n, --limit <n>` | Projeksiyondaki eşleşen entry sayısı üst sınırı |
| `--sprint-min <n>` | Bu sprint numarasından önce kaydedilen entry’leri ele |
| `-m, --mode <mode>` | Tam metin token birleştirme: or (varsayılan, daha geniş) \| and (her token eşleşmeli) |
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<query>` | Kayıtlı bellek entry’lerine (başlık, özet, içerik) karşı eşleştirilen tam metin sorgusu | Evet | Hayır |

---

<a id="deckent-remember"></a>
## `deckent remember`

Proje belleğine bir not kaydedin

**Usage:** `deckent remember <note>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `-t, --type <type>` | Yeni satıra kaydedilen entry tipi (varsayılan: memory) |
| `--tags <tags>` | Entry ile birlikte indekslenen, virgülle ayrılmış etiketler |
| `--title <title>` | Entry başlığı (varsayılan: notun ilk 60 karakteri) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<note>` | Entry içeriği olarak saklanan not gövdesi | Evet | Hayır |

---

<a id="deckent-memory"></a>
## `deckent memory`

Memory V2 yönetimi

**Usage:** `deckent memory`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-memory-rebuild"></a>
## `deckent memory rebuild`

memory.db'yi .brain/exports/*.md dosyalarından yeniden oluşturun

**Usage:** `deckent memory rebuild`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-memory-export"></a>
## `deckent memory export`

memory.db'yi .brain/exports/*.md olarak dışa aktarın

**Usage:** `deckent memory export`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-memory-stats"></a>
## `deckent memory stats`

memory.db istatistiklerini gösterin

**Usage:** `deckent memory stats`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-memory-backup"></a>
## `deckent memory backup`

memory.db dosyasının WAL-güvenli yedeğini oluştur

**Usage:** `deckent memory backup`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--output <path>` | SQLite backup’ını üretilen proje-yerel yol yerine bu yola yazar. |
| `--checkpoint` | Backup öncesinde WAL checkpoint kanıtını yazdırır; consistency checkpoint bu bayrak verilmediğinde de çalışır. |

---

<a id="deckent-memory-relations"></a>
## `deckent memory relations`

Memory ilişkilerini yönetin

**Usage:** `deckent memory relations`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-memory-relations-list"></a>
## `deckent memory relations list`

memory.db içindeki tüm ilişkileri listeleyin

**Usage:** `deckent memory relations list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-memory-relations-review"></a>
## `deckent memory relations review`

Backfill önizlemesinden gelen bekleyen ilişkileri gözden geçirin

**Usage:** `deckent memory relations review`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-trace"></a>
## `deckent trace`

Trace çıkarma, immutable migration ve yönetişimli eğitim-korpusu araçları

**Usage:** `deckent trace`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-trace-extract"></a>
## `deckent trace extract`

Claude Code oturum transkript(ler)inden aligned + general eğitim örnekleri çıkar

**Usage:** `deckent trace extract <input>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--out <dir>` | aligned.jsonl/general.jsonl için çıktı dizini |
| `--system <text>` | Her örneğin başına eklenecek system prompt (varsayılan: deckent agentic system prompt) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<input>` | Transkript JSONL dosyası ya da birden çok transkript içeren dizin yolu | Evet | Hayır |

---

<a id="deckent-trace-migrate"></a>
## `deckent trace migrate`

Geçmiş JSONL trace kayıtlarını canonical immutable projection ile uzlaştır (varsayılan dry-run)

**Usage:** `deckent trace migrate <inputs...>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--out <dir>` | Yeni, üzerine yazılmayan migration çıktı dizini |
| `--apply` | Uzlaştırılmış projection'ı yayınla; verilmezse işlem side-effect-free kalır |
| `--allow-training` | Yapısal olarak geçerli kayıtları eğitim için açıkça kabul et |
| `--weight <number>` | Pozitif eğitim ağırlığı (--allow-training gerektirir; varsayılan 1) |
| `--require-consent` | Train-ready kararı için kayıt üzerinde gözlenen consent authority iste |
| `--require-lineage` | Train-ready kararı için gözlenen run veya sprint lineage iste |
| `--exclude` | Immutable projection'ı koruyarak tüm kayıtları policy ile dışla |
| `--policy-version <id>` | Açık policy authority sürümü |
| `--contract-version <id>` | Açık migration contract sürümü |
| `--json` | Kararlı ve makine-okunur JSON üret |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<inputs...>` | Bir veya daha çok proje-relative trace dosyası ya da dizini | Evet | Evet |

---

<a id="deckent-trace-corpus"></a>
## `deckent trace corpus`

Manifest-authorized Deckent eğitim korpuslarını üret ve denetle

**Usage:** `deckent trace corpus`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-trace-corpus-build"></a>
## `deckent trace corpus build`

Doğrulanmış migration'dan fail-closed ShareGPT korpusu üret

**Usage:** `deckent trace corpus build <migration>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--out <file>` | Yeni, üzerine yazılmayan korpus çıktı dosyası |
| `--json` | Kararlı ve makine-okunur JSON üret |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<migration>` | Proje-relative canonical migration dizini | Evet | Hayır |

---

<a id="deckent-trace-corpus-lint"></a>
## `deckent trace corpus lint`

Korpus şeması, provenance, causality, secret, duplicate ve manifest uzlaşmasını doğrula

**Usage:** `deckent trace corpus lint <corpus>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--manifest <file>` | Pipeline manifest yolu (varsayılan: <corpus>.manifest.json) |
| `--json` | Kararlı ve makine-okunur JSON üret |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<corpus>` | Proje-relative ShareGPT korpus JSONL dosyası | Evet | Hayır |

---

<a id="deckent-resume"></a>
## `deckent resume`

Bir sprint'i son checkpoint'inden devam ettirin

**Usage:** `deckent resume <sprintId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--auto-approve` | Tüm worker eylemlerini otomatik onayla (izin sorularını atla) |
| `--dry-run` | Gerçekten çalıştırmadan neyin devam ettirileceğini göster |
| `--force-scope` | Sürdürürken bilinçli yeni yazma yolları için açık onayı koru |
| `--root <path>` | Proje kök dizini (varsayılan: geçerli dizin) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<sprintId>` | Devam ettirilecek sprint, sprint-<numara> biçiminde | Evet | Hayır |

---

<a id="deckent-nervous"></a>
## `deckent nervous`

Nervous System panosu — proaktif önerileri izleyin, kabul edin, reddedin

**Usage:** `deckent nervous`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-nervous-enable"></a>
## `deckent nervous enable`

Nervous System'i etkinleştirin (tek komut; varsayılan OFF kalır, insan onayı korunur)

**Usage:** `deckent nervous enable`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--mode <preset>` | Etkinleştirilecek yetki ön ayarı: strict, balanced, autopilot veya full-auto. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-nervous-accept"></a>
## `deckent nervous accept`

Bekleyen bir nervous system önerisini kabul edin

**Usage:** `deckent nervous accept <id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<id>` | Bu kararın hedeflediği Nervous action veya recommendation kimliği. | Evet | Hayır |

---

<a id="deckent-nervous-reject"></a>
## `deckent nervous reject`

Bekleyen bir nervous system önerisini reddedin

**Usage:** `deckent nervous reject <id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--reason <text>` | Kaydedilen karara birebir eklenen serbest metin gerekçe. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<id>` | Bu kararın hedeflediği Nervous action veya recommendation kimliği. | Evet | Hayır |

---

<a id="deckent-nervous-edit"></a>
## `deckent nervous edit`

Bekleyen bir öneriyi değiştirip kabul edin

**Usage:** `deckent nervous edit <id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<id>` | Bu kararın hedeflediği Nervous action veya recommendation kimliği. | Evet | Hayır |

---

<a id="deckent-nervous-undo"></a>
## `deckent nervous undo`

Yakın zamanda yapılmış geri alınabilir bir aksiyonu geri alın

**Usage:** `deckent nervous undo <action-id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<action-id>` | Geri alınacak, daha önce kaydedilmiş Nervous action kimliği. | Evet | Hayır |

---

<a id="deckent-nervous-history"></a>
## `deckent nervous history`

Nervous system aksiyon geçmişini görüntüleyin

**Usage:** `deckent nervous history`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--limit <n>` | Yazdırılacak en fazla kayıt sayısı; en yeniden başlar. |
| `--since <duration>` | Yalnızca bu süreden daha yeni kayıtları gösterir; örneğin 1d, 2h veya 30m. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-nervous-recommendations"></a>
## `deckent nervous recommendations`

Brain gelen kutusunu görüntüleyin — karar bekleyen nervous önerileri

**Usage:** `deckent nervous recommendations`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Owner | Metin | `darwin`, `linux`, `win32` | `recs` |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--all` | Kapatılmış önerileri de içerir; varsayılan olarak yalnızca açık olanlar gösterilir. |
| `--limit <n>` | Yazdırılacak en fazla kayıt sayısı; en yeniden başlar. |
| `--dismiss <id>` | Bu kimliğe veya benzersiz bir kimlik önekine sahip açık öneriyi kapatır. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-nervous-log"></a>
## `deckent nervous log`

Ham nervous system log'unu görüntüleyin

**Usage:** `deckent nervous log`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Stream | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--follow` | Süreci bağlı tutar ve yeni kayıtları eklendikçe yazdırır. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-nervous-accept-panic"></a>
## `deckent nervous accept-panic`

PanicGuard tarafından engellenmiş bir worker kill'ini onaylayın (IPC marker yazar)

**Usage:** `deckent nervous accept-panic <task-id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--reason <text>` | Kaydedilen panik onayına birebir eklenen serbest metin gerekçe. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<task-id>` | Panic action’ı kabul edilen task kimliği. | Evet | Hayır |

---

<a id="deckent-nervous-baseline-refresh"></a>
## `deckent nervous baseline-refresh`

directives_protection baseline'ını güncel DIRECTIVES.md içeriğine yenileyin

**Usage:** `deckent nervous baseline-refresh`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mode"></a>
## `deckent mode`

deckent_style al/ayarla (run (sprint) | task | process)

**Usage:** `deckent mode`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mode-show"></a>
## `deckent mode show`

Mevcut modu göster

**Usage:** `deckent mode show`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mode-sprint"></a>
## `deckent mode sprint`

Sprint moduna geç

**Usage:** `deckent mode sprint`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mode-run"></a>
## `deckent mode run`

Run moduna geç (köprü-alias — deckent_style: "sprint" olarak saklanır)

**Usage:** `deckent mode run`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mode-task"></a>
## `deckent mode task`

Task moduna geç

**Usage:** `deckent mode task`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mode-process"></a>
## `deckent mode process`

Process moduna geç (sürekli istek-işleme — ERP / otomasyon, MCP + REST üzerinden)

**Usage:** `deckent mode process`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mode-auto"></a>
## `deckent mode auto`

Bağlamdan modu otomatik algıla

**Usage:** `deckent mode auto`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mode-global"></a>
## `deckent mode global`

Genel varsayılanı ayarla (sprint|task|process)

**Usage:** `deckent mode global <style>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<style>` | Kalıcılaştırılacak global execution style: sprint, task veya process. | Evet | Hayır |

---

<a id="deckent-features"></a>
## `deckent features`

.deckent/settings/features-manifest.json içindeki özellikleri kategoriye göre listeleyin

**Usage:** `deckent features`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | `feature-query` |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `-c, --category <category>` | Projeksiyonu kategoriye göre filtrele: active, lightly_used, dormant, dead, all |
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |
| `--id <featureId>` | Tek bir feature ID için detay görünümünü projekte et |

---

<a id="deckent-truth"></a>
## `deckent truth`

Manifest truth-block'ları için 4 seviyeli feature truth-chain'i çözün (code → wired → enabled → proof)

**Usage:** `deckent truth`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Ham truth projeksiyonunu JSON olarak yazdır |
| `--check` | Ratchet: mevcut half-wire adaylarını sabitlenmiş baseline ile karşılaştır (çıkış 1 = yeni aday, çıkış 2 = baseline yok) |
| `--write` | --check ile birlikte: sabitlenmiş baseline’ı mevcut aday kümesine göre yeniden yaz (mutasyon) |

---

<a id="deckent-audit"></a>
## `deckent audit`

Bir sprint için Brain Self-Audit Gate çalıştırın veya audit log olaylarını sorgulayın/dışa aktarın/saklayın (query | compliance | forward | retention)

**Usage:** `deckent audit [sprint-id]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Önizleme; explicit apply gerekir | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Ham projeksiyonu JSON olarak yazdır ve başka hiçbir şey yazdırma |
| `--sprint <id>` | query, compliance, forward ve retention alt komutlarının kullandığı sprint ID |
| `--tenant <id>` | query yolu: yalnızca bu tenant ID için kaydedilen audit olaylarını tut |
| `--action <channel>` | query yolu: yalnızca bu action/channel için kaydedilen audit olaylarını tut |
| `--since <timestamp>` | query yolu: yalnızca bu ISO 8601 zaman damgasında veya sonrasındaki audit olaylarını tut |
| `--role <role>` | query yolu: RBAC tarafından uygulanan çağıran rolü — admin \| operator \| viewer |
| `--out <path>` | forward yolu: çıktı dosyası (varsayılan: .deckent/siem-export.jsonl) |
| `--url <url>` | forward yolu: audit kayıtlarını bir HTTP(S) SIEM uç noktasına POST et (--syslog ve --out’tan önceliklidir) |
| `--syslog <host[:port]>` | forward yolu: audit kayıtlarını RFC 5424 syslog toplayıcısına gönder (--out’tan önceliklidir) |
| `--syslog-protocol <protocol>` | forward yolu: syslog aktarım protokolü — udp \| tcp |
| `--keep-days <n>` | retention yolu: n günden eski audit olaylarını buda |
| `--keep-count <n>` | retention yolu: en yeni n olayın ötesindeki audit olaylarını arşivle |
| `--apply` | retention yolu: planı uygula — bu olmadan çalıştırma dry-run kalır |
| `--lang <code>` | Bu çağrı için dil geçersiz kılma: en \| tr |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[sprint-id]` | Denetlenecek sprint ID; query/compliance yolları için bunu boş bırakıp alt komut kullanın | Hayır | Hayır |

---

<a id="deckent-audit-verify"></a>
## `deckent audit-verify`

Kurcalama kanıtı için audit log HMAC zincirini doğrulayın

**Usage:** `deckent audit-verify`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Ham projeksiyonu JSON olarak yazdır ve başka hiçbir şey yazdırma |

---

<a id="deckent-recover"></a>
## `deckent recover`

Çökmüş veya takılmış bir sprinti canonical recovery operation ile kurtar

**Usage:** `deckent recover <sprint-id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--dry-run` | Değişiklik yapmadan kurtarmayı önizle |
| `--force` | Etkileşimli onayı atla |
| `--skip-audit` | Denetim kapısını atla |
| `--restore-tasks` | İleri kurtarma yerine görev dosyalarını pre-archive snapshot’tan geri yükle |
| `--resume` | Canonical PAUSED/ORPHANED run’ı kalıcı checkpoint üzerinden sürdür |
| `--auto-approve` | Otomatik onayı sürdürülen worker run’ına aktar |
| `--force-scope` | Sürdürürken bilinçli yeni yazma yolları için açık onayı koru |
| `--json` | Kararlı kurtarma sonucunu JSON olarak çıktıla |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<sprint-id>` | Kurtarılacak sprint | Evet | Hayır |

---

<a id="deckent-models"></a>
## `deckent models`

Model kataloğunu yönetin ve gezinin

**Usage:** `deckent models`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-models-list"></a>
## `deckent models list`

Katalogdaki kullanılabilir modelleri listeleyin

**Usage:** `deckent models list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--provider <name>` | Katalog projeksiyonunu tek bir provider ile sınırla (claude, codex, gemini, ollama, cursor) |
| `--offline` | Yalnızca önbellekteki veya paketlenmiş katalogu oku; ağa hiç çıkma |

---

<a id="deckent-models-activate"></a>
## `deckent models activate`

Tespit edilen bir modelin routing havuzuna girmesine izin verin

**Usage:** `deckent models activate <model>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--provider <name>` | Bu modeli sunan provider |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<model>` | Katalog entry’sinde kayıtlı olduğu şekliyle model ID’si | Evet | Hayır |

---

<a id="deckent-models-deactivate"></a>
## `deckent models deactivate`

Bir modeli routing havuzundan çıkarın (tespit onu görmeye devam eder)

**Usage:** `deckent models deactivate <model>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--provider <name>` | Bu modeli sunan provider |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<model>` | Katalog entry’sinde kayıtlı olduğu şekliyle model ID’si | Evet | Hayır |

---

<a id="deckent-models-activation"></a>
## `deckent models activation`

Kayıtlı model aktivasyon kararlarını gösterin (kayıtsız = aktif)

**Usage:** `deckent models activation`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-models-policy"></a>
## `deckent models policy`

Bir provider aktivasyon policy'sini gösterin veya ayarlayın (implicit-active | explicit-active)

**Usage:** `deckent models policy [provider] [mode]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[provider]` | Aktivasyon policy’si okunacak veya yazılacak provider; tümünü projekte etmek için boş bırakın | Hayır | Hayır |
| `[mode]` | Yazılacak policy modu: implicit-active \| explicit-active; mevcut modu okumak için boş bırakın | Hayır | Hayır |

---

<a id="deckent-models-active-set"></a>
## `deckent models active-set`

Çözümlenmiş owner aktif execution set'ini + snapshot digest'ini gösterin

**Usage:** `deckent models active-set`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-models-refresh"></a>
## `deckent models refresh`

Model kataloğunu zorla yenileyin (24 saatlik cache'i geçersiz kılar)

**Usage:** `deckent models refresh`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-models-tier"></a>
## `deckent models tier`

Belirli bir modelin tier'ını ID veya API ID ile sorgulayın

**Usage:** `deckent models tier <model>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--offline` | Yalnızca önbellekteki veya paketlenmiş katalogu oku; ağa hiç çıkma |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<model>` | Katalog entry’sinde kayıtlı olduğu şekliyle model ID’si | Evet | Hayır |

---

<a id="deckent-flow"></a>
## `deckent flow`

Zamanlanmış flow'ları yönetin (process modu)

**Usage:** `deckent flow`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-flow-list"></a>
## `deckent flow list`

Tüm zamanlanmış flow'ları listeleyin

**Usage:** `deckent flow list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--tenant <id>` | Listelemeyi bu kiracı kimliğine ait kayıtlarla sınırlar. |
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |

---

<a id="deckent-flow-add"></a>
## `deckent flow add`

Yeni bir zamanlanmış flow ekleyin (cron: 5 alanlı ifade, örn. "* * * * *")

**Usage:** `deckent flow add <cron> <action>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--tenant <id>` | Zamanlanmış akışın altında oluşturulduğu kiracı kimliği. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<cron>` | Scheduled flow’un ne zaman çalışacağını belirleyen cron ifadesi. | Evet | Hayır |
| `<action>` | Cron ifadesi eşleştiğinde scheduler’ın yürüttüğü action tanımı. | Evet | Hayır |

---

<a id="deckent-flow-run"></a>
## `deckent flow run`

Flow-runtime tick'ini bir kez çalıştırın (--once) veya daemon'ı başlatın

**Usage:** `deckent flow run`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--once` | Yerleşik kalmak yerine tek bir zamanlayıcı tiki çalıştırıp çıkar. |
| `--tenant <id>` | Listelemeyi bu kiracı kimliğine ait kayıtlarla sınırlar. |

---

<a id="deckent-flow-approve"></a>
## `deckent flow approve`

Bekleyen event-tetikli bir flow dispatch'ini onaylayın ki ilerleyebilsin

**Usage:** `deckent flow approve <id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<id>` | Onaylanacak scheduled-flow kimliği. | Evet | Hayır |

---

<a id="deckent-rbac"></a>
## `deckent rbac`

Rol tabanlı erişim denetimi — izinleri kontrol edin ve rolleri listeleyin

**Usage:** `deckent rbac`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-rbac-check"></a>
## `deckent rbac check`

Bir rolün bir aksiyonu gerçekleştirme iznine sahip olup olmadığını kontrol edin

**Usage:** `deckent rbac check <role> <action>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--tenant <id>` | Rol denetiminin karşısında değerlendirildiği kiracı kimliği. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<role>` | Check veya atama tarafından kullanılan RBAC role adı. | Evet | Hayır |
| `<action>` | İzni denetlenen korumalı action. | Evet | Hayır |

---

<a id="deckent-rbac-roles"></a>
## `deckent rbac roles`

Tüm rolleri ve etkin izinlerini listeleyin

**Usage:** `deckent rbac roles`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-rbac-grant"></a>
## `deckent rbac grant`

Bir kullanıcıya rol atayın

**Usage:** `deckent rbac grant <user> <role>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<user>` | Role ataması değiştirilecek user kimliği. | Evet | Hayır |
| `<role>` | Check veya atama tarafından kullanılan RBAC role adı. | Evet | Hayır |

---

<a id="deckent-rbac-revoke"></a>
## `deckent rbac revoke`

Bir kullanıcının rol atamasını kaldırın

**Usage:** `deckent rbac revoke <user>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<user>` | Role ataması değiştirilecek user kimliği. | Evet | Hayır |

---

<a id="deckent-evolve"></a>
## `deckent evolve`

Evrim analizi — sprint'ler arası eğilimler ve prompt önerileri

**Usage:** `deckent evolve`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-evolve-report"></a>
## `deckent evolve report`

Sprint'ler arası agent/skill eğilim raporunu gösterin

**Usage:** `deckent evolve report`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `-n, --sprints <n>` | Raporun en son kaç sprinti çözümleyeceği. |
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |

---

<a id="deckent-autonomous"></a>
## `deckent autonomous`

Autonomous runtime — yetki sınırlı sürekli döngü

**Usage:** `deckent autonomous`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-autonomous-enable"></a>
## `deckent autonomous enable`

Autonomous modu etkinleştirin (config düzenlemek yerine tek komut; varsayılan OFF kalır)

**Usage:** `deckent autonomous enable`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-autonomous-start"></a>
## `deckent autonomous start`

Autonomous döngüyü başlatın (default-deny + insan onayı kapısı)

**Usage:** `deckent autonomous start`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--interval-ms <ms>` | Döngünün boştaki tikler arasında uyuduğu milisaniye. |
| `--max-iterations <n>` | Döngüyü bu kadar çevrimden sonra durdurur; operatör durdurana kadar çalışması için verilmez. |
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-autonomous-plan"></a>
## `deckent autonomous plan`

Üst düzey bir hedefi bekleyen autonomous backlog kalemlerine ayrıştırın

**Usage:** `deckent autonomous plan <goal>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--from <ref>` | Açık kontrol listesi maddeleri planı besleyen yapıt referansı (dosya veya dosya#bölüm). |
| `--policy <policy>` | Üretilen her maddeye uygulanan politika: auto, approval-required veya risk-tagged. |
| `--max-items <n>` | Planın içerebileceği madde sayısının üst sınırı. |
| `--model <model>` | Kullanılacak model — tam sağlayıcı model kimliği (örn. claude-sonnet-5, gpt-5.6-sol). Yapılandırılmış varsayılanı kullanmak için boş bırakın. Hareketli/eski takma adlar (sonnet/opus/haiku/gpt-5/gpt-5.6) reddedilir. |
| `--provider <name>` | Açık sağlayıcı sahipliği (claude\|codex\|gemini\|cursor\|ollama\|openrouter\|local-llm) — görülmemiş sürümlü bir model kimliğini kaydetmek için gereklidir; kanonik registry'ye karşı doğrulanır. |
| `--dry-run` | Planı üretir ve birikim listesine yazmadan yazdırır. |
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<goal>` | Autonomous planner’ın governed plan’a dönüştüreceği goal metni. | Evet | Hayır |

---

<a id="deckent-autonomous-status"></a>
## `deckent autonomous status`

Autonomous runtime özetini gösterin (bekleyenler + son audit olayları)

**Usage:** `deckent autonomous status`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-autonomous-stop"></a>
## `deckent autonomous stop`

Autonomous döngüye temiz şekilde durma sinyali gönderin

**Usage:** `deckent autonomous stop`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-autonomous-cleanup"></a>
## `deckent autonomous cleanup`

Başıboş autonomous run-artifact'larını (task-run-*, _*.pid) .tasks/ içinden temizleyin

**Usage:** `deckent autonomous cleanup`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-autonomous-pending"></a>
## `deckent autonomous pending`

İnsan kabul/ret kararı bekleyen park edilmiş onayları listeleyin

**Usage:** `deckent autonomous pending`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-autonomous-approve"></a>
## `deckent autonomous approve`

Park edilmiş bir tetikleyiciyi onaylayın — çalışan döngünün kapısını çözer

**Usage:** `deckent autonomous approve <triggerId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--reason <text>` | Kaydedilen tetikleyici kararına birebir eklenen serbest metin gerekçe. |
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<triggerId>` | Onaylanacak veya reddedilecek pending autonomous trigger kimliği. | Evet | Hayır |

---

<a id="deckent-autonomous-reject"></a>
## `deckent autonomous reject`

Park edilmiş bir tetikleyiciyi reddedin — çalışan döngünün kapısını çözer

**Usage:** `deckent autonomous reject <triggerId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--reason <text>` | Kaydedilen tetikleyici kararına birebir eklenen serbest metin gerekçe. |
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<triggerId>` | Onaylanacak veya reddedilecek pending autonomous trigger kimliği. | Evet | Hayır |

---

<a id="deckent-autonomous-backlog"></a>
## `deckent autonomous backlog`

Autonomous backlog'u yönetin (kayıt ekleyin / listeleyin / kaldırın)

**Usage:** `deckent autonomous backlog`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-autonomous-backlog-add"></a>
## `deckent autonomous backlog add`

Autonomous backlog'a yeni bir kayıt ekleyin

**Usage:** `deckent autonomous backlog add`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--id <id>` | Birikim listesi kaydının kimliği; liste içinde benzersiz olmalıdır. |
| `--title <title>` | Kaydın listelendiği her yerde gösterilen, insan tarafından okunabilir başlık. |
| `--kind <kind>` | Kayıt türü: task, sprint veya capability. |
| `--description <text>` | Görev açıklaması veya işi tanımlayan yönergelere bir referans. |
| `--policy <policy>` | Bu birikim listesi kaydının politikası: auto, approval-required veya risk-tagged. |
| `--cron <expr>` | Kaydı yinelemeli yapan beş alanlı cron ifadesi; tek seferlik kayıtlar için verilmez. |
| `--capability <verb>` | Çağrılacak noktalı yetenek fiili (yalnızca kind=capability), örneğin fs.read. |
| `--args <json>` | İşleyici argümanlarını içeren JSON nesnesi (yalnızca kind=capability). |
| `--connector <id>` | Yetenek için tercih edilen arka uç veya bağlayıcı (yalnızca kind=capability). |
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-autonomous-backlog-list"></a>
## `deckent autonomous backlog list`

Autonomous backlog kayıtlarını listeleyin

**Usage:** `deckent autonomous backlog list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-autonomous-backlog-remove"></a>
## `deckent autonomous backlog remove`

Autonomous backlog'dan bir kaydı kaldırın (konumsal id veya --id)

**Usage:** `deckent autonomous backlog remove [id]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--id <id>` | Kaldırılacak birikim listesi kaydının kimliği; kimliği konumsal olarak vermenin alternatifidir. |
| `--root <path>` | Proje durumunu, algılanan proje kökü yerine bu dizin altında çözer. |
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `[id]` | Kaldırılacak backlog item kimliği; bunun yerine --id de kullanılabilir. | Hayır | Hayır |

---

<a id="deckent-autonomous-mission"></a>
## `deckent autonomous-mission`

İş listelerinden veya hedeflerden oluşturulan autonomous mission'ları yönetin

**Usage:** `deckent autonomous-mission`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-autonomous-mission-create-list"></a>
## `deckent autonomous-mission create-list`

Bir veya daha fazla iş kaleminden autonomous mission oluşturun

**Usage:** `deckent autonomous-mission create-list <title>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--item <kind:spec>` | Eklenecek iş maddesi; kind veya kind:json-spec biçiminde. Her madde için bayrağı tekrarlayın. |
| `--items-file <path>` | Listenin oluşturulacağı görev maddeleri dizisini tutan JSON dosyası. |
| `--id <id>` | Görev kimliği; bayrak verilmediğinde bir tane üretilir. |
| `--tenant <tenant>` | Kaydı varsayılan kiracı yerine bu kiracı kimliği altında oluşturur. |
| `--deliver-to <channel>` | Sonuçlanan görev bildiriminin iletileceği kanal. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<title>` | Oluşturulacak mission list’in insan-okur başlığı. | Evet | Hayır |

---

<a id="deckent-autonomous-mission-create-goal"></a>
## `deckent autonomous-mission create-goal`

Hedefine ulaşılana kadar çalışan autonomous mission oluşturun

**Usage:** `deckent autonomous-mission create-goal <goal>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Autonomous loop kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--accept <criteria>` | Görevin karşısında sonuçlandırıldığı kabul ölçütleri. |
| `--title <title>` | Görev başlığı; verilmediğinde hedef metnine düşer. |
| `--id <id>` | Görev kimliği; bayrak verilmediğinde bir tane üretilir. |
| `--tenant <tenant>` | Kaydı varsayılan kiracı yerine bu kiracı kimliği altında oluşturur. |
| `--deliver-to <channel>` | Sonuçlanan görev bildiriminin iletileceği kanal. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<goal>` | Mission planner’ın ayrıştıracağı goal ifadesi. | Evet | Hayır |

---

<a id="deckent-autonomous-mission-list"></a>
## `deckent autonomous-mission list`

Tüm mission'ları listeleyin (özet tablo)

**Usage:** `deckent autonomous-mission list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |
| `--tenant <tenant>` | Listelemeyi bu kiracı kimliğine ait kayıtlarla sınırlar. |

---

<a id="deckent-bot"></a>
## `deckent bot`

Mesaj-connector botu — gelen approve/reject için listen/start/stop/status

**Usage:** `deckent bot`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-bot-listen"></a>
## `deckent bot listen`

Mesaj connector'larından gelen approve/reject komutlarını dinle

**Usage:** `deckent bot listen`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje kökü geçersiz kılma değeri |
| `--lang <code>` | Dil geçersiz kılma değeri (en\|tr) |

---

<a id="deckent-bot-start"></a>
## `deckent bot start`

Bot dinleyicisini arka plan daemon'ı olarak çalıştır

**Usage:** `deckent bot start`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje kökü geçersiz kılma değeri |
| `--lang <code>` | Dil geçersiz kılma değeri (en\|tr) |

---

<a id="deckent-bot-stop"></a>
## `deckent bot stop`

Bot daemon'ını durdur

**Usage:** `deckent bot stop`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje kökü geçersiz kılma değeri |
| `--lang <code>` | Dil geçersiz kılma değeri (en\|tr) |

---

<a id="deckent-bot-status"></a>
## `deckent bot status`

Bot daemon'ının çalışıp çalışmadığını göster

**Usage:** `deckent bot status`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--root <path>` | Proje kökü geçersiz kılma değeri |
| `--lang <code>` | Dil geçersiz kılma değeri (en\|tr) |

---

<a id="deckent-gateway"></a>
## `deckent gateway`

Proje kapsamlı mesajlaşma gateway oturumlarını ve eşleştirmeyi yönetin

**Usage:** `deckent gateway`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-gateway-listen"></a>
## `deckent gateway listen`

Gateway dinleyicisini ön planda çalıştırın (eşleşmiş tüm connector'lara bağlanır)

**Usage:** `deckent gateway listen`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-gateway-start"></a>
## `deckent gateway start`

Gateway daemon'ını arka planda başlatın

**Usage:** `deckent gateway start`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-gateway-stop"></a>
## `deckent gateway stop`

Çalışan gateway daemon'ını durdurun

**Usage:** `deckent gateway stop`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-gateway-status"></a>
## `deckent gateway status`

Gateway daemon'ının çalışıp çalışmadığını gösterin

**Usage:** `deckent gateway status`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-gateway-pair"></a>
## `deckent gateway pair`

Cihaz eşleştirme isteklerini inceler ve sonuçlandırır: bir operatör bekleyen kodları listeler, ardından birini bir projeye onaylar veya reddeder.

**Usage:** `deckent gateway pair`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-gateway-pair-list"></a>
## `deckent gateway pair list`

Bekleyen eşleşme isteklerini listeleyin

**Usage:** `deckent gateway pair list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

---

<a id="deckent-gateway-pair-approve"></a>
## `deckent gateway pair approve`

Bir eşleşme isteğini onaylayın ve bir projeye bağlayın

**Usage:** `deckent gateway pair approve <code> <project>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<code>` | Pending device isteğini tanımlayan tek kullanımlık pairing code. | Evet | Hayır |
| `<project>` | Onaylanan cihazın eşleştirileceği project kimliği. | Evet | Hayır |

---

<a id="deckent-gateway-pair-reject"></a>
## `deckent gateway pair reject`

Bekleyen bir eşleşme isteğini reddedin

**Usage:** `deckent gateway pair reject <code>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <code>` | Bu komutun çıktısını proje dili yerine verilen dilde (en\|tr) üretir. |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<code>` | Pending device isteğini tanımlayan tek kullanımlık pairing code. | Evet | Hayır |

---

<a id="deckent-mcp"></a>
## `deckent mcp`

Model Context Protocol sunucularını yönetin — MCP destekleyen her host arasında taşınabilir açık bir standart

**Usage:** `deckent mcp`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-mcp-add"></a>
## `deckent mcp add`

Bir MCP sunucusu ekleyin (stdio veya http) — scope'a göre .mcp.json dosyasına yazar

**Usage:** `deckent mcp add <name> <cmdOrUrl> [args...]`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--scope <scope>` | Yazılacak yapılandırma scope’u: project \| user \| local |
| `--transport <transport>` | Taşıma: stdio \| http (verilmezse otomatik algılanır) |
| `--header <kv...>` | key=value biçiminde HTTP başlığı; birden fazlası için tekrarlayın |
| `--env <kv...>` | key=value biçiminde stdio ortam değişkeni; birden fazlası için tekrarlayın |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Seçilen scope içinde benzersiz olan sunucu adı | Evet | Hayır |
| `<cmdOrUrl>` | stdio sunucusu için başlatma komutu ya da http sunucusu için uç nokta URL’si | Evet | Hayır |
| `[args...]` | stdio sunucusu başlatma komutuna geçirilen ek argümanlar | Hayır | Evet |

---

<a id="deckent-mcp-list"></a>
## `deckent mcp list`

Kayıtlı MCP sunucularını listeleyin (birleşik: local > project > user)

**Usage:** `deckent mcp list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |

---

<a id="deckent-mcp-remove"></a>
## `deckent mcp remove`

Bir MCP sunucusunu kaldırın (--scope verilmezse tüm scope'larda arar)

**Usage:** `deckent mcp remove <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--scope <scope>` | Kaldırmayı tek bir scope ile sınırla: project \| user \| local (varsayılan: tümünde ara) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Seçilen scope içinde benzersiz olan sunucu adı | Evet | Hayır |

---

<a id="deckent-mcp-get"></a>
## `deckent mcp get`

Bir MCP sunucusunun ayrıntılarını gösterin (birleşik görünümden)

**Usage:** `deckent mcp get <name>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Render edilmiş tablo yerine read-model projeksiyonunu JSON olarak yazdır |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<name>` | Seçilen scope içinde benzersiz olan sunucu adı | Evet | Hayır |

---

<a id="deckent-resources"></a>
## `deckent resources`

Canlı docker worker kaynak kullanımını gösterin veya kaynak log'unu analiz edin

**Usage:** `deckent resources`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--log [path]` | Kaynak günlüğünü özetler; yapılandırılan dışında bir günlüğü okumak için bir yol verin. |
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |

---

<a id="deckent-usage"></a>
## `deckent usage`

Claude Code transcript'lerinden token/limit tüketimini gösterin

**Usage:** `deckent usage`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Varsayılan salt-okunur; explicit seçenekler state değiştirebilir | Oku | Operator | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <N>` | Run N için görev bazında dökümü gösterin |
| `--since <ISO>` | Kullanım aralığının başlangıcını belirleyin (ISO tarihi) |
| `--until <ISO>` | Kullanım aralığının sonunu belirleyin (ISO tarihi) |
| `--json` | Kararlı JSON çıktısı üretin |
| `--lineage` | Arşivlenmiş soy farkındalıklı kullanım otoritesini gösterin |
| `--baseline-sprint <id>` | Temel sprint arşivini seçin |
| `--candidate-sprint <id>` | Aday sprint arşivini seçin |
| `--apply` | Digest bağlı canary makbuzu yayımlayın (varsayılan: dry-run) |
| `--decision-digest <sha256>` | Uygularken bu dry-run karar digest değerini zorunlu tutun |
| `--environment <id>` | Bu makbuz ortam kapsamını kullanın |
| `--tenant <id>` | Bu makbuz tenant kapsamını kullanın |

---

<a id="deckent-kpi"></a>
## `deckent kpi`

Mevcut (veya belirtilen) sprint için KPI karnesini gösterin

**Usage:** `deckent kpi`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--sprint <id>` | Puanlanacak sprint ID (varsayılan: mevcut sprint entry’si) |
| `--trend <kpiId>` | Tek bir KPI ID için trend serisini projekte et |
| `-n, --n <count>` | Trend projeksiyonuna dahil edilen sprint entry sayısı (varsayılan: 10) |
| `--json` | Ham projeksiyonu JSON olarak yazdır ve başka hiçbir şey yazdırma |

---

<a id="deckent-image"></a>
## `deckent image`

Worker Docker imajı yönetimi

**Usage:** `deckent image`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-image-build"></a>
## `deckent image build`

deckent-worker Docker imajını paketlenmiş Dockerfile.worker'dan derleyin

**Usage:** `deckent image build`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--tag <tag>` | Derlenecek Docker imajı etiketi (varsayılan: deckent-worker:latest) |
| `--dry-run` | Derleme yapmadan çözümlenen Dockerfile yolunu ve derleme planını yazdır (docker başlatılmaz) |
| `--with-codex` | Codex CLI'ı yükle (INSTALL_CODEX=true derleme argümanı) |
| `--with-gemini` | Gemini CLI'ı yükle (INSTALL_GEMINI=true derleme argümanı) |
| `--with-ollama` | Ollama CLI'ı yükle (INSTALL_OLLAMA=true derleme argümanı) |
| `--with-cursor` | Cursor CLI'ı yükle (INSTALL_CURSOR=true derleme argümanı) |
| `--image <tag>` | --tag için kullanımdan kaldırılmış takma ad |
| `--lang <code>` | Dil geçersiz kılma değeri (en\|tr) |

---

<a id="deckent-limits"></a>
## `deckent limits`

Canlı abonelik-penceresi kullanımını (oturum/hafta) ve yapılandırılmış start-gate eşiklerini kontrol edin

**Usage:** `deckent limits`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |

---

<a id="deckent-openrouter-probe"></a>
## `deckent openrouter-probe`

OpenRouter ücretsiz modellerini $DECK:OPENROUTER_API_KEY ile canlı yoklayın ve yerel cache'i yenileyin

**Usage:** `deckent openrouter-probe`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |

---

<a id="deckent-xverify"></a>
## `deckent xverify`

Bir iddiayı FARKLI sağlayıcıda çapraz doğrula; ALLOW/NO-GO/HOLD kararını typed kanıttan host üretir

**Usage:** `deckent xverify <claim>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--author <provider>` | İddia edilen işi yapan sağlayıcı (claude\|codex\|gemini\|cursor\|ollama\|openrouter\|local-llm) — hakem farklı olmak zorundadır. Zorunlu. |
| `--author-model <apiId>` | İddia edilen işi üreten model kimliği (kanonik sağlayıcı API id, örn. claude-opus-5) — hakem eşit veya daha yüksek yetenek tier’ında çalışmak zorundadır. Verilmezse: çözümlenen varsayılan kullanılır ve düşük-güven olarak kaydedilir. |
| `--verifier <provider>` | Açık hakem sağlayıcısı (opsiyonel; --author ile aynı olamaz; varsayılan: cross_verify.verifier_priority) |
| `--verifier-model <id>` | Açık hakem model kimliği (kanonik sağlayıcı API id, örn. gpt-5.6-sol) — tier-eşdeğerlik çözümlemesini atlar, yazar tier tabanını asla atlamaz |
| `--diff` | Hakeme kanıt bağlamı olarak `git diff HEAD` çıktısını ekle |
| `--files <csv>` | İddianın değiştirildiğini söylediği dosyaların virgülle ayrılmış listesi — --diff de verilirse, eklenen diff tam olarak bu dosyalarla sınırlanır |
| `--target <specs>` | Virgülle ayrılmış sınırlı hedefler `path:START-END` (1-tabanlı kapsayıcı satır aralığı) veya `path:symbolName` — büyük bir dosyanın elle prompt cerrahisi gerektirmemesi için tam bir kesit çıkarır |
| `--timeout <ms>` | Hakem zaman aşımı, milisaniye (varsayılan: 300000) |
| `--json` | Makine-okunur JSON çıktısı (MCP eşi / oturumlar-arası kullanım için) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<claim>` | Bağımsız provider’ın doğrulaması gereken claim veya result ifadesi. | Evet | Hayır |

---

<a id="deckent-approvals"></a>
## `deckent approvals`

Runtime-genelinde onay kutusu — bekleyen istekleri listele ve canlı-doğrulamalı local-terminal kanalından karara bağla

**Usage:** `deckent approvals`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-approvals-list"></a>
## `deckent approvals list`

Bekleyen onay isteklerini listele

**Usage:** `deckent approvals list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-approvals-decide"></a>
## `deckent approvals decide`

Bekleyen bir onay isteğini karara bağla; interaktif TTY yeniden-doğrulaması gerektirir

**Usage:** `deckent approvals decide <requestId>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--allow` | İsteği onayla |
| `--deny` | İsteği reddet |
| `--reason <text>` | Sonuçla birlikte kaydedilecek isteğe bağlı karar gerekçesi |
| `--always` | karardan sonra bu kararı kalıcı routine-seviye kurala terfi ettir (approval-rules.json) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<requestId>` | Karara bağlanacak pending approval request kimliği. | Evet | Hayır |

---

<a id="deckent-approvals-rules"></a>
## `deckent approvals rules`

Kalıcı onay kuralları (approval-rules.json) — listele, devre-dışı bırak, etkinleştir, sil

**Usage:** `deckent approvals rules`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-approvals-rules-list"></a>
## `deckent approvals rules list`

Kuralları durumlarıyla listele

**Usage:** `deckent approvals rules list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-approvals-rules-apply"></a>
## `deckent approvals rules apply`

Aktif kuralları bekleyen kutuya uygula (yalnız routine-seviye otomatikleştirilebilir türler)

**Usage:** `deckent approvals rules apply`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-approvals-rules-disable"></a>
## `deckent approvals rules disable`

Kuralı devre-dışı bırak (denetim için saklanır; her an yeniden etkinleştirilebilir)

**Usage:** `deckent approvals rules disable <id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<id>` | Etkinleştirilecek, devre dışı bırakılacak veya kaldırılacak approval-rule kimliği. | Evet | Hayır |

---

<a id="deckent-approvals-rules-enable"></a>
## `deckent approvals rules enable`

Devre-dışı kuralı yeniden etkinleştir

**Usage:** `deckent approvals rules enable <id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<id>` | Etkinleştirilecek, devre dışı bırakılacak veya kaldırılacak approval-rule kimliği. | Evet | Hayır |

---

<a id="deckent-approvals-rules-remove"></a>
## `deckent approvals rules remove`

Kuralı kalıcı olarak sil

**Usage:** `deckent approvals rules remove <id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yıkıcı process kontrolü | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<id>` | Etkinleştirilecek, devre dışı bırakılacak veya kaldırılacak approval-rule kimliği. | Evet | Hayır |

---

<a id="deckent-confirmations"></a>
## `deckent confirmations`

Custom-confirmation kutusu — bekleyen kabul-matrisi yönlendirmeleri (llm/insan/kod adapterları)

**Usage:** `deckent confirmations`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-confirmations-list"></a>
## `deckent confirmations list`

Bekleyen confirmation isteklerini listele

**Usage:** `deckent confirmations list`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-confirmations-decide"></a>
## `deckent confirmations decide`

Bir INSAN-adapter confirmation kararı ver (interaktif terminal, tek atış)

**Usage:** `deckent confirmations decide <id>`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--confirm` | CONFIRMED verdict kaydet |
| `--reject` | FAILED verdict kaydet |
| `--reason <text>` | gerekçe (settlement üzerine aynen kaydedilir) |

### Argümanlar

| Argüman | Açıklama | Zorunlu | Variadic |
|---|---|---|---|
| `<id>` | Pending confirmation kimliği; kararlar authenticated approval yüzeyine yönlendirilir. | Evet | Hayır |

---

<a id="deckent-confirmations-run"></a>
## `deckent confirmations run`

Bekleyen LLM-adapter confirmation isteklerini çapraz-sağlayıcı hakemlikten geçir (xverify runtime)

**Usage:** `deckent confirmations run`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--id <id>` | tek bir bekleyen llm confirmation isteğini işle |
| `--author <provider>` | istek yazar-sağlayıcı taşımıyorsa kullanılacak sağlayıcı |
| `--timeout <ms>` | hakem zaman aşımı (milisaniye) |

---

<a id="deckent-provider-authority"></a>
## `deckent provider-authority`

Host kapsamlı provider authority keyring'ini incele ve sağla (sahip yetkisinde)

**Usage:** `deckent provider-authority`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-provider-authority-keyring"></a>
## `deckent provider-authority keyring`

Provider authority keyring — status / init / rotate

**Usage:** `deckent provider-authority keyring`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-provider-authority-keyring-status"></a>
## `deckent provider-authority keyring status`

Keyring konumunu ve revizyon durumunu göster (anahtar materyali asla yazılmaz)

**Usage:** `deckent provider-authority keyring status`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-provider-authority-keyring-init"></a>
## `deckent provider-authority keyring init`

Keyring genesis revizyonunu sağla (sahip işlemi; varsa reddeder)

**Usage:** `deckent provider-authority keyring init`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-provider-authority-keyring-rotate"></a>
## `deckent provider-authority keyring rotate`

Aktif authority anahtarını döndür (--expect-revision gerekir)

**Usage:** `deckent provider-authority keyring rotate`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--expect-revision <hash>` | Rotasyonun uygulanacağı revizyon hash'i (`status` çıktısından) — eşzamanlı güncellemeyi ezmeyi önler |

---

<a id="deckent-provider-authority-limits"></a>
## `deckent provider-authority limits`

Provider-limit authority — `provider_limits` politikasını canlı provider gerçeğinden yaz

**Usage:** `deckent provider-authority limits`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-provider-authority-limits-init"></a>
## `deckent provider-authority limits init`

Tek bir kesin provider kapsamı için global `provider_limits` bloğunu türet ve yaz (sahip onaylı)

**Usage:** `deckent provider-authority limits init`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Uygula | Owner | Metin | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--provider <id>` | Politikanın yazılacağı kanonik provider id |
| `--model <apiId>` | Canlı limit kaynağına sorulacak kesin model api id |
| `--auth-mode <mode>` | Kesin auth modu: subscription \| api \| hybrid \| local |
| `--transport <transport>` | Kesin transport: cli \| api \| http \| local-runtime |
| `--execution-backend <backend>` | Kesin execution backend: host-subprocess \| docker \| tmux \| api \| in-process |
| `--execution-profile-ref <ref>` | Account authority kapsamındaki adapter sahipli execution profile referansı |
| `--endpoint-ref-hash <hash>` | İsteğe bağlı opak SHA-256 endpoint referansı (asla URL değil) |
| `--tenant <id>` | Politikanın yazılacağı tenant id (tek kullanıcılı host `local` kullanır) |
| `--warn-at-ratio <ratio>` | Run'ın uyarılacağı tüketim oranı (0..1) |
| `--block-at-ratio <ratio>` | Run'ın bloklanacağı tüketim oranı (0..1; warn değerinden küçük olamaz) |
| `--ratio-enforcement <mode>` | Ratio gate modu: enforce (varsayılan) veya observe_only; absolute floor ve unknown evidence yine fail-closed kalır |

---

<a id="deckent-provider-observations"></a>
## `deckent provider-observations`

Kalıcı provider-execution gözlem deposunu inceler ve taşır: şemasını ve sayımlarını okur, ileriye taşır, dış bir ön görüntüyü devralır veya kayıtlı çalışmaları uzlaştırır.

**Usage:** `deckent provider-observations`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-provider-observations-inspect"></a>
## `deckent provider-observations inspect`

Gözlem deposunu okur; şema sürümünü ve kayıt sayımlarını bildirir. Salt okunur: asla taşımaz, devralmaz veya yazmaz.

**Usage:** `deckent provider-observations inspect`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Owner | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--database <path>` | Proje varsayılanı yerine üzerinde çalışılacak gözlem veritabanının yolu. |
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |

---

<a id="deckent-provider-observations-migrate"></a>
## `deckent provider-observations migrate`

Gözlem deposunu geçerli şema sürümüne taşır. Varsayılan olarak taşımayı planlar ve yazdırır; --apply bunu bir onay altında uygular.

**Usage:** `deckent provider-observations migrate`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--database <path>` | Proje varsayılanı yerine üzerinde çalışılacak gözlem veritabanının yolu. |
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |
| `--apply` | Planlanan işlemi uygular ve sonucunu yazar. Bu bayrak olmadan komut yalnızca planlar ve yazdırır; kalıcı hiçbir şey değişmez. |
| `--plan-digest <digest>` | Bu çalışmanın eşleşmesi gereken planın özeti. Plan üretildiğinden beri depo değiştiyse işlem reddedilir. |
| `--approval-id <id>` | Yazma işlemine yetki veren onayın kimliği. --apply, hâlihazırda tutulmayan bir onaya ihtiyaç duyduğunda zorunludur. |

---

<a id="deckent-provider-observations-adopt"></a>
## `deckent provider-observations adopt`

Dış bir gözlem ön görüntüsünü kalıcı kayıtlar olarak depoya devralır. Varsayılan olarak planlar; --apply devralmayı uygular.

**Usage:** `deckent provider-observations adopt`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--database <path>` | Proje varsayılanı yerine üzerinde çalışılacak gözlem veritabanının yolu. |
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |
| `--preimage <path>` | Devralınacak gözlem ön görüntü dosyasının yolu. Kanıt olarak okunur; dosyanın kendisi asla değiştirilmez. |
| `--apply` | Planlanan işlemi uygular ve sonucunu yazar. Bu bayrak olmadan komut yalnızca planlar ve yazdırır; kalıcı hiçbir şey değişmez. |
| `--plan-digest <digest>` | Bu çalışmanın eşleşmesi gereken planın özeti. Plan üretildiğinden beri depo değiştiyse işlem reddedilir. |

---

<a id="deckent-provider-observations-adopt-runtime"></a>
## `deckent provider-observations adopt-runtime`

Çalışma zamanının ürettiği bir gözlem ön görüntüsünü, çalışma zamanının kendi yürütme kimliğini koruyarak devralır. Varsayılan olarak planlar; --apply devralmayı uygular.

**Usage:** `deckent provider-observations adopt-runtime`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--database <path>` | Proje varsayılanı yerine üzerinde çalışılacak gözlem veritabanının yolu. |
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |
| `--preimage <path>` | Devralınacak gözlem ön görüntü dosyasının yolu. Kanıt olarak okunur; dosyanın kendisi asla değiştirilmez. |
| `--apply` | Planlanan işlemi uygular ve sonucunu yazar. Bu bayrak olmadan komut yalnızca planlar ve yazdırır; kalıcı hiçbir şey değişmez. |
| `--plan-digest <digest>` | Bu çalışmanın eşleşmesi gereken planın özeti. Plan üretildiğinden beri depo değiştiyse işlem reddedilir. |

---

<a id="deckent-provider-observations-reconcile"></a>
## `deckent provider-observations reconcile`

Kayıtlı gözlemleri iddia ettikleri çalışmalarla karşılaştırır ve her uyuşmazlığı bildirir. Varsayılan olarak planlar; --apply uzlaştırmayı yazar.

**Usage:** `deckent provider-observations reconcile`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--database <path>` | Proje varsayılanı yerine üzerinde çalışılacak gözlem veritabanının yolu. |
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |
| `--run-id <id>` | Uzlaştırmayı bu çalışma kimliğiyle sınırlar. Tek geçişte birden çok çalışmayı uzlaştırmak için bayrağı tekrarlayın. |
| `--apply` | Planlanan işlemi uygular ve sonucunu yazar. Bu bayrak olmadan komut yalnızca planlar ve yazdırır; kalıcı hiçbir şey değişmez. |
| `--plan-digest <digest>` | Bu çalışmanın eşleşmesi gereken planın özeti. Plan üretildiğinden beri depo değiştiyse işlem reddedilir. |
| `--approval-id <id>` | Yazma işlemine yetki veren onayın kimliği. --apply, hâlihazırda tutulmayan bir onaya ihtiyaç duyduğunda zorunludur. |

---

<a id="deckent-execution-authority"></a>
## `deckent execution-authority`

Proje execution authority bağlarını incele ve uzlaştır

**Usage:** `deckent execution-authority`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-execution-authority-mount-adopt"></a>
## `deckent execution-authority mount-adopt`

Execution authority'yi değiştirmeden namespace-local Linux/WSL mount metadata'sını uzlaştır

**Usage:** `deckent execution-authority mount-adopt`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Yerel yazma | Önizleme; explicit apply gerekir | Owner | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--apply` | Uygun gözlemsel metadata uzlaştırmasını uygula (varsayılan: dry-run) |
| `--operator <id>` | Sabit operatör kimliği; yalnız SHA-256 özeti kalıcılaştırılır |
| `--justification <text>` | Operatörün uzlaştırma gerekçesi; yalnız SHA-256 özeti kalıcılaştırılır |
| `--json` | Kararlı makine-okunur adoption DTO çıktısı üret |

---

<a id="deckent-cu-status"></a>
## `deckent cu-status`

Computer-use yapılandırmasını ve her yeteneğin kullanılabilirliğini gösterin

**Usage:** `deckent cu-status`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin ve JSON | `darwin`, `linux`, `win32` | Yok |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--json` | Sonucu biçimli metin yerine tek bir makine tarafından okunabilir JSON belgesi olarak yazar. |

---

<a id="deckent-local-llm"></a>
## `deckent local-llm`

Proje kapsamlı local LLM runtime'ını yönet

**Usage:** `deckent local-llm`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Komut grubu (yalnız help) | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-local-llm-start"></a>
## `deckent local-llm start`

Yapılandırılmış local LLM sunucusunu başlat

**Usage:** `deckent local-llm start`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-local-llm-status"></a>
## `deckent local-llm status`

Local LLM sağlığını ve sunduğu modelleri incele

**Usage:** `deckent local-llm status`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-local-llm-stop"></a>
## `deckent local-llm stop`

Proje kapsamlı local LLM sunucusunu durdur

**Usage:** `deckent local-llm stop`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Process kontrolü | Uygula | Operator | Metin | `darwin`, `linux`, `win32` | Yok |

---

<a id="deckent-help-info"></a>
## `deckent help-info`

Hızlı başvuru yardımını gösterin (yerelleştirilmiş)

**Usage:** `deckent help-info`

### Yürütme sözleşmesi

| Etki | Varsayılan yürütme | Yetki | Çıktı | Platformlar | Alias’lar |
|---|---|---|---|---|---|
| Salt-okunur | Oku | Açık | Metin | `darwin`, `linux`, `win32` | `info` |

### Seçenekler

| Bayraklar | Açıklama |
|---|---|
| `--lang <lang>` | Hızlı başvuru için dil geçersiz kılma: en \| tr |
