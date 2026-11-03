import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from './ctx.js'
import { Empty, Notice, PageHead } from './ui.jsx'
import { DAY, iso, lengthText, nice, niceShort, pd, plural, todayISO } from './util.js'

const LW = 230 // width of the sticky name column
const GROUP_COLORS = ['#2f6fed', '#0e9f8e', '#8a5cf6', '#e8590c', '#d6336c', '#5c940d', '#1098ad', '#c92a2a', '#6741d9', '#a16207']
const PHASE_COLORS = ['#334155', '#475569', '#1e3a5f', '#3b4a63']
const ZOOMS = [['Fit', 'Fit to screen'], ['Normal', 'Normal'], ['Close', 'Zoomed in']]
const PPD = { Normal: 4, Close: 10 }

const span = (r) => Math.round((pd(r.end) - pd(r.start)) / DAY) + 1
const typeName = { phase: 'Phase', task: 'Task', milestone: 'Milestone' }
function status(r) {
  const t = todayISO()
  if (r.type === 'milestone') return t < r.start ? 'Coming up' : t === r.start ? 'Today' : 'Passed'
  return t < r.start ? 'Not started' : t > r.end ? 'Finished' : 'In progress'
}

function makeTicks(min, max, ppd, W) {
  const total = Math.round((max - min) / DAY) + 1
  const out = []
  if (total <= 100) {
    let c = min - ((new Date(min).getUTCDay() + 6) % 7) * DAY // the Monday on or before the start
    while (c <= max) {
      out.push({ left: Math.max(0, ((c - min) / DAY) * ppd), right: Math.min(W, ((c + 7 * DAY - min) / DAY) * ppd), label: niceShort(iso(c)) })
      c += 7 * DAY
    }
  } else {
    const d0 = new Date(min)
    let c = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)
    while (c <= max) {
      const n = new Date(c), nx = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)
      const first = !out.length || n.getUTCMonth() === 0
      out.push({ left: Math.max(0, ((c - min) / DAY) * ppd), right: Math.min(W, ((nx - min) / DAY) * ppd), label: n.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) + (first ? ' ' + n.getUTCFullYear() : '') })
      c = nx
    }
  }
  return out
}

