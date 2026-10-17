import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  outputDir: './test-results/offline',
  testDir: './tests/offline', testMatch: '*.spec.js', workers: 1,
  use: { baseURL: 'http://127.0.0.1:3111', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'CHITWISE_OFFLINE_TEST_HARNESS=1 npm run build && node tests/offline/server.mjs',
    url: 'http://127.0.0.1:3111/__offline-harness', reuseExistingServer: false, timeout: 120_000,
  },
});
