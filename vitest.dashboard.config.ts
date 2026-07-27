import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [
      './tests/hermeticity/worker-setup.ts',
      './tests/dashboard/setup.ts',
    ],
    globalSetup: ['./tests/hermeticity/global-setup.ts'],
    include: ['tests/dashboard/**/*.test.tsx', 'tests/dashboard/**/*.test.ts', 'src/dashboard/src/**/*.test.tsx', 'src/dashboard/src/**/*.test.ts'],
    // Inline react/react-dom so the vite alias (single root copy) applies even
    // to CJS deps that would otherwise be externalized and native-required
    // from src/dashboard/node_modules (dual-React → invalid hook call).
    server: {
      deps: {
        inline: [/^react$/, /^react-dom/, /react\/jsx/],
      },
    },
  },
  resolve: {
    // Force a SINGLE React instance: co-located tests under src/dashboard/src/
    // would otherwise resolve react-dom subpaths (react-dom/client) from
    // src/dashboard/node_modules (19.2.4) while react itself comes from the
    // root copy (19.2.7) → "Invalid hook call / useState of null" (dual-React).
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': './src/dashboard/src',
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      // Tests co-located under src/dashboard/src/ would otherwise resolve
      // @testing-library/react from src/dashboard/node_modules, whose
      // react-dom is a SECOND React instance → invalid hook call.
      '@testing-library/react': resolve(__dirname, 'node_modules/@testing-library/react'),
    },
  },
});
