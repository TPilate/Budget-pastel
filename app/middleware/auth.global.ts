export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') {
    return
  }

  const supabase = useSupabaseClient()
  const { data } = await supabase.auth.getSession()

  if (!data.session) {
    return navigateTo('/login')
  }
})
