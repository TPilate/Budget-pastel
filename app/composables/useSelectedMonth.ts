import type { YearMonthValue } from '~/utils/dates'

// The month shown by the whole app lives in the URL (`?mois=YYYY-MM`); no param means the
// current month, which the server resolves.
export function useSelectedMonth() {
  const route = useRoute()
  const router = useRouter()

  const mois = computed<string | undefined>(() => {
    const parsed = parseMoisParam(route.query.mois)
    return parsed ? formatMois(parsed) : undefined
  })
  const query = computed<{ mois?: string }>(() => (mois.value ? { mois: mois.value } : {}))

  async function go(ym: YearMonthValue | null) {
    const { mois: _dropped, ...rest } = route.query
    await router.push({ path: route.path, query: ym ? { ...rest, mois: formatMois(ym) } : rest })
  }

  return { mois, query, go }
}
