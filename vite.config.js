import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      strategies: 'generateSW',

      devOptions: {
        enabled: true,
      },

      manifest: {
        name: 'Studio Flow',
        short_name: 'Studio Flow',
        description: 'Studio Flow - Gestion de belleza y citas',
        id: '/',
        lang: 'es-MX',

        theme_color: '#F5E6E0',
        background_color: '#FFFFFF',

        display: 'standalone',
        display_override: ['standalone', 'fullscreen'],
        orientation: 'portrait',

        scope: '/',
        start_url: '/login',

        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      workbox: {
        navigateFallback: '/index.html',
      },
    }),
  ],
})
