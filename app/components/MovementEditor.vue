<script setup lang="ts">
import type { Movement } from '~~/shared/types/movement'
import type { ExpenseEntryInput } from '~~/shared/schemas/expenseEntry'
import type { IncomeEntryInput } from '~~/shared/schemas/incomeEntry'
import type { TransferInput } from '~~/shared/schemas/transfer'
import type { SavingsInput } from '~~/shared/schemas/savings'

interface ReferenceItem { id: string, name: string, emoji: string, requiresDetailsText?: boolean }
interface EntryReferenceData {
  categories: ReferenceItem[]
  accounts: ReferenceItem[]
  envelopes: ReferenceItem[]
  incomeTypes: ReferenceItem[]
  savingsGoals: { id: string, name: string }[]
}

const props = defineProps<{ movement: Movement, reference: EntryReferenceData }>()
const emit = defineEmits<{ done: [] }>()

const ENDPOINTS: Record<Movement['type'], string> = {
  expense: '/api/expenses',
  income: '/api/incomes',
  transfer: '/api/transfers',
  savings: '/api/savings',
}

const confirmingDelete = ref(false)
const isDeleting = ref(false)
const deleteError = ref('')

async function remove() {
  if (isDeleting.value) return
  deleteError.value = ''
  isDeleting.value = true
  try {
    await $fetch(`${ENDPOINTS[props.movement.type]}/${props.movement.id}`, { method: 'DELETE' })
    emit('done')
  } catch (error) {
    deleteError.value = apiErrorMessage(error) ?? 'Impossible de supprimer ce mouvement.'
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="!movement.editable">
      <p class="rounded-[16px] bg-app-bg p-3 text-[12px] font-semibold text-ink-muted">Mois clôturé — non modifiable</p>
      <dl class="flex flex-col gap-1 text-[12.5px]">
        <div class="flex justify-between"><dt class="text-ink-muted">Libellé</dt><dd class="font-bold text-ink">{{ movement.label }}</dd></div>
        <div class="flex justify-between"><dt class="text-ink-muted">Date</dt><dd class="font-bold text-ink">{{ movement.date }}</dd></div>
        <div class="flex justify-between"><dt class="text-ink-muted">Montant</dt><dd class="font-bold text-ink">{{ formatEuro(Math.abs(movement.amount)) }}</dd></div>
      </dl>
    </template>

    <template v-else>
      <ExpenseForm
        v-if="movement.type === 'expense'"
        :categories="reference.categories"
        :accounts="reference.accounts"
        :envelopes="reference.envelopes"
        :editing="{ id: movement.id, fields: movement.fields as ExpenseEntryInput }"
        @saved="emit('done')"
      />
      <IncomeForm
        v-else-if="movement.type === 'income'"
        :income-types="reference.incomeTypes"
        :envelopes="reference.envelopes"
        :editing="{ id: movement.id, fields: movement.fields as IncomeEntryInput }"
        @saved="emit('done')"
      />
      <TransferForm
        v-else-if="movement.type === 'transfer'"
        :envelopes="reference.envelopes"
        :editing="{ id: movement.id, fields: movement.fields as TransferInput }"
        @saved="emit('done')"
      />
      <SavingsForm
        v-else
        :goals="reference.savingsGoals"
        :editing="{ id: movement.id, fields: movement.fields as SavingsInput }"
        @saved="emit('done')"
      />

      <div class="border-t border-divider pt-4">
        <button
          v-if="!confirmingDelete"
          type="button"
          class="w-full rounded-[18px] border border-divider py-[12px] text-[13.5px] font-bold text-warn-ink"
          @click="confirmingDelete = true"
        >
          Supprimer
        </button>
        <div v-else class="flex flex-col gap-2 rounded-[16px] bg-app-bg p-3">
          <p class="text-center text-[12.5px] font-bold text-ink">Supprimer définitivement ?</p>
          <div class="flex gap-2">
            <button type="button" :disabled="isDeleting" class="flex-1 rounded-[14px] bg-ink py-2 text-[12.5px] font-bold text-white disabled:opacity-50" @click="remove">Oui</button>
            <button type="button" class="flex-1 rounded-[14px] border border-divider py-2 text-[12.5px] font-bold text-ink" @click="confirmingDelete = false">Annuler</button>
          </div>
        </div>
        <p v-if="deleteError" class="mt-2 text-center text-[12px] font-medium text-warn-ink">{{ deleteError }}</p>
      </div>
    </template>
  </div>
</template>
