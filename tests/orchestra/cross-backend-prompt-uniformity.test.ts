import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');

describe('Cross-backend prompt persist contract uniformity (Sprint 168 C0e)', () => {
  it('all 3 backends (docker, subprocess, tmux) document the persist contract', () => {
    const dockerSrc = readFileSync(
      join(REPO_ROOT, 'src', 'orchestra', 'spawn-backend-docker.ts'),
      'utf-8',
    );
    const subprocessSrc = readFileSync(
      join(REPO_ROOT, 'src', 'orchestra', 'spawn-backend.ts'),
      'utf-8',
    );
    const tmuxSrc = readFileSync(
      join(REPO_ROOT, 'src', 'orchestra', 'tmux.ts'),
      'utf-8',
    );

    const contractKeyword = 'tmpfiles persist until sprint cleanup';

    expect(dockerSrc).toContain(contractKeyword);
    expect(subprocessSrc).toContain(contractKeyword);
    expect(tmuxSrc).toContain(contractKeyword);
  });

  it('all 3 backends reference the Sprint 168 C0e cross-backend contract marker', () => {
    const dockerSrc = readFileSync(
      join(REPO_ROOT, 'src', 'orchestra', 'spawn-backend-docker.ts'),
      'utf-8',
    );
    const subprocessSrc = readFileSync(
      join(REPO_ROOT, 'src', 'orchestra', 'spawn-backend.ts'),
      'utf-8',
    );
    const tmuxSrc = readFileSync(
      join(REPO_ROOT, 'src', 'orchestra', 'tmux.ts'),
      'utf-8',
    );

    // Docker file already has Sprint 156 Task 4 contract; subprocess + tmux must
    // either share that same keyword OR carry a Sprint 168 C0e marker.
    const c0eMarker = 'Sprint 168 C0e';
    // Docker is the authoritative source (Sprint 156 Task 4) — does not need
    // the C0e marker itself; subprocess + tmux must explicitly cite C0e to
    // signal the cross-backend extension applied this sprint.
    expect(dockerSrc).toMatch(/Sprint 156 Task 4|Sprint 168 C0e/);
    expect(subprocessSrc).toContain(c0eMarker);
    expect(tmuxSrc).toContain(c0eMarker);
  });
});
