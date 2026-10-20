import { useState } from 'react'
import { SVC } from '../data/services'

export function ServicesMenu({ items }) {
  const [open, setOpen] = useState(false)
  const total = items.length
  const up = items.filter((c) => c.status === 'running').length
  const allUp = total > 0 && up === total
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] bg-raised/70 border border-line hover:border-accent">
        <span className={`w-2 h-2 rounded-full ${allUp ? 'bg-money shadow-[0_0_7px_rgba(53,214,164,.7)]' : 'bg-warn'}`} />
        Services <span className="font-mono tnum text-muted">{total ? `${up}/${total}` : '—'}</span>
        <span className="text-muted text-[10px]">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 z-50 rounded-xl border border-hair glass shadow-2xl p-2 max-h-[72vh] overflow-auto anim-fadeup">
            <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-faint">Conteneurs de la stack ({up}/{total} actifs)</div>
            {items.length === 0 && <div className="px-2 py-2 text-[13px] text-muted">Chargement…</div>}
            {items.map((c) => {
              const m = SVC[c.name] || { label: c.name.replace('rsa-', ''), desc: '', icon: '📦' }
              const run = c.status === 'running'
              return (
                <div key={c.name} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-raised/70">
                  <span className="text-[16px] leading-none">{m.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-text flex items-center gap-2">
                      {m.label}<span className={`w-2 h-2 rounded-full ${run ? 'bg-money' : 'bg-alert'}`} />
                    </div>
                    {m.desc && <div className="text-[11px] text-muted truncate">{m.desc}</div>}
                  </div>
                  <span className={`text-[11px] ${run ? 'text-money' : 'text-alert'}`}>{c.status}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
