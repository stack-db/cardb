interface ErrorMessageProps {
  message: string
  detail?: string
}

export function ErrorMessage({ message, detail }: ErrorMessageProps) {
  return (
    <div className="error-message" role="alert">
      <p className="error-message__text">{message}</p>
      {detail && <pre className="error-message__detail">{detail}</pre>}
    </div>
  )
}
