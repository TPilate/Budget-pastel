/**
 * An expense coming out of an envelope belongs to that envelope, so it needs no category.
 * Gift money always goes to the reserve envelope, so it never needs one either.
 */
export function expenseNeedsCategory(envelopeId: string, financedBy: string): boolean {
  return envelopeId === '' && financedBy !== 'gift_received'
}
