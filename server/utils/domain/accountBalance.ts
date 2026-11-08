export interface BalanceTransfer {
  fromAccountId: string | null
  toAccountId: string | null
  amount: number
  createdAt: string
}

// The balance is a hand-set reference plus every transfer recorded after that moment.
// Transfers created at or before the reference are already part of the number typed in.
export function computeAccountBalance(
  input: { referenceBalance: number, referenceSetAt: string, transfers: BalanceTransfer[] },
  accountId: string,
): number {
  const referenceTime = new Date(input.referenceSetAt).getTime()
  let balance = input.referenceBalance
  for (const transfer of input.transfers) {
    if (new Date(transfer.createdAt).getTime() <= referenceTime) continue
    if (transfer.toAccountId === accountId) balance += transfer.amount
    if (transfer.fromAccountId === accountId) balance -= transfer.amount
  }
  return balance
}
