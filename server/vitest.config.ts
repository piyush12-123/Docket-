import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Run test files sequentially to prevent concurrent MongoDB connections
    // from different test files interfering with each other (e.g. one file's
    // afterAll calling mongoose.disconnect() while another file is still running).
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    testTimeout: 120000,
  },
});
