import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // `netlify dev` handles this in production-like local runs; this proxy
      // is only for plain `vite dev` against a separately running functions host.
      '/api': 'http://localhost:8888'
    }
  }
});
