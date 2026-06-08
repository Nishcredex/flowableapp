import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   server: {
//     proxy: {
//       '/flowable-ui': {
//         target: 'http://localhost:8080',
//         changeOrigin: true,
//       }
//     }
//   }
// })



// vite.config.ts — FIXED
export default defineConfig({
  server: {
    proxy: {
      '/flowable-api': {
        target: 'http://localhost:8080/flowable-rest',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/flowable-api/, ''),

        // ✅ ADD THESE — critical for binary/image responses:
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Ensure Authorization header is always forwarded
            const creds = Buffer.from('admin:test').toString('base64');
            proxyReq.setHeader('Authorization', `Basic ${creds}`);
          });
        },
      },
    },
  },
});