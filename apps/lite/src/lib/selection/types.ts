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

export interface SelectionState {
  showMenu: boolean
  menuPosition: { x: number; y: number }
  selectedText: string
  menuMode: 'word' | 'line'
  showLookup: boolean
  lookupPosition: { x: number; y: number }
  lookupWord: string
  lookupLoading: boolean
  lookupErrorKey: TranslationKey | null
  lookupResult: DictEntry | null
  hoverWord: string
  hoverRects: DOMRect[]
}
