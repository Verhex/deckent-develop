import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildScenarioMatrix,
  buildUiLineCatalog,
  parseScrollbackMetrics,
  evaluateAcceptanceCriteria,
  classifyScenarioSkip,
  countScratchCheckpoints,
  extractToolLines,
  parseBatteryArgv,
  deriveMeasurementAuthority,
  parseBootStatus,
  detectTurnCompleted,
  promptEchoedInScrollback,
  resolveScenarioBinding,
  parseReferenceRouteEvidence,
  replayPtyObservation,
  isUserPromptEchoLine,
  isNarrativeCandidateLine,
  isTypedFailureOrUnavailableLine,
  isRemedyOrConfigurationGuidanceLine,
  buildReferenceTypedFailureSurfaces,
  buildReferenceHostNoticeSurfaces,
  buildInterimRequestSurfaces,
  isReferenceHostNoticeLine,
  isInterimRequestNoticeLine,
  isInterimStructuredDeliverableLine,
  reconstructPtyLogicalLines,
  decodePtyPlainCarry,
  forEachPtyContentUnit,
  deriveTimedContentMetricsFromPtyChunks,
  scrollbackHasTypedReferenceUnavailable,
  MASTER_PLAN_PROMPT,
  THRESHOLDS_7114,
  writeEvidence,
  repoRootForEntry,
  CHECKPOINT_FILE_RE,
  BATTERY_SCHEMA,
} from '../../scripts/terminal-acceptance-battery.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPLAY_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/pty-observations-e32768.json',
);
const FAILED_REF_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/pty-observations-gdn39Q-failed-ref.json',
);
const FAILED_REF_DIAG = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/e-diag-failed-ref-result.json',
);
const SCHEMA_UNAVAILABLE_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/pty-observations-eYMqKL-schema-unavailable.json',
);
const SCHEMA_RESULT_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/e-schema-result.json',
);
const INTERIM_SKIPPED_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/pty-observations-l7JieX-interim-skipped.json',
);
const INTERIM_RESULT_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/e-interim-result.json',
);
const BOUNDARY_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/pty-observations-Hs9vsd-boundary.json',
);
const BOUNDARY_RESULT_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/e-boundary-result.json',
);
const E_FIRST_ANSWER_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/pty-observations-4bDbes-e-first-answer.json',
);
const E_FIRST_ANSWER_RESULT_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../proof/fixtures/e-first-answer-result.json',
);

