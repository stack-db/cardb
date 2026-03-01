import { useNavigate } from 'react-router-dom'

interface CardControlsProps {
  orderedHandles: string[]
  currentHandle: string
  showBack: boolean
  onToggleBack: (val: boolean) => void
}

export function CardControls({
  orderedHandles,
  currentHandle,
  showBack,
  onToggleBack,
}: CardControlsProps) {
  const navigate = useNavigate()

  const serialIdx = orderedHandles.indexOf(currentHandle)
  const total = orderedHandles.length
  const canGoPrev = serialIdx > 0
  const canGoNext = serialIdx >= 0 && serialIdx < total - 1

  const go = (handle: string) => navigate(`/node/${handle}`)

  return (
    <div className="card-controls">
      {/* Front / Back toggle */}
      <div className="card-controls__face-toggle" role="group" aria-label="Card face">
        <button
          className={`card-controls__face-btn${!showBack ? ' card-controls__face-btn--active' : ''}`}
          onClick={() => onToggleBack(false)}
          aria-pressed={!showBack}
        >
          Front
        </button>
        <button
          className={`card-controls__face-btn${showBack ? ' card-controls__face-btn--active' : ''}`}
          onClick={() => onToggleBack(true)}
          aria-pressed={showBack}
        >
          Back
        </button>
      </div>

      <hr className="card-controls__divider" />

      {/* Serial navigation */}
      <button
        className="card-controls__btn"
        onClick={() => go(orderedHandles[0])}
        disabled={!canGoPrev}
        title="First"
        aria-label="First node"
      >
        <i className="fa-solid fa-backward-step fa-rotate-90" aria-hidden="true" />
      </button>
      <button
        className="card-controls__btn"
        onClick={() => go(orderedHandles[serialIdx - 1])}
        disabled={!canGoPrev}
        title="Previous"
        aria-label="Previous node"
      >
        <i className="fa-solid fa-chevron-up" aria-hidden="true" />
      </button>
      <span className="card-controls__position" aria-live="polite">
        {serialIdx >= 0 ? serialIdx + 1 : '–'} / {total}
      </span>
      <button
        className="card-controls__btn"
        onClick={() => go(orderedHandles[serialIdx + 1])}
        disabled={!canGoNext}
        title="Next"
        aria-label="Next node"
      >
        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
      </button>
      <button
        className="card-controls__btn"
        onClick={() => go(orderedHandles[total - 1])}
        disabled={!canGoNext}
        title="Last"
        aria-label="Last node"
      >
        <i className="fa-solid fa-forward-step fa-rotate-90" aria-hidden="true" />
      </button>
    </div>
  )
}
