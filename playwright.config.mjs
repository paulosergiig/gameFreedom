import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 110000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: 'http://127.0.0.1:39177', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:39177/api/health',
    reuseExistingServer: false,
    timeout: 30000,
    env: { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '39177', PUBLIC_URL: 'http://127.0.0.1:39177', DB_PATH: ':memory:', TRUST_PROXY: 'false' }
  },
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }
  ]
});
