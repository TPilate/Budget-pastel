/**
 * How one side of a transfer is named, in the movements feed and in the closure report:
 * "Budget du mois", "{emoji} {name}" for an account, the bare name for an envelope.
 * `named` is the envelope or account the side points at; null when it cannot be resolved.
 */
export function transferSideLabel(
  kind: string,
  named: { name?: string | null, emoji?: string | null } | null,
): string {
  if (kind === 'budget') return 'Budget du mois'
  if (kind === 'account') return named ? `${named.emoji ?? ''} ${named.name ?? '?'}`.trim() : '?'
  return named?.name ?? '?'
}
