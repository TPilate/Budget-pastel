export default defineNuxtConfig({
  compatibilityDate: '2026-09-19',
  modules: ['@nuxt/ui'],
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
  },
})
