import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'docs', 'reference', 'api.md');

describe('docs/reference/api.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(500);
  });

  it('contains HTTP API section', () => {
    expect(content).toContain('## 11. HTTP API');
  });

  it('documents all GET endpoints', () => {
    expect(content).toContain('GET /api/status');
    expect(content).toContain('GET /api/sprint');
    expect(content).toContain('GET /api/history');
    expect(content).toContain('GET /api/config');
    expect(content).toContain('GET /api/doctor');
    expect(content).toContain('GET /api/memory');
    expect(content).toContain('GET /api/debt');
    expect(content).toContain('GET /api/job/:jobId');
    expect(content).toContain('GET /api/events');
    expect(content).toContain('GET /api/worker/:taskId/log');
  });

  it('documents all POST endpoints', () => {
    expect(content).toContain('POST /api/start');
    expect(content).toContain('POST /api/plan');
    expect(content).toContain('POST /api/kill/:workerId');
    expect(content).toContain('POST /api/set-directives');
    expect(content).toContain('POST /api/config');
  });

  it('contains curl examples', () => {
    expect(content).toContain('curl http://localhost:3100/api/status');
    expect(content).toContain('curl -X POST');
  });

  it('documents SSE stream format', () => {
    expect(content).toContain('SSE');
    expect(content).toContain('Server-Sent Events');
  });

  it('documents MCP Tools (21)', () => {
    expect(content).toContain('### Tools (21)');
    expect(content).toContain('deckent_init');
    expect(content).toContain('deckent_set_directives');
    expect(content).toContain('deckent_plan');
    expect(content).toContain('deckent_start');
    expect(content).toContain('deckent_status');
    expect(content).toContain('deckent_doctor');
    expect(content).toContain('deckent_retro');
    expect(content).toContain('deckent_history');
    expect(content).toContain('deckent_analyze_project');
    expect(content).toContain('deckent_sync');
    expect(content).toContain('deckent_config');
    expect(content).toContain('deckent_review');
    expect(content).toContain('deckent_run');
    expect(content).toContain('deckent_kill');
    expect(content).toContain('deckent_cleanup');
    expect(content).toContain('deckent_help');
    expect(content).toContain('deckent_agent_list');
    expect(content).toContain('deckent_skill_list');
    expect(content).toContain('deckent_checkpoint');
  });

  it('documents MCP Resources (8)', () => {
    expect(content).toContain('### Resources (8)');
    expect(content).toContain('deckent://dashboard');
    expect(content).toContain('deckent://directives');
    expect(content).toContain('deckent://memory');
    expect(content).toContain('deckent://debt');
    expect(content).toContain('deckent://config');
    expect(content).toContain('deckent://retro');
    expect(content).toContain('deckent://tasks');
    expect(content).toContain('deckent://agents');
  });

  it('contains authentication note', () => {
    expect(content).toContain('authentication');
    expect(content).toContain('local');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Kurulum');
  });
});
