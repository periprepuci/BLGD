import { cn } from '@/utils/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  title?: string
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Tab-style switch for a small set of mutually exclusive options (leaderboard
 * metric, sort key). Implemented as a radio group so arrow keys work and screen
 * readers announce the selected option.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-ink-750 bg-ink-900/80 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'shrink-0 rounded-lg font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[0.8125rem]',
              selected
                ? 'bg-brand-500 text-white shadow-[0_4px_14px_-8px_rgba(255,92,10,.9)]'
                : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
