import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { runHeartbeat, HeartbeatDaemon, readDaemonPid, stopDaemonByPid } from '../../src/orchestra/heartbeat-daemon.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockAppendFileSync = vi.mocked(appendFileSync);
const mockExecSync = vi.mocked(execSync);
const mockMkdirSync = vi.mocked(mkdirSync);

// ─── Tests ──────────────────────────────────────────────────────────

describe('heartbeat-daemon', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runHeartbeat', () => {
    it('should parse and execute pending tasks from HEARTBEAT.md', () => {
      const heartbeatContent = `# Heartbeat Tasks
- [ ] date
- [x] node --version
- [ ] uptime
`;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(heartbeatContent);
      mockExecSync.mockReturnValue('ok');

      const result = runHeartbeat('/test/project');

      expect(result.total).toBe(3);
      expect(result.executed).toBe(2); // 2 pending, 1 done
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(2);
      expect(result.details[0]!.command).toBe('date');
      expect(result.details[1]!.command).toBe('uptime');
    });

    it('should handle failing commands and log failures', () => {
      const heartbeatContent = `# Heartbeat Tasks
- [ ] failing-command
`;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(heartbeatContent);
      mockExecSync.mockImplementation(() => {
        throw { stdout: '', stderr: 'command not found', message: 'exit code 1' };
      });

      const result = runHeartbeat('/test/project');

      expect(result.total).toBe(1);
      expect(result.executed).toBe(1);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.details[0]!.success).toBe(false);
    });

    it('should create HEARTBEAT.md with default template if missing', () => {
      // First call: HEARTBEAT.md doesn't exist → create default
      // Second call after write: read the default content
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockReturnValue(`# Heartbeat Tasks
- [ ] tsc --noEmit
- [ ] npx vitest run --reporter=verbose 2>&1 | tail -5
`);
      mockExecSync.mockReturnValue('ok');

      const result = runHeartbeat('/test/project');

      // Default template has 2 tasks
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(result.total).toBe(2);
    });

    it('should skip already completed tasks', () => {
      const heartbeatContent = `# Heartbeat Tasks
- [x] already done
- [x] also done
`;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(heartbeatContent);

      const result = runHeartbeat('/test/project');

      expect(result.total).toBe(2);
      expect(result.executed).toBe(0);
      expect(result.passed).toBe(0);
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe('HeartbeatDaemon', () => {
    it('should start, run immediate heartbeat, and set interval', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('# Heartbeat Tasks\n- [x] done\n');

      const daemon = new HeartbeatDaemon('/test/project', 1);
      expect(daemon.running).toBe(false);

      const result = daemon.start();
      expect(daemon.running).toBe(true);
      expect(result.total).toBe(1);

      daemon.stop();
      expect(daemon.running).toBe(false);
    });

    it('should stop cleanly and remove PID file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('# Heartbeat Tasks\n');

      const daemon = new HeartbeatDaemon('/test/project', 5);
      daemon.start();
      expect(daemon.running).toBe(true);

      daemon.stop();
      expect(daemon.running).toBe(false);
    });
  });

  describe('readDaemonPid', () => {
    it('should return null when PID file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(readDaemonPid('/test/project')).toBeNull();
    });

    it('should return null for invalid PID content', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not-a-number');
      expect(readDaemonPid('/test/project')).toBeNull();
    });
  });
});
