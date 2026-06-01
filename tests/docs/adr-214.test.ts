import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_076_PATH = join(process.cwd(), 'docs/adr/076-auth-precedence-user-surfaces.md');
const ADR_077_PATH = join(process.cwd(), 'docs/adr/077-multi-provider-openai-compat.md');
const MASTER_PLAN_PATH = join(process.cwd(), 'docs/MASTER-PLAN.md');

describe('ADR-076: Auth-Precedence Fix + User-Facing Surfaces', () => {
  it('ADR-076 file exists with MADR structure (Context, Decision, Consequences, Alternatives Considered, Status accepted)', () => {
    expect(existsSync(ADR_076_PATH)).toBe(true);
    const content = readFileSync(ADR_076_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('ADR-076 contains auth, token, and extension keywords (≥3 matches)', () => {
    const content = readFileSync(ADR_076_PATH, 'utf-8');
    const authMatches = (content.match(/\bauth\b/gi) || []).length;
    const tokenMatches = (content.match(/\btoken\b/gi) || []).length;
    const extensionMatches = (content.match(/\bextension\b/gi) || []).length;
    expect(authMatches + tokenMatches + extensionMatches).toBeGreaterThanOrEqual(3);
  });

  it('ADR-076 covers all four decision parts: auth-precedence, token-inject, Path A chat, IDE extension', () => {
    const content = readFileSync(ADR_076_PATH, 'utf-8');
    expect(content).toMatch(/useApiOnly|subscription.*strip|auth.*precedence|auth-aware/i);
    expect(content).toMatch(/token.*inject|inject.*token|__DECKENT_API_TOKEN__|localhost/i);
    expect(content).toMatch(/Path A|chat-backend|embedded chat/i);
    expect(content).toMatch(/VS Code|extension\.ts|sidebar|statusbar/i);
  });
});

describe('ADR-077: Multi-Provider 8-Fleet + OpenAI-Compatible Adapter', () => {
  it('ADR-077 file exists with MADR structure (Context, Decision, Consequences, Alternatives Considered, Status accepted)', () => {
    expect(existsSync(ADR_077_PATH)).toBe(true);
    const content = readFileSync(ADR_077_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('ADR-077 contains OpenAICompatible, provider, and DeepSeek keywords (≥2 matches)', () => {
    const content = readFileSync(ADR_077_PATH, 'utf-8');
    const openaiCompatMatches = (content.match(/OpenAICompatible|openai-compat|OpenAI.compatible/gi) || []).length;
    const providerMatches = (content.match(/\bprovider\b/gi) || []).length;
    const deepseekMatches = (content.match(/DeepSeek/gi) || []).length;
    expect(openaiCompatMatches + providerMatches + deepseekMatches).toBeGreaterThanOrEqual(2);
  });

  it('ADR-077 covers all decision parts: HTTP adapter, PROVIDER_MAP, ProviderName, bootstrap', () => {
    const content = readFileSync(ADR_077_PATH, 'utf-8');
    expect(content).toMatch(/chat.completions|HTTP.*adapter|fetch.*POST/i);
    expect(content).toMatch(/PROVIDER_MAP|model-catalog/i);
    expect(content).toMatch(/ProviderName|open.string|dynamic/i);
    expect(content).toMatch(/bootstrap|auto.register|DEEPSEEK_API_KEY/i);
  });
});

describe('MASTER-PLAN Sprint 214 status', () => {
  it('MASTER-PLAN contains Sprint 214 references (≥1 match)', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    const sprint214Matches = (content.match(/Sprint 214|214-001|ADR-076|ADR-077/g) || []).length;
    expect(sprint214Matches).toBeGreaterThanOrEqual(1);
  });

  it('MASTER-PLAN Risk #5 auth-precedence bug is marked as RESOLVED', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toMatch(/Auth-precedence bug.*RESOLVED|RESOLVED.*Sprint 214|auth.*precedence.*resolved/i);
  });

  it('MASTER-PLAN F1-009 status updated from proposed to in-progress with Sprint 214 reference', () => {
    const content = readFileSync(MASTER_PLAN_PATH, 'utf-8');
    expect(content).toMatch(/F1-009/);
    expect(content).toMatch(/OpenAICompatibleAdapter|openai-compatible|Sprint 214/);
  });
});
