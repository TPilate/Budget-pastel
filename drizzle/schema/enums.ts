import { pgEnum } from 'drizzle-orm/pg-core'

export const envelopeKindEnum = pgEnum('envelope_kind', ['budget', 'reserve'])
export const fiftyThirtyTwentyBucketEnum = pgEnum('fifty_thirty_twenty_bucket', ['besoins', 'envies', 'epargne'])
export const financedByEnum = pgEnum('financed_by', ['budget', 'gift_given', 'gift_received'])
export const closureDestinationEnum = pgEnum('closure_destination', ['carry_over', 'savings', 'envelope'])
export const closureStatusEnum = pgEnum('closure_status', ['open', 'closed'])
export const wishlistPriorityEnum = pgEnum('wishlist_priority', ['haute', 'moyenne', 'basse'])
