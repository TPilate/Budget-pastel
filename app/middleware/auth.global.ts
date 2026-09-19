export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') {
    return
  }

  const { error } = await useFetch('/api/health')

  if (error.value?.statusCode === 401) {
    return navigateTo('/login')
  }
})
