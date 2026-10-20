import { useState, useEffect } from 'react'
import { api, authHeader } from '../lib/api'
import { euro } from '../lib/format'
import { Panel, Pill } from './primitives'
import { I } from './icons'

export function Payment({ token, accounts, txs, onTransfer, offline, busy, fill }) {
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
