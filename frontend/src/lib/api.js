export async function api(path, opts) {
  const r = await fetch(path, opts)
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.status === 204 ? null : r.json()
}
export const authHeader = (t) => ({ Authorization: `Bearer ${t}` })

/* Variante qui ne lève PAS : renvoie {ok, status, data} — utile pour gérer 401/429. */
export async function apiTry(path, opts) {
  try {
    const r = await fetch(path, opts)
    let data = null
    try { data = r.status === 204 ? null : await r.json() } catch { /* corps non-JSON */ }
    return { ok: r.ok, status: r.status, data }
  } catch (e) {
    return { ok: false, status: 0, data: { detail: String(e) } }
  }
}
