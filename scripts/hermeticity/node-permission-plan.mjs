import {
  posix as posixPath,
  win32 as win32Path,
} from 'node:path';

const SUPPORTED_PLATFORMS = [
  'posix',
  'win32',
];

const BROAD_POSIX_PATHS = [
  '/',
  '/bin',
  '/dev',
  '/etc',
  '/home',
  '/lib',
  '/lib64',
  '/mnt',
  '/opt',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/sys',
  '/tmp',
  '/usr',
  '/Users',
  '/var',
];

const BROAD_WIN32_PATHS = [
  'C:\\',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\Users',
  'C:\\Windows',
];

const SENSITIVE_POSIX_PATH_TREES = [
  '/boot',
  '/dev',
  '/etc',
  '/home',
  '/media',
  '/mnt',
  '/private',
  '/proc',
  '/root',
  '/run',
  '/sys',
  '/tmp',
  '/Users',
  '/var',
  '/Volumes',
];

const SENSITIVE_WIN32_ROOT_NAMES = [
  'program files',
  'program files (x86)',
  'programdata',
  'users',
  'windows',
];

const STARTUP_ENVIRONMENT_PREFIXES = [
  'DYLD_',
  'LD_',
  'NODE_',
  'NPM_CONFIG_',
];

const STARTUP_ENVIRONMENT_KEYS = [
  'BASH_ENV',
  'COMSPEC',
  'DYLD_FALLBACK_FRAMEWORK_PATH',
  'DYLD_FALLBACK_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_PRINT_TO_FILE',
  'DYLD_ROOT_PATH',
  'DYLD_SHARED_CACHE_DIR',
  'ENV',
  'ELECTRON_RUN_AS_NODE',
  'GCONV_PATH',
  'LD_AUDIT',
  'LD_DEBUG',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'LOCPATH',
  'NODE_EXTRA_CA_CERTS',
  'NODE_CHANNEL_FD',
  'NODE_COMPILE_CACHE',
  'NODE_COMPILE_CACHE_PORTABLE',
  'NODE_INSPECT_RESUME_ON_START',
  'NODE_PATH',
  'NODE_REPL_EXTERNAL_MODULE',
  'NODE_UNIQUE_ID',
  'NODE_V8_COVERAGE',
  'OPENSSL_CONF',
  'PATH',
  'PATHEXT',
  'PERL5OPT',
  'PROMPT_COMMAND',
  'PYTHONHOME',
  'PYTHONPATH',
  'RUBYLIB',
  'RUBYOPT',
  'SHELL',
  'ZDOTDIR',
];

const SAFE_CANDIDATE_EXEC_ARGV = [
  '--enable-source-maps',
  '--force-context-aware',
  '--frozen-intrinsics',
  '--no-deprecation',
  '--no-warnings',
  '--throw-deprecation',
  '--trace-deprecation',
  '--trace-uncaught',
  '--trace-warnings',
];

export const NODE_PERMISSION_PLAN_SCHEMA_VERSION = 1;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function freezeJson(value) {
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) freezeJson(value[key]);
    return Object.freeze(value);
  }
  return value;
}

function detailRecord(value) {
  return isRecord(value) ? { ...value } : {};
}

function emptyCapabilities() {
  return {
    childProcess: false,
    worker: false,
    addons: false,
  };
}

function permissionHold(reasonCode, details = {}) {
  return freezeJson({
    schemaVersion: NODE_PERMISSION_PLAN_SCHEMA_VERSION,
    kind: 'node-permission-plan',
    state: 'HOLD',
    defenseInDepthOnly: true,
    proofEligible: false,
    reasonCode,
    platform: null,
    nodeMajor: null,
    bootstrapPath: null,
    readOnlyPaths: [],
    writePaths: [],
    candidateExecArgv: [],
    candidateEnvironment: {},
    inheritHostEnvironment: false,
    capabilities: emptyCapabilities(),
    execArgv: [],
    descendantNodeOptions: null,
    environmentPatch: {},
    details: detailRecord(details),
  });
}

