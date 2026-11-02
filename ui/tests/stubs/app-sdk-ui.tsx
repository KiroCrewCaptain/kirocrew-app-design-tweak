/**
 * A light stand-in for the host's `@kirocrew/app-sdk/ui`: plain elements with
 * the roles and labels the host components render, so a test can find them the
 * way a user would.
 */

import { forwardRef, type HTMLAttributes, type KeyboardEvent, type MouseEvent } from 'react'

type ClickableProps = Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'onClick'> & {
  onClick: (e?: MouseEvent | KeyboardEvent) => void
  disabled?: boolean
}

export const Clickable = forwardRef<HTMLDivElement, ClickableProps>(function Clickable(
  { onClick, disabled, children, onKeyDown, tabIndex, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={disabled ? -1 : (tabIndex ?? 0)}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : (e) => onClick(e)}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(e)
        }
      }}
      {...props}
    >
      {children}
    </div>
  )
})

export function ErrorNotice({ message, title, onDismiss, dismissLabel }: {
  message?: string | null
  title?: string
  variant?: 'block' | 'inline'
  messagePlacement?: 'beside' | 'below'
  onDismiss?: () => void
  dismissLabel?: string
  className?: string
  askAgent?: boolean
}) {
  if (!message && !title) return null
  return (
    <div role="alert">
      {title ? <strong>{title}</strong> : null}
      {message ? <span>{message}</span> : null}
      {onDismiss ? <button type="button" onClick={onDismiss}>{dismissLabel || 'Dismiss'}</button> : null}
    </div>
  )
}
