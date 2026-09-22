import { cn } from '@/utils/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />
}

/** Matches the geometry of `LevelCard` so nothing shifts when data lands. */
export function LevelCardSkeleton() {
  return (
    <div className="panel overflow-hidden" aria-hidden="true">
      <div className="flex flex-col sm:flex-row">
        <Skeleton className="aspect-video w-full rounded-none sm:aspect-auto sm:h-[9.5rem] sm:w-64 lg:w-80" />
        <div className="flex-1 space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-4 w-28" />
          <div className="flex gap-6 pt-1">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function LevelCardSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading levels">
      {Array.from({ length: count }, (_, index) => (
        <LevelCardSkeleton key={index} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="panel p-6 sm:p-8" aria-hidden="true">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <Skeleton className="h-24 w-24 rounded-2xl" />
        <div className="w-full flex-1 space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RowSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-16 rounded-xl" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
