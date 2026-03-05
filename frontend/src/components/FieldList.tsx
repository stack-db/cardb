import { FieldValueRenderer } from './FieldValueRenderer'

interface FieldListProps {
  nodeHandle: string
  fields: Record<string, unknown>
}

export function FieldList({ nodeHandle, fields }: FieldListProps) {
  const entries = Object.entries(fields)
  if (entries.length === 0) return null

  return (
    <dl className="field-list">
      {entries.map(([key, value]) => (
        <div key={key} className="field-list__entry">
          <dt className="field-list__key">{key}</dt>
          <dd className="field-list__value">
            <FieldValueRenderer fieldName={key} nodeHandle={nodeHandle} value={value} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
