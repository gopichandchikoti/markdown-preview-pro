import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4175', channel: process.env.E2E_CHANNEL || 'msedge' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
});
