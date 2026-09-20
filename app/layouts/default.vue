<template>
  <div class="flex min-h-screen bg-app-bg">
    <AppSidebar />
    <main class="flex-1 overflow-y-auto p-8">
      <slot />
    </main>
  </div>
</template>