export default function Timeline() {
  const { views, data, go, dirty, resetData } = useApp()
  const view = views.timeline
  const rows = view.rows
  const [zoom, setZoom] = useState('Fit')
  const [hidden, setHidden] = useState(new Set())
  const [folded, setFolded] = useState(new Set())
  const [q, setQ] = useState('')
  const [tip, setTip] = useState(null)
  const [selIdx, setSelIdx] = useState(null)
  const [w, setW] = useState(1000)
  const scroller = useRef(null)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows.length > 0])

  const m = useMemo(() => {
    if (!rows.length) return null
    const min = Math.min(...rows.map((r) => pd(r.start)))
    const max = Math.max(...rows.map((r) => pd(r.end)))
    const total = Math.round((max - min) / DAY) + 1
    const ppd = zoom === 'Fit' ? Math.max(0.5, (w - LW - 4) / total) : PPD[zoom]
    const W = total * ppd
    const x = (t) => ((t - min) / DAY) * ppd
    const phases = rows.filter((r) => r.type === 'phase').sort((a, b) => a.start.localeCompare(b.start))
    const lanes = []
    phases.forEach((p) => {
      let l = lanes.find((ln) => pd(ln[ln.length - 1].end) < pd(p.start))
      if (!l) { l = []; lanes.push(l) }
      l.push(p)
    })
    const groups = []
    rows.filter((r) => r.type !== 'phase').forEach((r) => {
      let g = groups.find((g) => g.name === r.group)
      if (!g) { g = { name: r.group, items: [], color: GROUP_COLORS[groups.length % GROUP_COLORS.length] }; groups.push(g) }
      g.items.push(r)
    })
    groups.forEach((g) => g.items.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)))
    return { min, max, total, ppd, W, x, lanes, groups, ticks: makeTicks(min, max, ppd, W), phaseColor: new Map(phases.map((p, i) => [p.idx, PHASE_COLORS[i % PHASE_COLORS.length]])) }
  }, [rows, zoom, w])

  // When zoomed in, start the view near today so people do not have to hunt for it.
  useEffect(() => {
    const el = scroller.current
    if (!el || !m) return
    const t = pd(todayISO())
    el.scrollLeft = zoom !== 'Fit' && t >= m.min && t <= m.max ? Math.max(0, m.x(t) - 120) : 0
  }, [zoom, m && m.min])

  const sel = rows.find((r) => r.idx === selIdx) || null
  const today = pd(todayISO())
  const match = (r) => !q || (r.name + ' ' + r.owner + ' ' + r.group + ' ' + r.notes).toLowerCase().includes(q.toLowerCase())
  const flip = (set, setter, k) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setter(n) }
  const hover = (r, color) => (e) => setTip({ r, color, x: e.clientX, y: e.clientY })
  const reset = () => { setHidden(new Set()); setFolded(new Set()); setQ(''); setZoom('Fit'); setTip(null); setSelIdx(null) }

  const head = (
    <PageHead id="timeline" title="Timeline" lede="See every phase, task and milestone of your plan on one calendar."
      help={[
        'Dark bands across the top are phases. Colored bars are tasks, and each group has its own color. Diamonds are milestones.',
        'Hover over anything for a quick look, or click it to read the details below the chart.',
        'Use the buttons above the chart to zoom, search, or hide groups. Reset view puts everything back.',
        'To change anything, use the Edit timeline tab. Clicking a bar and choosing Edit this row takes you straight to it.',
      ]} />
  )

  if (data.timeline.error) return <div>{head}<Notice kind="error" actions={<button className="btn" onClick={() => go('edit-timeline')}>Open Edit timeline</button>}>{data.timeline.error}</Notice></div>

  if (!m) {
    return (
      <div>
        {head}
        {view.skipped > 0 && <Notice kind="warn" actions={<button className="btn" onClick={() => go('edit-timeline')}>Fix in Edit timeline</button>}>{plural(view.skipped, 'row')} could not be drawn because of a problem with its details. Open Edit timeline to see which.</Notice>}
        <Empty title="Your timeline is empty"
          actions={<>
            <button className="btn primary" onClick={() => go('edit-timeline')}>Add the first row</button>
            <button className="btn" onClick={() => resetData('example')}>Load the example plan</button>
          </>}>
          Add a row for each phase, task and milestone and they will appear here as a chart.
        </Empty>
      </div>
    )
  }

  const nTasks = rows.filter((r) => r.type === 'task').length
  const nMiles = rows.filter((r) => r.type === 'milestone').length
  const nPhases = rows.filter((r) => r.type === 'phase').length
  const visible = m.groups.filter((g) => !hidden.has(g.name))
  const anyMatch = visible.some((g) => g.items.some(match))

  return (
    <div>
      {head}
      {view.skipped > 0 && (
        <Notice kind="warn" actions={<button className="btn" onClick={() => go('edit-timeline')}>Fix in Edit timeline</button>}>
          {plural(view.skipped, 'row is', 'rows are')} not shown because of a problem with {view.skipped === 1 ? 'its' : 'their'} details. First problem: row {view.firstProblem.i + 1}. {view.firstProblem.msg}
        </Notice>
      )}
      <p className="summary">
        <b>{nice(iso(m.min))} to {nice(iso(m.max))}</b>, {lengthText(iso(m.min), iso(m.max))}. {plural(nTasks, 'task')}, {plural(nMiles, 'milestone')} and {plural(nPhases, 'phase')}.
      </p>

      <section className="toolbar" aria-label="Chart controls">
        <div className="field">
          <input type="search" aria-label="Search the timeline" placeholder="Search by name, owner, group or notes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg" role="group" aria-label="Zoom">
          {ZOOMS.map(([k, l]) => <button key={k} className={k === zoom ? 'on' : ''} aria-pressed={k === zoom} onClick={() => setZoom(k)}>{l}</button>)}
        </div>
        <button className="btn" onClick={reset}>Reset view</button>
      </section>

      <section className="chips" aria-label="Groups">
        <span className="chips-label">Show or hide a group:</span>
        {m.groups.map((g) => (
          <button key={g.name} className={'chip' + (hidden.has(g.name) ? ' off' : '')} style={{ '--c': g.color }} aria-pressed={!hidden.has(g.name)} onClick={() => flip(hidden, setHidden, g.name)}>
            <i /> {g.name}
          </button>
        ))}
      </section>

      <div className="key" aria-hidden="true">
        <span><i className="k-phase" /> Phase</span>
        <span><i className="k-task" /> Task</span>
        <span><i className="k-ms" /> Milestone</span>
        <span><i className="k-today" /> Today</span>
      </div>

      <section className={'detail' + (sel ? ' has' : '')} aria-live="polite">
        {!sel ? <p className="hint">Click any bar or diamond to see its details here.</p> : (
          <>
            <div className="detail-main">
              <h2>{sel.name}</h2>
              <p className="detail-meta">{typeName[sel.type]}{sel.group ? ` in ${sel.group}` : ''}. {status(sel)}.</p>
              <p><b>{sel.type === 'milestone' ? nice(sel.start) : `${nice(sel.start)} to ${nice(sel.end)}`}</b>{sel.type !== 'milestone' && <span className="muted"> ({lengthText(sel.start, sel.end)})</span>}</p>
              {sel.owner && <p>Owner: {sel.owner}</p>}
              {sel.notes && <p className="detail-notes">{sel.notes}</p>}
            </div>
            <div className="row-actions">
              <button className="btn" onClick={() => go('edit-timeline', dirty.timeline ? {} : { focus: { idx: sel.idx } })}>Edit this row</button>
              <button className="btn" onClick={() => setSelIdx(null)}>Close</button>
            </div>
          </>
        )}
      </section>

      <div className="scroll" ref={scroller} onMouseLeave={() => setTip(null)}>
        <div className="canvas" style={{ width: LW + m.W }}>
          <div className="head">
            <div className="lab corner">Group and name</div>
            <div className="ticks" style={{ width: m.W }}>
              {m.ticks.map((t, i) => <div key={i} className="tick" style={{ left: t.left, width: Math.max(0, t.right - t.left) }}>{t.label}</div>)}
            </div>
          </div>

          <div className="body">
            <div className="overlay under" style={{ left: LW, width: m.W }}>
              {m.ticks.map((t, i) => <div key={i} className="vline" style={{ left: t.left }} />)}
            </div>
            <div className="overlay" style={{ left: LW, width: m.W }}>
              {today >= m.min && today <= m.max + DAY && <div className="today" style={{ left: m.x(today) }}><span>Today</span></div>}
            </div>

            {m.lanes.map((lane, i) => (
              <div className="row phaserow" key={i}>
                <div className="lab">{i === 0 ? <b>Phases</b> : ''}</div>
                <div className="track" style={{ width: m.W }}>
                  {lane.map((p) => (
                    <button key={p.idx} className={'pbar' + (selIdx === p.idx ? ' sel' : '')} style={{ left: m.x(pd(p.start)), width: span(p) * m.ppd, background: m.phaseColor.get(p.idx) }}
                      onMouseMove={hover(p, m.phaseColor.get(p.idx))} onClick={() => setSelIdx(p.idx)} aria-label={`Phase ${p.name}, ${nice(p.start)} to ${nice(p.end)}`}>{p.name}</button>
                  ))}
                </div>
              </div>
            ))}

            {visible.map((g) => {
              const items = g.items.filter(match)
              if (!items.length) return null
              const open = !folded.has(g.name)
              const s = Math.min(...g.items.map((r) => pd(r.start))), e = Math.max(...g.items.map((r) => pd(r.end)))
              return (
                <div key={g.name}>
                  <button className="row grow" onClick={() => flip(folded, setFolded, g.name)} aria-expanded={open}>
                    <div className="lab" style={{ '--c': g.color }}><span className="car">{open ? '▾' : '▸'}</span><i className="sw" /> <b>{g.name}</b><em>{items.length}</em></div>
                    <div className="track" style={{ width: m.W }}><div className="span" style={{ left: m.x(s), width: ((e - s) / DAY + 1) * m.ppd, background: g.color }} /></div>
                  </button>
                  {open && items.map((r) => {
                    const left = m.x(pd(r.start))
                    const ms = r.type === 'milestone'
                    return (
                      <div className="row" key={r.idx}>
                        <div className="lab sub" title={r.name}>{r.name}</div>
                        <div className="track" style={{ width: m.W }}>
                          {ms ? (
                            <>
                              <button className={'gate' + (selIdx === r.idx ? ' sel' : '')} style={{ left: left + m.ppd / 2 - 9, '--c': g.color }} onMouseMove={hover(r, g.color)} onClick={() => setSelIdx(r.idx)} aria-label={`Milestone ${r.name}, ${nice(r.start)}`} />
                              <span className="gl" style={{ left: left + m.ppd / 2 + 14 }}>{niceShort(r.start)}</span>
                            </>
                          ) : (
                            <button className={'tbar' + (selIdx === r.idx ? ' sel' : '')} style={{ left, width: Math.max(span(r) * m.ppd, 8), background: g.color }} onMouseMove={hover(r, g.color)} onClick={() => setSelIdx(r.idx)} aria-label={`Task ${r.name}, ${nice(r.start)} to ${nice(r.end)}`}>
                              {span(r) * m.ppd > 120 ? r.name : ''}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {q && !anyMatch && (
        <p className="nomatch">Nothing matches “{q}”. <button className="link" onClick={() => setQ('')}>Clear the search</button></p>
      )}
      {visible.length === 0 && <p className="nomatch">All groups are hidden. <button className="link" onClick={() => setHidden(new Set())}>Show all groups</button></p>}

      {tip && (
        <div className="tip" style={{ left: Math.max(8, Math.min(tip.x + 16, innerWidth - 300)), top: Math.min(tip.y + 18, innerHeight - 150), borderTopColor: tip.color }}>
          <div className="tt">{tip.r.name}</div>
          <div className="meta">{typeName[tip.r.type]}{tip.r.group ? ` in ${tip.r.group}` : ''}. {status(tip.r)}.</div>
          <div>{tip.r.type === 'milestone' ? nice(tip.r.start) : `${nice(tip.r.start)} to ${nice(tip.r.end)}`}</div>
          {tip.r.owner && <div className="meta">Owner: {tip.r.owner}</div>}
          <div className="meta">Click for details</div>
        </div>
      )}
    </div>
  )
}
