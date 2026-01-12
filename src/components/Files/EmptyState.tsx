// src/components/Files/EmptyState.tsx
import { useI18n } from '../../hooks/useI18n';

interface EmptyStateProps {
    /** If true, show folder empty state instead of root empty state */
    isFolder?: boolean;
}

export function EmptyState({ isFolder = false }: EmptyStateProps) {
    const { t } = useI18n();

    if (isFolder) {
        return (
            <div className="text-center py-12 px-8 border-2 border-dashed border-border rounded-xl bg-muted/30">
                <p className="text-sm text-muted-foreground">
                    {t('filesEmptyFolder')}
                </p>
            </div>
        );
    }

    return (
        <div className="text-center py-16 px-8 border-2 border-dashed border-border rounded-xl bg-muted/30">
            <h3 className="text-xl font-semibold text-foreground mb-2">
                {t('filesEmptyHeadline')}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                {t('filesEmptyBody')}
            </p>
        </div>
    );
}
