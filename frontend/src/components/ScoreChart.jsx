import { useState, useRef } from 'react'

export function ScoreChart({ data, tall }) {
  const [idx, setIdx] = useState(null)
  const ref = useRef(null)
  const h = tall ? 'h-44' : 'h-32'
  if (!data || data.length < 2)
    return <div className={`${h} flex items-center text-[12px] text-muted`}>en attente de points…</div>
  const n = data.length
  const scores = data.map((d) => d.score)
  const min = Math.min(...scores, 0), max = Math.max(...scores, 0)
  const span = (max - min) || 1
  const X = (i) => (i / (n - 1)) * 100
  const Yv = (v) => 28 - ((v - min) / span) * 26 + 1
  const pts = data.map((d, i) => `${X(i)},${Yv(d.score)}`).join(' ')
  const area = `0,30 ${pts} 100,30`
  const zeroY = Yv(0)
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect()
    const rel = (e.clientX - r.left) / r.width
    setIdx(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))))
  }
  const hv = idx != null ? data[idx] : null
  const topPct = hv ? (Yv(hv.score) / 30) * 100 : 0
  const below = topPct < 44          // point trop haut → infobulle en dessous
  const leftPct = hv ? Math.min(80, Math.max(20, X(idx))) : 0
  return (
    <div ref={ref} className={`relative ${h} select-none cursor-crosshair rounded-xl bg-ink/50 border border-line/60`}
         onMouseMove={onMove} onMouseLeave={() => setIdx(null)}>
      {/* le clip ne concerne QUE le tracé, pas l'infobulle */}
      <div className="absolute inset-0 rounded-xl overflow-hidden">
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5B8DEF" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#5B8DEF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="#F26D6D" strokeWidth="0.35" strokeDasharray="1.6 1.6" opacity="0.5" />
          <polygon points={area} fill="url(#scoreFill)" />
          <polyline points={pts} fill="none" stroke="#7FB0FF" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="absolute left-2 top-1.5 text-[9.5px] uppercase tracking-wider text-faint">score d'anomalie</div>
      </div>
      {hv && (
        <>
          <div className="absolute top-0 bottom-0 w-px bg-muted/40" style={{ left: `${X(idx)}%` }} />
          <div className={`absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-ink ${hv.flag ? 'bg-alert' : 'bg-sky2'}`}
               style={{ left: `${X(idx)}%`, top: `${topPct}%` }} />
          <div className={`absolute z-30 -translate-x-1/2 pointer-events-none ${below ? '' : '-translate-y-full'}`}
               style={{ left: `${leftPct}%`, top: below ? `calc(${topPct}% + 12px)` : `calc(${topPct}% - 10px)` }}>
            <div className="bg-ink/95 backdrop-blur border border-hair rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-xl">
              <div className="font-mono tnum text-muted/80">{hv.ts}</div>
              <div>score <span className="font-mono tnum text-text">{hv.score}</span>{' '}
                {hv.alive === false ? <span className="text-alert">service KO</span>
                  : hv.flag ? <span className="text-alert">anomalie</span>
                  : <span className="text-money">sain</span>}</div>
              <div className="text-muted">débit <span className="font-mono tnum text-text">{hv.request_rate}</span> · err{' '}
                <span className="font-mono tnum text-text">{(hv.error_ratio * 100).toFixed(1)}%</span> · p95{' '}
                <span className="font-mono tnum text-text">{(hv.p95_latency * 1000).toFixed(0)}ms</span></div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
