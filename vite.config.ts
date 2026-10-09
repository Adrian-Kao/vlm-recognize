import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const requireFromConfig = createRequire(import.meta.url);
const packageJson = requireFromConfig('./package.json') as { dependencies: Record<string, string> };

export default defineConfig({
  plugins: [react()],
  define: {
    __MEDIAPIPE_VERSION__: JSON.stringify(packageJson.dependencies['@mediapipe/tasks-vision']),
  },
  test: {
    include: ['src/test/**/*.test.ts', 'src/test/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
