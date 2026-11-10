import { defineConfig, devices } from "@playwright/test";

/**
 * Browser checks for /trials. The API is mocked by route interception with the dev-only fixtures
 * in tests/fixtures, and the app under test is the production build served by `vite preview`.
 */
const PORT = 5199;
// Set this to test a server that is already running, such as FastAPI serving the build itself.
const external = process.env.MEDLAB_BASE_URL;

export default defineConfig({
    testDir: "tests/e2e",
    testMatch: "**/*.e2e.ts",
    // Another process owns most of this machine's cores, so stay small and patient.
    workers: 2,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: [["list"]],
    // The offline cache would hide requests from route mocks, so tests run without it. It has its own unit test.
    use: { baseURL: external ?? `http://localhost:${PORT}`, trace: "off", serviceWorkers: "block" },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
        { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } } },
    ],
    webServer: external
        ? undefined
        : {
              command: `npx vite preview --port ${PORT} --strictPort`,
              url: `http://localhost:${PORT}`,
              reuseExistingServer: true,
              timeout: 30_000,
          },
});
