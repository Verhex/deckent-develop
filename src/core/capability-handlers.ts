// ═══ Extended Capability Handlers — F8 reference implementations ═══════════
//
// Additive handlers for real non-code capabilities. They intentionally install
// through CapabilityRegistry so the broker stays unchanged and the existing
// least-privilege gate continues to enforce each handler's requiredCapability.

import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import {
  CapabilityRegistry,
  type CapabilityHandler,
  type InvocationContext,
} from './capability-broker.js';
import type { Capability } from './work-model.js';

type ExtendedRequiredCapability = 'net.read' | 'env.read' | 'shell.exec';

interface FetchResponseLike {
  status: number;
  text(): Promise<string>;
}

type FetchLike = (
  input: string | URL,
  init?: { method: 'GET'; headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

interface SpawnedProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

type SpawnLike = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => SpawnedProcessLike;

export interface HttpGetHandlerOptions {
  fetchImpl?: FetchLike;
  headers?: Record<string, string>;
}

export interface EnvReadHandlerOptions {
  env?: NodeJS.ProcessEnv;
  allowlist?: readonly string[];
}

export interface ShellExecHandlerOptions {
  spawnImpl?: SpawnLike;
  allowedCommands?: readonly string[];
  cwd?: string;
}

export interface ExtendedHandlerOptions {
  http?: HttpGetHandlerOptions;
  env?: EnvReadHandlerOptions;
  shell?: ShellExecHandlerOptions;
}

function requiredCapability(capability: ExtendedRequiredCapability): Capability {
  // The WM Capability union has not been widened yet; the broker still gates by
  // string equality, so keep the new least-privilege names local to this module.
  return capability as Capability;
}

function requireString(args: Record<string, unknown>, key: string, handlerName: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${handlerName} requires a non-empty string args.${key}`);
  }
  return value;
}

function readStringArray(value: unknown, key: string, handlerName: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new Error(`${handlerName} requires args.${key} to be an array of strings`);
  }
  return [...value];
}

function parseHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('http.get requires args.url to be a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('http.get only supports http: and https: URLs');
  }
  return url;
}

async function defaultFetch(input: string | URL, init?: { method: 'GET'; headers?: Record<string, string> }): Promise<FetchResponseLike> {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('http.get requires a fetch implementation');
  }
  return globalThis.fetch(input, init);
}

function collectStream(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (stream === null) return Promise.resolve('');

  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function isAllowed(value: string, allowlist: readonly string[] | undefined): boolean {
  return allowlist === undefined || allowlist.includes(value);
}

/** Create an HTTP GET handler. Tests can inject `fetchImpl` to stay hermetic. */
export function createHttpGetHandler(options: HttpGetHandlerOptions = {}): CapabilityHandler {
  const fetchImpl = options.fetchImpl ?? defaultFetch;

  return {
    requiredCapability: requiredCapability('net.read'),
    description: 'Performs an HTTP GET and returns { status, body }.',
    invoke: async (args: Record<string, unknown>) => {
      const url = parseHttpUrl(requireString(args, 'url', 'http.get'));
      const response = await fetchImpl(url, { method: 'GET', headers: options.headers });
      return {
        status: response.status,
        body: await response.text(),
      };
    },
  };
}

/** Create an env-read handler constrained to an explicit allowlist. */
export function createEnvReadHandler(options: EnvReadHandlerOptions = {}): CapabilityHandler {
  const env = options.env ?? process.env;
  const allowlist = options.allowlist ?? [];

  return {
    requiredCapability: requiredCapability('env.read'),
    description: 'Reads an allow-listed environment variable by args.name.',
    invoke: (args: Record<string, unknown>) => {
      const name = requireString(args, 'name', 'env.read');
      if (!allowlist.includes(name)) {
        throw new Error(`env.read variable is not allow-listed: ${name}`);
      }
      return { name, value: env[name] ?? null };
    },
  };
}

/** Create a shell-exec handler using async spawn with shell expansion disabled. */
export function createShellExecHandler(options: ShellExecHandlerOptions = {}): CapabilityHandler {
  const spawnImpl: SpawnLike = options.spawnImpl ?? ((command, args, spawnOptions) => (
    nodeSpawn(command, args, spawnOptions)
  ));

  return {
    requiredCapability: requiredCapability('shell.exec'),
    description: 'Runs an allowed command with async spawn and returns exit output.',
    invoke: async (args: Record<string, unknown>, ctx: InvocationContext) => {
      const command = requireString(args, 'command', 'shell.exec');
      if (!isAllowed(command, options.allowedCommands)) {
        throw new Error(`shell.exec command is not allow-listed: ${command}`);
      }

      const commandArgs = readStringArray(args.args, 'args', 'shell.exec');
      const cwd = typeof args.cwd === 'string' && args.cwd.length > 0
        ? args.cwd
        : options.cwd ?? ctx.projectRoot;
      const child = spawnImpl(command, commandArgs, { cwd, shell: false });
      const stdout = collectStream(child.stdout);
      const stderr = collectStream(child.stderr);
      const close = new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
        child.on('close', (code, signal) => resolve([code, signal]));
        child.on('error', reject);
      });

      const [[code, signal], stdoutText, stderrText] = await Promise.all([close, stdout, stderr]);
      return { code, signal, stdout: stdoutText, stderr: stderrText };
    },
  };
}

export const httpGetHandler: CapabilityHandler = createHttpGetHandler();
export const envReadHandler: CapabilityHandler = createEnvReadHandler();
export const shellExecHandler: CapabilityHandler = createShellExecHandler();

/** Install the extended handlers without modifying the broker. */
export function installExtendedHandlers(
  registry: CapabilityRegistry,
  options: ExtendedHandlerOptions = {},
): void {
  registry.register('http.get', createHttpGetHandler(options.http));
  registry.register('env.read', createEnvReadHandler(options.env));
  registry.register('shell.exec', createShellExecHandler(options.shell));
}
