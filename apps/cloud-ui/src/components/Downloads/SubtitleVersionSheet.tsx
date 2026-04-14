/**
 * SubtitleVersionSheet (Instruction 125b)
 *
 * Detail-layer component for managing subtitle versions on a downloaded episode.
 * Progressive disclosure: the list card shows summary only; this sheet handles
 * version switching, export, and deletion.
 */

import { CheckCircle2, Download, FileText, Languages, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { ConfirmAlertDialog } from '../../components/ui/confirm-alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet'
import { useConfirmDialog } from '../../hooks/useConfirmDialog'
import { formatDateStandard } from '../../lib/dateUtils'
import type { PodcastDownload } from '../../lib/db/types'
import { logError } from '../../lib/logger'
import {
  DownloadsRepository,
  type SubtitleVersionEntry,
} from '../../lib/repositories/DownloadsRepository'
import { toast } from '../../lib/toast'

interface SubtitleVersionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  track: PodcastDownload
  onVersionsChanged?: () => void
}

export function SubtitleVersionSheet({
  open,
  onOpenChange,
  track,
  onVersionsChanged,
}: SubtitleVersionSheetProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [versions, setVersions] = useState<SubtitleVersionEntry[]>([])
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | undefined>(
    track.activeSubtitleId
  )
  const [loading, setLoading] = useState(true)
  const { state: confirmState, openConfirm } = useConfirmDialog()

  const loadVersions = useCallback(async () => {
    try {
      const result = await DownloadsRepository.getSubtitleVersions(track.id)
      setVersions(result)

      // Refresh activeSubtitleId from the newest DB state (Instruction 20260228-R1)
      const dbTrack = await DownloadsRepository.getTrackSnapshot(track.id)
      setActiveSubtitleId(dbTrack?.activeSubtitleId)
    } catch (err) {
      logError('[SubtitleVersionSheet] Failed to load versions:', err)
    } finally {
      setLoading(false)
    }
  }, [track.id])

  useEffect(() => {
    if (open) {
      setLoading(true)
      void loadVersions()
    }
  }, [open, loadVersions])

  const handleSetActive = useCallback(
    async (versionId: string) => {
      const ok = await DownloadsRepository.setActiveSubtitle(track.id, versionId, true)
      if (ok) {
        void loadVersions()
        onVersionsChanged?.()
      }
    },
    [track.id, loadVersions, onVersionsChanged]
  )

  const handleDelete = useCallback(
    (versionId: string, _versionName: string) => {
      openConfirm({
        title: t('subtitleVersionDeleteConfirmTitle'),
        description: t('subtitleVersionDeleteConfirmDesc'),
        onConfirm: async () => {
          const ok = await DownloadsRepository.deleteSubtitleVersion(track.id, versionId)
          if (ok) {
            toast.successKey('toastDeleted')
            void loadVersions()
            onVersionsChanged?.()
          } else {
            toast.errorKey('toastDeleteFailed')
          }
        },
      })
    },
    [track.id, loadVersions, onVersionsChanged, openConfirm, t]
  )

  const episodeTitleForExport = track.sourceEpisodeTitle || track.name

  const handleExport = useCallback(
    async (versionId: string) => {
      const result = await DownloadsRepository.exportSubtitleVersion(
        track.id,
        versionId,
        episodeTitleForExport
      )
      if (result.ok && result.blob && result.filename) {
        triggerDownload(result.blob, result.filename)
      }
    },
    [track.id, episodeTitleForExport]
  )

  const handleExportAll = useCallback(async () => {
    const result = await DownloadsRepository.exportAllSubtitleVersions(
      track.id,
      episodeTitleForExport
    )
    if (result.ok && result.blob && result.filename) {
      triggerDownload(result.blob, result.filename)
      if (result.failedItems && result.failedItems.length > 0) {
        toast.errorKey('subtitleVersionExportFailed')
      }
    }
  }, [track.id, episodeTitleForExport])

  return (
    <>
      <ConfirmAlertDialog {...confirmState} />
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{t('subtitleVersionSheetTitle')}</SheetTitle>
            <SheetDescription>{track.sourceEpisodeTitle || track.name}</SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t('loading')}</div>
          ) : versions.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <FileText size={24} className="mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('subtitleVersionNone')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Export All button */}
              {versions.length > 1 && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleExportAll}>
                  <Download size={14} className="me-2" />
                  {t('subtitleVersionExportAll')}
                </Button>
              )}

              {/* Version list */}
              {versions.map((version) => {
                const isActive = activeSubtitleId === version.id

                return (
                  <div
                    key={version.id}
                    className={`rounded-lg border p-3 space-y-2 transition-colors ${
                      isActive
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border hover:border-border/80'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isActive && <CheckCircle2 size={14} className="text-primary shrink-0" />}
                        <span className="text-sm font-medium truncate">{version.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            version.status === 'failed'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          {version.status === 'failed'
                            ? t('subtitleVersionStatusFailed')
                            : t('subtitleVersionStatusReady')}
                        </span>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {version.sourceKind && (
                        <span className="flex items-center gap-1">
                          <Languages size={11} />
                          {version.sourceKind === 'manual_upload'
                            ? t('subtitleVersionSourceManual')
                            : version.sourceKind === 'built_in'
                              ? t('subtitleVersionSourceBuiltIn')
                              : t('subtitleVersionSourceAsr')}
                        </span>
                      )}
                      {version.provider && (
                        <span>
                          {t('subtitleVersionProvider')}: {version.provider}
                        </span>
                      )}
                      {version.model && (
                        <span>
                          {t('subtitleVersionModel')}: {version.model}
                        </span>
                      )}
                      {version.language && (
                        <span>
                          {t('subtitleVersionLanguage')}: {version.language}
                        </span>
                      )}
                      {version.createdAt && (
                        <span>{formatDateStandard(version.createdAt, language)}</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {!isActive && version.status !== 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleSetActive(version.id)}
                        >
                          {t('subtitleVersionSetActive')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleExport(version.id)}
                      >
                        <Download size={12} className="me-1" />
                        {t('subtitleVersionExport')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleDelete(version.id, version.name)}
                      >
                        <Trash2 size={12} className="me-1" />
                        {t('subtitleVersionDelete')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // Cleanup deferred to avoid flash-of-blank on Safari
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 1000)
}
