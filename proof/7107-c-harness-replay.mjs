#!/usr/bin/env node
// ENTRY 125/127/130/133/138/141/148 — digest-pinned PTY replay: 6 actual fixtures offline.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MASTER_PLAN_PROMPT,
  buildScenarioMatrix,
  buildUiLineCatalog,
  evaluateAcceptanceCriteria,
  replayPtyObservation,
  sha256File,
} from '../scripts/terminal-acceptance-battery.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE_DIR = join(REPO, 'proof', 'fixtures');
const SCRIPT_PATH = join(REPO, 'scripts', 'terminal-acceptance-battery.mjs');

const CASES = [
  {
    id: 'partial-e32768',
    obsPath: process.env.BATTERY_OBS_PATH ?? join(FIXTURE_DIR, 'pty-observations-e32768.json'),
    legacyPath: process.env.BATTERY_LEGACY_PATH ?? join(FIXTURE_DIR, 'e-first-actual-metrics.json'),
    expect: {
      narrativeNull: true,
      overall: 'hold',
      holdIncludes: ['7114-interim-deliverable-bound'],
      failedExcludes: ['tool-calls-nonzero-or-reference-child'],
      referencePartial: true,
    },
  },
  {
    id: 'failed-ref-gdn39Q',
    obsPath: join(FIXTURE_DIR, 'pty-observations-gdn39Q-failed-ref.json'),
    legacyPath: join(FIXTURE_DIR, 'e-diag-failed-ref-result.json'),
    legacyNested: true,
    expect: {
      narrativeNull: true,
      overall: 'fail',
      failedIncludes: ['visible-analysis-within-10m', '7114-first-visible-narrative-10s'],
      holdIncludes: ['7114-interim-deliverable-bound', 'tool-calls-nonzero-or-reference-child'],
      referenceFailed: true,
      referencePartial: false,
      childInvokedNull: true,
    },
  },
  {
    id: 'schema-unavailable-eYMqKL',
    obsPath: join(FIXTURE_DIR, 'pty-observations-eYMqKL-schema-unavailable.json'),
    legacyPath: join(FIXTURE_DIR, 'e-schema-result.json'),
    legacyNested: true,
    expect: {
      narrativeNull: true,
      overall: 'fail',
      failedIncludes: ['visible-analysis-within-10m', '7114-first-visible-narrative-10s', 'tool-calls-nonzero-or-reference-child'],
      holdIncludes: ['7114-interim-deliverable-bound'],
      referenceTypedUnavailable: true,
      referencePreDispatchUnavailable: true,
      referenceFailed: false,
      legacyFalseAnalysisPass: true,
    },
  },
  {
    id: 'boundary-Hs9vsd',
    obsPath: join(FIXTURE_DIR, 'pty-observations-Hs9vsd-boundary.json'),
    legacyPath: join(FIXTURE_DIR, 'e-boundary-result.json'),
    legacyNested: true,
    expect: {
      hasVisibleAnalysis: true,
      interimDeliverableSeen: true,
      firstVisibleNarrativeMsMin: 106_000,
      firstInterimDeliverableMsMin: 106_000,
      requestNotNarrative: true,
      overall: 'fail',
      failedIncludes: ['7114-first-visible-narrative-10s', '7114-interim-deliverable-bound'],
      referencePartial: true,
      referenceChildInvoked: true,
      legacyFalseRequestInterimMs: 105803,
    },
  },
  {
    id: 'interim-skipped-l7JieX',
    obsPath: join(FIXTURE_DIR, 'pty-observations-l7JieX-interim-skipped.json'),
    legacyPath: join(FIXTURE_DIR, 'e-interim-result.json'),
    legacyNested: true,
    expect: {
      narrativeNull: true,
      interimDeliverableSeen: false,
      overall: 'hold',
      holdIncludes: [
        'visible-analysis-within-10m',
        '7114-first-visible-narrative-10s',
        '7114-interim-deliverable-bound',
      ],
      failedExcludes: ['7114-first-visible-narrative-10s', 'visible-analysis-within-10m'],
      referencePartial: true,
      referenceChildInvoked: true,
      legacyFalseNarrativeMs: 58380,
    },
  },
  {
    id: 'e-first-answer-4bDbes',
    obsPath: join(FIXTURE_DIR, 'pty-observations-4bDbes-e-first-answer.json'),
    legacyPath: join(FIXTURE_DIR, 'e-first-answer-result.json'),
    legacyNested: true,
    expect: {
      hasVisibleAnalysis: true,
      interimDeliverableSeen: true,
      firstVisibleNarrativeMsMin: 60_000,
      firstInterimDeliverableMsMin: 60_000,
      overall: 'fail',
      failedIncludes: ['7114-first-visible-narrative-10s'],
      holdExcludes: ['7114-interim-deliverable-bound'],
      referencePartial: true,
      referenceChildInvoked: true,
      legacyFalseInterimHold: true,
    },
  },
];

