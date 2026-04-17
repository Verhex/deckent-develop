/**
 * init-wizard.ts — Interactive prompts, format helpers, and display functions.
 *
 * All UI-facing functions that format output for the user during `deckent init`
 * live here.  Pure functions (no filesystem writes).
 *
 * Split from init.ts (Sprint 144 Task 1).
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface DetectedSetup {
  nodeVersion?: string;
  providers: Array<{ name: string; available: boolean; authMethod?: string; version?: string }>;
  stack?: { language?: string; framework?: string; testFramework?: string };
}

export interface SetupStep {
  label: string;
  done: boolean;
}

// ─── Capitalize Helper ──────────────────────────────────────────────

export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Format Functions ───────────────────────────────────────────────

export function formatWelcomeBanner(): string {
  return '\nWelcome to Deckent!\n';
}

export function formatDetectedSetup(setup: DetectedSetup): string {
  const lines: string[] = ['I detected your setup:'];

  if (setup.nodeVersion) {
    lines.push(`  → Node.js ${setup.nodeVersion}`);
  }

  for (const p of setup.providers) {
    if (p.available) {
      const auth = p.authMethod ? ` (${p.authMethod})` : '';
      const ver = p.version ? ` v${p.version}` : '';
      lines.push(`  → ${capitalize(p.name)} CLI${ver}${auth}`);
    } else {
      lines.push(`  → ${capitalize(p.name)} — Not configured`);
    }
  }

  if (setup.stack) {
    const parts: string[] = [];
    if (setup.stack.language && setup.stack.language !== 'unknown') parts.push(capitalize(setup.stack.language));
    if (setup.stack.framework && setup.stack.framework !== 'unknown' && setup.stack.framework !== 'none') parts.push(capitalize(setup.stack.framework));
    if (parts.length > 0) {
      lines.push(`  → Project: ${parts.join(' + ')} (detected from package.json)`);
    }
  }

  return lines.join('\n');
}

export function formatSetupProgress(steps: SetupStep[]): string {
  const lines: string[] = ['', 'Setting up your AI development team...'];
  for (const step of steps) {
    const icon = step.done ? '  ✓' : '  ·';
    lines.push(`${icon} ${step.label}`);
  }
  return lines.join('\n');
}

export function formatNextSteps(language: string): string {
  if (language === 'tr') {
    return [
      '',
      'Hazırsınız! Sonraki adımlar:',
      '  1. Hedeflerinizi yazın:  deckent set-directives "Kullanıcı doğrulama ekle"',
      '  2. Sprint planlayın:     deckent plan',
      '  3. Çalışmaya başlayın:   deckent start',
      '',
      'Ya da doğrudan ne yapılacağını söyleyin:',
      '  deckent start "Express API\'ye JWT authentication ekle"',
    ].join('\n');
  }
  return [
    '',
    "You're ready! Here's what to do next:",
    '  1. Write your goals:  deckent set-directives "Add user authentication"',
    '  2. Plan the sprint:   deckent plan',
    '  3. Start working:     deckent start',
    '',
    'Or just tell me what to build:',
    '  deckent start "Add JWT authentication to the Express API"',
  ].join('\n');
}

/**
 * Detect system locale from environment variables or Intl API.
 * Returns a 2-letter language code (e.g. 'en', 'tr').
 */
export function detectSystemLanguage(): string {
  // Try LANG env var first (e.g. "tr_TR.UTF-8")
  const langEnv = process.env['LANG'] ?? process.env['LANGUAGE'] ?? process.env['LC_ALL'] ?? process.env['LC_MESSAGES'];
  if (langEnv) {
    const match = /^([a-z]{2})/i.exec(langEnv);
    if (match) return match[1]!.toLowerCase();
  }
  // Try Intl API
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const parts = locale.split('-');
    if (parts[0]) return parts[0].toLowerCase();
  } catch {
    // Intl not available
  }
  return 'en';
}

/**
 * Format recommendation reasons for display after auto-detect.
 */
export function formatRecommendations(reasons: string[]): string {
  if (reasons.length === 0) return '';
  const lines = ['', 'Recommendation reasons:'];
  for (const reason of reasons) {
    lines.push(`  → ${reason}`);
  }
  return lines.join('\n');
}

/**
 * Build setup steps array for the progress display.
 */
export function buildSetupSteps(
  availableProviderNames: string[],
  detectedAnalysis?: { language?: string; framework?: string },
): SetupStep[] {
  const steps: SetupStep[] = [
    { label: 'Created .deckent/ configuration', done: true },
    { label: 'Created .brain/ memory system', done: true },
    { label: `Set up ${availableProviderNames[0] ? capitalize(availableProviderNames[0]) : 'Claude'} as brain (Opus), workers (Sonnet)`, done: true },
  ];
  if (availableProviderNames.length > 1) {
    steps.push({ label: `Enabled ${capitalize(availableProviderNames[1]!)} as secondary worker provider`, done: true });
  }
  if (detectedAnalysis) {
    const stackParts: string[] = [];
    if (detectedAnalysis.language && detectedAnalysis.language !== 'unknown') stackParts.push(capitalize(detectedAnalysis.language));
    if (detectedAnalysis.framework && detectedAnalysis.framework !== 'unknown' && (detectedAnalysis.framework as string) !== 'none') stackParts.push(capitalize(detectedAnalysis.framework));
    if (stackParts.length > 0) {
      steps.push({ label: `Detected project stack: ${stackParts.join(' + ')}`, done: true });
    }
  }
  return steps;
}

/**
 * Build DetectedSetup from providers and analysis for display.
 */
export function buildDetectedSetup(
  providers: Array<{ name: string; available: boolean; authMethod?: string; version?: string }>,
  detectedAnalysis?: { language?: string; framework?: string; testFramework?: string },
): DetectedSetup {
  return {
    nodeVersion: process.version,
    providers: providers.map(p => ({ name: p.name, available: p.available, authMethod: p.authMethod, version: p.version })),
    stack: detectedAnalysis ? { language: detectedAnalysis.language, framework: detectedAnalysis.framework, testFramework: detectedAnalysis.testFramework } : undefined,
  };
}
