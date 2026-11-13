const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 8000 },
  workers: 4,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8123', trace: 'off', locale: 'ro-RO', timezoneId: 'Europe/Bucharest', viewport: { width: 1366, height: 900 }, launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined } },
  webServer: { command: 'python3 -m http.server 8123 --directory ..', url: 'http://localhost:8123/', reuseExistingServer: true },
  projects: [{ name: 'desktop' }],
});
