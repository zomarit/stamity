// Contributor helper: token usage and list-price cost from a run's local calls.json. No I/O.
// Not a runner file: the manual runner's configuration hash never reads it.

const ROLES = ['scenario', 'judge', 'calibration', 'isolation']
const RATES = ['inputPerMTok', 'outputPerMTok', 'cacheWrite5mPerMTok', 'cacheWrite1hPerMTok', 'cacheReadPerMTok']
const LIST_KEYS = new Set(['source', 'accessDate'])
// List prices hold for the standard tier at standard speed with global routing; anything else is billed differently.
const LIST_TIER = new Set([undefined, 'standard']), LIST_SPEED = new Set([undefined, 'standard'])
const LIST_GEO = new Set([undefined, 'global', 'not_available'])

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const count = value => Number.isSafeInteger(value) && value >= 0
const micro = value => Math.round(value * 1e6) / 1e6
const perRole = make => Object.fromEntries(ROLES.map(role => [role, make()]))

function validPrices(prices) {
  if (!object(prices) || typeof prices.source !== 'string' || !/^https:\/\/\S+$/.test(prices.source) ||
      typeof prices.accessDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(prices.accessDate))
    throw new Error('price list must name an https source and a YYYY-MM-DD access date')
  for (const [model, entry] of Object.entries(prices)) {
    if (LIST_KEYS.has(model)) continue
    if (!object(entry) || !RATES.every(rate => Number.isFinite(entry[rate]) && entry[rate] >= 0))
      throw new Error(`price list entry ${JSON.stringify(model)} must carry ${RATES.join(', ')}`)
  }
}

/** The four billed token counts, or null when the attempt reported no complete usage. */
function tokens(usage) {
  if (!object(usage)) return null
  const counted = { input: usage.input_tokens, output: usage.output_tokens,
    cacheCreation: usage.cache_creation_input_tokens, cacheRead: usage.cache_read_input_tokens }
  return Object.values(counted).every(count) ? counted : null
}

/** One model id the whole attempt ran on, or null when the usage cannot be attributed to one. */
function attemptModel(native) {
  const listed = object(native.modelUsage) ? Object.keys(native.modelUsage) : []
  const model = typeof native.apiModel === 'string' && native.apiModel.length > 0 ? native.apiModel
    : listed.length === 1 ? listed[0] : null
  return model !== null && listed.every(name => name === model) ? model : null
}

/** The 1-hour and 5-minute cache-write split, or null when it is absent or disagrees with the total. */
function writeSplit(usage, total) {
  const split = usage.cache_creation
  if (split === undefined || split === null) return total === 0 ? { oneHour: 0, fiveMinute: 0 } : null
  const oneHour = split.ephemeral_1h_input_tokens, fiveMinute = split.ephemeral_5m_input_tokens
  return count(oneHour) && count(fiveMinute) && oneHour + fiveMinute === total ? { oneHour, fiveMinute } : null
}

/**
 * Sum per-attempt usage from calls.json by role, and price it at the list rates of `prices`.
 * A cost that the list cannot state exactly is null, and every total it feeds is null too.
 */
export function usageFromCalls(calls, prices) {
  if (!Array.isArray(calls)) throw new Error('calls.json must be a JSON array of attempt records')
  validPrices(prices)
  const byRole = perRole(() => ({ input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }))
  const costByRole = perRole(() => 0), clientByRole = perRole(() => 0), byModel = {}
  const unpriced = new Set()
  let notReported = 0, notListPriced = 0, clientAttempts = 0
  for (const call of calls) {
    if (!object(call) || !ROLES.includes(call.role))
      throw new Error(`calls.json attempt role must be one of ${ROLES.join(', ')}`)
    const native = object(call.native) ? call.native : {}
    // The client's own figure is recorded beside the list estimate, never in its place.
    const reported = Object.values(object(native.modelUsage) ? native.modelUsage : {})
      .filter(entry => object(entry) && Number.isFinite(entry.costUSD))
    if (reported.length > 0) clientAttempts++
    for (const entry of reported) clientByRole[call.role] += entry.costUSD
    const counted = tokens(native.usage)
    if (counted === null) { notReported++; continue }
    for (const [field, value] of Object.entries(counted)) byRole[call.role][field] += value
    const model = attemptModel(native), split = writeSplit(native.usage, counted.cacheCreation)
    const { service_tier: tier, speed, inference_geo: geo } = native.usage
    if (model === null || split === null || !LIST_TIER.has(tier) || !LIST_SPEED.has(speed) || !LIST_GEO.has(geo)) {
      notListPriced++
      costByRole[call.role] = null
      continue
    }
    const rate = LIST_KEYS.has(model) ? undefined : prices[model]
    if (rate === undefined) {
      unpriced.add(model)
      byModel[model] = null
      costByRole[call.role] = null
      continue
    }
    const cost = (counted.input * rate.inputPerMTok + counted.output * rate.outputPerMTok +
      split.fiveMinute * rate.cacheWrite5mPerMTok + split.oneHour * rate.cacheWrite1hPerMTok +
      counted.cacheRead * rate.cacheReadPerMTok) / 1e6
    if (byModel[model] !== null) byModel[model] = (byModel[model] ?? 0) + cost
    if (costByRole[call.role] !== null) costByRole[call.role] += cost
  }
  const total = Object.fromEntries(Object.keys(byRole.scenario).map(field =>
    [field, ROLES.reduce((sum, role) => sum + byRole[role][field], 0)]))
  const roleCosts = Object.values(costByRole)
  const round = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? null : micro(value)]))
  return {
    usage: { source: 'calls.json', attempts: calls.length, byRole, total, notReported },
    listCostUsd: {
      total: roleCosts.includes(null) ? null : micro(roleCosts.reduce((sum, value) => sum + value, 0)),
      byRole: round(costByRole),
      byModel: round(byModel),
      unpriced: [...unpriced].toSorted(),
      notListPriced,
      notReported,
      clientReportedUsd: { total: micro(Object.values(clientByRole).reduce((sum, value) => sum + value, 0)),
        byRole: round(clientByRole), attempts: clientAttempts },
      prices: 'evals/price-list.json',
      priceSource: prices.source,
      priceAccessDate: prices.accessDate,
    },
  }
}
