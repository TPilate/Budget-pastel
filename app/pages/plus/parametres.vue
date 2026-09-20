<script setup lang="ts">
interface ReferenceItem {
  id: string
  name: string
  emoji: string
}

const { data: categories, refresh: refreshCategories } = await useFetch<ReferenceItem[]>('/api/categories', { default: () => [] })
const { data: envelopes, refresh: refreshEnvelopes } = await useFetch<ReferenceItem[]>('/api/envelopes', { default: () => [] })
const { data: incomeTypes, refresh: refreshIncomeTypes } = await useFetch<ReferenceItem[]>('/api/income-types', { default: () => [] })
const { data: accounts, refresh: refreshAccounts } = await useFetch<ReferenceItem[]>('/api/accounts', { default: () => [] })

async function loadAll() {
  await Promise.all([refreshCategories(), refreshEnvelopes(), refreshIncomeTypes(), refreshAccounts()])
}

const newCategory = reactive({ name: '', emoji: '' })
const newEnvelope = reactive({ name: '', emoji: '' })
const newIncomeType = reactive({ name: '', emoji: '' })
const newAccount = reactive({ name: '', emoji: '' })

async function addCategory() {
  if (!newCategory.name || !newCategory.emoji) return
  await $fetch('/api/categories', {
    method: 'POST',
    body: { name: newCategory.name, emoji: newCategory.emoji, isFixed: false },
  })
  newCategory.name = ''
  newCategory.emoji = ''
  await loadAll()
}

async function addEnvelope() {
  if (!newEnvelope.name || !newEnvelope.emoji) return
  await $fetch('/api/envelopes', {
    method: 'POST',
    body: { name: newEnvelope.name, emoji: newEnvelope.emoji, kind: 'budget', defaultCeiling: 0 },
  })
  newEnvelope.name = ''
  newEnvelope.emoji = ''
  await loadAll()
}

async function addIncomeType() {
  if (!newIncomeType.name || !newIncomeType.emoji) return
  await $fetch('/api/income-types', {
    method: 'POST',
    body: { name: newIncomeType.name, emoji: newIncomeType.emoji },
  })
  newIncomeType.name = ''
  newIncomeType.emoji = ''
  await loadAll()
}

async function addAccount() {
  if (!newAccount.name || !newAccount.emoji) return
  await $fetch('/api/accounts', {
    method: 'POST',
    body: { name: newAccount.name, emoji: newAccount.emoji },
  })
  newAccount.name = ''
  newAccount.emoji = ''
  await loadAll()
}

async function archive(endpoint: string, id: string) {
  await $fetch(`${endpoint}/${id}`, {
    method: 'PATCH',
    body: { archivedAt: new Date().toISOString() },
  })
  await loadAll()
}
</script>

<template>
  <div class="min-h-screen bg-app-bg p-5 pb-28">
    <h1 class="text-xl font-extrabold text-ink">⚙️ Listes et paramètres</h1>
    <p class="mt-1 text-xs font-medium text-ink-muted">
      Modifié ici, disponible partout : saisie, budget mensuel, enveloppes.
    </p>

    <section class="mt-4 rounded-[22px] bg-white p-4">
      <h2 class="text-[13.5px] font-extrabold text-ink">📂 Catégories</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="category in categories"
          :key="category.id"
          class="flex items-center gap-1 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
        >
          {{ category.emoji }} {{ category.name }}
          <button type="button" class="text-ink-faint" @click="archive('/api/categories', category.id)">×</button>
        </span>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="newCategory.emoji" placeholder="🛒" class="w-12 rounded-lg border border-divider px-2 py-1 text-center">
        <input v-model="newCategory.name" placeholder="Nouvelle catégorie" class="flex-1 rounded-lg border border-divider px-2 py-1">
        <button type="button" class="rounded-lg bg-ink px-3 py-1 text-white" @click="addCategory">Ajouter</button>
      </div>
    </section>

    <section class="mt-4 rounded-[22px] bg-white p-4">
      <h2 class="text-[13.5px] font-extrabold text-ink">👜 Enveloppes</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="envelope in envelopes"
          :key="envelope.id"
          class="flex items-center gap-1 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
        >
          {{ envelope.emoji }} {{ envelope.name }}
          <button type="button" class="text-ink-faint" @click="archive('/api/envelopes', envelope.id)">×</button>
        </span>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="newEnvelope.emoji" placeholder="👜" class="w-12 rounded-lg border border-divider px-2 py-1 text-center">
        <input v-model="newEnvelope.name" placeholder="Nouvelle enveloppe" class="flex-1 rounded-lg border border-divider px-2 py-1">
        <button type="button" class="rounded-lg bg-ink px-3 py-1 text-white" @click="addEnvelope">Ajouter</button>
      </div>
    </section>

    <section class="mt-4 rounded-[22px] bg-white p-4">
      <h2 class="text-[13.5px] font-extrabold text-ink">💰 Types de revenus</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="incomeType in incomeTypes"
          :key="incomeType.id"
          class="flex items-center gap-1 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
        >
          {{ incomeType.emoji }} {{ incomeType.name }}
          <button type="button" class="text-ink-faint" @click="archive('/api/income-types', incomeType.id)">×</button>
        </span>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="newIncomeType.emoji" placeholder="💰" class="w-12 rounded-lg border border-divider px-2 py-1 text-center">
        <input v-model="newIncomeType.name" placeholder="Nouveau type" class="flex-1 rounded-lg border border-divider px-2 py-1">
        <button type="button" class="rounded-lg bg-ink px-3 py-1 text-white" @click="addIncomeType">Ajouter</button>
      </div>
    </section>

    <section class="mt-4 rounded-[22px] bg-white p-4">
      <h2 class="text-[13.5px] font-extrabold text-ink">🏦 Comptes</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <span
          v-for="account in accounts"
          :key="account.id"
          class="flex items-center gap-1 rounded-full bg-app-bg px-3 py-2 text-[11.5px] font-semibold text-ink"
        >
          {{ account.emoji }} {{ account.name }}
          <button type="button" class="text-ink-faint" @click="archive('/api/accounts', account.id)">×</button>
        </span>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="newAccount.emoji" placeholder="🏦" class="w-12 rounded-lg border border-divider px-2 py-1 text-center">
        <input v-model="newAccount.name" placeholder="Nouveau compte" class="flex-1 rounded-lg border border-divider px-2 py-1">
        <button type="button" class="rounded-lg bg-ink px-3 py-1 text-white" @click="addAccount">Ajouter</button>
      </div>
    </section>
  </div>
</template>
