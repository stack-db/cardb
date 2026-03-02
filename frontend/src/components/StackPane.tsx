import { useNavigate } from 'react-router-dom'
import type { StackDef } from '../stacks'

interface StackPaneProps {
  stacks: StackDef[]
  activeStackId: string
  isOpen: boolean
  onSelect: (stackId: string) => void
  onClose: () => void
  modifiedStackNames: Set<string>
}

export function StackPane({
  stacks,
  activeStackId,
  isOpen,
  onSelect,
  onClose,
  modifiedStackNames,
}: StackPaneProps) {
  const navigate = useNavigate()

  const sourceLabel = (s: StackDef) => {
    if (s.source.type === 'remote') return 'remote'
    if (s.source.type === 'local') return 'local'
    return null
  }

  return (
    <div className={`stack-pane${isOpen ? ' stack-pane--open' : ''}`} aria-hidden={!isOpen}>
      <div className="stack-pane__list">
        {stacks.map((stack) => (
          <button
            key={stack.id}
            className={`stack-pane__item${stack.id === activeStackId ? ' stack-pane__item--active' : ''}`}
            onClick={() => onSelect(stack.id)}
          >
            {stack.id === activeStackId && (
              <i className="fa-solid fa-check stack-pane__item-check" aria-hidden="true" />
            )}
            <span className="stack-pane__item-label">{stack.label}</span>
            {modifiedStackNames.has(stack.label) && (
              <span className="stack-pane__item-modified">modified</span>
            )}
            {sourceLabel(stack) && (
              <span className="stack-pane__item-source">{sourceLabel(stack)}</span>
            )}
          </button>
        ))}
      </div>

      <div className="stack-pane__footer">
        <button
          className="stack-pane__more-btn"
          onClick={() => {
            onClose()
            navigate('/stacks')
          }}
        >
          Manage…
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
