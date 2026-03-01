import { Link } from 'react-router-dom'
import type { NodeData, LinkData } from '../types'

interface CardBackProps {
  node: NodeData
  linksByRel: Map<string, LinkData[]>
  onNavigate: (handle: string) => void
}

export function CardBack({ node, linksByRel, onNavigate }: CardBackProps) {
  const fieldEntries = Object.entries(node.fields)
  const totalLinks = [...linksByRel.values()].reduce((n, arr) => n + arr.length, 0)
  const sortedRels = [...linksByRel.keys()].sort()

  return (
    <div className="card-back">
      {/* Meta row */}
      <div className="card-back__meta">
        {node.tags.length > 0 && (
          <span className="card-back__meta-item">
            <span className="card-back__meta-key">tags</span>
            <span className="card-back__meta-val card-back__meta-tags">
              {node.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/tag/${encodeURIComponent(tag)}`}
                  className="tag-chip"
                >
                  {tag}
                </Link>
              ))}
            </span>
          </span>
        )}
        <span className="card-back__meta-item">
          <span className="card-back__meta-key">fields</span>
          <span className="card-back__meta-val">{fieldEntries.length}</span>
        </span>
        <span className="card-back__meta-item">
          <span className="card-back__meta-key">links</span>
          <span className="card-back__meta-val">{totalLinks}</span>
        </span>
      </div>

      {/* Raw fields table */}
      {fieldEntries.length > 0 && (
        <table className="card-back__fields">
          <tbody>
            {fieldEntries.map(([key, val]) => (
              <tr key={key} className="card-back__field-row">
                <td className="card-back__field-key">{key}</td>
                <td className="card-back__field-val">
                  {Array.isArray(val)
                    ? val.join(', ')
                    : String(val ?? '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Flat link list */}
      {totalLinks > 0 && (
        <div className="card-back__links">
          {sortedRels.map((rel) =>
            (linksByRel.get(rel) ?? []).map((link) => (
              <div key={`${rel}:${link.targetHandle}`} className="card-back__link-row">
                <span className="card-back__link-rel">{rel}</span>
                <button
                  className="card-back__link-target"
                  onClick={() => onNavigate(link.targetHandle)}
                >
                  {link.targetHandle}
                </button>
              </div>
            )),
          )}
        </div>
      )}
    </div>
  )
}
