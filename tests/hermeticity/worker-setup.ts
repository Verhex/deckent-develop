import {
  installRuntimeWriteGuard,
  physicalAncestorFromModuleUrl,
} from './runtime-write-guard.js';

const REPO_ROOT = physicalAncestorFromModuleUrl(import.meta.url, 2);

process.env['DECKENT_TEST_HERMETICITY'] = '1';
installRuntimeWriteGuard(REPO_ROOT);
