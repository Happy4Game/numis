import { Panel, Pill } from './primitives'
import { I } from './icons'

export function Remediation({ actions, fill }) {
  return (
    <Panel title="Reprise autonome" hint="Actions décidées et vérifiées sans intervention humaine." icon={I.wrench} bar="#5B8DEF" fill={fill} collapsible>
      {actions.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-muted py-2">
          <span className="w-2 h-2 rounded-full bg-money" /> Aucune action — le système est sain.
        </div>
      ) : (
        <ol className="space-y-3">
          {actions.map((a, i) => (
            <li key={i} className="rounded-lg bg-raised/60 border border-line px-3 py-2.5 anim-slidein">
              <div className="flex items-center justify-between">
                <span className="font-mono tnum text-[12px] text-faint">{a.ts?.slice(11, 19)}</span>
                <Pill color={a.result === 'success' ? 'money' : 'warn'}>
                  {a.result === 'success' ? (a.recovery_seconds != null ? `rétabli en ${a.recovery_seconds}s` : 'rétabli') : a.result}
                </Pill>
              </div>
              <div className="text-[13px] mt-1">
                <span className="text-sky2 font-medium">{a.action}</span> → <span className="text-text">{a.target}</span>
              </div>
              {a.reason && <div className="text-[12px] text-muted mt-0.5">{a.reason}</div>}
              {a.steps && a.steps.length > 0 && (
                <ol className="mt-2 space-y-1 border-l border-line/70 pl-3">
                  {a.steps.map((st, j) => (<li key={j} className="text-[12px] text-muted/90">{st}</li>))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
