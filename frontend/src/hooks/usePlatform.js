import { useState, useEffect, useCallback } from 'react'
import { api, authHeader } from '../lib/api'

/* Couche données : connexion démo, supervision (IA/reprise/conteneurs/santé),
   chargement du paiement et exécution d'un virement. Aucune logique d'UI ici. */
export function usePlatform() {
  const [token, setToken] = useState(null)
  const [offline, setOffline] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [txs, setTxs] = useState([])
  const [ml, setMl] = useState(null)
  const [actions, setActions] = useState([])
  const [containers, setContainers] = useState([])
  const [health, setHealth] = useState({ ml: false, rem: false, pay: false })

  // connexion auto (démo), avec reprise si le backend démarre encore
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

  const loadPayment = useCallback(async (t) => {
    try {
      const [a, x] = await Promise.all([
        api('/api/payment/accounts', { headers: authHeader(t) }),
        api('/api/payment/transactions?limit=10', { headers: authHeader(t) }),
      ])
      setAccounts(a); setTxs(x); setHealth((h) => ({ ...h, pay: true }))
    } catch { setHealth((h) => ({ ...h, pay: false })) }
  }, [])

  // supervision toutes les 2 s
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

  // paiement : après login puis toutes les 3 s
  useEffect(() => {
    if (!token) return
    loadPayment(token); const id = setInterval(() => loadPayment(token), 3000); return () => clearInterval(id)
  }, [token, loadPayment])

  const transfer = useCallback(async (body) => {
    const res = await api('/api/payment/transactions', {
      method: 'POST', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await loadPayment(token)
    return res
  }, [token, loadPayment])

  return { token, offline, accounts, txs, ml, actions, containers, health, transfer }
}
