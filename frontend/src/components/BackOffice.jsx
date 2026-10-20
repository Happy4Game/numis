import { useState, useRef, useEffect } from 'react'
import { apiTry, authHeader } from '../lib/api'

/* Back-office protégé par authentification forte (consigne additionnelle 1) :
   identifiant -> reconnaissance faciale (webcam du PC Hôte) -> mot de passe.
   L'état est aussi signalé par la LED de l'ESP8266 (piloté côté serveur). */
export function BackOffice({ open, onClose }) {
  const [mode, setMode] = useState('login')     // 'login' | 'enroll' | 'habilitations'
  const [step, setStep] = useState('user')       // login : 'user' | 'face' | 'password'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [faceToken, setFaceToken] = useState('')
  const [token, setToken] = useState('')         // JWT back-office
  const [msg, setMsg] = useState(null)           // { kind:'ok'|'err'|'info', text }
  const [busy, setBusy] = useState(false)
  const [hab, setHab] = useState([])
  const [enrollName, setEnrollName] = useState('')
  const [shots, setShots] = useState([])
  const videoRef = useRef(null), canvasRef = useRef(null), streamRef = useRef(null)

  const stopCam = () => {
    const s = streamRef.current
    if (s) { s.getTracks().forEach((t) => t.stop()); streamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
  }
  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = s
      if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play() }
      return true
    } catch (e) { setMsg({ kind: 'err', text: 'Caméra inaccessible : ' + (e.message || e) }); return false }
  }
  const grab = () => {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c || !v.videoWidth) return null
    const w = 320, h = Math.round((v.videoHeight / v.videoWidth) * 320)
    c.width = w; c.height = h
    c.getContext('2d').drawImage(v, 0, 0, w, h)
    return c.toDataURL('image/jpeg', 0.8)
  }

  const reset = () => {
    setStep('user'); setUsername(''); setPassword(''); setFaceToken('')
    setToken(''); setMsg(null); setHab([]); setEnrollName(''); setShots([]); setMode('login')
  }
  const close = async () => {
    if (token) apiTry('/api/auth/led/off', { method: 'POST', headers: authHeader(token) })
    stopCam(); reset(); onClose()
  }
  useEffect(() => { if (!open) stopCam(); return () => stopCam() }, [open])

  // --- étape 1 -> 2 : on démarre la caméra pour confirmer le visage ---
  const goFace = async () => {
    if (!username.trim()) { setMsg({ kind: 'err', text: 'Saisissez un identifiant.' }); return }
    setMsg({ kind: 'info', text: 'Regardez la caméra puis confirmez.' })
    setStep('face'); setTimeout(startCam, 50)
  }
  const doIdentify = async () => {
    const image = grab()
    if (!image) { setMsg({ kind: 'err', text: 'Image non capturée, réessayez.' }); return }
    setBusy(true)
    const r = await apiTry('/api/auth/identify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), image }),
    })
    setBusy(false); stopCam()
    if (r.ok && r.data?.recognized) {
      setFaceToken(r.data.face_token); setStep('password')
      setMsg({ kind: 'ok', text: 'Visage reconnu — saisissez le mot de passe.' })
    } else if (r.status === 429) {
      setStep('user'); setUsername('')
      setMsg({ kind: 'err', text: r.data?.detail || 'Verrouillé, réessayez plus tard.' })
    } else {
      setStep('user'); setUsername('')   // consigne : identifiant remis à vide, caméra éteinte
      setMsg({ kind: 'err', text: r.data?.detail || 'Visage non reconnu — recommencez.' })
    }
  }
  const doLogin = async () => {
    setBusy(true)
    const r = await apiTry('/api/auth/backoffice/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password, face_token: faceToken }),
    })
    setBusy(false)
    if (r.ok && r.data?.access_token) {
      setToken(r.data.access_token); setMode('habilitations'); setMsg({ kind: 'ok', text: 'Accès back-office accordé.' })
      loadHab(r.data.access_token)
    } else {
      setStep('user'); setUsername(''); setPassword(''); setFaceToken('')
      setMsg({ kind: 'err', text: r.data?.detail || 'Échec — reprise de l’identification.' })
    }
  }

  // --- habilitations ---
  const loadHab = async (t = token) => {
    const r = await apiTry('/api/auth/habilitations', { headers: authHeader(t) })
    if (r.ok) setHab(r.data || [])
  }
  const capture = () => { const s = grab(); if (s) setShots((a) => [...a, s].slice(0, 6)) }
  const submitEnroll = async () => {
    if (!enrollName.trim() || shots.length < 3) {
      setMsg({ kind: 'err', text: 'Identifiant + au moins 3 photos requis.' }); return
    }
    setBusy(true)
    const headers = { 'Content-Type': 'application/json', ...(token ? authHeader(token) : {}) }
    const r = await apiTry('/api/auth/habilitations/enroll', {
      method: 'POST', headers,
      body: JSON.stringify({ username: enrollName.trim(), images: shots }),
    })
    setBusy(false); stopCam()
    if (r.ok) {
      setMsg({ kind: 'ok', text: `Habilitation enregistrée (${r.data?.samples} photo(s)).` })
      setShots([]); setEnrollName('')
      if (token) { setMode('habilitations'); loadHab() } else { setMode('login'); setStep('user') }
    } else {
      setMsg({ kind: 'err', text: r.data?.detail || 'Enrôlement échoué.' })
    }
  }
  const removeHab = async (u) => {
    const r = await apiTry('/api/auth/habilitations/' + encodeURIComponent(u), { method: 'DELETE', headers: authHeader(token) })
    if (r.ok) loadHab()
  }
  const openEnroll = () => { setMode('enroll'); setShots([]); setMsg({ kind: 'info', text: 'Capturez 3 à 6 photos du visage.' }); setTimeout(startCam, 50) }

  if (!open) return null
  const Msg = () => msg && (
    <div className={'rounded-lg px-3 py-2 text-[12.5px] mb-3 border ' +
      (msg.kind === 'ok' ? 'bg-money/10 border-money/40 text-money'
        : msg.kind === 'err' ? 'bg-alert/10 border-alert/40 text-alert'
        : 'bg-accent/10 border-accent/40 text-sky2')}>{msg.text}</div>
  )
  const field = 'w-full rounded-lg bg-ink border border-line px-3 py-2 text-[14px] focus:border-accent outline-none'
  const btn = 'w-full rounded-lg bg-gradient-to-r from-accent to-sky2 hover:brightness-110 disabled:opacity-50 text-ink font-semibold px-3 py-2.5 text-[14px]'
  const Cam = () => (
    <div className="rounded-xl overflow-hidden border border-line bg-ink mb-3 relative">
      <video ref={videoRef} playsInline muted className="w-full h-[220px] object-cover bg-black" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute left-2 top-2 text-[10px] uppercase tracking-wider text-sky2 bg-ink/70 px-2 py-0.5 rounded">caméra PC Hôte</div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-deep/80 backdrop-blur-sm" onClick={close}>
      <div className="relative w-full max-w-md rounded-2xl glass border border-hair shadow-2xl anim-fadeup" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line/60">
          <div className="flex items-center gap-2">
            <span className="badge !w-8 !h-8">🔐</span>
            <div><div className="text-[15px] font-semibold text-text">Back-office sécurisé</div>
              <div className="text-[11px] text-faint">authentification forte — visage + mot de passe</div></div>
          </div>
          <button onClick={close} className="btn-flat w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-raised/70">✕</button>
        </header>
        <div className="p-5">
          <Msg />

          {mode === 'login' && step === 'user' && (
            <div className="space-y-3">
              <label className="block"><span className="text-[11.5px] uppercase tracking-wider text-faint">Identifiant</span>
                <input className={field + ' mt-1'} value={username} autoFocus
                  onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goFace()} /></label>
              <button className={btn} onClick={goFace}>Continuer</button>
              <button className="w-full text-[12px] text-sky2 hover:text-text py-1" onClick={openEnroll}>Première mise en service — enrôler un visage</button>
            </div>
          )}

          {mode === 'login' && step === 'face' && (
            <div className="space-y-3">
              <Cam />
              <div className="text-[12px] text-muted">Identifiant : <span className="text-text font-mono">{username}</span></div>
              <button className={btn} disabled={busy} onClick={doIdentify}>{busy ? 'Vérification…' : 'Confirmer mon visage'}</button>
              <button className="w-full text-[12px] text-muted hover:text-text py-1" onClick={() => { stopCam(); setStep('user') }}>Annuler</button>
            </div>
          )}

          {mode === 'login' && step === 'password' && (
            <div className="space-y-3">
              <div className="text-[12px] text-money">✓ Visage confirmé pour <span className="font-mono">{username}</span></div>
              <label className="block"><span className="text-[11.5px] uppercase tracking-wider text-faint">Mot de passe</span>
                <input type="password" className={field + ' mt-1'} value={password} autoFocus
                  onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} /></label>
              <button className={btn} disabled={busy} onClick={doLogin}>{busy ? 'Connexion…' : 'Accéder au back-office'}</button>
            </div>
          )}

          {mode === 'enroll' && (
            <div className="space-y-3">
              <Cam />
              <label className="block"><span className="text-[11.5px] uppercase tracking-wider text-faint">Identifiant à habiliter</span>
                <input className={field + ' mt-1'} value={enrollName} onChange={(e) => setEnrollName(e.target.value)} /></label>
              <div className="flex items-center gap-2">
                <button className="flex-1 rounded-lg bg-raised border border-line hover:border-accent text-text px-3 py-2 text-[13px]" onClick={capture}>Capturer ({shots.length}/6)</button>
                <button className="flex-1 rounded-lg bg-money/15 text-money border border-money/30 hover:bg-money/25 px-3 py-2 text-[13px] disabled:opacity-50" disabled={busy || shots.length < 3 || !enrollName.trim()} onClick={submitEnroll}>Enrôler</button>
              </div>
              <button className="w-full text-[12px] text-muted hover:text-text py-1" onClick={() => { stopCam(); token ? setMode('habilitations') : (setMode('login'), setStep('user')) }}>Annuler</button>
            </div>
          )}

          {mode === 'habilitations' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[13px] text-text font-medium">Habilitations (visages autorisés)</div>
                <button className="text-[12px] text-sky2 hover:text-text" onClick={openEnroll}>+ Enrôler</button>
              </div>
              {hab.length === 0 ? <div className="text-[12px] text-muted">Aucune identité enrôlée.</div> : (
                <ul className="divide-y divide-line/50 rounded-lg border border-line overflow-hidden">
                  {hab.map((u) => (
                    <li key={u.username} className="flex items-center justify-between px-3 py-2 text-[13px] bg-raised/40">
                      <span>{u.username} <span className="text-faint font-mono">· {u.samples} photo(s)</span></span>
                      <button className="text-[11px] text-alert hover:brightness-125" onClick={() => removeHab(u.username)}>révoquer</button>
                    </li>
                  ))}
                </ul>
              )}
              <button className="w-full text-[12px] text-muted hover:text-text py-1 border-t border-line/50 pt-3" onClick={close}>Se déconnecter</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
