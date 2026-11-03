import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ctx } from './ctx.js'
import { api } from './api.js'
import { forEditor, sameRows, timelineView, checklistView } from './schema.js'
import { Confirm, Notice } from './ui.jsx'
import Start from './Start.jsx'
import Timeline from './Timeline.jsx'
import Checklist from './Checklist.jsx'
import Editor from './Editor.jsx'

export const TABS = [
  { id: 'start', label: 'Start here' },
  { id: 'timeline', label: 'Timeline', group: 'See your plan' },
  { id: 'checklist', label: 'Checklist', group: 'See your plan' },
  { id: 'edit-timeline', label: 'Edit timeline', group: 'Change your data', kind: 'timeline' },
  { id: 'edit-checklist', label: 'Edit checklist', group: 'Change your data', kind: 'checklist' },
]
const fromHash = () => { const h = location.hash.slice(1); return TABS.some((t) => t.id === h) ? h : 'start' }

export default function App() {
  const [tab, setTab] = useState(fromHash)
  const [data, setData] = useState({ timeline: null, checklist: null })
  const [serverDown, setServerDown] = useState('')
  const [drafts, setDrafts] = useState({ timeline: null, checklist: null })
  const [focus, setFocus] = useState(null)
  const [notice, setNotice] = useState(null)
  const [dlg, setDlg] = useState(null)
  const resolver = useRef(null)

  const reload = useCallback(async () => {
    const [t, c] = await Promise.allSettled([api.get('timeline'), api.get('checklist')])
    const down = [t, c].find((r) => r.status === 'rejected' && r.reason.network)
    setServerDown(down ? down.reason.message : '')
    const pack = (r) => (r.status === 'fulfilled' ? r.value : { error: r.reason.message, rows: [], ignored: [] })
    setData((old) => ({ timeline: down ? old.timeline : pack(t), checklist: down ? old.checklist : pack(c) }))
  }, [])

  useEffect(() => { reload() }, [tab, reload])
  useEffect(() => { document.title = `${TABS.find((t) => t.id === tab).label} - Plotline` }, [tab])
  useEffect(() => {
    const h = () => setTab(fromHash())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  const go = useCallback((id, opts = {}) => {
    setNotice(null)
    setFocus(opts.focus ? { kind: TABS.find((t) => t.id === id)?.kind, idx: opts.focus.idx } : null)
    history.replaceState(null, '', '#' + id)
    setTab(id)
    window.scrollTo({ top: 0 })
  }, [])

  const base = useMemo(() => ({
    timeline: data.timeline ? forEditor('timeline', data.timeline.rows) : [],
    checklist: data.checklist ? forEditor('checklist', data.checklist.rows) : [],
  }), [data])

  const dirty = useMemo(() => ({
    timeline: !!drafts.timeline && !sameRows('timeline', drafts.timeline, base.timeline),
    checklist: !!drafts.checklist && !sameRows('checklist', drafts.checklist, base.checklist),
  }), [drafts, base])

  useEffect(() => {
    if (!dirty.timeline && !dirty.checklist) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const views = useMemo(() => ({
    timeline: data.timeline ? timelineView(data.timeline.rows) : null,
    checklist: data.checklist ? checklistView(data.checklist.rows) : null,
  }), [data])

  const setDraft = useCallback((kind, rows) => setDrafts((d) => ({ ...d, [kind]: rows })), [])

  const confirm = useCallback((opts) => new Promise((resolve) => { resolver.current = resolve; setDlg(opts) }), [])
  const answer = useCallback((ok) => { setDlg(null); resolver.current?.(ok) }, [])

  // Replace both files with the example plan or with empty files. Always asks first.
  const resetData = useCallback(async (mode) => {
    const example = mode === 'example'
    const ok = await confirm({
      title: example ? 'Replace your plan with the example?' : 'Clear everything and start empty?',
      body: (example
        ? 'Your timeline and checklist will be replaced by a small example project you can learn from.'
        : 'Your timeline and checklist will be emptied so you can enter your own plan.')
        + ' A copy of your current files is kept in the data/backups folder, so you can get them back.'
        + (dirty.timeline || dirty.checklist ? ' Unsaved changes in the edit tabs will be lost.' : ''),
      confirmLabel: example ? 'Replace with example' : 'Clear and start empty',
      danger: true,
    })
    if (!ok) return false
    try {
      await api.reset(mode)
      setDrafts({ timeline: null, checklist: null })
      await reload()
      setNotice({ kind: 'ok', text: example ? 'Done. The example plan is loaded. Your previous files are in data/backups.' : 'Done. Your plan is now empty. Your previous files are in data/backups.' })
      return true
    } catch (e) {
      setNotice({ kind: 'error', text: e.message })
      return false
    }
  }, [confirm, dirty, reload])

  const ctx = { tab, go, data, views, base, drafts, setDraft, dirty, reload, focus, setFocus, confirm, resetData, setNotice }
  const loading = !data.timeline || !data.checklist
  const unsaved = TABS.filter((t) => t.kind && dirty[t.kind])
  const onEdit = tab.startsWith('edit-')

  return (
    <Ctx.Provider value={ctx}>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
      <div className="topbar">
        <button className="brand" onClick={() => go('start')} aria-label="Plotline, go to Start here">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#16202e" /><rect x="6" y="9" width="13" height="4" rx="2" fill="#38bdf8" /><rect x="11" y="15" width="15" height="4" rx="2" fill="#fbbf24" /><rect x="8" y="21" width="10" height="4" rx="2" fill="#4ade80" /></svg>
          Plotline
        </button>
        <nav aria-label="Main">
          {TABS.map((t, i) => (
            <span className="navitem" key={t.id}>
              {t.group && t.group !== TABS[i - 1]?.group && <span className="navgroup">{t.group}</span>}
              <button className={'tab' + (tab === t.id ? ' on' : '') + (t.kind ? ' edit' : '')} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                {t.label}{t.kind && dirty[t.kind] && <i className="dirtydot" title="Unsaved changes" aria-label="(unsaved changes)" />}
              </button>
            </span>
          ))}
        </nav>
      </div>

      <main id="main" tabIndex={-1} className="page">
        {serverDown && <Notice kind="error" actions={<button className="btn" onClick={reload}>Try again</button>}>{serverDown}</Notice>}
        {notice && <Notice kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        {!onEdit && unsaved.length > 0 && (
          <Notice kind="warn" actions={unsaved.map((t) => <button key={t.id} className="btn" onClick={() => go(t.id)}>Go to {t.label.toLowerCase()}</button>)}>
            You have unsaved changes in {unsaved.map((t) => t.label.toLowerCase()).join(' and ')}. This page shows the last saved version until you save them.
          </Notice>
        )}
        {loading && !serverDown ? <div className="loading">Loading your plan…</div> : loading ? null : (
          tab === 'start' ? <Start />
            : tab === 'timeline' ? <Timeline />
              : tab === 'checklist' ? <Checklist />
                : tab === 'edit-timeline' ? <Editor key="timeline" kind="timeline" />
                  : <Editor key="checklist" kind="checklist" />
        )}
      </main>
      {dlg && <Confirm opts={dlg} onAnswer={answer} />}
    </Ctx.Provider>
  )
}
