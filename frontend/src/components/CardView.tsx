import { useRef, useEffect, useMemo } from 'react'
import { marked } from 'marked'
import type { NodeData, LinkData, ResolvedGraph } from '../types'
import {
  parseTypedField,
  extractFileRefPath,
  getEffectiveFields,
  isDisplayableField,
} from '../fieldTypes'
import { CardBack } from './CardBack'
import { FieldList } from './FieldList'
import { LinkGroup } from './LinkGroup'
import { TagChips } from './TagChips'

function renderMarkdown(text: unknown): string {
  if (
    typeof text === 'object' &&
    text !== null &&
    (text as Record<string, unknown>)['type'] === 'markdown'
  ) {
    text = (text as Record<string, unknown>)['value'] ?? ''
  }
  return marked.parse(String(text ?? ''), { async: false }) as string
}

// ---------------------------------------------------------------------------
// defaultOnShowCard — DOM-level replication of the default card front
// Uses <a href="#/..."> for navigation (HashRouter compatible)
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderValueHtml(fieldName: string, value: unknown): string {
  const typed = parseTypedField(value)
  if (typed) {
    switch (typed.type) {
      case 'text':
        return `<span class="field-value--text">${escapeHtml(typed.value)}</span>`
      case 'input':
        return `<input class="field-value--input" type="text" value="${escapeHtml(typed.value)}" />`
      case 'a': {
        const label = escapeHtml(
          typed.label ?? (typed.defaultLabel === 'url' ? typed.value : fieldName),
        )
        return `<a class="field-value--link" href="${escapeHtml(typed.value)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      }
      case 'markdown':
        return `<div class="field-value--markdown">${renderMarkdown(typed.value)}</div>`

      case 'img': {
        const fileRefPath = extractFileRefPath(typed.value)
        // For custom renderers, embedded files can't be resolved; use value as-is
        const src = fileRefPath ? typed.value : typed.value
        const imgHtml = `<img class="field-value--img" src="${escapeHtml(src)}" alt="" />`
        if (!typed.href) return imgHtml
        if (typed.href.startsWith('@')) {
          const handle = typed.href.slice(1)
          return `<a class="field-value--img-link" href="#/node/${encodeURIComponent(handle)}">${imgHtml}</a>`
        }
        return `<a class="field-value--img-link" href="${escapeHtml(typed.href)}" target="_blank" rel="noopener noreferrer">${imgHtml}</a>`
      }
    }
  }
  if (typeof value === 'string' && (value.startsWith('$.') || value.startsWith('$/'))) {
    return `<em class="field-file-ref" title="Embedded file reference">${escapeHtml(value)}</em>`
  }
  if (value === null || value === undefined) {
    return '<span class="field-empty">—</span>'
  }
  if (typeof value === 'object') {
    return `<span>${escapeHtml(JSON.stringify(value))}</span>`
  }
  return `<span>${escapeHtml(String(value))}</span>`
}

export function defaultOnShowCard(
  node: NodeData,
  graph: ResolvedGraph,
  element: HTMLElement,
): void {
  const rawLinks = graph.outgoingLinks.get(node.handle) ?? []
  const linksByRel = rawLinks.reduce((acc, link) => {
    const list = acc.get(link.rel) ?? []
    list.push(link)
    acc.set(link.rel, list)
    return acc
  }, new Map<string, LinkData[]>())
  const relEntries = Array.from(linksByRel.entries()).sort(([a], [b]) => a.localeCompare(b))

  let html = ''

  if (node.tags.length > 0) {
    html += '<ul class="tag-chips" aria-label="Tags">'
    for (const tag of node.tags) {
      html += `<li><a href="#/tag/${encodeURIComponent(tag)}" class="tag-chip">${escapeHtml(tag)}</a></li>`
    }
    html += '</ul>'
  }

  const fieldEntries = Object.entries(node.fields)
  if (fieldEntries.length > 0) {
    html += '<section class="card-view__fields"><dl class="field-list">'
    for (const [key, value] of fieldEntries) {
      html += `<div class="field-list__entry"><dt class="field-list__key">${escapeHtml(key)}</dt><dd class="field-list__value">${renderValueHtml(key, value)}</dd></div>`
    }
    html += '</dl></section>'
  }

  if (relEntries.length > 0) {
    html += '<section class="card-view__links">'
    for (const [rel, relLinks] of relEntries) {
      html += `<div class="link-group"><h3 class="link-group__rel">${escapeHtml(rel)}</h3><ul class="link-group__list">`
      for (const link of relLinks) {
        const exists = graph.nodeIndex.has(link.targetHandle)
        if (exists) {
          html += `<li class="link-group__item"><a href="#/node/${encodeURIComponent(link.targetHandle)}" class="link-group__target">${escapeHtml(link.targetHandle)}</a></li>`
        } else {
          html += `<li class="link-group__item"><span class="link-group__target--missing">${escapeHtml(link.targetHandle)}</span></li>`
        }
      }
      html += '</ul></div>'
    }
    html += '</section>'
  }

  element.innerHTML = html
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CardViewProps {
  node: NodeData
  linksByRel: Map<string, LinkData[]>
  nodeIndex: Map<string, NodeData>
  onNavigate: (handle: string) => void
  showBack?: boolean
  graph: ResolvedGraph
  stackCode?: string
}

export function CardView({
  node,
  linksByRel,
  nodeIndex,
  onNavigate,
  showBack = false,
  graph,
  stackCode,
}: CardViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const relEntries = Array.from(linksByRel.entries()).sort(([a], [b]) => a.localeCompare(b))

  const effectiveFields = useMemo(() => {
    const all = getEffectiveFields(node, graph.stackFields ?? {}, graph.tagCards ?? new Map())
    return Object.fromEntries(Object.entries(all).filter(([, v]) => isDisplayableField(v)))
  }, [node, graph.stackFields, graph.tagCards])

  const title = (() => {
    const v = effectiveFields['title'] ?? effectiveFields['name']
    return typeof v === 'string' && v ? v : node.handle
  })()

  const cardCode = typeof effectiveFields['code'] === 'string' ? effectiveFields['code'] : undefined
  const cardHasRenderer = cardCode?.includes('onShowCard') ?? false
  const stackHasRenderer = stackCode?.includes('onShowCard') ?? false
  const useCustomRenderer = cardHasRenderer || stackHasRenderer

  // Extract stack's onShowCard function, memoized per stackCode
  const stackOnShowCard = useMemo<((...args: unknown[]) => void) | null>(() => {
    if (!stackCode?.includes('onShowCard')) return null
    try {
      // eslint-disable-next-line no-new-func
      return new Function(
        'defaultOnShowCard',
        'renderMarkdown',
        stackCode + '\nreturn typeof onShowCard === "function" ? onShowCard : null',
      )(defaultOnShowCard, renderMarkdown) as ((...args: unknown[]) => void) | null
    } catch {
      return null
    }
  }, [stackCode])

  useEffect(() => {
    if (showBack || !useCustomRenderer || !containerRef.current) return
    const el = containerRef.current
    el.innerHTML = ''

    // Pass a node with effective fields merged in so custom renderers inherit defaults
    const effectiveNode = { ...node, fields: effectiveFields }

    if (cardHasRenderer && cardCode) {
      try {
        // eslint-disable-next-line no-new-func
        ;(
          new Function(
            'node',
            'stack',
            'element',
            'defaultOnShowCard',
            'stackOnShowCard',
            'renderMarkdown',
            cardCode + '\nif (typeof onShowCard === "function") onShowCard(node, stack, element)',
          ) as (...args: unknown[]) => void
        )(effectiveNode, graph, el, defaultOnShowCard, stackOnShowCard ?? null, renderMarkdown)
      } catch (err) {
        console.error('[cardb] Card code error:', err)
      }
    } else if (stackHasRenderer && stackOnShowCard) {
      try {
        stackOnShowCard(effectiveNode, graph, el)
      } catch (err) {
        console.error('[cardb] Stack code error:', err)
      }
    }
  }, [node, effectiveFields, showBack, cardCode, stackCode, graph, stackOnShowCard]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <article className="card-view">
      <div className="card-view__header">
        <h1 className="card-view__handle">{title}</h1>
      </div>

      {showBack ? (
        <CardBack node={node} linksByRel={linksByRel} onNavigate={onNavigate} />
      ) : useCustomRenderer ? (
        <div ref={containerRef} className="card-view__custom-front" />
      ) : (
        <>
          {node.tags.length > 0 && <TagChips tags={node.tags} />}

          {Object.keys(effectiveFields).length > 0 && (
            <section className="card-view__fields">
              <FieldList nodeHandle={node.handle} fields={effectiveFields} />
            </section>
          )}

          <section className="card-view__links">
            {relEntries.map(([rel, links]) => (
              <LinkGroup
                key={rel}
                rel={rel}
                links={links}
                nodeIndex={nodeIndex}
                onNavigate={onNavigate}
              />
            ))}
          </section>
        </>
      )}
    </article>
  )
}
