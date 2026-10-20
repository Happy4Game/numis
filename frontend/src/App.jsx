import React, { useEffect, useState, useCallback, useRef } from 'react'

/* ---------- accès API (via le reverse-proxy du frontend) ---------- */
async function api(path, opts) {
  const r = await fetch(path, opts)
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.status === 204 ? null : r.json()
}
const authHeader = (t) => ({ Authorization: `Bearer ${t}` })

/* ---------- carillon de succès (Web Audio, sans fichier) ---------- */
let _audioCtx = null
function playChime() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const ctx = _audioCtx
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    ;[[880, 0], [1174.66, 0.08], [1567.98, 0.16]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'triangle'; o.frequency.value = f
      o.connect(g); g.connect(ctx.destination)
      const st = now + t
      g.gain.setValueAtTime(0.0001, st)
      g.gain.exponentialRampToValueAtTime(0.2, st + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.33)
      o.start(st); o.stop(st + 0.38)
    })
  } catch { /* audio indisponible : on ignore */ }
}

/* ---------- alerte sonore (incident détecté) ---------- */
function playAlert() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const ctx = _audioCtx
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    ;[[0, 466.16], [0.18, 466.16], [0.36, 370]].forEach(([t, f]) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'square'; o.frequency.value = f
      o.connect(g); g.connect(ctx.destination)
      const st = now + t
      g.gain.setValueAtTime(0.0001, st)
      g.gain.exponentialRampToValueAtTime(0.13, st + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.16)
      o.start(st); o.stop(st + 0.2)
    })
  } catch { /* audio indisponible */ }
}

/* ---------- éclat au curseur lors d'un paiement ---------- */
function Burst({ at }) {
  if (!at) return null
  const parts = Array.from({ length: 10 })
  return (
    <div key={at.id} className="fixed z-50 pointer-events-none" style={{ left: at.x, top: at.y }}>
      <div className="burst-ring" />
      <div className="burst-coin">€</div>
      {parts.map((_, i) => {
        const ang = (i / parts.length) * 2 * Math.PI
        const dist = 26 + (i % 3) * 10
        return <span key={i} className="burst-dot"
          style={{ '--dx': `${Math.cos(ang) * dist}px`, '--dy': `${Math.sin(ang) * dist}px`,
                   background: i % 2 ? '#35D6A4' : '#7FB0FF' }} />
      })}
    </div>
  )
}

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
  wrench:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14.5 6.5a3.8 3.8 0 0 1-4.9 4.6L5 15.7 8.3 19l4.6-4.6a3.8 3.8 0 0 0 4.6-4.9l-2.3 2.3-2.1-.6-.6-2.1 2-1.6Z" stroke="#5B8DEF" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  grid:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="#F2B64B" strokeWidth="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="#F2B64B" strokeWidth="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="#F2B64B" strokeWidth="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="#F2B64B" strokeWidth="1.5"/></svg>,
  eye:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="#35D6A4" strokeWidth="1.5"/><circle cx="12" cy="12" r="2.6" stroke="#35D6A4" strokeWidth="1.5"/></svg>,
}

/* ---------- briques UI ---------- */
function Panel({ title, hint, icon, bar, children, tone, extra, collapsible, fill }) {
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
         className={`kpi rounded-xl pl-4 pr-4 py-3 anim-fadeup ${delay || ''}`}>
      <div className="text-[10px] uppercase tracking-[.14em] text-faint font-medium">{label}</div>
      <div className="mt-1 text-[22px] font-semibold font-mono tnum text-text leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-muted leading-tight">{sub}</div>}
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
    <div className="hidden lg:block text-right leading-tight">
      <div className="font-mono tnum text-[15px] text-text">{t}</div>
      <div className="text-[10.5px] text-faint capitalize">{d} · Paris</div>
    </div>
  )
}

