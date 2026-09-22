import { useId } from 'react'

import { cn } from '@/utils/cn'
import { formatRating } from '@/utils/format'
import { RATING_MAX, RATING_MIN, RATING_STEP } from '@/utils/validation'

export interface RatingSliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  /** Short description of what the two ends mean. Kept subtle by design. */
  hint?: string
  disabled?: boolean
  /** Colour of the filled track. Defaults to the brand accent. */
  tone?: 'brand' | 'sky'
  className?: string
}

const TONE = {
  brand: { fill: 'bg-brand-500', text: 'text-brand-400' },
  sky: { fill: 'bg-sky-500', text: 'text-sky-400' },
} as const

/**
 * The rating control for enjoyment and difficulty.
 *
 * Range input plus a numeric readout and +/- buttons: the slider is fast on a
 * phone, the buttons make an exact 8.5 reachable without fighting a 4px target,
 * and the readout means you always know what you picked. Scale is 0-10 in steps
 * of 0.5 - see README, "Rating scale".
 */
export function RatingSlider({
  label,
  value,
  onChange,
  hint,
  disabled,
  tone = 'brand',
  className,
}: RatingSliderProps) {
  const id = useId()
  const percent = ((value - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100
  const colours = TONE[tone]

  const step = (delta: number) => {
    const next = Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round((value + delta) * 2) / 2))
    onChange(next)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-semibold text-ink-300">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-sm tabular-nums text-ink-100">
          <span className={cn('text-lg font-bold', colours.text)}>{formatRating(value)}</span>
          <span className="text-ink-500"> / 10</span>
        </output>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => step(-RATING_STEP)}
          disabled={disabled || value <= RATING_MIN}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="h-8 w-8 shrink-0 rounded-md border border-ink-700 text-ink-300 transition hover:border-ink-600 hover:text-ink-100 disabled:opacity-40"
        >
          −
        </button>

        <div className="relative flex-1">
          {/* Track, then fill, then the native input on top. The input keeps
              every bit of its keyboard and pointer behaviour; only its own
              track is made transparent, because a cross-browser filled track
              is not reachable from CSS alone. */}
          <div
            className="pointer-events-none absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-ink-700"
            aria-hidden="true"
          />
          <div
            className={cn(
              'pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-[width] duration-75',
              colours.fill,
            )}
            style={{ width: `${percent}%` }}
            aria-hidden="true"
          />
          <input
            id={id}
            type="range"
            min={RATING_MIN}
            max={RATING_MAX}
            step={RATING_STEP}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-valuetext={`${formatRating(value)} out of 10`}
            className="relative block"
            style={{ background: 'transparent' }}
          />
        </div>

        <button
          type="button"
          onClick={() => step(RATING_STEP)}
          disabled={disabled || value >= RATING_MAX}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="h-8 w-8 shrink-0 rounded-md border border-ink-700 text-ink-300 transition hover:border-ink-600 hover:text-ink-100 disabled:opacity-40"
        >
          +
        </button>
      </div>

      {hint && <p className="text-[0.6875rem] text-ink-500">{hint}</p>}
    </div>
  )
}
