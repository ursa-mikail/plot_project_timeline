import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from './ctx.js'
import { api } from './api.js'
import { parseCSV } from './csv.js'
import { COLS, TYPES, cleanRow, forEditor, isBlankRow, validate } from './schema.js'
import { Empty, Notice, PageHead } from './ui.jsx'
import { addDays, isDate, plural, todayISO } from './util.js'

const COPY = {
  timeline: {
    title: 'Edit timeline',
    lede: 'Add, change, move and delete the rows that make up your timeline chart.',
    noun: 'row', nouns: 'rows',
    help: [
      'Each row is one phase, task or milestone. Choose a type, then fill in the name and the dates.',
      'Rows with the same group share a color and a line on the chart. Type a new group name to create a group.',
      'Nothing changes until you press Save changes at the bottom. Undo and Revert let you go back.',
      'Red text under a cell tells you what to fix. You can also upload a CSV file to fill the table, or download the current one.',
    ],
    seeIt: 'See it on the Timeline', seeTab: 'timeline',
  },
  checklist: {
    title: 'Edit checklist',
    lede: 'Add, change, move and delete the items on your checklist.',
    noun: 'item', nouns: 'items',
    help: [
      'Each row is one thing that has to be done. Use the same group names as on the timeline and the pages line up.',
      'In Notes, write “Done when: …” so everyone agrees what finished means.',
      'Nothing changes until you press Save changes at the bottom. Undo and Revert let you go back.',
      'To mark something done, set a date in Done on, or just tick it on the Checklist page.',
    ],
    seeIt: 'See it on the Checklist', seeTab: 'checklist',
  },
}

const Icon = ({ d }) => <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const ICONS = {
  up: 'M10 16V4M5 9l5-5 5 5',
  down: 'M10 4v12M5 11l5 5 5-5',
  copy: 'M7 7h9v9H7zM4 13V4h9',
  del: 'M5 5l10 10M15 5L5 15',
}

