// ---------------------------------------------------------------------------
// Typed field value definitions and parser
// ---------------------------------------------------------------------------

/** A plain CSS-style object (string values only, for safety). */
export type FieldStyle = Record<string, string>

export interface TextField {
  type: 'text'
  value: string
  style?: FieldStyle
}

export interface InputField {
  type: 'input'
  value: string
  style?: FieldStyle
}

export interface LinkField {
  type: 'a'
  value: string   // must be a valid absolute URL
  label?: string  // optional label; defaults to field name if absent
  style?: FieldStyle
}

export interface ImgField {
  type: 'img'
  value: string   // valid URL, or "$." / "$/" embedded-file reference
  href?: string   // optional navigation target: absolute URL or "@handle"
  style?: FieldStyle
}

export interface MarkdownField {
  type: 'markdown'
  value: string
  style?: FieldStyle
}

export type TypedField = TextField | InputField | LinkField | ImgField | MarkdownField

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidUrl(s: string): boolean {
  try {
    new URL(s)
    return true
  } catch {
    return false
  }
}

function parseStyle(raw: unknown): FieldStyle | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const result: FieldStyle = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') result[k] = v
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * If the string is a "$." or "$/" embedded-file reference, returns the
 * docs-relative path (without prefix). Otherwise returns null.
 */
export function extractFileRefPath(value: string): string | null {
  if (value.startsWith('$.')) return value.slice(2)
  if (value.startsWith('$/')) return value.slice(2)
  return null
}

// ---------------------------------------------------------------------------
// Field inheritance
// ---------------------------------------------------------------------------

/**
 * Merge a lower-priority field value with a higher-priority override.
 *
 * If the lower-priority value is a typed field object (has `type`) and the
 * override is a plain primitive, the type definition is preserved with the
 * new value injected — so style/label/href survive card-level overrides.
 * In all other cases the override wins outright.
 */
function mergeFieldValue(lower: unknown, higher: unknown): unknown {
  if (
    higher !== null &&
    higher !== undefined &&
    typeof lower === 'object' &&
    lower !== null &&
    !Array.isArray(lower) &&
    typeof (lower as Record<string, unknown>)['type'] === 'string' &&
    (typeof higher === 'string' || typeof higher === 'number' || typeof higher === 'boolean')
  ) {
    return { ...(lower as Record<string, unknown>), value: higher }
  }
  return higher
}

/**
 * Returns the effective fields for a node, applying the inheritance chain:
 *   stack defaults < tag defaults (each tag in order) < node fields
 *
 * When a key appears in multiple levels, higher-priority values win.
 * If the lower level defines a typed field object and the higher level
 * provides a primitive for the same key, the typed structure is preserved
 * with the new value injected.
 */
export function getEffectiveFields(
  node: { fields: Record<string, unknown>; tags: string[] },
  stackFields: Record<string, unknown>,
  tagCards: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...stackFields }

  // Tag defaults (in tag order — later tags win over earlier ones)
  for (const tag of node.tags) {
    const tagFields = tagCards.get(tag)
    if (!tagFields) continue
    for (const [key, val] of Object.entries(tagFields)) {
      result[key] = key in result ? mergeFieldValue(result[key], val) : val
    }
  }

  // Card fields (highest priority)
  for (const [key, val] of Object.entries(node.fields)) {
    result[key] = key in result ? mergeFieldValue(result[key], val) : val
  }

  return result
}

/**
 * Returns false for values that should be hidden on the card front:
 * - null / undefined
 * - a typed-field template object (has a `type` string) whose `value` is absent
 *   or doesn't produce a valid TypedField (i.e. the tag card set a type but no
 *   concrete value was ever supplied for this node).
 */
export function isDisplayableField(val: unknown): boolean {
  if (val === null || val === undefined) return false
  if (
    typeof val === 'object' &&
    !Array.isArray(val) &&
    typeof (val as Record<string, unknown>)['type'] === 'string' &&
    parseTypedField(val) === null
  ) {
    return false
  }
  return true
}

/**
 * Attempts to parse a raw field value as a TypedField.
 * Returns null if the value is not an object with a recognized type+value pair.
 */
export function parseTypedField(raw: unknown): TypedField | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const { type, value } = obj
  if (typeof type !== 'string' || value === undefined) return null

  const style = parseStyle(obj.style)

  switch (type) {
    case 'text':
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
        return null
      return { type: 'text', value: String(value), style }

    case 'input':
      if (typeof value !== 'string') return null
      return { type: 'input', value, style }

    case 'a': {
      if (typeof value !== 'string' || !isValidUrl(value)) return null
      return {
        type: 'a',
        value,
        label: typeof obj.label === 'string' ? obj.label : undefined,
        style,
      }
    }

    case 'img': {
      if (typeof value !== 'string') return null
      const isRef = value.startsWith('$.') || value.startsWith('$/')
      if (!isRef && !isValidUrl(value)) return null
      return {
        type: 'img',
        value,
        href: typeof obj.href === 'string' ? obj.href : undefined,
        style,
      }
    }

    case 'markdown':
      if (typeof value !== 'string') return null
      return { type: 'markdown', value, style }

    default:
      return null
  }
}
