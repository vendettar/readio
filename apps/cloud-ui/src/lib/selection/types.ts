// src/lib/selection/types.ts

import type { TranslationKey } from '../translations'

export interface DictEntry {
  word: string
  phonetic: string
  meanings: {
    partOfSpeech: string
    definitions: { definition: string; example?: string }[]
  }[]
}

export interface SelectionAnchorRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface SelectionAnchorPosition {
  x: number
  y: number
  rect?: SelectionAnchorRect
}

export interface SelectionOwner {
  ownerCueKey: string
  ownerCueStartMs: number
  ownerKind: 'word' | 'line' | 'range'
  ownerTokenInstanceId?: string
}

export type SelectionSurface =
  | { type: 'none' }
  | ({
      surfaceId: number
      position: SelectionAnchorPosition
      owner: SelectionOwner
    } & (
      | {
          type: 'contextMenu'
          selectedText: string
          menuMode: 'word' | 'line'
        }
      | {
          type: 'rangeActionMenu'
          selectedText: string
        }
      | {
          type: 'lookup'
          word: string
        }
    ))

export interface SelectionState {
  surface: SelectionSurface
  lookupLoading: boolean
  lookupErrorKey: TranslationKey | null
  lookupResult: DictEntry | null
}
