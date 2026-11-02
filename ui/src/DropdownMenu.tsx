/**
 * A small dropdown menu with the call-site shape of the dashboard's
 * `components/ui/dropdown-menu` (a Radix wrapper that is not part of the App
 * SDK): `DropdownMenu`, `DropdownMenuTrigger asChild`, `DropdownMenuContent
 * align`, `DropdownMenuItem onSelect`. The class strings are the dashboard's.
 *
 * The content renders into `document.body` at a fixed point under the trigger,
 * so no scrolling or clipped ancestor can hide it. It closes on Escape (focus
 * returns to the trigger), on a press outside it, on a scroll, on a resize, and
 * after an item runs. The first item takes focus when it opens, and the arrow
 * keys move between items.
 */

import {
  cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo,
  useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

interface MenuState {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: { current: HTMLElement | null }
}

const MenuContext = createContext<MenuState | null>(null)

function useMenu(): MenuState {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('DropdownMenu parts must sit inside <DropdownMenu>')
  return ctx
}

export function DropdownMenu({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const value = useMemo(() => ({ open, setOpen, triggerRef }), [open])
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

type TriggerChildProps = {
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void
  ref?: unknown
  'aria-haspopup'?: string
  'aria-expanded'?: boolean
}

export function DropdownMenuTrigger({ children }: { asChild?: boolean; children: ReactElement }) {
  const { open, setOpen, triggerRef } = useMenu()
  if (!isValidElement<TriggerChildProps>(children)) return children
  const { onPointerDown, onKeyDown } = children.props
  // Opens on the press, like the Radix trigger it stands in for: a primary
  // button with no Ctrl (macOS's secondary click), or Enter, Space or ArrowDown.
  return cloneElement(children, {
    ref: (el: HTMLElement | null) => { triggerRef.current = el },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      onPointerDown?.(e)
      if (e.button !== 0 || e.ctrlKey) return
      e.preventDefault()
      setOpen(!open)
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      onKeyDown?.(e)
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown') return
      e.preventDefault()
      setOpen(true)
    },
  })
}

export function DropdownMenuContent({
  align = 'start',
  className = '',
  onClick,
  children,
}: {
  align?: 'start' | 'end'
  className?: string
  onClick?: (e: ReactMouseEvent<HTMLDivElement>) => void
  children?: ReactNode
}) {
  const { open, setOpen, triggerRef } = useMenu()
  const ref = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState<{ top: number; left?: number; right?: number } | null>(null)

  useEffect(() => {
    if (!open) { setAt(null); return }
    const rect = triggerRef.current?.getBoundingClientRect()
    const top = (rect?.bottom ?? 0) + 4
    setAt(align === 'end'
      ? { top, right: Math.max(0, window.innerWidth - (rect?.right ?? 0)) }
      : { top, left: rect?.left ?? 0 })
  }, [open, align, triggerRef])

  useEffect(() => {
    if (!open || !at) return
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    items()[0]?.focus({ preventScroll: true })
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (ref.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const list = items()
      if (list.length === 0) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length
      list[next].focus()
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open, at, setOpen, triggerRef])

  if (!open || !at) return null
  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-state="open"
      onClick={onClick}
      style={{ position: 'fixed', ...at }}
      className={
        'z-[9999] min-w-[8rem] overflow-y-auto overscroll-contain rounded-lg border border-border bg-bg-elevated p-1 text-text shadow-lg '
        + className
      }
    >
      {children}
    </div>,
    document.body,
  )
}

export function DropdownMenuItem({
  onSelect,
  className = '',
  children,
}: {
  onSelect?: () => void
  className?: string
  children?: ReactNode
}) {
  const { setOpen } = useMenu()
  const run = useCallback(() => {
    setOpen(false)
    onSelect?.()
  }, [setOpen, onSelect])
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      onClick={run}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run() }
      }}
      className={
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-1.5 text-[13px] outline-hidden transition-colors '
        + 'focus:bg-bg-hover ' + className
      }
    >
      {children}
    </div>
  )
}
