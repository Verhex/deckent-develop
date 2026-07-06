/**
 * risk-language.test.ts — ADR-D-012 TERM-5 CommandRisk display-translation
 * layer (task 375-004, slice 1).
 */
import { describe, it, expect } from 'vitest';
import {
  COMMAND_RISK_LADDER,
  renderCommandRisk,
  renderAllCommandRisks,
  toolPermissionToCommandRisk,
  approvalRiskToCommandRisk,
  nervousRiskLevelToCommandRisk,
  toolRiskLevelToCommandRisk,
  toolCatalogRiskLevelToCommandRisk,
  catalogRenderRiskLevelToCommandRisk,
  toolTrustTierToCommandRisk,
} from '../../src/cli/helpers/risk-language.js';
import { COMMAND_REGISTRY, getCommand, type CommandRisk } from '../../src/cli/command-registry.js';
import { classifyTool } from '../../src/cli/repl/tool-permissions.js';

describe('renderCommandRisk — canonical 4-class ladder', () => {
  it('ladder is exactly the 4 CommandRisk classes in spec order', () => {
    expect(COMMAND_RISK_LADDER).toEqual(['Oku', 'Değiştir', 'Çalıştır', 'Otonom']);
  });

  const EXPECTED_EN_LABEL: Record<CommandRisk, string> = {
    Oku: 'Read',
    Değiştir: 'Modify',
    Çalıştır: 'Execute',
    Otonom: 'Autonomous',
  };

  it.each(COMMAND_RISK_LADDER)('renders %s with a real (non-fallback) en label + description', (risk) => {
    const rendered = renderCommandRisk(risk, 'en');
    expect(rendered.risk).toBe(risk);
    expect(rendered.label).toBe(EXPECTED_EN_LABEL[risk]);
    expect(rendered.label).not.toContain('cmdCatalog');
    expect(rendered.description.length).toBeGreaterThan(0);
    expect(rendered.description).not.toContain('cmdCatalog');
  });

  it.each(COMMAND_RISK_LADDER)('renders %s with a real (non-fallback) tr label + description', (risk) => {
    const rendered = renderCommandRisk(risk, 'tr');
    expect(rendered.risk).toBe(risk);
    expect(rendered.label).toBe(risk); // the 4 Turkish class names ARE the tr labels
    expect(rendered.label).not.toContain('cmdCatalog');
    expect(rendered.description.length).toBeGreaterThan(0);
    expect(rendered.description).not.toContain('cmdCatalog');
  });

  it('en and tr labels differ for every class', () => {
    for (const risk of COMMAND_RISK_LADDER) {
      expect(renderCommandRisk(risk, 'en').label).not.toBe(renderCommandRisk(risk, 'tr').label);
    }
  });

  it('every class has a distinct en label and a distinct tr description', () => {
    const enLabels = COMMAND_RISK_LADDER.map((r) => renderCommandRisk(r, 'en').label);
    expect(new Set(enLabels).size).toBe(COMMAND_RISK_LADDER.length);
    const trDescriptions = COMMAND_RISK_LADDER.map((r) => renderCommandRisk(r, 'tr').description);
    expect(new Set(trDescriptions).size).toBe(COMMAND_RISK_LADDER.length);
  });

  it('renderAllCommandRisks returns all 4 in ladder order for both languages', () => {
    expect(renderAllCommandRisks('en').map((r) => r.risk)).toEqual(COMMAND_RISK_LADDER);
    expect(renderAllCommandRisks('tr').map((r) => r.risk)).toEqual(COMMAND_RISK_LADDER);
  });
});

