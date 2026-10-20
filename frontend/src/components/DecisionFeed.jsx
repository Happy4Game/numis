export const KIND = {
  anomaly:   { c: 'text-alert',  b: 'bg-alert'  },
  decision:  { c: 'text-sky2',   b: 'bg-accent' },
  action:    { c: 'text-sky2',   b: 'bg-accent' },
  recovered: { c: 'text-money',  b: 'bg-money'  },
  error:     { c: 'text-alert',  b: 'bg-alert'  },
  info:      { c: 'text-muted',  b: 'bg-muted'  },
}
export function DecisionFeed({ items, bare }) {
  if (!items || items.length === 0)
    return bare ? <p className="text-[12px] text-muted">Aucune décision pour l'instant.</p> : null
  const body = (
    <ul className="space-y-1.5">
      {items.map((d, i) => {
        const k = KIND[d.kind] || KIND.info
        return (
          <li key={i} className="flex gap-2 text-[12px] leading-snug anim-slidein">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${k.b}`} />
            <span className="font-mono tnum text-muted/70 shrink-0">{d.ts}</span>
            <span className={k.c}>{d.text}</span>
          </li>
        )
      })}
    </ul>
  )
  if (bare) return body
  return (
    <div className="mt-4 pt-3 border-t border-line/60">
      <div className="text-[11.5px] uppercase tracking-wider text-faint mb-2">Fil de décision de l'IA</div>
      {body}
    </div>
  )
}
