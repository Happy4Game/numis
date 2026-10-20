export async function api(path, opts) {
  const r = await fetch(path, opts)
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.status === 204 ? null : r.json()
}
export const authHeader = (t) => ({ Authorization: `Bearer ${t}` })
