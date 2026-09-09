import { describe, expect, it } from 'vitest';
import {
  classifyNativeToolApproval,
  nativeBuiltinApprovalClassifier,
} from '../../src/agent/native-tool-approval.js';

describe('native tool approval producer metadata', () => {
  it('classifies actual builtin arguments', () => {
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_bash'), { cmd: 'npm publish' }, 'npm publish')).toMatchObject({ scope: 'network', risk: 'high' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_write_file'), { path: 'src/a.ts' }, 'src/a.ts')).toMatchObject({ scope: 'file-write', resource: 'src/a.ts' });
  });

  it('holds missing, external, and malformed classifications', () => {
    expect(classifyNativeToolApproval(undefined, {})).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
    expect(classifyNativeToolApproval(nativeBuiltinApprovalClassifier('deckent_bash'), {})).toEqual({ reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' });
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