function pathApi(platform) {
  return platform === 'win32' ? win32Path : posixPath;
}

function unsafeCharacters(value) {
  return /[\u0000-\u001F\u007F]/u.test(value)
    || value.includes(',');
}

function validUnicode(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) return false;
  }
  return value.normalize('NFC') === value;
}

function unsafeWin32Path(value) {
  if (value.startsWith('\\\\') || value.slice(2).includes(':')) return true;
  const components = value.slice(3).split('\\');
  return components.some(component => {
    const baseName = component.split('.')[0];
    return /[ .]$/u.test(component)
      || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]|CONIN\$|CONOUT\$)$/iu.test(baseName);
  });
}

function canonicalAbsolutePath(value, platform) {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 32_768
    || unsafeCharacters(value)
    || !validUnicode(value)) {
    return { ok: false, reasonCode: 'E_NODE_PERMISSION_PATH_INVALID' };
  }

  const api = pathApi(platform);
  if (!api.isAbsolute(value)) {
    return { ok: false, reasonCode: 'E_NODE_PERMISSION_PATH_NOT_ABSOLUTE' };
  }
  const normalized = api.normalize(value);
  if (normalized !== value
    || value.split(platform === 'win32' ? /[\\/]/u : '/').includes('..')) {
    return { ok: false, reasonCode: 'E_NODE_PERMISSION_PATH_NOT_CANONICAL' };
  }
  if (platform === 'win32' && unsafeWin32Path(value)) {
    return { ok: false, reasonCode: 'E_NODE_PERMISSION_DEVICE_PATH_DENIED' };
  }
  return { ok: true, value: normalized };
}

function comparisonPath(value, platform) {
  return platform === 'win32' ? value.toLowerCase() : value;
}

function deterministicCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function broadPath(value, platform) {
  const api = pathApi(platform);
  const parsed = api.parse(value);
  if (comparisonPath(parsed.root, platform) === comparisonPath(value, platform)) {
    return true;
  }
  const broadPaths = platform === 'win32' ? BROAD_WIN32_PATHS : BROAD_POSIX_PATHS;
  const compared = comparisonPath(value, platform);
  return broadPaths.some(path => comparisonPath(path, platform) === compared);
}

function sensitivePath(value, platform) {
  if (platform === 'win32') {
    const parsed = win32Path.parse(value);
    const firstComponent = value
      .slice(parsed.root.length)
      .split('\\')[0]
      .toLowerCase();
    return SENSITIVE_WIN32_ROOT_NAMES.includes(firstComponent);
  }
  return SENSITIVE_POSIX_PATH_TREES.some(tree => (
    value === tree || value.startsWith(`${tree}/`)
  ));
}

function specialHostAuthorityPath(value, platform) {
  const compared = comparisonPath(value, platform);
  if (platform === 'win32') {
    return compared.includes('\\pipe\\docker_engine')
      || compared.includes('\\pipe\\containerd-containerd')
      || compared.includes('\\globalroot\\device\\');
  }
  return [
    '/run/containerd/containerd.sock',
    '/run/docker.sock',
    '/var/run/docker.sock',
  ].some(path => compared === path || compared.startsWith(`${path}/`));
}

function pathContains(parent, child, platform) {
  const api = pathApi(platform);
  const relative = comparisonPath(
    api.relative(parent, child),
    platform,
  );
  return relative === ''
    || (!relative.startsWith(`..${api.sep}`)
      && relative !== '..'
      && !api.isAbsolute(relative));
}

function pathsOverlap(left, right, platform) {
  return pathContains(left, right, platform)
    || pathContains(right, left, platform);
}

