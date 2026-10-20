import { useState, useEffect, useRef } from 'react'
import { usePlatform } from './hooks/usePlatform'
import { playChime, playAlert } from './lib/audio'
import { Stat, Dot, Clock } from './components/primitives'
import { Payment } from './components/Payment'
import { Ai } from './components/Ai'
import { Remediation } from './components/Remediation'
import { Containers } from './components/Containers'
import { ServicesMenu } from './components/ServicesMenu'
import { Synthese } from './components/Synthese'
import { Guide } from './components/Guide'
import { Burst } from './components/Burst'
import { GUIDE_ICON } from './components/icons'

export default function App() {
  const { token, offline, accounts, txs, ml, actions, containers, health, transfer } = usePlatform()

  // état d'interface (slides, guide, retours sensoriels)
  const [slide, setSlide] = useState(1)      // 0 détection&reprise · 1 essentiel · 2 conteneurs
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideSec, setGuideSec] = useState(0)
  const [burst, setBurst] = useState(null)
  const flash = useRef(false)
  const pointer = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const guideOpenRef = useRef(false); guideOpenRef.current = guideOpen
  const prevAnom = useRef(false)

  const SLIDES = [
    { id: 'detection', label: 'Détection & reprise' },
    { id: 'essentiel', label: "Vue d'ensemble" },
    { id: 'conteneurs', label: 'Conteneurs' },
  ]
  const go = (i) => setSlide(Math.max(0, Math.min(SLIDES.length - 1, i)))

  // navigation clavier (ignorée en saisie ou guide ouvert ; Échap ferme le guide)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return
      if (guideOpenRef.current) { if (e.key === 'Escape') setGuideOpen(false); return }
      if (e.key === 'ArrowRight') setSlide((s) => Math.min(SLIDES.length - 1, s + 1))
      if (e.key === 'ArrowLeft') setSlide((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // suivi du curseur (pour l'éclat de paiement)
  useEffect(() => {
    const onDown = (e) => { pointer.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])

  const anomaly = ml?.flag === 1

  // alerte sonore au front montant d'une anomalie
  useEffect(() => { if (anomaly && !prevAnom.current) playAlert(); prevAnom.current = anomaly }, [anomaly])

  const onTransfer = async (body) => {
    setBusy(true)
    try {
      const res = await transfer(body)
      setToast({ ok: true, msg: `Paiement #${res.transaction_id} réglé` })
      flash.current = true
      playChime()
      setBurst({ x: pointer.current.x, y: pointer.current.y, id: Date.now() })
      setTimeout(() => setBurst(null), 850)
    } catch (e) {
      const s = String(e)
      const msg = s.includes('400') ? 'solde insuffisant'
        : s.includes('429') ? 'trafic régulé (réessayez)'
        : 'service indisponible'
      setToast({ ok: false, msg: `Paiement refusé (${msg})` })
    } finally {
      setBusy(false); setTimeout(() => setToast(null), 3500)
    }
  }

  const upC = containers.filter((c) => c.status === 'running').length
  const feat = ml?.features || {}

  const EdgeBtn = ({ dir, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} aria-label={dir === 'l' ? 'Précédent' : 'Suivant'}
      className={`edge-btn hidden md:grid place-items-center absolute top-1/2 -translate-y-1/2 ${dir === 'l' ? 'left-3' : 'right-3'} z-20 w-11 h-11 rounded-full glass border border-hair text-[20px] text-muted hover:text-text disabled:opacity-0 disabled:pointer-events-none`}>
      {dir === 'l' ? '‹' : '›'}
    </button>
  )

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <header className="shrink-0 relative z-40 border-b border-line/70 bg-ink/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="badge !w-10 !h-10 !rounded-xl">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="#7FB0FF" strokeWidth="1.6" />
                <path d="M8 13.5c0 1.4 1.4 2.5 4 2.5s4-.8 4-2.2c0-3-7.5-1.3-7.5-4.3C8.5 8 9.8 7 12 7s4 1 4 2.4" stroke="#35D6A4" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <div className="leading-tight">
              <div className="font-bold text-[18px] shimmer-text">Numis</div>
              <div className="text-[10.5px] uppercase tracking-[.16em] text-faint -mt-0.5">paiements · supervision</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium ${anomaly ? 'bg-alert/15 text-alert ring-1 ring-alert/30' : 'bg-money/15 text-money ring-1 ring-money/30'}`}>
              <span className={`w-2 h-2 rounded-full ${anomaly ? 'bg-alert' : 'bg-money'}`} />
              {anomaly ? 'Incident en cours' : 'Système sain'}
            </div>
            <button onClick={() => setGuideOpen(true)} title="Comprendre le système"
              className="btn-flat flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] bg-raised/70 border border-line text-muted hover:text-text hover:border-accent">
              {GUIDE_ICON}<span className="hidden sm:inline">Comprendre</span>
            </button>
            <ServicesMenu items={containers} />
            <Clock />
          </div>
        </div>
      </header>

      <div className="relative flex-1 min-h-0">
        <EdgeBtn dir="l" onClick={() => go(slide - 1)} disabled={slide === 0} />
        <EdgeBtn dir="r" onClick={() => go(slide + 1)} disabled={slide === SLIDES.length - 1} />
        <div className="h-full overflow-hidden">
          <div className="flex h-full transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
               style={{ transform: `translateX(-${slide * 100}%)` }}>

            <section className="w-full shrink-0 h-full overflow-y-auto px-4 sm:px-6 py-4">
              <div className="max-w-7xl mx-auto h-full grid lg:grid-cols-2 gap-4 min-h-0">
                <Ai ml={ml} fill />
                <Remediation actions={actions} fill />
              </div>
            </section>

            <section className="w-full shrink-0 h-full overflow-y-auto px-4 sm:px-6 py-4">
              <div className="max-w-7xl mx-auto h-full flex flex-col gap-4 min-h-0">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
                  <Stat label="Système" bar={anomaly ? '#F26D6D' : '#35D6A4'} delay="d1"
                        value={anomaly ? 'Incident' : 'Sain'}
                        sub={<span className="flex items-center gap-1.5"><Dot ok={!anomaly} /> supervision</span>} />
                  <Stat label="Débit" bar="#7FB0FF" delay="d2" value={feat.request_rate != null ? feat.request_rate.toFixed(1) : '—'} sub="requêtes / s" />
                  <Stat label="Latence p95" bar="#5B8DEF" delay="d3" value={feat.p95_latency != null ? (feat.p95_latency * 1000).toFixed(0) : '—'} sub="millisecondes" />
                  <Stat label="Taux d'erreur" bar={feat.error_ratio > 0.05 ? '#F26D6D' : '#F2B64B'} delay="d4" value={feat.error_ratio != null ? (feat.error_ratio * 100).toFixed(1) + '%' : '—'} sub="API paiement" />
                  <Stat label="Conteneurs" bar="#F2B64B" delay="d5" value={containers.length ? `${upC}/${containers.length}` : '—'} sub="actifs" />
                  <Stat label="Reprises" bar="#A78BFA" delay="d6" value={actions.length} sub="autonomes" />
                </div>
                <div className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0">
                  <div className={flash.current ? 'flash-money rounded-2xl min-h-0' : 'min-h-0'} onAnimationEnd={() => (flash.current = false)}>
                    <Payment token={token} accounts={accounts} txs={txs} onTransfer={onTransfer} offline={offline} busy={busy} fill />
                  </div>
                  <Synthese ml={ml} actions={actions} containers={containers} health={health} go={go} fill />
                </div>
              </div>
            </section>

            <section className="w-full shrink-0 h-full overflow-y-auto px-4 sm:px-6 py-4">
              <div className="max-w-7xl mx-auto h-full min-h-0">
                <Containers items={containers} fill />
              </div>
            </section>

          </div>
        </div>
      </div>

      <nav className="shrink-0 border-t border-line/70 bg-ink/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 py-2 flex items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <button key={s.id} onClick={() => go(i)}
              className={`btn-flat flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12.5px] border transition ${i === slide ? 'bg-accent/15 border-accent/40 text-text' : 'bg-raised/40 border-line text-muted hover:text-text hover:border-hair'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${i === slide ? 'bg-accent' : 'bg-faint'}`} />
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <Guide open={guideOpen} onClose={() => setGuideOpen(false)} sec={guideSec} setSec={setGuideSec} />

      <Burst at={burst} />

      {toast && (
        <div className={`fixed bottom-16 right-5 z-40 px-4 py-3 rounded-xl border text-[14px] shadow-2xl anim-pop ${toast.ok ? 'bg-money/15 border-money/40 text-money' : 'bg-alert/15 border-alert/40 text-alert'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
