import React, { useEffect, useState, useCallback, useRef } from 'react'

/* ---------- accès API (via le reverse-proxy du frontend) ---------- */
async function api(path, opts) {
  const r = await fetch(path, opts)
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.status === 204 ? null : r.json()
}
const authHeader = (t) => ({ Authorization: `Bearer ${t}` })

/* ---------- formatage ---------- */
const euro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const FLOOR = { request_rate: 0.5, error_ratio: 0.01, p95_latency: 0.005 }
const signalFmt = {
  request_rate: { label: 'Débit', unit: 'req/s', f: (v) => v.toFixed(1) },
  error_ratio:  { label: "Taux d'erreur", unit: '', f: (v) => (v * 100).toFixed(1) + ' %' },
  p95_latency:  { label: 'Latence p95', unit: '', f: (v) => (v * 1000).toFixed(0) + ' ms' },
}

/* ---------- icônes (SVG, sobres) ---------- */
const I = {
  card:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="#7FB0FF" strokeWidth="1.6"/><path d="M2.5 9.5h19" stroke="#7FB0FF" strokeWidth="1.6"/></svg>,
  brain: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 18a2.5 2.5 0 0 0 5 .3V5.5A2.5 2.5 0 0 0 9 4Z" stroke="#A78BFA" strokeWidth="1.5"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 18a2.5 2.5 0 0 1-5 .3" stroke="#7FB0FF" strokeWidth="1.5"/></svg>,
  shield:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 2.5V11c0 4.5-3 7.8-7 9.5C8 18.8 5 15.5 5 11V5.5L12 3Z" stroke="#35D6A4" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9 11.5l2 2 4-4.5" stroke="#35D6A4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  wrench:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14.5 6.5a3.8 3.8 0 0 1-4.9 4.6L5 15.7 8.3 19l4.6-4.6a3.8 3.8 0 0 0 4.6-4.9l-2.3 2.3-2.1-.6-.6-2.1 2-1.6Z" stroke="#5B8DEF" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  grid:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="#F2B64B" strokeWidth="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="#F2B64B" strokeWidth="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="#F2B64B" strokeWidth="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="#F2B64B" strokeWidth="1.5"/></svg>,
}

