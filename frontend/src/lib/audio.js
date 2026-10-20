export let _audioCtx = null
export function playChime() {
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

export function playAlert() {
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
