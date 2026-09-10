import { EvalBlocked, requireEvidence, sha256 } from './instrument.mjs'

export const ENDPOINT = 'https://api.openai.com/v1/responses'
export const HARNESS = 'stamity-manual-responses-v1'
export const CONTROLS = Object.freeze({ transport: 'stateless-responses-api', tools: 'removed',
  history: 'omitted', projectContext: 'absent', trace: 'complete-response-output',
  providerInternalInstructions: 'not exposed by API', attestation: 'unavailable; no prompt appended',
  decoding: 'temperature/top_p/seed not requested; provider fields recorded when exposed',
  maxOutputTokens: 16384, timeoutMs: 600000, maxAttempts: 3 })

export function makeRequest(role, blocks) {
  requireEvidence(blocks.length === 1 || blocks.length === 4, 'request-block-count')
  requireEvidence(blocks.every(block => typeof block === 'string' && block.length > 0), 'request-block-empty')
  return { model: role.model, reasoning: { effort: role.reasoningEffort },
    input: [{ role: 'user', content: blocks.map(text => ({ type: 'input_text', text })) }],
    tools: [], tool_choice: 'none', store: false, stream: false, truncation: 'disabled',
    max_output_tokens: CONTROLS.maxOutputTokens }
}

export function admitRequest(request, expected) {
  requireEvidence(JSON.stringify(request) === JSON.stringify(expected), 'request-input-or-control-mismatch')
  requireEvidence(request.input.length === 1 && request.input[0].role === 'user' &&
    request.tools.length === 0 && request.store === false && request.truncation === 'disabled', 'request-isolation')
  requireEvidence(!['instructions', 'conversation', 'previous_response_id', 'prompt'].some(key => key in request), 'request-ambient-context')
}

/** A complete provider response is the tool trace; unrecognized output items fail closed. */
export function admitResponse(receipt, expected, { allowRefusal = false } = {}) {
  requireEvidence(receipt.transport === CONTROLS.transport && receipt.endpoint === ENDPOINT, 'unproved-transport')
  requireEvidence(receipt.requestHash === sha256(receipt.requestBody), 'request-hash-mismatch')
  let request
  let response
  try { request = JSON.parse(receipt.requestBody); response = JSON.parse(receipt.rawResponse) }
  catch { throw new EvalBlocked('uninspectable-json', true) }
  admitRequest(request, expected)
  requireEvidence(receipt.responseHash === sha256(receipt.rawResponse), 'response-hash-mismatch')
  requireEvidence(response.object === 'response' && typeof response.id === 'string', 'provider-response-shape', true)
  requireEvidence(response.model === expected.model, 'provider-model-unavailable-or-mismatch', true)
  requireEvidence(response.reasoning?.effort === expected.reasoning.effort, 'provider-effort-unavailable-or-mismatch', true)
  requireEvidence(response.status === 'completed' && response.error === null && response.incomplete_details === null, 'provider-incomplete', true)
  requireEvidence(response.instructions === null && response.previous_response_id === null &&
    (response.conversation === undefined || response.conversation === null) &&
    (response.prompt === undefined || response.prompt === null) && response.store === false &&
    Array.isArray(response.tools) && response.tools.length === 0 && response.tool_choice === 'none' &&
    response.truncation === 'disabled', 'provider-context-or-tools')
  requireEvidence(Array.isArray(response.output) && response.output.length > 0, 'uninspectable-trace', true)
  const texts = []
  const outputTypes = []
  const parts = []
  for (const [messageIndex, item] of response.output.entries()) {
    requireEvidence(item.type === 'message' || item.type === 'reasoning', 'tool-or-unknown-output')
    if (item.type === 'reasoning') continue
    requireEvidence(item.role === 'assistant' && item.status === 'completed' && Array.isArray(item.content), 'output-message', true)
    for (const [contentIndex, content] of item.content.entries()) {
      const refusal = allowRefusal && content.type === 'refusal' && typeof content.refusal === 'string'
      requireEvidence(refusal || (content.type === 'output_text' && typeof content.text === 'string'), 'output-refusal-or-nontext', true)
      const text = refusal ? content.refusal : content.text
      texts.push(text)
      outputTypes.push(content.type)
      parts.push({ messageIndex, contentIndex, type: content.type, text })
    }
  }
  requireEvidence(texts.some(text => text.length > 0), 'empty-transcript', true)
  return { transcript: texts.join(''), parts, provider: { id: response.id, model: response.model,
    reasoningEffort: response.reasoning.effort, temperature: response.temperature ?? 'unavailable',
    topP: response.top_p ?? 'unavailable', seed: response.seed ?? 'unavailable',
    serviceTier: response.service_tier ?? 'unavailable', usage: response.usage ?? 'unavailable' },
    attestation: 'unavailable', outputType: new Set(outputTypes).size === 1 ? outputTypes[0] : 'mixed',
    toolCalls: 0, trace: 'complete-response-output' }
}

