import { useState, useEffect, useCallback, useMemo } from 'react'
import { marked } from 'marked'
import type { TypedField } from '../fieldTypes'
import { parseTypedField, extractFileRefPath } from '../fieldTypes'
import { useCardRender } from '../contexts/CardRenderContext'

interface FieldValueRendererProps {
  fieldName: string
  nodeHandle: string
  value: unknown
}

export function FieldValueRenderer({ fieldName, nodeHandle, value }: FieldValueRendererProps) {
  const typed = parseTypedField(value)
  if (typed) {
    return <TypedFieldRenderer typed={typed} fieldName={fieldName} nodeHandle={nodeHandle} />
  }
  return <RawValue value={value} />
}

// ---------------------------------------------------------------------------
// Raw (untyped) fallback
// ---------------------------------------------------------------------------

function RawValue({ value }: { value: unknown }) {
  if (typeof value === 'string' && (value.startsWith('$.') || value.startsWith('$/'))) {
    return (
      <em className="field-file-ref" title="Embedded file reference">
        {value}
      </em>
    )
  }
  if (value === null || value === undefined) {
    return <span className="field-empty">—</span>
  }
  if (typeof value === 'object') {
    return <span>{JSON.stringify(value)}</span>
  }
  return <span>{String(value)}</span>
}

// ---------------------------------------------------------------------------
// Typed field dispatcher
// ---------------------------------------------------------------------------

interface TypedFieldRendererProps {
  typed: TypedField
  fieldName: string
  nodeHandle: string
}

function TypedFieldRenderer({ typed, fieldName, nodeHandle }: TypedFieldRendererProps) {
  const { onNavigate } = useCardRender()
  const style = typed.style as React.CSSProperties | undefined

  switch (typed.type) {
    case 'text':
      return (
        <span className="field-value--text" style={style}>
          {typed.value}
        </span>
      )

    case 'input':
      return (
        <InputFieldValue
          typed={typed}
          fieldName={fieldName}
          nodeHandle={nodeHandle}
          style={style}
        />
      )

    case 'a':
      return (
        <a
          className="field-value--link"
          href={typed.value}
          target="_blank"
          rel="noopener noreferrer"
          style={style}
        >
          {typed.label ?? (typed.defaultLabel === 'url' ? typed.value : fieldName)}
        </a>
      )

    case 'img':
      return <ImgFieldValue typed={typed} onNavigate={onNavigate} style={style} />

    case 'markdown':
      return <MarkdownFieldValue typed={typed} style={style} />
  }
}

// ---------------------------------------------------------------------------
// Input field
// ---------------------------------------------------------------------------

function InputFieldValue({
  typed,
  fieldName,
  nodeHandle,
  style,
}: {
  typed: { type: 'input'; value: string }
  fieldName: string
  nodeHandle: string
  style?: React.CSSProperties
}) {
  const { designMode, onFieldChange } = useCardRender()
  const [localValue, setLocalValue] = useState(typed.value)

  // Sync when navigating to a different node
  useEffect(() => {
    setLocalValue(typed.value)
  }, [typed.value, nodeHandle])

  const save = useCallback(() => {
    if (localValue !== typed.value) {
      onFieldChange(nodeHandle, fieldName, localValue)
    }
  }, [localValue, typed.value, onFieldChange, nodeHandle, fieldName])

  return (
    <input
      className="field-value--input"
      type="text"
      value={localValue}
      readOnly={designMode}
      style={style}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          save()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Image field
// ---------------------------------------------------------------------------

function useEmbeddedFileUrl(path: string | null): string | null {
  const { db, dbStackId } = useCardRender()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!db || !dbStackId || !path) {
      setUrl(null)
      return
    }
    let objectUrl: string | null = null
    db.query<{ data: Uint8Array }>(
      'SELECT data FROM embedded_files WHERE stack_id = $1 AND path = $2',
      [dbStackId, path],
    )
      .then(({ rows }) => {
        if (rows[0]?.data) {
          objectUrl = URL.createObjectURL(new Blob([rows[0].data.buffer as ArrayBuffer]))
          setUrl(objectUrl)
        }
      })
      .catch(() => {})
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [db, dbStackId, path])

  return url
}

// ---------------------------------------------------------------------------
// Markdown field
// ---------------------------------------------------------------------------

function MarkdownFieldValue({
  typed,
  style,
}: {
  typed: { type: 'markdown'; value: string }
  style?: React.CSSProperties
}) {
  const html = useMemo(() => marked.parse(typed.value, { async: false }) as string, [typed.value])
  return (
    <div
      className="field-value--markdown"
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ---------------------------------------------------------------------------
// Image field
// ---------------------------------------------------------------------------

function ImgFieldValue({
  typed,
  onNavigate,
  style,
}: {
  typed: { type: 'img'; value: string; href?: string }
  onNavigate: (handle: string) => void
  style?: React.CSSProperties
}) {
  const fileRefPath = extractFileRefPath(typed.value)
  const embeddedUrl = useEmbeddedFileUrl(fileRefPath)
  const src = fileRefPath ? (embeddedUrl ?? '') : typed.value

  const img = <img className="field-value--img" src={src} alt="" style={style} />

  if (!typed.href) return img

  if (typed.href.startsWith('@')) {
    const handle = typed.href.slice(1)
    return (
      <a
        className="field-value--img-link"
        href={`#/node/${encodeURIComponent(handle)}`}
        onClick={(e) => {
          e.preventDefault()
          onNavigate(handle)
        }}
      >
        {img}
      </a>
    )
  }

  return (
    <a
      className="field-value--img-link"
      href={typed.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {img}
    </a>
  )
}