function normalizePathList(value, field, platform) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 256) {
    return {
      ok: false,
      reasonCode: 'E_NODE_PERMISSION_PATH_LIST_INVALID',
      details: { field },
    };
  }

  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = canonicalAbsolutePath(value[index], platform);
    if (!candidate.ok) {
      return {
        ok: false,
        reasonCode: candidate.reasonCode,
        details: { field, index },
      };
    }
    if (broadPath(candidate.value, platform)) {
      return {
        ok: false,
        reasonCode: 'E_NODE_PERMISSION_BROAD_PATH_DENIED',
        details: { field, index },
      };
    }
    if (sensitivePath(candidate.value, platform)) {
      return {
        ok: false,
        reasonCode: 'E_NODE_PERMISSION_SENSITIVE_PATH_DENIED',
        details: { field, index },
      };
    }
    if (specialHostAuthorityPath(candidate.value, platform)) {
      return {
        ok: false,
        reasonCode: 'E_NODE_PERMISSION_HOST_AUTHORITY_PATH_DENIED',
        details: { field, index },
      };
    }
    if (normalized.some(path => pathsOverlap(path, candidate.value, platform))) {
      return {
        ok: false,
        reasonCode: 'E_NODE_PERMISSION_PATH_AUTHORITY_OVERLAP',
        details: { field, index },
      };
    }
    normalized.push(candidate.value);
  }
  normalized.sort(deterministicCompare);
  return { ok: true, value: normalized };
}

function normalizeCapabilities(input) {
  const fields = [
    ['allowChildProcess', 'childProcess'],
    ['allowWorker', 'worker'],
    ['allowAddons', 'addons'],
  ];
  const capabilities = {};
  for (const [inputField, outputField] of fields) {
    if (hasOwn(input, inputField) && typeof input[inputField] !== 'boolean') {
      return {
        ok: false,
        reasonCode: 'E_NODE_PERMISSION_CAPABILITY_INVALID',
        details: { field: inputField },
      };
    }
    capabilities[outputField] = input[inputField] === true;
  }
  return { ok: true, value: capabilities };
}

function startupEnvironmentKey(value) {
  const upper = value.toUpperCase();
  return STARTUP_ENVIRONMENT_KEYS.includes(upper)
    || STARTUP_ENVIRONMENT_PREFIXES.some(prefix => upper.startsWith(prefix));
}

function safeCandidateExecArg(value) {
  if (SAFE_CANDIDATE_EXEC_ARGV.includes(value)) return true;
  return /^--unhandled-rejections=(?:strict|throw)$/u.test(value)
    || /^--stack-trace-limit=[1-9][0-9]{0,5}$/u.test(value)
    || /^--max-old-space-size=[1-9][0-9]{0,8}$/u.test(value)
    || /^--max-semi-space-size=[1-9][0-9]{0,8}$/u.test(value);
}

export function validateNodeStartupInput(input) {
  if (!isRecord(input)) {
    return {
      ok: false,
      reasonCode: 'E_NODE_STARTUP_INPUT_INVALID',
      details: {},
    };
  }
  const candidateExecArgv = input.candidateExecArgv ?? [];
  const candidateEnvironment = input.candidateEnvironment ?? {};
  if (!Array.isArray(candidateExecArgv) || !isRecord(candidateEnvironment)) {
    return {
      ok: false,
      reasonCode: 'E_NODE_STARTUP_INPUT_INVALID',
      details: {},
    };
  }
  for (let index = 0; index < candidateExecArgv.length; index += 1) {
    const argument = candidateExecArgv[index];
    if (typeof argument !== 'string'
      || argument.length === 0
      || argument.length > 4_096
      || argument.includes('\0')
      || argument.includes('\r')
      || argument.includes('\n')
      || !safeCandidateExecArg(argument)) {
      return {
        ok: false,
        reasonCode: 'E_NODE_STARTUP_ARGV_DENIED',
        details: { index },
      };
    }
  }

  const sanitizedEnvironment = {};
  const keys = Object.keys(candidateEnvironment).sort();
  for (const key of keys) {
    const value = candidateEnvironment[key];
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,255}$/u.test(key)
      || typeof value !== 'string'
      || value.length > 131_072
      || value.includes('\0')
      || startupEnvironmentKey(key)) {
      return {
        ok: false,
        reasonCode: startupEnvironmentKey(key)
          ? 'E_NODE_STARTUP_ENVIRONMENT_DENIED'
          : 'E_NODE_STARTUP_ENVIRONMENT_INVALID',
        details: { key },
      };
    }
    sanitizedEnvironment[key] = value;
  }
  return {
    ok: true,
    value: freezeJson({
      candidateExecArgv: [...candidateExecArgv],
      candidateEnvironment: sanitizedEnvironment,
    }),
  };
}