const mockGetMessage = (key, lang) => {
  const tr = lang === 'tr';
  const map = {
    'native.tool_ran': tr ? 'araç çalıştı' : 'tool ran',
    'native-context.checkpoint_token_pressure': tr ? 'Ölçülmüş bağlam baskısı' : 'Measured context pressure',
    'native-context.slash.measurement_authority': tr ? 'ölçüm otoritesi: {state}{reason}' : 'measurement authority: {state}{reason}',
    'native-context.measurement.state_exact': tr ? 'kesin' : 'exact',
    'native-context.measurement.state_failed': tr ? 'ölçüm başarısız' : 'measurement failed',
    'native.measurement_authority.exact': tr ? 'Ölçüm: kesin' : 'Measurement: exact',
    'native.interim_deliverable_required': tr ? 'ara yanıt istendi — son görünür sonuçtan bu yana {toolCalls} araç çağrısı / {elapsed} sn; asistan şimdi bilinen · kalan · sonraki adımı raporlayıp devam edecek' : 'interim answer requested — {toolCalls} tool calls / {elapsed} s since the last visible result; the assistant now reports known so far · remaining · next step, then continues',
    'native-context.slash.interim_deliverable': tr ? 'ara teslimat: {calls}/{callsLimit} araç çağrısı · {elapsed}/{elapsedLimit} sn · teslim edilen {delivered} · host isteği {requested}' : 'interim deliverable: {calls}/{callsLimit} tool calls · {elapsed}/{elapsedLimit} s since the last one · delivered {delivered} · host-requested {requested}',
    'native.turn_interrupted': tr ? 'kesildi' : 'interrupted after {toolCalls} tool calls',
    'tui.confirm_hint': tr ? '(y = izin · a = hep izin · N = reddet)' : '(y = allow · a = always allow · N = deny)',
    'approval_card.hint': tr ? '(y = onayla · n = reddet)' : '(y = approve · n = deny)',
    'native-context.slash.trigger': tr ? 'son sıkıştırma tetikleyicisi: {trigger}' : 'last compaction trigger: {trigger}',
    'native-context.trigger.token_pressure': tr ? 'ölçülmüş bağlam baskısı' : 'measured context pressure',
    'native-context.trigger.overflow': tr ? 'girdi taşması kurtarması' : 'input overflow recovery',
    'native-context.trigger.manual': tr ? 'doğrudan sıkıştırma' : 'explicit compaction',
    'native-context.trigger.planned': tr ? 'planlanmış bağlam yenileme' : 'planned context refresh',
    'native-context.trigger.cadence': tr ? 'yürütme bütçesi checkpoint’i' : 'execution budget checkpoint',
    'native-context.checkpoint_cadence': tr ? 'Yürütme bütçesi checkpoint’ine ulaşıldı' : 'Execution budget checkpoint reached',
    'native.checkpoint.saved': tr ? 'Scratch checkpoint kaydedildi.' : 'Scratch checkpoint saved.',
    'native-context.slash.tool_result_pressure': tr ? 'tutulan araç sonuçları: {retained} / {cap} token' : 'retained tool results: {retained} / {cap} tokens',
    'native-context.slash.request_pressure': tr ? 'ölçülen istek: {retained} / {cap} token' : 'measured request: {retained} / {cap} tokens',
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
  const entry = map[key];
  if (entry && typeof entry === 'object') return tr ? entry.tr : entry.en;
  return entry ?? key;
};

function loadLegacyActualRun(path, nested = false) {
  if (!existsSync(path)) return null;
  const row = JSON.parse(readFileSync(path, 'utf8'));
  const m = nested ? row.payload?.scenarios?.[0]?.metrics ?? row.metrics : row.metrics ?? row;
  return {
    source: path,
    firstVisibleNarrativeMs: m.firstVisibleNarrativeMs,
    firstVisibleNarrativeText: m.firstVisibleNarrativeText,
    hasVisibleAnalysis: m.hasVisibleAnalysis,
    falsePromptNarrativePass: m.firstVisibleNarrativeMs != null
      && m.firstVisibleNarrativeMs < 100
      && String(m.firstVisibleNarrativeText ?? '').startsWith('› @docs/MASTER-PLAN'),
    falseTypedFailureAnalysisPass: m.hasVisibleAnalysis === true
      && String(m.firstVisibleNarrativeText ?? '').includes('Referans analizi tamamlanamadı'),
    legacyFalseAnalysisPass: m.hasVisibleAnalysis === true
      && m.firstVisibleNarrativeMs != null
      && m.firstVisibleNarrativeMs < 100
      && String(m.firstVisibleNarrativeText ?? '').includes('yanıt şemasını'),
    legacyFalseInterimSkipNarrative: m.firstVisibleNarrativeMs === 58380
      && String(m.firstVisibleNarrativeText ?? '').includes('Henüz ara cevap yok'),
    legacyFalseRequestInterimMs: m.firstInterimDeliverableMs === 105803
      && String(m.firstVisibleNarrativeText ?? '').includes('ara yanıt istendi'),
    legacyFalseInterimHold: m.firstInterimDeliverableMs == null
      && m.hasVisibleAnalysis === true
      && m.firstVisibleNarrativeMs != null
      && m.firstVisibleNarrativeMs >= 60_000,
  };
}

function replayCase(testCase) {
  if (!existsSync(testCase.obsPath)) {
    return { id: testCase.id, ok: false, error: `missing observation fixture: ${testCase.obsPath}` };
  }
  const observation = JSON.parse(readFileSync(testCase.obsPath, 'utf8'));
  const catalog = buildUiLineCatalog(mockGetMessage, 'tr');
  const scenario = buildScenarioMatrix().find((s) => s.id === 'local-llm-32768-suggest') ?? buildScenarioMatrix()[0];
  const metrics = replayPtyObservation(observation, {
    catalog,
    promptText: MASTER_PLAN_PROMPT,
    expectedBinding: { provider: 'local-llm', model: 'Qwen3.8-27B-Q4_K_M' },
  });
  const acceptance = evaluateAcceptanceCriteria(metrics, scenario);
  const legacyActual = loadLegacyActualRun(testCase.legacyPath, testCase.legacyNested === true);
  const expect = testCase.expect;
  const checks = [
    !expect.narrativeNull || metrics.firstVisibleNarrativeText === null,
    !expect.narrativeNull || metrics.firstVisibleNarrativeMs === null,
    acceptance.overall === expect.overall,
    ...(expect.holdIncludes ?? []).map((id) => acceptance.holdIds?.includes(id)),
    ...(expect.failedIncludes ?? []).map((id) => acceptance.failedIds?.includes(id)),
    ...(expect.failedExcludes ?? []).map((id) => acceptance.failedIds?.includes(id) !== true),
    ...(expect.holdExcludes ?? []).map((id) => acceptance.holdIds?.includes(id) !== true),
    expect.referencePartial == null || metrics.referencePartial === expect.referencePartial,
    expect.referenceFailed == null || metrics.referenceFailed === expect.referenceFailed,
    expect.referenceTypedUnavailable == null || metrics.referenceTypedUnavailable === expect.referenceTypedUnavailable,
    expect.referencePreDispatchUnavailable == null || metrics.referencePreDispatchUnavailable === expect.referencePreDispatchUnavailable,
    !expect.childInvokedNull || metrics.referenceChildInvoked === null,
    expect.interimDeliverableSeen == null || metrics.interimDeliverableSeen === expect.interimDeliverableSeen,
    expect.hasVisibleAnalysis == null || metrics.hasVisibleAnalysis === expect.hasVisibleAnalysis,
    expect.firstVisibleNarrativeMsMin == null || (metrics.firstVisibleNarrativeMs != null && metrics.firstVisibleNarrativeMs >= expect.firstVisibleNarrativeMsMin),
    expect.firstInterimDeliverableMsMin == null || (metrics.firstInterimDeliverableMs != null && metrics.firstInterimDeliverableMs >= expect.firstInterimDeliverableMsMin),
    !expect.requestNotNarrative || !String(metrics.firstVisibleNarrativeText ?? '').includes('ara yanıt istendi'),
    testCase.id !== 'partial-e32768' || legacyActual?.falsePromptNarrativePass === true,
    testCase.id !== 'failed-ref-gdn39Q' || legacyActual?.falseTypedFailureAnalysisPass === true,
    testCase.id !== 'schema-unavailable-eYMqKL' || legacyActual?.legacyFalseAnalysisPass === true,
    testCase.id !== 'interim-skipped-l7JieX' || legacyActual?.legacyFalseInterimSkipNarrative === true,
    testCase.id !== 'boundary-Hs9vsd' || legacyActual?.legacyFalseRequestInterimMs === true,
    testCase.id !== 'e-first-answer-4bDbes' || legacyActual?.legacyFalseInterimHold === true,
  ];
  return {
    id: testCase.id,
    ok: checks.every(Boolean),
    legacyActual,
    metrics: {
      firstVisibleNarrativeMs: metrics.firstVisibleNarrativeMs,
      firstVisibleNarrativeText: metrics.firstVisibleNarrativeText,
      hasVisibleAnalysis: metrics.hasVisibleAnalysis,
      referencePartial: metrics.referencePartial,
      referenceFailed: metrics.referenceFailed,
      referenceTypedUnavailable: metrics.referenceTypedUnavailable,
      referencePreDispatchUnavailable: metrics.referencePreDispatchUnavailable,
      referenceChildInvoked: metrics.referenceChildInvoked,
      referenceChildInvocationAuthority: metrics.referenceChildInvocationAuthority,
      interimDeliverableSeen: metrics.interimDeliverableSeen,
      childMapRequests: metrics.childMapRequests,
    },
    acceptance,
    fixtures: {
      observation: { path: testCase.obsPath, sha256: sha256File(testCase.obsPath) },
      legacyActual: legacyActual ? { path: testCase.legacyPath, sha256: sha256File(testCase.legacyPath) } : null,
    },
  };
}

const capturedAt = new Date().toISOString();
const replays = CASES.map(replayCase);
const report = {
  capturedAt,
  outcomeId: '7107-c',
  script: { path: SCRIPT_PATH, sha256: sha256File(SCRIPT_PATH) },
  replays,
  ok: replays.every((row) => row.ok),
};

const outDir = join(REPO, 'proof');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, '7107-c-harness-replay.json');
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`7107-c-harness-replay ok=${report.ok} cases=${replays.map((r) => `${r.id}:${r.ok}`).join(',')}\n`);
process.stdout.write(`  out=${outPath}\n`);
process.exit(report.ok ? 0 : 1);
