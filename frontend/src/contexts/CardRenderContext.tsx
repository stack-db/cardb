import { createContext, useContext } from 'react'
import type { Db } from '../db/index'

export interface CardRenderContextValue {
  db: Db | null
  dbStackId: string | null
  designMode: boolean
  onFieldChange: (nodeHandle: string, fieldKey: string, value: unknown) => void
  onNavigate: (handle: string) => void
}

const CardRenderContext = createContext<CardRenderContextValue>({
  db: null,
  dbStackId: null,
  designMode: false,
  onFieldChange: () => {},
  onNavigate: () => {},
})

export function useCardRender(): CardRenderContextValue {
  return useContext(CardRenderContext)
}

export { CardRenderContext }
