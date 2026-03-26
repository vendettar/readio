interface FilesLoadingSkeletonsProps {
  isRoot: boolean
}

const FOLDER_SKELETON_KEYS = [
  'folder-skeleton-1',
  'folder-skeleton-2',
  'folder-skeleton-3',
  'folder-skeleton-4',
  'folder-skeleton-5',
] as const

const TRACK_SKELETON_KEYS = [
  'track-skeleton-1',
  'track-skeleton-2',
  'track-skeleton-3',
  'track-skeleton-4',
] as const

export function FilesLoadingSkeletons({ isRoot }: FilesLoadingSkeletonsProps) {
  return (
    <>
      {isRoot && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {FOLDER_SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="rounded-xl border border-border bg-card/60 animate-pulse p-4 h-32"
            />
          ))}
        </div>
      )}

      <div className="space-y-3">
        {TRACK_SKELETON_KEYS.map((key) => (
          <div
            key={key}
            className="rounded-xl border border-border bg-card/60 animate-pulse h-24"
          />
        ))}
      </div>
    </>
  )
}