/* ---------- courbe du score (interactive) ---------- */
function ScoreChart({ data, tall }) {
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

/* ---------- panneau PAIEMENT ---------- */
function Payment({ token, accounts, txs, onTransfer, offline, busy, fill }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('25')
  const [probe, setProbe] = useState({ state: 'idle' })

  useEffect(() => {
    if (accounts.length >= 2 && !from) { setFrom(String(accounts[0].id)); setTo(String(accounts[1].id)) }
  }, [accounts])

  if (offline) {
    return (
      <Panel title="Numis — paiements" hint="Virements entre comptes de démonstration." icon={I.card} bar="#7FB0FF" fill={fill} collapsible>
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

  // Preuve de reprise : transaction témoin de 1 EUR, avec latence + horodatage.
  const runWitness = async () => {
    if (accounts.length < 2) return
    setProbe({ state: 'run' })
    const t0 = performance.now()
    const at = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })
    try {
      await api('/api/payment/transactions', {
        method: 'POST', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_account: accounts[0].id, to_account: accounts[1].id, amount: 1 }),
      })
      setProbe({ state: 'ok', ms: Math.round(performance.now() - t0), at })
    } catch (e) {
      const x = String(e)
      const msg = x.includes('429') ? 'trafic régulé (429)' : x.includes('400') ? 'solde insuffisant' : 'service injoignable'
      setProbe({ state: 'ko', msg, at })
    }
  }

  return (
    <Panel title="Numis — paiements" hint="Virements entre vos comptes de démonstration." icon={I.card} bar="#7FB0FF" fill={fill} collapsible>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {accounts.map((a) => (
          <div key={a.id} className="relative rounded-xl bg-raised/70 border border-line px-4 py-3 overflow-hidden">
            <div className="absolute right-3 top-3 opacity-20">{I.card}</div>
            <div className="text-[12px] text-muted">{a.label}</div>
            <div key={a.balance} className="text-[22px] font-semibold font-mono tnum text-money mt-1 anim-pop">{euro(a.balance)}</div>
          </div>
        ))}
        {accounts.length === 0 && <div className="col-span-2 text-[13px] text-muted">Chargement des comptes…</div>}
      </div>

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
        <div className="flex justify-center -my-1">
          <button type="button" onClick={() => { setFrom(to); setTo(from) }}
            title="Inverser les comptes"
            className="flex items-center gap-1.5 text-[12px] text-sky2 hover:text-text px-3 py-1 rounded-full bg-raised/60 border border-line hover:border-accent">
            <span className="text-[13px] leading-none">⇄</span> Inverser
          </button>
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

      {/* preuve de reprise — transaction témoin (sujet §2 : "service de nouveau utilisable") */}
      <div className="mt-4 pt-4 border-t border-line/50">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12.5px] text-text font-medium">Preuve de reprise</div>
            <div className="text-[11.5px] text-muted">Transaction témoin de 1 € — le service est-il utilisable ?</div>
          </div>
          <button type="button" onClick={runWitness} disabled={probe.state === 'run' || accounts.length < 2}
            className="btn-flat shrink-0 rounded-lg bg-money/15 text-money border border-money/30 hover:bg-money/25 px-3 py-2 text-[13px] font-medium disabled:opacity-50">
            {probe.state === 'run' ? 'Test…' : 'Lancer le témoin'}
          </button>
        </div>
        {(probe.state === 'ok' || probe.state === 'ko') && (
          <div className={'mt-2 rounded-lg border px-3 py-2 text-[12.5px] anim-slidein ' + (probe.state === 'ok' ? 'border-money/40 bg-money/10 text-money' : 'border-alert/40 bg-alert/10 text-alert')}>
            {probe.state === 'ok' ? '✓ Service utilisable — transaction réglée en ' + probe.ms + ' ms' : '✗ Service indisponible — ' + probe.msg}
            <span className="text-muted ml-2 font-mono tnum">{probe.at}</span>
          </div>
        )}
      </div>

      <div className="mt-4">
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
function DecisionFeed({ items, bare }) {
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

/* ---------- panneau IA ---------- */
function Ai({ ml, wide, fill }) {
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

/* ---------- panneau REPRISE ---------- */
function Remediation({ actions, fill }) {
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

/* ---------- état des conteneurs ---------- */
function Containers({ items, fill }) {
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

/* ---------- synthèse supervision (page centrale) ---------- */
function Synthese({ ml, actions, containers, health, go, fill }) {
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

/* ---------- guide intégré : pages d'explication ---------- */
const GUIDE_ICON = (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M4 5.5A2.5 2.5 0 0 0 6.5 8H20" stroke="currentColor" strokeWidth="1.6"/></svg>)
function GH({ children }) { return <h4 className="text-[13.5px] font-semibold text-text mt-5 mb-1.5 first:mt-0">{children}</h4> }
function GP({ children }) { return <p className="text-[13px] text-muted leading-relaxed mb-2">{children}</p> }
function GL({ items }) {
  return <ul className="space-y-1.5 mb-2">{items.map((t, i) => (<li key={i} className="flex gap-2 text-[13px] text-muted leading-relaxed"><span className="text-accent mt-px shrink-0">▸</span><span>{t}</span></li>))}</ul>
}
function GSteps({ items }) {
  return <ol className="space-y-2 mb-2">{items.map((t, i) => (<li key={i} className="flex gap-2.5 text-[13px] text-muted leading-relaxed"><span className="shrink-0 w-5 h-5 grid place-items-center rounded-full bg-accent/15 text-sky2 text-[11px] font-mono">{i + 1}</span><span className="pt-0.5">{t}</span></li>))}</ol>
}
function Code({ children }) { return <code className="px-1.5 py-0.5 rounded text-[12px] font-mono bg-raised/70 text-sky2 border border-line break-words">{children}</code> }
const B = ({ children }) => <b className="text-text font-medium">{children}</b>
function GT({ head, rows }) {
  return (
    <div className="overflow-x-auto my-2 rounded-lg border border-line/60">
      <table className="w-full text-[12.5px]">
        <thead><tr className="bg-raised/60 text-faint">{head.map((h, i) => (<th key={i} className="text-left font-medium px-3 py-1.5 whitespace-nowrap">{h}</th>))}</tr></thead>
        <tbody>{rows.map((r, i) => (<tr key={i} className="border-t border-line/50">{r.map((c, j) => (<td key={j} className="px-3 py-1.5 align-top text-muted">{c}</td>))}</tr>))}</tbody>
      </table>
    </div>
  )
}
function Note({ children, tone }) {
  const c = tone === 'warn' ? 'border-warn/40 bg-warn/10' : tone === 'alert' ? 'border-alert/40 bg-alert/10' : 'border-accent/40 bg-accent/10'
  return <div className={"rounded-lg border px-3 py-2 my-2 text-[12.5px] text-muted leading-relaxed " + c}>{children}</div>
}

const GUIDE = [
  { id: 'projet', icon: '🎯', title: 'Le projet', body: (<div>
    <GP>Numis est une plateforme de paiement <B>fictive</B>. Son but : démontrer la <B>cyber-résilience</B> — le système détecte une attaque ou une panne, décide de la bonne action, se répare <B>sans intervention humaine</B> (Zero-Touch Recovery), puis <B>prouve</B> qu'il est de nouveau utilisable.</GP>
    <GH>Le fil rouge : deux natures d'incident</GH>
    <GL items={[<><B>Disponibilité</B> (DoS/DDoS, crash d'un conteneur, panne de base) → on <B>rétablit</B> : redémarrage, délestage ciblé, diagnostic de dépendance.</>, <><B>Compromission</B> (injection SQL, XSS, traversée de chemin) → on <B>bloque en amont</B> via le WAF + alerte SOC. On n'« auto-répare » pas une fuite : ce serait malhonnête de le prétendre.</>]} />
    <GH>La chaîne complète</GH>
    <GP><B>détection → décision → reprise → vérification</B>. Chaque étape est visible en direct ici et dans Grafana. L'IA ne « devine » rien en boîte noire : elle s'appuie sur des métriques mesurées et explique la feature qui a dérivé.</GP>
    <GH>Les 5 piliers imposés</GH>
    <GL items={[<><B>Développement</B> : les services <Code>auth</Code>, <Code>payment-api</Code>, le dashboard.</>, <><B>Infrastructure</B> : Docker Compose, Ansible, Prometheus/Grafana/Loki.</>, <><B>IA / Data</B> : le détecteur d'anomalies et l'assistant RAG.</>, <><B>Cybersécurité</B> : WAF, SOC, secrets, scénarios d'attaque.</>, <><B>Gouvernance</B> : EBIOS RM, PCA/PRA, NIS2/DORA.</>]} />
  </div>) },

  { id: 'dashboard', icon: '🧭', title: 'Lire le dashboard', body: (<div>
    <GH>Trois pages (flèches ← →, clavier, ou barre du bas)</GH>
    <GL items={[<><B>Détection & reprise</B> : le détecteur IA et la reprise autonome côte à côte.</>, <><B>Vue d'ensemble</B> (centre) : KPI temps réel, paiement Numis, synthèse.</>, <><B>Conteneurs</B> : l'état de vie de toute la stack (watchdog).</>]} />
    <GH>Le bandeau de KPI, précisément</GH>
    <GT head={["KPI", "Signification", "Source"]} rows={[
      ["Système", "sain / incident", "flag du détecteur"],
      ["Débit", "requêtes par seconde", "rate(http_requests_total[1m])"],
      ["Latence p95", "95 % des réponses sont plus rapides que cette valeur", "histogram_quantile(0.95, …)"],
      ["Taux d'erreur", "part de réponses 5xx", "5xx / total"],
      ["Conteneurs", "actifs / total", "watchdog"],
      ["Reprises", "nb d'actions autonomes", "remediation-engine"],
    ]} />
    <GH>Panneaux repliables</GH>
    <GP>Chaque panneau a un chevron <B>▼</B> en haut à droite pour le replier — pratique pour se concentrer sur une brique.</GP>
    <GH>Retours sonores & visuels</GH>
    <GL items={[<><B>Carillon</B> + éclat au curseur à chaque paiement réglé.</>, <><B>Bip d'alerte</B> au déclenchement d'un incident (une seule fois, au front montant).</>, <>Animations <B>événementielles</B> uniquement (jamais en boucle), désactivées si « réduire les animations » est actif.</>]} />
    <Note>Les navigateurs exigent une interaction avant de jouer un son : comme la connexion et les clics ont lieu dès l'ouverture, l'audio fonctionne ; sinon un simple clic débloque.</Note>
  </div>) },

  { id: 'composants', icon: '🧩', title: 'Les composants', body: (<div>
    <GP>La plateforme est un ensemble de <B>14 conteneurs</B> orchestrés par Docker Compose. Voici le rôle de chacun et s'il est exposé à l'extérieur.</GP>
    <GT head={["Conteneur", "Rôle", "Exposé ?"]} rows={[
      ["db", "PostgreSQL — comptes & transactions", "non"],
      ["auth", "émission des JWT + anti-brute-force", "non"],
      ["payment-api", "métier : transactions + délestage", "via WAF"],
      ["waf", "pare-feu applicatif ModSecurity (CRS)", ":8080"],
      ["prometheus", "collecte des métriques", "non"],
      ["alertmanager", "alertes SOC", "non"],
      ["loki", "centralisation des logs", "non"],
      ["promtail", "collecte des journaux", "non"],
      ["grafana", "dashboards & alerting (SOC)", ":3000"],
      ["ml-detector", "détection d'anomalies (IA)", "non"],
      ["remediation-engine", "reprise autonome + watchdog", "non"],
      ["ollama", "LLM local (assistant)", "non"],
      ["rag-assistant", "assistant opérateur (RAG)", ":8001"],
      ["frontend", "ce dashboard (React/nginx)", ":3001"],
    ]} />
    <Note tone="warn">Principe : <B>seuls le WAF, Grafana, le RAG et le dashboard</B> sont exposés. Tout le reste est interne — le dashboard atteint les services internes par un reverse-proxy nginx.</Note>
  </div>) },

  { id: 'flux', icon: '🔄', title: "Flux d'une requête", body: (<div>
    <GH>Chemin métier nominal</GH>
    <GSteps items={[
      <>Le navigateur envoie la requête au <B>WAF</B> (<Code>:8080</Code>), seul point d'entrée public.</>,
      <>Le WAF inspecte (règles OWASP) et relaie à <Code>payment-api</Code>.</>,
      <>Pour un virement, <Code>payment-api</Code> valide le <B>JWT localement</B> avec le secret partagé — pas d'appel à <Code>auth</Code> à chaque requête.</>,
      <>Il ouvre une transaction, prend un verrou <Code>FOR UPDATE</Code> sur le compte source, débite/crédite, journalise.</>,
      <>La réponse remonte ; <Code>payment-api</Code> incrémente ses métriques Prometheus au passage.</>,
    ]} />
    <GH>Pourquoi valider le JWT localement ?</GH>
    <GP>Sous une charge d'attaque, un aller-retour réseau vers <Code>auth</Code> à chaque requête deviendrait un goulot. En validant la signature localement (secret partagé HS256), <Code>payment-api</Code> reste rapide ; <Code>auth</Code> garde la responsabilité unique d'<B>émettre</B> les jetons.</GP>
    <GH>Le jeton (JWT)</GH>
    <GP>À la connexion, <Code>auth</Code> renvoie un <Code>access_token</Code> signé. Le dashboard l'ajoute en en-tête <Code>{'Authorization: Bearer <token>'}</Code> sur chaque appel métier.</GP>
  </div>) },

  { id: 'ia', icon: '🧠', title: 'Détection IA', body: (<div>
    <GP>Un <B>Isolation Forest</B> (scikit-learn, 100 arbres, contamination 0.1) apprend le profil de trafic <B>normal</B>, puis signale ce qui s'en écarte. Non supervisé, léger, et surtout <B>explicable</B>.</GP>
    <GH>Comment ça marche (en bref)</GH>
    <GP>L'algorithme isole chaque point en le « découpant » au hasard. Un point <B>anormal</B> se retrouve isolé en peu de découpes → score négatif. Un point <B>normal</B>, noyé dans la masse, demande beaucoup de découpes.</GP>
    <GH>Les 3 signaux (interrogés toutes les 10 s via PromQL)</GH>
    <GT head={["Signal", "Requête PromQL"]} rows={[
      ["Débit", <Code>{'sum(rate(http_requests_total{job="payment-api"}[1m]))'}</Code>],
      ["Taux d'erreur", <Code>{'rate(5xx[1m]) / rate(total[1m])'}</Code>],
      ["Latence p95", <Code>{'histogram_quantile(0.95, …_bucket[1m])'}</Code>],
    ]} />
    <GP>Les features sont <B>normalisées (z-score)</B> avec la moyenne/écart-type appris, pour que trois unités différentes soient comparables.</GP>
    <GH>Le déroulé, étape par étape</GH>
    <GSteps items={[
      <><B>Apprentissage</B> (warmup) : <Code>20</Code> observations pour fixer la normalité (baseline).</>,
      <><B>Surveillance</B> : à chaque cycle, score d'anomalie (sous 0 = anormal).</>,
      <><B>Garde de dégradation</B> : anomalie retenue seulement si dégradation <B>réelle</B> — taux d'erreur &gt; <Code>5 %</Code> OU latence p95 &gt; <Code>300 ms</Code>.</>,
      <><B>Persistance</B> : incident déclaré après <Code>2</Code> cycles consécutifs (anti faux-positif), puis appel au moteur de reprise avec l'explication.</>,
      <><B>Re-arm</B> : après action, il ne ré-agit que lorsque les métriques sont redevenues normales (ou au bout de <Code>120 s</Code> si l'attaque continue).</>,
    ]} />
    <Note>Sans la garde de dégradation, un site <B>inactif</B> (trafic ≈ 0) paraîtrait « anormal ». On exige donc une vraie dégradation observable avant de déclencher.</Note>
    <GH>Le modèle survit aux redémarrages</GH>
    <GP>Le modèle entraîné est persisté (<Code>/model/model.pkl</Code>) : pas besoin de ré-apprendre à chaque relance. <Code>make train</Code> l'entraîne hors-ligne, <Code>make retrain</Code> repart à neuf.</GP>
  </div>) },

  { id: 'reprise', icon: '🔧', title: 'Reprise autonome', body: (<div>
    <GP>Le <Code>remediation-engine</Code> reçoit l'alerte du détecteur (avec un <B>jeton</B>), applique un <B>playbook</B>, puis <B>vérifie</B> le rétablissement.</GP>
    <GH>Décision (diagnostic de dépendance)</GH>
    <GT head={["Symptôme", "Action"]} rows={[
      ["payment-api injoignable", "restart rsa-payment-api"],
      ["base injoignable (dépendance)", "restart rsa-db"],
      ["service debout mais dégradé (surcharge)", "throttle (délestage ciblé)"],
    ]} />
    <GP>La règle de base : <B>service injoignable → conteneur planté → restart</B> ; <B>service debout mais saturé → throttle</B>.</GP>
    <GH>Le throttle est adaptatif</GH>
    <GP>Il démarre à <Code>10 rps</Code> et, si la surcharge persiste (nouvelle action dans les 120 s), il <B>divise le budget par deux</B> (plancher 3 rps) — escalade progressive jusqu'à soulager le système.</GP>
    <GH>Vérification (le point crucial)</GH>
    <GP>Un conteneur relancé ne suffit pas : le moteur <B>attend le retour à <Code>/health</Code></B> et mesure la durée → « rétabli en X s ». On prouve le retour à un état <B>utilisable</B>, pas juste « le process tourne ».</GP>
    <GH>Privilèges encadrés (point noté §3.4)</GH>
    <GL items={[<><B>Isolation</B> : seul lui monte le socket Docker.</>, <><B>Allowlist de cibles</B> : <Code>rsa-payment-api, rsa-db</Code> — toute autre cible = refus 403.</>, <><B>Allowlist d'actions</B> : <Code>restart</Code> / <Code>throttle</Code> uniquement, pas d'exec arbitraire.</>, <><B>Jeton</B> <Code>x-remediation-token</Code> obligatoire ; <B>traçabilité</B> de chaque demande (métriques).</>]} />
  </div>) },

  { id: 'watchdog', icon: '🫀', title: 'Watchdog & conteneurs', body: (<div>
    <GP>Le détecteur surveille l'<B>API de paiement</B>. En complément, un <B>watchdog</B> surveille la <B>vie de toute la stack</B> (toutes les <Code>10 s</Code>).</GP>
    <GL items={[<>Si un conteneur est <B>mort</B> (état <Code>exited</Code>/<Code>dead</Code> confirmé), il est <B>redémarré</B> automatiquement.</>, <>Un <B>cooldown</B> de <Code>60 s</Code> par conteneur évite les boucles de redémarrage sur un crash répété.</>, <>Il ignore les états transitoires (<Code>created</Code>, <Code>restarting</Code>, <Code>paused</Code>) pour ne pas gêner un démarrage normal.</>]} />
    <GP>La page <B>Conteneurs</B> affiche chaque service avec une pastille <span className="text-money">verte</span> (actif) ou <span className="text-alert">rouge</span> (à relancer), et le bandeau KPI « Conteneurs » résume actifs/total.</GP>
    <Note>À tester : <Code>make chaos-kill</Code> (tue l'API) ou <Code>make chaos-kill-db</Code> (tue la base) — et observe la reprise dans « Détection & reprise ».</Note>
  </div>) },

  { id: 'secu', icon: '🛡️', title: 'Sécurité & WAF', body: (<div>
    <GP>Le <B>WAF ModSecurity</B> avec le jeu de règles <B>OWASP CRS</B> filtre tout le trafic entrant de l'API. C'est le seul point d'entrée publié.</GP>
    <GH>Ce qu'il bloque</GH>
    <GL items={[<><B>Injections SQL</B> — manipulation de requêtes via des entrées piégées.</>, <><B>XSS</B> — injection de scripts dans des champs.</>, <><B>Traversées de chemin</B> — tentatives d'accès à des fichiers hors périmètre.</>, <><B>Scans de reconnaissance</B> — sondes automatisées.</>]} />
    <GH>Autres défenses</GH>
    <GL items={[<><B>Anti-brute-force</B> sur <Code>auth</Code> : verrouillage temporaire après plusieurs échecs (renvoie 429).</>, <><B>Secrets</B> chiffrés avec <B>SOPS + age</B> (pas de mot de passe en clair dans le dépôt).</>, <><B>JWT</B> signés (HS256), validés localement par l'API.</>]} />
    <GH>Dispo vs compromission</GH>
    <GP>Une injection SQL bloquée n'est pas « réparée » par un redémarrage : on la <B>bloque en amont</B> et on lève une <B>alerte SOC</B>. On ne prétend pas auto-remédier une compromission — c'est une limite assumée, défendable au jury.</GP>
    <Note tone="warn">À tester : <Code>make attack-sqli</Code> (injection bloquée) ou <Code>make attack-all</Code> (catalogue Red/Blue complet avec synthèse).</Note>
  </div>) },

  { id: 'ddos', icon: '🌊', title: 'DDoS : délestage ciblé', body: (<div>
    <GH>Le piège du délestage naïf</GH>
    <GP>Un rate-limit <B>global</B> fait tomber aussi les clients légitimes : le flood remplit le budget par seconde, et un vrai virement est rejeté <B>en même temps</B> que l'attaquant (429). C'était le symptôme « je ne peux plus payer du tout ».</GP>
    <GH>La signature de l'attaque</GH>
    <GP>Le DoS martèle <Code>POST /transactions</Code> sur le <B>même compte</B> (<Code>from == to</Code>, montant 1, net nul). Chaque requête prend un verrou <Code>FOR UPDATE</Code> + une connexion du pool → contention → latence et erreurs qui grimpent.</GP>
    <GH>Notre approche : délestage CIBLÉ</GH>
    <GSteps items={[
      <>Hors protection, le motif passe normalement → la dégradation est <B>réelle et observable</B> → la détection se déclenche.</>,
      <>Sous protection, on rejette <B>tôt</B> l'auto-virement net-nul (<Code>from == to</Code>) avec un <Code>429</Code>, <B>avant toute prise de verrou DB</B>.</>,
      <>Les virements <B>légitimes</B> (<Code>from != to</Code>) ne sont pas comptés dans un budget global : ils passent.</>,
      <>Un <Code>lock_timeout</Code> de <Code>600 ms</Code> empêche un virement légitime de rester bloqué derrière le flood.</>,
    ]} />
    <Note>Résultat : <B>on peut toujours payer pendant un DDoS</B> (entre deux comptes différents), tandis que le flood est absorbé à coût quasi nul. À tester : <Code>make attack-ddos</Code> (5 min, 80 threads).</Note>
  </div>) },

  { id: 'obs', icon: '📡', title: 'Observabilité / SOC', body: (<div>
    <GP>Deux chaînes complémentaires : les <B>métriques</B> (chiffres) et les <B>logs</B> (événements).</GP>
    <GH>Métriques</GH>
    <GL items={[<><B>Prometheus</B> scrape <Code>/metrics</Code> toutes les <Code>10 s</Code> (jobs : payment-api, auth, ml-detector, remediation).</>, <>PromQL calcule débit, taux d'erreur et latence p95 (histogrammes).</>, <><B>Alertmanager</B> publie des alertes lisibles (fonction SOC).</>]} />
    <GH>Logs</GH>
    <GL items={[<>Tous les services émettent des <B>logs JSON structurés</B>.</>, <><B>Promtail</B> les collecte → <B>Loki</B> les centralise → <B>Grafana</B> les explore.</>]} />
    <GH>Pourquoi pas Elastic ?</GH>
    <GP>Trop lourd pour 16 Go de RAM. <B>Loki + Grafana</B> tiennent le rôle de <B>SIEM/SOC léger</B> — un choix assumé et justifié dans la doc. Grafana est accessible (lecture seule) depuis l'en-tête du dashboard.</GP>
  </div>) },

  { id: 'rag', icon: '💬', title: 'Assistant RAG', body: (<div>
    <GP>Un <B>assistant opérateur</B> local répond en langage naturel sur les procédures, à partir de la <B>documentation du projet</B> (runbooks, architecture…).</GP>
    <GH>RAG = Retrieval-Augmented Generation</GH>
    <GSteps items={[
      <>La doc est découpée en morceaux et transformée en <B>vecteurs</B> (embeddings) stockés dans <B>Chroma</B>.</>,
      <>À une question, on récupère les passages les plus <B>proches</B> sémantiquement.</>,
      <>Le <B>LLM local</B> (Ollama, Qwen2.5 3B) rédige une réponse <B>en s'appuyant uniquement</B> sur ces passages.</>,
    ]} />
    <Note tone="warn">L'assistant lit la doc en <B>lecture seule</B> et n'a <B>AUCUN privilège</B> sur le système. Il est volontairement <B>distinct</B> du moteur de remédiation (sujet §3.3) : il explique, il n'agit jamais.</Note>
  </div>) },

  { id: 'demo', icon: '🎬', title: 'Jouer la démo', body: (<div>
    <GP>Scénario principal (reprise autonome), sans aucune intervention humaine :</GP>
    <GSteps items={[
      <><B>Observer</B> : garde le dashboard ouvert (+ Grafana).</>,
      <><B>Attaquer</B> depuis le PC attaquant : <Code>make attack-dos</Code> (ou <Code>attack-ddos</Code>).</>,
      <>La latence et les erreurs grimpent → le détecteur passe en <B>Anomalie</B> (après 2 cycles).</>,
      <>Le moteur applique restart ou throttle, puis <B>vérifie /health</B> → « rétabli en X s ».</>,
      <>Le dashboard repasse au vert ; un virement témoin réussit.</>,
    ]} />
    <GH>Les autres scénarios</GH>
    <GT head={["Commande", "Montre"]} rows={[
      [<Code>make chaos-kill</Code>, "crash API → détection + restart"],
      [<Code>make chaos-kill-db</Code>, "panne base → diagnostic de dépendance"],
      [<Code>make attack-sqli</Code>, "injection → blocage WAF + alerte"],
      [<Code>make attack-all</Code>, "catalogue Red/Blue + synthèse"],
      [<Code>make smoke</Code>, "preuve que le métier répond"],
    ]} />
  </div>) },

  { id: 'gouvernance', icon: '📋', title: 'Gouvernance & conformité', body: (<div>
    <GP>Au-delà de la technique, le projet porte les livrables de gouvernance attendus :</GP>
    <GL items={[<><B>EBIOS RM</B> — analyse de risque (événements redoutés, scénarios, mesures).</>, <><B>PCA / PRA</B> — plan de continuité et de reprise d'activité.</>, <><B>NIS2 / DORA</B> — cadrage réglementaire (résilience des entités, secteur financier).</>, <><B>Matrice Red/Blue</B> — chaque attaque mise en face de sa défense.</>, <><B>Contributions</B> — qui a fait quoi (exigé par la grille).</>]} />
    <Note>Ces documents sont dans le dossier <Code>docs/</Code> et alimentent le <Code>Dossier.pdf</Code>.</Note>
  </div>) },

  { id: 'glossaire', icon: '📖', title: 'Glossaire', body: (<div>
    <GT head={["Terme", "Définition"]} rows={[
      ["Zero-Touch Recovery", "reprise sans intervention humaine"],
      ["Isolation Forest", "modèle ML non supervisé de détection d'anomalies"],
      ["z-score", "normalisation (valeur − moyenne) / écart-type"],
      ["Latence p95", "95 % des réponses sont plus rapides que cette valeur"],
      ["WAF", "Web Application Firewall (pare-feu applicatif)"],
      ["CRS", "Core Rule Set — règles OWASP du WAF"],
      ["SOC / SIEM", "supervision & corrélation des événements de sécurité"],
      ["JWT", "jeton d'authentification signé"],
      ["FOR UPDATE", "verrou de ligne SQL le temps d'une transaction"],
      ["RAG", "génération augmentée par récupération de documents"],
      ["Throttle", "délestage : on limite le débit pour soulager le service"],
      ["PromQL", "langage de requête des métriques Prometheus"],
    ]} />
  </div>) },
]

function Guide({ open, onClose, sec, setSec }) {
  if (!open) return null
  const S = GUIDE[sec] || GUIDE[0]
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-deep/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-5xl h-[88vh] rounded-2xl glass border border-hair shadow-2xl flex overflow-hidden anim-fadeup" onClick={(e) => e.stopPropagation()}>
        <aside className="w-60 shrink-0 border-r border-line/60 p-3 overflow-y-auto hidden sm:block">
          <div className="px-2 py-2 text-[11px] uppercase tracking-wider text-faint">Comprendre le système</div>
          {GUIDE.map((g, i) => (
            <button key={g.id} onClick={() => setSec(i)}
              className={"btn-flat w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left mb-0.5 " + (i === sec ? 'bg-accent/15 text-text ring-1 ring-accent/30' : 'text-muted hover:bg-raised/60 hover:text-text')}>
              <span className="text-[15px] leading-none">{g.icon}</span>{g.title}
            </button>
          ))}
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-5 py-3 border-b border-line/60 shrink-0">
            <div className="flex items-center gap-2.5"><span className="text-[18px]">{S.icon}</span><h3 className="text-[16px] font-semibold text-text">{S.title}</h3>
              <span className="text-[11px] text-faint font-mono hidden sm:inline">{sec + 1}/{GUIDE.length}</span></div>
            <button onClick={onClose} title="Fermer (Échap)" className="btn-flat w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-raised/70">✕</button>
          </header>
          <div className="p-5 overflow-y-auto">{S.body}</div>
          <div className="sm:hidden flex gap-1.5 overflow-x-auto px-3 py-2 border-t border-line/60">
            {GUIDE.map((g, i) => (
              <button key={g.id} onClick={() => setSec(i)}
                className={"btn-flat shrink-0 w-9 h-9 grid place-items-center rounded-full text-[15px] " + (i === sec ? 'bg-accent/15 ring-1 ring-accent/30' : 'bg-raised/40')}>{g.icon}</button>
            ))}
          </div>
        </div>
      </div>
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
  const [slide, setSlide] = useState(1)   // 0 reprise · 1 essentiel · 2 IA
  const flash = useRef(false)
  const pointer = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const [burst, setBurst] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideSec, setGuideSec] = useState(0)
  const guideOpenRef = useRef(false); guideOpenRef.current = guideOpen

  const SLIDES = [
    { id: 'detection', label: 'Détection & reprise' },
    { id: 'essentiel', label: "Vue d'ensemble" },
    { id: 'conteneurs', label: 'Conteneurs' },
  ]
  const go = (i) => setSlide(Math.max(0, Math.min(SLIDES.length - 1, i)))

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return
      if (guideOpenRef.current) { if (e.key === 'Escape') setGuideOpen(false); return }
      if (e.key === 'ArrowRight') setSlide((s) => Math.min(SLIDES.length - 1, s + 1))
      if (e.key === 'ArrowLeft') setSlide((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
          await new Promise((r) => setTimeout(r, 3000))
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onDown = (e) => { pointer.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
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
      playChime()
      setBurst({ x: pointer.current.x, y: pointer.current.y, id: Date.now() })
      setTimeout(() => setBurst(null), 850)
      await loadPayment(token)
    } catch (e) {
      const s = String(e)
      const msg = s.includes('400') ? 'solde insuffisant'
        : s.includes('429') ? 'trafic régulé (réessayez)'
        : 'service indisponible'
      setToast({ ok: false, msg: `Paiement refusé (${msg})` })
    } finally {
      setBusy(false); setTimeout(() => setToast(null), 3500)
    }
  }

  const anomaly = ml?.flag === 1
  const prevAnom = useRef(false)
  useEffect(() => { if (anomaly && !prevAnom.current) playAlert(); prevAnom.current = anomaly }, [anomaly])
  const upC = containers.filter((c) => c.status === 'running').length
  const feat = ml?.features || {}

  const EdgeBtn = ({ dir, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} aria-label={dir === 'l' ? 'Précédent' : 'Suivant'}
      className={`edge-btn hidden md:grid place-items-center absolute top-1/2 -translate-y-1/2 ${dir === 'l' ? 'left-3' : 'right-3'} z-20 w-11 h-11 rounded-full glass border border-hair text-[20px] text-muted hover:text-text disabled:opacity-0 disabled:pointer-events-none`}>
      {dir === 'l' ? '‹' : '›'}
    </button>
  )

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <header className="shrink-0 relative z-40 border-b border-line/70 bg-ink/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 py-2.5 flex items-center justify-between gap-4">
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
            <button onClick={() => setGuideOpen(true)} title="Comprendre le système"
              className="btn-flat flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] bg-raised/70 border border-line text-muted hover:text-text hover:border-accent">
              {GUIDE_ICON}<span className="hidden sm:inline">Comprendre</span>
            </button>
            <ServicesMenu items={containers} />
            <Clock />
          </div>
        </div>
      </header>

      <div className="relative flex-1 min-h-0">
        <EdgeBtn dir="l" onClick={() => go(slide - 1)} disabled={slide === 0} />
        <EdgeBtn dir="r" onClick={() => go(slide + 1)} disabled={slide === SLIDES.length - 1} />
        <div className="h-full overflow-hidden">
          <div className="flex h-full transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
               style={{ transform: `translateX(-${slide * 100}%)` }}>

            <section className="w-full shrink-0 h-full overflow-y-auto px-4 sm:px-6 py-4">
              <div className="max-w-7xl mx-auto h-full grid lg:grid-cols-2 gap-4 min-h-0">
                <Ai ml={ml} fill />
                <Remediation actions={actions} fill />
              </div>
            </section>

            <section className="w-full shrink-0 h-full overflow-y-auto px-4 sm:px-6 py-4">
              <div className="max-w-7xl mx-auto h-full flex flex-col gap-4 min-h-0">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
                  <Stat label="Système" bar={anomaly ? '#F26D6D' : '#35D6A4'} delay="d1"
                        value={anomaly ? 'Incident' : 'Sain'}
                        sub={<span className="flex items-center gap-1.5"><Dot ok={!anomaly} /> supervision</span>} />
                  <Stat label="Débit" bar="#7FB0FF" delay="d2" value={feat.request_rate != null ? feat.request_rate.toFixed(1) : '—'} sub="requêtes / s" />
                  <Stat label="Latence p95" bar="#5B8DEF" delay="d3" value={feat.p95_latency != null ? (feat.p95_latency * 1000).toFixed(0) : '—'} sub="millisecondes" />
                  <Stat label="Taux d'erreur" bar={feat.error_ratio > 0.05 ? '#F26D6D' : '#F2B64B'} delay="d4" value={feat.error_ratio != null ? (feat.error_ratio * 100).toFixed(1) + '%' : '—'} sub="API paiement" />
                  <Stat label="Conteneurs" bar="#F2B64B" delay="d5" value={containers.length ? `${upC}/${containers.length}` : '—'} sub="actifs" />
                  <Stat label="Reprises" bar="#A78BFA" delay="d6" value={actions.length} sub="autonomes" />
                </div>
                <div className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0">
                  <div className={flash.current ? 'flash-money rounded-2xl min-h-0' : 'min-h-0'} onAnimationEnd={() => (flash.current = false)}>
                    <Payment token={token} accounts={accounts} txs={txs} onTransfer={onTransfer} offline={offline} busy={busy} fill />
                  </div>
                  <Synthese ml={ml} actions={actions} containers={containers} health={health} go={go} fill />
                </div>
              </div>
            </section>

            <section className="w-full shrink-0 h-full overflow-y-auto px-4 sm:px-6 py-4">
              <div className="max-w-7xl mx-auto h-full min-h-0">
                <Containers items={containers} fill />
              </div>
            </section>

          </div>
        </div>
      </div>

      <nav className="shrink-0 border-t border-line/70 bg-ink/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 py-2 flex items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <button key={s.id} onClick={() => go(i)}
              className={`btn-flat flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12.5px] border transition ${i === slide ? 'bg-accent/15 border-accent/40 text-text' : 'bg-raised/40 border-line text-muted hover:text-text hover:border-hair'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${i === slide ? 'bg-accent' : 'bg-faint'}`} />
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <Guide open={guideOpen} onClose={() => setGuideOpen(false)} sec={guideSec} setSec={setGuideSec} />

      <Burst at={burst} />

      {toast && (
        <div className={`fixed bottom-16 right-5 z-40 px-4 py-3 rounded-xl border text-[14px] shadow-2xl anim-pop ${toast.ok ? 'bg-money/15 border-money/40 text-money' : 'bg-alert/15 border-alert/40 text-alert'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
