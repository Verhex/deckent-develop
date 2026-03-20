import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('GitHub Configuration Files', () => {
  let securityTemplateContent: string;
  let fundingContent: string;

  beforeAll(() => {
    securityTemplateContent = readFileSync(
      resolve('.github/ISSUE_TEMPLATE/security.md'),
      'utf-8'
    );
    fundingContent = readFileSync(resolve('.github/FUNDING.yml'), 'utf-8');
  });

  describe('Security Template (.github/ISSUE_TEMPLATE/security.md)', () => {
    it('should have valid YAML frontmatter', () => {
      expect(securityTemplateContent).toMatch(
        /^---\nname: Security Vulnerability Report\nabout:/
      );
    });

    it('should have security label', () => {
      expect(securityTemplateContent).toContain('labels: security');
    });

    it('should contain Vulnerability Type section', () => {
      expect(securityTemplateContent).toContain('## Vulnerability Type');
    });

    it('should list common vulnerability types', () => {
      const vulnTypes = [
        'Injection',
        'Authentication bypass',
        'Authorization',
        'Path traversal',
        'Insecure deserialization',
        'Sensitive data exposure',
        'Cross-site scripting',
        'supply chain',
      ];
      vulnTypes.forEach((type) => {
        expect(securityTemplateContent).toContain(type);
      });
    });

    it('should contain Severity Assessment section', () => {
      expect(securityTemplateContent).toContain('## Severity Assessment');
    });

    it('should define severity levels with CVSS ranges', () => {
      expect(securityTemplateContent).toContain('Critical (CVSS 9.0-10.0)');
      expect(securityTemplateContent).toContain('High (CVSS 7.0-8.9)');
      expect(securityTemplateContent).toContain('Medium (CVSS 4.0-6.9)');
      expect(securityTemplateContent).toContain('Low (CVSS 0.1-3.9)');
    });

    it('should have CVSS score field', () => {
      expect(securityTemplateContent).toContain('CVSS Score');
    });

    it('should contain Steps to Reproduce section', () => {
      expect(securityTemplateContent).toContain('## Steps to Reproduce');
    });

    it('should request environment details', () => {
      expect(securityTemplateContent).toContain('Deckent version');
      expect(securityTemplateContent).toContain('Node.js version');
      expect(securityTemplateContent).toContain('OS');
    });

    it('should contain Impact Assessment section', () => {
      expect(securityTemplateContent).toContain('## Impact Assessment');
    });

    it('should define impact scope details', () => {
      expect(securityTemplateContent).toContain('Attack vector');
      expect(securityTemplateContent).toContain('Authentication required');
      expect(securityTemplateContent).toContain('User interaction required');
      expect(securityTemplateContent).toContain('Privileges required');
    });

    it('should request affected component information', () => {
      expect(securityTemplateContent).toContain('Affected component(s)');
    });

    it('should contain Responsible Disclosure section', () => {
      expect(securityTemplateContent).toContain('## Responsible Disclosure Policy');
    });

    it('should define CVSS threshold for email disclosure', () => {
      expect(securityTemplateContent).toContain('CVSS ≥ 7.0');
    });

    it('should specify response and patch timelines', () => {
      expect(securityTemplateContent).toContain('72 hours');
      expect(securityTemplateContent).toContain('30 days');
    });

    it('should mention security advisory (GHSA)', () => {
      expect(securityTemplateContent).toContain('GHSA');
    });

    it('should request affected components examples', () => {
      expect(securityTemplateContent).toMatch(/src\/(api|orchestra|agents)/);
    });

    it('should warn against public disclosure of exploits', () => {
      expect(securityTemplateContent).toContain('exploit code');
      expect(securityTemplateContent).toContain('step-by-step attack');
    });

    it('should include Proposed Fix section', () => {
      expect(securityTemplateContent).toContain('## Proposed Fix');
    });

    it('should include Timeline & Patches section', () => {
      expect(securityTemplateContent).toContain('## Timeline & Patches');
    });

    it('should mention CHANGELOG credit', () => {
      expect(securityTemplateContent).toContain('CHANGELOG');
    });
  });

  describe('FUNDING.yml (.github/FUNDING.yml)', () => {
    it('should be valid YAML', () => {
      expect(fundingContent).toContain('github:');
      expect(fundingContent).toMatch(/^#/);
    });

    it('should have github sponsors section', () => {
      expect(fundingContent).toContain('github:');
    });

    it('should have custom funding links section', () => {
      expect(fundingContent).toContain('custom:');
    });

    it('should reference GitHub documentation', () => {
      expect(fundingContent).toContain('docs.github.com');
    });

    it('should include helpful comments', () => {
      expect(fundingContent).toContain('# GitHub Sponsors usernames');
      expect(fundingContent).toContain('# Custom funding links');
    });

    it('should document link format in comments', () => {
      expect(fundingContent).toContain('Example:');
    });

    it('should include example funding platforms', () => {
      expect(fundingContent).toContain('Patreon');
      expect(fundingContent).toContain('OpenCollective');
      expect(fundingContent).toContain('Ko-fi');
      expect(fundingContent).toContain('Buy Me A Coffee');
    });

    it('should list alternative sponsorship methods', () => {
      expect(fundingContent).toContain('patreon');
      expect(fundingContent).toContain('open_collective');
      expect(fundingContent).toContain('ko_fi');
      expect(fundingContent).toContain('tidelift');
      expect(fundingContent).toContain('liberapay');
    });

    it('should have at least one custom funding link', () => {
      const customMatch = fundingContent.match(/custom:\s*\n([\s\S]*?)(\n\n|#|$)/);
      expect(customMatch).toBeDefined();
      if (customMatch && customMatch[1]) {
        const links = customMatch[1].match(/https?:\/\//g);
        expect(links ? links.length : 0).toBeGreaterThan(0);
      }
    });

    it('should have custom links starting with https', () => {
      expect(fundingContent).toMatch(/- https:\/\//);
    });

    it('should mark alternative methods as commented out', () => {
      expect(fundingContent).toContain('# patreon:');
      expect(fundingContent).toContain('# liberapay:');
    });

    it('should include npm tidelift example', () => {
      expect(fundingContent).toContain('npm/deckent');
    });
  });

  describe('Integration between files', () => {
    it('both files should exist', () => {
      expect(securityTemplateContent).toBeTruthy();
      expect(fundingContent).toBeTruthy();
    });

    it('security template should mention responsible disclosure', () => {
      expect(securityTemplateContent).toContain('responsible');
    });

    it('funding file should reference GitHub docs', () => {
      expect(fundingContent).toContain('https://docs.github.com');
    });
  });
});
