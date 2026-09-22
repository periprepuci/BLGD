import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/utils/cn'

const CONTROL =
  'w-full rounded-lg border bg-ink-850 px-3 text-sm text-ink-100 placeholder:text-ink-500 ' +
  'transition-colors focus:border-brand-500/70 disabled:cursor-not-allowed disabled:opacity-60'

interface FieldShellProps {
  label?: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  htmlFor: string
  children: ReactNode
  className?: string
}

function FieldShell({ label, hint, error, required, htmlFor, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-300">
          {label}
          {required && <span className="ml-1 text-brand-400">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-red-400">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="text-xs text-ink-400">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label?: string
  hint?: ReactNode
  error?: string | null
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
  containerClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, trailing, className, containerClassName, id, required, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={containerClassName}
    >
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            CONTROL,
            'h-10',
            error ? 'border-red-500/60' : 'border-ink-700',
            leading && 'pl-9',
            trailing && 'pr-10',
            className,
          )}
          {...rest}
        />
        {trailing && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400">{trailing}</span>
        )}
      </div>
    </FieldShell>
  )
})

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label?: string
  hint?: ReactNode
  error?: string | null
  className?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, required, rows = 3, ...rest },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={fieldId}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          CONTROL,
          'resize-y py-2 leading-relaxed',
          error ? 'border-red-500/60' : 'border-ink-700',
          className,
        )}
        {...rest}
      />
    </FieldShell>
  )
})

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label?: string
  hint?: ReactNode
  error?: string | null
  className?: string
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, required, children, ...rest },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId

  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={fieldId}>
      <select
        ref={ref}
        id={fieldId}
        required={required}
        className={cn(
          CONTROL,
          'h-10 cursor-pointer appearance-none pr-8',
          error ? 'border-red-500/60' : 'border-ink-700',
          className,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none' stroke='%236b7488' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.7rem center',
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
})
