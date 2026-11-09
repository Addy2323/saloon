import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { handleSqliteApiAndUploads } from './server/api-middleware.mjs';

function sqliteBackendPlugin() {
  return {
    name: 'lucentia-sqlite-backend',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        handleSqliteApiAndUploads(req, res, next);
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        handleSqliteApiAndUploads(req, res, next);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), sqliteBackendPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
