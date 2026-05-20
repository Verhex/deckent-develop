import * as pty from '@lydell/node-pty';

export interface SpawnSpec {
  file: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
}

export interface BackendHandle {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

/** Pluggable execution backend. Future (#3): remote / k8s pod-exec impl. */
export interface SessionBackend {
  spawn(
    spec: SpawnSpec,
    onData: (data: string) => void,
    onExit: (code: number) => void,
  ): BackendHandle;
}

export class LocalPtyBackend implements SessionBackend {
  spawn(
    spec: SpawnSpec,
    onData: (data: string) => void,
    onExit: (code: number) => void,
  ): BackendHandle {
    const p = pty.spawn(spec.file, spec.args, {
      name: 'xterm-color',
      cols: spec.cols ?? 80,
      rows: spec.rows ?? 24,
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
    });
    p.onData((d) => onData(d));
    p.onExit(({ exitCode }) => onExit(exitCode));
    return {
      write: (data) => p.write(data),
      resize: (cols, rows) => p.resize(cols, rows),
      kill: () => {
        try {
          p.kill();
        } catch {
          /* already dead */
        }
      },
    };
  }
}
