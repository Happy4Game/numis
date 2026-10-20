export function Burst({ at }) {
  if (!at) return null
  const parts = Array.from({ length: 10 })
  return (
    <div key={at.id} className="fixed z-50 pointer-events-none" style={{ left: at.x, top: at.y }}>
      <div className="burst-ring" />
      <div className="burst-coin">€</div>
      {parts.map((_, i) => {
        const ang = (i / parts.length) * 2 * Math.PI
        const dist = 26 + (i % 3) * 10
        return <span key={i} className="burst-dot"
          style={{ '--dx': `${Math.cos(ang) * dist}px`, '--dy': `${Math.sin(ang) * dist}px`,
                   background: i % 2 ? '#35D6A4' : '#7FB0FF' }} />
      })}
    </div>
  )
}
