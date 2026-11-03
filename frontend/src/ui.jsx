import { useEffect, useRef, useState } from 'react'

// Title, one sentence on what this page is for, and a short "how it works" box.
// The box is open the first time a page is visited, then stays closed until asked for.
export function PageHead({ id, title, lede, children, help }) {
  const key = 'plotline-help-' + id
  const [open, setOpen] = useState(() => { try { return !localStorage.getItem(key) } catch { return true } })
  useEffect(() => { try { localStorage.setItem(key, '1') } catch { /* private mode */ } }, [key])
  return (
    <header className="pagehead">
      <div className="pagehead-main">
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
        {children}
      </div>
      {help && (
        <details className="help" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>How this page works</summary>
          <ul>{help.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </details>
      )}
    </header>
  )
}

export function Meter({ value, total, small }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return <div className={'meter' + (small ? ' sm' : '')} role="img" aria-label={`${pct} percent`}><i style={{ width: pct + '%' }} /></div>
}

export function Notice({ kind = 'info', children, actions, onClose }) {
  return (
    <div className={'notice ' + kind} role={kind === 'error' ? 'alert' : 'status'}>
      <div className="notice-text">{children}</div>
      {actions && <div className="notice-actions">{actions}</div>}
      {onClose && <button className="plain" onClick={onClose} aria-label="Dismiss">Dismiss</button>}
    </div>
  )
}

// A page that has nothing to show yet: say why, and offer the next step.
export function Empty({ title, children, actions }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
      <div className="row-actions">{actions}</div>
    </div>
  )
}

export function Confirm({ opts, onAnswer }) {
  const cancel = useRef(null)
  useEffect(() => {
    cancel.current?.focus()
    const k = (e) => { if (e.key === 'Escape') onAnswer(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onAnswer])
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onAnswer(false) }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">{opts.title}</h2>
        <p>{opts.body}</p>
        <div className="row-actions end">
          <button ref={cancel} className="btn" onClick={() => onAnswer(false)}>{opts.cancelLabel || 'Cancel'}</button>
          <button className={'btn ' + (opts.danger ? 'danger' : 'primary')} onClick={() => onAnswer(true)}>{opts.confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