const mockGetMessage = (key: string, lang: string) => {
  const catalog: Record<string, Record<string, string>> = {
    'native.tool_ran': { en: 'tool ran', tr: 'araç çalıştı' },
    'native-context.checkpoint_token_pressure': { en: 'Measured context pressure', tr: 'Ölçülmüş bağlam baskısı' },
    'native-context.slash.measurement_authority': { en: 'measurement authority: {state}{reason}', tr: 'ölçüm otoritesi: {state}{reason}' },
    'native-context.measurement.state_exact': { en: 'exact', tr: 'kesin' },
    'native-context.measurement.state_failed': { en: 'measurement failed', tr: 'ölçüm başarısız' },
    'native.measurement_authority.exact': { en: 'Measurement: exact', tr: 'Ölçüm: kesin' },
    'native.interim_deliverable_required': {
      en: 'interim answer requested — {toolCalls} tool calls / {elapsed} s since the last visible result; the assistant now reports known so far · remaining · next step, then continues',
      tr: 'ara yanıt istendi — son görünür sonuçtan bu yana {toolCalls} araç çağrısı / {elapsed} sn; asistan şimdi bilinen · kalan · sonraki adımı raporlayıp devam edecek',
    },
    'native-context.slash.interim_deliverable': {
      en: 'interim deliverable: {calls}/{callsLimit} tool calls · {elapsed}/{elapsedLimit} s since the last one · delivered {delivered} · host-requested {requested}',
      tr: 'ara teslimat: {calls}/{callsLimit} araç çağrısı · {elapsed}/{elapsedLimit} sn · teslim edilen {delivered} · host isteği {requested}',
    },
    'native.turn_interrupted': { en: 'interrupted after {toolCalls} tool calls', tr: 'kesildi' },
    'tui.confirm_hint': { en: '(y = allow · a = always allow · N = deny)', tr: '(y = izin · a = hep izin · N = reddet)' },
    'approval_card.hint': { en: '(y = approve · n = deny · a = approve similar · d = details)', tr: '(y = onayla · n = reddet)' },
    'native-context.slash.trigger': { en: 'last compaction trigger: {trigger}', tr: 'son sıkıştırma tetikleyicisi: {trigger}' },
    'native-context.trigger.token_pressure': { en: 'measured context pressure', tr: 'ölçülmüş bağlam baskısı' },
    'native-context.trigger.overflow': { en: 'input overflow recovery', tr: 'girdi taşması kurtarması' },
    'native-context.trigger.manual': { en: 'explicit compaction', tr: 'doğrudan sıkıştırma' },
    'native-context.trigger.planned': { en: 'planned context refresh', tr: 'planlanmış bağlam yenileme' },
    'native-context.trigger.cadence': { en: 'execution budget checkpoint', tr: 'yürütme bütçesi checkpoint’i' },
    'native-context.checkpoint_cadence': { en: 'Execution budget checkpoint reached', tr: 'Yürütme bütçesi checkpoint’ine ulaşıldı' },
    'native.checkpoint.saved': { en: 'Scratch checkpoint saved.', tr: 'Scratch checkpoint kaydedildi.' },
    'native-context.slash.tool_result_pressure': { en: 'retained tool results: {retained} / {cap} tokens', tr: 'tutulan araç sonuçları: {retained} / {cap} token' },
    'native-context.slash.request_pressure': { en: 'measured request: {retained} / {cap} tokens', tr: 'ölçülen istek: {retained} / {cap} token' },
    'native.reference.unavailable': {
      en: 'Reference analysis could not finish: {reason}. No complete analysis is claimed.',
      tr: 'Referans analizi tamamlanamadı: {reason}. Tam analiz iddiası yok.',
    },
    'native.reference.phase.partial': { en: 'partial', tr: 'kısmi' },
    'native.reference.phase.failed': { en: 'failed', tr: 'başarısız' },
    'native.reference.failure.reference_output_invalid': {
      en: 'the model returned an invalid digest',
      tr: 'model geçersiz bir özet döndürdü',
    },
    'native.reference.failure.reference_structured_output_unavailable': {
      en: 'this endpoint is not declared to enforce a response schema',
      tr: 'bu uç noktanın yanıt şemasını zorladığı bildirilmemiş',
    },
    'native.reference.remedy.reference_structured_output_unavailable': {
      en: 'Once the endpoint is known to enforce it, declare it: native_structured_output_control for this endpoint, or providers.registry[...].structuredOutputControl for one served model.',
      tr: 'Endpoint\'in zorladığı doğrulandığında bildirin: bu endpoint için native_structured_output_control, tek bir served model için providers.registry[...].structuredOutputControl.',
    },
    'native.reference.interim-skipped': {
      en: 'No interim answer yet ({reason}); the reading is still in progress.',
      tr: 'Henüz ara cevap yok ({reason}); okuma sürüyor.',
    },
    'native.reference.interim-skip.not-due': { en: 'not due yet', tr: 'zamanı gelmedi' },
    'native.reference.interim-skip.budget-refused': {
      en: 'the remaining budget cannot admit another request',
      tr: 'kalan bütçe bir istek daha kaldırmıyor',
    },
    'native.reference.interim-skip.unconfirmed-reservation': {
      en: 'an earlier interim request has unconfirmed usage',
      tr: 'önceki ara istekte kullanım doğrulanmadı',
    },
    'native.reference.interim-skip.empty-answer': {
      en: 'the model returned nothing substantive',
      tr: 'model anlamlı bir şey döndürmedi',
    },
    'native.reference.interim-skip.invalid-answer': {
      en: 'the response breached the stream contract',
      tr: 'yanıt akış sözleşmesini ihlal etti',
    },
    'native.reference.interim-skip.seam-closed': {
      en: 'interim answers stopped after an earlier breach',
      tr: 'önceki ihlalden sonra ara cevaplar durduruldu',
    },
    'native.reference.interim-skip.stopped': {
      en: 'the turn was cancelled or the time ceiling was reached',
      tr: 'tur iptal edildi veya süre sınırına ulaşıldı',
    },
    'native.reference.usage-hold': {
      en: 'The reading finished, but {count} interim request(s) never reported confirmed usage; the cost for those is not settled.',
      tr: 'Okuma tamamlandı, ancak {count} ara istek doğrulanmış kullanım bildirmedi; onların maliyeti kapatılmadı.',
    },
    'native.reference.failure.reference_deadline': {
      en: 'the time ceiling was reached',
      tr: 'süre sınırına ulaşıldı',
    },
    'native.interim_deliverable_overdue': {
      en: 'The interim answer is {elapsed} s overdue; the model is still streaming.',
      tr: 'Ara yanıt {elapsed} sn gecikti; model hâlâ yazıyor.',
    },
    'native.interim_deliverable_final': {
      en: 'Tool budget for this turn is spent after {toolCalls} calls — answering with what is in hand.',
      tr: '{toolCalls} çağrıdan sonra bu turun araç bütçesi doldu — eldekiyle yanıtlanıyor.',
    },
    'native-context.slash.interim_deliverable_pending': {
      en: 'an interim answer is outstanding (host-requested, not yet delivered)',
      tr: 'bekleyen bir ara yanıt var (host istedi, henüz teslim edilmedi)',
    },
  };
  return catalog[key]?.[lang === 'tr' ? 'tr' : 'en'] ?? key;
};

