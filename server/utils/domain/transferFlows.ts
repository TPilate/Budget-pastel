export type TransferEndpointKind = 'envelope' | 'budget' | 'account'

export interface TransferFlow {
  fromKind: TransferEndpointKind
  toKind: TransferEndpointKind
  fromAccountId: string | null
  toAccountId: string | null
  amount: number
}

export interface MonthTransferTotals {
  entering: number
  leaving: number
  toSavingsAccounts: number
  fromSavingsAccounts: number
  toOtherAccounts: number
}

/**
 * Splits the month's transfers into money entering and leaving the month.
 *
 * Only accounts are outside the month (reserves are not transfer endpoints), so only the
 * kinds matter: account → budget|envelope enters, budget|envelope → account leaves, and
 * account ↔ account or inside-the-month transfers are neither.
 */
export function summariseMonthTransfers(
  transfers: TransferFlow[],
  accountKinds: Map<string, 'courant' | 'epargne'>,
): MonthTransferTotals {
  const totals: MonthTransferTotals = {
    entering: 0, leaving: 0, toSavingsAccounts: 0, fromSavingsAccounts: 0, toOtherAccounts: 0,
  }

  for (const transfer of transfers) {
    const fromAccount = transfer.fromKind === 'account'
    const toAccount = transfer.toKind === 'account'

    if (fromAccount && !toAccount) {
      totals.entering += transfer.amount
      if (accountKinds.get(transfer.fromAccountId ?? '') === 'epargne') totals.fromSavingsAccounts += transfer.amount
    } else if (toAccount && !fromAccount) {
      totals.leaving += transfer.amount
      if (accountKinds.get(transfer.toAccountId ?? '') === 'epargne') totals.toSavingsAccounts += transfer.amount
      else totals.toOtherAccounts += transfer.amount
    }
  }

  return totals
}

/** The month's savings: poche versements, plus what went to épargne accounts, minus what came back. */
export function netSavings(pocheVersements: number, t: MonthTransferTotals): number {
  return pocheVersements + t.toSavingsAccounts - t.fromSavingsAccounts
}

/** The part of "Reste à dépenser" that sits in no envelope. */
export function budgetLibre(unspent: number, budgetEnvelopeRemaining: number[]): number {
  return unspent - budgetEnvelopeRemaining.reduce((sum, remaining) => sum + Math.max(0, remaining), 0)
}

/** Net per épargne account for the month: what went in minus what came out. Zero nets are kept. */
export function netByEpargneAccount(
  transfers: TransferFlow[],
  accountKinds: Map<string, 'courant' | 'epargne'>,
): Map<string, number> {
  const net = new Map<string, number>()
  for (const t of transfers) {
    if (t.toKind === 'account' && t.fromKind !== 'account' && accountKinds.get(t.toAccountId ?? '') === 'epargne') {
      net.set(t.toAccountId!, (net.get(t.toAccountId!) ?? 0) + t.amount)
    }
    if (t.fromKind === 'account' && t.toKind !== 'account' && accountKinds.get(t.fromAccountId ?? '') === 'epargne') {
      net.set(t.fromAccountId!, (net.get(t.fromAccountId!) ?? 0) - t.amount)
    }
  }
  return net
}
