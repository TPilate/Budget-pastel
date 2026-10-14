/**
 * An expense coming out of an envelope belongs to that envelope, so it needs no category.
 * Gift money goes to the reserve envelope, so it needs none either — unless there is no
 * reserve envelope to receive it, in which case the category is the only way to file it.
 */
export function expenseNeedsCategory(envelopeId: string, financedBy: string, hasReserveEnvelope: boolean): boolean {
  return envelopeId === '' && (financedBy !== 'gift_received' || !hasReserveEnvelope)
}