/* ---------- briques UI ---------- */
function Panel({ title, hint, icon, bar, children, tone, extra }) {
  const ring = tone === 'alert' ? 'ring-1 ring-alert/60' : tone === 'warn' ? 'ring-1 ring-warn/50' : ''
  return (
    <section
      style={{ '--bar': bar || '#5B8DEF' }}
      className={`relative rounded-2xl glass accent-top card-hover overflow-hidden ${ring} ${extra || ''}`}>
      <header className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-line/60">
        {icon && <span className="badge shrink-0 mt-0.5">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-text leading-tight">{title}</h2>
          {hint && <p className="text-[12.5px] text-muted mt-0.5 leading-snug">{hint}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}
function Dot({ ok }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-money shadow-[0_0_8px_rgba(53,214,164,.7)]' : 'bg-alert shadow-[0_0_8px_rgba(242,109,109,.7)]'}`} />
}
function Pill({ children, color }) {
  const c = { money: 'bg-money/15 text-money ring-1 ring-money/25', warn: 'bg-warn/15 text-warn ring-1 ring-warn/25',
              alert: 'bg-alert/15 text-alert ring-1 ring-alert/25', accent: 'bg-accent/15 text-sky2 ring-1 ring-accent/25',
              violet: 'bg-violet/15 text-violet ring-1 ring-violet/25', muted: 'bg-line/60 text-muted ring-1 ring-line' }[color] || 'bg-line/60 text-muted'
  return <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-medium ${c}`}>{children}</span>
}

/* ---------- tuile KPI ---------- */
function Stat({ label, value, sub, bar, delay }) {
  return (
    <div style={{ '--bar': bar || '#5B8DEF' }}
         className={`kpi rounded-xl pl-4 pr-4 py-3.5 anim-fadeup ${delay || ''}`}>
      <div className="text-[10.5px] uppercase tracking-[.14em] text-faint font-medium">{label}</div>
      <div className="mt-1 text-[24px] font-semibold font-mono tnum text-text leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] text-muted leading-tight">{sub}</div>}
    </div>
  )
}

/* ---------- horloge (Europe/Paris) ---------- */
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const t = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const d = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: 'short' })
  return (
    <div className="hidden sm:block text-right leading-tight">
      <div className="font-mono tnum text-[15px] text-text">{t}</div>
      <div className="text-[10.5px] text-faint capitalize">{d} · Paris</div>
    </div>
  )
}

/* ---------- courbe du score (interactive) ---------- */
function ScoreChart({ data }) {
  const [idx, setIdx] = useState(null)
  const ref = useRef(null)
  if (!data || data.length < 2)
    return <div className="h-32 flex items-center text-[12px] text-muted">en attente de points…</div>
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
  return (
    <div ref={ref} className="relative h-32 select-none cursor-crosshair rounded-xl bg-ink/50 border border-line/60 overflow-hidden"
         onMouseMove={onMove} onMouseLeave={() => setIdx(null)}>
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
      {hv && (
        <>
          <div className="absolute top-0 bottom-0 w-px bg-muted/40" style={{ left: `${X(idx)}%` }} />
          <div className={`absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-ink ${hv.flag ? 'bg-alert' : 'bg-sky2'}`}
               style={{ left: `${X(idx)}%`, top: `${(Yv(hv.score) / 30) * 100}%` }} />
          <div className="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none"
               style={{ left: `${Math.min(84, Math.max(16, X(idx)))}%`, top: `${(Yv(hv.score) / 30) * 100}%` }}>
            <div className="mb-2 bg-ink/95 backdrop-blur border border-hair rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-xl">
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

/* ---------- panneau PAIEMENT ---------- */
function Payment({ token, accounts, txs, onTransfer, offline, busy }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('25')

  useEffect(() => {
    if (accounts.length >= 2 && !from) { setFrom(String(accounts[0].id)); setTo(String(accounts[1].id)) }
  }, [accounts])

  if (offline) {
    return (
      <Panel title="Numis — paiements" hint="Virements entre comptes de démonstration." icon={I.card} bar="#7FB0FF">
        <div className="text-[13px] text-muted">
          Service de paiement injoignable. Vérifiez que la plateforme est démarrée
          (<span className="font-mono text-text">make up</span>), puis rechargez la page.
        </div>
      </Panel>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    if (from === to) return
    onTransfer({ from_account: +from, to_account: +to, amount: +amount })
  }

  return (
    <Panel title="Numis — paiements" hint="Virements entre vos comptes de démonstration." icon={I.card} bar="#7FB0FF">
      {/* comptes */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {accounts.map((a) => (
          <div key={a.id} className="relative rounded-xl bg-raised/70 border border-line px-4 py-3.5 overflow-hidden">
            <div className="absolute right-3 top-3 opacity-20">{I.card}</div>
            <div className="text-[12px] text-muted">{a.label}</div>
            <div key={a.balance} className="text-[23px] font-semibold font-mono tnum text-money mt-1 anim-pop">{euro(a.balance)}</div>
          </div>
        ))}
        {accounts.length === 0 && <div className="col-span-2 text-[13px] text-muted">Chargement des comptes…</div>}
      </div>

      {/* formulaire de virement */}
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11.5px] uppercase tracking-wider text-faint">Depuis</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-lg bg-ink border border-line px-3 py-2 text-[14px] focus:border-accent outline-none">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11.5px] uppercase tracking-wider text-faint">Vers</span>
            <select value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg bg-ink border border-line px-3 py-2 text-[14px] focus:border-accent outline-none">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-[11.5px] uppercase tracking-wider text-faint">Montant</span>
          <div className="relative mt-1">
            <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg bg-ink border border-line pl-3 pr-9 py-2 text-[14px] font-mono tnum focus:border-accent outline-none" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[14px]">€</span>
          </div>
        </label>
        {from === to && <p className="text-[12px] text-warn">Choisissez deux comptes différents.</p>}
        <button type="submit" disabled={busy || from === to}
          className="w-full rounded-lg bg-gradient-to-r from-accent to-sky2 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-ink font-semibold px-3 py-2.5 text-[14px] shadow-glow">
          {busy ? 'Envoi…' : 'Envoyer le paiement'}
        </button>
      </form>

      {/* journal */}
      <div className="mt-5">
        <div className="text-[11.5px] uppercase tracking-wider text-faint mb-2">Derniers mouvements</div>
        {txs.length === 0 ? (
          <p className="text-[13px] text-muted">Aucun mouvement pour l'instant. Envoyez un premier paiement.</p>
        ) : (
          <ul className="divide-y divide-line/50">
            {txs.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-muted font-mono tnum">#{t.id} · {t.from}→{t.to}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tnum">{euro(t.amount)}</span>
                  <Pill color={t.status === 'completed' ? 'money' : 'alert'}>{t.status === 'completed' ? 'réglé' : 'échoué'}</Pill>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

/* ---------- fil de décision ---------- */
const KIND = {
  anomaly:   { c: 'text-alert',  b: 'bg-alert'  },
  decision:  { c: 'text-sky2',   b: 'bg-accent' },
  action:    { c: 'text-sky2',   b: 'bg-accent' },
  recovered: { c: 'text-money',  b: 'bg-money'  },
  error:     { c: 'text-alert',  b: 'bg-alert'  },
  info:      { c: 'text-muted',  b: 'bg-muted'  },
}

function DecisionFeed({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="mt-4 pt-3 border-t border-line/60">
      <div className="text-[11.5px] uppercase tracking-wider text-faint mb-2">Fil de décision de l'IA</div>
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
    </div>
  )
}

/* ---------- panneau IA ---------- */
function Ai({ ml }) {
  if (!ml) return <Panel title="Détecteur d'anomalies (IA)" hint="En attente du service…" icon={I.brain} bar="#A78BFA"><div className="text-[13px] text-muted">Connexion au détecteur…</div></Panel>

  const phase = ml.status
  const warming = phase === 'warmup'
  const anomaly = ml.flag === 1
  const pct = ml.warmup_target ? Math.min(100, Math.round((ml.samples / ml.warmup_target) * 100)) : 0
  const tone = anomaly ? 'alert' : warming ? 'warn' : undefined
  const phasePill = warming ? <Pill color="warn">Apprentissage</Pill>
    : phase === 'monitoring' ? <Pill color={anomaly ? 'alert' : 'money'}>{anomaly ? 'Anomalie détectée' : 'Surveillance active'}</Pill>
    : <Pill color="muted">{phase}</Pill>

  return (
    <Panel
      title={<span className="flex items-center gap-2">Détecteur d'anomalies (IA) {phasePill}</span>}
      hint="Isolation Forest sur le trafic de l'API de paiement."
      icon={I.brain} bar={anomaly ? '#F26D6D' : '#A78BFA'}
      tone={tone}
      extra={anomaly ? 'anim-glow' : ''}
    >
      {ml.reasoning && <p className="text-[13px] text-text/80 italic mb-4 border-l-2 border-violet/40 pl-3">« {ml.reasoning} »</p>}

      {warming ? (
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
            <ScoreChart data={ml.history} />
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
      )}

      <DecisionFeed items={ml.decisions} />
    </Panel>
  )
}

/* ---------- panneau REPRISE ---------- */
function Remediation({ actions }) {
  return (
    <Panel title="Reprise autonome" hint="Actions décidées et vérifiées sans intervention humaine." icon={I.wrench} bar="#5B8DEF">
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
                  {a.steps.map((st, j) => (
                    <li key={j} className="text-[12px] text-muted/90">{st}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

/* ---------- état des conteneurs ---------- */
function Containers({ items }) {
  if (!items || items.length === 0) return null
  const up = items.filter((c) => c.status === 'running').length
  return (
    <Panel title="État des conteneurs (watchdog)"
           hint="Surveillance de vie de toute la stack — réparation automatique en cas de panne."
           icon={I.grid} bar="#F2B64B"
           tone={up < items.length ? 'warn' : undefined}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
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

/* ---------- menu des services (tous les conteneurs) ---------- */
const SVC = {
  'rsa-db':           { label: 'Base de données',   desc: 'PostgreSQL — comptes & transactions', icon: '🗄️' },
  'rsa-auth':         { label: 'Authentification',  desc: 'Émission des jetons JWT',              icon: '🔑' },
  'rsa-payment-api':  { label: 'API de paiement',   desc: 'Traitement des transactions',         icon: '💳' },
  'rsa-waf':          { label: 'WAF',               desc: 'Pare-feu applicatif (ModSecurity)',    icon: '🛡️' },
  'rsa-prometheus':   { label: 'Prometheus',        desc: 'Collecte des métriques',               icon: '📈' },
  'rsa-alertmanager': { label: 'Alertmanager',      desc: 'Alertes SOC',                          icon: '🚨' },
  'rsa-loki':         { label: 'Loki',              desc: 'Centralisation des logs',              icon: '📚' },
  'rsa-promtail':     { label: 'Promtail',          desc: 'Collecte des journaux',                icon: '🪵' },
  'rsa-grafana':      { label: 'Grafana',           desc: 'Dashboards & visualisation',           icon: '📊' },
  'rsa-ml-detector':  { label: 'Détecteur IA',      desc: "Détection d'anomalies (ML)",           icon: '🧠' },
  'rsa-remediation':  { label: 'Moteur de reprise', desc: 'Remédiation + watchdog',               icon: '🔧' },
  'rsa-ollama':       { label: 'Ollama',            desc: 'LLM local (assistant)',                icon: '🤖' },
  'rsa-rag':          { label: 'Assistant RAG',     desc: 'Réponses sur vos documents',           icon: '💬' },
  'rsa-frontend':     { label: 'Dashboard',         desc: 'Cette interface',                      icon: '🖥️' },
}

function ServicesMenu({ items }) {
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
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 z-20 rounded-xl border border-hair glass shadow-2xl p-2 max-h-[72vh] overflow-auto anim-fadeup">
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
                      {m.label}
                      <span className={`w-2 h-2 rounded-full ${run ? 'bg-money' : 'bg-alert'}`} />
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

/* ---------- application ---------- */
export default function App() {
  const [token, setToken] = useState(null)
  const [offline, setOffline] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [txs, setTxs] = useState([])
  const [ml, setMl] = useState(null)
  const [actions, setActions] = useState([])
  const [containers, setContainers] = useState([])
  const [health, setHealth] = useState({ ml: false, rem: false, pay: false })
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)
  const flash = useRef(false)

  // connexion auto (démo)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      while (!cancelled) {
        try {
          const { access_token } = await api('/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'demo', password: 'demo1234' }),
          })
          if (!cancelled) { setToken(access_token); setOffline(false) }
          return
        } catch {
          setOffline(true)
          await new Promise((r) => setTimeout(r, 3000))   // le backend démarre peut-être encore
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const loadPayment = useCallback(async (t) => {
    try {
      const [a, x] = await Promise.all([
        api('/api/payment/accounts', { headers: authHeader(t) }),
        api('/api/payment/transactions?limit=10', { headers: authHeader(t) }),
      ])
      setAccounts(a); setTxs(x); setHealth((h) => ({ ...h, pay: true }))
    } catch { setHealth((h) => ({ ...h, pay: false })) }
  }, [])

  // supervision (IA + reprise + santé) toutes les 2s
  useEffect(() => {
    const poll = async () => {
      const [s, acts, mh, rh, cont] = await Promise.allSettled([
        api('/api/ml/state'), api('/api/remediation/actions'),
        api('/api/ml/health'), api('/api/remediation/health'),
        api('/api/remediation/containers'),
      ])
      if (s.status === 'fulfilled') setMl(s.value)
      if (acts.status === 'fulfilled') setActions(acts.value)
      if (cont.status === 'fulfilled') setContainers(cont.value)
      setHealth((h) => ({ ...h, ml: mh.status === 'fulfilled', rem: rh.status === 'fulfilled' }))
    }
    poll(); const id = setInterval(poll, 2000); return () => clearInterval(id)
  }, [])

  // paiement : après login puis toutes les 3s
  useEffect(() => {
    if (!token) return
    loadPayment(token); const id = setInterval(() => loadPayment(token), 3000); return () => clearInterval(id)
  }, [token, loadPayment])

  const onTransfer = async (body) => {
    setBusy(true)
    try {
      const res = await api('/api/payment/transactions', {
        method: 'POST', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setToast({ ok: true, msg: `Paiement #${res.transaction_id} réglé` })
      flash.current = true
      await loadPayment(token)
    } catch (e) {
      setToast({ ok: false, msg: `Paiement refusé (${String(e).includes('400') ? 'solde insuffisant' : 'service indisponible'})` })
    } finally {
      setBusy(false); setTimeout(() => setToast(null), 3500)
    }
  }

  const anomaly = ml?.flag === 1
  const upC = containers.filter((c) => c.status === 'running').length
  const feat = ml?.features || {}
  const phaseLabel = ml?.status === 'warmup' ? 'Apprentissage' : ml?.status === 'monitoring' ? (anomaly ? 'Anomalie' : 'Surveillance') : '—'

  return (
    <div className="min-h-screen">
      {/* ===== barre supérieure ===== */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-ink/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="badge !w-10 !h-10 !rounded-xl">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="#7FB0FF" strokeWidth="1.6" />
                <path d="M8 13.5c0 1.4 1.4 2.5 4 2.5s4-.8 4-2.2c0-3-7.5-1.3-7.5-4.3C8.5 8 9.8 7 12 7s4 1 4 2.4" stroke="#35D6A4" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="font-bold text-[18px] shimmer-text">Numis</div>
              <div className="text-[10.5px] uppercase tracking-[.16em] text-faint -mt-0.5">paiements · supervision</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium ${anomaly ? 'bg-alert/15 text-alert ring-1 ring-alert/30' : 'bg-money/15 text-money ring-1 ring-money/30'}`}>
              <span className={`w-2 h-2 rounded-full ${anomaly ? 'bg-alert' : 'bg-money'}`} />
              {anomaly ? 'Incident en cours' : 'Système sain'}
            </div>
            <ServicesMenu items={containers} />
            <Clock />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6">
        {/* ===== bandeau KPI ===== */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <Stat label="Système" bar={anomaly ? '#F26D6D' : '#35D6A4'} delay="d1"
                value={anomaly ? 'Incident' : 'Sain'}
                sub={<span className="flex items-center gap-1.5"><Dot ok={!anomaly} /> supervision active</span>} />
          <Stat label="Débit" bar="#7FB0FF" delay="d2"
                value={feat.request_rate != null ? feat.request_rate.toFixed(1) : '—'} sub="requêtes / s" />
          <Stat label="Latence p95" bar="#5B8DEF" delay="d3"
                value={feat.p95_latency != null ? (feat.p95_latency * 1000).toFixed(0) : '—'} sub="millisecondes" />
          <Stat label="Taux d'erreur" bar={feat.error_ratio > 0.05 ? '#F26D6D' : '#F2B64B'} delay="d4"
                value={feat.error_ratio != null ? (feat.error_ratio * 100).toFixed(1) + '%' : '—'} sub="sur l'API paiement" />
          <Stat label="Conteneurs" bar="#F2B64B" delay="d5"
                value={containers.length ? `${upC}/${containers.length}` : '—'} sub="actifs (watchdog)" />
          <Stat label="Reprises" bar="#A78BFA" delay="d6"
                value={actions.length} sub="actions autonomes" />
        </div>

        {/* ===== état des composants ===== */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 text-[13px]">
          <span className="text-faint uppercase tracking-wider text-[11.5px]">Composants</span>
          <span className="flex items-center gap-2"><Dot ok={health.pay} /> API de paiement</span>
          <span className="flex items-center gap-2"><Dot ok={health.ml} /> Détecteur IA <span className="text-faint">({phaseLabel})</span></span>
          <span className="flex items-center gap-2"><Dot ok={health.rem} /> Moteur de reprise</span>
          <a href={`http://${location.hostname}:3000`} target="_blank" rel="noreferrer"
             className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-raised/70 border border-line text-sky2 hover:border-accent">
             Ouvrir Grafana <span className="text-faint text-[11px]">métriques & logs ↗</span></a>
        </div>

        <div className="mb-5"><Containers items={containers} /></div>

        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <div className={flash.current ? 'flash-money rounded-2xl' : ''} onAnimationEnd={() => (flash.current = false)}>
            <Payment token={token} accounts={accounts} txs={txs} onTransfer={onTransfer} offline={offline} busy={busy} />
          </div>
          <div className="space-y-5">
            <Ai ml={ml} />
            <Remediation actions={actions} />
          </div>
        </div>

        <footer className="mt-10 pt-5 border-t border-line/50 text-[11.5px] text-faint flex flex-wrap items-center justify-between gap-2">
          <span>PROJECT RESILIENCE-ALPHA — démonstrateur de cyber-résilience (Zero-Touch Recovery)</span>
          <span className="font-mono">détection → décision → reprise → vérification</span>
        </footer>
      </main>

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-40 px-4 py-3 rounded-xl border text-[14px] shadow-2xl anim-pop ${toast.ok ? 'bg-money/15 border-money/40 text-money' : 'bg-alert/15 border-alert/40 text-alert'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
