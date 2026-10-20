import { useState, useEffect } from 'react'

export function Panel({ title, hint, icon, bar, children, tone, extra, collapsible, fill }) {
  const [open, setOpen] = useState(true)
  const shown = !collapsible || open
  const ring = tone === 'alert' ? 'ring-1 ring-alert/60' : tone === 'warn' ? 'ring-1 ring-warn/50' : ''
  return (
    <section
      style={{ '--bar': bar || '#5B8DEF' }}
      className={`relative rounded-2xl glass accent-top card-hover overflow-hidden ${ring} ${extra || ''} ${fill && shown ? 'flex flex-col min-h-0 h-full' : ''}`}>
      <header className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-line/60 shrink-0">
        {icon && <span className="badge shrink-0 mt-0.5">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-text leading-tight">{title}</h2>
          {hint && <p className="text-[12.5px] text-muted mt-0.5 leading-snug">{hint}</p>}
        </div>
        {collapsible && (
          <button onClick={() => setOpen((o) => !o)} title={open ? 'Replier' : 'Déplier'}
            className="shrink-0 w-7 h-7 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-raised/70">
            <span className={`text-[11px] transition-transform ${open ? '' : '-rotate-90'}`}>▼</span>
          </button>
        )}
      </header>
      {shown && <div className={`p-5 ${fill ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>{children}</div>}
    </section>
  )
}
export function Dot({ ok }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-money shadow-[0_0_8px_rgba(53,214,164,.7)]' : 'bg-alert shadow-[0_0_8px_rgba(242,109,109,.7)]'}`} />
}
export function Pill({ children, color }) {
  const c = { money: 'bg-money/15 text-money ring-1 ring-money/25', warn: 'bg-warn/15 text-warn ring-1 ring-warn/25',
              alert: 'bg-alert/15 text-alert ring-1 ring-alert/25', accent: 'bg-accent/15 text-sky2 ring-1 ring-accent/25',
              violet: 'bg-violet/15 text-violet ring-1 ring-violet/25', muted: 'bg-line/60 text-muted ring-1 ring-line' }[color] || 'bg-line/60 text-muted'
  return <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-medium ${c}`}>{children}</span>
}

export function Stat({ label, value, sub, bar, delay }) {
  return (
    <div style={{ '--bar': bar || '#5B8DEF' }}
         className={`kpi rounded-xl pl-4 pr-4 py-3 anim-fadeup ${delay || ''}`}>
      <div className="text-[10px] uppercase tracking-[.14em] text-faint font-medium">{label}</div>
      <div className="mt-1 text-[22px] font-semibold font-mono tnum text-text leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-muted leading-tight">{sub}</div>}
    </div>
  )
}

export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const t = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const d = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: 'short' })
  return (
    <div className="hidden lg:block text-right leading-tight">
      <div className="font-mono tnum text-[15px] text-text">{t}</div>
      <div className="text-[10.5px] text-faint capitalize">{d} · Paris</div>
    </div>
  )
}
