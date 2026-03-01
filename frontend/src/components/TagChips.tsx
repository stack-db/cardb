import { Link } from 'react-router-dom'

interface TagChipsProps {
  tags: string[]
}

export function TagChips({ tags }: TagChipsProps) {
  if (tags.length === 0) return null

  return (
    <ul className="tag-chips" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag}>
          <Link to={`/tag/${encodeURIComponent(tag)}`} className="tag-chip">
            {tag}
          </Link>
        </li>
      ))}
    </ul>
  )
}
