import React, { useEffect, useState, useCallback } from 'react'

const GRAFANA = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3000'

async function j(url, opts) {
  const r = await fetch(url, opts)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

function Dot({ ok }) {
  return <span className={`inline-block w-3 h-3 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-500'}`} />
}

function Card({ title, children, accent }) {
  return (
    <div className={`rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 ${accent || ''}`}>
      <h2 className="text-xs uppercase tracking-widest text-slate-400 mb-3">{title}</h2>
      {children}
    </div>
  )
}

export default function App() {
  const [ml, setMl] = useState(null)
  const [actions, setActions] = useState([])
  const [health, setHealth] = useState({ ml: false, rem: false })
  const [tx, setTx] = useState(null)
  const [err, setErr] = useState(null)

  const poll = useCallback(async () => {
    try {
      const [state, acts, mlh, remh] = await Promise.allSettled([
        j('/api/ml/state'), j('/api/remediation/actions'),
        j('/api/ml/health'), j('/api/remediation/health'),
      ])
      if (state.status === 'fulfilled') setMl(state.value)
      if (acts.status === 'fulfilled') setActions(acts.value)
      setHealth({ ml: mlh.status === 'fulfilled', rem: remh.status === 'fulfilled' })
      setErr(null)
    } catch (e) { setErr(String(e)) }
  }, [])

  useEffect(() => { poll(); const id = setInterval(poll, 2000); return () => clearInterval(id) }, [poll])

  async function runTestTransaction() {
    setTx({ state: 'running' })
    try {
      const { access_token } = await j('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'demo', password: 'demo1234' }),
      })
      const auth = { Authorization: `Bearer ${access_token}` }
      const accounts = await j('/api/payment/accounts', { headers: auth })
      if (accounts.length < 2) throw new Error('comptes insuffisants')
      const res = await j('/api/payment/transactions', {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_account: accounts[0].id, to_account: accounts[1].id, amount: 1 }),
      })
      setTx({ state: 'ok', id: res.transaction_id })
    } catch (e) { setTx({ state: 'ko', msg: String(e) }) }
  }

  const anomaly = ml?.flag === 1
  const phase = ml?.status || '—'

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      <header className="border-b border-slate-700/60 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">PROJECT RESILIENCE-ALPHA</h1>
          <p className="text-xs text-slate-400">Supervision — détection &amp; reprise autonome</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${anomaly ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
          {anomaly ? '⚠ Incident détecté' : '● Service nominal'}
        </div>
      </header>

      <main className="p-6 grid gap-4 md:grid-cols-3">
        <Card title="État des composants">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><Dot ok={health.ml} /> Détecteur ML <span className="text-slate-400">({phase})</span></li>
            <li className="flex items-center gap-2"><Dot ok={health.rem} /> Moteur de remédiation</li>
            <li className="flex items-center gap-2"><Dot ok={!anomaly} /> API de paiement</li>
          </ul>
          <a href={GRAFANA} target="_blank" rel="noreferrer"
             className="mt-4 inline-block text-xs text-sky-400 hover:underline">Ouvrir Grafana (SOC) →</a>
        </Card>

        <Card title="Détection ML" accent={anomaly ? 'ring-1 ring-rose-500/50' : ''}>
          {ml ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Phase</span><span>{phase}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Score</span><span>{ml.score ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Cycles anormaux</span><span>{ml.consecutive}</span></div>
              {ml.features && (
                <div className="pt-2 border-t border-slate-700/60 space-y-1">
                  {Object.entries(ml.features).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs"><span className="text-slate-400">{k}</span><span>{Number(v).toFixed(3)}</span></div>
                  ))}
                </div>
              )}
              {anomaly && ml.explanation && (
                <p className="mt-2 text-xs text-rose-300">Cause : {ml.explanation}</p>
              )}
            </div>
          ) : <p className="text-slate-500 text-sm">En attente…</p>}
        </Card>

        <Card title="Transaction témoin">
          <p className="text-xs text-slate-400 mb-3">Preuve que le métier est utilisable (avant / après incident).</p>
          <button onClick={runTestTransaction}
                  className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-2 text-sm font-medium transition">
            Exécuter une transaction
          </button>
          {tx?.state === 'running' && <p className="mt-2 text-xs text-slate-400">En cours…</p>}
          {tx?.state === 'ok' && <p className="mt-2 text-xs text-emerald-300">✓ Transaction #{tx.id} réussie</p>}
          {tx?.state === 'ko' && <p className="mt-2 text-xs text-rose-300">✗ Échec : {tx.msg}</p>}
        </Card>

        <div className="md:col-span-3">
          <Card title="Historique de remédiation (reprise autonome)">
            {actions.length === 0 ? (
              <p className="text-slate-500 text-sm">Aucune action — le système est sain.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-400 text-xs uppercase tracking-wider">
                  <tr><th className="text-left py-1">Heure</th><th className="text-left">Cible</th><th className="text-left">Action</th><th className="text-left">Cause</th><th className="text-left">Résultat</th><th className="text-right">Reprise</th></tr>
                </thead>
                <tbody>
                  {actions.map((a, i) => (
                    <tr key={i} className="border-t border-slate-700/40">
                      <td className="py-1.5">{a.ts?.slice(11, 19)}</td>
                      <td>{a.target}</td>
                      <td>{a.action}</td>
                      <td className="text-slate-400 max-w-xs truncate">{a.reason}</td>
                      <td className={a.result === 'success' ? 'text-emerald-300' : 'text-amber-300'}>{a.result}</td>
                      <td className="text-right">{a.recovery_seconds ? `${a.recovery_seconds}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </main>
      {err && <p className="px-6 pb-4 text-xs text-slate-600">dernier poll : {err}</p>}
    </div>
  )
}
