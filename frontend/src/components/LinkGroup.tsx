import type { LinkData, NodeData } from '../types'

interface LinkGroupProps {
  rel: string
  links: LinkData[]
  nodeIndex: Map<string, NodeData>
  onNavigate: (handle: string) => void
}

export function LinkGroup({ rel, links, nodeIndex, onNavigate }: LinkGroupProps) {
  return (
    <div className="link-group">
      <h3 className="link-group__rel">{rel}</h3>
      <ul className="link-group__list">
        {links.map((link) => {
          const exists = nodeIndex.has(link.targetHandle)
          return (
            <li key={link.targetHandle} className="link-group__item">
              {exists ? (
                <button
                  className="link-group__target"
                  onClick={() => onNavigate(link.targetHandle)}
                >
                  {link.targetHandle}
                </button>
              ) : (
                <span className="link-group__target--missing">{link.targetHandle}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
