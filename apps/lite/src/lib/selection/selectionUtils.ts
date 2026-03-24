/**
 * Checks if there is a non-collapsed selection that belongs to the transcript area.
 * @param container The transcript reading area container element.
 * @returns true if a selection exists and is owned by the transcript area.
 */
export function hasTranscriptOwnedSelection(container: Element | null): boolean {
  if (!container) return false
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return false

  const selectedText = selection.toString().trim()
  if (selectedText.length === 0) return false

  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode

  if (!anchorNode || !focusNode) return false

  // Check if either end of the selection is within the transcript container
  return container.contains(anchorNode) || container.contains(focusNode)
}
