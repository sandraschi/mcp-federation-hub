import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const bridgeTarget = env.VITE_BRIDGE_PROXY_TARGET || 'http://127.0.0.1:10857';

    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            port: 10856, // SOTA port allocation update
            strictPort: true,
            // Same-origin API in dev (fixes CORS when UI is opened via LAN IP / --host).
            proxy: {
                '/api': { target: bridgeTarget, changeOrigin: true, ws: true },
                '/health': { target: bridgeTarget, changeOrigin: true },
                '/redoc': { target: bridgeTarget, changeOrigin: true },
                '/docs': { target: bridgeTarget, changeOrigin: true },
                '/openapi.json': { target: bridgeTarget, changeOrigin: true },
            },
        },
    };
});
