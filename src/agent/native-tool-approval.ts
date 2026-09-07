import { classifyApprovalCommand } from '../core/approval-command-classification.js';
import type {
  NativeToolApprovalClassification,
  NativeToolApprovalClassifier,
} from './tools/types.js';

function text(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function classified(
  scope: NativeToolApprovalClassification['scope'],
  risk: NativeToolApprovalClassification['risk'],
  scopeId: string,
  resource: string,
): NativeToolApprovalClassification {
  return { scope, risk, scopeId, resource };
}

export function nativeBuiltinApprovalClassifier(tool: string): NativeToolApprovalClassifier | undefined {
  if (tool === 'deckent_bash') {
    return (args, resource) => {
      const command = text(args, 'cmd');
      if (!command) return null;
      const result = classifyApprovalCommand(command, 'agentic');
      return classified(result.scope, result.risk, tool, resource);
    };
  }
  if (tool === 'deckent_write_file' || tool === 'deckent_edit_file') {
    return (args, resource) => {
      return text(args, 'path') ? classified('file-write', 'high', tool, resource) : null;
    };
  }
  if (tool === 'deckent_git_add' || tool === 'deckent_git_commit') {
    return (_args, resource) => classified('git-mutation', 'high', tool, resource);
  }
  return undefined;
}

export function classifyNativeToolApproval(
  classifier: NativeToolApprovalClassifier | undefined,
  args: Record<string, unknown>,
  resource = '',
): NativeToolApprovalClassification | { readonly reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' } {
  let result: NativeToolApprovalClassification | null | undefined;
  try { result = classifier?.(args, resource); } catch { result = null; }
  if (!result) return { reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' };
  if (!['file-read', 'file-write', 'shell-exec', 'git-mutation', 'network', 'credential', 'lifecycle'].includes(result.scope)
    || !['none', 'low', 'medium', 'high', 'critical'].includes(result.risk)
    || typeof result.scopeId !== 'string' || result.scopeId.trim().length === 0
    || typeof result.resource !== 'string') {
    return { reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' };
  }
  return result;
}
