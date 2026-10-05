import { describe, it, expect, beforeEach, vi } from 'vitest'

// These endpoints go through insertRow / patchRow from referenceCrud rather than touching
// `db` directly, so mocking that boundary pins exactly what this task owns: the conversion
// from the schema's numbers back to the strings Drizzle's numeric columns expect.
const crud = vi.hoisted(() => ({
  inserted: [] as any[],
  patched: [] as { id: string, values: any }[],
}))

vi.mock('../../../../server/utils/referenceCrud', () => ({
  insertRow: vi.fn(async (_table: any, values: any) => { crud.inserted.push(values); return { id: 'new', ...values } }),
  patchRow: vi.fn(async (_table: any, id: string, values: any) => { crud.patched.push({ id, values }); return { id, ...values } }),
}))

const authState = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: 'user-1', email: null })),
}))
vi.mock('../../../../server/utils/auth', () => ({
  requireUser: authState.requireUser,
}))

// The handlers read validated input through validateBody; injecting it directly keeps these
// tests on the handler's own conversion logic rather than on h3's body parsing.
const inputState = vi.hoisted(() => ({ current: null as any }))
vi.mock('../../../../server/utils/validateBody', () => ({
  validateBody: vi.fn(async () => inputState.current),
}))

const routeParam = vi.hoisted(() => ({ current: 'goal-1' as string | undefined }))
vi.stubGlobal('getRouterParam', () => routeParam.current)
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('createError', (opts: any) => Object.assign(new Error(opts.statusMessage), opts))

const postHandler = (await import('../../../../server/api/savings-goals/index.post')).default
const patchHandler = (await import('../../../../server/api/savings-goals/[id].patch')).default

function fakeEvent() {
  return { context: {} } as any
}

describe('POST /api/savings-goals', () => {
  beforeEach(() => {
    crud.inserted.length = 0
    crud.patched.length = 0
    routeParam.current = 'goal-1'
    authState.requireUser.mockReset()
    authState.requireUser.mockResolvedValue({ id: 'user-1', email: null })
  })

  it('rejects an unauthenticated request with 401', async () => {
    authState.requireUser.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    inputState.current = { name: 'Vacances' }

    await expect(postHandler(fakeEvent())).rejects.toMatchObject({ statusCode: 401 })
    expect(crud.inserted).toHaveLength(0)
  })

  it('writes amounts as strings, because Drizzle numeric columns reject numbers', async () => {
    inputState.current = { name: 'Vacances', targetAmount: 1400, monthlyAmount: 49 }

    await postHandler(fakeEvent())

    expect(crud.inserted[0]).toMatchObject({ name: 'Vacances', targetAmount: '1400', monthlyAmount: '49' })
    expect(typeof crud.inserted[0].targetAmount).toBe('string')
  })

  it('stores a poche with no objective as null, not as zero', async () => {
    // "sans échéance" is a real state. A 0 target would make the page draw a 0 % progress
    // bar instead of omitting the bar entirely.
    inputState.current = { name: 'Long terme', targetAmount: null }

    await postHandler(fakeEvent())

    expect(crud.inserted[0].targetAmount).toBeNull()
  })

  it('defaults the monthly amount to zero when the body omits it', async () => {
    inputState.current = { name: 'Projets' }

    await postHandler(fakeEvent())

    expect(crud.inserted[0].monthlyAmount).toBe('0')
  })
})

describe('PATCH /api/savings-goals/[id]', () => {
  beforeEach(() => {
    crud.inserted.length = 0
    crud.patched.length = 0
    routeParam.current = 'goal-1'
    authState.requireUser.mockReset()
    authState.requireUser.mockResolvedValue({ id: 'user-1', email: null })
  })

  it('rejects an unauthenticated request with 401', async () => {
    authState.requireUser.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    inputState.current = { monthlyAmount: 80 }

    await expect(patchHandler(fakeEvent())).rejects.toMatchObject({ statusCode: 401 })
    expect(crud.patched).toHaveLength(0)
  })

  it('does not touch fields the patch never mentioned', async () => {
    // The sharpest test here: spreading undefined values would wipe a stored objective on
    // an edit that only changed the monthly amount.
    inputState.current = { monthlyAmount: 80 }

    await patchHandler(fakeEvent())

    const { values } = crud.patched[0]
    expect(values.monthlyAmount).toBe('80')
    expect('targetAmount' in values).toBe(false)
    expect('note' in values).toBe(false)
  })

  it('clears the objective when the patch explicitly sends null', async () => {
    // The counterpart to the test above: a poche must be able to go back to having none.
    inputState.current = { targetAmount: null }

    await patchHandler(fakeEvent())

    expect(crud.patched[0].values.targetAmount).toBeNull()
  })

  it('rejects a missing id rather than patching every row', async () => {
    routeParam.current = undefined
    inputState.current = { monthlyAmount: 10 }

    await expect(patchHandler(fakeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(crud.patched).toHaveLength(0)
  })
})