function encodeNodeOption(value) {
  return /[\s"'\\]/u.test(value) ? JSON.stringify(value) : value;
}

function environmentPatch(nodeOptions) {
  const patch = {};
  for (const key of STARTUP_ENVIRONMENT_KEYS) patch[key] = null;
  patch.NODE_OPTIONS = nodeOptions;
  return patch;
}

function buildExecArgv(input) {
  const readPaths = [...input.readOnlyPaths, ...input.writePaths];
  readPaths.sort(deterministicCompare);
  const args = [
    ...input.candidateExecArgv,
    '--permission',
    '--no-global-search-paths',
    '--disable-proto=throw',
    '--report-exclude-env',
    `--import=${input.bootstrapPath}`,
  ];
  for (const readPath of readPaths) args.push(`--allow-fs-read=${readPath}`);
  for (const writePath of input.writePaths) args.push(`--allow-fs-write=${writePath}`);
  if (input.capabilities.childProcess) args.push('--allow-child-process');
  if (input.capabilities.worker) args.push('--allow-worker');
  if (input.capabilities.addons) args.push('--allow-addons');
  return args;
}

export function createNodePermissionPlan(input) {
  if (!isRecord(input)) {
    return permissionHold('E_NODE_PERMISSION_INPUT_INVALID');
  }
  if (hasOwn(input, 'proofEligible')
    || hasOwn(input, 'execArgv')
    || hasOwn(input, 'descendantNodeOptions')
    || hasOwn(input, 'environmentPatch')
    || hasOwn(input, 'inheritHostEnvironment')) {
    return permissionHold('E_NODE_PERMISSION_RESERVED_FIELD');
  }
  if (!SUPPORTED_PLATFORMS.includes(input.platform)) {
    return permissionHold('E_NODE_PERMISSION_PLATFORM_INVALID', {
      platform: input.platform ?? null,
    });
  }
  if (!Number.isSafeInteger(input.nodeMajor) || input.nodeMajor < 24) {
    return permissionHold('E_NODE_PERMISSION_RUNTIME_UNSUPPORTED', {
      nodeMajor: Number.isSafeInteger(input.nodeMajor) ? input.nodeMajor : null,
    });
  }

  const bootstrapPath = canonicalAbsolutePath(input.bootstrapPath, input.platform);
  if (!bootstrapPath.ok
    || broadPath(bootstrapPath.value ?? '', input.platform)
    || sensitivePath(bootstrapPath.value ?? '', input.platform)
    || specialHostAuthorityPath(bootstrapPath.value ?? '', input.platform)) {
    return permissionHold(
      bootstrapPath.ok
        ? 'E_NODE_PERMISSION_BOOTSTRAP_PATH_DENIED'
        : bootstrapPath.reasonCode,
      { field: 'bootstrapPath' },
    );
  }
  const readOnlyPaths = normalizePathList(
    input.readOnlyPaths,
    'readOnlyPaths',
    input.platform,
  );
  if (!readOnlyPaths.ok) {
    return permissionHold(readOnlyPaths.reasonCode, readOnlyPaths.details);
  }
  const writePaths = normalizePathList(
    input.writePaths,
    'writePaths',
    input.platform,
  );
  if (!writePaths.ok) {
    return permissionHold(writePaths.reasonCode, writePaths.details);
  }
  const overlapping = readOnlyPaths.value.some(readPath => (
    writePaths.value.some(writePath => pathsOverlap(readPath, writePath, input.platform))
  ));
  if (overlapping) {
    return permissionHold('E_NODE_PERMISSION_READ_WRITE_AUTHORITY_OVERLAP');
  }
  if (!readOnlyPaths.value.some(readPath => (
    pathContains(readPath, bootstrapPath.value, input.platform)
  ))) {
    return permissionHold('E_NODE_PERMISSION_BOOTSTRAP_OUTSIDE_READ_AUTHORITY');
  }
  const capabilities = normalizeCapabilities(input);
  if (!capabilities.ok) {
    return permissionHold(capabilities.reasonCode, capabilities.details);
  }
  const startupInput = validateNodeStartupInput({
    candidateExecArgv: input.candidateExecArgv,
    candidateEnvironment: input.candidateEnvironment,
  });
  if (!startupInput.ok) {
    return permissionHold(startupInput.reasonCode, startupInput.details);
  }

  const planFields = {
    platform: input.platform,
    nodeMajor: input.nodeMajor,
    bootstrapPath: bootstrapPath.value,
    readOnlyPaths: readOnlyPaths.value,
    writePaths: writePaths.value,
    candidateExecArgv: startupInput.value.candidateExecArgv,
    candidateEnvironment: startupInput.value.candidateEnvironment,
    inheritHostEnvironment: false,
    capabilities: capabilities.value,
  };
  const execArgv = buildExecArgv(planFields);
  const descendantNodeOptions = execArgv.map(encodeNodeOption).join(' ');

  return freezeJson({
    schemaVersion: NODE_PERMISSION_PLAN_SCHEMA_VERSION,
    kind: 'node-permission-plan',
    state: 'READY',
    defenseInDepthOnly: true,
    proofEligible: false,
    reasonCode: 'NONE',
    ...planFields,
    execArgv,
    descendantNodeOptions,
    environmentPatch: environmentPatch(descendantNodeOptions),
    details: {},
  });
}

function validCapabilities(value) {
  return isRecord(value)
    && typeof value.childProcess === 'boolean'
    && typeof value.worker === 'boolean'
    && typeof value.addons === 'boolean';
}

export function validateNodePermissionPlan(value) {
  const commonValid = isRecord(value)
    && value.schemaVersion === NODE_PERMISSION_PLAN_SCHEMA_VERSION
    && value.kind === 'node-permission-plan'
    && ['READY', 'HOLD'].includes(value.state)
    && value.defenseInDepthOnly === true
    && value.proofEligible === false
    && typeof value.reasonCode === 'string'
    && value.reasonCode.length > 0
    && Array.isArray(value.execArgv)
    && Array.isArray(value.candidateExecArgv)
    && isRecord(value.candidateEnvironment)
    && value.inheritHostEnvironment === false
    && validCapabilities(value.capabilities)
    && isRecord(value.environmentPatch)
    && isRecord(value.details);
  if (!commonValid) {
    return {
      ok: false,
      hold: permissionHold('E_NODE_PERMISSION_PLAN_INVALID'),
    };
  }
  if (value.state === 'HOLD') {
    if (value.reasonCode === 'NONE') {
      return {
        ok: false,
        hold: permissionHold('E_NODE_PERMISSION_PLAN_INVALID'),
      };
    }
    return { ok: true, value: freezeJson(structuredClone(value)) };
  }

  const reconstructed = createNodePermissionPlan({
    platform: value.platform,
    nodeMajor: value.nodeMajor,
    bootstrapPath: value.bootstrapPath,
    readOnlyPaths: value.readOnlyPaths,
    writePaths: value.writePaths,
    candidateExecArgv: value.candidateExecArgv,
    candidateEnvironment: value.candidateEnvironment,
    allowChildProcess: value.capabilities.childProcess,
    allowWorker: value.capabilities.worker,
    allowAddons: value.capabilities.addons,
  });
  if (reconstructed.state !== 'READY'
    || JSON.stringify(reconstructed) !== JSON.stringify(value)) {
    return {
      ok: false,
      hold: permissionHold('E_NODE_PERMISSION_PLAN_INVALID'),
    };
  }
  return { ok: true, value: reconstructed };
}
