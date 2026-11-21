import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em dev, /api vai para a API local sem precisar de CORS.
    proxy: { '/api': 'http://localhost:3333' },
  },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:3333' } },
  build: { sourcemap: true },
  test: { environment: 'node' },
});
