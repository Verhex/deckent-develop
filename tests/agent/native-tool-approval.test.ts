import { describe, expect, it } from 'vitest';
import {
  classifyNativeToolApproval,
  nativeBuiltinApprovalClassifier,
} from '../../src/agent/native-tool-approval.js';
import { permissionResource } from '../../src/agent/native-permission-resource.js';
import { decide, resolveTier } from '../../src/agent/permission.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { tmpdir } from 'node:os';

describe('native tool approval producer metadata', () => {
  it('classifies actual builtin arguments', () => {
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_bash'), { cmd: 'npm publish' }, 'npm publish')).toMatchObject({ scope: 'network', risk: 'high' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_write_file'), { path: 'src/a.ts' }, 'src/a.ts')).toMatchObject({ scope: 'file-write', resource: 'src/a.ts' });
  });

  it('holds missing, external, and malformed classifications', () => {
    expect(classifyNativeToolApproval(undefined, {})).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_bash'), {})).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
  });

  it('classifies silent read surfaces with file-read scope aligned to primaryResource', () => {
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_read_file'), { path: 'docs/a.md' }, 'docs/a.md'))
      .toEqual({ scope: 'file-read', risk: 'none', scopeId: 'deckent_read_file', resource: 'docs/a.md' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_list_dir'), { path: 'src' }, 'src'))
      .toEqual({ scope: 'file-read', risk: 'none', scopeId: 'deckent_list_dir', resource: 'src' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_list_dir'), {}, '.'))
      .toEqual({ scope: 'file-read', risk: 'none', scopeId: 'deckent_list_dir', resource: '.' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_grep'), { pattern: 'foo', path: 'src' }, 'src'))
      .toEqual({ scope: 'file-read', risk: 'low', scopeId: 'deckent_grep', resource: 'src' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_glob'), { pattern: '**/*.ts' }, '**/*.ts'))
      .toEqual({ scope: 'file-read', risk: 'low', scopeId: 'deckent_glob', resource: '**/*.ts' });
  });

  it('fail-closes read classifiers on invalid args or empty resource (no broad scope)', () => {
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_read_file'), {}, '')).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_list_dir'), {}, '')).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_list_dir'), { path: 'src' }, '.')).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_grep'), { path: 'src' }, 'src')).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
    expect(classifyNativeToolApproval(
      nativeBuiltinApprovalClassifier('deckent_list_dir'),
      { file_path: 'docs' },
      permissionResource('deckent_list_dir', { file_path: 'docs' }),
    )).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
  });

  it('coerces list_dir path like chat-tool-exec String(args.path ?? ".")', () => {
    expect(permissionResource('deckent_list_dir', { path: 42 })).toBe('42');
    expect(classifyNativeToolApproval(
      nativeBuiltinApprovalClassifier('deckent_list_dir'),
      { path: 42 },
      '42',
    )).toMatchObject({ scope: 'file-read', resource: '42' });
    expect(classifyNativeToolApproval(
      nativeBuiltinApprovalClassifier('deckent_list_dir'),
      { path: 42 },
      '.',
    )).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
  });

  it('grep explicit path "." stays resource "." so deny(.) holds (not pattern fallback)', () => {
    const args = { path: '.', pattern: 'needle' };
    expect(permissionResource('deckent_grep', args)).toBe('.');
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_grep'), args, '.'))
      .toMatchObject({ scope: 'file-read', resource: '.' });
    const def = buildNativeToolRegistry({ cwd: () => tmpdir() }).get('deckent_grep')!;
    expect(decide('deckent_grep', '.', resolveTier(def, SAFE_DEFAULT_POLICY), {
      rules: [],
      denies: [{ tool: 'deckent_grep', pattern: '.' }],
      policy: SAFE_DEFAULT_POLICY,
      mode: 'suggest',
    })).toBe('deny');
    expect(permissionResource('deckent_grep', { pattern: 'needle' })).toBe('needle');
  });

  it('preserves whitespace in list_dir path resource identity (no trim)', () => {
    const args = { path: '  private  ' };
    const resource = permissionResource('deckent_list_dir', args);
    expect(resource).toBe('  private  ');
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_list_dir'), args, resource))
      .toMatchObject({ scope: 'file-read', resource: '  private  ' });
  });
});

describe('native tool approval — 7111 read-only shell classification', () => {
  it('classifies a proven read-only deckent_bash command as file-read when the project root is supplied', () => {
    const classifier = nativeBuiltinApprovalClassifier('deckent_bash', { cwd: () => '/srv/deckent', platform: 'linux' });
    expect(classifyNativeToolApproval(classifier, { cmd: "sed -n '1,50p' docs/a.md" }, "sed -n '1,50p' docs/a.md"))
      .toEqual({ scope: 'file-read', risk: 'none', scopeId: 'deckent_bash', resource: "sed -n '1,50p' docs/a.md" });
    expect(classifyNativeToolApproval(classifier, { cmd: 'grep -rn foo src' }, 'grep -rn foo src')).toMatchObject({ scope: 'file-read', risk: 'low' });
    expect(classifyNativeToolApproval(classifier, { cmd: 'cat f > g' }, 'cat f > g')).toMatchObject({ scope: 'shell-exec', risk: 'medium' });
    expect(classifyNativeToolApproval(classifier, { cmd: 'cat /etc/passwd' }, 'cat /etc/passwd')).toMatchObject({ scope: 'shell-exec' });
  });

  it('keeps the context-free classifier on the shell-exec floor', () => {
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_bash'), { cmd: 'cat README.md' }, 'cat README.md'))
      .toMatchObject({ scope: 'shell-exec', risk: 'medium' });
  });

  it('follows the live cwd per call and the host dialect', () => {
    let root = '/srv/one';
    const classifier = nativeBuiltinApprovalClassifier('deckent_bash', { cwd: () => root, platform: 'linux' });
    expect(classifyNativeToolApproval(classifier, { cmd: 'cat /srv/one/a.txt' }, 'x')).toMatchObject({ scope: 'file-read' });
    root = '/srv/two';
    expect(classifyNativeToolApproval(classifier, { cmd: 'cat /srv/one/a.txt' }, 'x')).toMatchObject({ scope: 'shell-exec' });
    const win = nativeBuiltinApprovalClassifier('deckent_bash', { cwd: () => 'C:\\proj', platform: 'win32' });
    expect(classifyNativeToolApproval(win, { cmd: 'Get-Content a.txt -Tail 5' }, 'x')).toMatchObject({ scope: 'file-read' });
  });
});