describe('toolPermissionToCommandRisk — ADR § Decision item 3 (approval-threshold table)', () => {
  it('maps read/confirm/always onto the 3 linear ladder rungs', () => {
    expect(toolPermissionToCommandRisk('read')).toBe('Oku');
    expect(toolPermissionToCommandRisk('confirm')).toBe('Değiştir');
    expect(toolPermissionToCommandRisk('always')).toBe('Çalıştır');
  });

  it('ADR § Decision item 4: kill is a correctly-matched entry — always-tier -> Çalıştır == registry tag', () => {
    const actualTier = classifyTool('deckent_kill', {});
    expect(actualTier).toBe('always');
    expect(toolPermissionToCommandRisk(actualTier)).toBe(getCommand('kill')?.risk);
  });

  it('ADR § Decision item 4: cleanup/recover are documented mismatches — always-tier target (Çalıştır) != registry tag (Değiştir)', () => {
    for (const name of ['cleanup', 'recover']) {
      const actualTier = classifyTool(`deckent_${name}`, {});
      expect(actualTier).toBe('always');
      const targetRisk = toolPermissionToCommandRisk(actualTier);
      expect(targetRisk).toBe('Çalıştır');
      expect(getCommand(name)?.risk).toBe('Değiştir');
      expect(targetRisk).not.toBe(getCommand(name)?.risk);
    }
  });

  it('every entry in COMMAND_REGISTRY uses a CommandRisk value this module knows how to render', () => {
    for (const entry of COMMAND_REGISTRY) {
      expect(() => renderCommandRisk(entry.risk, 'en')).not.toThrow();
    }
  });
});

describe('approvalRiskToCommandRisk / nervousRiskLevelToCommandRisk — ADR § Open Question 1', () => {
  it('ApprovalRisk.medium -> Değiştir (ADR-stated design-doc lean)', () => {
    expect(approvalRiskToCommandRisk('medium')).toBe('Değiştir');
  });

  it('nervous RiskLevel.medium -> Değiştir (same ADR lean, named alongside ApprovalRisk.medium)', () => {
    expect(nervousRiskLevelToCommandRisk('medium')).toBe('Değiştir');
  });

  it('ApprovalRisk ladder: none->Oku, low/medium->Değiştir, high/critical->Çalıştır (critical clamps)', () => {
    expect(approvalRiskToCommandRisk('none')).toBe('Oku');
    expect(approvalRiskToCommandRisk('low')).toBe('Değiştir');
    expect(approvalRiskToCommandRisk('high')).toBe('Çalıştır');
    expect(approvalRiskToCommandRisk('critical')).toBe('Çalıştır');
  });

  it('nervous RiskLevel ladder: low->Oku, high->Çalıştır', () => {
    expect(nervousRiskLevelToCommandRisk('low')).toBe('Oku');
    expect(nervousRiskLevelToCommandRisk('high')).toBe('Çalıştır');
  });
});

describe('toolRiskLevelToCommandRisk / toolCatalogRiskLevelToCommandRisk', () => {
  it('base ToolRiskLevel: safe->Oku, moderate->Değiştir, destructive->Çalıştır', () => {
    expect(toolRiskLevelToCommandRisk('safe')).toBe('Oku');
    expect(toolRiskLevelToCommandRisk('moderate')).toBe('Değiştir');
    expect(toolRiskLevelToCommandRisk('destructive')).toBe('Çalıştır');
  });

  it('ToolCatalogRiskLevel extends the base ladder and clamps critical to Çalıştır', () => {
    expect(toolCatalogRiskLevelToCommandRisk('safe')).toBe('Oku');
    expect(toolCatalogRiskLevelToCommandRisk('moderate')).toBe('Değiştir');
    expect(toolCatalogRiskLevelToCommandRisk('destructive')).toBe('Çalıştır');
    expect(toolCatalogRiskLevelToCommandRisk('critical')).toBe('Çalıştır');
  });
});

describe('catalogRenderRiskLevelToCommandRisk', () => {
  it('maps low/medium/high/critical onto the ladder, clamping high+critical to Çalıştır', () => {
    expect(catalogRenderRiskLevelToCommandRisk('low')).toBe('Oku');
    expect(catalogRenderRiskLevelToCommandRisk('medium')).toBe('Değiştir');
    expect(catalogRenderRiskLevelToCommandRisk('high')).toBe('Çalıştır');
    expect(catalogRenderRiskLevelToCommandRisk('critical')).toBe('Çalıştır');
  });
});

describe('toolTrustTierToCommandRisk', () => {
  it('Danger clamps to Çalıştır (risk-driven per classifyToolTrust)', () => {
    expect(toolTrustTierToCommandRisk('Danger')).toBe('Çalıştır');
  });

  it('source-derived tiers (Core/Project/MCP/Enterprise) use the honest Değiştir default', () => {
    for (const tier of ['Core', 'Project', 'MCP', 'Enterprise'] as const) {
      expect(toolTrustTierToCommandRisk(tier)).toBe('Değiştir');
    }
  });
});
