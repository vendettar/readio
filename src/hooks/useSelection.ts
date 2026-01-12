// src/hooks/useSelection.ts
// Text selection, context menu, and dictionary lookup hook
// Composed from modular sub-hooks

import { useSelectionState } from './selection/useSelectionState';
import { useSelectionActions } from './selection/useSelectionActions';
import { useSelectionEvents } from './selection/useSelectionEvents';

export function useSelection(containerRef: React.RefObject<HTMLElement | null>) {
    const { state, setState } = useSelectionState();
    const actions = useSelectionActions(setState);

    // Setup event handlers
    useSelectionEvents(containerRef, state, setState, actions);

    return {
        state,
        copyText: () => actions.copyText(state.selectedText),
        searchWeb: () => actions.searchWeb(state.selectedText),
        lookupFromMenu: () => {
            const rect = state.menuPosition;
            actions.lookupWord(state.selectedText, rect.x + 100, rect.y);
        },
        closeMenu: actions.closeMenu,
        closeLookup: actions.closeLookup,
    };
}
