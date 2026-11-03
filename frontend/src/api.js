// Talks to the Plotline server. Every failure becomes a sentence a person can act on.
async function call(url, options) {
  let res
  try {
    res = await fetch(url, options)
  } catch {
    const e = new Error('Plotline cannot reach its server. Check that it is still running (start it again with ./up), then try again.')
    e.network = true
    throw e
  }
  let body = null
  try { body = await res.json() } catch { /* not JSON */ }
  if (!res.ok) {
    const e = new Error((body && body.error) || `Something went wrong (code ${res.status}).`)
    e.status = res.status
    throw e
  }
  return body
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const api = {
  get: (kind) => call(`/api/data/${kind}`),
  put: (kind, rows) => call(`/api/data/${kind}`, json('PUT', { rows })),
  toggle: (p) => call('/api/checklist/toggle', json('POST', p)),
  reset: (mode) => call('/api/reset', json('POST', { mode })),
}
