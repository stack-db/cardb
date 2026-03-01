import { useEffect, useRef, useState } from 'react'
import type { NodeData, ResolvedGraph } from '../types'

interface SearchBarProps {
  graph: ResolvedGraph
  onNavigate: (handle: string) => void
}

function getNodeLabel(node: NodeData): string {
  const v = node.fields['title'] ?? node.fields['name']
  return typeof v === 'string' && v ? v : node.handle
}

function searchNodes(query: string, graph: ResolvedGraph): NodeData[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const results: NodeData[] = []
  for (const handle of graph.orderedHandles) {
    const node = graph.nodeIndex.get(handle)!
    const label = getNodeLabel(node).toLowerCase()
    if (handle.includes(q) || label.includes(q)) {
      results.push(node)
      if (results.length >= 20) break
    }
  }
  return results
}

export function SearchBar({ graph, onNavigate }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = query.trim() ? searchNodes(query, graph) : []
  const isOpen = results.length > 0

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setQuery('')
        setActiveIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (node: NodeData) => {
    onNavigate(node.handle)
    setQuery('')
    setActiveIdx(-1)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (isOpen ? Math.min(i + 1, results.length - 1) : i))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) {
      e.preventDefault()
      select(results[activeIdx])
    } else if (e.key === 'Escape') {
      setQuery('')
      setActiveIdx(-1)
    }
  }

  return (
    <div className="search-bar" ref={containerRef}>
      <div className="search-bar__wrap">
        <i className="fa-solid fa-magnifying-glass search-bar__icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          className="search-bar__input"
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIdx(-1)
          }}
          onKeyDown={handleKeyDown}
          aria-label="Search nodes"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          autoComplete="off"
        />
        {query && (
          <button
            className="search-bar__clear"
            onClick={() => {
              setQuery('')
              setActiveIdx(-1)
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            tabIndex={-1}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
      </div>

      {isOpen && (
        <ul className="search-bar__results" role="listbox">
          {results.map((node, i) => {
            const label = getNodeLabel(node)
            const typeTag = node.tags[0] ?? null
            const showHandle = !typeTag && label !== node.handle
            return (
              <li
                key={node.handle}
                className={`search-bar__result${i === activeIdx ? ' search-bar__result--active' : ''}`}
                role="option"
                aria-selected={i === activeIdx}
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(node)
                }}
              >
                <span className="search-bar__result-label">{label}</span>
                {typeTag && (
                  <span className="search-bar__result-type">{typeTag}</span>
                )}
                {showHandle && (
                  <span className="search-bar__result-handle">{node.handle}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
