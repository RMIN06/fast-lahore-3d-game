import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Test artefacts, private references and docs never reload the app
    // (a reload mid-run sent long e2e tests back to the title screen).
    watch: {
      ignored: [
        '**/test-results/**',
        '**/playwright-report/**',
        '**/reference/**',
        '**/docs/**',
      ],
    },
  },
});
