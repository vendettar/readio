// src/components/AppShell/Sidebar.tsx
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Clock,
  Disc,
  FolderOpen,
  LayoutGrid,
  Moon,
  Settings,
  Star,
  Sun,
  WifiOff,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { cn } from '../../lib/utils'
import { useThemeStore } from '../../store/themeStore'
import { CommandPalette } from '../GlobalSearch'
import { Button } from '../ui/button'
import { Logo } from '../ui/Logo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

interface SidebarProps {
  className?: string
}

interface SidebarItemProps {
  to: string
  icon: React.ElementType
  label: string
  isActive: boolean
}

function SidebarItem({ to, icon: Icon, label, isActive }: SidebarItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer',
        isActive
          ? 'bg-primary/10 text-primary font-bold'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      <Icon
        size={20}
        strokeWidth={isActive ? 2.5 : 2}
        className={isActive ? 'text-primary' : 'text-muted-foreground'}
      />
      {label}
    </Link>
  )
}

export function Sidebar({ className = '' }: SidebarProps) {
  const { t } = useTranslation()
  const router = useRouterState()
  const currentPath = router.location.pathname
  const { isOnline } = useNetworkStatus()

  return (
    <aside
      className={cn(
        'w-sidebar h-screen bg-background/80 backdrop-blur-xl backdrop-saturate-150 border-e border-border/50 flex flex-col flex-shrink-0 relative z-sidebar',
        className
      )}
    >
      {/* App Header */}
      <div className="px-6 py-8 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary p-1.5 rounded-lg flex items-center justify-center">
              <Logo size={20} />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground/90 text-start">
              Readio
            </span>
          </div>

          {!isOnline && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-muted-foreground/60 hover:text-destructive transition-colors cursor-help bg-destructive/5 p-1.5 rounded-lg border border-destructive/10">
                    <WifiOff size={16} strokeWidth={2.5} />
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="max-w-48 text-xs font-medium bg-destructive/95 text-destructive-foreground border-destructive/20 backdrop-blur-md"
                >
                  {t('offline.badge')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Global Search */}
      <CommandPalette />

      <nav className="flex-1 px-4 space-y-8 overflow-y-auto">
        {/* Section: Discover */}
        <div className="space-y-1">
          <div className="px-3 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest text-start">
            {t('sidebarDiscover')}
          </div>
          <SidebarItem
            to="/explore"
            icon={Disc}
            label={t('navExplore')}
            isActive={currentPath === '/explore'}
          />
        </div>

        {/* Section: Library */}
        <div className="space-y-1">
          <div className="px-3 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest text-start">
            {t('sidebarLibrary')}
          </div>
          <SidebarItem
            to="/subscriptions"
            icon={LayoutGrid}
            label={t('sidebarSubscriptions')}
            isActive={currentPath === '/subscriptions'}
          />
          <SidebarItem
            to="/favorites"
            icon={Star}
            label={t('sidebarFavorites')}
            isActive={currentPath === '/favorites'}
          />
          <SidebarItem
            to="/history"
            icon={Clock}
            label={t('sidebarHistory')}
            isActive={currentPath === '/history'}
          />
          <SidebarItem
            to="/files"
            icon={FolderOpen}
            label={t('navFiles')}
            isActive={currentPath.startsWith('/files')}
          />
        </div>
      </nav>

      {/* Bottom: Settings row with theme toggle */}
      <div className="mt-auto border-t border-border px-4 py-4">
        <div className="flex items-center gap-4">
          <Link
            to="/settings"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer flex-1',
              currentPath === '/settings'
                ? 'bg-primary/10 text-primary font-bold'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
          >
            <Settings
              size={20}
              strokeWidth={currentPath === '/settings' ? 2.5 : 2}
              className={currentPath === '/settings' ? 'text-primary' : 'text-muted-foreground'}
            />
            {t('sidebarSettings')}
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}

// Theme Toggle Component - Icon only, state-aware
function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore()
  const { t } = useTranslation()
  const isDark = theme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      onClick={toggleTheme}
      className="h-10 w-10 flex-shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
      aria-label={isDark ? t('themeToggleLight') : t('themeToggleDark')}
    >
      {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
    </Button>
  )
}
