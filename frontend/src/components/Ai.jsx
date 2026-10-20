import { Panel, Pill } from './primitives'
import { ScoreChart } from './ScoreChart'
import { DecisionFeed } from './DecisionFeed'
import { signalFmt, FLOOR } from '../lib/format'
import { I } from './icons'

export function Ai({ ml, wide, fill }) {
  if (!ml) return <Panel title="Détecteur d'anomalies (IA)" hint="En attente du service…" icon={I.brain} bar="#A78BFA" fill={fill} collapsible><div className="text-[13px] text-muted">Connexion au détecteur…</div></Panel>

  const phase = ml.status
  const warming = phase === 'warmup'
  const anomaly = ml.flag === 1
  const pct = ml.warmup_target ? Math.min(100, Math.round((ml.samples / ml.warmup_target) * 100)) : 0
  const tone = anomaly ? 'alert' : warming ? 'warn' : undefined
  const phasePill = warming ? <Pill color="warn">Apprentissage</Pill>
    : phase === 'monitoring' ? <Pill color={anomaly ? 'alert' : 'money'}>{anomaly ? 'Anomalie détectée' : 'Surveillance active'}</Pill>
    : <Pill color="muted">{phase}</Pill>

  const left = warming ? (
    <div>
      <div className="flex items-center justify-between text-[12px] text-muted mb-1">
        <span>Apprentissage de la normalité</span>
        <span className="font-mono tnum">{ml.samples}/{ml.warmup_target} observations</span>
      </div>
      <div className="h-2.5 rounded-full bg-ink overflow-hidden border border-line/60">
        <div className="h-full bg-gradient-to-r from-accent to-violet transition-all" style={{ width: pct + '%' }} />
      </div>
      <p className="text-[12px] text-muted mt-2">
        ~{Math.max(0, (ml.warmup_target - ml.samples) * (ml.poll_interval || 10))} s restantes au rythme actuel.
      </p>
    </div>
  ) : (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-[12px] text-muted mb-1.5">
          <span>Score d'anomalie <span className="text-faint">(sous 0 = anormal)</span></span>
          <span className="font-mono tnum text-text">{ml.score ?? '—'}</span>
        </div>
        <ScoreChart data={ml.history} tall={wide} />
      </div>
      <div className="space-y-2">
        {Object.keys(signalFmt).map((k) => {
          const cur = ml.features?.[k] ?? 0
          const base = ml.baseline?.[k]
          const ratio = base && base > FLOOR[k] ? cur / base : null
          const hot = ratio !== null && ratio >= 1.5
          const f = signalFmt[k]
          return (
            <div key={k} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${hot ? 'bg-alert/10 border-alert/40' : 'bg-raised/60 border-line'}`}>
              <span className="text-[13px] text-muted">{f.label}</span>
              <span className="flex items-center gap-3">
                <span className="text-[12px] text-faint">normal <span className="font-mono tnum">{base != null ? f.f(base) : '—'}</span></span>
                <span className="font-mono tnum text-[14px] text-text">{f.f(cur)}</span>
                {hot && <Pill color="alert">×{ratio.toFixed(1)}</Pill>}
              </span>
            </div>
          )
        })}
      </div>
      {anomaly && (
        <div className="rounded-lg bg-alert/10 border border-alert/40 px-3 py-2.5">
          <div className="text-[13px] text-alert font-medium">Comportement suspect</div>
          <div className="text-[13px] text-text mt-0.5">{ml.explanation}</div>
          <div className="text-[12px] text-muted mt-1">
            Cycles consécutifs : <span className="font-mono tnum">{ml.consecutive}/{ml.persist_target}</span> — au seuil, la reprise se déclenche.
          </div>
        </div>
      )}
    </div>
  )

  return (
    <Panel
      title={<span className="flex items-center gap-2">Détecteur d'anomalies (IA) {phasePill}</span>}
      hint="Isolation Forest sur le trafic de l'API de paiement."
      icon={I.brain} bar={anomaly ? '#F26D6D' : '#A78BFA'} tone={tone}
      extra={anomaly ? 'anim-glow' : ''} fill={fill} collapsible
    >
      {ml.reasoning && <p className="text-[13px] text-text/80 italic mb-4 border-l-2 border-violet/40 pl-3">« {ml.reasoning} »</p>}
      {wide ? (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <div>{left}</div>
          <div className="lg:border-l lg:border-line/60 lg:pl-5">
            <div className="text-[11.5px] uppercase tracking-wider text-faint mb-2">Fil de décision de l'IA</div>
            <DecisionFeed items={ml.decisions} bare />
          </div>
        </div>
      ) : (
        <>
          {left}
          <DecisionFeed items={ml.decisions} />
        </>
      )}
    </Panel>
  )
}
