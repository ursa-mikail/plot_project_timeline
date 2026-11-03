import { useApp } from './ctx.js'
import { Meter, Notice, PageHead } from './ui.jsx'
import { nice, niceShort, plural, todayISO } from './util.js'

// One plain sentence about what to do next, based on the state of the data.
function nextStep({ tl, cl, tlErr, clErr, go }) {
  if (tlErr || clErr) return { text: 'One of your files could not be read. Open the matching edit tab to see what is wrong.', label: tlErr ? 'Edit timeline' : 'Edit checklist', to: tlErr ? 'edit-timeline' : 'edit-checklist' }
  if (!tl.rows.length && !cl.rows.length) return { text: 'Your plan is empty. Start by adding the phases, tasks and milestones.', label: 'Edit timeline', to: 'edit-timeline' }
  if (!tl.rows.length) return { text: 'You have checklist items but nothing on the timeline yet.', label: 'Edit timeline', to: 'edit-timeline' }
  if (!cl.rows.length) return { text: 'Your timeline is ready. Next, list what has to be checked off.', label: 'Edit checklist', to: 'edit-checklist' }
  if (tl.skipped || cl.skipped) return { text: `Some rows are being left out because they are incomplete. Open the edit tab to see which ones and what to fix.`, label: tl.skipped ? 'Edit timeline' : 'Edit checklist', to: tl.skipped ? 'edit-timeline' : 'edit-checklist' }
  const open = cl.rows.filter((r) => !r.done)
  if (!open.length) return { text: 'Everything on your checklist is done.', label: 'See the checklist', to: 'checklist' }
  const next = [...open].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0]
  return { text: `Next on your checklist: “${next.item}”${next.due ? `, due ${nice(next.due)}` : ''}.`, label: 'Open the checklist', to: 'checklist' }
}

export default function Start() {
  const { go, views, data, resetData } = useApp()
  const tl = views.timeline, cl = views.checklist
  const tlErr = data.timeline.error, clErr = data.checklist.error
  const next = nextStep({ tl, cl, tlErr, clErr, go })
  const done = cl.rows.filter((r) => r.done).length
  const groups = new Set(tl.rows.filter((r) => r.type !== 'phase').map((r) => r.group))
  const starts = tl.rows.map((r) => r.start).sort(), ends = tl.rows.map((r) => r.end).sort()
  const late = cl.rows.filter((r) => !r.done && r.due && r.due < todayISO()).length
  const empty = !tl.rows.length && !cl.rows.length

  return (
    <div>
      <PageHead id="start" title="Welcome to Plotline"
        lede="Plan work on a timeline, then tick it off on a checklist. Everything is stored in two plain CSV files, and you can change them right here." />

      <section className="panel now" aria-labelledby="now-h">
        <h2 id="now-h">Where things stand</h2>
        {tlErr && <Notice kind="error">Timeline file: {tlErr}</Notice>}
        {clErr && <Notice kind="error">Checklist file: {clErr}</Notice>}
        {!empty && (
          <div className="stats">
            <div>
              <b>{plural(tl.rows.length, 'row')}</b>
              <span>{tl.rows.length ? `on the timeline, in ${plural(groups.size, 'group')}, from ${niceShort(starts[0])} to ${nice(ends[ends.length - 1])}` : 'on the timeline'}</span>
            </div>
            <div>
              <b>{done} of {cl.rows.length}</b>
              <span>checklist items done{late ? `, ${late} overdue` : ''}</span>
              <Meter value={done} total={cl.rows.length} small />
            </div>
          </div>
        )}
        <p className="next"><b>What to do next.</b> {next.text}</p>
        <button className="btn primary" onClick={() => go(next.to)}>{next.label}</button>
      </section>

      <section className="panel" aria-labelledby="steps-h">
        <h2 id="steps-h">Get going in three steps</h2>
        <ol className="steps">
          <li>
            <div><b>Put your plan on the timeline.</b> Add one row for each phase, task and milestone, with dates.</div>
            <button className="btn" onClick={() => go('edit-timeline')}>Edit timeline</button>
          </li>
          <li>
            <div><b>List what has to be checked off.</b> Use the same group names as on the timeline and the two pages will line up.</div>
            <button className="btn" onClick={() => go('edit-checklist')}>Edit checklist</button>
          </li>
          <li>
            <div><b>Follow progress.</b> Look at the chart, tick items as they are finished, and come back to edit whenever the plan changes.</div>
            <span className="row-actions">
              <button className="btn" onClick={() => go('timeline')}>See the timeline</button>
              <button className="btn" onClick={() => go('checklist')}>Open the checklist</button>
            </span>
          </li>
        </ol>
      </section>

      <section className="panel" aria-labelledby="tabs-h">
        <h2 id="tabs-h">What each tab is for</h2>
        <dl className="tabguide">
          <dt>Timeline</dt><dd>A chart of your phases, tasks and milestones. Click any bar to read the details.</dd>
          <dt>Checklist</dt><dd>Tick items off as they are finished. The date is saved for you.</dd>
          <dt>Edit timeline</dt><dd>A table for adding, changing, moving and deleting timeline rows. Nothing changes until you press Save changes.</dd>
          <dt>Edit checklist</dt><dd>The same kind of table for checklist items.</dd>
        </dl>
      </section>

      <section className="panel" aria-labelledby="own-h">
        <h2 id="own-h">Ready to use your own plan?</h2>
        <p>The plan you see now is an example. Clear it to start with empty tables, or bring the example back at any time. Both choices ask you to confirm first and keep a backup copy of your current files.</p>
        <div className="row-actions">
          <button className="btn danger-outline" onClick={() => resetData('blank')}>Clear the example and start empty</button>
          <button className="btn" onClick={() => resetData('example')}>Restore the example plan</button>
        </div>
      </section>

      <section className="panel" aria-labelledby="files-h">
        <h2 id="files-h">Where your data lives</h2>
        <ul className="plainlist">
          <li>Your two files are <code>data/timeline.csv</code> and <code>data/checklist.csv</code>, in the folder you started Plotline from.</li>
          <li>Each time you save in an edit tab, the previous version is copied to <code>data/backups</code>.</li>
          <li>You can also open the files in a spreadsheet app. Switch tabs in Plotline afterwards to see the changes. Dates must be written year-month-day, like 2026-11-02, and spreadsheet apps sometimes change that, so check them if a row goes missing.</li>
        </ul>
        <div className="row-actions">
          <a className="btn" href="/api/download/timeline.csv" download>Download timeline.csv</a>
          <a className="btn" href="/api/download/checklist.csv" download>Download checklist.csv</a>
        </div>
      </section>
    </div>
  )
}
