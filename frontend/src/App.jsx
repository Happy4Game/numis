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

/* ---------- briques UI ---------- */
function Panel({ title, hint, children, tone, extra }) {
  const ring = tone === 'alert' ? 'ring-1 ring-alert/60' : tone === 'warn' ? 'ring-1 ring-warn/50' : ''
  return (
    <section className={`rounded-2xl bg-panel border border-line anim-fadeup card-hover ${ring} ${extra || ''}`}>
      <header className="px-5 pt-4 pb-3 border-b border-line/70">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {hint && <p className="text-[13px] text-muted mt-0.5 leading-snug">{hint}</p>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}
function Dot({ ok }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-money' : 'bg-alert'}`} />
}
function Pill({ children, color }) {
  const c = { money: 'bg-money/15 text-money', warn: 'bg-warn/15 text-warn',
              alert: 'bg-alert/15 text-alert', accent: 'bg-accent/15 text-accent',
              muted: 'bg-line text-muted' }[color] || 'bg-line text-muted'
  return <span className={`px-2 py-0.5 rounded-full text-[12px] font-medium ${c}`}>{children}</span>
}

/* ---------- courbe du score (interactive) ---------- */
function ScoreChart({ data }) {
  const [idx, setIdx] = useState(null)
  const ref = useRef(null)
  if (!data || data.length < 2)
    return <div className="h-28 flex items-center text-[12px] text-muted">en attente de points...</div>
  const n = data.length
  const scores = data.map((d) => d.score)
  const min = Math.min(...scores, 0), max = Math.max(...scores, 0)
  const span = (max - min) || 1
  const X = (i) => (i / (n - 1)) * 100
  const Yv = (v) => 28 - ((v - min) / span) * 26 + 1
  const pts = data.map((d, i) => `${X(i)},${Yv(d.score)}`).join(' ')
  const zeroY = Yv(0)
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect()
    const rel = (e.clientX - r.left) / r.width
    setIdx(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))))
  }
  const hv = idx != null ? data[idx] : null
  return (
    <div ref={ref} className="relative h-28 select-none cursor-crosshair"
         onMouseMove={onMove} onMouseLeave={() => setIdx(null)}>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="#27324F" strokeWidth="0.4" strokeDasharray="2 2" />
        <polyline points={pts} fill="none" stroke="#5B8DEF" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {hv && (
        <>
          <div className="absolute top-0 bottom-0 w-px bg-muted/40" style={{ left: `${X(idx)}%` }} />
          <div className={`absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${hv.flag ? 'bg-alert' : 'bg-accent'}`}
               style={{ left: `${X(idx)}%`, top: `${(Yv(hv.score) / 30) * 100}%` }} />
          <div className="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none"
               style={{ left: `${Math.min(84, Math.max(16, X(idx)))}%`, top: `${(Yv(hv.score) / 30) * 100}%` }}>
            <div className="mb-1 bg-ink border border-line rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg">
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
      <Panel title="Numis — paiements" hint="Virements entre comptes de démonstration.">
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
    <Panel title="Numis — paiements" hint="Virements entre vos comptes de démonstration.">
      {/* comptes */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-xl bg-raised border border-line px-4 py-3">
            <div className="text-[12px] text-muted">{a.label}</div>
            <div key={a.balance} className="text-[22px] font-semibold font-mono tnum text-money mt-1 anim-pop">{euro(a.balance)}</div>
          </div>
        ))}
        {accounts.length === 0 && <div className="col-span-2 text-[13px] text-muted">Chargement des comptes…</div>}
      </div>

      {/* formulaire de virement */}
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[12px] text-muted">Depuis</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-lg bg-ink border border-line px-3 py-2 text-[14px] focus:border-accent outline-none">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] text-muted">Vers</span>
            <select value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg bg-ink border border-line px-3 py-2 text-[14px] focus:border-accent outline-none">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-[12px] text-muted">Montant</span>
          <input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg bg-ink border border-line px-3 py-2 text-[14px] font-mono tnum focus:border-accent outline-none" />
        </label>
        {from === to && <p className="text-[12px] text-warn">Choisissez deux comptes différents.</p>}
        <button type="submit" disabled={busy || from === to}
          className="w-full rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-50 text-ink font-semibold px-3 py-2.5 text-[14px] transition">
          {busy ? 'Envoi…' : 'Envoyer le paiement'}
        </button>
      </form>

      {/* journal */}
      <div className="mt-5">
        <div className="text-[12px] text-muted mb-2">Derniers mouvements</div>
        {txs.length === 0 ? (
          <p className="text-[13px] text-muted">Aucun mouvement pour l'instant. Envoyez un premier paiement.</p>
        ) : (
          <ul className="divide-y divide-line/60">
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
  decision:  { c: 'text-accent', b: 'bg-accent' },
  action:    { c: 'text-accent', b: 'bg-accent' },
  recovered: { c: 'text-money',  b: 'bg-money'  },
  error:     { c: 'text-alert',  b: 'bg-alert'  },
  info:      { c: 'text-muted',  b: 'bg-muted'  },
}

function DecisionFeed({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="mt-4 pt-3 border-t border-line/70">
      <div className="text-[12px] text-muted mb-2">Fil de décision de l'IA</div>
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
  if (!ml) return <Panel title="Détecteur d'anomalies (IA)" hint="En attente du service…"><div className="text-[13px] text-muted">Connexion au détecteur…</div></Panel>

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
      tone={tone}
      extra={anomaly ? 'anim-glow' : ''}
    >
      {ml.reasoning && <p className="text-[13px] text-text/80 italic mb-4">« {ml.reasoning} »</p>}

      {warming ? (
        <div>
          <div className="flex items-center justify-between text-[12px] text-muted mb-1">
            <span>Apprentissage de la normalité</span>
            <span className="font-mono tnum">{ml.samples}/{ml.warmup_target} observations</span>
          </div>
          <div className="h-2 rounded-full bg-ink overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: pct + '%' }} />
          </div>
          <p className="text-[12px] text-muted mt-2">
            ~{Math.max(0, (ml.warmup_target - ml.samples) * (ml.poll_interval || 10))} s restantes au rythme actuel.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-[12px] text-muted mb-1">
              <span>Score d'anomalie <span className="text-muted/70">(sous 0 = anormal)</span></span>
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
                <div key={k} className="flex items-center justify-between rounded-lg bg-raised border border-line px-3 py-2">
                  <span className="text-[13px] text-muted">{f.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-[12px] text-muted/80">normal <span className="font-mono tnum">{base != null ? f.f(base) : '—'}</span></span>
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
    <Panel title="Reprise autonome" hint="Actions décidées et vérifiées sans intervention humaine.">
      {actions.length === 0 ? (
        <p className="text-[13px] text-muted">Aucune action — le système est sain.</p>
      ) : (
        <ol className="space-y-3">
          {actions.map((a, i) => (
            <li key={i} className="rounded-lg bg-raised border border-line px-3 py-2.5 anim-slidein">
              <div className="flex items-center justify-between">
                <span className="font-mono tnum text-[12px] text-muted">{a.ts?.slice(11, 19)}</span>
                <Pill color={a.result === 'success' ? 'money' : 'warn'}>
                  {a.result === 'success' ? (a.recovery_seconds != null ? `rétabli en ${a.recovery_seconds}s` : 'rétabli') : a.result}
                </Pill>
              </div>
              <div className="text-[13px] mt-1">
                <span className="text-accent font-medium">{a.action}</span> → <span className="text-text">{a.target}</span>
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
  return (
    <Panel title="État des conteneurs (watchdog)"
           hint="Surveillance de vie de toute la stack — réparation automatique en cas de panne.">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {items.map((c) => {
          const up = c.status === 'running'
          return (
            <div key={c.name}
                 className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] anim-fadeup ${up ? 'border-line bg-raised' : 'border-alert/50 bg-alert/10'}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${up ? 'bg-money' : 'bg-alert anim-pulse'}`} />
              <span className="truncate">{c.name.replace('rsa-', '')}</span>
              {!up && <span className="ml-auto text-[11px] text-alert">{c.status}</span>}
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
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] bg-raised border border-line hover:border-accent">
        <span className={`w-2 h-2 rounded-full ${allUp ? 'bg-money' : 'bg-warn'}`} />
        Services <span className="font-mono tnum text-muted">{total ? `${up}/${total}` : '—'}</span>
        <span className="text-muted text-[10px]">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 z-20 rounded-xl border border-line bg-panel shadow-2xl p-2 max-h-[72vh] overflow-auto anim-fadeup">
            <div className="px-2 py-1 text-[11px] text-muted">Conteneurs de la stack ({up}/{total} actifs)</div>
            {items.length === 0 && <div className="px-2 py-2 text-[13px] text-muted">Chargement…</div>}
            {items.map((c) => {
              const m = SVC[c.name] || { label: c.name.replace('rsa-', ''), desc: '', icon: '📦' }
              const run = c.status === 'running'
              return (
                <div key={c.name} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-raised">
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
    (async () => {
      try {
        const { access_token } = await api('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'demo', password: 'demo1234' }),
        })
        setToken(access_token)
      } catch { setOffline(true) }
    })()
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
      const [s, acts, mh, rh] = await Promise.allSettled([
        api('/api/ml/state'), api('/api/remediation/actions'),
        api('/api/ml/health'), api('/api/remediation/health'),
      ])
      if (s.status === 'fulfilled') setMl(s.value)
      if (acts.status === 'fulfilled') setActions(acts.value)
      setHealth((h) => ({ ...h, ml: mh.status === 'fulfilled', rem: rh.status === 'fulfilled' }))
    }
    poll(); const id = setInterval(poll, 2000); return () => clearInterval(id)
  }, [])

  // paiement : après login puis toutes les 5s
  useEffect(() => {
    if (!token) return
    loadPayment(token); const id = setInterval(() => loadPayment(token), 5000); return () => clearInterval(id)
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
  const allUp = health.ml && health.rem && health.pay

  return (
    <div className="min-h-screen">
      {/* barre supérieure */}
      <header className="sticky top-0 z-10 bg-ink/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="#5B8DEF" strokeWidth="1.6" />
              <path d="M8 13.5c0 1.4 1.4 2.5 4 2.5s4-.8 4-2.2c0-3-7.5-1.3-7.5-4.3C8.5 8 9.8 7 12 7s4 1 4 2.4" stroke="#35D6A4" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <div className="leading-tight">
              <div className="font-bold text-[16px] shimmer-text">Numis</div>
              <div className="text-[11px] text-muted -mt-0.5">paiements · supervision</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ServicesMenu items={containers} />
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium ${anomaly ? 'bg-alert/15 text-alert' : 'bg-money/15 text-money'}`}>
              <span className={`w-2 h-2 rounded-full ${anomaly ? 'bg-alert' : 'bg-money'}`} />
              {anomaly ? 'Incident en cours' : 'Système sain'}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6">
        {/* état des composants */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 text-[13px]">
          <span className="text-muted">Composants :</span>
          <span className="flex items-center gap-2"><Dot ok={health.pay} /> API de paiement</span>
          <span className="flex items-center gap-2"><Dot ok={health.ml} /> Détecteur IA</span>
          <span className="flex items-center gap-2"><Dot ok={health.rem} /> Moteur de reprise</span>
          <a href={`http://${location.hostname}:3000`} target="_blank" rel="noreferrer"
             className="ml-auto text-accent hover:underline">Ouvrir Grafana (métriques & logs)</a>
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
      </main>

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 px-4 py-3 rounded-xl border text-[14px] shadow-lg ${toast.ok ? 'bg-money/15 border-money/40 text-money' : 'bg-alert/15 border-alert/40 text-alert'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
