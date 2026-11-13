import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Front-end isolado: a raiz do Vite é esta pasta (frontend/).
// Código compartilhado com o backend fica em ../shared e é importado como @shared/...
export default defineConfig(() => {
  return {
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    build: {
      // Saída continua em dist/ na raiz, como o servidor espera.
      outDir: path.resolve(__dirname, '../dist'),
      emptyOutDir: true,
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
