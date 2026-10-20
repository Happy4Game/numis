import { Panel } from './primitives'
import { SVC } from '../data/services'
import { I } from './icons'

export function Containers({ items, fill }) {
  if (!items || items.length === 0)
    return <Panel title="État des conteneurs (watchdog)" hint="Surveillance de vie de toute la stack." icon={I.grid} bar="#F2B64B" fill={fill} collapsible><div className="text-[13px] text-muted">Chargement…</div></Panel>
  const up = items.filter((c) => c.status === 'running').length
  return (
    <Panel title="État des conteneurs (watchdog)"
           hint="Surveillance de vie de toute la stack — réparation automatique en cas de panne."
           icon={I.grid} bar="#F2B64B" tone={up < items.length ? 'warn' : undefined} fill={fill} collapsible>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {items.map((c) => {
          const run = c.status === 'running'
          const m = SVC[c.name] || { label: c.name.replace('rsa-', ''), icon: '📦' }
          return (
            <div key={c.name}
                 className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] anim-fadeup ${run ? 'border-line bg-raised/50' : 'border-alert/50 bg-alert/10'}`}>
              <span className="text-[15px] leading-none">{m.icon}</span>
              <span className="truncate flex-1">{m.label}</span>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${run ? 'bg-money shadow-[0_0_7px_rgba(53,214,164,.7)]' : 'bg-alert'}`} />
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
