import { PROTECTED_PATHS, digest } from './ci-sim-snapshot.mjs';

export function snapshotReference(snapshot, dependencyRef, materializedTreeRef, vitestArgs) {
  const sourceManifestRef = `sha256:${digest(JSON.stringify({
    tracked: snapshot.tracked, untracked: snapshot.untracked,
  }))}`;
  const payload = {
    head: snapshot.head,
    patch: digest(snapshot.patch),
    sourceManifestRef,
    trackedCount: snapshot.tracked.length,
    untrackedCount: snapshot.untracked.length,
    skippedTrackedRef: `sha256:${digest(JSON.stringify(snapshot.skippedTracked))}`,
    omittedUntrackedRef: `sha256:${digest(JSON.stringify(snapshot.omittedUntracked))}`,
    dependencyRef,
    materializedTreeRef,
    runtime: process.version,
    platform: process.platform,
    arch: process.arch,
    vitestArgs,
    environmentProfile: 'ci-sim-sanitized-v1',
    excludedPolicy: [...PROTECTED_PATHS, ...snapshot.extraProtected].sort(),
  };
  return {
    snapshotRef: `ci-sim-snapshot:${digest(JSON.stringify(payload))}`,
    receipt: payload,
    preview: {
      ...payload, skippedTracked: snapshot.skippedTracked,
      omittedUntracked: snapshot.omittedUntracked,
    },
  };
}
