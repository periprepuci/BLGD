import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { cn } from '@/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-lg font-semibold ' +
  'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ' +
  'whitespace-nowrap select-none'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-400 shadow-[0_6px_20px_-10px_rgba(255,92,10,.9)]',
  secondary: 'bg-ink-750 text-ink-100 hover:bg-ink-700 border border-ink-700',
  outline: 'border border-ink-700 text-ink-200 hover:border-brand-500/60 hover:text-ink-100',
  ghost: 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
  danger: 'bg-red-600/90 text-white hover:bg-red-600',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[0.9375rem]',
  // 40px square: comfortably above the 24px minimum target size, and the same
  // height as `md` so icon and text buttons line up in a row.
  icon: 'h-10 w-10 p-0',
}

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  children?: ReactNode
  className?: string
}

export type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
})

export type ButtonLinkProps = CommonProps & Omit<LinkProps, 'children' | 'className'>

/** Same visual treatment, but renders a router link. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {children}
    </Link>
  )
}
