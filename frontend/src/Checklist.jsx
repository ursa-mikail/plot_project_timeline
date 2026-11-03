import { useMemo, useState } from 'react'
import { useApp } from './ctx.js'
import { api } from './api.js'
import { Empty, Meter, Notice, PageHead } from './ui.jsx'
import { isDate, nice, niceShort, plural, todayISO } from './util.js'

export default function Checklist() {
  const { views, data, go, reload, resetData } = useApp()
  const cl = views.checklist
  const [opt, setOpt] = useState({}) // ticks we have shown but the server has not confirmed yet
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [show, setShow] = useState('all')
  const [only, setOnly] = useState('')
  const [folded, setFolded] = useState(new Set())

  const today = todayISO()
  const doneOf = (r) => (r.idx in opt ? opt[r.idx] : r.done)
  const rows = cl.rows

  const groups = useMemo(() => {
    const gs = []
    rows.forEach((r) => {
      let g = gs.find((x) => x.name === r.group)
      if (!g) { g = { name: r.group, items: [] }; gs.push(g) }
      g.items.push(r)
    })
    return gs
  }, [rows])

  const windowOf = (name) => {
    const t = views.timeline.rows.filter((r) => r.group === name)
    return t.length ? [t.map((r) => r.start).sort()[0], t.map((r) => r.end).sort().pop()] : null
  }

  const toggle = async (r) => {
    const done = !doneOf(r)
    setMsg('')
    setOpt((o) => ({ ...o, [r.idx]: done ? today : '' }))
    try {
      await api.toggle({ index: r.idx, item: r.item, done, date: today })
      await reload()
    } catch (e) {
      setMsg(e.status === 409 ? e.message : 'That change was not saved, so the box has gone back. ' + e.message)
      if (e.status === 409) await reload()
    } finally {
      setOpt((o) => { const n = { ...o }; delete n[r.idx]; return n })
    }
  }

  const head = (
    <PageHead id="checklist" title="Checklist" lede="Tick items off as they are finished. The date is saved for you."
      help={[
        'Click a box to mark an item done. Click it again to undo. Changes are saved straight away.',
        'Grey text under an item explains what “done” means. Items past their due date are marked Overdue.',
        'Click a group card to show only that group. Click it again to show everything.',
        'To add, rename, reorder or delete items, use the Edit checklist tab.',
      ]} />
  )

  if (data.checklist.error) return <div>{head}<Notice kind="error" actions={<button className="btn" onClick={() => go('edit-checklist')}>Open Edit checklist</button>}>{data.checklist.error}</Notice></div>

  if (!rows.length) {
    return (
      <div>
        {head}
        {cl.skipped > 0 && <Notice kind="warn" actions={<button className="btn" onClick={() => go('edit-checklist')}>Fix in Edit checklist</button>}>{plural(cl.skipped, 'row')} could not be shown because of a problem with its details. Open Edit checklist to see which.</Notice>}
        <Empty title="Your checklist is empty"
          actions={<>
            <button className="btn primary" onClick={() => go('edit-checklist')}>Add the first item</button>
            <button className="btn" onClick={() => resetData('example')}>Load the example plan</button>
          </>}>
          Add the things that need to be done and they will show up here with a box to tick.
        </Empty>
      </div>
    )
  }

  const total = rows.length
  const done = rows.filter(doneOf).length
  const pct = Math.round((done / total) * 100)
  const open = rows.filter((r) => !doneOf(r))
  const next = [...open].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0]
  const overdue = open.filter((r) => r.due && r.due < today).length
  const keep = (r) => (show === 'all' || (show === 'todo' ? !doneOf(r) : !!doneOf(r))) && (!q || (r.item + ' ' + r.group + ' ' + r.owner + ' ' + r.notes).toLowerCase().includes(q.toLowerCase()))
  const shown = groups.filter((g) => !only || g.name === only).map((g) => ({ ...g, list: g.items.filter(keep) })).filter((g) => g.list.length)
  const reset = () => { setQ(''); setShow('all'); setOnly(''); setFolded(new Set()) }

  return (
    <div>
      {head}
      {cl.skipped > 0 && (
        <Notice kind="warn" actions={<button className="btn" onClick={() => go('edit-checklist')}>Fix in Edit checklist</button>}>
          {plural(cl.skipped, 'row is', 'rows are')} not shown because of a problem with {cl.skipped === 1 ? 'its' : 'their'} details. First problem: row {cl.firstProblem.i + 1}. {cl.firstProblem.msg}
        </Notice>
      )}
      {msg && <Notice kind="error" onClose={() => setMsg('')}>{msg}</Notice>}

      <section className="panel progress" aria-label="Progress">
        <div className="big"><b>{done}</b> of <b>{total}</b> items done <span className="pct">{pct}%</span></div>
        <Meter value={done} total={total} />
        <p className="muted">
          {next ? <>Up next: <b>{next.item}</b> ({next.group}){next.due ? `, due ${nice(next.due)}` : ''}.</> : 'Everything is done.'}
          {overdue > 0 && <> <span className="late">{plural(overdue, 'item is', 'items are')} overdue.</span></>}
        </p>
      </section>

      <section className="cards" aria-label="Groups">
        {groups.map((g) => {
          const d = g.items.filter(doneOf).length
          const win = windowOf(g.name)
          return (
            <button key={g.name} className={'card' + (only === g.name ? ' sel' : '') + (d === g.items.length ? ' full' : '')} aria-pressed={only === g.name} onClick={() => setOnly(only === g.name ? '' : g.name)}>
              <b>{g.name}</b>
              <span className="cnt">{d === g.items.length ? 'All done' : `${d} of ${g.items.length} done`}</span>
              <Meter value={d} total={g.items.length} small />
              <small>{win ? `On the timeline: ${niceShort(win[0])} to ${niceShort(win[1])}` : 'Not on the timeline'}</small>
            </button>
          )
        })}
      </section>

      <section className="toolbar" aria-label="List controls">
        <div className="field">
          <input type="search" aria-label="Search the checklist" placeholder="Search by item, group, owner or notes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg" role="group" aria-label="Show">
          {[['all', 'All'], ['todo', 'Not done'], ['done', 'Done']].map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>)}
        </div>
        <button className="btn" onClick={reset}>Reset view</button>
        <a className="btn" href="/api/download/checklist.csv" download>Download CSV</a>
      </section>

      {shown.length === 0 && (
        <p className="nomatch">Nothing matches your filters. <button className="link" onClick={reset}>Show everything again</button></p>
      )}

      {shown.map((g) => {
        const d = g.items.filter(doneOf).length
        const isOpen = !folded.has(g.name)
        return (
          <section key={g.name} className="group" aria-label={g.name}>
            <button className="grouphead" aria-expanded={isOpen} onClick={() => { const n = new Set(folded); n.has(g.name) ? n.delete(g.name) : n.add(g.name); setFolded(n) }}>
              <span className="car">{isOpen ? '▾' : '▸'}</span><h2>{g.name}</h2><em className={d === g.items.length ? 'ok' : ''}>{d} of {g.items.length}</em>
            </button>
            {isOpen && g.list.map((r) => {
              const dn = doneOf(r)
              const late = !dn && r.due && r.due < today
              return (
                <label key={r.idx} className={'it' + (dn ? ' done' : '')}>
                  <input type="checkbox" checked={!!dn} onChange={() => toggle(r)} />
                  <span className="it-body">
                    <span className="it-text">{r.item}</span>
                    {r.notes && <span className="it-notes">{r.notes}</span>}
                  </span>
                  <span className="it-meta">
                    {r.owner && <span className="owner">{r.owner}</span>}
                    {dn ? <span className="stamp">{isDate(dn) ? `Done ${nice(dn)}` : 'Done'}</span>
                      : r.due ? <span className={'due' + (late ? ' late' : '')}>{late ? 'Overdue since ' : 'Due '}{nice(r.due)}</span> : null}
                  </span>
                </label>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
