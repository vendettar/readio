import { Link, useLocation, useRouterState } from '@tanstack/react-router'
import {
  Clock,
  Disc,
  Download,
  FolderOpen,
  LayoutGrid,
  Moon,
  Settings,
  Star,
  Sun,
  WifiOff,
  X,
} from 'lucide-react'
import type { ElementType } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { cn } from '../../lib/utils'
import { usePlayerSurfaceStore } from '../../store/playerSurfaceStore'
import { useThemeStore } from '../../store/themeStore'
import { CommandPalette } from '../GlobalSearch'
import { Button } from '../ui/button'
import { ComponentErrorBoundary } from '../ui/error-boundary'
import { Logo } from '../ui/Logo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

interface SidebarProps {
  className?: string
  open?: boolean
  onClose?: () => void
  onNavigate?: () => void
}

interface SidebarItemProps {
  to: string
  icon: ElementType
  label: string
  isActive: boolean
}

function SidebarItem({
  to,
  icon: Icon,
  label,
  isActive,
  onNavigate,
}: SidebarItemProps & { onNavigate?: () => void }) {
  const toMini = usePlayerSurfaceStore((s) => s.toMini)

  return (
    <Link
      to={to}
      onClick={() => {
        toMini()
        onNavigate?.()
      }}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer',
        isActive
          ? 'bg-primary/10 text-primary font-bold shadow-sm'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <Icon
        size={20}
        strokeWidth={isActive ? 2.5 : 2}
        className={cn('transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')}
      />
      {label}
    </Link>
  )
}

function SidebarInner({ className = '', open = true, onClose, onNavigate }: SidebarProps) {
  const { t } = useTranslation()
  const router = useRouterState()
  const location = useLocation()
  const currentPath = router.location.pathname
  const { isOnline } = useNetworkStatus()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open && closeRef.current) {
      closeRef.current.focus()
    }
  }, [open])

  const routeKey = `${location.pathname}${location.search}`
  const prevRouteKeyRef = useRef(routeKey)

  useEffect(() => {
    if (prevRouteKeyRef.current !== routeKey && open) {
      onClose?.()
    }
    prevRouteKeyRef.current = routeKey
  }, [routeKey, open, onClose])

  return (
    <aside
      className={cn(
        'hidden md:flex md:w-sidebar md:flex-shrink-0 w-sidebar h-screen bg-background border-e border-border flex-col',
        open ? 'md:hidden fixed inset-y-0 start-0 z-modal w-64 flex' : 'relative z-sidebar',
        className
      )}
      aria-label={t('sidebarAriaLabel', 'Sidebar navigation')}
    >
      {open && (
        <Button
          ref={closeRef}
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          className="md:hidden absolute top-4 end-4 h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={t('sidebarClose', 'Close sidebar')}
        >
          <X size={18} />
        </Button>
      )}

      {/* App Header */}
      <div className="px-6 pt-8 pb-3">
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

      <nav
        className="flex-1 px-4 pt-4 space-y-8 overflow-y-auto custom-scrollbar"
        aria-label={t('ariaMainNavigation')}
      >
        {/* Discover Section */}
        <div className="space-y-1">
          <h2 className="px-3 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
            {t('sidebarDiscover')}
          </h2>
          <SidebarItem
            to="/explore"
            icon={Disc}
            label={t('sidebarExplore')}
            isActive={currentPath.startsWith('/explore')}
            onNavigate={onNavigate}
          />
        </div>

        {/* Library Section */}
        <div className="space-y-1">
          <h2 className="px-3 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
            {t('sidebarLibrary')}
          </h2>
          {[
            { to: '/subscriptions', icon: LayoutGrid, label: t('sidebarSubscriptions') },
            { to: '/favorites', icon: Star, label: t('sidebarFavorites') },
            { to: '/history', icon: Clock, label: t('sidebarHistory') },
            { to: '/downloads', icon: Download, label: t('sidebarDownloads') },
            { to: '/files', icon: FolderOpen, label: t('navFiles') },
          ].map((item) => (
            <SidebarItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              isActive={currentPath.startsWith(item.to)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      {/* Bottom Actions */}
      <div className="h-mini-player px-3 border-t border-border/50 flex items-center">
        <div className="flex items-center gap-2 flex-1">
          <Link
            to="/settings"
            onClick={() => {
              usePlayerSurfaceStore.getState().toMini()
              onNavigate?.()
            }}
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

export function Sidebar(props: SidebarProps) {
  return (
    <ComponentErrorBoundary componentName="Sidebar" className="h-full">
      <SidebarInner {...props} />
    </ComponentErrorBoundary>
  )
}

// Theme Toggle Component - Icon only, state-aware
function ThemeToggle() {
  // Use atomic selectors to avoid subscribing to entire store
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
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
