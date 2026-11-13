const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:8123', launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined } },
  webServer: { command: 'python3 -m http.server 8123 --directory ..', url: 'http://localhost:8123/', reuseExistingServer: true },
});
