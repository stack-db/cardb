interface FieldListProps {
  fields: Record<string, unknown>
}

function renderValue(value: unknown): React.ReactNode {
  if (typeof value === 'string' && value.startsWith('$.')) {
    return <em className="field-file-ref" title="Embedded file reference">{value}</em>
  }
  if (value === null || value === undefined) {
    return <span className="field-empty">—</span>
  }
  if (typeof value === 'object') {
    return <span>{JSON.stringify(value)}</span>
  }
  return <span>{String(value)}</span>
}

export function FieldList({ fields }: FieldListProps) {
  const entries = Object.entries(fields)
  if (entries.length === 0) return null

  return (
    <dl className="field-list">
      {entries.map(([key, value]) => (
        <div key={key} className="field-list__entry">
          <dt className="field-list__key">{key}</dt>
          <dd className="field-list__value">{renderValue(value)}</dd>
        </div>
      ))}
    </dl>
  )
}
