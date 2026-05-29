import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    timeout: 30000,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 390, height: 844 },
    },
    webServer: {
        command: 'npx --yes serve ../../src/main/resources/static -p 4173',
        port: 4173,
        reuseExistingServer: true,
    },
});
