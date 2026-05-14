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
        enabled: true
      },

      manifest: {
        name: 'Studio Flow',
        short_name: 'Studio Flow',
        description: 'Studio Flow - Gestión de belleza y citas',

        theme_color: '#F5E6E0',
        background_color: '#FFFFFF',

        display: 'standalone',
        orientation: 'portrait',

        scope: '/',

        start_url: '/login',

        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})