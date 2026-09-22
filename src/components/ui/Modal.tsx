import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '@/utils/cn'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Set false while a submit is in flight so a stray Escape cannot cancel it. */
  dismissible?: boolean
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
} as const

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal: focus moves in on open, is trapped while open, and returns
 * to the trigger on close. Escape and backdrop clicks dismiss unless the caller
 * turns that off.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    if (dismissible) onClose()
  }, [dismissible, onClose])

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    // Stop the page behind from scrolling, and compensate for the scrollbar so
    // the layout does not jump sideways.
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    const focusTimer = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panelRef.current)?.focus()
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const focusables = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      )
      if (focusables.length === 0) return

      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown, true)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
      previouslyFocused.current?.focus?.()
    }
  }, [open, close])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6"
      role="presentation"
    >
      <div
        className="fixed inset-0 animate-fade-in bg-ink-950/80 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? 'modal-description' : undefined}
        tabIndex={-1}
        className={cn(
          'panel relative z-10 my-auto flex max-h-[92vh] w-full animate-scale-in flex-col',
          'rounded-b-none sm:rounded-b-2xl',
          SIZES[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-750/80 p-5">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-lg">
              {title}
            </h2>
            {description && (
              <p id="modal-description" className="mt-1 text-sm text-ink-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={!dismissible}
            aria-label="Close dialog"
            className="-m-1 shrink-0 rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <footer className="safe-bottom flex flex-col-reverse gap-2 border-t border-ink-750/80 p-5 sm:flex-row sm:justify-end">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
