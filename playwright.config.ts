import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5177', viewport: { width: 1440, height: 900 }, channel: 'chrome', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --port 5177 --strictPort', url: 'http://127.0.0.1:5177', reuseExistingServer: false },
});
