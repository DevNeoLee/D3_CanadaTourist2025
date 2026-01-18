import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development', // Only sourcemaps in dev
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split D3 modules into smaller chunks for better parallel loading
          if (id.includes('node_modules/d3')) {
            if (id.includes('d3-selection')) return 'd3-selection';
            if (id.includes('d3-scale')) return 'd3-scale';
            if (id.includes('d3-geo')) return 'd3-geo';
            if (id.includes('d3-shape')) return 'd3-shape';
            if (id.includes('d3-axis')) return 'd3-axis';
            if (id.includes('d3-transition')) return 'd3-transition';
            if (id.includes('d3-fetch')) return 'd3-fetch';
            if (id.includes('d3-ease')) return 'd3-ease';
            if (id.includes('d3-interpolate')) return 'd3-interpolate';
            // Other D3 modules
            return 'd3-other';
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
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 3000,
    open: true,
    // Enable compression for static files
    middlewareMode: false,
    // Pre-compress static files
    headers: {
      'Cache-Control': 'public, max-age=31536000'
    }
  },
  optimizeDeps: {
    include: ['d3'],
    // Pre-bundle dependencies for faster loading
    entries: ['src/main.ts']
  },
  // Build optimizations
  esbuild: {
    // Drop console in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  }
}); 