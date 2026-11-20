import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // WebGL scenes render in software in headless Chromium; running them in
  // parallel starves each other of CPU and makes real-time tests time out.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
