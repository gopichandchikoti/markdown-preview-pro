import { defineConfig } from '@playwright/test';
const port = Number(process.env.E2E_PORT || 4175);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid E2E_PORT');
const baseURL = 'http://127.0.0.1:' + port;
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  workers: 1,
  use: { baseURL, channel: process.env.E2E_CHANNEL || 'msedge' },
  webServer: { command: 'npm start', url: baseURL, reuseExistingServer: false, env:{PORT:String(port)} },
});
