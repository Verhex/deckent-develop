export interface EnrichedMeta {
  summary: string;
  hints: string[];
  timestamp: string;
}

type Enriched<T> = T & { _enriched: EnrichedMeta };

const SUMMARIES: Record<string, (response: Record<string, unknown>, lang: string) => string> = {
  set_directives: (_r, lang) =>
    lang === 'tr' ? 'Direktifler başarıyla güncellendi.' : 'Directives updated successfully.',
  plan: (_r, lang) =>
    lang === 'tr' ? 'Sprint planı oluşturuldu.' : 'Sprint plan created.',
  start: (_r, lang) =>
    lang === 'tr' ? 'Sprint başlatıldı.' : 'Sprint started.',
  status: (_r, lang) =>
    lang === 'tr' ? 'Sprint durumu alındı.' : 'Sprint status retrieved.',
  doctor: (_r, lang) =>
    lang === 'tr' ? 'Sistem sağlık kontrolü tamamlandı.' : 'System health check completed.',
  init: (_r, lang) =>
    lang === 'tr' ? 'Proje başlatıldı.' : 'Project initialized.',
  retro: (_r, lang) =>
    lang === 'tr' ? 'Retrospektif okundu.' : 'Retrospective read.',
  history: (_r, lang) =>
    lang === 'tr' ? 'Sprint geçmişi alındı.' : 'Sprint history retrieved.',
  sync: (_r, lang) =>
    lang === 'tr' ? 'Senkronizasyon tamamlandı.' : 'Synchronization completed.',
  analyze: (_r, lang) =>
    lang === 'tr' ? 'Proje analizi tamamlandı.' : 'Project analysis completed.',
  config: (_r, lang) =>
    lang === 'tr' ? 'Yapılandırma işlemi tamamlandı.' : 'Configuration operation completed.',
  usage: (_r, lang) =>
    lang === 'tr' ? 'Kullanım istatistikleri alındı.' : 'Usage statistics retrieved.',
  review: (_r, lang) =>
    lang === 'tr' ? 'Sprint incelemesi tamamlandı.' : 'Sprint review completed.',
  run: (_r, lang) =>
    lang === 'tr' ? 'Görev başlatıldı.' : 'Task started.',
  kill: (_r, lang) =>
    lang === 'tr' ? 'Worker durduruldu.' : 'Worker stopped.',
  cleanup: (_r, lang) =>
    lang === 'tr' ? 'Sprint temizliği tamamlandı.' : 'Sprint cleanup completed.',
  checkpoint: (_r, lang) =>
    lang === 'tr' ? 'Checkpoint işlemi tamamlandı.' : 'Checkpoint operation completed.',
  explain: (_r, lang) =>
    lang === 'tr' ? 'Sprint açıklaması oluşturuldu.' : 'Sprint explanation generated.',
};

const HINTS: Record<string, (response: Record<string, unknown>) => string[]> = {
  set_directives: () => ['`deckent plan` ile sprint planlayın', '`deckent start` ile başlatın'],
  plan: () => ['`deckent start` ile sprint\'i başlatın'],
  start: () => ['`deckent status --watch` ile izleyin'],
  status: () => ['`deckent retro` ile retrospektif okuyun'],
  doctor: () => ['Sorunları giderdikten sonra tekrar çalıştırın'],
  init: () => ['`deckent plan` ile ilk sprint\'i planlayın'],
  retro: () => ['Öğrenmeleri MEMORY.md\'ye ekleyin'],
  history: () => ['Trendi takip edin'],
  sync: () => ['`deckent status` ile durumu kontrol edin'],
  analyze: () => ['Önerileri uygulamak için config\'i güncelleyin'],
  config: () => ['`deckent status` ile durumu kontrol edin'],
  usage: () => ['`deckent status` ile mevcut sprint durumunu izleyin'],
  review: () => ['Onaylanan görevleri commit edin', '`deckent retro` ile retrospektif okuyun'],
  run: () => ['`deckent status` ile task durumunu izleyin'],
  kill: () => ['`deckent cleanup` ile lock dosyalarını temizleyin'],
  cleanup: () => ['`deckent status` ile yeni sprint başlatın'],
  checkpoint: () => ['`deckent checkpoint list` ile checkpoint durumunu izleyin'],
  explain: () => ['`deckent retro` ile retrospektif detaylarını okuyun', '`deckent history` ile sprint geçmişini görün'],
};

export function generateSummary(
  toolName: string,
  response: Record<string, unknown>,
  lang = 'en'
): string {
  const fn = SUMMARIES[toolName];
  if (fn) return fn(response, lang);
  return lang === 'tr'
    ? `${toolName} işlemi tamamlandı.`
    : `${toolName} operation completed.`;
}

export function generateHints(toolName: string, response: Record<string, unknown>): string[] {
  const fn = HINTS[toolName];
  return fn ? fn(response) : [];
}

export function enrichResponse<T extends Record<string, unknown>>(
  toolName: string,
  response: T,
  context?: { lang?: string }
): Enriched<T> {
  const lang = context?.lang ?? 'en';
  const meta: EnrichedMeta = {
    summary: generateSummary(toolName, response, lang),
    hints: generateHints(toolName, response),
    timestamp: new Date().toISOString(),
  };
  return { ...response, _enriched: meta } as Enriched<T>;
}
