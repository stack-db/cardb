import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CardView } from '../../components/CardView'
import type { NodeData, LinkData } from '../../types'

// TagChips now uses <Link>, so CardView renders need a Router context.
function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

// CardView renders: h1 handle, TagChips, FieldList, LinkGroups

const aliceNode: NodeData = {
  handle: 'alice',
  aliases: [],
  fields: { name: 'Alice', photo: '$.headshots/alice.jpg' },
  tags: ['person', 'main'],
}

const bobNode: NodeData = {
  handle: 'bob',
  aliases: [],
  fields: { name: 'Bob' },
  tags: [],
}

const nodeIndex = new Map<string, NodeData>([
  ['alice', aliceNode],
  ['bob', bobNode],
])

const linksByRel = new Map<string, LinkData[]>([
  ['knows', [{ rel: 'knows', targetHandle: 'bob' }]],
  ['mentions', [{ rel: 'mentions', targetHandle: 'ghost' }]], // ghost not in index
])

describe('CardView', () => {
  let onNavigate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onNavigate = vi.fn()
  })

  it('renders the node title (fields.name) as a heading', () => {
    wrap(
      <CardView
        node={aliceNode}
        linksByRel={linksByRel}
        nodeIndex={nodeIndex}
        onNavigate={onNavigate}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alice')
  })

  it('renders tag chips', () => {
    wrap(
      <CardView
        node={aliceNode}
        linksByRel={linksByRel}
        nodeIndex={nodeIndex}
        onNavigate={onNavigate}
      />,
    )
    expect(screen.getByText('person')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
  })

  it('renders field keys and values', () => {
    wrap(
      <CardView
        node={aliceNode}
        linksByRel={linksByRel}
        nodeIndex={nodeIndex}
        onNavigate={onNavigate}
      />,
    )
    expect(screen.getByText('name')).toBeTruthy()
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getByText('photo')).toBeTruthy()
  })

  it('renders $.path field values as italic text, not a link', () => {
    wrap(
      <CardView
        node={aliceNode}
        linksByRel={linksByRel}
        nodeIndex={nodeIndex}
        onNavigate={onNavigate}
      />,
    )
    const fileRef = screen.getByText('$.headshots/alice.jpg')
    expect(fileRef.tagName.toLowerCase()).toBe('em')
  })

  it('renders known link targets as clickable buttons', () => {
    wrap(
      <CardView
        node={aliceNode}
        linksByRel={linksByRel}
        nodeIndex={nodeIndex}
        onNavigate={onNavigate}
      />,
    )
    const btn = screen.getByRole('button', { name: 'bob' })
    expect(btn).toBeTruthy()
  })

  it('renders unknown link targets as plain text (not a button)', () => {
    wrap(
      <CardView
        node={aliceNode}
        linksByRel={linksByRel}
        nodeIndex={nodeIndex}
        onNavigate={onNavigate}
      />,
    )
    const ghostSpan = screen.getByText('ghost')
    expect(ghostSpan.tagName.toLowerCase()).not.toBe('button')
  })

  it('calls onNavigate with correct handle when a link button is clicked', () => {
    wrap(
      <CardView
        node={aliceNode}
        linksByRel={linksByRel}
        nodeIndex={nodeIndex}
        onNavigate={onNavigate}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'bob' }))
    expect(onNavigate).toHaveBeenCalledOnce()
    expect(onNavigate).toHaveBeenCalledWith('bob')
  })

  it('does NOT call onNavigate when an unknown-target span is clicked', () => {
    wrap(
      <CardView
        node={aliceNode}
        linksByRel={linksByRel}
        nodeIndex={nodeIndex}
        onNavigate={onNavigate}
      />,
    )
    fireEvent.click(screen.getByText('ghost'))
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
