import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { NodeData, ResolvedGraph } from '../types'

function getNodeLabel(node: NodeData): string {
  const v = node.fields['title'] ?? node.fields['name']
  return typeof v === 'string' && v ? v : node.handle
}

interface TagViewProps {
  graph: ResolvedGraph
}

export function TagView({ graph }: TagViewProps) {
  const { tagname } = useParams<{ tagname: string }>()
  const tag = tagname ? decodeURIComponent(tagname) : ''

  const nodes = useMemo(
    () =>
      graph.orderedHandles
        .map((h) => graph.nodeIndex.get(h)!)
        .filter((node) => node.tags.includes(tag)),
    [graph, tag],
  )

  return (
    <article className="tag-view">
      <div className="tag-view__header">
        <Link to="/tag" className="tag-view__back">
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> All tags
        </Link>
        <div className="tag-view__title-row">
          <span className="tag-chip">{tag}</span>
          <span className="tag-view__count">
            {nodes.length.toLocaleString()} {nodes.length === 1 ? 'node' : 'nodes'}
          </span>
        </div>
      </div>

      {nodes.length === 0 ? (
        <p className="tag-view__empty">No nodes tagged "{tag}".</p>
      ) : (
        <ul className="tag-view__list">
          {nodes.map((node) => {
            const label = getNodeLabel(node)
            const showHandle = label !== node.handle
            return (
              <li key={node.handle} className="tag-view__item">
                <Link to={`/node/${node.handle}`} className="tag-view__link">
                  <span className="tag-view__label">{label}</span>
                  {showHandle && (
                    <span className="tag-view__handle">{node.handle}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
