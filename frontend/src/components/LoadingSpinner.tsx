interface LoadingSpinnerProps {
  label?: string
}

export function LoadingSpinner({ label = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner" role="status" aria-label={label}>
      <span className="spinner-ring" aria-hidden="true" />
      <span className="spinner-label">{label}</span>
    </div>
  )
}