/** Fixed official endpoint, no SDK conversation state, no CLI credentials, no ambient input loader. */
export async function responsesTransport(request, { apiKey, fetchImpl = fetch, timeoutMs = CONTROLS.timeoutMs } = {}) {
  requireEvidence(typeof apiKey === 'string' && apiKey.trim().length > 0, 'OPENAI_API_KEY-unavailable')
  const requestBody = JSON.stringify(request)
  let response
  try {
    response = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: requestBody, signal: AbortSignal.timeout(timeoutMs) })
  } catch { throw new EvalBlocked('provider-network-or-timeout', true) }
  // Provider error bodies may echo credentials or confidential account details. Never persist them.
  if (!response.ok) throw new EvalBlocked(`provider-http-${response.status}`, [408, 409, 429, 500, 502, 503, 504].includes(response.status))
  let rawResponse
  try { rawResponse = await response.text() }
  catch { throw new EvalBlocked('provider-response-read', true) }
  let parsed
  try { parsed = JSON.parse(rawResponse) }
  catch { throw new EvalBlocked('provider-invalid-json', true) }
  requireEvidence(parsed.error === null, 'provider-response-error', true)
  return { transport: CONTROLS.transport, endpoint: ENDPOINT, requestBody, requestHash: sha256(requestBody),
    rawResponse, responseHash: sha256(rawResponse) }
}

/** Admission/format failures may be replaced. A returned grade, including FAIL, never enters retries. */
export async function callWithRetries({ request, transport, record, validate = value => value, allowRefusal = false, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  for (let attempt = 1; attempt <= CONTROLS.maxAttempts; attempt++) {
    let receipt
    let admitted
    let result
    let failure
    try {
      // oxlint-disable-next-line no-await-in-loop -- A retry depends on the previous attempt's failure.
      receipt = await transport(structuredClone(request))
      admitted = admitResponse(receipt, request, { allowRefusal })
      result = validate(admitted)
    } catch (error) {
      failure = error instanceof EvalBlocked ? error : new EvalBlocked('unexpected-transport-failure')
    }
    // Artifact writes are outside the retry catch: storage failures must never spend another call.
    // oxlint-disable-next-line no-await-in-loop -- Persist this attempt before any dependent retry.
    await record({ attempt, requestBody: JSON.stringify(request), receipt: receipt ?? null,
      admitted: admitted ?? null, failure: failure?.code ?? null })
    if (!failure) return result
    if (!failure.retryable || attempt === CONTROLS.maxAttempts) throw failure
    // oxlint-disable-next-line no-await-in-loop -- Bounded infrastructure backoff is sequential.
    await wait(1000 * attempt)
  }
  throw new EvalBlocked('attempts-exhausted')
}

export async function boundedMap(items, capacity, worker) {
  requireEvidence(Number.isInteger(capacity) && capacity >= 1 && capacity <= 16, 'capacity-out-of-range')
  const results = Array(items.length)
  let cursor = 0
  let failure
  await Promise.all(Array.from({ length: Math.min(capacity, items.length) }, async () => {
    while (!failure && cursor < items.length) {
      const index = cursor++
      // oxlint-disable-next-line no-await-in-loop -- Each queue slot admits only one in-flight call.
      try { results[index] = await worker(items[index], index) }
      catch (error) { failure ??= error }
    }
  }))
  if (failure) throw failure
  return results
}
