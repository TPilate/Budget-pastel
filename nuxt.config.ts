export default defineNuxtConfig({
  compatibilityDate: '2026-09-19',
  modules: ['@nuxt/ui', '@nuxt/fonts'],
  css: ['~/assets/css/main.css'],
  // @nuxt/ui brings @nuxtjs/color-mode with it, which follows the OS appearance by default.
  // This app has no dark theme: every surface is a hardcoded bg-white and the ink/divider
  // tokens in main.css are fixed light-mode values. So on a dark-mode machine the only
  // Nuxt UI component in the app — the USlideover behind DetailDrawer — flipped to a dark
  // panel while its contents kept rendering dark-purple text, making the envelope detail
  // unreadable. Pin it to light until the app actually has a dark palette.
  colorMode: { preference: 'light', fallback: 'light' },
  components: [
    { path: '~/components/entry', pathPrefix: false },
    '~/components',
  ],
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
  },
  devServer: {
    // Bind to IPv4 explicitly: some environments resolve 'localhost' to ::1,
    // which the dev server (and Playwright's webServer) cannot connect to.
    host: '127.0.0.1',
  },
})
