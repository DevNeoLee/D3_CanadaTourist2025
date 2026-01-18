import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separate D3 into its own chunk
          if (id.includes('node_modules/d3')) {
            return 'd3';
          }
          // Separate chart components into their own chunks
          if (id.includes('BarChart')) {
            return 'chart-bar';
          }
          if (id.includes('PieChart')) {
            return 'chart-pie';
          }
          if (id.includes('MapChart')) {
            return 'chart-map';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    include: ['d3']
  }
}); 