// What each CSV file contains, how to check it, and how to turn rows into chart/checklist data.
import { isDate, todayISO } from './util.js'

export const TYPES = [
  { value: 'phase', label: 'Phase', help: 'A wide band across the top of the chart for a stage of the whole project.' },
  { value: 'task', label: 'Task', help: 'A bar that runs from a start date to an end date.' },
  { value: 'milestone', label: 'Milestone', help: 'One important date, shown as a diamond.' },
]

export const COLS = {
  timeline: [
    { key: 'type', label: 'Type', kind: 'type', width: 110, help: 'Phase, task or milestone' },
    { key: 'group', label: 'Group', kind: 'group', width: 140, help: 'Same name, same color and line', placeholder: 'e.g. Design' },
    { key: 'name', label: 'Name', kind: 'text', width: 200, help: 'Shown on the chart', placeholder: 'e.g. Sketch the screens' },
    { key: 'owner', label: 'Owner', kind: 'text', width: 110, help: 'Who is responsible (optional)', placeholder: 'e.g. Sam' },
    { key: 'start', label: 'Start', kind: 'date', width: 140, help: 'First day' },
    { key: 'end', label: 'End', kind: 'date', width: 140, help: 'Last day. Not needed for a milestone' },
    { key: 'notes', label: 'Notes', kind: 'long', width: 220, help: 'Shown on hover and click (optional)', placeholder: 'Anything useful to know' },
  ],
  checklist: [
    { key: 'group', label: 'Group', kind: 'group', width: 140, help: 'Items with the same group sit together', placeholder: 'e.g. Design' },
    { key: 'item', label: 'Item', kind: 'text', width: 260, help: 'What has to be done', placeholder: 'e.g. Get final sign-off' },
    { key: 'owner', label: 'Owner', kind: 'text', width: 120, help: 'Who does it (optional)', placeholder: 'e.g. Sam' },
    { key: 'due', label: 'Due', kind: 'date', width: 150, help: 'Deadline (optional)' },
    { key: 'notes', label: 'Notes', kind: 'long', width: 240, help: 'Tip: write "Done when: ..." so everyone agrees what finished means', placeholder: 'Done when: ...' },
    { key: 'done', label: 'Done on', kind: 'date', width: 150, help: 'Date finished. Empty means not done' },
  ],
}

const val = (r, k) => String(r[k] ?? '').trim()
export const isBlankRow = (kind, r) => COLS[kind].every((c) => !val(r, c.key))

// Trim everything; make "Task" or " TASK " into "task"; a milestone has no end date of its own.
export function cleanRow(kind, r) {
  const o = {}
  COLS[kind].forEach((c) => { o[c.key] = val(r, c.key) })
  if (kind === 'timeline') {
    o.type = o.type.toLowerCase()
    if (o.type === 'milestone') o.end = ''
  }
  return o
}

// Used when a file was typed by hand: "yes" in the Done column becomes today's date.
export function forEditor(kind, rows) {
  return rows.map((r) => {
    const o = cleanRow(kind, r)
    if (kind === 'checklist' && o.done && !isDate(o.done)) o.done = todayISO()
    return o
  })
}

export const sameRows = (kind, a, b) => {
  const x = a.filter((r) => !isBlankRow(kind, r)).map((r) => cleanRow(kind, r))
  const y = b.filter((r) => !isBlankRow(kind, r)).map((r) => cleanRow(kind, r))
  return JSON.stringify(x) === JSON.stringify(y)
}

const FORMAT = 'Use year-month-day, like 2026-11-02.'

// Returns [{ i: row number (0-based), key: column, msg }]. Blank rows are skipped.
export function validate(kind, rows) {
  const out = []
  rows.forEach((raw, i) => {
    if (isBlankRow(kind, raw)) return
    const r = cleanRow(kind, raw)
    const bad = (key, msg) => out.push({ i, key, msg })
    if (kind === 'timeline') {
      if (!TYPES.some((t) => t.value === r.type)) bad('type', 'Choose Phase, Task or Milestone.')
      if (!r.name) bad('name', 'Give this row a name.')
      if ((r.type === 'task' || r.type === 'milestone') && !r.group) bad('group', 'Choose a group, or type a new name to make one.')
      const startOk = isDate(r.start)
      if (!r.start) bad('start', 'Add a start date.')
      else if (!startOk) bad('start', FORMAT)
      if (r.type !== 'milestone') {
        if (!r.end) bad('end', 'Add an end date, or change the type to Milestone for a single day.')
        else if (!isDate(r.end)) bad('end', FORMAT)
        else if (startOk && r.end < r.start) bad('end', 'The end date is before the start date.')
      }
    } else {
      if (!r.item) bad('item', 'Write what needs to be done.')
      if (!r.group) bad('group', 'Choose a group, or type a new name to make one.')
      if (r.due && !isDate(r.due)) bad('due', FORMAT)
      if (r.done && !isDate(r.done)) bad('done', FORMAT + ' Leave empty if not done.')
    }
  })
  return out
}

// Rows the chart can draw, plus a list of rows that had to be left out.
export function timelineView(raw) {
  const errs = validate('timeline', raw)
  const bad = new Set(errs.map((e) => e.i))
  const rows = []
  raw.forEach((r, i) => {
    if (isBlankRow('timeline', r) || bad.has(i)) return
    const c = cleanRow('timeline', r)
    rows.push({ ...c, end: c.type === 'milestone' ? c.start : c.end, idx: i })
  })
  return { rows, skipped: [...bad].length, firstProblem: errs[0] || null }
}

export function checklistView(raw) {
  const errs = validate('checklist', raw)
  const bad = new Set(errs.map((e) => e.i))
  const rows = []
  raw.forEach((r, i) => {
    if (isBlankRow('checklist', r) || bad.has(i)) return
    rows.push({ ...cleanRow('checklist', r), idx: i })
  })
  return { rows, skipped: [...bad].length, firstProblem: errs[0] || null }
}
