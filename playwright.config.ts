import { defineConfig } from '@playwright/test';

export default defineConfig({
webServer: {
    command: 'npm run dev', // or start
    port: 3000,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    },
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,
  },
  projects: [
    { name: 'webkit', use: { browserName: 'webkit' } },
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
});