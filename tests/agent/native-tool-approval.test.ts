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
