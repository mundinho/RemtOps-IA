import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true, // reachable from a phone on the same Wi-Fi, to scan real QR codes
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'], // ngrok tunnel: reachable from any network
    proxy: { '/api': 'http://localhost:3000' },
  },
});
