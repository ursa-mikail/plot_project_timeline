// Small date helpers. Dates are always plain "yyyy-mm-dd" text, never time zones.
export const DAY = 864e5
export const pd = (s) => Date.parse(s + 'T00:00:00Z')
export const iso = (t) => new Date(t).toISOString().slice(0, 10)
export const isDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false
  const t = pd(s)
  return !isNaN(t) && iso(t) === s
}
export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const addDays = (s, n) => iso(pd(s) + n * DAY)
export const nice = (s) => new Date(pd(s)).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const niceShort = (s) => new Date(pd(s)).toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })
export const dayCount = (a, b) => Math.round((pd(b) - pd(a)) / DAY) + 1
export const plural = (n, word, many) => `${n} ${n === 1 ? word : many || word + 's'}`
export const lengthText = (a, b) => {
  const d = dayCount(a, b)
  if (d < 14) return plural(d, 'day')
  if (d < 84) return `${plural(d, 'day')}, about ${Math.round(d / 7)} weeks`
  return `about ${Math.round(d / 30.44)} months`
}
