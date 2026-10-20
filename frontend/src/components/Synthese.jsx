import { Panel, Pill } from './primitives'
import { ScoreChart } from './ScoreChart'
import { I } from './icons'

export function Synthese({ ml, actions, containers, health, go, fill }) {
  const anomaly = ml?.flag === 1
  const phase = ml?.status === 'warmup' ? 'Apprentissage' : ml?.status === 'monitoring' ? (anomaly ? 'Anomalie' : 'Surveillance') : '—'
  const up = containers.filter((c) => c.status === 'running').length
  const last = actions[0]
  const NavBtn = ({ side, label, onClick }) => (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-[12px] text-sky2 hover:text-text px-2 py-1 rounded-lg hover:bg-raised/70">
      {side === 'left' && <span>‹</span>}{label}{side === 'right' && <span>›</span>}
    </button>
  )
  return (
    <Panel title="Supervision — synthèse" hint="L'essentiel ; le détail est sur les pages latérales." icon={I.eye} bar="#35D6A4" fill={fill} collapsible>
      <div className="space-y-3">
        <div className="rounded-xl bg-raised/60 border border-line px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] text-text">{I.brain} Détecteur IA</span>
            <Pill color={anomaly ? 'alert' : ml ? 'money' : 'muted'}>{phase}</Pill>
          </div>
          <div className="mt-2"><ScoreChart data={ml?.history} /></div>
          <div className="flex items-center justify-between mt-2 text-[12px] text-muted">
            <span>score <span className="font-mono tnum text-text">{ml?.score ?? '—'}</span></span>
            <NavBtn side="left" label="Détection & reprise" onClick={() => go(0)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-raised/60 border border-line px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-text">{I.wrench} Reprise</div>
            <div className="mt-1.5 text-[22px] font-semibold font-mono tnum text-text leading-none">{actions.length}</div>
            <div className="text-[11.5px] text-muted mt-1 truncate">{last ? `${last.action} → ${last.target?.replace('rsa-', '')}` : 'aucune action'}</div>
          </div>
          <div className="rounded-xl bg-raised/60 border border-line px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-text">{I.grid} Conteneurs</div>
            <div className={`mt-1.5 text-[22px] font-semibold font-mono tnum leading-none ${up < containers.length ? 'text-warn' : 'text-money'}`}>{containers.length ? `${up}/${containers.length}` : '—'}</div>
            <div className="text-[11.5px] text-muted mt-1">actifs (watchdog)</div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <NavBtn side="right" label="Conteneurs (watchdog)" onClick={() => go(2)} />
          <a href={`http://${location.hostname}:3000`} target="_blank" rel="noreferrer"
             className="text-[12px] text-sky2 hover:text-text px-2 py-1 rounded-lg hover:bg-raised/70">Grafana ↗</a>
        </div>
      </div>
    </Panel>
  )
}
