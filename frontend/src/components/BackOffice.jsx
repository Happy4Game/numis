import { useState, useRef, useEffect } from 'react'
import { apiTry, authHeader } from '../lib/api'

/* Back-office protégé par authentification forte (consigne additionnelle 1) :
   identifiant -> reconnaissance faciale (webcam PC Hôte) -> mot de passe,
   + gestion des comptes & habilitations. */
export function BackOffice({ open, onClose, onAuth, onLogout }) {
  const [view, setView] = useState('login')     // login | enrollFace | manage | newAccount
  const [step, setStep] = useState('user')       // login : user | face | password
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [faceToken, setFaceToken] = useState('')
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState({ bootstrap: true, enrolled: 0 })
  const [accounts, setAccounts] = useState([])
  const [enrollTarget, setEnrollTarget] = useState('demo')
  const [shots, setShots] = useState([])
  const [nu, setNu] = useState({ username: '', password: '' })
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
    } catch (e) { setMsg({ kind: 'err', text: 'Caméra inaccessible : ' + (e.message || e) }) }
  }
  const grab = () => {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c || !v.videoWidth) return null
    const w = 320, h = Math.round((v.videoHeight / v.videoWidth) * 320)
    c.width = w; c.height = h
    c.getContext('2d').drawImage(v, 0, 0, w, h)
    return c.toDataURL('image/jpeg', 0.8)
  }

  const fetchStatus = async () => {
    const r = await apiTry('/api/auth/backoffice/status')
    if (r.ok) setStatus(r.data)
  }
  useEffect(() => { if (open) { fetchStatus(); if (token) loadAccounts() } ; if (!open) stopCam(); return () => stopCam() }, [open])

  const reset = () => {
    setView('login'); setStep('user'); setUsername(''); setPassword(''); setFaceToken('')
    setToken(''); setMsg(null); setAccounts([]); setShots([]); setNu({ username: '', password: '' })
  }
  const close = () => { stopCam(); if (token && view !== 'manage') setView('manage'); setMsg(null); onClose() }
  const logout = () => { if (token) apiTry('/api/auth/led/off', { method: 'POST', headers: authHeader(token) }); stopCam(); reset(); onLogout && onLogout() }

  // ---------- connexion ----------
  const goFace = () => {
    if (!username.trim()) { setMsg({ kind: 'err', text: 'Saisissez un identifiant.' }); return }
    setMsg({ kind: 'info', text: 'Regardez la caméra, puis confirmez.' }); setStep('face'); setTimeout(startCam, 60)
  }
  const doIdentify = async () => {
    const image = grab(); if (!image) { setMsg({ kind: 'err', text: 'Image non capturée.' }); return }
    setBusy(true)
    const r = await apiTry('/api/auth/identify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), image }),
    })
    setBusy(false); stopCam()
    if (r.ok && r.data?.recognized) { setFaceToken(r.data.face_token); setStep('password'); setMsg({ kind: 'ok', text: 'Visage reconnu — saisissez le mot de passe.' }) }
    else { setStep('user'); setUsername(''); setMsg({ kind: 'err', text: r.data?.detail || 'Visage non reconnu.' }) }
  }
  const doLogin = async () => {
    setBusy(true)
    const r = await apiTry('/api/auth/backoffice/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password, face_token: faceToken }),
    })
    setBusy(false)
    if (r.ok && r.data?.access_token) { setToken(r.data.access_token); setMsg(null); setView('manage'); loadAccounts(r.data.access_token); onAuth && onAuth(username.trim()) }
    else { setStep('user'); setPassword(''); setFaceToken(''); setMsg({ kind: 'err', text: r.data?.detail || 'Échec — reprise de l’identification.' }) }
  }

  // ---------- comptes & habilitations ----------
  const loadAccounts = async (t = token) => {
    const r = await apiTry('/api/auth/backoffice/accounts', { headers: authHeader(t) })
    if (r.ok) setAccounts(r.data || [])
  }
  const openEnroll = (target) => { setEnrollTarget(target || 'demo'); setShots([]); setView('enrollFace'); setMsg({ kind: 'info', text: 'Capturez 3 à 6 photos du visage, puis enregistrez.' }); setTimeout(startCam, 60) }
  const capture = () => { const s = grab(); if (s) setShots((a) => [...a, s].slice(0, 6)) }
  const submitEnroll = async () => {
    const u = enrollTarget.trim()
    if (!u || shots.length < 3) { setMsg({ kind: 'err', text: 'Identifiant + au moins 3 photos requis.' }); return }
    setBusy(true)
    const headers = { 'Content-Type': 'application/json', ...(token ? authHeader(token) : {}) }
    const r = await apiTry('/api/auth/habilitations/enroll', { method: 'POST', headers, body: JSON.stringify({ username: u, images: shots }) })
    setBusy(false); stopCam()
    if (r.ok) {
      setShots([])
      if (token) { setMsg({ kind: 'ok', text: `Visage enrôlé pour ${u}.` }); setView('manage'); loadAccounts() }
      else { await fetchStatus(); setUsername(u); setView('login'); setStep('user'); setMsg({ kind: 'ok', text: 'Visage enrôlé — connectez-vous maintenant.' }) }
    } else setMsg({ kind: 'err', text: r.data?.detail || 'Enrôlement échoué.' })
  }
  const revokeFace = async (u) => { await apiTry('/api/auth/habilitations/' + encodeURIComponent(u), { method: 'DELETE', headers: authHeader(token) }); loadAccounts() }
  const createAccount = async () => {
    if (!nu.username.trim() || nu.password.length < 4) { setMsg({ kind: 'err', text: 'Identifiant + mot de passe (4+ caractères).' }); return }
    setBusy(true)
    const r = await apiTry('/api/auth/backoffice/users', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader(token) }, body: JSON.stringify(nu) })
    setBusy(false)
    if (r.ok) { const u = nu.username.trim(); setNu({ username: '', password: '' }); setMsg({ kind: 'ok', text: `Compte « ${u} » créé. Enrôlez son visage.` }); openEnroll(u) }
    else setMsg({ kind: 'err', text: r.data?.detail || 'Création échouée.' })
  }
  const deleteAccount = async (u) => {
    const r = await apiTry('/api/auth/backoffice/users/' + encodeURIComponent(u), { method: 'DELETE', headers: authHeader(token) })
    if (r.ok) loadAccounts(); else setMsg({ kind: 'err', text: r.data?.detail || 'Suppression refusée.' })
  }

  if (!open) return null
  const field = 'w-full rounded-lg bg-ink border border-line px-3 py-2 text-[14px] focus:border-accent outline-none'
  const primary = 'w-full rounded-lg bg-gradient-to-r from-accent to-sky2 hover:brightness-110 disabled:opacity-50 text-ink font-semibold px-3 py-2.5 text-[14px]'
  const msgEl = msg && (
    <div className={'rounded-lg px-3 py-2 text-[12.5px] mb-3 border ' +
      (msg.kind === 'ok' ? 'bg-money/10 border-money/40 text-money' : msg.kind === 'err' ? 'bg-alert/10 border-alert/40 text-alert' : 'bg-accent/10 border-accent/40 text-sky2')}>{msg.text}</div>)
  const cam = () => (
    <div className="rounded-xl overflow-hidden border border-line bg-ink mb-3 relative">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-[220px] object-cover bg-black" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute left-2 top-2 text-[10px] uppercase tracking-wider text-sky2 bg-ink/70 px-2 py-0.5 rounded">caméra PC Hôte</div>
    </div>)
  const stepper = () => {
    const steps = [['user', '1', 'Identifiant'], ['face', '2', 'Visage'], ['password', '3', 'Mot de passe']]
    const idx = { user: 0, face: 1, password: 2 }[step]
    return (
      <div className="flex items-center gap-1 mb-4">
        {steps.map(([k, n, label], i) => (
          <div key={k} className="flex items-center gap-1 flex-1">
            <div className={'flex items-center gap-1.5 ' + (i <= idx ? 'text-text' : 'text-faint')}>
              <span className={'w-5 h-5 grid place-items-center rounded-full text-[11px] font-mono ' + (i < idx ? 'bg-money text-ink' : i === idx ? 'bg-accent text-ink' : 'bg-line text-muted')}>{i < idx ? '✓' : n}</span>
              <span className="text-[11.5px] hidden sm:inline">{label}</span>
            </div>
            {i < 2 && <div className={'flex-1 h-px ' + (i < idx ? 'bg-money/50' : 'bg-line')} />}
          </div>
        ))}
      </div>)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-deep/80 backdrop-blur-sm" onClick={close}>
      <div className="relative w-full max-w-md rounded-2xl glass border border-hair shadow-2xl anim-fadeup" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line/60">
          <div className="flex items-center gap-2">
            <span className="badge !w-8 !h-8">🔐</span>
            <div><div className="text-[15px] font-semibold text-text">Back-office sécurisé</div>
              <div className="text-[11px] text-faint">{view === 'manage' ? `connecté : ${username}` : 'visage + mot de passe'}</div></div>
          </div>
          <button onClick={close} className="btn-flat w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-raised/70">✕</button>
        </header>
        <div className="p-5">
          {msgEl}

          {/* ---------- CONNEXION ---------- */}
          {view === 'login' && (<>
            {stepper()}
            {status.bootstrap && step === 'user' && (
              <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 mb-3 text-[12.5px] text-warn">
                <b>Première mise en service.</b> Aucun visage n'est encore enregistré. Commencez par
                enrôler le visage d'un compte existant (par défaut <span className="font-mono">demo</span>).
                <button className="mt-2 w-full rounded-lg bg-warn/20 hover:bg-warn/30 text-warn border border-warn/40 px-3 py-1.5 text-[12.5px] font-medium" onClick={() => openEnroll('demo')}>Enrôler un visage →</button>
              </div>
            )}
            {step === 'user' && (<div className="space-y-3">
              <label className="block"><span className="text-[11.5px] uppercase tracking-wider text-faint">Identifiant</span>
                <input className={field + ' mt-1'} value={username} autoFocus onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goFace()} /></label>
              <button className={primary} onClick={goFace}>Continuer</button>
            </div>)}
            {step === 'face' && (<div className="space-y-3">
              {cam()}
              <div className="text-[12px] text-muted">Identifiant : <span className="text-text font-mono">{username}</span></div>
              <button className={primary} disabled={busy} onClick={doIdentify}>{busy ? 'Vérification…' : 'Confirmer mon visage'}</button>
              <button className="w-full text-[12px] text-muted hover:text-text py-1" onClick={() => { stopCam(); setStep('user') }}>Annuler</button>
            </div>)}
            {step === 'password' && (<div className="space-y-3">
              <div className="text-[12px] text-money">✓ Visage confirmé pour <span className="font-mono">{username}</span></div>
              <label className="block"><span className="text-[11.5px] uppercase tracking-wider text-faint">Mot de passe</span>
                <input type="password" className={field + ' mt-1'} value={password} autoFocus onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} /></label>
              <button className={primary} disabled={busy} onClick={doLogin}>{busy ? 'Connexion…' : 'Accéder au back-office'}</button>
            </div>)}
          </>)}

          {/* ---------- ENRÔLEMENT D'UN VISAGE ---------- */}
          {view === 'enrollFace' && (<div className="space-y-3">
            {cam()}
            <label className="block"><span className="text-[11.5px] uppercase tracking-wider text-faint">Identifiant à habiliter</span>
              <input className={field + ' mt-1'} value={enrollTarget} onChange={(e) => setEnrollTarget(e.target.value)} readOnly={!!token} /></label>
            <div className="flex items-center gap-2">
              <button className="flex-1 rounded-lg bg-raised border border-line hover:border-accent text-text px-3 py-2 text-[13px]" onClick={capture}>Capturer ({shots.length}/6)</button>
              <button className="flex-1 rounded-lg bg-money/15 text-money border border-money/30 hover:bg-money/25 px-3 py-2 text-[13px] disabled:opacity-50" disabled={busy || shots.length < 3 || !enrollTarget.trim()} onClick={submitEnroll}>Enregistrer</button>
            </div>
            <button className="w-full text-[12px] text-muted hover:text-text py-1" onClick={() => { stopCam(); token ? setView('manage') : (setView('login'), setStep('user')) }}>Annuler</button>
          </div>)}

          {/* ---------- GESTION DES COMPTES ---------- */}
          {view === 'manage' && (<div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-text font-medium">Comptes & accès</div>
              <button className="text-[12px] text-sky2 hover:text-text" onClick={() => { setNu({ username: '', password: '' }); setView('newAccount') }}>+ Nouveau compte</button>
            </div>
            {accounts.length === 0 ? <div className="text-[12px] text-muted">Aucun compte.</div> : (
              <ul className="divide-y divide-line/50 rounded-lg border border-line overflow-hidden">
                {accounts.map((a) => (
                  <li key={a.username} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] bg-raised/40">
                    <div className="min-w-0">
                      <div className="text-text truncate">{a.username}</div>
                      <div className="text-[11px]">{a.has_face ? <span className="text-money">● visage enrôlé ({a.face_samples})</span> : <span className="text-warn">● pas de visage</span>}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-[11px]">
                      <button className="text-sky2 hover:text-text" onClick={() => openEnroll(a.username)}>{a.has_face ? 'ré-enrôler' : 'enrôler'}</button>
                      {a.has_face && <button className="text-muted hover:text-text" onClick={() => revokeFace(a.username)}>révoquer</button>}
                      {a.username !== 'demo' && a.username !== username && <button className="text-alert hover:brightness-125" onClick={() => deleteAccount(a.username)}>supprimer</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button className="w-full text-[12px] text-alert/90 hover:text-alert py-1 border-t border-line/50 pt-3" onClick={logout}>Se déconnecter</button>
          </div>)}

          {/* ---------- NOUVEAU COMPTE ---------- */}
          {view === 'newAccount' && (<div className="space-y-3">
            <div className="text-[13px] text-text font-medium">Nouveau compte</div>
            <label className="block"><span className="text-[11.5px] uppercase tracking-wider text-faint">Identifiant</span>
              <input className={field + ' mt-1'} value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} /></label>
            <label className="block"><span className="text-[11.5px] uppercase tracking-wider text-faint">Mot de passe</span>
              <input type="password" className={field + ' mt-1'} value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></label>
            <button className={primary} disabled={busy} onClick={createAccount}>{busy ? 'Création…' : 'Créer le compte + enrôler le visage'}</button>
            <button className="w-full text-[12px] text-muted hover:text-text py-1" onClick={() => setView('manage')}>Retour</button>
          </div>)}
        </div>
      </div>
    </div>
  )
}
