import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Honor a harness-assigned PORT (multi-session dev servers); defaults to 5173.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
});
