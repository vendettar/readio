import React from 'react';
import { cn } from '@/lib/utils';
import { getDiscoveryArtworkUrl } from '@/libs/imageUtils';
import { Button } from '../ui/button';
import { MoreHorizontal } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { InteractiveTitle } from '../interactive/InteractiveTitle';
import { InteractiveArtwork } from '../interactive/InteractiveArtwork';

export interface PodcastCardMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'destructive';
}

interface PodcastCardProps {
    id: string;
    title: string;
    subtitle?: string;
    artworkUrl: string;
    rank?: number;
    /** Optional click handler. If provided, used instead of Link */
    onClick?: () => void;
    /** Optional play action */
    onPlay?: (e: React.MouseEvent) => void;
    /** Optional menu items for the more button dropdown */
    menuItems?: PodcastCardMenuItem[];
    /** TanStack Router Link path. Defaults to /podcast/$id */
    to?: string;
    /** TanStack Router Link params */
    params?: Record<string, string>;
    /** Class name for the outer container */
    className?: string;
    /** Artwork size for iTunes URL formatting. Defaults to 400. */
    imageSize?: number;
    /** Whether the artwork should be rounded-full (as in TopChannelCard) */
    variant?: 'standard' | 'circular';
}

/**
 * A universal podcast card component used across Search, Subscriptions, and Explore.
 * Handles different data formats by providing a clean, consistent interface.
 */
export function PodcastCard({
    id,
    title,
    subtitle,
    artworkUrl,
    rank,
    onClick,
    onPlay,
    menuItems,
    to = '/podcast/$id',
    params = { id },
    className,
    imageSize = 400,
    variant = 'standard',
}: PodcastCardProps) {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    const containerClasses = cn(
        'group/card relative flex flex-col items-start text-left h-auto p-0 bg-transparent hover:bg-transparent shadow-none w-full',
        variant === 'circular' ? 'items-center text-center' : '',
        className
    );

    const overlayRadius = variant === 'circular' ? 'rounded-full' : 'rounded-lg';

    return (
        <div className={containerClasses}>
            <div className={cn(
                'relative aspect-square w-full',
                variant === 'circular' ? 'rounded-full' : 'rounded-lg'
            )}>
                <InteractiveArtwork
                    src={getDiscoveryArtworkUrl(artworkUrl, imageSize)}
                    to={onClick ? undefined : to}
                    params={onClick ? undefined : params}
                    onPlay={onPlay}
                    playPosition="bottom-left"
                    playButtonSize="sm"
                    playIconSize={16}
                    hoverGroup="card"
                    className={cn(
                        "w-full h-full shadow-md group-hover/card:shadow-lg transition-all",
                        variant === 'circular' ? "rounded-full" : "rounded-lg"
                    )}
                // We don't pass size here as we want it to fill the container aspect-ratio
                />

                {/* Rank Badge (Optional) */}
                {rank !== undefined && (
                    <div className={cn(
                        "absolute bottom-2 left-2 w-7 h-7 bg-background/80 text-foreground backdrop-blur-md rounded-lg flex items-center justify-center border border-border/50 group-hover/card:opacity-0 group-hover/card:invisible transition-all duration-300 pointer-events-none shadow-sm z-30",
                        variant === 'circular' && "hidden"
                    )}>
                        <span className="text-xs font-bold tabular-nums">{rank}</span>
                    </div>
                )}

                {/* More Menu (Special case since it's a dropdown) */}
                {menuItems && menuItems.length > 0 && (
                    <div className={cn(
                        "absolute bottom-3 right-3 transition-all duration-300 z-30",
                        (isMenuOpen || "opacity-0 group-hover/card:opacity-100 translate-y-2 group-hover/card:translate-y-0"),
                        isMenuOpen && "opacity-100 translate-y-0"
                    )}>
                        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="icon"
                                    className="w-8 h-8 rounded-full bg-background/90 text-foreground hover:bg-primary hover:text-primary-foreground shadow-xl backdrop-blur-sm border-0 transition-all ring-0 focus-visible:ring-0"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                >
                                    <MoreHorizontal className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                side="bottom"
                                align="start"
                                sideOffset={8}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="min-w-44 rounded-xl shadow-2xl overflow-hidden p-0 border border-border/50 bg-popover/95 backdrop-blur-xl"
                            >
                                {menuItems.map((item, index) => (
                                    <DropdownMenuItem
                                        key={index}
                                        onSelect={() => {
                                            item.onClick();
                                        }}
                                        className={cn(
                                            item.variant === 'destructive' && 'text-destructive focus:text-destructive focus:bg-destructive/10'
                                        )}
                                    >
                                        {item.icon && <span className="mr-2 opacity-80">{item.icon}</span>}
                                        <span className="font-medium">{item.label}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            <div className={cn("px-1 w-full", variant === 'circular' ? 'mt-3' : 'mt-3')}>
                <div className={cn("relative z-30", variant === 'circular' ? 'text-xs font-bold uppercase tracking-wider' : 'text-sm')}>
                    <InteractiveTitle
                        title={`${variant === 'circular' && rank !== undefined ? `${rank}. ` : ''}${title}`}
                        onClick={onClick}
                        to={to}
                        params={params}
                        className={cn(
                            "font-semibold",
                            variant === 'circular' ? 'text-xs font-bold uppercase tracking-wider' : 'text-sm'
                        )}
                        buttonClassName="block"
                        maxLines={1}
                    />
                </div>
                {subtitle && (
                    <p className={cn(
                        "text-muted-foreground/80 line-clamp-1 mt-1 font-normal",
                        variant === 'circular' ? 'hidden' : 'text-xs'
                    )}>
                        {subtitle}
                    </p>
                )}
            </div>

            {/* Hover Background Overlay - Visual Only */}
            <div className={cn(
                "absolute inset-0 z-0 opacity-0 group-hover/card:bg-foreground/5 transition-colors pointer-events-none",
                overlayRadius
            )} />
        </div>
    );
}
