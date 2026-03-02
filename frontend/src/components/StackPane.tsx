import { useNavigate } from 'react-router-dom'
import type { StackDef } from '../stacks'

interface StackPaneProps {
  stacks: StackDef[]
  activeStackId: string
  isOpen: boolean
  onSelect: (stackId: string) => void
  onClose: () => void
}

export function StackPane({ stacks, activeStackId, isOpen, onSelect, onClose }: StackPaneProps) {
  const navigate = useNavigate()

  const sourceLabel = (s: StackDef) => {
    if (s.source.type === 'bundled') return 'built-in'
    if (s.source.type === 'remote') return 'remote'
    return 'local'
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
            <span className="stack-pane__item-source">{sourceLabel(stack)}</span>
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
          More…
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
