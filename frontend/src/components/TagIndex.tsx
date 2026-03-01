import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { ResolvedGraph } from '../types'

interface TagIndexProps {
  graph: ResolvedGraph
}

export function TagIndex({ graph }: TagIndexProps) {
  const tagMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const handle of graph.orderedHandles) {
      for (const tag of graph.nodeIndex.get(handle)!.tags) {
        map.set(tag, (map.get(tag) ?? 0) + 1)
      }
    }
    return map
  }, [graph])

  const sortedTags = [...tagMap.keys()].sort((a, b) => a.localeCompare(b))

  return (
    <article className="tag-index">
      <h1 className="tag-index__heading">All Tags</h1>
      <p className="tag-index__subtitle">
        {sortedTags.length} {sortedTags.length === 1 ? 'tag' : 'tags'}
      </p>

      {sortedTags.length === 0 ? (
        <p className="tag-index__empty">No tags in this stack.</p>
      ) : (
        <ul className="tag-index__list">
          {sortedTags.map((tag) => (
            <li key={tag} className="tag-index__item">
              <Link to={`/tag/${encodeURIComponent(tag)}`} className="tag-index__link">
                <span className="tag-index__name">{tag}</span>
                <span className="tag-index__count">
                  {tagMap.get(tag)!.toLocaleString()} nodes
                </span>
                <i className="fa-solid fa-chevron-right tag-index__arrow" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