export default function Editor({ kind }) {
  const { base, drafts, setDraft, dirty, data, reload, go, focus, setFocus, confirm, resetData } = useApp()
  const cols = COLS[kind]
  const copy = COPY[kind]
  const isDirty = dirty[kind]
  const counter = useRef(0)
  const [hist, setHist] = useState([])
  const [sortedFrom, setSortedFrom] = useState(null) // row order before sorting; null when not sorted
  const lastEdit = useRef({ key: '', t: 0 })
  const fileInput = useRef(null)

  const [attempted, setAttempted] = useState(false)
  const [touched, setTouched] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [pf, setPf] = useState(null)
  const [flash, setFlash] = useState(null)

  const baseRows = useMemo(() => base[kind].map((r, i) => ({ ...r, _k: 's' + i })), [base, kind])
  const rows = drafts[kind] || baseRows
  const errs = useMemo(() => validate(kind, rows), [kind, rows])
  const errAt = useMemo(() => { const m = {}; errs.forEach((e) => { m[e.i + ':' + e.key] ??= e.msg }); return m }, [errs])

  const groupNames = useMemo(() => {
    const other = kind === 'timeline' ? 'checklist' : 'timeline'
    const all = [...rows, ...(drafts[other] || base[other])]
    return [...new Set(all.map((r) => String(r.group || '').trim()).filter(Boolean))]
  }, [rows, drafts, base, kind])

  // Arriving from "Edit this row" on the Timeline: scroll to that row and highlight it.
  useEffect(() => {
    if (focus && focus.kind === kind) {
      const k = 's' + focus.idx
      setFlash(k)
      setTimeout(() => document.querySelector(`[data-row="${k}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
      setTimeout(() => setFlash(null), 2200)
      setFocus(null)
    }
  }, [focus, kind, setFocus])

  useEffect(() => {
    if (!pf) return
    const el = document.querySelector(`[data-cell="${pf}"]`)
    if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
    setPf(null)
  }, [pf, rows])

  // Each action is one undo step. Typing in the same cell counts as one step.
  const commit = (next, editKey) => {
    const now = Date.now()
    const same = editKey && lastEdit.current.key === editKey && now - lastEdit.current.t < 2000
    lastEdit.current = { key: editKey || '', t: now }
    if (!same) setHist((h) => [...h.slice(-29), rows])
    setDraft(kind, next)
    setSaved(null); setErr(''); setInfo('')
  }
  const newKey = () => 'n' + ++counter.current

  const setCell = (i, key, value) => {
    const r0key = rows[i]._k
    const next = rows.map((r, j) => {
      if (j !== i) return r
      const o = { ...r, [key]: value }
      if (kind === 'timeline') {
        if (key === 'type' && value === 'milestone') o.end = ''
        // Convenience: a new start date fills an empty end date so the row is valid straight away.
        if (key === 'start' && isDate(value) && o.type !== 'milestone' && !o.end) o.end = value
      }
      return o
    })
    commit(next, r0key + ':' + key)
  }
  const touch = (r, key) => setTouched((t) => new Set(t).add(r._k + key))

  const addRow = () => {
    const last = rows[rows.length - 1]
    const t = todayISO()
    const row = kind === 'timeline'
      ? { _k: newKey(), type: 'task', group: last?.group || '', name: '', owner: '', start: t, end: addDays(t, 6), notes: '' }
      : { _k: newKey(), group: last?.group || '', item: '', owner: '', due: '', notes: '', done: '' }
    commit([...rows, row])
    setPf(row._k + ':' + (kind === 'timeline' ? 'name' : 'item'))
  }
  const dup = (i) => {
    const c = { ...rows[i], _k: newKey() }
    if (kind === 'checklist') c.done = ''
    commit([...rows.slice(0, i + 1), c, ...rows.slice(i + 1)])
    setPf(c._k + ':' + (kind === 'timeline' ? 'name' : 'item'))
  }
  const remove = (i) => commit(rows.filter((_, j) => j !== i))
  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= rows.length) return
    const n = [...rows];[n[i], n[j]] = [n[j], n[i]]
    commit(n)
  }
  // Sort is a switch: press once to sort by start date, press again to go back to your own order.
  const toggleSort = () => {
    if (sortedFrom) {
      const pos = new Map(sortedFrom.map((k, i) => [k, i]))
      commit([...rows].sort((a, b) => (pos.has(a._k) ? pos.get(a._k) : 1e9) - (pos.has(b._k) ? pos.get(b._k) : 1e9)))
      setSortedFrom(null)
    } else {
      setSortedFrom(rows.map((r) => r._k))
      commit([...rows].sort((a, b) => (isDate(a.start) ? a.start : '9999').localeCompare(isDate(b.start) ? b.start : '9999') || (a.end || '').localeCompare(b.end || '')))
    }
  }
  const undo = () => {
    if (!hist.length) return
    setDraft(kind, hist[hist.length - 1])
    setHist(hist.slice(0, -1))
    lastEdit.current = { key: '', t: 0 }
    setSortedFrom(null); setSaved(null)
  }
  const revert = async () => {
    const ok = await confirm({ title: 'Discard your unsaved changes?', body: `The table will go back to the last saved version. This cannot be undone.`, confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true })
    if (!ok) return
    setDraft(kind, null); setHist([]); setSortedFrom(null); setAttempted(false); setTouched(new Set()); setErr(''); setInfo('')
  }

  const upload = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErr(''); setInfo(''); setSaved(null)
    const table = parseCSV(await f.text())
    const head = (table[0] || []).map((h) => h.trim().toLowerCase())
    const found = cols.filter((c) => head.includes(c.key))
    if (!found.length) {
      setErr(`“${f.name}” does not have the columns Plotline expects (${cols.map((c) => c.key).join(', ')}) in its first line. Use Download CSV to get a file in the right shape, then try again.`)
      return
    }
    const loaded = forEditor(kind, table.slice(1).map((rec) => {
      const o = {}
      cols.forEach((c) => { const j = head.indexOf(c.key); o[c.key] = j >= 0 && j < rec.length ? rec[j] : '' })
      return o
    }).filter((r) => !isBlankRow(kind, r))).map((r, n) => ({ ...r, _k: 'u' + n }))
    const missing = cols.filter((c) => !head.includes(c.key)).map((c) => c.key)
    setSortedFrom(null)
    commit(loaded)
    setInfo(`Loaded ${plural(loaded.length, copy.noun, copy.nouns)} from “${f.name}”${missing.length ? `. The file has no ${missing.join(', ')} column, so that is left empty` : ''}. Review them, then press Save changes. Undo or Revert brings back what you had.`)
  }

  const jump = (e) => setPf(rows[e.i]._k + ':' + e.key)

  const save = async () => {
    if (errs.length) {
      setAttempted(true)
      jump(errs[0])
      return
    }
    setSaving(true); setErr('')
    try {
      const payload = rows.filter((r) => !isBlankRow(kind, r)).map((r) => cleanRow(kind, r))
      const res = await api.put(kind, payload)
      await reload()
      setDraft(kind, null)
      setHist([]); setSortedFrom(null)
      setAttempted(false); setTouched(new Set())
      setSaved({ n: payload.length, backup: res.backup })
    } catch (e) {
      setErr('Your changes were not saved. ' + e.message + ' Your edits are still here, so you can try again.')
    } finally { setSaving(false) }
  }

  const showErr = (r, i, key) => (attempted || touched.has(r._k + key) || !r._k.startsWith('n')) && errAt[i + ':' + key]
  const loadErr = data[kind].error
  const ignored = data[kind].ignored || []
  const dataRows = rows.filter((r) => !isBlankRow(kind, r)).length

  const statusText = saving ? 'Saving…'
    : !isDirty ? (errs.length ? `No unsaved changes. ${plural(errs.length, 'cell needs', 'cells need')} attention before this file is fully usable.` : 'No unsaved changes.')
      : errs.length ? `Unsaved changes. ${plural(errs.length, 'thing')} to fix before you can save.`
        : 'Unsaved changes. Press Save changes to keep them.'

  return (
    <div>
      <PageHead id={'edit-' + kind} title={copy.title} lede={copy.lede} help={copy.help} />
      <datalist id="group-names">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>

      {loadErr && <Notice kind="error">{loadErr}</Notice>}
      {saved && (
        <Notice kind="ok" actions={<button className="btn primary" onClick={() => go(copy.seeTab)}>{copy.seeIt}</button>} onClose={() => setSaved(null)}>
          Saved {plural(saved.n, copy.noun, copy.nouns)}.{saved.backup ? ` The version before this one is kept in data/backups as ${saved.backup}.` : ''}
        </Notice>
      )}
      {info && <Notice kind="info" onClose={() => setInfo('')}>{info}</Notice>}
      {err && <Notice kind="error" onClose={() => setErr('')}>{err}</Notice>}
      {ignored.length > 0 && !isDirty && <Notice kind="info">Your file also has {plural(ignored.length, 'column')} Plotline does not use ({ignored.join(', ')}). {ignored.length === 1 ? 'It' : 'They'} will be removed the next time you save. A backup keeps the original.</Notice>}
      {attempted && errs.length > 0 && (
        <Notice kind="error">
          <b>Fix {plural(errs.length, 'thing')} before saving:</b>
          <ul className="problems">
            {errs.slice(0, 8).map((e, n) => (
              <li key={n}><button className="link" onClick={() => jump(e)}>Row {e.i + 1}, {cols.find((c) => c.key === e.key).label}</button>: {e.msg}</li>
            ))}
            {errs.length > 8 && <li>…and {errs.length - 8} more.</li>}
          </ul>
        </Notice>
      )}

      <section className="toolbar" aria-label="Table tools">
        <button className="btn primary" onClick={addRow}>Add {copy.noun}</button>
        {kind === 'timeline' && <button className={'btn' + (sortedFrom ? ' toggled' : '')} onClick={toggleSort} aria-pressed={!!sortedFrom} disabled={rows.length < 2 && !sortedFrom} title={sortedFrom ? 'Click to go back to your own order' : 'Put the rows in date order'}>{sortedFrom ? 'Sorted by start date (click to undo)' : 'Sort by start date'}</button>}
        <button className="btn" onClick={undo} disabled={!hist.length} title="Undo your last change">Undo{hist.length ? ` (${hist.length})` : ''}</button>
        <span className="spacer" />
        <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={upload} />
        <button className="btn" onClick={() => fileInput.current.click()} title="Fill the table from a CSV file on your computer. Nothing is saved until you press Save changes.">Upload CSV</button>
        <a className="btn" href={`/api/download/${kind}.csv`} download>Download CSV</a>
      </section>

      {rows.length === 0 ? (
        <Empty title={`No ${copy.nouns} yet`} actions={<>
          <button className="btn primary" onClick={addRow}>Add the first {copy.noun}</button>
          <button className="btn" onClick={() => resetData('example')}>Load the example plan</button>
        </>}>
          Add a row to begin, upload a CSV file, or load the example plan to see how it looks.
        </Empty>
      ) : (
        <div className="gridwrap">
          <table className="grid">
            <caption className="sr">{copy.title}. One row per {copy.noun}.</caption>
            <thead>
              <tr>
                <th className="n" scope="col"><span className="th-l">#</span></th>
                {cols.map((c) => <th key={c.key} scope="col" style={{ minWidth: c.width }}><span className="th-l">{c.label}</span><span className="th-h">{c.help}</span></th>)}
                <th className="act" scope="col"><span className="th-l">Row</span><span className="th-h">Move, copy, delete</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r._k} data-row={r._k} className={flash === r._k ? 'flash' : ''}>
                  <td className="n">{i + 1}</td>
                  {cols.map((c) => {
                    const msg = showErr(r, i, c.key)
                    const common = { 'data-cell': r._k + ':' + c.key, 'aria-label': `${c.label}, row ${i + 1}`, 'aria-invalid': !!msg, onBlur: () => touch(r, c.key) }
                    let input
                    if (c.kind === 'type') {
                      input = (
                        <select {...common} value={r.type} onChange={(e) => setCell(i, 'type', e.target.value)}>
                          {!TYPES.some((t) => t.value === r.type) && <option value="">Choose…</option>}
                          {TYPES.map((t) => <option key={t.value} value={t.value} title={t.help}>{t.label}</option>)}
                        </select>
                      )
                    } else if (c.kind === 'date') {
                      if (kind === 'timeline' && c.key === 'end' && r.type === 'milestone') input = <span className="same">Same day</span>
                      else if (r[c.key] && !isDate(r[c.key])) input = <input {...common} type="text" value={r[c.key]} placeholder="yyyy-mm-dd" onChange={(e) => setCell(i, c.key, e.target.value)} />
                      else input = <input {...common} type="date" value={r[c.key]} onChange={(e) => setCell(i, c.key, e.target.value)} />
                    } else if (c.kind === 'long') {
                      input = <textarea {...common} rows={1} value={r[c.key]} placeholder={c.placeholder} onChange={(e) => setCell(i, c.key, e.target.value)} />
                    } else {
                      input = <input {...common} type="text" value={r[c.key]} placeholder={kind === 'timeline' && c.key === 'group' && r.type === 'phase' ? 'Not needed' : c.placeholder} list={c.kind === 'group' ? 'group-names' : undefined} onChange={(e) => setCell(i, c.key, e.target.value)} />
                    }
                    return <td key={c.key} className={msg ? 'bad' : ''}>{input}{msg && <div className="cell-err">{msg}</div>}</td>
                  })}
                  <td className="act">
                    <button className="ibtn" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" aria-label={`Move row ${i + 1} up`}><Icon d={ICONS.up} /></button>
                    <button className="ibtn" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down" aria-label={`Move row ${i + 1} down`}><Icon d={ICONS.down} /></button>
                    <button className="ibtn" onClick={() => dup(i)} title="Copy this row" aria-label={`Copy row ${i + 1}`}><Icon d={ICONS.copy} /></button>
                    <button className="ibtn del" onClick={() => remove(i)} title="Delete this row" aria-label={`Delete row ${i + 1}`}><Icon d={ICONS.del} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && <div className="addbelow"><button className="btn" onClick={addRow}>Add {copy.noun}</button></div>}

      <div className={'savebar' + (isDirty ? ' dirty' : '')}>
        <div className="savebar-text" role="status" aria-live="polite">
          <b>{plural(dataRows, copy.noun, copy.nouns)}.</b> {statusText}
          {isDirty && errs.length > 0 && !attempted && <> <button className="link" onClick={() => { setAttempted(true); jump(errs[0]) }}>Show me</button></>}
        </div>
        <div className="row-actions">
          <button className="btn" onClick={revert} disabled={!drafts[kind] || !isDirty}>Revert to last saved</button>
          <button className="btn primary" onClick={save} disabled={!isDirty || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}
