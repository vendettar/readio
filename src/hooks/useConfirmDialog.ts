// src/hooks/useConfirmDialog.ts
// Local state hook for confirmation dialogs

import { useState, useCallback } from 'react';

export interface ConfirmDialogConfig {
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'destructive';
    onConfirm: () => void | Promise<void>;
}

export interface ConfirmDialogState extends ConfirmDialogConfig {
    isOpen: boolean;
    isLoading: boolean;
}

const initialState: ConfirmDialogState = {
    isOpen: false,
    isLoading: false,
    title: '',
    description: '',
    onConfirm: () => { },
};

export function useConfirmDialog() {
    const [state, setState] = useState<ConfirmDialogState>(initialState);

    const openConfirm = useCallback((config: ConfirmDialogConfig) => {
        setState({
            ...initialState,
            ...config,
            isOpen: true,
            isLoading: false,
        });
    }, []);

    const closeConfirm = useCallback(() => {
        setState(prev => ({ ...prev, isOpen: false }));
    }, []);

    const handleConfirm = useCallback(async () => {
        setState(prev => ({ ...prev, isLoading: true }));
        try {
            await state.onConfirm();
        } finally {
            setState(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }
    }, [state]);

    return {
        state: {
            open: state.isOpen,
            title: state.title,
            description: state.description,
            confirmLabel: state.confirmLabel,
            cancelLabel: state.cancelLabel,
            variant: state.variant,
            isLoading: state.isLoading,
            onConfirm: handleConfirm,
            onCancel: closeConfirm,
        },
        openConfirm,
        closeConfirm,
    };
}
