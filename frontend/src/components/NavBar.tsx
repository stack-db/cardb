import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ResolvedGraph } from '../types'
import type { StackDef } from '../stacks'
import { SearchBar } from './SearchBar'
import { StackPane } from './StackPane'

interface NavBarProps {
  graph: ResolvedGraph
  stacks: StackDef[]
  activeStackId: string
  stackPaneOpen: boolean
  onToggleStackPane: () => void
  onSelectStack: (id: string) => void
}

export function NavBar({
  graph,
  stacks,
  activeStackId,
  stackPaneOpen,
  onToggleStackPane,
  onSelectStack,
}: NavBarProps) {
  const navigate = useNavigate()

  const activeStackLabel =
    (stacks.find((s) => s.id === activeStackId) ?? stacks[0]).label

  // Close the stack pane when clicking outside the wrapper
  const wrapperRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!stackPaneOpen) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onToggleStackPane()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [stackPaneOpen, onToggleStackPane])

  return (
    <nav className="nav-bar" aria-label="Card navigation">
      {/* Stack dropdown */}
      <div ref={wrapperRef} className="nav-bar__stack-wrapper">
        <button
          className={`nav-bar__stack-btn${stackPaneOpen ? ' nav-bar__stack-btn--open' : ''}`}
          onClick={onToggleStackPane}
          aria-expanded={stackPaneOpen}
          aria-haspopup="menu"
          aria-label="Manage stacks"
          title="Manage stacks"
        >
          <i className="fa-solid fa-layer-group nav-bar__stack-icon" aria-hidden="true" />
          <span className="nav-bar__stack-label">{activeStackLabel}</span>
        </button>
        <StackPane
          stacks={stacks}
          activeStackId={activeStackId}
          isOpen={stackPaneOpen}
          onSelect={onSelectStack}
          onClose={onToggleStackPane}
        />
      </div>

      {/* Center: search */}
      <SearchBar graph={graph} onNavigate={(h) => navigate(`/node/${h}`)} />
    </nav>
  )
}