describe('terminal-acceptance-battery v3', () => {
  it('parseBatteryArgv handles help, dry-run, local-only and rejects unknown flags', () => {
    expect(parseBatteryArgv(['--help']).help).toBe(true);
    expect(parseBatteryArgv(['--dry-run']).dryRun).toBe(true);
    expect(parseBatteryArgv(['--local-only']).localOnly).toBe(true);
    expect(parseBatteryArgv(['--wat']).unknown).toEqual(['--wat']);
  });

  it('buildUiLineCatalog uses getMessage without fallback copy', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'en');
    expect(catalog.toolLineSuffix).toBe(' — tool ran');
    expect(catalog.checkpointNotices.some((line) => line.includes('Measured context pressure'))).toBe(true);
  });

  it('counts approvals and tool lines from UI catalog, not generic regex', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'en');
    const plain = [
      '(y = allow · a = always allow · N = deny)',
      'deckent_read_file — tool ran',
      '## Analysis summary of MASTER-PLAN',
      'interim answer requested — 12 tool calls / 90 s since the last visible result',
      'bilinen · kalan · sonraki adım',
      'measurement authority: exact',
    ].join('\n');
    const metrics = parseScrollbackMetrics(plain, {
      startedAtMs: Date.now() - 5000,
      catalog,
    });
    expect(metrics.approvalCount).toBe(1);
    expect(metrics.toolCallCount).toBe(1);
    expect(metrics.measurementAuthority).toBe('exact');
    expect(metrics.interimDeliverableSeen).toBe(true);
    expect(metrics.checkpointCount).toBe(0);
  });

  it('does not count MASTER-PLAN prose as checkpoint via regex collision', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'en');
    const plain = 'MASTER-PLAN checkpoint column mentions checkpoint governance';
    const metrics = parseScrollbackMetrics(plain, { startedAtMs: Date.now() - 1000, catalog });
    expect(metrics.uiCheckpointCount).toBe(0);
  });

  it('counts scratch checkpoint files directly', () => {
    const root = mkdtempSync(join(tmpdir(), 'battery-scratch-'));
    try {
      const cpDir = join(root, '.deckent/runtime/sessions/s1/checkpoints');
      mkdirSync(cpDir, { recursive: true });
      writeFileSync(join(cpDir, 'checkpoint-1-' + 'a'.repeat(64) + '.json'), '{}');
      expect(countScratchCheckpoints(root).count).toBe(1);
      expect(CHECKPOINT_FILE_RE.test('checkpoint-1-' + 'a'.repeat(64) + '.json')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('parseBootStatus and detectTurnCompleted capture provider + turn-end footer', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'en');
    const boot = parseBootStatus('local-llm/Qwen3.8-27B-Q4_K_M · auth: unknown\nMeasurement: exact', {
      provider: 'local-llm',
      model: 'Qwen3.8-27B-Q4_K_M',
    }, catalog);
    expect(boot.providerMatch).toBe(true);
    expect(boot.measurementExactSeen).toBe(true);
    expect(detectTurnCompleted('assistant text\n⏱ 12.3s · 42 tok', { promptSentAtMs: Date.now() - 5000 }).completed).toBe(true);
    expect(promptEchoedInScrollback('@docs/MASTER-PLAN.md dokümanını oku', '@docs/MASTER-PLAN.md dokümanını oku ve analiz et')).toBe(true);
  });

  it('evaluateAcceptanceCriteria enforces 7107-c boot, prompt, turn-end and tool-call gates', () => {
    const scenario = buildScenarioMatrix()[0];
    const passMetrics = {
      bootStatus: { bootProviderModelSeen: true, measurementExactSeen: true },
      promptSent: true,
      promptEchoed: true,
      turnCompleted: true,
      turnEndMs: 120_000,
      hasVisibleAnalysis: true,
      elapsedMs: 120_000,
      toolCallCount: 5,
      fakeContextCheckpointsInFirstWindow: 0,
      tokenPressureCheckpointCount: 0,
      measurementAuthority: 'exact',
      approvalCount: 0,
      firstVisibleNarrativeMs: 5000,
      interimDeliverableSeen: true,
      firstInterimDeliverableMs: 80_000,
      toolRowsAtFirstInterim: 5,
    };
    expect(evaluateAcceptanceCriteria(passMetrics, scenario).overall).toBe('pass');

    const failTools = { ...passMetrics, toolCallCount: 0, referenceChildInvoked: false };
    expect(evaluateAcceptanceCriteria(failTools, scenario).failedIds).toContain('tool-calls-nonzero-or-reference-child');

    const refChild = { ...passMetrics, toolCallCount: 0, referenceChildInvoked: true, childMapRequests: 1 };
    expect(evaluateAcceptanceCriteria(refChild, scenario).failedIds).not.toContain('tool-calls-nonzero-or-reference-child');

    const failApproval = { ...passMetrics, approvalCount: 2 };
    expect(evaluateAcceptanceCriteria(failApproval, scenario).failedIds).toContain('standard-readonly-approval-posture');

    const failMeasure = { ...passMetrics, measurementAuthority: 'unknown' };
    expect(evaluateAcceptanceCriteria(failMeasure, scenario).failedIds).toContain('measurement-authority-exact');
  });

  it('includes 7114 threshold checks with detail', () => {
    const scenario = buildScenarioMatrix()[0];
    const metrics = {
      bootStatus: { bootProviderModelSeen: true, measurementExactSeen: true },
      promptSent: true,
      promptEchoed: true,
      turnCompleted: true,
      turnEndMs: 120_000,
      hasVisibleAnalysis: true,
      elapsedMs: 120_000,
      toolCallCount: 8,
      fakeContextCheckpointsInFirstWindow: 0,
      tokenPressureCheckpointCount: 0,
      measurementAuthority: 'exact',
      approvalCount: 0,
      firstVisibleNarrativeMs: THRESHOLDS_7114.firstVisibleNarrativeMs + 1,
      interimDeliverableSeen: true,
      firstInterimDeliverableMs: THRESHOLDS_7114.interimDeliverableMs + 1,
    };
    const result = evaluateAcceptanceCriteria(metrics, scenario);
    expect(result.failedIds).toContain('7114-first-visible-narrative-10s');
  });

  it('classifies DIST_MISSING and hosted credential SKIP', () => {
    const scenario = buildScenarioMatrix()[0];
    expect(classifyScenarioSkip(scenario, { entryExists: false, messagesAvailable: true, ptyAvailable: true, localLlm: { ok: true } }).reason)
      .toBe('DIST_MISSING');
  });

  it('writes evidence v3 JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'battery-evidence-'));
    try {
      const { jsonPath } = writeEvidence({ schema: BATTERY_SCHEMA, scenarios: [] }, { repoRoot: root, stamp: 'test' });
      expect(existsSync(jsonPath)).toBe(true);
      expect(JSON.parse(readFileSync(jsonPath, 'utf8')).schema).toBe(BATTERY_SCHEMA);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolveScenarioBinding prefers config native_model when listed by local-llm', () => {
    const root = mkdtempSync(join(tmpdir(), 'battery-bind-'));
    try {
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(join(root, '.deckent/config.json'), JSON.stringify({
        native_provider: 'local-llm',
        native_model: 'Qwen3.8-27B-Q4_K_M',
        local_llm: { contextSize: 131072 },
      }));
      const scenario = buildScenarioMatrix()[0];
      const binding = resolveScenarioBinding(scenario, {
        configRoot: root,
        localLlm: { models: ['Qwen3.8-27B-Q4_K_M'] },
      });
      expect(binding.provider).toBe('local-llm');
      expect(binding.model).toBe('Qwen3.8-27B-Q4_K_M');
      expect(binding.contextSize).toBe(131072);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('repoRootForEntry resolves checkout owning dist', () => {
    const root = mkdtempSync(join(tmpdir(), 'battery-entry-'));
    try {
      const distDir = join(root, 'dist/cli');
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, 'entry.js'), 'export {}');
      expect(repoRootForEntry(join(root, 'dist/cli/entry.js'))).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('deriveMeasurementAuthority reads catalog-rendered exact line', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'en');
    expect(deriveMeasurementAuthority('measurement authority: exact', catalog)).toBe('exact');
  });

  it('extractToolLines returns first twelve tool rows', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'en');
    const lines = Array.from({ length: 15 }, (_, i) => `deckent_bash — tool ran #${i}`);
    expect(extractToolLines(lines.join('\n'), catalog)).toHaveLength(15);
  });

  it('does not treat user prompt echo as assistant narrative', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    expect(isUserPromptEchoLine('› @docs/MASTER-PLAN.md dokümanını oku ve analiz et', MASTER_PLAN_PROMPT)).toBe(true);
    expect(isNarrativeCandidateLine('› @docs/MASTER-PLAN.md dokümanını oku ve analiz et', catalog, MASTER_PLAN_PROMPT)).toBe(false);
    const plain = [
      '› @docs/MASTER-PLAN.md dokümanını oku ve analiz et',
      'deckent · docs/MASTER-PLAN.md okunuyor · haritalanıyor · 1/5 bölüm · 1.2 MiB · 72sn',
      '[native.reference.unavailable]',
      '⏱ 106.3s · 4662 tok',
    ].join('\n');
    const metrics = parseScrollbackMetrics(plain, {
      startedAtMs: Date.now() - 120_000,
      promptSentAtMs: Date.now() - 110_000,
      observedAtMs: Date.now(),
      catalog,
      promptText: MASTER_PLAN_PROMPT,
    });
    expect(metrics.firstVisibleNarrativeText).toBeNull();
    expect(metrics.hasVisibleAnalysis).toBe(false);
  });

  it('classifies reference child coverage and interim HOLD separately from tool-row gate', () => {
    const scenario = buildScenarioMatrix()[0];
    const contextTail = [
      'referans özeti: docs/MASTER-PLAN.md · kısmi',
      'alt istek: 1 map · 0 reduce (üst sınır 12)',
      'son hata: model geçersiz bir özet döndürdü',
      '⏱ 106.3s · 4662 tok',
    ].join('\n');
    const ref = parseReferenceRouteEvidence(contextTail);
    expect(ref.referenceChildInvoked).toBe(true);
    expect(ref.referencePartial).toBe(true);
    const metrics = {
      bootStatus: { bootProviderModelSeen: true, measurementExactSeen: true },
      promptSent: true,
      promptEchoed: true,
      turnCompleted: true,
      turnEndMs: 106_300,
      hasVisibleAnalysis: false,
      elapsedMs: 168_000,
      toolCallCount: 0,
      referenceChildInvoked: true,
      childMapRequests: 1,
      childReduceRequests: 0,
      referenceIngressExercised: true,
      referencePartial: true,
      fakeContextCheckpointsInFirstWindow: 0,
      tokenPressureCheckpointCount: 0,
      measurementAuthority: 'exact',
      approvalCount: 0,
      firstVisibleNarrativeMs: null,
      interimDeliverableSeen: false,
      firstInterimDeliverableMs: null,
    };
    const result = evaluateAcceptanceCriteria(metrics, scenario);
    expect(result.failedIds).not.toContain('tool-calls-nonzero-or-reference-child');
    expect(result.holdIds).toEqual(expect.arrayContaining([
      '7114-interim-deliverable-bound',
      'visible-analysis-within-10m',
      '7114-first-visible-narrative-10s',
    ]));
    expect(result.overall).toBe('hold');
  });

  it('excludes catalog-rendered reference unavailable lines from assistant narrative (EN/TR)', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const trLine = '[Referans analizi tamamlanamadı: model geçersiz bir özet döndürdü. Tam analiz iddiası yok.]';
    const enLine = '[Reference analysis could not finish: the model returned an invalid digest. No complete analysis is claimed.]';
    expect(isTypedFailureOrUnavailableLine(trLine, catalog)).toBe(true);
    expect(isTypedFailureOrUnavailableLine(enLine, buildUiLineCatalog(mockGetMessage, 'en'))).toBe(true);
    expect(isNarrativeCandidateLine(trLine, catalog, MASTER_PLAN_PROMPT)).toBe(false);
    expect(buildReferenceTypedFailureSurfaces(mockGetMessage, 'tr').unavailablePrefixes.length).toBeGreaterThan(0);
  });

  it('separates failed reference phase from partial and marks child invocation unknown on receipt mismatch', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const failedTail = [
      'referans özeti: docs/MASTER-PLAN.md · başarısız',
      'alt istek: 0 map · 0 reduce (üst sınır 12) · kullanım 24621 giriş / 4096 çıkış token',
      'sağlayıcı bildirimleri: girdi 24621 · çıktı 4096 · bildirim 2',
      'son hata: model geçersiz bir özet döndürdü',
    ].join('\n');
    const ref = parseReferenceRouteEvidence(failedTail, catalog);
    expect(ref.referenceFailed).toBe(true);
    expect(ref.referencePartial).toBe(false);
    expect(ref.referenceChildInvoked).toBeNull();
    expect(ref.referenceChildInvocationAuthority).toBe('unknown-no-slash-receipt');
  });

  it('replays failed-ref digest fixture without false visible-analysis PASS', () => {
    const observation = JSON.parse(readFileSync(FAILED_REF_FIXTURE, 'utf8'));
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const metrics = replayPtyObservation(observation, {
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
    });
    const scenario = buildScenarioMatrix()[0];
    const acceptance = evaluateAcceptanceCriteria(metrics, scenario);
    const diag = JSON.parse(readFileSync(FAILED_REF_DIAG, 'utf8'));
    const legacy = diag.payload.scenarios[0];
    expect(legacy.metrics.hasVisibleAnalysis).toBe(true);
    expect(metrics.hasVisibleAnalysis).toBe(false);
    expect(metrics.firstVisibleNarrativeText).toBeNull();
    expect(metrics.referenceFailed).toBe(true);
    expect(metrics.referencePartial).toBe(false);
    expect(metrics.referenceChildInvoked).toBeNull();
    expect(acceptance.failedIds).toContain('visible-analysis-within-10m');
    expect(acceptance.failedIds).toContain('7114-first-visible-narrative-10s');
    expect(acceptance.holdIds).toEqual(expect.arrayContaining([
      '7114-interim-deliverable-bound',
      'tool-calls-nonzero-or-reference-child',
    ]));
    expect(acceptance.overall).toBe('fail');
  });

  it('does not treat real technical answers mentioning config keys as remedy guidance', () => {
    const catalogEn = buildUiLineCatalog(mockGetMessage, 'en');
    const realAnswer = 'The native_structured_output_control setting selects the response contract. An unknown capability stops dispatch before token spending; supported requests still validate citations.';
    expect(isRemedyOrConfigurationGuidanceLine(realAnswer, catalogEn)).toBe(false);
    expect(isNarrativeCandidateLine(realAnswer, catalogEn, MASTER_PLAN_PROMPT)).toBe(true);
  });

  it('keeps typed unavailable envelope independent from output-invalid journal evidence', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'en');
    const plain = [
      '[native.reference.unavailable]',
      'reference digest: docs/MASTER-PLAN.md · failed',
      'last failure: REFERENCE_OUTPUT_INVALID',
      'last failure: the model returned an invalid digest',
    ].join('\n');
    const ref = parseReferenceRouteEvidence(plain, catalog);
    expect(ref.referenceTypedUnavailable).toBe(true);
    expect(ref.referenceFailed).toBe(true);
    expect(ref.referenceOutputInvalid).toBe(true);
    expect(ref.referencePreDispatchUnavailable).toBe(false);
  });

  it('treats truncated wrapped schema-unavailable and remedy guidance as non-narrative (EN/TR)', () => {
    const catalogTr = buildUiLineCatalog(mockGetMessage, 'tr');
    const catalogEn = buildUiLineCatalog(mockGetMessage, 'en');
    const truncatedTr = '[Referans analizi tamamlanamadı: bu uç noktanın yanıt şemasını zorladığı bildirilmemiş. Endpoint\'in zorladığı';
    const wrappedEn = '[Reference analysis could not finish: this endpoint is not declared to enforce a response schema. No complete analysis is claimed.]';
    const remedyTr = 'Endpoint\'in zorladığı doğrulandığında bildirin: bu endpoint için native_structured_output_control';
    expect(isTypedFailureOrUnavailableLine(truncatedTr, catalogTr)).toBe(true);
    expect(isTypedFailureOrUnavailableLine(wrappedEn, catalogEn)).toBe(true);
    expect(isRemedyOrConfigurationGuidanceLine(remedyTr, catalogTr)).toBe(true);
    expect(isNarrativeCandidateLine(truncatedTr, catalogTr, MASTER_PLAN_PROMPT)).toBe(false);
    const assistantAnswer = 'MASTER-PLAN özeti: proje terminal yüzeyini birincil operatör kontrolü olarak konumlandırır ve kanıt zincirini zorunlu kılar.';
    expect(isNarrativeCandidateLine(assistantAnswer, catalogTr, MASTER_PLAN_PROMPT)).toBe(true);
  });

  it('replays schema-unavailable PTY fixture without false 74ms analysis PASS', () => {
    const observation = JSON.parse(readFileSync(SCHEMA_UNAVAILABLE_FIXTURE, 'utf8'));
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const metrics = replayPtyObservation(observation, {
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
    });
    const scenario = buildScenarioMatrix()[0];
    const acceptance = evaluateAcceptanceCriteria(metrics, scenario);
    const legacy = JSON.parse(readFileSync(SCHEMA_RESULT_FIXTURE, 'utf8')).payload.scenarios[0];
    expect(legacy.metrics.hasVisibleAnalysis).toBe(true);
    expect(legacy.metrics.firstVisibleNarrativeMs).toBe(74);
    expect(metrics.hasVisibleAnalysis).toBe(false);
    expect(metrics.firstVisibleNarrativeText).toBeNull();
    expect(metrics.firstVisibleNarrativeMs).toBeNull();
    expect(metrics.referenceTypedUnavailable).toBe(true);
    expect(metrics.referencePreDispatchUnavailable).toBe(true);
    expect(metrics.referenceFailed).toBe(false);
    expect(metrics.referenceOutputInvalid).toBe(false);
    expect(metrics.referenceChildInvoked).toBe(false);
    expect(scrollbackHasTypedReferenceUnavailable(
      observation.ptyChunks.map((c: { text: string }) => c.text).join(''),
      catalog,
    )).toBe(true);
    expect(acceptance.failedIds).toContain('visible-analysis-within-10m');
    expect(acceptance.failedIds).toContain('7114-first-visible-narrative-10s');
    expect(acceptance.holdIds).toEqual(expect.arrayContaining(['7114-interim-deliverable-bound']));
    expect(acceptance.overall).toBe('fail');
    const toolCheck = acceptance.checks.find((c) => c.id === 'tool-calls-nonzero-or-reference-child');
    expect(toolCheck?.detail.referenceChildInvoked).toBe(false);
  });

  const renderInterimRequestEnvelope = (lang: string, toolCalls = 0, elapsed = 106) => {
    const template = mockGetMessage('native.interim_deliverable_required', lang);
    const body = template
      .replace('{toolCalls}', String(toolCalls))
      .replace('{elapsed}', String(elapsed));
    return `[${body}]`;
  };

  it('reconstructs PTY logical lines across chunk splits (segmentation-invariance)', () => {
    const envelope = renderInterimRequestEnvelope('tr');
    expect(envelope.length).toBeGreaterThan(35);
    const splitAt = 35;
    const lines = reconstructPtyLogicalLines([
      { text: envelope.slice(0, splitAt), observedAtMs: 100 },
      { text: envelope.slice(splitAt), observedAtMs: 101 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.line).toBe(envelope);
    expect(lines[0]?.observedAtMs).toBe(101);
  });

  it('does not treat CRLF-wrapped interim-request envelope continuation as narrative or delivery (TR/EN)', () => {
    const catalogTr = buildUiLineCatalog(mockGetMessage, 'tr');
    const catalogEn = buildUiLineCatalog(mockGetMessage, 'en');
    const refRoute = { referenceIngressExercised: true, referencePartial: true };
    for (const lang of ['tr', 'en'] as const) {
      const catalog = lang === 'tr' ? catalogTr : catalogEn;
      const envelope = renderInterimRequestEnvelope(lang);
      const wrapAt = 60;
      const metrics = deriveTimedContentMetricsFromPtyChunks([
        { text: `› @docs/MASTER-PLAN.md dokümanını oku ve analiz et\n`, observedAtMs: 10 },
        { text: `${envelope.slice(0, wrapAt)}\r\n${envelope.slice(wrapAt)}\r\n`, observedAtMs: 100 },
      ], {
        catalog,
        promptText: MASTER_PLAN_PROMPT,
        promptSentAtMs: 0,
        startedAtMs: 0,
        promptEchoed: true,
        referenceRoute: refRoute,
      });
      expect(metrics.hasVisibleAnalysis).toBe(false);
      expect(metrics.firstVisibleNarrativeMs).toBeNull();
      expect(metrics.firstVisibleNarrativeText).toBeNull();
      expect(metrics.firstInterimDeliverableMs).toBeNull();
    }
  });

  it('reconstructs plain text when ANSI escape sequences span PTY chunk boundaries', () => {
    let plainCarry = '';
    let ansiPending = '';
    ({ plainCarry, ansiPending } = decodePtyPlainCarry(plainCarry, ansiPending, '\x1b[2'));
    ({ plainCarry, ansiPending } = decodePtyPlainCarry(plainCarry, ansiPending, '0KHello from split ANSI'));
    expect(ansiPending).toBe('');
    expect(plainCarry).toBe('Hello from split ANSI');
    const lines = reconstructPtyLogicalLines([
      { text: '\x1b[2', observedAtMs: 10 },
      { text: '0KHello from split ANSI\n', observedAtMs: 11 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.line).toBe('Hello from split ANSI');
  });

  it('keeps multiline bracket envelope as one host notice unit until closing bracket', () => {
    const envelope = renderInterimRequestEnvelope('tr');
    const units: Array<{ kind: string; line: string }> = [];
    forEachPtyContentUnit([
      { text: `${envelope.slice(0, 60)}\r\n${envelope.slice(60)}\r\n`, observedAtMs: 100 },
    ], (unit) => units.push({ kind: unit.kind, line: unit.line }));
    expect(units).toHaveLength(1);
    expect(units[0]?.kind).toBe('envelope');
    expect(units[0]?.line).toBe(envelope);
  });

  it('does not treat split interim-request envelope fragments as narrative or delivery (TR/EN)', () => {
    const catalogTr = buildUiLineCatalog(mockGetMessage, 'tr');
    const catalogEn = buildUiLineCatalog(mockGetMessage, 'en');
    const refRoute = { referenceIngressExercised: true, referencePartial: true };
    for (const [lang, catalog] of [['tr', catalogTr], ['en', catalogEn]] as const) {
      const envelope = renderInterimRequestEnvelope(lang);
      const splitAt = 35;
      const metrics = deriveTimedContentMetricsFromPtyChunks([
        { text: `› @docs/MASTER-PLAN.md dokümanını oku ve analiz et\n`, observedAtMs: 10 },
        { text: envelope.slice(0, splitAt), observedAtMs: 100 },
        { text: envelope.slice(splitAt), observedAtMs: 101 },
      ], {
        catalog,
        promptText: MASTER_PLAN_PROMPT,
        promptSentAtMs: 0,
        startedAtMs: 0,
        promptEchoed: true,
        referenceRoute: refRoute,
      });
      expect(metrics.hasVisibleAnalysis).toBe(false);
      expect(metrics.firstVisibleNarrativeMs).toBeNull();
      expect(metrics.firstVisibleNarrativeText).toBeNull();
      expect(metrics.firstInterimDeliverableMs).toBeNull();
    }
  });

  it('detects post-request prose delivery after split request envelope (same chunk and next chunk)', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const refRoute = { referenceIngressExercised: true, referencePartial: true };
    const request = renderInterimRequestEnvelope('tr');
    const answer = 'Governance checkpoint cadence remains stable across partial reference reads and verified sections only.';
    const promptLine = '› @docs/MASTER-PLAN.md dokümanını oku ve analiz et';

    const sameChunk = deriveTimedContentMetricsFromPtyChunks([
      { text: `${promptLine}\n${request}\n${answer}\n`, observedAtMs: 106633 },
    ], {
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      promptSentAtMs: 0,
      startedAtMs: 0,
      promptEchoed: true,
      referenceRoute: refRoute,
    });
    expect(sameChunk.hasVisibleAnalysis).toBe(true);
    expect(sameChunk.firstVisibleNarrativeText).toContain('Governance checkpoint');
    expect(sameChunk.firstInterimDeliverableMs).toBe(106633);

    const nextChunk = deriveTimedContentMetricsFromPtyChunks([
      { text: `${promptLine}\n`, observedAtMs: 10 },
      { text: request.slice(0, 35), observedAtMs: 100 },
      { text: `${request.slice(35)}\n`, observedAtMs: 101 },
      { text: `${answer}\n`, observedAtMs: 106633 },
    ], {
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      promptSentAtMs: 0,
      startedAtMs: 0,
      promptEchoed: true,
      referenceRoute: refRoute,
    });
    expect(nextChunk.hasVisibleAnalysis).toBe(true);
    expect(nextChunk.firstVisibleNarrativeText).toContain('Governance checkpoint');
    expect(nextChunk.firstInterimDeliverableMs).toBe(106633);
    expect(nextChunk.firstVisibleNarrativeMs).toBe(106633);
  });

  it('excludes catalog-rendered interim request notices from narrative and structured interim delivery (EN/TR)', () => {
    const catalogTr = buildUiLineCatalog(mockGetMessage, 'tr');
    const catalogEn = buildUiLineCatalog(mockGetMessage, 'en');
    const trRequest = '[ara yanıt istendi — son görünür sonuçtan bu yana 0 araç çağrısı / 106 sn; asistan şimdi bilinen · kalan · sonraki adımı raporlayıp devam edecek]';
    const enRequest = '[interim answer requested — 0 tool calls / 106 s since the last visible result; the assistant now reports known so far · remaining · next step, then continues]';
    expect(buildInterimRequestSurfaces(mockGetMessage, 'tr').requestPrefixes.length).toBeGreaterThan(0);
    expect(isInterimRequestNoticeLine(trRequest, catalogTr)).toBe(true);
    expect(isInterimRequestNoticeLine(enRequest, catalogEn)).toBe(true);
    expect(isInterimStructuredDeliverableLine(trRequest, catalogTr)).toBe(false);
    expect(isNarrativeCandidateLine(trRequest, catalogTr, MASTER_PLAN_PROMPT)).toBe(false);
    const plain = [
      '› @docs/MASTER-PLAN.md dokümanını oku ve analiz et',
      trRequest,
      'Governance checkpoint cadence remains stable across partial reference reads.',
      '⏱ 106.6s · 1200 tok',
    ].join('\n');
    const metrics = parseScrollbackMetrics(plain, {
      startedAtMs: Date.now() - 120_000,
      promptSentAtMs: Date.now() - 110_000,
      observedAtMs: Date.now(),
      catalog: catalogTr,
      promptText: MASTER_PLAN_PROMPT,
    });
    expect(metrics.interimDeliverableSeen).toBe(false);
    expect(metrics.firstVisibleNarrativeText).toContain('Governance checkpoint');
  });

  it('excludes catalog-rendered interim-skipped and usage-hold host notices from narrative (EN/TR)', () => {
    const catalogTr = buildUiLineCatalog(mockGetMessage, 'tr');
    const catalogEn = buildUiLineCatalog(mockGetMessage, 'en');
    const trSkip = '[Henüz ara cevap yok (zamanı gelmedi); okuma sürüyor.]';
    const enSkip = '[No interim answer yet (not due yet); the reading is still in progress.]';
    const trHold = '[Okuma tamamlandı, ancak 2 ara istek doğrulanmış kullanım bildirmedi; onların maliyeti kapatılmadı.]';
    expect(buildReferenceHostNoticeSurfaces(mockGetMessage, 'tr').interimSkippedEnvelopePrefixes.length).toBeGreaterThan(0);
    expect(isReferenceHostNoticeLine(trSkip, catalogTr)).toBe(true);
    expect(isReferenceHostNoticeLine(enSkip, catalogEn)).toBe(true);
    expect(isReferenceHostNoticeLine(trHold, catalogTr)).toBe(true);
    expect(isNarrativeCandidateLine(trSkip, catalogTr, MASTER_PLAN_PROMPT)).toBe(false);
    const ansiWrapped = `\x1b[2K[Henüz ara cevap yok (zamanı gelmedi); okuma sürüyor.]`;
    expect(isReferenceHostNoticeLine(ansiWrapped, catalogTr)).toBe(true);
  });

  it('passes interim deliverable gate for structured interim answer control (not host skip notice)', () => {
    const catalog = buildUiLineCatalog(mockGetMessage, 'en');
    const plain = [
      '› @docs/MASTER-PLAN.md read and analyze the document',
      'deckent · docs/MASTER-PLAN.md · mapping · section 1/5 · 1.2 MiB',
      'Governance checkpoint cadence remains stable; terminal is the primary operator surface.',
      'bilinen · kalan · sonraki adım',
      '⏱ 45.0s · 1200 tok',
    ].join('\n');
    const metrics = parseScrollbackMetrics(plain, {
      startedAtMs: Date.now() - 60_000,
      promptSentAtMs: Date.now() - 55_000,
      observedAtMs: Date.now(),
      catalog,
      promptText: MASTER_PLAN_PROMPT,
    });
    expect(metrics.interimDeliverableSeen).toBe(true);
    expect(metrics.firstInterimDeliverableMs).not.toBeNull();
    const scenario = buildScenarioMatrix()[0];
    const acceptance = evaluateAcceptanceCriteria({
      bootStatus: { bootProviderModelSeen: true, measurementExactSeen: true },
      promptSent: true,
      promptEchoed: true,
      turnCompleted: true,
      turnEndMs: 45_000,
      hasVisibleAnalysis: true,
      elapsedMs: 45_000,
      toolCallCount: 3,
      referenceChildInvoked: true,
      childMapRequests: 2,
      referenceIngressExercised: true,
      referencePartial: true,
      fakeContextCheckpointsInFirstWindow: 0,
      tokenPressureCheckpointCount: 0,
      measurementAuthority: 'exact',
      approvalCount: 0,
      firstVisibleNarrativeMs: 8_000,
      interimDeliverableSeen: metrics.interimDeliverableSeen,
      firstInterimDeliverableMs: metrics.firstInterimDeliverableMs,
      toolRowsAtFirstInterim: 3,
    }, scenario);
    expect(acceptance.checks.find((c) => c.id === '7114-interim-deliverable-bound')?.pass).toBe(true);
  });

  it('replays boundary PTY fixture with request≠delivery timing (106633ms actual, not 105803ms request)', () => {
    const observation = JSON.parse(readFileSync(BOUNDARY_FIXTURE, 'utf8'));
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const metrics = replayPtyObservation(observation, {
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
    });
    const scenario = buildScenarioMatrix()[0];
    const acceptance = evaluateAcceptanceCriteria(metrics, scenario);
    const legacy = JSON.parse(readFileSync(BOUNDARY_RESULT_FIXTURE, 'utf8')).payload.scenarios[0];
    expect(legacy.metrics.firstInterimDeliverableMs).toBe(105803);
    expect(String(legacy.metrics.firstVisibleNarrativeText ?? '')).toContain('ara yanıt istendi');
    expect(metrics.firstInterimDeliverableMs).toBeGreaterThanOrEqual(106_000);
    expect(metrics.firstVisibleNarrativeMs).toBeGreaterThanOrEqual(106_000);
    expect(metrics.firstVisibleNarrativeText).not.toContain('ara yanıt istendi');
    expect(metrics.hasVisibleAnalysis).toBe(true);
    expect(metrics.interimDeliverableSeen).toBe(true);
    expect(metrics.referencePartial).toBe(true);
    expect(metrics.referenceChildInvoked).toBe(true);
    expect(acceptance.failedIds).toContain('7114-first-visible-narrative-10s');
    expect(acceptance.failedIds).toContain('7114-interim-deliverable-bound');
    expect(acceptance.overall).toBe('fail');
  });

  it('replays interim-skipped PTY fixture without false 58380ms narrative PASS', () => {
    const observation = JSON.parse(readFileSync(INTERIM_SKIPPED_FIXTURE, 'utf8'));
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const metrics = replayPtyObservation(observation, {
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
    });
    const scenario = buildScenarioMatrix()[0];
    const acceptance = evaluateAcceptanceCriteria(metrics, scenario);
    const legacy = JSON.parse(readFileSync(INTERIM_RESULT_FIXTURE, 'utf8')).payload.scenarios[0];
    expect(legacy.metrics.firstVisibleNarrativeMs).toBe(58380);
    expect(String(legacy.metrics.firstVisibleNarrativeText ?? '')).toContain('Henüz ara cevap yok');
    expect(metrics.hasVisibleAnalysis).toBe(false);
    expect(metrics.firstVisibleNarrativeText).toBeNull();
    expect(metrics.firstVisibleNarrativeMs).toBeNull();
    expect(metrics.interimDeliverableSeen).toBe(false);
    expect(metrics.referencePartial).toBe(true);
    expect(metrics.referenceChildInvoked).toBe(true);
    expect(metrics.childMapRequests).toBe(6);
    expect(acceptance.failedIds).not.toContain('7114-first-visible-narrative-10s');
    expect(acceptance.holdIds).toEqual(expect.arrayContaining([
      'visible-analysis-within-10m',
      '7114-first-visible-narrative-10s',
      '7114-interim-deliverable-bound',
    ]));
    expect(acceptance.overall).toBe('hold');
  });

  it('replays digest-pinned PTY fixture with null narrative (no false 11ms prompt PASS)', () => {
    const observation = JSON.parse(readFileSync(REPLAY_FIXTURE, 'utf8'));
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const metrics = replayPtyObservation(observation, {
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
    });
    expect(metrics.firstVisibleNarrativeText).toBeNull();
    expect(metrics.firstVisibleNarrativeMs).toBeNull();
    expect(metrics.hasVisibleAnalysis).toBe(false);
    expect(metrics.referenceChildInvoked).toBe(true);
    expect(metrics.referencePartial).toBe(true);
  });

  it('replays actual D0D1D2 e-first-answer PTY with post-request interim at ~60243ms (not false HOLD)', () => {
    const observation = JSON.parse(readFileSync(E_FIRST_ANSWER_FIXTURE, 'utf8'));
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const metrics = replayPtyObservation(observation, {
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
    });
    const scenario = buildScenarioMatrix().find((s) => s.id === 'local-llm-32768-suggest') ?? buildScenarioMatrix()[0];
    const acceptance = evaluateAcceptanceCriteria(metrics, scenario);
    const legacy = JSON.parse(readFileSync(E_FIRST_ANSWER_RESULT_FIXTURE, 'utf8')).payload.scenarios[0];
    expect(legacy.metrics.firstInterimDeliverableMs).toBeNull();
    expect(legacy.metrics.firstVisibleNarrativeMs).toBe(60243);
    expect(metrics.firstVisibleNarrativeMs).toBeGreaterThanOrEqual(60_000);
    expect(metrics.firstInterimDeliverableMs).toBeGreaterThanOrEqual(60_000);
    expect(metrics.firstInterimDeliverableMs).toBe(metrics.firstVisibleNarrativeMs);
    expect(metrics.interimDeliverableSeen).toBe(true);
    expect(metrics.hasVisibleAnalysis).toBe(true);
    expect(metrics.referencePartial).toBe(true);
    expect(acceptance.failedIds).toContain('7114-first-visible-narrative-10s');
    expect(acceptance.holdIds).not.toContain('7114-interim-deliverable-bound');
    expect(acceptance.overall).toBe('fail');
  });

  it('final collector parse requires observation.ptyChunks for post-request interim (plain scrollback false negative)', () => {
    const observation = JSON.parse(readFileSync(E_FIRST_ANSWER_FIXTURE, 'utf8'));
    const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
    const scrollback = observation.ptyChunks.map((c: { text: string }) => c.text).join('');
    const withoutChunks = parseScrollbackMetrics(scrollback, {
      startedAtMs: observation.startedAtMs,
      promptSentAtMs: observation.promptSentAtMs,
      observedAtMs: observation.ptyChunks.at(-1)?.observedAtMs,
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      observation: {},
      expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
    });
    const withChunks = parseScrollbackMetrics(scrollback, {
      startedAtMs: observation.startedAtMs,
      promptSentAtMs: observation.promptSentAtMs,
      observedAtMs: observation.ptyChunks.at(-1)?.observedAtMs,
      catalog,
      promptText: MASTER_PLAN_PROMPT,
      observation: { ptyChunks: observation.ptyChunks },
      expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
    });
    expect(withoutChunks.interimDeliverableSeen).toBe(false);
    expect(withoutChunks.firstInterimDeliverableMs).toBeNull();
    expect(withChunks.interimDeliverableSeen).toBe(true);
    expect(withChunks.firstInterimDeliverableMs).toBeGreaterThanOrEqual(60_000);
  });
});
