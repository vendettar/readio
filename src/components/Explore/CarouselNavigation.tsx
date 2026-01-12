// src/components/Explore/CarouselNavigation.tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';

interface CarouselNavigationProps {
    canScrollLeft: boolean;
    canScrollRight: boolean;
    onScroll: (direction: 'left' | 'right') => void;
    topClassName?: string;
    heightClassName?: string;
    parentGroupName?: 'carousel' | 'grid';
}

export function CarouselNavigation({
    canScrollLeft,
    canScrollRight,
    onScroll,
    topClassName = "top-[calc(var(--item-width,176px)/2)]",
    heightClassName = "h-14",
    parentGroupName = "carousel",
}: CarouselNavigationProps) {
    const { t } = useI18n();
    const groupClass = parentGroupName === "carousel" ? "group-hover/carousel:opacity-100" : "group-hover/grid:opacity-100";

    return (
        <>
            {/* Left Navigation Hot Zone (Hover Capture) */}
            {canScrollLeft && (
                <div className={cn(
                    "absolute top-0 bottom-0 z-40 flex items-center justify-center",
                    "-left-6 sm:-left-12 w-6 sm:w-12 pointer-events-auto cursor-default"
                )}>
                    <div className="w-full h-full relative group/nav">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onScroll('left')}
                            className={cn(
                                "absolute -translate-y-1/2 left-0 right-0 mx-auto",
                                "w-8 rounded-lg shadow-xl transition-all duration-300",
                                "bg-card/80 backdrop-blur-xl opacity-0 scale-90",
                                "group-hover/nav:scale-105 group-hover/nav:opacity-100 border border-border/70 active:scale-95",
                                "flex items-center justify-center text-foreground",
                                heightClassName, topClassName, groupClass
                            )}
                            aria-label={t('ariaScrollLeft')}
                        >
                            <ChevronLeft size={20} className="text-foreground/70" strokeWidth={3} />
                        </Button>
                    </div>
                </div>
            )}

            {/* Right Navigation Hot Zone (Hover Capture) */}
            {canScrollRight && (
                <div className={cn(
                    "absolute top-0 bottom-0 z-40 flex items-center justify-center",
                    "-right-6 sm:-right-12 w-6 sm:w-12 pointer-events-auto cursor-default"
                )}>
                    <div className="w-full h-full relative group/nav">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onScroll('right')}
                            className={cn(
                                "absolute -translate-y-1/2 left-0 right-0 mx-auto",
                                "w-8 rounded-lg shadow-xl transition-all duration-300",
                                "bg-card/80 backdrop-blur-xl opacity-0 scale-90",
                                "group-hover/nav:scale-105 group-hover/nav:opacity-100 border border-border/70 active:scale-95",
                                "flex items-center justify-center text-foreground",
                                heightClassName, topClassName, groupClass
                            )}
                            aria-label={t('ariaScrollRight')}
                        >
                            <ChevronRight size={20} className="text-foreground/70" strokeWidth={3} />
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}
