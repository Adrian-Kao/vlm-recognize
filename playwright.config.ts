import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:43817', trace: 'retain-on-failure' },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    },
  }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 43817 --strictPort',
    url: 'http://127.0.0.1:43817',
    reuseExistingServer: false,
    env: { VITE_TEST_TRACKER: '1' },
  },
});
