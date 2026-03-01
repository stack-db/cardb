import type { NodeData, LinkData } from '../types'
import { CardBack } from './CardBack'
import { FieldList } from './FieldList'
import { LinkGroup } from './LinkGroup'
import { TagChips } from './TagChips'

interface CardViewProps {
  node: NodeData
  linksByRel: Map<string, LinkData[]>
  nodeIndex: Map<string, NodeData>
  onNavigate: (handle: string) => void
  showBack?: boolean
}

export function CardView({ node, linksByRel, nodeIndex, onNavigate, showBack = false }: CardViewProps) {
  const relEntries = Array.from(linksByRel.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  const title = (() => {
    const v = node.fields['title'] ?? node.fields['name']
    return typeof v === 'string' && v ? v : node.handle
  })()

  return (
    <article className="card-view">
      <div className="card-view__header">
        <h1 className="card-view__handle">{title}</h1>
      </div>

      {showBack ? (
        <CardBack node={node} linksByRel={linksByRel} onNavigate={onNavigate} />
      ) : (
        <>
          {node.tags.length > 0 && <TagChips tags={node.tags} />}

          {Object.keys(node.fields).length > 0 && (
            <section className="card-view__fields">
              <FieldList fields={node.fields} />
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
