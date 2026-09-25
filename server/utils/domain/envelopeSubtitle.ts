export interface EnvelopeSubtitleInputs {
  carriedOverAmount: number
  netTransfer: number
  incomeCreditsTotal: number
}

export function deriveEnvelopeSubtitle(input: EnvelopeSubtitleInputs): string | null {
  if (input.carriedOverAmount > 0) {
    return `dont ${input.carriedOverAmount} € reportés du mois dernier`
  }

  if (input.netTransfer > 0) {
    return `+${input.netTransfer} € transférés`
  }
  if (input.netTransfer < 0) {
    return `−${Math.abs(input.netTransfer)} € transférés`
  }

  if (input.incomeCreditsTotal > 0) {
    return `+${input.incomeCreditsTotal} € reçus`
  }

  return null
}
