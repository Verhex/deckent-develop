import { watch, type FSWatcher } from 'node:fs';

export interface DashboardWatcher {
  close(): void;
}

export function watchDashboard(
  filePath: string,
  onChange: () => void,
): DashboardWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 500;

  const watcher: FSWatcher = watch(filePath, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, DEBOUNCE_MS);
  });

  return {
    close(): void {
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}
