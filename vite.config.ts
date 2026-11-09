import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ mode }) => {
  const showcase = mode === 'showcase' || process.env.PRECISIGN_SHOWCASE === 'true' || process.env.VITE_SHOWCASE === 'true';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
        // Exclude the older staff/sample fixtures from the public showcase bundle.
        ...(showcase ? [{ find: /^(?:.*\/)?seedData(?:\.ts)?$/, replacement: path.resolve(__dirname, 'src/data/showcaseBase.ts') }] : []),
      ],
    },
    server: {
      proxy: {
        '/api': { target: process.env.PRECISIGN_DEV_API_TARGET || 'http://127.0.0.1:3001', changeOrigin: false },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
