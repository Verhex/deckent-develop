#!/usr/bin/env node
// 583/N4 gerçek-binary smoke — dist üzerinden iki bacak:
//   A) `deckent runs <prefix> --commit --yes` (koşu-sonu akışı) gerçek git-fixture'da
//      GERÇEK commit atar (intent-subject + deckent-run-trailer doğrulanır);
//   B) dist chat-tool-exec dispatcher'ıyla status→add→commit→log tam-tur
//      (confirm-özet yakalama dahil — REPL onay-kartının gördüğü metin).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`); };

const sh = (cwd, cmd, args, input) => new Promise((resolve) => {
  const c = spawn(cmd, args, { cwd, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  c.stdout.on('data', (d) => out += d);
  c.stderr.on('data', (d) => err += d);
  if (input !== undefined) { c.stdin.end(input); }
  c.on('close', (code) => resolve({ code, out, err }));
});
const git = (cwd, args) => sh(cwd, 'git', args);

const root = mkdtempSync(join(tmpdir(), 'n4-smoke-'));
await git(root, ['init', '-q', '-b', 'main']);
await git(root, ['config', '--local', 'user.name', 'smoke']);
await git(root, ['config', '--local', 'user.email', 'smoke@example.com']);
await git(root, ['config', '--local', 'commit.gpgsign', 'false']);
writeFileSync(join(root, '.gitignore'), '.deckent/\n.tasks/\n.brain/\n');
writeFileSync(join(root, 'base.txt'), 'baseline\n');
await git(root, ['add', '-A']);
await git(root, ['commit', '-q', '-m', 'baseline']);

// ── A: koşu-sonu --commit akışı — runs.test.ts'in KANITLI fikstür-yolu:
//    legacy snapshot+handle + jobs-COMPLETE-kaydı (isRowTerminal jobs-join) ──
const { saveApprovedSnapshot, saveRunHandle } = await import('/home/alperen/deckent-dev/dist/core/run-flow-store.js');
const flowId = 'aaaa1111-2222-4333-8444-555566667777';
const startedAt = '2026-07-18T10:00:00.000Z';
saveApprovedSnapshot(root, {
  flowId, revision: 1, planDigest: 'pd',
  approvedBy: { id: 'smoke' }, approvedAt: startedAt,
  sprint: { id: flowId, tasks: [] },
  intentSummary: 'implement login rate-limit',
});
const base = (await git(root, ['rev-parse', 'HEAD'])).out.trim();
saveRunHandle(root, {
  flowId, revision: 1, planDigest: 'pd',
  handle: { flowId, jobId: 'job-smoke', logRef: 'log' },
  startedAt, gitBase: base,
});
const jobsDir = join(root, '.deckent', 'runtime', 'jobs');
mkdirSync(jobsDir, { recursive: true });
writeFileSync(join(jobsDir, 'sprint-smoke.json'), JSON.stringify({
  status: 'COMPLETE', sprintId: 'sprint-smoke',
  metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
  completionRecord: { flowId },
}));

// koşunun "ayak izi": yeni bir dosya
writeFileSync(join(root, 'rate-limit.ts'), 'export const limit = 100;\n');

const cli = await sh(root, process.execPath, ['/home/alperen/deckent-dev/dist/cli/entry.js', 'runs', 'aaaa1111', '--commit', '--yes']);
check('A: --commit --yes çıktısı öneri+commit içeriyor', cli.out.includes('Commit proposal') && /Committed [0-9a-f]{7,}/.test(cli.out), cli.code !== 0 ? `code=${cli.code} err=${cli.err.slice(0,200)}` : '');
const subj = (await git(root, ['log', '-n1', '--pretty=%s'])).out.trim();
// legacy-`do` fikstüründe proposal yok → intent taşınmaz; dürüst-fallback
// subject beklenir (intent-yolu unit-testte tam-proposal-zinciriyle pinli).
check('A: subject = dürüst flow-fallback', subj === 'deckent: run aaaa1111 changes', subj);
const body = (await git(root, ['log', '-n1', '--pretty=%b'])).out;
check('A: deckent-run trailer commit-gövdesinde', body.includes(`deckent-run: ${flowId}`));
const status = (await git(root, ['status', '--porcelain'])).out.trim();
check('A: çalışma ağacı commit-sonrası temiz', status === '');

// ── B: dist chat-tool dispatcher tam-turu ──
const { createToolExecDispatcher } = await import('/home/alperen/deckent-dev/dist/cli/commands/chat-tool-exec.js');
const summaries = [];
const d = createToolExecDispatcher({ cwd: root, confirm: async (s) => { summaries.push(s); return true; } });
writeFileSync(join(root, 'feature.txt'), 'feature\n');
const st = await d.dispatch('deckent_git_status', {});
check('B: git_status ?? feature.txt görüyor', st.includes('?? feature.txt'));
const added = await d.dispatch('deckent_git_add', {});
check('B: git_add staged-1', added === '[deckent] staged 1 file(s)', added);
const committed = await d.dispatch('deckent_git_commit', { message: 'feat: feature file' });
check('B: git_commit sha döndü', /^\[deckent\] committed [0-9a-f]{7,}$/.test(committed), committed);
const log = await d.dispatch('deckent_git_log', { limit: 3 });
check('B: git_log iki N4-commit\'i de listeliyor', log.includes('feat: feature file') && log.includes('deckent: run aaaa1111 changes'));
check('B: confirm-özetleri insan-mührü metinleri', JSON.stringify(summaries) === JSON.stringify(['Stage changes: all', 'Commit: feat: feature file']), JSON.stringify(summaries));

rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
