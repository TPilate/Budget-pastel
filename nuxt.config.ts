export default defineNuxtConfig({
  compatibilityDate: '2026-09-19',
  modules: ['@nuxt/ui', '@vite-pwa/nuxt'],
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Budget Planner',
      short_name: 'Budget',
      description: 'Budget planner pour Laura',
      theme_color: '#f97316',
      background_color: '#fff7ed',
      display: 'standalone',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
  },
})
