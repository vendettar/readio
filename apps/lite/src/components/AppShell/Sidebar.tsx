// src/components/AppShell/Sidebar.tsx
import { Link, useRouterState } from '@tanstack/react-router'
import { Clock, Disc, FolderOpen, LayoutGrid, Moon, Radio, Settings, Star, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '../../store/themeStore'
import { GlobalSearchInput, SearchOverlay } from '../GlobalSearch'
import { Button } from '../ui/button'

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
      className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
                ${
                  isActive
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }
            `}
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

  return (
    <aside
      className={`w-sidebar h-screen bg-card border-r border-border flex flex-col flex-shrink-0 ${className}`}
    >
      {/* App Header */}
      <div className="px-6 py-8 pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary p-1.5 rounded-lg">
            <Radio size={20} />
          </div>
          <span className="font-bold text-xl tracking-tight text-foreground/90">Readio</span>
        </div>
      </div>

      {/* Global Search */}
      <div className="relative">
        <GlobalSearchInput />
        <SearchOverlay />
      </div>

      <nav className="flex-1 px-4 space-y-8 overflow-y-auto">
        {/* Section: Discover */}
        <div className="space-y-1">
          <div className="px-3 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
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
          <div className="px-3 mb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
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
            className={`
                            flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer flex-1
                            ${
                              currentPath === '/settings'
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                            }
                        `}
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
      className={`
                h-10 w-10 flex-shrink-0 rounded-lg transition-all duration-200
                ${
                  isDark
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                }
            `}
      aria-label={isDark ? t('themeToggleLight') : t('themeToggleDark')}
    >
      {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
    </Button>
  )
}
