/**
 * Toast notifications.
 *
 * Small enough not to warrant a dependency, and keeping it local means the
 * toasts inherit the app's type scale and colours rather than shipping a second
 * design system.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { cn } from '@/utils/cn'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  description?: string
}

interface ToastContextValue {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'> & { durationMs?: number }) => string
  dismiss: (id: string) => void
  success: (title: string, description?: string) => string
  error: (title: string, description?: string) => string
  info: (title: string, description?: string) => string
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 3500,
  warning: 5000,
  // Errors stay longer: they usually carry something you need to read.
  error: 7000,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback<ToastContextValue['push']>(
    ({ durationMs, ...toast }) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`

      // Cap the stack so a loop of failures cannot bury the page.
      setToasts((current) => [...current.slice(-4), { ...toast, id }])

      const timeout = setTimeout(() => dismiss(id), durationMs ?? DEFAULT_DURATION[toast.kind])
      timers.current.set(id, timeout)
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ kind: 'success', title, description }),
      error: (title, description) => push({ kind: 'error', title, description }),
      info: (title, description) => push({ kind: 'info', title, description }),
    }),
    [toasts, push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const

const TONE = {
  success: 'border-emerald-500/30 text-emerald-300',
  error: 'border-red-500/30 text-red-300',
  warning: 'border-amber-500/30 text-amber-300',
  info: 'border-brand-500/30 text-brand-300',
} as const

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind]
        return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border bg-ink-850/95 p-3.5 shadow-card backdrop-blur',
              TONE[toast.kind],
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-100">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 break-words text-xs leading-relaxed text-ink-300">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="-m-1 shrink-0 rounded-md p-1 text-ink-400 transition hover:bg-ink-750 hover:text-ink-100"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
