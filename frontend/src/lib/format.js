export const euro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
export const FLOOR = { request_rate: 0.5, error_ratio: 0.01, p95_latency: 0.005 }
export const signalFmt = {
  request_rate: { label: 'Débit', unit: 'req/s', f: (v) => v.toFixed(1) },
  error_ratio:  { label: "Taux d'erreur", unit: '', f: (v) => (v * 100).toFixed(1) + ' %' },
  p95_latency:  { label: 'Latence p95', unit: '', f: (v) => (v * 1000).toFixed(0) + ' ms' },
}
